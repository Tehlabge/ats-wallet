package handlers

import (
	"net/http"
	"strconv"
	"strings"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"ats-wallet/internal/models"
)

type ScanHandler struct {
	DB       *gorm.DB
	Notifier interface{ Notify(event, userID, message string) }
}

// parseSBPPayload извлекает sum (копейки) и cur из строки SBP (URL или текст).
// Поддерживает форматы:
// - СБП с sum= (копейки): https://qr.nspk.ru/...?sum=72000 -> 720.00 руб
// - platiqr.ru с amount= (рубли): https://platiqr.ru/?...&amount=720.00 -> 720.00 руб
func parseSBPPayload(payload string) (sumKopeks int, cur string, valid bool) {
	payload = strings.TrimSpace(payload)
	// Убираем переносы строк, как при сканировании QR
	payload = strings.ReplaceAll(payload, "\r\n", "")
	payload = strings.ReplaceAll(payload, "\n", "")
	payload = strings.ReplaceAll(payload, "\r", "")
	if payload == "" {
		return 0, "", false
	}
	cur = "RUB"
	lower := strings.ToLower(payload)

	// Формат platiqr.ru: amount= в рублях (например amount=720.00)
	if strings.Contains(lower, "platiqr.ru") {
		if i := strings.Index(lower, "amount="); i >= 0 {
			end := i + 7
			// Читаем число с возможной точкой (720.00)
			for end < len(payload) && (payload[end] >= '0' && payload[end] <= '9' || payload[end] == '.') {
				end++
			}
			amountStr := payload[i+7 : end]
			if v, err := strconv.ParseFloat(amountStr, 64); err == nil && v > 0 {
				sumKopeks = int(v * 100)
				valid = true
			}
		}
		return sumKopeks, cur, valid
	}

	// Стандартный формат СБП: sum= в копейках
	if i := strings.Index(lower, "sum="); i >= 0 {
		end := i + 4
		for end < len(payload) && payload[end] >= '0' && payload[end] <= '9' {
			end++
		}
		if v, err := strconv.Atoi(payload[i+4 : end]); err == nil && v >= 0 {
			sumKopeks = v
			valid = true
		}
	}
	if i := strings.Index(lower, "cur="); i >= 0 {
		end := i + 4
		for end < len(payload) && (payload[end] >= 'A' && payload[end] <= 'Z' || payload[end] >= 'a' && payload[end] <= 'z') {
			end++
		}
		if end > i+4 {
			cur = strings.ToUpper(payload[i+4 : end])
		}
	}
	return sumKopeks, cur, valid || sumKopeks > 0
}

func (h *ScanHandler) Parse(c *gin.Context) {
	var body struct {
		Payload string `json:"payload"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "payload required"})
		return
	}
	sumKopeks, cur, valid := parseSBPPayload(body.Payload)
	sumRub := float64(sumKopeks) / 100
	c.JSON(http.StatusOK, gin.H{
		"raw":       body.Payload,
		"type":      "sbp",
		"valid":     valid,
		"sumKopeks": sumKopeks,
		"sumRub":    sumRub,
		"cur":       cur,
	})
}

func (h *ScanHandler) PreviewPayment(c *gin.Context) {
	userID, _ := c.Get("userId")
	var body struct {
		RawPayload string `json:"rawPayload"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"valid": false, "error": "rawPayload required"})
		return
	}
	rawPayload := strings.TrimSpace(body.RawPayload)
	if rawPayload == "" {
		c.JSON(http.StatusOK, gin.H{"valid": false, "error": "Пустой payload"})
		return
	}
	sumKopeks, cur, valid := parseSBPPayload(rawPayload)
	if !valid || sumKopeks <= 0 {
		c.JSON(http.StatusOK, gin.H{"valid": false, "error": "Не удалось определить сумму"})
		return
	}
	if cur != "RUB" {
		c.JSON(http.StatusOK, gin.H{"valid": false, "error": "Поддерживается только RUB"})
		return
	}
	sumRub := float64(sumKopeks) / 100
	
	var u models.User
	if err := h.DB.Where("id = ?", userID).First(&u).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"valid": false, "error": "Пользователь не найден"})
		return
	}
	
	comm := 5.0
	if u.CommissionPercent != "" {
		if v, err := strconv.ParseFloat(u.CommissionPercent, 64); err == nil {
			comm = v
		}
	}
	
	// Получаем базовый курс и применяем персональную комиссию
	baseRate := h.getUsdtRubRate()
	if baseRate <= 0 {
		baseRate = 100
	}
	// Персональный курс = базовый курс * (1 - комиссия/100)
	personalRate := baseRate * (1 - comm/100)
	if personalRate <= 0 {
		personalRate = baseRate
	}
	
	sumUsdt := sumRub / personalRate
	
	c.JSON(http.StatusOK, gin.H{
		"valid":            true,
		"sumRub":           strconv.FormatFloat(sumRub, 'f', 8, 64),
		"sumUsdt":          strconv.FormatFloat(sumUsdt, 'f', 8, 64),
		"commissionPercent": strconv.FormatFloat(comm, 'f', 2, 64),
	})
}

func (h *ScanHandler) CreatePayment(c *gin.Context) {
	var body struct {
		RawPayload string `json:"rawPayload"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "rawPayload required"})
		return
	}
	h.createPaymentByPayload(c, strings.TrimSpace(body.RawPayload))
}

func (h *ScanHandler) createPaymentByPayload(c *gin.Context, rawPayload string) {
	userID, _ := c.Get("userId")
	uid := userID.(string)
	if rawPayload == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "rawPayload required"})
		return
	}
	sumKopeks, cur, valid := parseSBPPayload(rawPayload)
	if !valid || sumKopeks <= 0 || cur != "RUB" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Неверный формат SBP"})
		return
	}
	sumRub := float64(sumKopeks) / 100
	
	var u models.User
	if err := h.DB.Where("id = ?", uid).First(&u).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Пользователь не найден"})
		return
	}
	
	comm := 5.0
	if u.CommissionPercent != "" {
		if v, err := strconv.ParseFloat(u.CommissionPercent, 64); err == nil {
			comm = v
		}
	}
	
	// Получаем базовый курс и применяем персональную комиссию
	baseRate := h.getUsdtRubRate()
	if baseRate <= 0 {
		baseRate = 100
	}
	// Персональный курс = базовый курс * (1 - комиссия/100)
	personalRate := baseRate * (1 - comm/100)
	if personalRate <= 0 {
		personalRate = baseRate
	}
	
	sumUsdt := sumRub / personalRate
	
	p := models.PendingPayment{
		UserID:            uid,
		RawPayload:        rawPayload,
		SumKopeks:         sumKopeks,
		SumRub:            strconv.FormatFloat(sumRub, 'f', 8, 64),
		SumUsdt:           strconv.FormatFloat(sumUsdt, 'f', 8, 64),
		CommissionPercent: strconv.FormatFloat(comm, 'f', 2, 64),
		Status:            "pending",
	}
	if err := h.DB.Create(&p).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка создания платежа"})
		return
	}
	if h.Notifier != nil {
		h.Notifier.Notify("payment_request", uid, "Заявка на платёж: "+p.SumRub+" руб. (~"+p.SumUsdt+" USDT), пользователь "+uid[:8]+"...")
	}
	c.JSON(http.StatusOK, gin.H{
		"id":                p.ID,
		"sumRub":            p.SumRub,
		"sumUsdt":           p.SumUsdt,
		"commissionPercent": p.CommissionPercent,
		"rawPayload":        p.RawPayload,
	})
}

// CreatePaymentFromPayload — POST /scan/sbp с телом { payload }.
func (h *ScanHandler) CreatePaymentFromPayload(c *gin.Context) {
	var body struct {
		Payload string `json:"payload"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "payload required"})
		return
	}
	h.createPaymentByPayload(c, strings.TrimSpace(body.Payload))
}

func (h *ScanHandler) GetPaymentStatus(c *gin.Context) {
	userID, _ := c.Get("userId")
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"status": ""})
		return
	}
	var p models.PendingPayment
	if err := h.DB.Where("id = ? AND userId = ?", id, userID).First(&p).Error; err != nil {
		c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
		c.JSON(http.StatusOK, gin.H{"status": "pending"})
		return
	}
	c.Header("Cache-Control", "no-store, no-cache, must-revalidate")
	resp := gin.H{
		"status":  p.Status,
		"sumRub":  p.SumRub,
		"sumUsdt": p.SumUsdt,
	}
	if p.RejectReason != nil && *p.RejectReason != "" {
		resp["rejectReason"] = *p.RejectReason
	}
	c.JSON(http.StatusOK, resp)
}

func (h *ScanHandler) getUsdtRubRate() float64 {
	var val string
	if err := h.DB.Table("app_settings").Where("k = ?", "usdt_rub").Select("v").Scan(&val).Error; err == nil && val != "" {
		if v, err := strconv.ParseFloat(val, 64); err == nil && v > 0 {
			return v
		}
	}
	return 98.5
}

