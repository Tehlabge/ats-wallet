package handlers

import (
	"context"
	"fmt"
	"net/http"
	"strconv"
	"sync"
	"time"

	"ats-wallet/internal/trongrid"
	"ats-wallet/internal/wallet"

	"github.com/gin-gonic/gin"
)

// WalletManagerHandler обрабатывает запросы управления кошельками TRC20
type WalletManagerHandler struct {
	Manager        *wallet.Manager
	WalletPassword string
	TronGridURL    string
	TronGridAPIKey string
}

// NewWalletManagerHandler создаёт новый handler для управления кошельками
func NewWalletManagerHandler(manager *wallet.Manager, walletPassword, tronGridURL, tronGridAPIKey string) *WalletManagerHandler {
	return &WalletManagerHandler{
		Manager:        manager,
		WalletPassword: walletPassword,
		TronGridURL:    tronGridURL,
		TronGridAPIKey: tronGridAPIKey,
	}
}

// Authenticate проверяет пароль для входа на страницу
func (h *WalletManagerHandler) Authenticate(c *gin.Context) {
	var body struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Неверный формат запроса"})
		return
	}

	if !h.Manager.VerifyPassword(body.Password) {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный пароль"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "OK", "authenticated": true})
}

// verifyPasswordHeader проверяет пароль из заголовка X-Wallet-Password
func (h *WalletManagerHandler) verifyPasswordHeader(c *gin.Context) bool {
	password := c.GetHeader("X-Wallet-Password")
	if password == "" {
		password = c.Query("password")
	}
	if password == "" {
		var body struct {
			Password string `json:"password"`
		}
		c.ShouldBindJSON(&body)
		password = body.Password
	}

	if !h.Manager.VerifyPassword(password) {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Требуется авторизация"})
		return false
	}
	return true
}

// GetStats возвращает статистику
func (h *WalletManagerHandler) GetStats(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	stats, err := h.Manager.GetStats()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, stats)
}

// ListWallets возвращает список всех кошельков
func (h *WalletManagerHandler) ListWallets(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	wallets, err := h.Manager.GetAllWallets()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	type WalletInfo struct {
		ID            int     `json:"id"`
		Address       string  `json:"address"`
		UserID        *string `json:"userId"`
		LastBalance   string  `json:"lastBalance"`
		LastCheckedAt *string `json:"lastCheckedAt"`
		CreatedAt     string  `json:"createdAt"`
	}

	var result []WalletInfo
	for _, w := range wallets {
		var lastChecked *string
		if w.LastCheckedAt != nil {
			t := w.LastCheckedAt.Format("2006-01-02 15:04:05")
			lastChecked = &t
		}

		result = append(result, WalletInfo{
			ID:            w.ID,
			Address:       w.Address,
			UserID:        w.UserID,
			LastBalance:   w.LastBalance,
			LastCheckedAt: lastChecked,
			CreatedAt:     w.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}

	c.JSON(http.StatusOK, gin.H{"wallets": result})
}

// CreateWallet создаёт новый кошелёк
func (h *WalletManagerHandler) CreateWallet(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	w, seedPhrase, err := h.Manager.CreateWallet()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"wallet": gin.H{
			"id":        w.ID,
			"address":   w.Address,
			"createdAt": w.CreatedAt.Format("2006-01-02 15:04:05"),
		},
		"seed":    seedPhrase,
		"message": "Сохраните seed-фразу! Она показывается только один раз.",
	})
}

// GetSeed возвращает расшифрованную seed-фразу
func (h *WalletManagerHandler) GetSeed(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)

	seedPhrase, err := h.Manager.GetDecryptedSeed(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"seed": seedPhrase})
}

// GetPrivateKey возвращает расшифрованный приватный ключ
func (h *WalletManagerHandler) GetPrivateKey(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)

	privateKey, err := h.Manager.GetDecryptedPrivateKey(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"privateKey": privateKey})
}

// ExportWallet экспортирует один кошелёк
func (h *WalletManagerHandler) ExportWallet(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)

	exportData, err := h.Manager.ExportSingleWallet(id)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.Header("Content-Disposition", fmt.Sprintf("attachment; filename=wallet_%d.json", id))
	c.Header("Content-Type", "application/json")
	c.String(http.StatusOK, exportData)
}

// ExportAll экспортирует все кошельки
func (h *WalletManagerHandler) ExportAll(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	exportData, err := h.Manager.ExportWalletsEncrypted()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.Header("Content-Disposition", "attachment; filename=wallets_export.json")
	c.Header("Content-Type", "application/json")
	c.String(http.StatusOK, exportData)
}

// Transfer выполняет перевод USDT с управляемого кошелька на внешний адрес
func (h *WalletManagerHandler) Transfer(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	var body struct {
		FromWalletID int     `json:"fromWalletId"`
		ToAddress    string  `json:"toAddress"`
		AmountUsdt   float64 `json:"amountUsdt"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Неверный формат запроса"})
		return
	}

	if body.FromWalletID <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Не указан кошелёк отправителя"})
		return
	}
	if body.ToAddress == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Не указан адрес получателя"})
		return
	}
	if body.AmountUsdt <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Сумма должна быть больше 0"})
		return
	}

	req := wallet.TransferRequest{
		FromWalletID: body.FromWalletID,
		ToAddress:    body.ToAddress,
		AmountUsdt:   body.AmountUsdt,
		Password:     h.WalletPassword, // Пароль уже проверен
	}

	result, err := h.Manager.TransferUSDT(c.Request.Context(), req, h.TronGridURL, h.TronGridAPIKey)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message":     "Перевод отправлен",
		"txId":        result.TxID,
		"fromAddress": result.FromAddress,
		"toAddress":   result.ToAddress,
		"amount":      result.Amount,
		"status":      result.Status,
	})
}

// GetWalletBalance возвращает актуальный баланс кошелька через TronGrid API
func (h *WalletManagerHandler) GetWalletBalance(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)

	w, err := h.Manager.GetWalletByID(id)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Кошелёк не найден"})
		return
	}

	// Получаем актуальный баланс через TronGrid
	balance, err := trongrid.GetTRC20Balance(w.Address, h.TronGridURL, h.TronGridAPIKey)
	if err != nil {
		c.JSON(http.StatusOK, gin.H{
			"id":          w.ID,
			"address":     w.Address,
			"lastBalance": w.LastBalance,
			"error":       err.Error(),
		})
		return
	}

	// Обновляем баланс в БД
	h.Manager.UpdateWalletBalance(w.ID, balance)

	c.JSON(http.StatusOK, gin.H{
		"id":      w.ID,
		"address": w.Address,
		"balance": balance,
	})
}

// RefreshAllBalances обновляет балансы всех кошельков
func (h *WalletManagerHandler) RefreshAllBalances(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	wallets, err := h.Manager.GetAllWallets()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	var updated int
	var failed int

	for _, w := range wallets {
		balance, err := trongrid.GetTRC20Balance(w.Address, h.TronGridURL, h.TronGridAPIKey)
		if err != nil {
			failed++
			continue
		}
		h.Manager.UpdateWalletBalance(w.ID, balance)
		updated++
		time.Sleep(200 * time.Millisecond) // Не перегружаем API
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Балансы обновлены",
		"updated": updated,
		"failed":  failed,
	})
}

// CollectAll собирает все средства с кошельков на один адрес
func (h *WalletManagerHandler) CollectAll(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		return
	}

	var body struct {
		ToAddress   string  `json:"toAddress"`
		MinBalance  float64 `json:"minBalance"` // Минимальный баланс для сбора (по умолчанию 0.1 USDT)
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Неверный формат запроса"})
		return
	}

	if body.ToAddress == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Не указан адрес получателя"})
		return
	}

	if !wallet.ValidateTronAddress(body.ToAddress) {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Неверный адрес TRON"})
		return
	}

	minBalance := body.MinBalance
	if minBalance <= 0 {
		minBalance = 0.1 // Минимум 0.1 USDT
	}

	// Сначала обновляем все балансы
	wallets, err := h.Manager.GetAllWallets()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	// Обновляем балансы параллельно (но с лимитом)
	var wg sync.WaitGroup
	semaphore := make(chan struct{}, 5) // Максимум 5 параллельных запросов

	for i := range wallets {
		wg.Add(1)
		go func(w *wallet.ManagedWallet) {
			defer wg.Done()
			semaphore <- struct{}{}
			defer func() { <-semaphore }()

			balance, err := trongrid.GetTRC20Balance(w.Address, h.TronGridURL, h.TronGridAPIKey)
			if err == nil {
				h.Manager.UpdateWalletBalance(w.ID, balance)
				w.LastBalance = balance
			}
		}(&wallets[i])
	}
	wg.Wait()

	// Собираем средства
	result := wallet.CollectAllResult{
		TotalWallets: len(wallets),
		Results:      []wallet.CollectOneResult{},
	}

	var totalCollected float64
	ctx := context.Background()

	for _, w := range wallets {
		balance, _ := strconv.ParseFloat(w.LastBalance, 64)
		
		oneResult := wallet.CollectOneResult{
			WalletID: w.ID,
			Address:  w.Address,
			Balance:  w.LastBalance,
		}

		// Пропускаем кошельки с маленьким балансом
		if balance < minBalance {
			oneResult.Status = "skipped"
			oneResult.Error = fmt.Sprintf("Баланс %.6f меньше минимума %.6f", balance, minBalance)
			result.SkippedCount++
			result.Results = append(result.Results, oneResult)
			continue
		}

		// Переводим всё (баланс - маленький запас на случай погрешности)
		amountToSend := balance

		req := wallet.TransferRequest{
			FromWalletID: w.ID,
			ToAddress:    body.ToAddress,
			AmountUsdt:   amountToSend,
			Password:     h.WalletPassword,
		}

		txResult, err := h.Manager.TransferUSDT(ctx, req, h.TronGridURL, h.TronGridAPIKey)
		if err != nil {
			oneResult.Status = "failed"
			oneResult.Error = err.Error()
			result.FailedCount++
		} else {
			oneResult.Status = "success"
			oneResult.TxID = txResult.TxID
			oneResult.Collected = fmt.Sprintf("%.6f", amountToSend)
			totalCollected += amountToSend
			result.SuccessCount++

			// Обновляем баланс в БД (теперь 0)
			h.Manager.UpdateWalletBalance(w.ID, "0")
		}

		result.Results = append(result.Results, oneResult)

		// Небольшая задержка между транзакциями
		time.Sleep(500 * time.Millisecond)
	}

	result.TotalCollected = fmt.Sprintf("%.6f", totalCollected)

	c.JSON(http.StatusOK, result)
}

// ClearAllWallets удаляет все данные о кошельках (managed_wallets, wallet_pool, user_wallets)
func (h *WalletManagerHandler) ClearAllWallets(c *gin.Context) {
	if !h.verifyPasswordHeader(c) {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный пароль"})
		return
	}

	result, err := h.Manager.ClearAllWallets()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	c.JSON(http.StatusOK, result)
}
