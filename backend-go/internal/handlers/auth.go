package handlers

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/url"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"ats-wallet/internal/models"
	"ats-wallet/internal/prometheus"
	"ats-wallet/internal/seed"
)

type AuthHandler struct {
	DB                  *gorm.DB
	JWTSecret           string
	TelegramBotToken    string
	TelegramBotUsername string // для реферальной ссылки t.me/BotUsername?start=ref_USERID
	SeedEncryptionKey   string
}

// getRealIPAuth извлекает реальный IP клиента из заголовков X-Forwarded-For или X-Real-IP.
func getRealIPAuth(c *gin.Context) string {
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
	return c.ClientIP()
}

// generateDigitalID возвращает уникальный 4-значный ID (строка из цифр).
func (h *AuthHandler) generateDigitalID() string {
	for i := 0; i < 50; i++ {
		// 1000..9999 (4 цифры)
		n := 1000 + int(time.Now().UnixNano()%9000)
		if n < 1000 {
			n += 1000
		}
		id := strconv.Itoa(n)
		var exists int64
		h.DB.Model(&models.User{}).Where("digitalId = ?", id).Limit(1).Count(&exists)
		if exists == 0 {
			return id
		}
	}
	return strconv.Itoa(1000 + int(uuid.New().ID()%9000))
}

func (h *AuthHandler) Register(c *gin.Context) {
	var body struct {
		Phone    string `json:"phone"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "phone and password required"})
		return
	}
	userID := uuid.New().String()
	phone := body.Phone
	pass := body.Password
	digitalID := h.generateDigitalID()
	commissionPercent := getDefaultCommissionPercent(h.DB)
	h.DB.Create(&models.User{
		ID:                userID,
		Phone:             &phone,
		Password:          &pass,
		DigitalID:         &digitalID,
		CommissionPercent: commissionPercent,
	})
	h.DB.Create(&[]models.Balance{
		{UserID: userID, Symbol: "USDT", Amount: "0"},
	})
	token, _ := h.issueUserToken(userID, phone, uuid.New().String())
	c.JSON(http.StatusOK, gin.H{"access_token": token})
}

func (h *AuthHandler) Login(c *gin.Context) {
	var body struct {
		Phone    string `json:"phone"`
		Password string `json:"password"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "phone and password required"})
		return
	}
	var u models.User
	if err := h.DB.Where("phone = ?", body.Phone).First(&u).Error; err != nil {
		prometheus.AuthLoginAttemptsTotal.WithLabelValues("phone", "failure").Inc()
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный логин или пароль"})
		return
	}
	if u.Password == nil || *u.Password != body.Password {
		prometheus.AuthLoginAttemptsTotal.WithLabelValues("phone", "failure").Inc()
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Неверный логин или пароль"})
		return
	}
	prometheus.AuthLoginAttemptsTotal.WithLabelValues("phone", "success").Inc()
	phone := ""
	if u.Phone != nil {
		phone = *u.Phone
	}
	jti := uuid.New().String()
	ip := getRealIPAuth(c)
	ua := c.GetHeader("User-Agent")
	h.DB.Create(&models.Session{
		ID: uuid.New().String(), UserID: u.ID, Jti: jti,
		UserAgent: ptrTrim(ua), IP: ptrTrim(ip),
		LastActiveAt: time.Now(), CreatedAt: time.Now(),
	})
	token, _ := h.issueUserToken(u.ID, phone, jti)
	c.JSON(http.StatusOK, gin.H{"access_token": token})
}

// telegramUser из initData.
type telegramUser struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Username     string `json:"username"`
	LanguageCode string `json:"language_code"`
	PhotoURL     string `json:"photo_url"`
}

func (h *AuthHandler) LoginTelegram(c *gin.Context) {
	var body struct {
		InitData   string `json:"initData"`
		StartParam string `json:"startParam"` // из Telegram WebApp (ref_<userId> реферера)
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.InitData == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "initData required"})
		return
	}
	var referrerID *string
	if strings.HasPrefix(body.StartParam, "ref_") {
		rid := strings.TrimPrefix(body.StartParam, "ref_")
		if len(rid) > 0 && len(rid) < 64 {
			referrerID = &rid
		}
	}
	if h.TelegramBotToken == "" {
		prometheus.AuthLoginAttemptsTotal.WithLabelValues("telegram", "failure").Inc()
		c.JSON(http.StatusServiceUnavailable, gin.H{"message": "Telegram login not configured"})
		return
	}
	vals, err := url.ParseQuery(body.InitData)
	if err != nil {
		prometheus.AuthLoginAttemptsTotal.WithLabelValues("telegram", "failure").Inc()
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid initData"})
		return
	}
	hash := vals.Get("hash")
	if hash == "" {
		prometheus.AuthLoginAttemptsTotal.WithLabelValues("telegram", "failure").Inc()
		c.JSON(http.StatusBadRequest, gin.H{"message": "Missing hash"})
		return
	}
	var parts []string
	for k, v := range vals {
		if k == "hash" {
			continue
		}
		parts = append(parts, k+"="+strings.Join(v, ""))
	}
	sort.Strings(parts)
	dataCheckString := strings.Join(parts, "\n")
	// secret_key = HMAC-SHA256("WebAppData", bot_token)
	sh := hmac.New(sha256.New, []byte("WebAppData"))
	sh.Write([]byte(h.TelegramBotToken))
	secretKey := sh.Sum(nil)
	mac := hmac.New(sha256.New, secretKey)
	mac.Write([]byte(dataCheckString))
	expectedHash := hex.EncodeToString(mac.Sum(nil))
	if expectedHash != hash {
		prometheus.AuthLoginAttemptsTotal.WithLabelValues("telegram", "failure").Inc()
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid initData"})
		return
	}
	userStr := vals.Get("user")
	if userStr == "" {
		prometheus.AuthLoginAttemptsTotal.WithLabelValues("telegram", "failure").Inc()
		c.JSON(http.StatusBadRequest, gin.H{"message": "Missing user in initData"})
		return
	}
	var tgUser telegramUser
	if err := json.Unmarshal([]byte(userStr), &tgUser); err != nil {
		prometheus.AuthLoginAttemptsTotal.WithLabelValues("telegram", "failure").Inc()
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid user data"})
		return
	}
	tgIDStr := strconv.FormatInt(tgUser.ID, 10)
	var u models.User
	isNewUser := false
	err = h.DB.Where("telegramId = ?", tgIDStr).First(&u).Error
	if err != nil {
		isNewUser = true
		digitalID := h.generateDigitalID()
		commissionPercent := getDefaultCommissionPercent(h.DB)
		u = models.User{
			ID:                         uuid.New().String(),
			TelegramID:                 &tgIDStr,
			TelegramUsername:           ptrTrim(tgUser.Username),
			TelegramFirstName:          ptrTrim(tgUser.FirstName),
			TelegramLastName:           ptrTrim(tgUser.LastName),
			TelegramPhotoURL:           ptrTrim(tgUser.PhotoURL),
			DigitalID:                  &digitalID,
			CommissionPercent:          commissionPercent,
			ReferrerID:                 referrerID,
			IsPartner:                  true,
			ReferralCommissionPercent:  "0.50",
			CreatedAt:                  time.Now(),
		}
		h.DB.Create(&u)
		h.DB.Create(&[]models.Balance{
			{UserID: u.ID, Symbol: "USDT", Amount: "0"},
		})
	} else {
		upd := map[string]interface{}{}
		if tgUser.Username != "" {
			upd["telegramUsername"] = tgUser.Username
		}
		if tgUser.FirstName != "" {
			upd["telegramFirstName"] = tgUser.FirstName
		}
		if tgUser.LastName != "" {
			upd["telegramLastName"] = tgUser.LastName
		}
		if tgUser.PhotoURL != "" {
			upd["telegramPhotoUrl"] = tgUser.PhotoURL
		}
		// Установить реферера только если ещё не задан и передан startParam
		if u.ReferrerID == nil && referrerID != nil {
			var refUser models.User
			if h.DB.Where("id = ?", *referrerID).First(&refUser).Error == nil {
				upd["referrerId"] = *referrerID
			}
		}
		if len(upd) > 0 {
			h.DB.Model(&u).Updates(upd)
		}
	}
	phone := ""
	if u.Phone != nil {
		phone = *u.Phone
	}
	jti := uuid.New().String()
	ip := getRealIPAuth(c)
	ua := c.GetHeader("User-Agent")
	h.DB.Create(&models.Session{
		ID: uuid.New().String(), UserID: u.ID, Jti: jti,
		UserAgent: ptrTrim(ua), IP: ptrTrim(ip),
		LastActiveAt: time.Now(), CreatedAt: time.Now(),
	})
	token, _ := h.issueUserToken(u.ID, phone, jti)
	prometheus.AuthLoginAttemptsTotal.WithLabelValues("telegram", "success").Inc()
	c.JSON(http.StatusOK, gin.H{"access_token": token, "isNewUser": isNewUser})
}

// AttachReferrer привязывает реферера к текущему пользователю по startParam (ref_<userId>).
// Вызывается, когда пользователь уже залогинен и открыл приложение по реферальной ссылке.
func (h *AuthHandler) AttachReferrer(c *gin.Context) {
	userID, _ := c.Get("userId")
	uid, _ := userID.(string)
	var body struct {
		StartParam string `json:"startParam"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.StartParam == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "startParam required"})
		return
	}
	if !strings.HasPrefix(body.StartParam, "ref_") {
		c.JSON(http.StatusOK, gin.H{"ok": true, "attached": false})
		return
	}
	referrerID := strings.TrimPrefix(body.StartParam, "ref_")
	if len(referrerID) == 0 || len(referrerID) > 63 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid startParam"})
		return
	}
	var u models.User
	if err := h.DB.Where("id = ?", uid).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}
	if u.ReferrerID != nil && *u.ReferrerID != "" {
		c.JSON(http.StatusOK, gin.H{"ok": true, "attached": false, "message": "Реферер уже указан"})
		return
	}
	var referrer models.User
	if err := h.DB.Where("id = ?", referrerID).First(&referrer).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"ok": true, "attached": false, "message": "Реферер не найден"})
		return
	}
	h.DB.Model(&u).Update("referrerId", referrerID)
	c.JSON(http.StatusOK, gin.H{"ok": true, "attached": true})
}

// describeDevice возвращает понятное описание устройства по User-Agent и deviceType.
func describeDevice(ua, deviceType string) string {
	if deviceType != "" {
		return deviceType
	}
	if ua == "" {
		return "Устройство"
	}
	ua = strings.ToLower(ua)
	var browser, os string
	if strings.Contains(ua, "edg/") {
		browser = "Edge"
	} else if strings.Contains(ua, "opr/") || strings.Contains(ua, "opera") {
		browser = "Opera"
	} else if strings.Contains(ua, "chrome") {
		browser = "Chrome"
	} else if strings.Contains(ua, "safari") && !strings.Contains(ua, "chrome") {
		browser = "Safari"
	} else if strings.Contains(ua, "firefox") {
		browser = "Firefox"
	}
	if strings.Contains(ua, "windows") {
		os = "Windows"
	} else if strings.Contains(ua, "iphone") || strings.Contains(ua, "ipad") {
		if strings.Contains(ua, "ipad") {
			os = "iPad"
		} else {
			os = "iPhone"
		}
	} else if strings.Contains(ua, "android") {
		os = "Android"
	} else if strings.Contains(ua, "mac os") || strings.Contains(ua, "macintosh") {
		os = "Mac"
	} else if strings.Contains(ua, "linux") {
		os = "Linux"
	}
	if browser != "" && os != "" {
		return browser + ", " + os
	}
	if browser != "" {
		return browser
	}
	if os != "" {
		return os
	}
	if strings.Contains(ua, "mobile") {
		return "Мобильное устройство"
	}
	return "Компьютер"
}

func ptrTrim(s string) *string {
	if s == "" {
		return nil
	}
	t := strings.TrimSpace(s)
	return &t
}

func (h *AuthHandler) Me(c *gin.Context) {
	userID, _ := c.Get("userId")
	var u models.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}
	phone := ""
	if u.Phone != nil {
		phone = *u.Phone
	}
	tgId := ""
	if u.TelegramID != nil {
		tgId = *u.TelegramID
	}
	tgUsername := ""
	if u.TelegramUsername != nil {
		tgUsername = *u.TelegramUsername
	}
	tgFirstName := ""
	if u.TelegramFirstName != nil {
		tgFirstName = *u.TelegramFirstName
	}
	tgLastName := ""
	if u.TelegramLastName != nil {
		tgLastName = *u.TelegramLastName
	}
	tgPhoto := ""
	if u.TelegramPhotoURL != nil {
		tgPhoto = *u.TelegramPhotoURL
	}
	digitalId := ""
	if u.DigitalID != nil {
		digitalId = *u.DigitalID
	}
	seedSeen := u.SeedSeenAt != nil
	resp := gin.H{
		"id":                 u.ID,
		"phone":              phone,
		"telegramId":         tgId,
		"telegramUsername":   tgUsername,
		"telegramFirstName":  tgFirstName,
		"telegramLastName":   tgLastName,
		"telegramPhotoUrl":   tgPhoto,
		"digitalId":          digitalId,
		"commissionPercent":  u.CommissionPercent,
		"seedSeen":           seedSeen,
	}
	// Реферальная программа: данные для всех (по умолчанию 0.5%)
	resp["isPartner"] = u.IsPartner
	refPct := strings.TrimSpace(u.ReferralCommissionPercent)
	if refPct == "" || refPct == "0" {
		refPct = "0.5"
	}
	resp["referralCommissionPercent"] = refPct
	var refBalance string
	h.DB.Model(&models.Balance{}).Where("userId = ? AND symbol = ?", u.ID, "REF_USDT").Select("amount").Scan(&refBalance)
	if refBalance == "" {
		refBalance = "0"
	}
	var referralCount int64
	h.DB.Model(&models.User{}).Where("referrerId = ?", u.ID).Count(&referralCount)
	botUsername := h.TelegramBotUsername
	if botUsername == "" {
		var v string
		h.DB.Table("app_settings").Where("k = ?", "telegram_bot_username").Select("v").Scan(&v)
		botUsername = strings.TrimSpace(v)
	}
	botLink := ""
	if botUsername != "" {
		botLink = "https://t.me/" + botUsername + "?start=ref_" + u.ID
	}
	resp["referralBalance"] = refBalance
	resp["referralCount"] = referralCount
	resp["botReferralLink"] = botLink
	c.JSON(http.StatusOK, resp)
}

// GetSeed возвращает seed-фразу только если пользователь ещё не подтвердил просмотр (SeedSeenAt == nil).
// При первом запросе генерирует и сохраняет зашифрованную фразу.
func (h *AuthHandler) GetSeed(c *gin.Context) {
	userID, _ := c.Get("userId")
	var u models.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}
	if u.SeedSeenAt != nil {
		c.JSON(http.StatusForbidden, gin.H{"message": "seed_already_seen", "seedSeen": true})
		return
	}
	key := h.SeedEncryptionKey
	if key == "" {
		key = h.JWTSecret
	}
	var plain string
	if u.SeedEncrypted == nil || *u.SeedEncrypted == "" {
		generated, err := seed.Generate12()
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to generate seed"})
			return
		}
		enc, err := seed.EncryptSeed(generated, key)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to encrypt seed"})
			return
		}
		u.SeedEncrypted = &enc
		if err := h.DB.Model(&u).Update("seedEncrypted", enc).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to save seed"})
			return
		}
		plain = generated
	} else {
		var err error
		plain, err = seed.DecryptSeed(*u.SeedEncrypted, key)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to decrypt seed"})
			return
		}
	}
	words := strings.Split(plain, " ")
	c.JSON(http.StatusOK, gin.H{"words": words, "phrase": plain})
}

// ConfirmSeedSeen отмечает, что пользователь сохранил seed (больше не показываем и не возвращаем фразу).
func (h *AuthHandler) ConfirmSeedSeen(c *gin.Context) {
	userID, _ := c.Get("userId")
	now := time.Now()
	res := h.DB.Model(&models.User{}).Where("id = ?", userID).Update("seedSeenAt", now)
	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update"})
		return
	}
	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func getDefaultCommissionPercent(db *gorm.DB) string {
	var v string
	db.Table("app_settings").Where("k = ?", "default_commission_percent").Select("v").Scan(&v)
	if v == "" {
		return "5"
	}
	return v
}

func (h *AuthHandler) issueUserToken(userID, phone, jti string) (string, error) {
	claims := jwt.MapClaims{
		"sub":   userID,
		"phone": phone,
		"jti":   jti,
		"iat":   time.Now().Unix(),
		"exp":   time.Now().Add(7 * 24 * time.Hour).Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(h.JWTSecret))
}

// GetUserSessions возвращает список сессий пользователя. current: true у сессии, совпадающей с JWT.
func (h *AuthHandler) GetUserSessions(c *gin.Context) {
	userID, _ := c.Get("userId")
	jtiVal, _ := c.Get("jti")
	currentJti, _ := jtiVal.(string)
	var list []models.Session
	h.DB.Where("userId = ?", userID).Order("lastActiveAt DESC").Find(&list)
	result := make([]gin.H, 0, len(list))
	for _, s := range list {
		ua := ""
		if s.UserAgent != nil {
			ua = *s.UserAgent
		}
		deviceType := ""
		if s.DeviceType != nil {
			deviceType = *s.DeviceType
		}
		ip := ""
		if s.IP != nil {
			ip = *s.IP
		}
		device := describeDevice(ua, deviceType)
		result = append(result, gin.H{
			"id":         s.ID,
			"jti":        s.Jti,
			"device":     device,
			"ip":         ip,
			"current":    s.Jti == currentJti,
			"lastActive": s.LastActiveAt.Format(time.RFC3339),
			"createdAt":  s.CreatedAt.Format(time.RFC3339),
			"userAgent":  ua,
			"deviceType": deviceType,
		})
	}
	c.JSON(http.StatusOK, result)
}

// RevokeUserSessions завершает выбранные сессии (нельзя завершить текущую).
func (h *AuthHandler) RevokeUserSessions(c *gin.Context) {
	userID, _ := c.Get("userId")
	jtiVal, _ := c.Get("jti")
	currentJti, _ := jtiVal.(string)
	var body struct {
		SessionIDs []string `json:"sessionIds"` // фронт отправляет sessionIds
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "sessionIds required"})
		return
	}
	if len(body.SessionIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	for _, id := range body.SessionIDs {
		var s models.Session
		if err := h.DB.Where("id = ? AND userId = ?", id, userID).First(&s).Error; err != nil {
			continue
		}
		if s.Jti == currentJti {
			continue
		}
		h.DB.Delete(&s)
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}
