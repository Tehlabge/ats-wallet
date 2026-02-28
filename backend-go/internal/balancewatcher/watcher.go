package balancewatcher

import (
	"context"
	"log"
	"math/big"
	"strconv"
	"strings"
	"sync"
	"time"

	"ats-wallet/internal/models"
	"ats-wallet/internal/notify"
	"ats-wallet/internal/trongrid"

	"gorm.io/gorm"
)

type Watcher struct {
	DB       *gorm.DB
	TronGrid *trongrid.Client
	Notifier *notify.Notifier
	Interval time.Duration
	stopCh   chan struct{}
	wg       sync.WaitGroup
	mu       sync.Mutex
	running  bool
}

func NewWatcher(db *gorm.DB, tronGrid *trongrid.Client, notifier *notify.Notifier, interval time.Duration) *Watcher {
	if interval < time.Minute {
		interval = 5 * time.Minute
	}
	return &Watcher{
		DB:       db,
		TronGrid: tronGrid,
		Notifier: notifier,
		Interval: interval,
		stopCh:   make(chan struct{}),
	}
}

func (w *Watcher) Start() {
	w.mu.Lock()
	if w.running {
		w.mu.Unlock()
		return
	}
	w.running = true
	w.mu.Unlock()

	w.wg.Add(1)
	go w.loop()
	log.Printf("[BalanceWatcher] Started with interval %v", w.Interval)
}

func (w *Watcher) Stop() {
	w.mu.Lock()
	if !w.running {
		w.mu.Unlock()
		return
	}
	w.running = false
	w.mu.Unlock()
	close(w.stopCh)
	w.wg.Wait()
	log.Println("[BalanceWatcher] Stopped")
}

func (w *Watcher) loop() {
	defer w.wg.Done()

	ticker := time.NewTicker(w.Interval)
	defer ticker.Stop()

	// Первая проверка сразу
	w.checkMasterWallet()

	for {
		select {
		case <-w.stopCh:
			return
		case <-ticker.C:
			w.checkMasterWallet()
		}
	}
}

// getMasterWalletAddress получает адрес мастер-кошелька из настроек
func (w *Watcher) getMasterWalletAddress() string {
	var setting models.AppSetting
	if err := w.DB.Where("k = ?", "master_deposit_wallet").First(&setting).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(setting.V)
}

// getLastCheckedTimestamp получает timestamp последней проверки
func (w *Watcher) getLastCheckedTimestamp() int64 {
	var setting models.AppSetting
	if err := w.DB.Where("k = ?", "master_wallet_last_checked").First(&setting).Error; err != nil {
		// Если нет записи - проверяем за последние 24 часа
		return time.Now().Add(-24 * time.Hour).UnixMilli()
	}
	ts, _ := strconv.ParseInt(setting.V, 10, 64)
	if ts <= 0 {
		return time.Now().Add(-24 * time.Hour).UnixMilli()
	}
	// Возвращаем с буфером в 5 минут на всякий случай
	return ts - 5*60*1000
}

// setLastCheckedTimestamp сохраняет timestamp последней проверки
func (w *Watcher) setLastCheckedTimestamp(ts int64) {
	w.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
		"master_wallet_last_checked", strconv.FormatInt(ts, 10))
}

func (w *Watcher) checkMasterWallet() {
	log.Println("[BalanceWatcher] Starting master wallet check...")

	if w.TronGrid == nil {
		log.Println("[BalanceWatcher] TronGrid client not configured, skipping")
		return
	}

	masterAddr := w.getMasterWalletAddress()
	if masterAddr == "" {
		log.Println("[BalanceWatcher] Master deposit wallet not configured in admin settings")
		return
	}

	cleanAddr := trongrid.CleanTronAddress(masterAddr)
	if !trongrid.IsValidTronAddress(cleanAddr) {
		log.Printf("[BalanceWatcher] Invalid master wallet address: %s", masterAddr)
		return
	}

	minTimestamp := w.getLastCheckedTimestamp()
	log.Printf("[BalanceWatcher] Checking wallet %s for transfers since %v", cleanAddr, time.UnixMilli(minTimestamp))

	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Minute)
	defer cancel()

	transfers, err := w.TronGrid.GetTRC20Transfers(ctx, cleanAddr, minTimestamp)
	if err != nil {
		log.Printf("[BalanceWatcher] Failed to get transfers: %v", err)
		return
	}

	if len(transfers) == 0 {
		log.Println("[BalanceWatcher] No new transfers found")
		w.setLastCheckedTimestamp(time.Now().UnixMilli())
		return
	}

	log.Printf("[BalanceWatcher] Found %d transfers to process", len(transfers))

	for _, tx := range transfers {
		w.processTransfer(tx)
	}

	w.setLastCheckedTimestamp(time.Now().UnixMilli())
}

// processTransfer обрабатывает входящий перевод
// Идентифицирует пользователя по дробной части суммы (например 123.299100 -> digitalId = 299100)
func (w *Watcher) processTransfer(tx trongrid.TRC20Transfer) {
	// Проверяем, не обработали ли уже (в зачисленных)
	refID := "trc20_deposit:" + tx.TransactionID
	var existingTx models.Transaction
	if err := w.DB.Where("refId = ?", refID).First(&existingTx).Error; err == nil {
		return
	}

	// Проверяем, не сохранён ли уже как неидентифицированный
	var existingUnidentified models.UnidentifiedDeposit
	if err := w.DB.Where("txId = ?", tx.TransactionID).First(&existingUnidentified).Error; err == nil {
		return
	}

	// Конвертируем значение (USDT имеет 6 decimals)
	valueBig, ok := new(big.Int).SetString(tx.Value, 10)
	if !ok {
		log.Printf("[BalanceWatcher] Invalid transfer value: %s", tx.Value)
		return
	}

	// Получаем полную сумму с высокой точностью
	valueFloat := new(big.Float).SetInt(valueBig)
	valueFloat.Quo(valueFloat, big.NewFloat(1e6))
	amountUsdt, _ := valueFloat.Float64()

	if amountUsdt <= 0 {
		return
	}

	// Извлекаем digitalId из дробной части
	// Например: 123.2991001 -> 2991001
	digitalId := extractDigitalIdFromAmount(amountUsdt)
	if digitalId == "" {
		log.Printf("[BalanceWatcher] Could not extract digitalId from amount %.8f (txid: %s)", amountUsdt, tx.TransactionID)
		// Сохраняем как необработанный депозит для ручной обработки
		w.saveUnidentifiedDeposit(tx.TransactionID, amountUsdt, tx.From)
		return
	}

	// Ищем пользователя по digitalId
	var user models.User
	if err := w.DB.Where("digitalId = ?", digitalId).First(&user).Error; err != nil {
		log.Printf("[BalanceWatcher] User not found for digitalId %s (amount: %.8f, txid: %s)", digitalId, amountUsdt, tx.TransactionID)
		w.saveUnidentifiedDeposit(tx.TransactionID, amountUsdt, tx.From)
		return
	}

	log.Printf("[BalanceWatcher] Identified deposit: digitalId=%s userId=%s amount=%.6f USDT txid=%s",
		digitalId, user.ID, amountUsdt, tx.TransactionID)

	w.creditUserBalance(user.ID, amountUsdt, tx.TransactionID)
}

// extractDigitalIdFromAmount извлекает digitalId из дробной части суммы
// TronGrid возвращает 6 знаков после запятой, берём первые 4 (последние 2 игнорируем)
// Например: 50.123400 -> "1234", 10.567800 -> "5678"
func extractDigitalIdFromAmount(amount float64) string {
	// Форматируем с 6 знаками после запятой (как в TronGrid)
	amountStr := strconv.FormatFloat(amount, 'f', 6, 64)

	// Разделяем на целую и дробную части
	parts := strings.Split(amountStr, ".")
	if len(parts) != 2 {
		return ""
	}

	fractional := parts[1]

	// Дробная часть должна быть минимум 4 символа
	if len(fractional) < 4 {
		return ""
	}

	// Берём первые 4 символа как digitalId (игнорируем последние 2)
	digitalId := fractional[:4]

	// Проверяем что это действительно 4 цифры
	if len(digitalId) != 4 {
		return ""
	}

	// Проверяем что ID >= 1000 (не начинается с 0)
	if digitalId[0] == '0' {
		return ""
	}

	for _, c := range digitalId {
		if c < '0' || c > '9' {
			return ""
		}
	}

	return digitalId
}

// saveUnidentifiedDeposit сохраняет депозит который не удалось идентифицировать
func (w *Watcher) saveUnidentifiedDeposit(txID string, amount float64, fromAddr string) {
	deposit := models.UnidentifiedDeposit{
		TxID:      txID,
		Amount:    strconv.FormatFloat(amount, 'f', 8, 64),
		FromAddr:  fromAddr,
		Status:    "pending",
		CreatedAt: time.Now(),
	}
	if err := w.DB.Create(&deposit).Error; err != nil {
		log.Printf("[BalanceWatcher] Failed to save unidentified deposit: %v", err)
	}
}

func (w *Watcher) creditUserBalance(userID string, amountUsdt float64, txID string) {
	if amountUsdt <= 0 {
		return
	}

	dbTx := w.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			dbTx.Rollback()
		}
	}()

	refID := "trc20_deposit:" + txID

	// Ещё раз проверяем дубликаты
	var existingTx models.Transaction
	if err := dbTx.Where("refId = ?", refID).First(&existingTx).Error; err == nil {
		log.Printf("[BalanceWatcher] Transaction already processed: %s", txID)
		dbTx.Rollback()
		return
	}

	var balance models.Balance
	if err := dbTx.Where("userId = ? AND symbol = ?", userID, "USDT").First(&balance).Error; err != nil {
		balance = models.Balance{
			UserID: userID,
			Symbol: "USDT",
			Amount: "0",
		}
		dbTx.Create(&balance)
	}

	currentBalance, _ := strconv.ParseFloat(balance.Amount, 64)
	newBalance := currentBalance + amountUsdt

	if err := dbTx.Model(&balance).Update("amount", strconv.FormatFloat(newBalance, 'f', 8, 64)).Error; err != nil {
		log.Printf("[BalanceWatcher] Failed to update balance: %v", err)
		dbTx.Rollback()
		return
	}

	var setting models.AppSetting
	rate := "0"
	if err := dbTx.Where("k = ?", "usdt_rub").First(&setting).Error; err == nil {
		rate = setting.V
	}

	transaction := models.Transaction{
		UserID:      userID,
		Type:        "deposit",
		Amount:      strconv.FormatFloat(amountUsdt, 'f', 8, 64),
		Symbol:      "USDT",
		RefID:       &refID,
		RateUsdtRub: rate,
		CreatedAt:   time.Now(),
	}

	if err := dbTx.Create(&transaction).Error; err != nil {
		log.Printf("[BalanceWatcher] Failed to create transaction: %v", err)
		dbTx.Rollback()
		return
	}

	if err := dbTx.Commit().Error; err != nil {
		log.Printf("[BalanceWatcher] Failed to commit: %v", err)
		return
	}

	log.Printf("[BalanceWatcher] Credited %.6f USDT to user %s (txid: %s)", amountUsdt, userID, txID)

	if w.Notifier != nil {
		amountUsdtStr := strconv.FormatFloat(amountUsdt, 'f', 2, 64)
		rateF, _ := strconv.ParseFloat(rate, 64)
		amountRub := amountUsdt * rateF
		amountRubStr := strconv.FormatFloat(amountRub, 'f', 2, 64)
		tronscanURL := "https://tronscan.org/#/transaction/" + txID
		w.Notifier.NotifyToUserDeposit(userID, amountUsdtStr, amountRubStr, tronscanURL)
	}
}
