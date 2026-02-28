package handlers

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log"
	"math/big"
	"net/http"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"golang.org/x/crypto/pbkdf2"
	"gorm.io/gorm"

	"ats-wallet/internal/models"
	"ats-wallet/internal/notify"
	"ats-wallet/internal/prometheus"
	"ats-wallet/internal/seed"
	"ats-wallet/internal/trongrid"
	"ats-wallet/internal/util"
)

func newAESCipher(key []byte) (cipher.Block, error) {
	return aes.NewCipher(key)
}

func newGCM(block cipher.Block) (cipher.AEAD, error) {
	return cipher.NewGCM(block)
}

const saltLen = 16
const keyLen = 64
const iterations = 100000

// getRealIP извлекает реальный IP клиента из заголовков X-Forwarded-For или X-Real-IP.
func getRealIP(c *gin.Context) string {
	// X-Forwarded-For может содержать список IP через запятую, первый - клиентский
	if xff := c.GetHeader("X-Forwarded-For"); xff != "" {
		parts := strings.Split(xff, ",")
		ip := strings.TrimSpace(parts[0])
		if ip != "" {
			return ip
		}
	}
	if xri := c.GetHeader("X-Real-IP"); xri != "" {
		return strings.TrimSpace(xri)
	}
	// Fallback на стандартный метод
	return c.ClientIP()
}

type AdminHandler struct {
	DB                *gorm.DB
	AdminJWTSecret    string
	SeedEncryptionKey string
	JWTSecret         string // Нужен для расшифровки seed (fallback если SeedEncryptionKey пуст)
	Notifier          interface {
		NotifyToUser(userID, event, message string)
		NotifyToUserDeposit(userID, amountUsdt, amountRub, tronscanURL string)
		NotifyToUserWithdraw(userID, message string)
	}
	TronGrid          *trongrid.Client
	WalletPassword    string
}

func (h *AdminHandler) Login(c *gin.Context) {
	var body struct {
		Login    string `json:"login"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		prometheus.AdminLoginAttemptsTotal.WithLabelValues("failure").Inc()
		c.JSON(http.StatusBadRequest, gin.H{"message": "Логин и пароль обязательны"})
		return
	}
	login := strings.TrimSpace(strings.ToLower(body.Login))
	if login == "" || body.Password == "" {
		prometheus.AdminLoginAttemptsTotal.WithLabelValues("failure").Inc()
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный логин или пароль"})
		return
	}
	var admin models.AdminUser
	if err := h.DB.Where("login = ?", login).First(&admin).Error; err != nil {
		prometheus.AdminLoginAttemptsTotal.WithLabelValues("failure").Inc()
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный логин или пароль"})
		return
	}
	parts := strings.SplitN(admin.PasswordHash, ":", 2)
	saltHex, hashHex := "", admin.PasswordHash
	if len(parts) == 2 {
		saltHex, hashHex = parts[0], parts[1]
	}
	salt, _ := hex.DecodeString(saltHex)
	derived := pbkdf2.Key([]byte(body.Password), salt, iterations, keyLen, sha256.New)
	if hex.EncodeToString(derived) != hashHex {
		prometheus.AdminLoginAttemptsTotal.WithLabelValues("failure").Inc()
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный логин или пароль"})
		return
	}
	prometheus.AdminLoginAttemptsTotal.WithLabelValues("success").Inc()
	role := admin.Role
	if role == "" {
		role = "super"
	}
	// Запись сессии входа
	ip := getRealIP(c)
	ua := c.Request.UserAgent()
	if len(ua) > 512 {
		ua = ua[:512]
	}
	h.DB.Create(&models.AdminSession{
		AdminID:   admin.ID,
		Login:     admin.Login,
		IP:        ip,
		UserAgent: ua,
		CreatedAt: time.Now(),
	})
	// Issue JWT
	now := time.Now()
	claims := jwt.MapClaims{
		"admin":   true,
		"adminId": admin.ID,
		"login":   admin.Login,
		"role":    role,
		"iat":     now.Unix(),
		"exp":     now.Add(7 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	tokenStr, err := token.SignedString([]byte(h.AdminJWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка выдачи токена"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"token": tokenStr, "role": role})
}

func (h *AdminHandler) EnsureAdminUser() {
	var count int64
	h.DB.Model(&models.AdminUser{}).Count(&count)
	if count > 0 {
		return
	}
	salt := make([]byte, saltLen)
	rand.Read(salt)
	hash := pbkdf2.Key([]byte("123123"), salt, iterations, keyLen, sha256.New)
	hashStr := hex.EncodeToString(salt) + ":" + hex.EncodeToString(hash)
	h.DB.Create(&models.AdminUser{Login: "admin", PasswordHash: hashStr, Role: "super", CreatedAt: time.Now()})
}

func (h *AdminHandler) GetUsers(c *gin.Context) {
	search := strings.TrimSpace(c.Query("search"))
	sortBy := c.DefaultQuery("sortBy", "createdAt")
	sortOrder := c.DefaultQuery("sortOrder", "desc")
	if sortOrder != "asc" && sortOrder != "desc" {
		sortOrder = "desc"
	}
	orderCol := "createdAt"
	if sortBy == "id" {
		orderCol = "id"
	}
	order := orderCol + " " + strings.ToUpper(sortOrder)

	var users []models.User
	q := h.DB.Model(&models.User{}).Order(order)
	if search != "" {
		term := "%" + search + "%"
		q = q.Where("id LIKE ? OR phone LIKE ? OR digitalId LIKE ? OR telegramId LIKE ? OR telegramUsername LIKE ?", term, term, term, term, term)
	}
	if err := q.Find(&users).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}

	var balances []models.Balance
	h.DB.Find(&balances)
	byUser := make(map[string]map[string]string)
	for _, b := range balances {
		if byUser[b.UserID] == nil {
			byUser[b.UserID] = make(map[string]string)
		}
		byUser[b.UserID][b.Symbol] = strings.TrimSpace(b.Amount)
	}

	result := make([]gin.H, 0, len(users))
	for _, u := range users {
		usdt := "0"
		if m := byUser[u.ID]; m != nil {
			usdt = m["USDT"]
		}
		if usdt == "" {
			usdt = "0"
		}
		phone := ""
		if u.Phone != nil {
			phone = *u.Phone
		}
		tgId, tgUsername := "", ""
		if u.TelegramID != nil {
			tgId = *u.TelegramID
		}
		if u.TelegramUsername != nil {
			tgUsername = *u.TelegramUsername
		}
		digitalId := ""
		if u.DigitalID != nil {
			digitalId = *u.DigitalID
		}
		result = append(result, gin.H{
			"id":                u.ID,
			"phone":             phone,
			"digitalId":         digitalId,
			"telegramId":        tgId,
			"telegramUsername":  tgUsername,
			"commissionPercent": u.CommissionPercent,
			"createdAt":         u.CreatedAt.Format(time.RFC3339),
			"usdt":              usdt,
		})
	}
	c.JSON(http.StatusOK, result)
}

// GetUserByQuery ищет пользователя по цифровому ID или Telegram ID (один параметр q).
func (h *AdminHandler) GetUserByQuery(c *gin.Context) {
	q := strings.TrimSpace(c.Query("q"))
	if q == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "q required (digitalId или telegramId)"})
		return
	}
	var u models.User
	if err := h.DB.Where("digitalId = ?", q).First(&u).Error; err == nil {
		h.writeUserResponse(c, u)
		return
	}
	if err := h.DB.Where("telegramId = ?", q).First(&u).Error; err == nil {
		h.writeUserResponse(c, u)
		return
	}
	c.JSON(http.StatusOK, nil)
}

// ClearAllUsers удаляет всех пользователей и все связанные данные (сессии, балансы, кошельки, заявки и т.д.).
func (h *AdminHandler) ClearAllUsers(c *gin.Context) {
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		tx.Where("1=1").Delete(&models.Session{})
		tx.Where("1=1").Delete(&models.Balance{})
		tx.Where("1=1").Delete(&models.Transaction{})
		tx.Where("1=1").Delete(&models.UserWallet{})
		tx.Where("1=1").Delete(&models.PendingPayment{})
		tx.Where("1=1").Delete(&models.SupportMessage{})
		tx.Where("1=1").Delete(&models.WithdrawalRequest{})
		tx.Exec("UPDATE wallet_pool SET userId = NULL")
		return tx.Where("1=1").Delete(&models.User{}).Error
	})
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	log.Printf("[Admin] ClearAllUsers: all users and related data deleted")
	c.JSON(http.StatusOK, gin.H{"message": "ok"})
}

// GetUserDetail возвращает полную информацию о пользователе: профиль, балансы, комиссия, транзакции, ожидающие платежи.
func (h *AdminHandler) GetUserDetail(c *gin.Context) {
	userID := c.Param("userId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "userId required"})
		return
	}
	var u models.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь не найден"})
		return
	}

	usdt, usdtRef := "0", "0"
	var balances []struct {
		Symbol string
		Amount string
	}
	h.DB.Model(&models.Balance{}).Where("userId = ?", u.ID).Select("symbol, amount").Find(&balances)
	for _, b := range balances {
		if b.Symbol == "USDT" {
			usdt = b.Amount
		} else if b.Symbol == "REF_USDT" {
			usdtRef = b.Amount
		}
	}

	var txList []models.Transaction
	h.DB.Where("userId = ?", u.ID).Order("createdAt DESC").Limit(200).Find(&txList)
	transactions := make([]gin.H, 0, len(txList))
	for _, t := range txList {
		refID := ""
		if t.RefID != nil {
			refID = *t.RefID
		}
		transactions = append(transactions, gin.H{
			"id":          t.ID,
			"symbol":      t.Symbol,
			"amount":      t.Amount,
			"type":        t.Type,
			"refId":       refID,
			"rateUsdtRub": t.RateUsdtRub,
			"createdAt":   t.CreatedAt.Format(time.RFC3339),
		})
	}

	var pendingPayments []models.PendingPayment
	h.DB.Where("userId = ? AND status = ?", u.ID, "pending").Order("createdAt DESC").Limit(50).Find(&pendingPayments)
	pending := make([]gin.H, 0, len(pendingPayments))
	for _, p := range pendingPayments {
		pending = append(pending, gin.H{
			"id":                p.ID,
			"sumRub":            p.SumRub,
			"sumUsdt":           p.SumUsdt,
			"commissionPercent": p.CommissionPercent,
			"status":            p.Status,
			"createdAt":         p.CreatedAt.Format(time.RFC3339),
		})
	}

	tgId, tgUsername, digitalId := "", "", ""
	tgFirstName, tgLastName := "", ""
	referrerId := ""
	if u.TelegramID != nil {
		tgId = *u.TelegramID
	}
	if u.TelegramUsername != nil {
		tgUsername = *u.TelegramUsername
	}
	if u.DigitalID != nil {
		digitalId = *u.DigitalID
	}
	if u.TelegramFirstName != nil {
		tgFirstName = *u.TelegramFirstName
	}
	if u.TelegramLastName != nil {
		tgLastName = *u.TelegramLastName
	}
	if u.ReferrerID != nil {
		referrerId = *u.ReferrerID
	}

	// Кошелёк из ManagedWallet
	depositAddress := ""
	walletBalance := "0"
	var managedWallet models.ManagedWallet
	if h.DB.Where("userId = ?", u.ID).First(&managedWallet).Error == nil {
		depositAddress = managedWallet.Address
		walletBalance = managedWallet.LastBalance
	}

	// Настройки уведомлений
	var notifPref models.UserNotificationPref
	h.DB.Where("userId = ?", u.ID).First(&notifPref)

	// Сессии пользователя
	var sessions []models.Session
	h.DB.Where("userId = ?", u.ID).Order("lastActiveAt DESC").Limit(20).Find(&sessions)
	sessionsData := make([]gin.H, 0, len(sessions))
	for _, s := range sessions {
		ua := ""
		if s.UserAgent != nil {
			ua = *s.UserAgent
		}
		dt := ""
		if s.DeviceType != nil {
			dt = *s.DeviceType
		}
		ip := ""
		if s.IP != nil {
			ip = *s.IP
		}
		sessionsData = append(sessionsData, gin.H{
			"id":           s.ID,
			"userAgent":    ua,
			"deviceType":   dt,
			"ip":           ip,
			"lastActiveAt": s.LastActiveAt.Format(time.RFC3339),
			"createdAt":    s.CreatedAt.Format(time.RFC3339),
		})
	}

	// Последний вход (последняя сессия)
	lastLoginAt := ""
	if len(sessions) > 0 {
		lastLoginAt = sessions[0].LastActiveAt.Format(time.RFC3339)
	}

	// Чат с поддержкой - проверяем есть ли сообщения
	var supportMsgCount int64
	h.DB.Model(&models.SupportMessage{}).Where("userId = ?", u.ID).Count(&supportMsgCount)

	// Считаем рефералов
	var referralsCount int64
	h.DB.Model(&models.User{}).Where("referrerId = ?", u.ID).Count(&referralsCount)

	c.JSON(http.StatusOK, gin.H{
		"id":                        u.ID,
		"depositAddress":            depositAddress,
		"walletBalance":             walletBalance,
		"digitalId":                 digitalId,
		"telegramId":                tgId,
		"telegramUsername":          tgUsername,
		"telegramFirstName":         tgFirstName,
		"telegramLastName":          tgLastName,
		"usdt":                      usdt,
		"usdtRef":                   usdtRef,
		"commissionPercent":         u.CommissionPercent,
		"createdAt":                 u.CreatedAt.Format(time.RFC3339),
		"lastLoginAt":               lastLoginAt,
		"transactions":              transactions,
		"pendingPayments":           pending,
		"isPartner":                 u.IsPartner,
		"referralCommissionPercent": u.ReferralCommissionPercent,
		"referrerId":                referrerId,
		"referralsCount":            referralsCount,
		"sessions":                  sessionsData,
		"notifPromo":                notifPref.NotifPromo,
		"hasSupportChat":            supportMsgCount > 0,
		"supportMessagesCount":      supportMsgCount,
	})
}

func (h *AdminHandler) adminUserResponse(c *gin.Context, value, field string) {
	var u models.User
	var err error
	switch field {
	case "digitalId":
		err = h.DB.Where("digitalId = ?", value).First(&u).Error
	case "telegramId":
		err = h.DB.Where("telegramId = ?", value).First(&u).Error
	default:
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid field"})
		return
	}
	if err != nil {
		c.JSON(http.StatusOK, nil)
		return
	}
	h.writeUserResponse(c, u)
}

func (h *AdminHandler) writeUserResponse(c *gin.Context, u models.User) {
	usdt := "0"
	var balances []struct {
		Symbol string
		Amount string
	}
	h.DB.Model(&models.Balance{}).Where("userId = ?", u.ID).Select("symbol, amount").Find(&balances)
	for _, b := range balances {
		if b.Symbol == "USDT" {
			usdt = b.Amount
		}
	}
	tgId := ""
	if u.TelegramID != nil {
		tgId = *u.TelegramID
	}
	tgUsername := ""
	if u.TelegramUsername != nil {
		tgUsername = *u.TelegramUsername
	}
	digitalId := ""
	if u.DigitalID != nil {
		digitalId = *u.DigitalID
	}
	c.JSON(http.StatusOK, gin.H{
		"id":               u.ID,
		"digitalId":        digitalId,
		"telegramId":       tgId,
		"telegramUsername": tgUsername,
		"usdt":             usdt,
		"commissionPercent": u.CommissionPercent,
	})
}

func (h *AdminHandler) GetUserBalance(c *gin.Context) {
	userID := c.Param("userId")
	usdt := "0"
	var balances []struct {
		Symbol string
		Amount string
	}
	h.DB.Model(&models.Balance{}).Where("userId = ?", userID).Select("symbol, amount").Find(&balances)
	for _, b := range balances {
		if b.Symbol == "USDT" {
			usdt = b.Amount
		}
	}
	c.JSON(http.StatusOK, gin.H{"usdt": usdt})
}

func (h *AdminHandler) SetUserBalance(c *gin.Context) {
	userID := c.Param("userId")
	var body struct {
		Symbol string `json:"symbol"`
		Amount string `json:"amount"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "symbol and amount required"})
		return
	}
	var b models.Balance
	if err := h.DB.Where("userId = ? AND symbol = ?", userID, body.Symbol).First(&b).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Balance row not found"})
		return
	}
	h.DB.Model(&b).Update("amount", body.Amount)
	usdt := "0"
	var rows []struct {
		Symbol string
		Amount string
	}
	h.DB.Model(&models.Balance{}).Where("userId = ?", userID).Select("symbol, amount").Find(&rows)
	for _, r := range rows {
		if r.Symbol == "USDT" {
			usdt = r.Amount
		}
	}
	c.JSON(http.StatusOK, gin.H{"usdt": usdt})
}

// logAdminAction записывает лог действия админа над пользователем.
func logAdminAction(db *gorm.DB, adminID int, userID, action, details string) {
	if adminID <= 0 || userID == "" || action == "" {
		return
	}
	if len(details) > 512 {
		details = details[:512]
	}
	db.Create(&models.AdminActionLog{
		UserID:    userID,
		AdminID:   adminID,
		Action:    action,
		Details:   details,
		CreatedAt: time.Now(),
	})
}

// BalanceOperation пополнение или списание USDT с назначением (замена «зачисление бонусов»).
func (h *AdminHandler) BalanceOperation(c *gin.Context) {
	userID := c.Param("userId")
	var body struct {
		AmountUsdt string `json:"amountUsdt"`
		Operation  string `json:"operation"` // "credit" | "debit"
		Purpose    string `json:"purpose"`   // назначение
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "amountUsdt, operation and purpose required"})
		return
	}
	amountUsdt := strings.TrimSpace(body.AmountUsdt)
	if amountUsdt == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Укажите сумму USDT"})
		return
	}
	amount, err := strconv.ParseFloat(amountUsdt, 64)
	if err != nil || amount <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Укажите положительную сумму USDT"})
		return
	}
	op := strings.TrimSpace(strings.ToLower(body.Operation))
	if op != "credit" && op != "debit" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "operation должен быть credit (пополнение) или debit (списание)"})
		return
	}
	var u models.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь не найден"})
		return
	}
	var b models.Balance
	if err := h.DB.Where("userId = ? AND symbol = ?", userID, "USDT").First(&b).Error; err != nil {
		b = models.Balance{UserID: userID, Symbol: "USDT", Amount: "0"}
		h.DB.Create(&b)
	}
	if op == "debit" {
		var current float64
		if _, err := strconv.ParseFloat(b.Amount, 64); err == nil {
			current, _ = strconv.ParseFloat(b.Amount, 64)
		}
		if current < amount {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Недостаточно средств для списания"})
			return
		}
	}
	purpose := strings.TrimSpace(body.Purpose)
	if len(purpose) > 128 {
		purpose = purpose[:128]
	}
	rateStr := getUsdtRubRateFromDB(h.DB)
	var refID string
	var txAmount string
	if op == "credit" {
		refID = "Пополнение баланса"
		txAmount = amountUsdt
		h.DB.Exec("UPDATE balances SET amount = amount + ? WHERE id = ?", amountUsdt, b.ID)
	} else {
		refID = "Списание баланса"
		txAmount = "-" + amountUsdt
		h.DB.Exec("UPDATE balances SET amount = amount - ? WHERE id = ?", amountUsdt, b.ID)
	}
	if purpose != "" {
		refID = refID + ": " + purpose
	}
	if len(refID) > 64 {
		refID = refID[:64]
	}
	txType := "balance_credit"
	if op == "debit" {
		txType = "balance_debit"
	}
	h.DB.Create(&models.Transaction{
		UserID:      userID,
		Symbol:      "USDT",
		Amount:      txAmount,
		Type:        txType,
		RefID:       &refID,
		RateUsdtRub: rateStr,
		CreatedAt:   time.Now(),
	})
	if h.Notifier != nil {
		if op == "credit" {
			rateF, _ := strconv.ParseFloat(rateStr, 64)
			amountF, _ := strconv.ParseFloat(amountUsdt, 64)
			amountRubStr := strconv.FormatFloat(amountF*rateF, 'f', 2, 64)
			h.Notifier.NotifyToUserDeposit(userID, amountUsdt, amountRubStr, "")
		} else {
			h.Notifier.NotifyToUser(userID, "withdraw", "Списание: "+amountUsdt+" USDT. "+purpose)
		}
	}
	if adminIDVal, ok := c.Get("adminId"); ok {
		if adminID, _ := adminIDVal.(int); adminID > 0 {
			details := op + " " + amountUsdt + " USDT"
			if purpose != "" {
				details += "; " + purpose
			}
			logAdminAction(h.DB, adminID, userID, "balance_operation", details)
		}
	}
	usdt := "0"
	var rows []struct {
		Symbol string
		Amount string
	}
	h.DB.Model(&models.Balance{}).Where("userId = ?", userID).Select("symbol, amount").Find(&rows)
	for _, r := range rows {
		if r.Symbol == "USDT" {
			usdt = r.Amount
		}
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "usdt": usdt})
}

func (h *AdminHandler) GetUserCommission(c *gin.Context) {
	userID := c.Param("userId")
	var u models.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"commissionPercent": u.CommissionPercent})
}

func (h *AdminHandler) SetUserCommission(c *gin.Context) {
	userID := c.Param("userId")
	var body struct {
		CommissionPercent float64 `json:"commissionPercent"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "commissionPercent required"})
		return
	}
	val := int(body.CommissionPercent)
	if val < 0 {
		val = 0
	}
	if val > 100 {
		val = 100
	}
	h.DB.Model(&models.User{}).Where("id = ?", userID).Update("commissionPercent", strconv.Itoa(val))
	if adminIDVal, ok := c.Get("adminId"); ok {
		if adminID, _ := adminIDVal.(int); adminID > 0 {
			logAdminAction(h.DB, adminID, userID, "commission_changed", "commissionPercent="+strconv.Itoa(val))
		}
	}
	var u models.User
	h.DB.Where("id = ?", userID).First(&u)
	c.JSON(http.StatusOK, gin.H{"commissionPercent": u.CommissionPercent})
}

// PatchUserPartner обновляет флаг партнёра и процент реферальной комиссии.
func (h *AdminHandler) PatchUserPartner(c *gin.Context) {
	userID := c.Param("userId")
	var body struct {
		IsPartner                 *bool   `json:"isPartner"`
		ReferralCommissionPercent *string `json:"referralCommissionPercent"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "body with isPartner or referralCommissionPercent"})
		return
	}
	var u models.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}
	upd := make(map[string]interface{})
	if body.IsPartner != nil {
		upd["isPartner"] = *body.IsPartner
	}
	if body.ReferralCommissionPercent != nil {
		pc := strings.TrimSpace(*body.ReferralCommissionPercent)
		if pc == "" {
			pc = "0"
		}
		if v, err := strconv.ParseFloat(pc, 64); err == nil {
			if v < 0 {
				v = 0
			}
			if v > 100 {
				v = 100
			}
			upd["referralCommissionPercent"] = strconv.FormatFloat(v, 'f', 2, 64)
		}
	}
	if len(upd) > 0 {
		h.DB.Model(&models.User{}).Where("id = ?", userID).Updates(upd)
	}
	h.DB.Where("id = ?", userID).First(&u)
	if len(upd) > 0 {
		if adminIDVal, ok := c.Get("adminId"); ok {
			if adminID, _ := adminIDVal.(int); adminID > 0 {
				details := fmt.Sprintf("isPartner=%v referralCommissionPercent=%s", u.IsPartner, u.ReferralCommissionPercent)
				logAdminAction(h.DB, adminID, userID, "referral_commission_changed", details)
			}
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"isPartner":                 u.IsPartner,
		"referralCommissionPercent": u.ReferralCommissionPercent,
	})
}

func (h *AdminHandler) GetStats(c *gin.Context) {
	var usersCount, pendingCount, totalConfirmed int64
	h.DB.Model(&models.User{}).Count(&usersCount)
	h.DB.Model(&models.PendingPayment{}).Where("status = ?", "pending").Count(&pendingCount)
	h.DB.Model(&models.PendingPayment{}).Where("status = ?", "confirmed").Count(&totalConfirmed)
	today := time.Now().Truncate(24 * time.Hour)
	var paymentsToday int64
	h.DB.Model(&models.PendingPayment{}).Where("status = ? AND confirmedAt >= ?", "confirmed", today).Count(&paymentsToday)
	c.JSON(http.StatusOK, gin.H{
		"usersCount":            usersCount,
		"pendingCount":          pendingCount,
		"paymentsToday":         paymentsToday,
		"totalPaymentsConfirmed": totalConfirmed,
	})
}

func (h *AdminHandler) GetPendingPayments(c *gin.Context) {
	adminIDVal, _ := c.Get("adminId")
	adminID, _ := adminIDVal.(int)
	var list []models.PendingPayment
	q := h.DB.Where("status = ?", "pending").Order("createdAt DESC")
	if adminID != 0 {
		q = q.Where("assignedToAdminId IS NULL OR assignedToAdminId = ?", adminID)
	}
	q.Find(&list)
	result := make([]gin.H, 0, len(list))
	for _, p := range list {
		assignedTo := 0
		if p.AssignedToAdminID != nil {
			assignedTo = *p.AssignedToAdminID
		}
		result = append(result, gin.H{
			"id":                p.ID,
			"userId":            p.UserID,
			"rawPayload":        p.RawPayload,
			"sumKopeks":         p.SumKopeks,
			"sumRub":            p.SumRub,
			"sumUsdt":           p.SumUsdt,
			"commissionPercent": p.CommissionPercent,
			"createdAt":         p.CreatedAt.Format(time.RFC3339),
			"assignedToAdminId":  assignedTo,
			"mine":              p.AssignedToAdminID != nil && *p.AssignedToAdminID == adminID,
		})
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) TakePaymentToWork(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)
	adminIDVal, _ := c.Get("adminId")
	adminID, _ := adminIDVal.(int)
	if adminID == 0 {
		c.JSON(http.StatusForbidden, gin.H{"message": "Admin ID required"})
		return
	}
	var p models.PendingPayment
	if err := h.DB.Where("id = ? AND status = ?", id, "pending").First(&p).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Payment not found or already processed"})
		return
	}
	if p.AssignedToAdminID != nil && *p.AssignedToAdminID != adminID {
		c.JSON(http.StatusConflict, gin.H{"message": "Платёж уже взят в работу другим оператором"})
		return
	}
	p.AssignedToAdminID = &adminID
	h.DB.Model(&p).Update("AssignedToAdminID", adminID)
	c.JSON(http.StatusOK, gin.H{"ok": true, "paymentId": p.ID})
}

// GetPaymentArchive возвращает все платежи с фильтром по статусу и поиском по ID/сумме.
func (h *AdminHandler) GetPaymentArchive(c *gin.Context) {
	status := strings.TrimSpace(c.Query("status"))
	search := strings.TrimSpace(c.Query("search"))
	limit := 100
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
		limit = l
	}
	q := h.DB.Model(&models.PendingPayment{}).Order("createdAt DESC").Limit(limit)
	if status != "" {
		q = q.Where("status = ?", status)
	}
	if search != "" {
		if id, err := strconv.Atoi(search); err == nil {
			q = q.Where("id = ?", id)
		} else {
			term := "%" + search + "%"
			q = q.Where("sumRub LIKE ? OR sumUsdt LIKE ?", term, term)
		}
	}
	var list []models.PendingPayment
	q.Find(&list)
	result := make([]gin.H, 0, len(list))
	for _, p := range list {
		confirmedAt, rejectedAt, rejectReason := "", "", ""
		if p.ConfirmedAt != nil {
			confirmedAt = p.ConfirmedAt.Format(time.RFC3339)
		}
		if p.RejectedAt != nil {
			rejectedAt = p.RejectedAt.Format(time.RFC3339)
		}
		if p.RejectReason != nil {
			rejectReason = *p.RejectReason
		}
		result = append(result, gin.H{
			"id":                p.ID,
			"userId":            p.UserID,
			"sumRub":            p.SumRub,
			"sumUsdt":           p.SumUsdt,
			"commissionPercent": p.CommissionPercent,
			"status":            p.Status,
			"createdAt":         p.CreatedAt.Format(time.RFC3339),
			"confirmedAt":       confirmedAt,
			"rejectedAt":        rejectedAt,
			"rejectReason":      rejectReason,
		})
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) GetPaymentByID(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)
	var p models.PendingPayment
	if err := h.DB.Where("id = ?", id).First(&p).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Payment not found"})
		return
	}
	assignedTo := 0
	if p.AssignedToAdminID != nil {
		assignedTo = *p.AssignedToAdminID
	}
	c.JSON(http.StatusOK, gin.H{
		"id":                p.ID,
		"userId":            p.UserID,
		"rawPayload":        p.RawPayload,
		"sumRub":            p.SumRub,
		"sumUsdt":           p.SumUsdt,
		"commissionPercent": p.CommissionPercent,
		"status":            p.Status,
		"createdAt":         p.CreatedAt.Format(time.RFC3339),
		"assignedToAdminId":  assignedTo,
	})
}

func (h *AdminHandler) ConfirmPayment(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)
	adminIDVal, _ := c.Get("adminId")
	adminID, _ := adminIDVal.(int)
	var p models.PendingPayment
	if err := h.DB.Where("id = ?", id).First(&p).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Payment not found"})
		return
	}
	if p.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Payment already processed"})
		return
	}
	// Deduct USDT from user balance
	var b models.Balance
	if err := h.DB.Where("userId = ? AND symbol = ?", p.UserID, "USDT").First(&b).Error; err == nil {
		h.DB.Exec("UPDATE balances SET amount = GREATEST(0, amount - ?) WHERE id = ?", p.SumUsdt, b.ID)
	}
	rateStr := getUsdtRubRateFromDB(h.DB)
	refID := "payment-" + idStr
	// Для пользователя это списание (оплата по СБП), не поступление
	h.DB.Create(&models.Transaction{
		UserID: p.UserID, Symbol: "USDT", Amount: "-" + p.SumUsdt, Type: "payment_debit",
		RefID: &refID, RateUsdtRub: rateStr, CreatedAt: time.Now(),
	})
	// Реферальное начисление: если плательщик пришёл по рефералу, начисляем % на REF_USDT рефереру.
	var payer models.User
	if err := h.DB.Where("id = ?", p.UserID).First(&payer).Error; err == nil && payer.ReferrerID != nil && *payer.ReferrerID != "" {
		var referrer models.User
		if err := h.DB.Where("id = ?", *payer.ReferrerID).First(&referrer).Error; err == nil {
			pc := getReferralPercent(referrer)
			if pc > 0 {
				sumUsdtF, _ := strconv.ParseFloat(p.SumUsdt, 64)
				refAmount := sumUsdtF * (pc / 100)
				if refAmount > 0 {
					refAmountStr := fmt.Sprintf("%.8f", refAmount)
					var refBal models.Balance
					if err := h.DB.Where("userId = ? AND symbol = ?", referrer.ID, "REF_USDT").First(&refBal).Error; err != nil {
						h.DB.Create(&models.Balance{UserID: referrer.ID, Symbol: "REF_USDT", Amount: "0"})
						h.DB.Where("userId = ? AND symbol = ?", referrer.ID, "REF_USDT").First(&refBal)
					}
					if refBal.ID != 0 {
						h.DB.Exec("UPDATE balances SET amount = amount + ? WHERE id = ?", refAmountStr, refBal.ID)
						refRefID := "ref-payment-" + idStr
						h.DB.Create(&models.Transaction{
							UserID: referrer.ID, Symbol: "REF_USDT", Amount: refAmountStr, Type: "referral_commission",
							RefID: &refRefID, RateUsdtRub: rateStr, CreatedAt: time.Now(),
						})
					}
				}
			}
		}
	}
	now := time.Now()
	p.Status = "confirmed"
	p.ConfirmedAt = &now
	if adminID != 0 {
		p.ProcessedByAdminID = &adminID
	}
	h.DB.Save(&p)
	c.JSON(http.StatusOK, gin.H{"ok": true, "paymentId": p.ID})
}

func (h *AdminHandler) RejectPayment(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)
	adminIDVal, _ := c.Get("adminId")
	adminID, _ := adminIDVal.(int)
	var body struct {
		Reason string `json:"reason"`
	}
	c.ShouldBindJSON(&body)
	var p models.PendingPayment
	if err := h.DB.Where("id = ?", id).First(&p).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Payment not found"})
		return
	}
	if p.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Payment already processed"})
		return
	}
	reason := strings.TrimSpace(body.Reason)
	if reason == "" {
		reason = "Истекло время жизни QR-кода. Обновите QR и повторите платёж."
	}
	if len(reason) > 500 {
		reason = reason[:500]
	}
	now := time.Now()
	p.Status = "rejected"
	p.RejectedAt = &now
	p.RejectReason = &reason
	if adminID != 0 {
		p.ProcessedByAdminID = &adminID
	}
	h.DB.Save(&p)
	c.JSON(http.StatusOK, gin.H{"ok": true, "paymentId": p.ID})
}

func (h *AdminHandler) RefreshWalletAddress(c *gin.Context) {
	userID := c.Param("userId")
	var w models.UserWallet
	if err := h.DB.Where("userId = ?", userID).First(&w).Error; err == nil && w.Address != "" {
		c.JSON(http.StatusOK, gin.H{"address": w.Address})
		return
	}
	var pool models.WalletPool
	if err := h.DB.Where("userId IS NULL").First(&pool).Error; err != nil || pool.Address == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"message": "В пуле нет свободных кошельков"})
		return
	}
	pool.UserID = &userID
	h.DB.Model(&pool).Update("userId", userID)
	if w.ID == 0 {
		w = models.UserWallet{UserID: userID, Address: pool.Address, TrackID: ""}
		h.DB.Create(&w)
	} else {
		w.Address = pool.Address
		h.DB.Model(&w).Update("address", pool.Address)
	}
	c.JSON(http.StatusOK, gin.H{"address": w.Address})
}

// ReturnWalletToPool возвращает кошелёк пользователя в пул (отвязывает адрес от пользователя).
func (h *AdminHandler) ReturnWalletToPool(c *gin.Context) {
	userID := c.Param("userId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "userId required"})
		return
	}
	var pool models.WalletPool
	if err := h.DB.Where("userId = ?", userID).First(&pool).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "У пользователя нет назначенного кошелька из пула"})
		return
	}
	h.DB.Where("userId = ? AND address = ?", userID, pool.Address).Delete(&models.UserWallet{})
	h.DB.Model(&pool).Update("userId", nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) GetWalletPool(c *gin.Context) {
	var list []models.WalletPool
	h.DB.Order("id ASC").Find(&list)
	out := make([]gin.H, 0, len(list))
	for _, p := range list {
		uid := ""
		if p.UserID != nil {
			uid = *p.UserID
		}
		item := gin.H{"id": p.ID, "address": p.Address, "userId": uid}
		if p.UserID == nil && h.TronGrid != nil {
			bal, err := h.TronGrid.GetTRC20Balance(c.Request.Context(), p.Address, "")
			if err == nil && bal != nil {
				usdt6 := new(big.Int).Div(bal, big.NewInt(1e6))
				rem := new(big.Int).Mod(bal, big.NewInt(1e6))
				item["balanceUsdt"] = fmt.Sprintf("%d.%06d", usdt6, rem.Int64())
			}
		}
		out = append(out, item)
	}
	c.JSON(http.StatusOK, out)
}

func (h *AdminHandler) AddWalletPool(c *gin.Context) {
	var body struct {
		Address string `json:"address"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "address required"})
		return
	}
	addr := strings.TrimSpace(body.Address)
	if addr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "address required"})
		return
	}
	var exist models.WalletPool
	if err := h.DB.Where("address = ?", addr).First(&exist).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Адрес уже в пуле"})
		return
	}
	h.DB.Create(&models.WalletPool{Address: addr})
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) RemoveWalletPool(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)
	var p models.WalletPool
	if err := h.DB.First(&p, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Not found"})
		return
	}
	if p.UserID != nil {
		h.DB.Where("userId = ? AND address = ?", *p.UserID, p.Address).Delete(&models.UserWallet{})
	}
	h.DB.Model(&p).Update("userId", nil)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// CheckWalletBalance проверяет баланс кошелька из пула через TronGrid API.
func (h *AdminHandler) CheckWalletBalance(c *gin.Context) {
	idStr := c.Param("id")
	id, _ := strconv.Atoi(idStr)
	var p models.WalletPool
	if err := h.DB.First(&p, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Кошелёк не найден"})
		return
	}
	if h.TronGrid == nil {
		c.JSON(http.StatusServiceUnavailable, gin.H{"message": "TronGrid API не настроен"})
		return
	}
	// Валидация адреса
	cleanAddr := trongrid.CleanTronAddress(p.Address)
	if !trongrid.IsValidTronAddress(cleanAddr) {
		c.JSON(http.StatusBadRequest, gin.H{"message": fmt.Sprintf("Неверный формат адреса: %s (должен начинаться с T и содержать 34 символа)", p.Address)})
		return
	}
	bal, err := h.TronGrid.GetTRC20Balance(c.Request.Context(), cleanAddr, "")
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка API TronGrid: " + err.Error()})
		return
	}
	usdt6 := new(big.Int).Div(bal, big.NewInt(1e6))
	rem := new(big.Int).Mod(bal, big.NewInt(1e6))
	balanceUsdt := fmt.Sprintf("%d.%06d", usdt6, rem.Int64())
	c.JSON(http.StatusOK, gin.H{
		"id":          p.ID,
		"address":     p.Address,
		"balanceUsdt": balanceUsdt,
		"balanceRaw":  bal.String(),
	})
}

func (h *AdminHandler) GetWalletCreationLogs(c *gin.Context) {
	var wallets []models.UserWallet
	if err := h.DB.Order("createdAt DESC").Limit(200).Find(&wallets).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": err.Error()})
		return
	}
	userIDs := make([]string, 0, len(wallets))
	for _, w := range wallets {
		userIDs = append(userIDs, w.UserID)
	}
	var users []models.User
	h.DB.Where("id IN ?", userIDs).Find(&users)
	byUser := make(map[string]models.User)
	for _, u := range users {
		byUser[u.ID] = u
	}
	result := make([]gin.H, 0, len(wallets))
	for _, w := range wallets {
		u := byUser[w.UserID]
		display := w.UserID
		if u.Phone != nil && *u.Phone != "" {
			display = *u.Phone
		} else if u.TelegramUsername != nil && *u.TelegramUsername != "" {
			display = "@" + *u.TelegramUsername
		}
		result = append(result, gin.H{
			"userId":        w.UserID,
			"userDisplay":   display,
			"addressMasked": util.MaskAddress(w.Address),
			"createdAt":    w.CreatedAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) SeedAppSettings() {
	seeds := []struct{ k, v string }{
		{"usdt_rub", "98.5"},
		{"default_commission_percent", "5"},
		{"withdraw_commission_card", "2"},
		{"withdraw_commission_card_fixed", "0"},
		{"withdraw_commission_wallet", "1"},
		{"withdraw_commission_wallet_fixed", "0"},
	}
	for _, s := range seeds {
		var count int64
		h.DB.Table("app_settings").Where("k = ?", s.k).Count(&count)
		if count == 0 {
			h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?)", s.k, s.v)
			log.Printf("[Admin] Seeded app_settings %s = %s", s.k, s.v)
		}
	}
}

func (h *AdminHandler) GetRate(c *gin.Context) {
	val := getUsdtRubRateFromDB(h.DB)
	rate := 98.5
	if v, err := strconv.ParseFloat(val, 64); err == nil && v > 0 {
		rate = v
	}
	c.JSON(http.StatusOK, gin.H{"usdtRub": rate})
}

func (h *AdminHandler) SetRate(c *gin.Context) {
	var body struct {
		UsdtRub float64 `json:"usdtRub"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "usdtRub required"})
		return
	}
	if body.UsdtRub <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "usdtRub must be positive"})
		return
	}
	val := strconv.FormatFloat(body.UsdtRub, 'f', 4, 64)
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "usdt_rub", val)
	c.JSON(http.StatusOK, gin.H{"usdtRub": body.UsdtRub})
}

func getAppSettingFromDB(db *gorm.DB, key, defaultVal string) string {
	var v string
	db.Table("app_settings").Where("k = ?", key).Select("v").Scan(&v)
	if v == "" {
		return defaultVal
	}
	return v
}

func getUsdtRubRateFromDB(db *gorm.DB) string {
	return getAppSettingFromDB(db, "usdt_rub", "98.5")
}

// getReferralPercent возвращает процент реферальной комиссии (0.5 по умолчанию для всех).
func getReferralPercent(u models.User) float64 {
	p := strings.TrimSpace(u.ReferralCommissionPercent)
	if p == "" || p == "0" {
		return 0.5
	}
	v, _ := strconv.ParseFloat(p, 64)
	return v
}

func (h *AdminHandler) GetWithdrawCommissions(c *gin.Context) {
	cardPct := getAppSettingFromDB(h.DB, "withdraw_commission_card", "2")
	cardFix := getAppSettingFromDB(h.DB, "withdraw_commission_card_fixed", "0")
	sbpPct := getAppSettingFromDB(h.DB, "withdraw_commission_sbp", "2")
	sbpFix := getAppSettingFromDB(h.DB, "withdraw_commission_sbp_fixed", "0")
	walletPct := getAppSettingFromDB(h.DB, "withdraw_commission_wallet", "1")
	walletFix := getAppSettingFromDB(h.DB, "withdraw_commission_wallet_fixed", "0")
	cardPercent, cardFixed := 2.0, 0.0
	sbpPercent, sbpFixed := 2.0, 0.0
	walletPercent, walletFixed := 1.0, 0.0
	if v, err := strconv.ParseFloat(cardPct, 64); err == nil && v >= 0 {
		cardPercent = v
	}
	if v, err := strconv.ParseFloat(cardFix, 64); err == nil && v >= 0 {
		cardFixed = v
	}
	if v, err := strconv.ParseFloat(sbpPct, 64); err == nil && v >= 0 {
		sbpPercent = v
	}
	if v, err := strconv.ParseFloat(sbpFix, 64); err == nil && v >= 0 {
		sbpFixed = v
	}
	if v, err := strconv.ParseFloat(walletPct, 64); err == nil && v >= 0 {
		walletPercent = v
	}
	if v, err := strconv.ParseFloat(walletFix, 64); err == nil && v >= 0 {
		walletFixed = v
	}
	c.JSON(http.StatusOK, gin.H{
		"commissionCardPercent":   cardPercent,
		"commissionCardFixed":     cardFixed,
		"commissionSbpPercent":    sbpPercent,
		"commissionSbpFixed":      sbpFixed,
		"commissionWalletPercent": walletPercent,
		"commissionWalletFixed":   walletFixed,
	})
}

func (h *AdminHandler) SetWithdrawCommissions(c *gin.Context) {
	var body struct {
		CommissionCardPercent   float64 `json:"commissionCardPercent"`
		CommissionCardFixed     float64 `json:"commissionCardFixed"`
		CommissionSbpPercent    float64 `json:"commissionSbpPercent"`
		CommissionSbpFixed      float64 `json:"commissionSbpFixed"`
		CommissionWalletPercent float64 `json:"commissionWalletPercent"`
		CommissionWalletFixed   float64 `json:"commissionWalletFixed"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request body"})
		return
	}
	if body.CommissionCardPercent < 0 || body.CommissionSbpPercent < 0 || body.CommissionWalletPercent < 0 ||
		body.CommissionCardFixed < 0 || body.CommissionSbpFixed < 0 || body.CommissionWalletFixed < 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Commissions cannot be negative"})
		return
	}
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
		"withdraw_commission_card", strconv.FormatFloat(body.CommissionCardPercent, 'f', 2, 64))
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
		"withdraw_commission_card_fixed", strconv.FormatFloat(body.CommissionCardFixed, 'f', 2, 64))
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
		"withdraw_commission_sbp", strconv.FormatFloat(body.CommissionSbpPercent, 'f', 2, 64))
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
		"withdraw_commission_sbp_fixed", strconv.FormatFloat(body.CommissionSbpFixed, 'f', 2, 64))
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
		"withdraw_commission_wallet", strconv.FormatFloat(body.CommissionWalletPercent, 'f', 2, 64))
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
		"withdraw_commission_wallet_fixed", strconv.FormatFloat(body.CommissionWalletFixed, 'f', 2, 64))
	c.JSON(http.StatusOK, gin.H{
		"commissionCardPercent":   body.CommissionCardPercent,
		"commissionCardFixed":     body.CommissionCardFixed,
		"commissionSbpPercent":    body.CommissionSbpPercent,
		"commissionSbpFixed":      body.CommissionSbpFixed,
		"commissionWalletPercent": body.CommissionWalletPercent,
		"commissionWalletFixed":   body.CommissionWalletFixed,
	})
}

func (h *AdminHandler) GetDefaultCommission(c *gin.Context) {
	val := getAppSettingFromDB(h.DB, "default_commission_percent", "5")
	pc := 5.0
	if v, err := strconv.ParseFloat(val, 64); err == nil && v >= 0 {
		pc = v
	}
	c.JSON(http.StatusOK, gin.H{"defaultCommissionPercent": pc})
}

func (h *AdminHandler) SetDefaultCommission(c *gin.Context) {
	var body struct {
		DefaultCommissionPercent float64 `json:"defaultCommissionPercent"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "defaultCommissionPercent required"})
		return
	}
	if body.DefaultCommissionPercent < 0 || body.DefaultCommissionPercent > 100 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "defaultCommissionPercent must be 0–100"})
		return
	}
	val := strconv.FormatFloat(body.DefaultCommissionPercent, 'f', 2, 64)
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "default_commission_percent", val)
	c.JSON(http.StatusOK, gin.H{"defaultCommissionPercent": body.DefaultCommissionPercent})
}

func (h *AdminHandler) GetTelegramBotUsername(c *gin.Context) {
	v := getAppSettingFromDB(h.DB, "telegram_bot_username", "")
	c.JSON(http.StatusOK, gin.H{"telegramBotUsername": strings.TrimSpace(v)})
}

func (h *AdminHandler) SetTelegramBotUsername(c *gin.Context) {
	var body struct {
		TelegramBotUsername string `json:"telegramBotUsername"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "telegramBotUsername required"})
		return
	}
	v := strings.TrimSpace(body.TelegramBotUsername)
	// Убираем @ в начале, если указали
	if len(v) > 0 && v[0] == '@' {
		v = v[1:]
	}
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "telegram_bot_username", v)
	c.JSON(http.StatusOK, gin.H{"telegramBotUsername": v})
}

// GetSupportBotToken возвращает токен бота поддержки (маскированный)
func (h *AdminHandler) GetSupportBotToken(c *gin.Context) {
	v := getAppSettingFromDB(h.DB, "support_bot_token", "")
	// Возвращаем только информацию о наличии токена (маскируем)
	masked := ""
	if len(v) > 10 {
		masked = v[:6] + "..." + v[len(v)-4:]
	} else if v != "" {
		masked = "***"
	}
	c.JSON(http.StatusOK, gin.H{"supportBotToken": masked, "configured": v != ""})
}

// SetSupportBotToken устанавливает токен бота поддержки
func (h *AdminHandler) SetSupportBotToken(c *gin.Context) {
	var body struct {
		Token string `json:"token"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "token required"})
		return
	}
	v := strings.TrimSpace(body.Token)
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "support_bot_token", v)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetFinanceStats возвращает оборот USDT и объём комиссии (прибыль) по подтверждённым платежам.
func (h *AdminHandler) GetFinanceStats(c *gin.Context) {
	var payments []models.PendingPayment
	h.DB.Where("status = ?", "confirmed").Find(&payments)
	var totalTurnoverUsdt, totalCommissionUsdt float64
	byDay := make(map[string]struct{ Turnover, Commission float64 })
	for _, p := range payments {
		if p.ConfirmedAt == nil {
			continue
		}
		su, _ := strconv.ParseFloat(strings.TrimSpace(p.SumUsdt), 64)
		pc, _ := strconv.ParseFloat(strings.TrimSpace(p.CommissionPercent), 64)
		commissionUsdt := su * (pc / 100)
		totalTurnoverUsdt += su
		totalCommissionUsdt += commissionUsdt
		day := p.ConfirmedAt.Format("2006-01-02")
		d := byDay[day]
		d.Turnover += su
		d.Commission += commissionUsdt
		byDay[day] = d
	}
	days := make([]gin.H, 0, len(byDay))
	for d, v := range byDay {
		days = append(days, gin.H{"date": d, "turnoverUsdt": v.Turnover, "commissionUsdt": v.Commission})
	}
	sort.Slice(days, func(i, j int) bool { return days[i]["date"].(string) < days[j]["date"].(string) })
	if len(days) > 90 {
		days = days[len(days)-90:]
	}
	rateStr := getAppSettingFromDB(h.DB, "usdt_rub", "98.5")
	rate, _ := strconv.ParseFloat(rateStr, 64)
	if rate <= 0 {
		rate = 98.5
	}
	c.JSON(http.StatusOK, gin.H{
		"totalTurnoverUsdt":   totalTurnoverUsdt,
		"totalCommissionUsdt": totalCommissionUsdt,
		"totalCommissionRub":  totalCommissionUsdt * rate,
		"paymentsCount":       len(payments),
		"usdtRubRate":         rate,
		"byDay":               days,
	})
}

// GetExtendedFinanceStats возвращает расширенную финансовую статистику с разбивкой по направлениям
func (h *AdminHandler) GetExtendedFinanceStats(c *gin.Context) {
	daysParam := c.DefaultQuery("days", "30")
	days, _ := strconv.Atoi(daysParam)
	if days < 1 || days > 365 {
		days = 30
	}

	startDate := time.Now().AddDate(0, 0, -days).Truncate(24 * time.Hour)

	// Курс USDT/RUB
	rateStr := getAppSettingFromDB(h.DB, "usdt_rub", "98.5")
	rate, _ := strconv.ParseFloat(rateStr, 64)
	if rate <= 0 {
		rate = 98.5
	}

	// Комиссии
	cardPercent, _ := strconv.ParseFloat(getAppSettingFromDB(h.DB, "commission_card_percent", "0"), 64)
	cardFixed, _ := strconv.ParseFloat(getAppSettingFromDB(h.DB, "commission_card_fixed", "0"), 64)
	sbpPercent, _ := strconv.ParseFloat(getAppSettingFromDB(h.DB, "commission_sbp_percent", "0"), 64)
	sbpFixed, _ := strconv.ParseFloat(getAppSettingFromDB(h.DB, "commission_sbp_fixed", "0"), 64)
	walletPercent, _ := strconv.ParseFloat(getAppSettingFromDB(h.DB, "commission_wallet_percent", "0"), 64)
	walletFixed, _ := strconv.ParseFloat(getAppSettingFromDB(h.DB, "commission_wallet_fixed", "0"), 64)

	// === 1. Статистика по платежам (scan) ===
	var payments []models.PendingPayment
	h.DB.Where("status = ? AND confirmedAt >= ?", "confirmed", startDate).Find(&payments)

	var paymentsCount int
	var paymentsTurnover, paymentsCommission float64
	for _, p := range payments {
		su, _ := strconv.ParseFloat(strings.TrimSpace(p.SumUsdt), 64)
		pc, _ := strconv.ParseFloat(strings.TrimSpace(p.CommissionPercent), 64)
		commissionUsdt := su * (pc / 100)
		paymentsTurnover += su
		paymentsCommission += commissionUsdt
		paymentsCount++
	}

	// === 2. Статистика по выводам ===
	var withdrawals []models.WithdrawalRequest
	h.DB.Where("status = ? AND processedAt >= ?", "approved", startDate).Find(&withdrawals)

	var (
		cardCount, sbpCount, walletCount                         int
		cardSum, sbpSum, walletSum                               float64
		cardCommission, sbpCommission, walletCommission          float64
	)

	for _, w := range withdrawals {
		amt, _ := strconv.ParseFloat(w.AmountUsdt, 64)
		switch w.Type {
		case "card":
			cardCount++
			cardSum += amt
			cardCommission += (amt * cardPercent / 100) + cardFixed
		case "sbp":
			sbpCount++
			sbpSum += amt
			sbpCommission += (amt * sbpPercent / 100) + sbpFixed
		case "wallet":
			walletCount++
			walletSum += amt
			walletCommission += (amt * walletPercent / 100) + walletFixed
		}
	}

	totalWithdrawCommission := cardCommission + sbpCommission + walletCommission

	// === 3. Реферальная статистика ===
	// Считаем сумму начислений рефералам (транзакции типа referral_bonus)
	var referralBonusSum float64
	h.DB.Model(&models.Transaction{}).
		Where("type = ? AND createdAt >= ?", "referral_bonus", startDate).
		Select("COALESCE(SUM(amount), 0)").Scan(&referralBonusSum)

	var referralBonusCount int64
	h.DB.Model(&models.Transaction{}).
		Where("type = ? AND createdAt >= ?", "referral_bonus", startDate).
		Count(&referralBonusCount)

	// Считаем сколько пользователей пришли по рефералам за период
	var referredUsersCount int64
	h.DB.Model(&models.User{}).
		Where("referrerId IS NOT NULL AND referrerId != '' AND createdAt >= ?", startDate).
		Count(&referredUsersCount)

	// === 4. Итоги ===
	totalCommission := paymentsCommission + totalWithdrawCommission
	totalCommissionRub := totalCommission * rate

	c.JSON(http.StatusOK, gin.H{
		"period": days,
		"usdtRubRate": rate,
		
		// Платежи (scan)
		"paymentsCount":      paymentsCount,
		"paymentsTurnover":   paymentsTurnover,
		"paymentsCommission": paymentsCommission,
		
		// Выводы по направлениям
		"withdrawCard": gin.H{
			"count":      cardCount,
			"sum":        cardSum,
			"commission": cardCommission,
			"sumRub":     (cardSum - cardCommission) * rate,
		},
		"withdrawSbp": gin.H{
			"count":      sbpCount,
			"sum":        sbpSum,
			"commission": sbpCommission,
			"sumRub":     (sbpSum - sbpCommission) * rate,
		},
		"withdrawWallet": gin.H{
			"count":      walletCount,
			"sum":        walletSum,
			"commission": walletCommission,
		},
		"withdrawTotal": gin.H{
			"count":      cardCount + sbpCount + walletCount,
			"sum":        cardSum + sbpSum + walletSum,
			"commission": totalWithdrawCommission,
		},
		
		// Рефералы
		"referral": gin.H{
			"bonusCount":     referralBonusCount,
			"bonusSum":       referralBonusSum,
			"newUsersCount":  referredUsersCount,
		},
		
		// Итого
		"totalCommission":    totalCommission,
		"totalCommissionRub": totalCommissionRub,
	})
}

func (h *AdminHandler) GetTransactions(c *gin.Context) {
	userID := strings.TrimSpace(c.Query("userId"))
	limit := 200
	if l, err := strconv.Atoi(c.Query("limit")); err == nil && l > 0 && l <= 500 {
		limit = l
	}
	q := h.DB.Model(&models.Transaction{}).Order("createdAt DESC").Limit(limit)
	if userID != "" {
		q = q.Where("userId = ?", userID)
	}
	var list []models.Transaction
	q.Find(&list)

	// Собираем уникальные userID для получения данных о пользователях
	userIDs := make(map[string]bool)
	for _, t := range list {
		userIDs[t.UserID] = true
	}
	userIDList := make([]string, 0, len(userIDs))
	for uid := range userIDs {
		userIDList = append(userIDList, uid)
	}

	// Получаем информацию о пользователях
	var users []models.User
	if len(userIDList) > 0 {
		h.DB.Where("id IN ?", userIDList).Find(&users)
	}
	userMap := make(map[string]models.User)
	for _, u := range users {
		userMap[u.ID] = u
	}

	result := make([]gin.H, 0, len(list))
	for _, t := range list {
		refID := ""
		if t.RefID != nil {
			refID = *t.RefID
		}
		item := gin.H{
			"id":          t.ID,
			"userId":      t.UserID,
			"symbol":      t.Symbol,
			"amount":      t.Amount,
			"type":        t.Type,
			"refId":       refID,
			"rateUsdtRub": t.RateUsdtRub,
			"createdAt":   t.CreatedAt.Format(time.RFC3339),
		}

		// Добавляем информацию о пользователе
		if u, ok := userMap[t.UserID]; ok {
			if u.DigitalID != nil {
				item["userDigitalId"] = *u.DigitalID
			}
			if u.Phone != nil {
				item["userPhone"] = *u.Phone
			}
			if u.TelegramUsername != nil {
				item["userTelegramUsername"] = *u.TelegramUsername
			}
		}

		// Для выводов добавляем метод и реквизиты
		if (t.Type == "withdrawal_hold" || t.Type == "withdrawal_refund" || t.Type == "withdrawal") && refID != "" {
			var reqID int
			if _, err := fmt.Sscanf(refID, "withdrawal_request:%d", &reqID); err != nil {
				if _, err := fmt.Sscanf(refID, "withdrawal_reject:%d", &reqID); err != nil {
					_, _ = fmt.Sscanf(refID, "withdrawal_complete:%d", &reqID)
				}
			}
			if reqID > 0 {
				var wr models.WithdrawalRequest
				if h.DB.Where("id = ?", reqID).First(&wr).Error == nil {
					item["method"] = wr.Type
					item["details"] = wr.Details
					item["status"] = wr.Status
				}
			}
		}
		result = append(result, item)
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) GetAdminSessions(c *gin.Context) {
	var list []models.AdminSession
	h.DB.Order("createdAt DESC").Limit(200).Find(&list)
	result := make([]gin.H, 0, len(list))
	for _, s := range list {
		result = append(result, gin.H{
			"id":        s.ID,
			"adminId":  s.AdminID,
			"login":    s.Login,
			"ip":       s.IP,
			"userAgent": s.UserAgent,
			"createdAt": s.CreatedAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, result)
}

// DeleteAdminSession удаляет запись о сессии админа.
func (h *AdminHandler) DeleteAdminSession(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Неверный ID"})
		return
	}
	res := h.DB.Delete(&models.AdminSession{}, id)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка удаления"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// DeleteAdminSessionsBatch удаляет несколько сессий.
func (h *AdminHandler) DeleteAdminSessionsBatch(c *gin.Context) {
	var body struct {
		IDs []int `json:"ids"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.IDs) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "ids обязательны"})
		return
	}
	h.DB.Delete(&models.AdminSession{}, body.IDs)
	c.JSON(http.StatusOK, gin.H{"ok": true, "deleted": len(body.IDs)})
}

func (h *AdminHandler) CreateAdminUser(c *gin.Context) {
	var body struct {
		Login    string `json:"login"`
		Password string `json:"password"`
		Role     string `json:"role"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Логин и пароль обязательны"})
		return
	}
	login := strings.TrimSpace(strings.ToLower(body.Login))
	if login == "" || len(body.Password) < 4 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Логин и пароль (мин. 4 символа) обязательны"})
		return
	}
	role := strings.TrimSpace(strings.ToLower(body.Role))
	if role != "super" && role != "operator" {
		role = "operator"
	}
	var exists models.AdminUser
	if err := h.DB.Where("login = ?", login).First(&exists).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Пользователь с таким логином уже существует"})
		return
	}
	salt := make([]byte, saltLen)
	rand.Read(salt)
	hash := pbkdf2.Key([]byte(body.Password), salt, iterations, keyLen, sha256.New)
	hashStr := hex.EncodeToString(salt) + ":" + hex.EncodeToString(hash)
	h.DB.Create(&models.AdminUser{Login: login, PasswordHash: hashStr, Role: role, CreatedAt: time.Now()})
	c.JSON(http.StatusOK, gin.H{"ok": true, "login": login, "role": role})
}

func (h *AdminHandler) ListAdminUsers(c *gin.Context) {
	var list []models.AdminUser
	h.DB.Order("createdAt DESC").Find(&list)
	result := make([]gin.H, 0, len(list))
	for _, a := range list {
		result = append(result, gin.H{
			"id":        a.ID,
			"login":    a.Login,
			"role":     a.Role,
			"createdAt": a.CreatedAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, result)
}

// DeleteAdminUser удаляет оператора (только super может удалять).
func (h *AdminHandler) DeleteAdminUser(c *gin.Context) {
	role := c.GetString("adminRole")
	if role != "super" {
		c.JSON(http.StatusForbidden, gin.H{"message": "Только супер-админ может удалять операторов"})
		return
	}
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid id"})
		return
	}
	var admin models.AdminUser
	if err := h.DB.Where("id = ?", id).First(&admin).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Оператор не найден"})
		return
	}
	// Нельзя удалить самого себя
	currentAdminID, _ := c.Get("adminId")
	if currentAdminID == id {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Нельзя удалить свой аккаунт"})
		return
	}
	h.DB.Delete(&admin)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ChangeAdminPassword - смена пароля админа/оператора (только super может менять любому, оператор - только себе)
func (h *AdminHandler) ChangeAdminPassword(c *gin.Context) {
	role := c.GetString("adminRole")
	currentAdminID, _ := c.Get("adminId")

	idStr := c.Param("id")
	targetID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid id"})
		return
	}

	// Оператор может менять только свой пароль
	if role != "super" && currentAdminID != targetID {
		c.JSON(http.StatusForbidden, gin.H{"message": "Нет прав для смены пароля"})
		return
	}

	var body struct {
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || len(body.Password) < 4 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Пароль должен быть не менее 4 символов"})
		return
	}

	var admin models.AdminUser
	if err := h.DB.Where("id = ?", targetID).First(&admin).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь не найден"})
		return
	}

	salt := make([]byte, saltLen)
	rand.Read(salt)
	hash := pbkdf2.Key([]byte(body.Password), salt, iterations, keyLen, sha256.New)
	hashStr := hex.EncodeToString(salt) + ":" + hex.EncodeToString(hash)

	h.DB.Model(&admin).Update("password_hash", hashStr)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// LoginAsAdmin - супер-админ может войти под любым оператором
func (h *AdminHandler) LoginAsAdmin(c *gin.Context) {
	role := c.GetString("adminRole")
	if role != "super" {
		c.JSON(http.StatusForbidden, gin.H{"message": "Только супер-админ может входить под другими аккаунтами"})
		return
	}

	idStr := c.Param("id")
	targetID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid id"})
		return
	}

	var admin models.AdminUser
	if err := h.DB.Where("id = ?", targetID).First(&admin).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь не найден"})
		return
	}

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"adminId": admin.ID,
		"login":   admin.Login,
		"role":    admin.Role,
		"exp":     time.Now().Add(24 * time.Hour).Unix(),
	})
	tokenString, err := token.SignedString([]byte(h.AdminJWTSecret))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка генерации токена"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"token": tokenString,
		"role":  admin.Role,
		"login": admin.Login,
	})
}

// DeleteAppUser - полное удаление пользователя приложения (требуется WALLET_PASSWORD)
func (h *AdminHandler) DeleteAppUser(c *gin.Context) {
	role := c.GetString("adminRole")
	if role != "super" {
		c.JSON(http.StatusForbidden, gin.H{"message": "Только супер-админ может удалять пользователей"})
		return
	}

	password := c.GetHeader("X-Wallet-Password")
	if password == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Требуется платёжный пароль"})
		return
	}
	if password != h.WalletPassword {
		c.JSON(http.StatusForbidden, gin.H{"message": "Неверный платёжный пароль"})
		return
	}

	userID := c.Param("userId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "userId обязателен"})
		return
	}

	var user models.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь не найден"})
		return
	}

	// Удаляем все связанные данные
	h.DB.Where("userId = ?", userID).Delete(&models.Transaction{})
	h.DB.Where("userId = ?", userID).Delete(&models.Balance{})
	h.DB.Where("userId = ?", userID).Delete(&models.Session{})
	h.DB.Where("userId = ?", userID).Delete(&models.PendingPayment{})
	h.DB.Where("userId = ?", userID).Delete(&models.WithdrawalRequest{})
	h.DB.Where("userId = ?", userID).Delete(&models.SupportMessage{})
	h.DB.Where("userId = ?", userID).Delete(&models.UserNotificationPref{})
	
	// Отвязываем кошельки (не удаляем, просто обнуляем userId)
	h.DB.Model(&models.ManagedWallet{}).Where("userId = ?", userID).Update("userId", nil)
	h.DB.Model(&models.WalletPool{}).Where("userId = ?", userID).Update("userId", nil)
	
	// Удаляем user_wallets
	h.DB.Where("userId = ?", userID).Delete(&models.UserWallet{})
	
	// Удаляем запись о запуске бота (если есть telegramId)
	if user.TelegramID != nil {
		h.DB.Where("telegramId = ?", *user.TelegramID).Delete(&models.TelegramBotStart{})
	}

	// Удаляем самого пользователя
	h.DB.Delete(&user)

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "Пользователь и все его данные удалены"})
}

func (h *AdminHandler) GetTelegramBotStarts(c *gin.Context) {
	var list []models.TelegramBotStart
	h.DB.Order("startedAt DESC").Limit(500).Find(&list)
	result := make([]gin.H, 0, len(list))
	for _, s := range list {
		result = append(result, gin.H{
			"id":           s.ID,
			"telegramId":   s.TelegramID,
			"username":     s.Username,
			"firstName":    s.FirstName,
			"lastName":     s.LastName,
			"languageCode": s.LanguageCode,
			"startedAt":    s.StartedAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) GetWithdrawalRequests(c *gin.Context) {
	status := strings.TrimSpace(strings.ToLower(c.Query("status")))
	var list []models.WithdrawalRequest
	q := h.DB.Order("createdAt DESC").Limit(200)
	if status != "" && (status == "pending" || status == "approved" || status == "rejected") {
		q = q.Where("status = ?", status)
	}
	q.Find(&list)
	result := make([]gin.H, 0, len(list))
	for _, r := range list {
		var u models.User
		_ = h.DB.Where("id = ?", r.UserID).First(&u).Error
		digId := ""
		if u.DigitalID != nil {
			digId = *u.DigitalID
		}
		tg := ""
		if u.TelegramUsername != nil {
			tg = *u.TelegramUsername
		}
		procAt := ""
		if r.ProcessedAt != nil {
			procAt = r.ProcessedAt.Format(time.RFC3339)
		}
		rej := ""
		if r.RejectReason != nil {
			rej = *r.RejectReason
		}
		result = append(result, gin.H{
			"id":           r.ID,
			"userId":       r.UserID,
			"digitalId":    digId,
			"telegramUsername": tg,
			"amountUsdt":   r.AmountUsdt,
			"type":         r.Type,
			"details":      r.Details,
			"status":       r.Status,
			"rejectReason": rej,
			"processedAt":  procAt,
			"createdAt":    r.CreatedAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, result)
}

func (h *AdminHandler) ApproveWithdrawalRequest(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid id"})
		return
	}
	adminIDVal, _ := c.Get("adminId")
	adminID, _ := adminIDVal.(int)
	var req models.WithdrawalRequest
	if err := h.DB.Where("id = ?", id).First(&req).Error; err != nil || req.Status != "pending" {
		c.JSON(http.StatusNotFound, gin.H{"message": "Заявка не найдена или уже обработана"})
		return
	}

	// Баланс уже списан при создании заявки, просто меняем статус
	now := time.Now()
	updates := map[string]interface{}{
		"status":      "approved",
		"processedAt": now,
	}
	if adminID != 0 {
		updates["processedByAdminId"] = adminID
	}
	h.DB.Model(&req).Updates(updates)
	// Комиссия вывода на карту/СБП — часть начисляем рефералу (его % от суммы вывода).
	if (req.Type == "card" || req.Type == "sbp") && req.AmountUsdt != "" {
		amountF, _ := strconv.ParseFloat(req.AmountUsdt, 64)
		var payer models.User
		if err := h.DB.Where("id = ?", req.UserID).First(&payer).Error; err == nil && payer.ReferrerID != nil && *payer.ReferrerID != "" {
			var referrer models.User
			if err := h.DB.Where("id = ?", *payer.ReferrerID).First(&referrer).Error; err == nil {
				pc := getReferralPercent(referrer)
				if pc > 0 && amountF > 0 {
					refAmount := amountF * (pc / 100)
					refAmountStr := fmt.Sprintf("%.8f", refAmount)
					var refBal models.Balance
					if err := h.DB.Where("userId = ? AND symbol = ?", referrer.ID, "REF_USDT").First(&refBal).Error; err != nil {
						h.DB.Create(&models.Balance{UserID: referrer.ID, Symbol: "REF_USDT", Amount: "0"})
						h.DB.Where("userId = ? AND symbol = ?", referrer.ID, "REF_USDT").First(&refBal)
					}
					if refBal.ID != 0 {
						h.DB.Exec("UPDATE balances SET amount = amount + ? WHERE id = ?", refAmountStr, refBal.ID)
						refRefID := "withdraw_commission:" + idStr
						rateStr := getUsdtRubRateFromDB(h.DB)
						h.DB.Create(&models.Transaction{
							UserID: referrer.ID, Symbol: "REF_USDT", Amount: refAmountStr, Type: "referral_commission",
							RefID: &refRefID, RateUsdtRub: rateStr, CreatedAt: now,
						})
					}
				}
			}
		}
	}
	wt := req.Type
	if wt == "card" {
		wt = "карту"
	} else if wt == "sbp" {
		wt = "СБП"
	} else {
		wt = "кошелёк"
	}
	if h.Notifier != nil {
		msg := "Вывод выполнен.\n\n" + req.AmountUsdt + " USDT отправлено на " + wt + "."
		h.Notifier.NotifyToUserWithdraw(req.UserID, msg)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) RejectWithdrawalRequest(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid id"})
		return
	}
	adminIDVal, _ := c.Get("adminId")
	adminID, _ := adminIDVal.(int)
	var req models.WithdrawalRequest
	if err := h.DB.Where("id = ? AND status = ?", id, "pending").First(&req).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Заявка не найдена или уже обработана"})
		return
	}
	var body struct {
		Reason string `json:"reason"`
	}
	_ = c.ShouldBindJSON(&body)
	reason := strings.TrimSpace(body.Reason)
	if len(reason) > 500 {
		reason = reason[:500]
	}
	now := time.Now()

	// Возвращаем деньги на баланс (они были списаны при создании заявки)
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		// Обновляем статус заявки
		updates := map[string]interface{}{
			"status":       "rejected",
			"rejectReason": reason,
			"processedAt":  now,
		}
		if adminID != 0 {
			updates["processedByAdminId"] = adminID
		}
		if err := tx.Model(&req).Updates(updates).Error; err != nil {
			return err
		}

		// Возвращаем баланс
		var b models.Balance
		if err := tx.Where("userId = ? AND symbol = ?", req.UserID, "USDT").First(&b).Error; err != nil {
			return err
		}
		tx.Exec("UPDATE balances SET amount = amount + ? WHERE id = ?", req.AmountUsdt, b.ID)

		// Создаём транзакцию возврата
		refID := "withdrawal_refund:" + idStr
		rateStr := getUsdtRubRateFromDB(tx)
		tx.Create(&models.Transaction{
			UserID:      req.UserID,
			Symbol:      "USDT",
			Amount:      req.AmountUsdt,
			Type:        "withdrawal_refund",
			RefID:       &refID,
			RateUsdtRub: rateStr,
			CreatedAt:   now,
		})

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка при отклонении"})
		return
	}

	// Уведомление пользователю (без кнопки — просто текст)
	if h.Notifier != nil {
		msg := "Заявка на вывод " + req.AmountUsdt + " USDT отклонена. Средства возвращены на баланс."
		if reason != "" {
			msg += "\n\nПричина: " + reason
		}
		h.Notifier.NotifyToUser(req.UserID, "withdraw", msg)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) GetNotificationRules(c *gin.Context) {
	var v string
	h.DB.Table("app_settings").Where("k = ?", notify.AppSettingKey).Select("v").Scan(&v)
	rules := []notify.Rule{}
	if v != "" {
		_ = json.Unmarshal([]byte(v), &rules)
	}
	c.JSON(http.StatusOK, gin.H{"rules": rules})
}

func (h *AdminHandler) SetNotificationRules(c *gin.Context) {
	var body struct {
		Rules []notify.Rule `json:"rules"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "rules required"})
		return
	}
	raw, _ := json.Marshal(body.Rules)
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", notify.AppSettingKey, string(raw))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *AdminHandler) GetNotificationTemplates(c *gin.Context) {
	var v string
	h.DB.Table("app_settings").Where("k = ?", notify.TemplatesKey).Select("v").Scan(&v)
	templates := map[string]string{}
	if v != "" {
		_ = json.Unmarshal([]byte(v), &templates)
	}
	c.JSON(http.StatusOK, gin.H{"templates": templates})
}

func (h *AdminHandler) SetNotificationTemplates(c *gin.Context) {
	var body struct {
		Templates map[string]string `json:"templates"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "templates required"})
		return
	}
	if body.Templates == nil {
		body.Templates = map[string]string{}
	}
	raw, _ := json.Marshal(body.Templates)
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", notify.TemplatesKey, string(raw))
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetUserSeedCheck возвращает 4 случайных слова из seed-фразы пользователя для проверки.
func (h *AdminHandler) GetUserSeedCheck(c *gin.Context) {
	userID := c.Param("userId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "userId required"})
		return
	}
	var u models.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь не найден"})
		return
	}
	if u.SeedEncrypted == nil || *u.SeedEncrypted == "" {
		c.JSON(http.StatusNotFound, gin.H{"message": "У пользователя нет seed-фразы"})
		return
	}
	// Используем тот же ключ что и в auth handler (SeedEncryptionKey или JWT_SECRET)
	key := h.SeedEncryptionKey
	if key == "" {
		key = h.JWTSecret
	}
	// Дешифруем seed через общий пакет
	phrase, err := seed.DecryptSeed(*u.SeedEncrypted, key)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка расшифровки seed"})
		return
	}
	words := strings.Fields(phrase)
	if len(words) < 12 {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Недостаточно слов в seed-фразе"})
		return
	}
	// Выбираем 4 случайных индекса
	indices := make([]int, len(words))
	for i := range indices {
		indices[i] = i
	}
	// Перемешиваем
	for i := len(indices) - 1; i > 0; i-- {
		jBig, _ := rand.Int(rand.Reader, big.NewInt(int64(i+1)))
		j := int(jBig.Int64())
		indices[i], indices[j] = indices[j], indices[i]
	}
	// Берём первые 4, сортируем по возрастанию для удобства
	selected := indices[:4]
	sort.Ints(selected)
	result := make([]gin.H, 4)
	for i, idx := range selected {
		result[i] = gin.H{
			"position": idx + 1, // 1-based
			"word":     words[idx],
		}
	}
	digitalId := ""
	if u.DigitalID != nil {
		digitalId = *u.DigitalID
	}
	tgUsername := ""
	if u.TelegramUsername != nil {
		tgUsername = *u.TelegramUsername
	}
	if adminIDVal, ok := c.Get("adminId"); ok {
		if adminID, _ := adminIDVal.(int); adminID > 0 {
			logAdminAction(h.DB, adminID, userID, "seed_check_requested", "запросил сид-фразу (проверка слов)")
		}
	}
	c.JSON(http.StatusOK, gin.H{
		"userId":           u.ID,
		"digitalId":        digitalId,
		"telegramUsername": tgUsername,
		"words":            result,
	})
}

// GetUserActionLogs возвращает логи действий админов над пользователем.
func (h *AdminHandler) GetUserActionLogs(c *gin.Context) {
	userID := c.Param("userId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "userId required"})
		return
	}
	var logs []models.AdminActionLog
	if err := h.DB.Where("userId = ?", userID).Order("createdAt DESC").Limit(200).Find(&logs).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"list": []interface{}{}})
		return
	}
	list := make([]gin.H, 0, len(logs))
	actionLabels := map[string]string{
		"referral_commission_changed": "Изменён реф. % / партнёр",
		"commission_changed":          "Изменена комиссия",
		"seed_check_requested":        "Запрос сид-фразы",
		"balance_operation":           "Операция с балансом",
	}
	for _, l := range logs {
		label := actionLabels[l.Action]
		if label == "" {
			label = l.Action
		}
		list = append(list, gin.H{
			"id":        l.ID,
			"adminId":   l.AdminID,
			"action":    l.Action,
			"actionLabel": label,
			"details":   l.Details,
			"createdAt": l.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	c.JSON(http.StatusOK, gin.H{"list": list})
}

// GetOperatorStats возвращает статистику оператора за день и всё время.
func (h *AdminHandler) GetOperatorStats(c *gin.Context) {
	adminIDVal, _ := c.Get("adminId")
	adminID, _ := adminIDVal.(int)
	if adminID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Admin ID required"})
		return
	}
	today := time.Now().Truncate(24 * time.Hour)
	// Платежи обработанные оператором
	var paymentsToday, paymentsTotal int64
	h.DB.Model(&models.PendingPayment{}).Where("processedByAdminId = ? AND (confirmedAt >= ? OR rejectedAt >= ?)", adminID, today, today).Count(&paymentsToday)
	h.DB.Model(&models.PendingPayment{}).Where("processedByAdminId = ?", adminID).Count(&paymentsTotal)
	// Выводы обработанные оператором
	var withdrawalsToday, withdrawalsTotal int64
	h.DB.Model(&models.WithdrawalRequest{}).Where("processedByAdminId = ? AND processedAt >= ?", adminID, today).Count(&withdrawalsToday)
	h.DB.Model(&models.WithdrawalRequest{}).Where("processedByAdminId = ?", adminID).Count(&withdrawalsTotal)
	// Сумма USDT по платежам за сегодня
	var sumUsdtToday float64
	h.DB.Model(&models.PendingPayment{}).Where("processedByAdminId = ? AND status = ? AND confirmedAt >= ?", adminID, "confirmed", today).Select("COALESCE(SUM(sumUsdt), 0)").Scan(&sumUsdtToday)
	// Сумма USDT по выводам за сегодня
	var withdrawSumToday float64
	h.DB.Model(&models.WithdrawalRequest{}).Where("processedByAdminId = ? AND status = ? AND processedAt >= ?", adminID, "approved", today).Select("COALESCE(SUM(amountUsdt), 0)").Scan(&withdrawSumToday)
	c.JSON(http.StatusOK, gin.H{
		"paymentsToday":       paymentsToday,
		"paymentsTotal":       paymentsTotal,
		"withdrawalsToday":    withdrawalsToday,
		"withdrawalsTotal":    withdrawalsTotal,
		"paymentsSumUsdtToday": sumUsdtToday,
		"withdrawalsSumUsdtToday": withdrawSumToday,
	})
}

// GetAdminDashboardStats возвращает общую статистику для главного администратора.
func (h *AdminHandler) GetAdminDashboardStats(c *gin.Context) {
	today := time.Now().Truncate(24 * time.Hour)
	// Общая статистика
	var usersCount, usersToday int64
	h.DB.Model(&models.User{}).Count(&usersCount)
	h.DB.Model(&models.User{}).Where("createdAt >= ?", today).Count(&usersToday)
	// Платежи
	var pendingPayments, confirmedPaymentsToday, confirmedPaymentsTotal int64
	h.DB.Model(&models.PendingPayment{}).Where("status = ?", "pending").Count(&pendingPayments)
	h.DB.Model(&models.PendingPayment{}).Where("status = ? AND confirmedAt >= ?", "confirmed", today).Count(&confirmedPaymentsToday)
	h.DB.Model(&models.PendingPayment{}).Where("status = ?", "confirmed").Count(&confirmedPaymentsTotal)
	// Оборот платежей за сегодня
	var paymentsSumToday, paymentsSumTotal float64
	h.DB.Model(&models.PendingPayment{}).Where("status = ? AND confirmedAt >= ?", "confirmed", today).Select("COALESCE(SUM(sumUsdt), 0)").Scan(&paymentsSumToday)
	h.DB.Model(&models.PendingPayment{}).Where("status = ?", "confirmed").Select("COALESCE(SUM(sumUsdt), 0)").Scan(&paymentsSumTotal)
	// Выводы
	var pendingWithdrawals, approvedWithdrawalsToday, approvedWithdrawalsTotal int64
	h.DB.Model(&models.WithdrawalRequest{}).Where("status = ?", "pending").Count(&pendingWithdrawals)
	h.DB.Model(&models.WithdrawalRequest{}).Where("status = ? AND processedAt >= ?", "approved", today).Count(&approvedWithdrawalsToday)
	h.DB.Model(&models.WithdrawalRequest{}).Where("status = ?", "approved").Count(&approvedWithdrawalsTotal)
	// Сумма выводов
	var withdrawalsSumToday, withdrawalsSumTotal float64
	h.DB.Model(&models.WithdrawalRequest{}).Where("status = ? AND processedAt >= ?", "approved", today).Select("COALESCE(SUM(amountUsdt), 0)").Scan(&withdrawalsSumToday)
	h.DB.Model(&models.WithdrawalRequest{}).Where("status = ?", "approved").Select("COALESCE(SUM(amountUsdt), 0)").Scan(&withdrawalsSumTotal)
	// Статистика по операторам за сегодня
	type OperatorStat struct {
		AdminID  int
		Login    string
		Payments int64
		Withdrawals int64
	}
	var operatorStats []OperatorStat
	// Платежи по операторам за сегодня
	rows, _ := h.DB.Raw(`
		SELECT p.processedByAdminId as admin_id, a.login, COUNT(*) as payments 
		FROM pending_payments p 
		LEFT JOIN admin_users a ON p.processedByAdminId = a.id 
		WHERE p.processedByAdminId IS NOT NULL AND (p.confirmedAt >= ? OR p.rejectedAt >= ?)
		GROUP BY p.processedByAdminId, a.login
	`, today, today).Rows()
	if rows != nil {
		defer rows.Close()
		for rows.Next() {
			var stat OperatorStat
			var login *string
			rows.Scan(&stat.AdminID, &login, &stat.Payments)
			if login != nil {
				stat.Login = *login
			}
			operatorStats = append(operatorStats, stat)
		}
	}
	// Выводы по операторам за сегодня
	rows2, _ := h.DB.Raw(`
		SELECT w.processedByAdminId as admin_id, a.login, COUNT(*) as withdrawals 
		FROM withdrawal_requests w 
		LEFT JOIN admin_users a ON w.processedByAdminId = a.id 
		WHERE w.processedByAdminId IS NOT NULL AND w.processedAt >= ?
		GROUP BY w.processedByAdminId, a.login
	`, today).Rows()
	if rows2 != nil {
		defer rows2.Close()
		opMap := make(map[int]*OperatorStat)
		for i := range operatorStats {
			opMap[operatorStats[i].AdminID] = &operatorStats[i]
		}
		for rows2.Next() {
			var adminID int
			var login *string
			var withdrawals int64
			rows2.Scan(&adminID, &login, &withdrawals)
			if stat, ok := opMap[adminID]; ok {
				stat.Withdrawals = withdrawals
			} else {
				loginStr := ""
				if login != nil {
					loginStr = *login
				}
				operatorStats = append(operatorStats, OperatorStat{AdminID: adminID, Login: loginStr, Withdrawals: withdrawals})
			}
		}
	}
	operators := make([]gin.H, 0, len(operatorStats))
	for _, s := range operatorStats {
		operators = append(operators, gin.H{
			"adminId":     s.AdminID,
			"login":       s.Login,
			"payments":    s.Payments,
			"withdrawals": s.Withdrawals,
		})
	}
	c.JSON(http.StatusOK, gin.H{
		"usersCount":                usersCount,
		"usersToday":                usersToday,
		"pendingPayments":           pendingPayments,
		"confirmedPaymentsToday":    confirmedPaymentsToday,
		"confirmedPaymentsTotal":    confirmedPaymentsTotal,
		"paymentsSumUsdtToday":      paymentsSumToday,
		"paymentsSumUsdtTotal":      paymentsSumTotal,
		"pendingWithdrawals":        pendingWithdrawals,
		"approvedWithdrawalsToday":  approvedWithdrawalsToday,
		"approvedWithdrawalsTotal":  approvedWithdrawalsTotal,
		"withdrawalsSumUsdtToday":   withdrawalsSumToday,
		"withdrawalsSumUsdtTotal":   withdrawalsSumTotal,
		"operatorsToday":            operators,
	})
}

// GetDetailedStatistics возвращает подробную статистику за последние N дней для графиков.
func (h *AdminHandler) GetDetailedStatistics(c *gin.Context) {
	daysParam := c.DefaultQuery("days", "30")
	days, err := strconv.Atoi(daysParam)
	if err != nil || days < 1 || days > 365 {
		days = 30
	}

	type DayStat struct {
		Date              string  `json:"date"`
		Payments          int64   `json:"payments"`
		PaymentsSum       float64 `json:"paymentsSum"`
		PaymentsRejected  int64   `json:"paymentsRejected"`
		Withdrawals       int64   `json:"withdrawals"`
		WithdrawalsSum    float64 `json:"withdrawalsSum"`
		WithdrawalsRejected int64 `json:"withdrawalsRejected"`
		Commission        float64 `json:"commission"`
		NewUsers          int64   `json:"newUsers"`
	}

	result := make([]DayStat, days)
	today := time.Now().Truncate(24 * time.Hour)

	for i := 0; i < days; i++ {
		day := today.AddDate(0, 0, -i)
		dayEnd := day.Add(24 * time.Hour)
		dateStr := day.Format("2006-01-02")

		var stat DayStat
		stat.Date = dateStr

		h.DB.Model(&models.PendingPayment{}).
			Where("status = ? AND confirmedAt >= ? AND confirmedAt < ?", "confirmed", day, dayEnd).
			Count(&stat.Payments)

		h.DB.Model(&models.PendingPayment{}).
			Where("status = ? AND confirmedAt >= ? AND confirmedAt < ?", "confirmed", day, dayEnd).
			Select("COALESCE(SUM(sumUsdt), 0)").Scan(&stat.PaymentsSum)

		h.DB.Model(&models.PendingPayment{}).
			Where("status = ? AND rejectedAt >= ? AND rejectedAt < ?", "rejected", day, dayEnd).
			Count(&stat.PaymentsRejected)

		h.DB.Model(&models.WithdrawalRequest{}).
			Where("status = ? AND processedAt >= ? AND processedAt < ?", "approved", day, dayEnd).
			Count(&stat.Withdrawals)

		h.DB.Model(&models.WithdrawalRequest{}).
			Where("status = ? AND processedAt >= ? AND processedAt < ?", "approved", day, dayEnd).
			Select("COALESCE(SUM(amountUsdt), 0)").Scan(&stat.WithdrawalsSum)

		h.DB.Model(&models.WithdrawalRequest{}).
			Where("status = ? AND processedAt >= ? AND processedAt < ?", "rejected", day, dayEnd).
			Count(&stat.WithdrawalsRejected)

		h.DB.Model(&models.PendingPayment{}).
			Where("status = ? AND confirmedAt >= ? AND confirmedAt < ?", "confirmed", day, dayEnd).
			Select("COALESCE(SUM(sumUsdt * commissionPercent / 100), 0)").Scan(&stat.Commission)

		h.DB.Model(&models.User{}).
			Where("createdAt >= ? AND createdAt < ?", day, dayEnd).
			Count(&stat.NewUsers)

		result[days-1-i] = stat
	}

	var totalPaymentsSum, totalWithdrawalsSum, totalCommission float64
	var totalPayments, totalWithdrawals int64
	for _, s := range result {
		totalPayments += s.Payments
		totalPaymentsSum += s.PaymentsSum
		totalWithdrawals += s.Withdrawals
		totalWithdrawalsSum += s.WithdrawalsSum
		totalCommission += s.Commission
	}

	c.JSON(http.StatusOK, gin.H{
		"days":                 result,
		"totalPayments":        totalPayments,
		"totalPaymentsSum":     totalPaymentsSum,
		"totalWithdrawals":     totalWithdrawals,
		"totalWithdrawalsSum":  totalWithdrawalsSum,
		"totalCommission":      totalCommission,
	})
}

// GetOperatorCalendarStats возвращает календарную статистику оператора за месяц.
func (h *AdminHandler) GetOperatorCalendarStats(c *gin.Context) {
	adminID := c.GetInt("adminId")
	
	monthParam := c.DefaultQuery("month", time.Now().Format("2006-01"))
	t, err := time.Parse("2006-01", monthParam)
	if err != nil {
		t = time.Now()
	}
	
	firstDay := time.Date(t.Year(), t.Month(), 1, 0, 0, 0, 0, time.UTC)
	lastDay := firstDay.AddDate(0, 1, 0)
	daysInMonth := lastDay.Add(-24 * time.Hour).Day()

	type DayCalStat struct {
		Day      int   `json:"day"`
		Payments int64 `json:"payments"`
		Withdrawals int64 `json:"withdrawals"`
	}

	result := make([]DayCalStat, daysInMonth)
	for i := 0; i < daysInMonth; i++ {
		result[i].Day = i + 1
	}

	paymentsRows, _ := h.DB.Raw(`
		SELECT DAY(COALESCE(confirmedAt, rejectedAt)) as d, COUNT(*) as cnt 
		FROM pending_payments 
		WHERE processedByAdminId = ? 
		  AND (confirmedAt >= ? OR rejectedAt >= ?) 
		  AND (confirmedAt < ? OR rejectedAt < ?)
		GROUP BY d
	`, adminID, firstDay, firstDay, lastDay, lastDay).Rows()
	if paymentsRows != nil {
		defer paymentsRows.Close()
		for paymentsRows.Next() {
			var d int
			var cnt int64
			paymentsRows.Scan(&d, &cnt)
			if d >= 1 && d <= daysInMonth {
				result[d-1].Payments = cnt
			}
		}
	}

	withdrawalsRows, _ := h.DB.Raw(`
		SELECT DAY(processedAt) as d, COUNT(*) as cnt 
		FROM withdrawal_requests 
		WHERE processedByAdminId = ? AND processedAt >= ? AND processedAt < ?
		GROUP BY d
	`, adminID, firstDay, lastDay).Rows()
	if withdrawalsRows != nil {
		defer withdrawalsRows.Close()
		for withdrawalsRows.Next() {
			var d int
			var cnt int64
			withdrawalsRows.Scan(&d, &cnt)
			if d >= 1 && d <= daysInMonth {
				result[d-1].Withdrawals = cnt
			}
		}
	}

	var totalPayments, totalWithdrawals int64
	for _, s := range result {
		totalPayments += s.Payments
		totalWithdrawals += s.Withdrawals
	}

	c.JSON(http.StatusOK, gin.H{
		"month":            monthParam,
		"daysInMonth":      daysInMonth,
		"days":             result,
		"totalPayments":    totalPayments,
		"totalWithdrawals": totalWithdrawals,
	})
}

// GetUnidentifiedDeposits возвращает неидентифицированные депозиты
func (h *AdminHandler) GetUnidentifiedDeposits(c *gin.Context) {
	var deposits []models.UnidentifiedDeposit
	h.DB.Where("status = 'pending'").Order("createdAt DESC").Find(&deposits)

	result := make([]gin.H, 0, len(deposits))
	for _, d := range deposits {
		item := gin.H{
			"id":        d.ID,
			"txId":      d.TxID,
			"amount":    d.Amount,
			"fromAddr":  d.FromAddr,
			"status":    d.Status,
			"createdAt": d.CreatedAt.Format(time.RFC3339),
		}
		result = append(result, item)
	}

	c.JSON(http.StatusOK, gin.H{"deposits": result})
}

// AssignUnidentifiedDeposit присваивает неидентифицированный депозит пользователю
func (h *AdminHandler) AssignUnidentifiedDeposit(c *gin.Context) {
	idStr := c.Param("id")
	depositID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid deposit ID"})
		return
	}

	var body struct {
		UserID string `json:"userId" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "userId required"})
		return
	}

	// Проверяем депозит
	var deposit models.UnidentifiedDeposit
	if err := h.DB.First(&deposit, depositID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Депозит не найден"})
		return
	}

	if deposit.Status != "pending" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Депозит уже обработан"})
		return
	}

	// Проверяем пользователя: по UUID или по Digital ID (4–7 знаков)
	userIDInput := strings.TrimSpace(body.UserID)
	if userIDInput == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Укажите User ID или Digital ID"})
		return
	}
	var user models.User
	if strings.Contains(userIDInput, "-") && len(userIDInput) == 36 {
		if err := h.DB.Where("id = ?", userIDInput).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь не найден"})
			return
		}
	} else {
		if err := h.DB.Where("digitalId = ?", userIDInput).First(&user).Error; err != nil {
			c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь с таким Digital ID не найден"})
			return
		}
	}
	body.UserID = user.ID

	amountUsdt, _ := strconv.ParseFloat(deposit.Amount, 64)
	if amountUsdt <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Некорректная сумма"})
		return
	}

	// Зачисляем в транзакции
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		// Обновляем баланс
		var balance models.Balance
		if err := tx.Where("userId = ? AND symbol = ?", body.UserID, "USDT").First(&balance).Error; err != nil {
			balance = models.Balance{
				UserID: body.UserID,
				Symbol: "USDT",
				Amount: "0",
			}
			tx.Create(&balance)
		}

		currentBalance, _ := strconv.ParseFloat(balance.Amount, 64)
		newBalance := currentBalance + amountUsdt
		if err := tx.Model(&balance).Update("amount", strconv.FormatFloat(newBalance, 'f', 8, 64)).Error; err != nil {
			return err
		}

		// Создаём транзакцию
		refID := "trc20_deposit:" + deposit.TxID
		var setting models.AppSetting
		rate := "0"
		if err := tx.Where("k = ?", "usdt_rub").First(&setting).Error; err == nil {
			rate = setting.V
		}

		transaction := models.Transaction{
			UserID:      body.UserID,
			Type:        "deposit",
			Amount:      deposit.Amount,
			Symbol:      "USDT",
			RefID:       &refID,
			RateUsdtRub: rate,
			CreatedAt:   time.Now(),
		}
		if err := tx.Create(&transaction).Error; err != nil {
			return err
		}

		// Обновляем депозит
		now := time.Now()
		return tx.Model(&deposit).Updates(map[string]interface{}{
			"status":           "assigned",
			"assignedToUserId": body.UserID,
			"processedAt":      now,
		}).Error
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка зачисления: " + err.Error()})
		return
	}

	// Уведомление (присвоение депозита — без ссылки на Tronscan)
	if h.Notifier != nil {
		var setting models.AppSetting
		rate := "0"
		if err := h.DB.Where("k = ?", "usdt_rub").First(&setting).Error; err == nil {
			rate = setting.V
		}
		amountF, _ := strconv.ParseFloat(deposit.Amount, 64)
		rateF, _ := strconv.ParseFloat(rate, 64)
		amountRubStr := strconv.FormatFloat(amountF*rateF, 'f', 2, 64)
		h.Notifier.NotifyToUserDeposit(body.UserID, deposit.Amount, amountRubStr, "")
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "Депозит зачислен пользователю"})
}

// RejectUnidentifiedDeposit отклоняет неидентифицированный депозит
func (h *AdminHandler) RejectUnidentifiedDeposit(c *gin.Context) {
	idStr := c.Param("id")
	depositID, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid deposit ID"})
		return
	}

	now := time.Now()
	if err := h.DB.Model(&models.UnidentifiedDeposit{}).Where("id = ?", depositID).Updates(map[string]interface{}{
		"status":      "rejected",
		"processedAt": now,
	}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка: " + err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetDepositSettings возвращает настройки депозита
func (h *AdminHandler) GetDepositSettings(c *gin.Context) {
	masterWallet := getAppSettingFromDB(h.DB, "master_deposit_wallet", "")

	c.JSON(http.StatusOK, gin.H{
		"masterDepositWallet": masterWallet,
	})
}

// SetDepositSettings обновляет настройки депозита
func (h *AdminHandler) SetDepositSettings(c *gin.Context) {
	var body struct {
		MasterDepositWallet string `json:"masterDepositWallet"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid body"})
		return
	}

	wallet := strings.TrimSpace(body.MasterDepositWallet)
	if err := h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v",
		"master_deposit_wallet", wallet).Error; err != nil {
		log.Printf("[SetDepositSettings] DB error: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка сохранения в БД"})
		return
	}

	log.Printf("[SetDepositSettings] Saved master_deposit_wallet: %s", wallet)
	c.JSON(http.StatusOK, gin.H{
		"masterDepositWallet": wallet,
	})
}

// GetWalletTransactions возвращает последние транзакции мастер-кошелька
func (h *AdminHandler) GetWalletTransactions(c *gin.Context) {
	masterWallet := getAppSettingFromDB(h.DB, "master_deposit_wallet", "")
	if masterWallet == "" {
		c.JSON(http.StatusOK, gin.H{"transactions": []gin.H{}})
		return
	}

	if h.TronGrid == nil {
		c.JSON(http.StatusOK, gin.H{"transactions": []gin.H{}})
		return
	}

	// Получаем транзакции за последние 7 дней
	minTimestamp := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
	transfers, err := h.TronGrid.GetTRC20Transfers(c.Request.Context(), masterWallet, minTimestamp)
	if err != nil {
		log.Printf("[GetWalletTransactions] Error getting transfers: %v", err)
		c.JSON(http.StatusOK, gin.H{"transactions": []gin.H{}})
		return
	}

	// Получаем все зачисленные транзакции
	processedTxIds := make(map[string]struct {
		UserID    string
		DigitalID string
	})
	var processedTxs []models.Transaction
	h.DB.Where("refId LIKE ?", "trc20_deposit:%").Order("createdAt DESC").Limit(500).Find(&processedTxs)

	for _, tx := range processedTxs {
		if tx.RefID != nil {
			txID := strings.TrimPrefix(*tx.RefID, "trc20_deposit:")
			// Получаем пользователя
			var user models.User
			if err := h.DB.Where("id = ?", tx.UserID).First(&user).Error; err == nil {
				digitalID := ""
				if user.DigitalID != nil {
					digitalID = *user.DigitalID
				}
				processedTxIds[txID] = struct {
					UserID    string
					DigitalID string
				}{UserID: tx.UserID, DigitalID: digitalID}
			}
		}
	}

	result := make([]gin.H, 0, len(transfers))
	for _, tx := range transfers {
		valueBig, ok := new(big.Int).SetString(tx.Value, 10)
		if !ok {
			continue
		}
		valueFloat := new(big.Float).SetInt(valueBig)
		valueFloat.Quo(valueFloat, big.NewFloat(1e6))
		amountUsdt, _ := valueFloat.Float64()

		item := gin.H{
			"txId":       tx.TransactionID,
			"amount":     strconv.FormatFloat(amountUsdt, 'f', 8, 64),
			"fromAddr":   tx.From,
			"timestamp":  time.UnixMilli(tx.BlockTimestamp).Format(time.RFC3339),
			"identified": false,
		}

		if info, ok := processedTxIds[tx.TransactionID]; ok {
			item["identified"] = true
			item["userId"] = info.UserID
			item["userDigitalId"] = info.DigitalID
		}

		result = append(result, item)
	}

	c.JSON(http.StatusOK, gin.H{"transactions": result})
}

// CheckWalletDepositsManual запускает ручную проверку депозитов
func (h *AdminHandler) CheckWalletDepositsManual(c *gin.Context) {
	masterWallet := getAppSettingFromDB(h.DB, "master_deposit_wallet", "")
	if masterWallet == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Мастер-кошелёк не настроен"})
		return
	}

	if h.TronGrid == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "TronGrid не настроен"})
		return
	}

	// Получаем транзакции за последние 7 дней (расширенный период для ручной проверки)
	minTimestamp := time.Now().Add(-7 * 24 * time.Hour).UnixMilli()
	transfers, err := h.TronGrid.GetTRC20Transfers(c.Request.Context(), masterWallet, minTimestamp)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка TronGrid: " + err.Error()})
		return
	}

	credited := 0
	unidentified := 0

	for _, tx := range transfers {
		refID := "trc20_deposit:" + tx.TransactionID

		// Проверяем, не обработана ли уже
		var existingTx models.Transaction
		if err := h.DB.Where("refId = ?", refID).First(&existingTx).Error; err == nil {
			continue
		}

		// Проверяем в unidentified
		var existingUnidentified models.UnidentifiedDeposit
		if err := h.DB.Where("txId = ?", tx.TransactionID).First(&existingUnidentified).Error; err == nil {
			continue
		}

		// Конвертируем сумму
		valueBig, ok := new(big.Int).SetString(tx.Value, 10)
		if !ok {
			continue
		}
		valueFloat := new(big.Float).SetInt(valueBig)
		valueFloat.Quo(valueFloat, big.NewFloat(1e6))
		amountUsdt, _ := valueFloat.Float64()

		if amountUsdt <= 0 {
			continue
		}

		// Извлекаем digitalId
		digitalId := extractDigitalIdFromAmount(amountUsdt)
		if digitalId == "" {
			// Сохраняем как unidentified
			deposit := models.UnidentifiedDeposit{
				TxID:      tx.TransactionID,
				Amount:    strconv.FormatFloat(amountUsdt, 'f', 8, 64),
				FromAddr:  tx.From,
				Status:    "pending",
				CreatedAt: time.Now(),
			}
			h.DB.Create(&deposit)
			unidentified++
			continue
		}

		// Ищем пользователя
		var user models.User
		if err := h.DB.Where("digitalId = ?", digitalId).First(&user).Error; err != nil {
			// Пользователь не найден
			deposit := models.UnidentifiedDeposit{
				TxID:      tx.TransactionID,
				Amount:    strconv.FormatFloat(amountUsdt, 'f', 8, 64),
				FromAddr:  tx.From,
				Status:    "pending",
				CreatedAt: time.Now(),
			}
			h.DB.Create(&deposit)
			unidentified++
			continue
		}

		// Зачисляем
		h.DB.Transaction(func(dbTx *gorm.DB) error {
			var balance models.Balance
			if err := dbTx.Where("userId = ? AND symbol = ?", user.ID, "USDT").First(&balance).Error; err != nil {
				balance = models.Balance{
					UserID: user.ID,
					Symbol: "USDT",
					Amount: "0",
				}
				dbTx.Create(&balance)
			}

			currentBalance, _ := strconv.ParseFloat(balance.Amount, 64)
			newBalance := currentBalance + amountUsdt
			dbTx.Model(&balance).Update("amount", strconv.FormatFloat(newBalance, 'f', 8, 64))

			var setting models.AppSetting
			rate := "0"
			if err := dbTx.Where("k = ?", "usdt_rub").First(&setting).Error; err == nil {
				rate = setting.V
			}

			transaction := models.Transaction{
				UserID:      user.ID,
				Type:        "deposit",
				Amount:      strconv.FormatFloat(amountUsdt, 'f', 8, 64),
				Symbol:      "USDT",
				RefID:       &refID,
				RateUsdtRub: rate,
				CreatedAt:   time.Now(),
			}
			dbTx.Create(&transaction)
			return nil
		})

		credited++

		// Уведомление (пополнение с кошелька — ссылка на Tronscan)
		if h.Notifier != nil {
			amountUsdtStr := strconv.FormatFloat(amountUsdt, 'f', 2, 64)
			var rateSetting models.AppSetting
			rateStr := "0"
			if err := h.DB.Where("k = ?", "usdt_rub").First(&rateSetting).Error; err == nil {
				rateStr = rateSetting.V
			}
			rateF, _ := strconv.ParseFloat(rateStr, 64)
			amountRubStr := strconv.FormatFloat(amountUsdt*rateF, 'f', 2, 64)
			tronscanURL := "https://tronscan.org/#/transaction/" + tx.TransactionID
			h.Notifier.NotifyToUserDeposit(user.ID, amountUsdtStr, amountRubStr, tronscanURL)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":           true,
		"credited":     credited,
		"unidentified": unidentified,
	})
}

// extractDigitalIdFromAmount извлекает digitalId из дробной части суммы
// TronGrid возвращает 6 знаков после запятой, берём первые 4 (последние 2 игнорируем)
// Например: 50.123400 -> "1234", 10.567800 -> "5678"
func extractDigitalIdFromAmount(amount float64) string {
	// Форматируем с 6 знаками после запятой (как в TronGrid)
	amountStr := strconv.FormatFloat(amount, 'f', 6, 64)
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

// GetReferralsLeaderboard возвращает список пользователей-рефереров: кто больше привёл и доход (REF_USDT).
func (h *AdminHandler) GetReferralsLeaderboard(c *gin.Context) {
	type row struct {
		UserID      string
		Referrals   int64
		RefBalance  string
		RefPercent  string
		DigitalID   string
		DisplayName string
	}
	var refCounts []struct {
		ReferrerID string
		Cnt        int64
	}
	h.DB.Model(&models.User{}).Select("referrerId AS referrer_id, COUNT(*) AS cnt").Where("referrerId IS NOT NULL AND referrerId != ''").Group("referrerId").Order("cnt DESC").Limit(200).Scan(&refCounts)
	referrerIDs := make([]string, 0, len(refCounts))
	for _, r := range refCounts {
		referrerIDs = append(referrerIDs, r.ReferrerID)
	}
	if len(referrerIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"list": []gin.H{}})
		return
	}
	var users []models.User
	h.DB.Where("id IN ?", referrerIDs).Find(&users)
	userMap := make(map[string]models.User)
	for _, u := range users {
		userMap[u.ID] = u
	}
	countMap := make(map[string]int64)
	for _, r := range refCounts {
		countMap[r.ReferrerID] = r.Cnt
	}
	var balances []models.Balance
	h.DB.Where("userId IN ? AND symbol = ?", referrerIDs, "REF_USDT").Find(&balances)
	balanceMap := make(map[string]string)
	for _, b := range balances {
		balanceMap[b.UserID] = b.Amount
	}
	result := make([]gin.H, 0, len(referrerIDs))
	for _, uid := range referrerIDs {
		u, ok := userMap[uid]
		if !ok {
			continue
		}
		displayName := ""
		if u.TelegramFirstName != nil || u.TelegramLastName != nil {
			f, l := "", ""
			if u.TelegramFirstName != nil {
				f = *u.TelegramFirstName
			}
			if u.TelegramLastName != nil {
				l = *u.TelegramLastName
			}
			displayName = strings.TrimSpace(f + " " + l)
		}
		if displayName == "" && u.TelegramUsername != nil {
			displayName = "@" + *u.TelegramUsername
		}
		if displayName == "" {
			displayName = uid[:8] + "…"
		}
		digitalID := ""
		if u.DigitalID != nil {
			digitalID = *u.DigitalID
		}
		refBal := balanceMap[uid]
		if refBal == "" {
			refBal = "0"
		}
		result = append(result, gin.H{
			"userId":      uid,
			"referralsCount": countMap[uid],
			"referralBalance": refBal,
			"referralCommissionPercent": strings.TrimSpace(u.ReferralCommissionPercent),
			"digitalId":   digitalID,
			"displayName": displayName,
		})
	}
	c.JSON(http.StatusOK, gin.H{"list": result})
}
