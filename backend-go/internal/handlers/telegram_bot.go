package handlers

import (
	"bytes"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"ats-wallet/internal/models"
)

const startMessage = `Оплачивайте покупки в магазинах и кафе через обычный QR-код прямо с баланса USDT — быстро и без лишних действий.

Не нужно искать обменники — оплачивайте покупки напрямую за несколько секунд.`

type TelegramBotHandler struct {
	DB         *gorm.DB
	BotToken   string
	WebappURL  string
	WebhookBase string // Публичный URL бэкенда для вебхука (например https://api.yourdomain.com)
}

// Telegram update structures (minimal for /start)
type telegramUpdate struct {
	UpdateID int             `json:"update_id"`
	Message  *telegramMessage `json:"message"`
}

type telegramMessage struct {
	MessageID int                 `json:"message_id"`
	From      *telegramBotUser    `json:"from"`
	Chat      struct {
		ID int64 `json:"id"`
	} `json:"chat"`
	Text string `json:"text"`
}

type telegramBotUser struct {
	ID           int64  `json:"id"`
	FirstName    string `json:"first_name"`
	LastName     string `json:"last_name"`
	Username     string `json:"username"`
	LanguageCode string `json:"language_code"`
}

// WebhookHealth отвечает на GET (проверка доступности). Telegram шлёт только POST, но хостинг/прокси может проверять GET.
func (h *TelegramBotHandler) WebhookHealth(c *gin.Context) {
	c.String(http.StatusOK, "OK")
}

func (h *TelegramBotHandler) Webhook(c *gin.Context) {
	if h.BotToken == "" {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	var upd telegramUpdate
	if err := c.ShouldBindJSON(&upd); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"ok": false})
		return
	}
	if upd.Message == nil || upd.Message.From == nil {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	text := upd.Message.Text
	from := upd.Message.From
	chatID := upd.Message.Chat.ID

	if strings.HasPrefix(text, "/start") {
		// Сохраняем в список тех, кто запустил бота
		h.DB.Create(&models.TelegramBotStart{
			TelegramID:   from.ID,
			Username:     from.Username,
			FirstName:    from.FirstName,
			LastName:     from.LastName,
			LanguageCode: from.LanguageCode,
			StartedAt:    time.Now(),
		})
		// URL Mini App: при переходе по t.me/Bot?start=ref_xxx параметр приходит в Message.Text как "/start ref_xxx"
		webappURL := h.WebappURL
		if webappURL == "" {
			webappURL = "https://t.me"
		}
		startParam := ""
		if len(text) > 7 {
			startParam = strings.TrimSpace(text[7:]) // "/start ref_xxx" -> "ref_xxx"
			if startParam != "" && len(startParam) < 512 && strings.HasPrefix(startParam, "ref_") {
				if strings.Contains(webappURL, "?") {
					webappURL += "&tgWebAppStartParam=" + url.QueryEscape(startParam)
				} else {
					webappURL += "?tgWebAppStartParam=" + url.QueryEscape(startParam)
				}
			}
		}
		payload := map[string]interface{}{
			"chat_id": chatID,
			"text":    startMessage,
			"reply_markup": map[string]interface{}{
				"inline_keyboard": [][]map[string]interface{}{
					{
						{
							"text":   "Открыть кошелёк",
							"web_app": map[string]string{"url": webappURL},
						},
					},
				},
			},
		}
		body, _ := json.Marshal(payload)
		resp, err := http.Post("https://api.telegram.org/bot"+h.BotToken+"/sendMessage", "application/json", bytes.NewReader(body))
		if err != nil {
			log.Printf("[TelegramBot] sendMessage error: %v", err)
		} else {
			resp.Body.Close()
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetWebhookInfo возвращает информацию о текущем вебхуке бота (для админки).
func (h *TelegramBotHandler) GetWebhookInfo(c *gin.Context) {
	if h.BotToken == "" {
		c.JSON(http.StatusOK, gin.H{
			"hasToken": false,
			"message":  "Токен бота не задан (TELEGRAM_BOT_TOKEN)",
		})
		return
	}
	resp, err := http.Get("https://api.telegram.org/bot" + h.BotToken + "/getWebhookInfo")
	if err != nil {
		c.JSON(http.StatusOK, gin.H{"hasToken": true, "connected": false, "error": err.Error()})
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var data struct {
		OK     bool `json:"ok"`
		Result struct {
			URL                string `json:"url"`
			PendingUpdateCount int    `json:"pending_update_count"`
			LastErrorMessage   string `json:"last_error_message"`
			LastErrorDate      int    `json:"last_error_date"`
		} `json:"result"`
	}
	_ = json.Unmarshal(body, &data)
	url := ""
	if data.OK && data.Result.URL != "" {
		url = data.Result.URL
	}
	c.JSON(http.StatusOK, gin.H{
		"hasToken":            true,
		"connected":           url != "",
		"webhookUrl":          url,
		"pendingUpdateCount":  data.Result.PendingUpdateCount,
		"lastErrorMessage":    data.Result.LastErrorMessage,
		"webhookBase":         strings.TrimSuffix(h.WebhookBase, "/"),
		"suggestedWebhookUrl": strings.TrimSuffix(h.WebhookBase, "/") + "/webhook/telegram-bot",
	})
}

// SetWebhook устанавливает вебхук бота на наш URL. Поддерживается body.url для произвольного URL (например с /api).
func (h *TelegramBotHandler) SetWebhook(c *gin.Context) {
	if h.BotToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Токен бота не задан"})
		return
	}
	var body struct {
		URL string `json:"url"`
	}
	_ = c.ShouldBindJSON(&body)
	webhookURL := strings.TrimSpace(body.URL)
	if webhookURL == "" {
		base := strings.TrimSuffix(h.WebhookBase, "/")
		if base == "" || base == "https://yourdomain.com" {
			c.JSON(http.StatusBadRequest, gin.H{"message": "Задайте TELEGRAM_WEBHOOK_BASE или укажите url в теле запроса"})
			return
		}
		webhookURL = base + "/webhook/telegram-bot"
	}
	apiURL := "https://api.telegram.org/bot" + h.BotToken + "/setWebhook?url=" + url.QueryEscape(webhookURL)
	resp, err := http.Get(apiURL)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка запроса к Telegram: " + err.Error()})
		return
	}
	defer resp.Body.Close()
	respBody, _ := io.ReadAll(resp.Body)
	var data struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	_ = json.Unmarshal(respBody, &data)
	if !data.OK {
		c.JSON(http.StatusBadRequest, gin.H{"message": data.Description, "raw": string(respBody)})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true, "webhookUrl": webhookURL})
}

// Broadcast отправляет сообщение всем пользователям бота (users с telegramId + telegram_bot_starts).
func (h *TelegramBotHandler) Broadcast(c *gin.Context) {
	if h.BotToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Токен бота не задан"})
		return
	}
	var body struct {
		Text      string `json:"text"`
		OnlyPromo bool   `json:"onlyPromo"` // только пользователи с включёнными уведомлениями «Акции»
	}
	if err := c.ShouldBindJSON(&body); err != nil || strings.TrimSpace(body.Text) == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "text обязателен и не должен быть пустым"})
		return
	}
	text := strings.TrimSpace(body.Text)

	chatIDs := make(map[int64]struct{})
	if body.OnlyPromo {
		var userIds []string
		h.DB.Model(&models.UserNotificationPref{}).Where("notifPromo = ?", true).Pluck("userId", &userIds)
		for _, uid := range userIds {
			var tgID *string
			if err := h.DB.Model(&models.User{}).Where("id = ?", uid).Select("telegramId").Scan(&tgID).Error; err != nil || tgID == nil || *tgID == "" {
				continue
			}
			id, err := strconv.ParseInt(strings.TrimSpace(*tgID), 10, 64)
			if err == nil && id != 0 {
				chatIDs[id] = struct{}{}
			}
		}
	} else {
		var uidStrs []string
		h.DB.Model(&models.User{}).Where("telegramId IS NOT NULL AND telegramId != ''").Pluck("telegramId", &uidStrs)
		for _, s := range uidStrs {
			id, err := strconv.ParseInt(s, 10, 64)
			if err == nil && id != 0 {
				chatIDs[id] = struct{}{}
			}
		}
		var startIDs []int64
		h.DB.Model(&models.TelegramBotStart{}).Distinct("telegramId").Pluck("telegramId", &startIDs)
		for _, id := range startIDs {
			if id != 0 {
				chatIDs[id] = struct{}{}
			}
		}
	}
	if len(chatIDs) == 0 {
		c.JSON(http.StatusOK, gin.H{"ok": true, "sent": 0, "message": "Нет получателей"})
		return
	}

	payload := map[string]interface{}{
		"text":       text,
		"parse_mode": "HTML",
	}
	apiURL := "https://api.telegram.org/bot" + h.BotToken + "/sendMessage"

	var sent, failed int
	var mu sync.Mutex
	const delayMs = 50
	for chatID := range chatIDs {
		reqBody := make(map[string]interface{})
		for k, v := range payload {
			reqBody[k] = v
		}
		reqBody["chat_id"] = chatID
		b, _ := json.Marshal(reqBody)
		resp, err := http.Post(apiURL, "application/json", bytes.NewReader(b))
		if err != nil {
			log.Printf("[TelegramBot] Broadcast to %d: %v", chatID, err)
			mu.Lock()
			failed++
			mu.Unlock()
			time.Sleep(delayMs * time.Millisecond)
			continue
		}
		var result struct {
			OK bool `json:"ok"`
		}
		_ = json.NewDecoder(resp.Body).Decode(&result)
		resp.Body.Close()
		mu.Lock()
		if result.OK {
			sent++
		} else {
			failed++
		}
		mu.Unlock()
		time.Sleep(delayMs * time.Millisecond)
	}

	c.JSON(http.StatusOK, gin.H{
		"ok":     true,
		"sent":   sent,
		"failed": failed,
		"total":  len(chatIDs),
	})
}
