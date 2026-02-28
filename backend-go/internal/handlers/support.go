package handlers

import (
	"bufio"
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"ats-wallet/internal/models"
	"ats-wallet/internal/prometheus"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

const supportUploadDir = "uploads/support"
const maxSupportFileSize = 10 << 20 // 10 MB

type SupportHandler struct {
	DB                *gorm.DB
	Notifier          interface {
		Notify(event, userID, message string)
		NotifyToUser(userID, event, message string)
	}
	SupportBotToken   string // из .env (SUPPORT_BOT_TOKEN)
	SupportGroupID    string // из .env (SUPPORT_GROUP_ID) — ID группы техподдержки
	SupportBotLogPath string // лог вебхука и действий бота (например support_bot.log)
	supportLogMu      sync.Mutex
}

func (h *SupportHandler) supportLog(line string) {
	if h.SupportBotLogPath == "" {
		return
	}
	h.supportLogMu.Lock()
	defer h.supportLogMu.Unlock()
	f, err := os.OpenFile(h.SupportBotLogPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		log.Printf("[SupportBot] log write failed: %v", err)
		return
	}
	ts := time.Now().UTC().Format(time.RFC3339)
	_, _ = fmt.Fprintf(f, "%s %s\n", ts, line)
	_ = f.Close()
}

func (h *SupportHandler) getSupportBotToken() string {
	if s := strings.TrimSpace(h.SupportBotToken); s != "" {
		return s
	}
	var setting models.AppSetting
	if err := h.DB.Where("k = ?", "support_bot_token").First(&setting).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(setting.V)
}

// getSupportBotChatID — чат оператора (куда слать сообщения от пользователей). Задаётся через /start в боте или в админке.
func (h *SupportHandler) getSupportBotChatID() string {
	var setting models.AppSetting
	if err := h.DB.Where("k = ?", "support_bot_chat_id").First(&setting).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(setting.V)
}

func (h *SupportHandler) getSupportGroupID() string {
	if s := strings.TrimSpace(h.SupportGroupID); s != "" {
		return s
	}
	var setting models.AppSetting
	if err := h.DB.Where("k = ?", "support_group_id").First(&setting).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(setting.V)
}

func (h *SupportHandler) sendToSupportBot(userID, digitalID, displayName, message string) {
	token := h.getSupportBotToken()
	if token == "" {
		log.Printf("[SupportBot] sendToSupportBot: token empty, message not sent (user %s)", userID)
		return
	}
	shortID := userID
	if len(shortID) > 8 {
		shortID = shortID[:8] + "..."
	}
	text := fmt.Sprintf("💬 <b>Новое сообщение в поддержку</b>\n\n"+
		"👤 ID: <code>%s</code>\n"+
		"🔢 Digital ID: <code>%s</code>\n"+
		"📝 Имя: %s\n\n"+
		"<b>Сообщение:</b>\n%s",
		shortID, digitalID, displayName, message)

	groupIDStr := h.getSupportGroupID()
	var groupID int64
	if groupIDStr != "" {
		fmt.Sscanf(groupIDStr, "%d", &groupID)
	}
	operatorChatID := h.getSupportBotChatID()

	// Режим группы с темами: создаём/находим тему для этого app-пользователя и шлём туда
	if groupID != 0 {
		var appTh models.SupportAppThread
		err := h.DB.Where("userId = ?", userID).First(&appTh).Error
		if err != nil {
			h.supportLog(fmt.Sprintf("sendToSupportBot creating topic for app user_id=%s", userID))
			threadID, _ := h.createForumTopic(token, groupID, fmt.Sprintf("In-app: %s", shortID))
			if threadID != 0 {
				appTh = models.SupportAppThread{UserID: userID, ThreadID: threadID, CreatedAt: time.Now()}
				h.DB.Create(&appTh)
				h.sendTelegramMessageToThread(token, groupID, threadID, text)
			} else {
				log.Printf("[SupportBot] sendToSupportBot: createForumTopic failed for user %s", userID)
			}
		} else {
			h.sendTelegramMessageToThread(token, groupID, appTh.ThreadID, text)
		}
		h.supportLog(fmt.Sprintf("sendToSupportBot sent to group user_id=%s", userID))
	}

	// Дублируем в чат оператора (если задан), с кнопкой «Ответить»
	if operatorChatID != "" {
		payload := map[string]interface{}{
			"chat_id":    operatorChatID,
			"text":       text,
			"parse_mode": "HTML",
			"reply_markup": map[string]interface{}{
				"inline_keyboard": [][]map[string]interface{}{
					{
						{"text": "Ответить", "callback_data": fmt.Sprintf("support_reply:%s", userID)},
					},
				},
			},
		}
		data, _ := json.Marshal(payload)
		resp, err := http.Post(
			fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token),
			"application/json",
			bytes.NewBuffer(data),
		)
		if err != nil {
			log.Printf("[SupportBot] Failed to send to operator: %v", err)
		} else {
			resp.Body.Close()
			h.supportLog(fmt.Sprintf("sendToSupportBot sent to operator user_id=%s", userID))
		}
	} else if groupID == 0 {
		h.supportLog(fmt.Sprintf("sendToSupportBot no delivery user_id=%s (no chat_id nor group_id)", userID))
		log.Printf("[SupportBot] sendToSupportBot: neither support_bot_chat_id nor support_group_id set, message not delivered to Telegram (user %s)", userID)
	}
}

func (h *SupportHandler) GetMessages(c *gin.Context) {
	userID, exists := c.Get("userId")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Auth required"})
		return
	}

	var messages []models.SupportMessage
	if err := h.DB.Where("userId = ?", userID).Order("createdAt ASC").Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch messages"})
		return
	}
	out := make([]gin.H, 0, len(messages))
	for _, m := range messages {
		item := gin.H{
			"id":        m.ID,
			"message":   m.Message,
			"isAdmin":   m.IsAdmin,
			"createdAt": m.CreatedAt.Format(time.RFC3339),
			"userId":    m.UserID,
		}
		if m.AttachmentURL != "" {
			item["attachmentUrl"] = m.AttachmentURL
			item["attachmentType"] = m.AttachmentType
		}
		out = append(out, item)
	}
	var closedCount int64
	h.DB.Model(&models.SupportThreadClose{}).Where("userId = ?", userID).Count(&closedCount)
	c.JSON(http.StatusOK, gin.H{"messages": out, "threadClosed": closedCount > 0})
}

func (h *SupportHandler) SendMessage(c *gin.Context) {
	userID, exists := c.Get("userId")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Auth required"})
		return
	}

	var body struct {
		Message        string `json:"message"`
		AttachmentURL  string `json:"attachmentUrl"`
		AttachmentType string `json:"attachmentType"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || (body.Message == "" && body.AttachmentURL == "") {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Message or attachment is required"})
		return
	}

	msg := models.SupportMessage{
		UserID:         userID.(string),
		Message:        strings.TrimSpace(body.Message),
		IsAdmin:        false,
		AttachmentURL:  strings.TrimSpace(body.AttachmentURL),
		AttachmentType: strings.TrimSpace(body.AttachmentType),
		CreatedAt:      time.Now(),
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to send message"})
		return
	}
	prometheus.SupportMessagesTotal.WithLabelValues("user").Inc()
	// Новое сообщение от пользователя возвращает диалог из архива
	h.DB.Exec("DELETE FROM support_thread_closes WHERE userId = ?", msg.UserID)
	if h.Notifier != nil {
		text := msg.Message
		if len(text) > 200 {
			text = text[:200] + "..."
		}
		uidShort := msg.UserID
		if len(uidShort) > 8 {
			uidShort = uidShort[:8] + "..."
		}
		h.Notifier.Notify("support_message", msg.UserID, "Сообщение в тех. поддержку от пользователя "+uidShort+": "+text)
	}

	var user models.User
	h.DB.Where("id = ?", userID).First(&user)
	firstName, lastName, username, digitalID := "", "", "", ""
	if user.TelegramFirstName != nil {
		firstName = *user.TelegramFirstName
	}
	if user.TelegramLastName != nil {
		lastName = *user.TelegramLastName
	}
	if user.TelegramUsername != nil {
		username = *user.TelegramUsername
	}
	if user.DigitalID != nil {
		digitalID = *user.DigitalID
	}
	displayName := strings.TrimSpace(firstName + " " + lastName)
	if displayName == "" && username != "" {
		displayName = "@" + username
	}
	if displayName == "" {
		displayName = "—"
	}
	notifyText := msg.Message
	if msg.AttachmentURL != "" {
		if msg.AttachmentType == "image" {
			notifyText = notifyText + " [📷 фото]"
		} else if msg.AttachmentType == "pdf" {
			notifyText = notifyText + " [📄 документ]"
		} else {
			notifyText = notifyText + " [вложение]"
		}
	}
	h.supportLog(fmt.Sprintf("sendToSupportBot user_id=%s", msg.UserID))
	go h.sendToSupportBot(msg.UserID, digitalID, displayName, notifyText)

	out := gin.H{
		"id":        msg.ID,
		"message":   msg.Message,
		"isAdmin":   msg.IsAdmin,
		"createdAt": msg.CreatedAt.Format(time.RFC3339),
		"userId":    msg.UserID,
	}
	if msg.AttachmentURL != "" {
		out["attachmentUrl"] = msg.AttachmentURL
		out["attachmentType"] = msg.AttachmentType
	}
	c.JSON(http.StatusOK, out)
}

func (h *SupportHandler) AdminGetChats(c *gin.Context) {
	archived := c.Query("archived") == "true"

	rows, err := h.DB.Raw(`
		SELECT m1.userId,
		       (SELECT m2.message FROM support_messages m2 WHERE m2.userId = m1.userId ORDER BY m2.createdAt DESC LIMIT 1),
		       MAX(m1.createdAt),
		       COUNT(*),
		       (SELECT m2.isAdmin FROM support_messages m2 WHERE m2.userId = m1.userId ORDER BY m2.createdAt DESC LIMIT 1),
		       u.digitalId,
		       u.telegramFirstName,
		       u.telegramLastName,
		       u.telegramUsername
		FROM support_messages m1
		LEFT JOIN users u ON u.id = m1.userId
		GROUP BY m1.userId, u.id, u.digitalId, u.telegramFirstName, u.telegramLastName, u.telegramUsername
		ORDER BY MAX(m1.createdAt) DESC
	`).Rows()
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch chats"})
		return
	}
	defer rows.Close()

	var closedUserIDs []string
	h.DB.Model(&models.SupportThreadClose{}).Pluck("userId", &closedUserIDs)
	closedSet := make(map[string]bool)
	for _, id := range closedUserIDs {
		closedSet[id] = true
	}

	out := make([]gin.H, 0)
	for rows.Next() {
		var userID, lastMessage string
		var lastTime time.Time
		var messageCount int
		var lastIsAdmin *bool
		var digitalId, tgFirst, tgLast, tgUsername *string
		if err := rows.Scan(&userID, &lastMessage, &lastTime, &messageCount, &lastIsAdmin, &digitalId, &tgFirst, &tgLast, &tgUsername); err != nil {
			continue
		}
		displayName := ""
		if tgFirst != nil || tgLast != nil {
			first, last := "", ""
			if tgFirst != nil {
				first = *tgFirst
			}
			if tgLast != nil {
				last = *tgLast
			}
			displayName = strings.TrimSpace(first + " " + last)
		}
		if displayName == "" && tgUsername != nil && *tgUsername != "" {
			displayName = "@" + *tgUsername
		}
		if displayName == "" {
			displayName = userID
			if len(displayName) > 12 {
				displayName = displayName[:12] + "…"
			}
		}
		digId := ""
		if digitalId != nil {
			digId = *digitalId
		}
		hasUnread := lastIsAdmin != nil && !*lastIsAdmin
		tgUser := ""
		if tgUsername != nil {
			tgUser = *tgUsername
		}
		isClosed := closedSet[userID]
		if archived && !isClosed {
			continue
		}
		if !archived && isClosed {
			continue
		}
		out = append(out, gin.H{
			"userId":           userID,
			"lastMessage":      lastMessage,
			"lastTime":         lastTime.Format(time.RFC3339),
			"messageCount":     messageCount,
			"hasUnread":        hasUnread,
			"digitalId":        digId,
			"displayName":      displayName,
			"telegramUsername": tgUser,
		})
	}
	c.JSON(http.StatusOK, out)
}

func (h *SupportHandler) AdminCloseThread(c *gin.Context) {
	userID := c.Param("userId")
	if userID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "userId required"})
		return
	}
	h.DB.Exec(
		`INSERT INTO support_thread_closes ("userId", "closedAt") VALUES (?, ?) ON CONFLICT ("userId") DO UPDATE SET "closedAt" = EXCLUDED."closedAt"`,
		userID, time.Now(),
	)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UserCloseThread закрывает тред поддержки со стороны пользователя (текущий userId из JWT).
func (h *SupportHandler) UserCloseThread(c *gin.Context) {
	userID, exists := c.Get("userId")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Auth required"})
		return
	}
	uid := userID.(string)
	h.DB.Exec(
		`INSERT INTO support_thread_closes ("userId", "closedAt") VALUES (?, ?) ON CONFLICT ("userId") DO UPDATE SET "closedAt" = EXCLUDED."closedAt"`,
		uid, time.Now(),
	)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// UserReopenThread открывает новый диалог (удаляет запись о закрытии треда для текущего пользователя).
func (h *SupportHandler) UserReopenThread(c *gin.Context) {
	userID, exists := c.Get("userId")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Auth required"})
		return
	}
	uid := userID.(string)
	h.DB.Exec("DELETE FROM support_thread_closes WHERE userId = ?", uid)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// AdminGetSupportCount возвращает количество открытых диалогов, в которых последнее сообщение — от пользователя (непрочитанное админом).
func (h *SupportHandler) AdminGetSupportCount(c *gin.Context) {
	var count int64
	h.DB.Raw(`
		SELECT COUNT(*) FROM (
			SELECT m.userId
			FROM support_messages m
			INNER JOIN (SELECT userId, MAX(createdAt) AS lastAt FROM support_messages GROUP BY userId) last ON last.userId = m.userId AND last.lastAt = m.createdAt
			LEFT JOIN support_thread_closes c ON c.userId = m.userId
			WHERE c.userId IS NULL AND m.isAdmin = 0
		) t
	`).Scan(&count)
	c.JSON(http.StatusOK, gin.H{"count": count})
}

func (h *SupportHandler) AdminGetMessages(c *gin.Context) {
	userID := c.Param("userId")
	var messages []models.SupportMessage
	if err := h.DB.Where("userId = ?", userID).Order("createdAt ASC").Find(&messages).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch messages"})
		return
	}
	out := make([]gin.H, 0, len(messages))
	for _, m := range messages {
		item := gin.H{
			"id":        m.ID,
			"message":   m.Message,
			"isAdmin":   m.IsAdmin,
			"createdAt": m.CreatedAt.Format(time.RFC3339),
			"userId":    m.UserID,
		}
		if m.AttachmentURL != "" {
			item["attachmentUrl"] = m.AttachmentURL
			item["attachmentType"] = m.AttachmentType
		}
		out = append(out, item)
	}
	c.JSON(http.StatusOK, out)
}

func (h *SupportHandler) AdminSendMessage(c *gin.Context) {
	userID := c.Param("userId")

	var body struct {
		Message string `json:"message"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Message == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Message is required"})
		return
	}

	msg := models.SupportMessage{
		UserID:    userID,
		Message:   body.Message,
		IsAdmin:   true,
		CreatedAt: time.Now(),
	}

	if err := h.DB.Create(&msg).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to send message"})
		return
	}
	prometheus.SupportMessagesTotal.WithLabelValues("admin").Inc()
	if h.Notifier != nil {
		excerpt := msg.Message
		if len(excerpt) > 200 {
			excerpt = excerpt[:200] + "..."
		}
		h.Notifier.NotifyToUser(userID, "support", "Ответ тех поддержки: "+excerpt)
	}
	c.JSON(http.StatusOK, gin.H{
		"id":        msg.ID,
		"message":   msg.Message,
		"isAdmin":   msg.IsAdmin,
		"createdAt": msg.CreatedAt.Format(time.RFC3339),
		"userId":    msg.UserID,
	})
}

type TelegramUpdate struct {
	Message         *TelegramMessage         `json:"message"`
	CallbackQuery   *TelegramCallbackQuery   `json:"callback_query"`
}

type TelegramMessage struct {
	MessageID      int              `json:"message_id"`
	From           *TelegramUser    `json:"from"`
	Chat           *TelegramChat    `json:"chat"`
	Text           string           `json:"text"`
	MessageThreadID int             `json:"message_thread_id"`
	ReplyToMessage *TelegramMessage `json:"reply_to_message"`
	Photo          []TelegramPhoto  `json:"photo"`
	Document       *TelegramDocument `json:"document"`
	Caption        string           `json:"caption"`
}

type TelegramPhoto struct {
	FileID string `json:"file_id"`
}

type TelegramDocument struct {
	FileID string `json:"file_id"`
}

type TelegramUser struct {
	ID        int64  `json:"id"`
	FirstName string `json:"first_name"`
	LastName  string `json:"last_name"`
	Username  string `json:"username"`
	IsBot     bool   `json:"is_bot"`
}

type TelegramChat struct {
	ID   int64  `json:"id"`
	Type string `json:"type"`
}

type TelegramCallbackQuery struct {
	ID      string           `json:"id"`
	From    *TelegramUser    `json:"from"`
	Message *TelegramMessage `json:"message"`
	Data    string           `json:"data"`
}

var pendingReplies = make(map[int64]string)

// getSupportUserInfo по Telegram ID ищет пользователя в приложении и возвращает ID, отображаемое имя и баланс USDT.
func (h *SupportHandler) getSupportUserInfo(telegramUserID int64) (userID, displayName, balanceUSDT string, ok bool) {
	var u models.User
	tgIDStr := fmt.Sprintf("%d", telegramUserID)
	if err := h.DB.Where("telegramId = ?", tgIDStr).First(&u).Error; err != nil {
		return "", "", "", false
	}
	displayName = u.ID
	if u.DigitalID != nil && *u.DigitalID != "" {
		displayName = *u.DigitalID
	}
	if len(displayName) > 12 {
		displayName = displayName[:8] + "…"
	}
	var b models.Balance
	if err := h.DB.Where("userId = ? AND symbol = ?", u.ID, "USDT").First(&b).Error; err != nil {
		return u.ID, displayName, "0", true
	}
	return u.ID, displayName, b.Amount, true
}

func (h *SupportHandler) SupportBotWebhook(c *gin.Context) {
	var update TelegramUpdate
	if err := c.ShouldBindJSON(&update); err != nil {
		h.supportLog("webhook bind JSON err=" + err.Error())
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	updateID := 0
	if update.Message != nil {
		updateID = update.Message.MessageID
	}
	if update.CallbackQuery != nil && updateID == 0 {
		updateID = int(update.CallbackQuery.From.ID)
	}
	h.supportLog(fmt.Sprintf("webhook update_id=ok has_message=%v has_callback=%v", update.Message != nil, update.CallbackQuery != nil))

	prometheus.SupportBotWebhookTotal.Inc()
	token := h.getSupportBotToken()
	if token == "" {
		h.supportLog("webhook skip: token empty")
		log.Printf("[SupportBot] webhook: token empty, update not processed")
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	groupIDStr := h.getSupportGroupID()
	useForumMode := groupIDStr != ""
	var groupID int64
	if useForumMode {
		_, _ = fmt.Sscanf(strings.TrimSpace(groupIDStr), "%d", &groupID)
		if groupID == 0 {
			useForumMode = false
			h.supportLog("webhook group_id parse failed (need number, e.g. -1001234567890), useForumMode=false")
		} else {
			h.supportLog(fmt.Sprintf("webhook useForumMode=true group_id=%d", groupID))
		}
	}
	_ = updateID

	// Режим «группа с темами»: пользователь пишет боту в личку → тема в группе; ответ в теме → пользователю в личку
	if useForumMode && update.Message != nil && update.Message.Chat != nil {
		chat := update.Message.Chat
		from := update.Message.From
		if chat.Type == "private" && from != nil {
			// /start в личке — сохраняем chat_id оператора (куда слать уведомления из приложения) и приветствуем
			if update.Message.Text == "/start" {
				chatIDStr := fmt.Sprintf("%d", chat.ID)
				h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "support_bot_chat_id", chatIDStr)
				h.supportLog(fmt.Sprintf("forum /start private chat_id=%s tg_id=%d", chatIDStr, from.ID))
				h.sendTelegramMessage(token, chat.ID, "Поддержка ATS WALLET. Работаем круглосуточно. Напишите ваше сообщение — ответим в этом чате или в группе поддержки.")
				c.JSON(http.StatusOK, gin.H{"ok": true})
				return
			}
			// Сообщение от пользователя в личку — создаём/находим тему, шлём туда, отвечаем пользователю
			var th models.SupportTelegramThread
			err := h.DB.Where("telegramUserId = ?", from.ID).First(&th).Error
			if err != nil {
				h.supportLog(fmt.Sprintf("forum new tg_id=%d creating topic", from.ID))
				threadID, topicErr := h.createForumTopic(token, groupID, fmt.Sprintf("Обращение: ID %d", from.ID))
				if threadID == 0 {
					h.supportLog(fmt.Sprintf("forum createForumTopic failed tg_id=%d err=%s", from.ID, topicErr))
					log.Printf("[SupportBot] createForumTopic failed for tg_id=%d: %s", from.ID, topicErr)
					msg := "❌ Не удалось создать тему в группе поддержки."
					if strings.Contains(topicErr, "not a forum") {
						msg = "❌ В группе поддержки не включены Темы (Forum).\n\nВладелец группы должен: зайти в группу → Настройки (или «Изменить») → включить «Темы» (Topics). Группа должна быть супергруппой."
					} else if strings.Contains(topicErr, "kicked") || strings.Contains(topicErr, "Forbidden") {
						msg = "❌ Бот исключён из группы поддержки или нет прав. Добавьте бота в группу и сделайте его администратором с правом «Управление темами»."
					}
					h.sendTelegramMessage(token, chat.ID, msg)
					c.JSON(http.StatusOK, gin.H{"ok": true})
					return
				}
				th = models.SupportTelegramThread{TelegramUserID: from.ID, ThreadID: threadID, CreatedAt: time.Now()}
				if errCreate := h.DB.Create(&th).Error; errCreate != nil {
					h.supportLog(fmt.Sprintf("forum DB Create thread err=%v", errCreate))
					log.Printf("[SupportBot] DB Create SupportTelegramThread: %v", errCreate)
				}
				info := fmt.Sprintf("TG ID: %d · %s %s · @%s", from.ID, from.FirstName, from.LastName, from.Username)
				if uid, dname, bal, ok := h.getSupportUserInfo(from.ID); ok {
					info += fmt.Sprintf("\nПриложение: %s · Баланс: %s USDT", dname, bal)
					_ = uid
				}
				h.sendTelegramMessageToThread(token, groupID, threadID, info)
			} else {
				h.supportLog(fmt.Sprintf("forum existing thread tg_id=%d thread_id=%d", from.ID, th.ThreadID))
			}
			threadID := th.ThreadID
			text := update.Message.Text
			if text == "" && update.Message.Caption != "" {
				text = update.Message.Caption
			}
			if len(update.Message.Photo) > 0 {
				fileID := update.Message.Photo[len(update.Message.Photo)-1].FileID
				h.sendTelegramPhoto(token, groupID, threadID, fileID, text)
			} else if update.Message.Document != nil {
				h.sendTelegramDocument(token, groupID, threadID, update.Message.Document.FileID, text)
			} else {
				if text == "" {
					text = "[медиа]"
				}
				h.sendTelegramMessageToThread(token, groupID, threadID, text)
			}
			// Если диалог был более суток назад — одно сообщение, что скоро ответят
			if err == nil && time.Since(th.CreatedAt) > 24*time.Hour {
				h.sendTelegramMessage(token, chat.ID, "Спасибо за ожидание. Скоро вам ответим. Поддержка работает круглосуточно.")
			}
			h.supportLog(fmt.Sprintf("forum private message sent to thread tg_id=%d", from.ID))
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}
		if (chat.Type == "group" || chat.Type == "supergroup") && update.Message.MessageThreadID > 0 && (update.Message.From == nil || !update.Message.From.IsBot) {
			threadID := update.Message.MessageThreadID
			text := update.Message.Text
			if text == "" && update.Message.Caption != "" {
				text = update.Message.Caption
			}
			// Тема привязана к Telegram-пользователю — шлём ответ в личку
			var th models.SupportTelegramThread
			if h.DB.Where("threadId = ?", threadID).First(&th).Error == nil {
				h.supportLog(fmt.Sprintf("forum group reply -> tg_id=%d thread_id=%d", th.TelegramUserID, threadID))
				if len(update.Message.Photo) > 0 {
					fileID := update.Message.Photo[len(update.Message.Photo)-1].FileID
					h.sendTelegramPhoto(token, th.TelegramUserID, 0, fileID, text)
				} else if update.Message.Document != nil {
					h.sendTelegramDocument(token, th.TelegramUserID, 0, update.Message.Document.FileID, text)
				} else if text != "" {
					h.sendTelegramMessage(token, th.TelegramUserID, text)
				}
				c.JSON(http.StatusOK, gin.H{"ok": true})
				return
			}
			// Тема привязана к пользователю из приложения (in-app) — сохраняем ответ в БД и уведомляем
			var appTh models.SupportAppThread
			if h.DB.Where("threadId = ?", threadID).First(&appTh).Error == nil {
				h.supportLog(fmt.Sprintf("forum group reply -> app user_id=%s thread_id=%d", appTh.UserID, threadID))
				if text == "" {
					text = "[медиа]"
				}
				msg := models.SupportMessage{
					UserID:    appTh.UserID,
					Message:   text,
					IsAdmin:   true,
					CreatedAt: time.Now(),
				}
				if err := h.DB.Create(&msg).Error; err == nil {
					prometheus.SupportMessagesTotal.WithLabelValues("admin").Inc()
					if h.Notifier != nil {
						excerpt := msg.Message
						if len(excerpt) > 200 {
							excerpt = excerpt[:200] + "..."
						}
						h.Notifier.NotifyToUser(appTh.UserID, "support", "Ответ поддержки: "+excerpt)
					}
				}
				c.JSON(http.StatusOK, gin.H{"ok": true})
				return
			}
		}
	}

	// Режим без форума: сообщение пользователя боту в личку — пересылаем оператору с инфо о балансе
	if !useForumMode && update.Message != nil && update.Message.Chat != nil && update.Message.Chat.Type == "private" && update.Message.From != nil && update.Message.Text != "/start" {
		h.supportLog(fmt.Sprintf("non-forum private message tg_id=%d", update.Message.From.ID))
		from := update.Message.From
		text := update.Message.Text
		if text == "" && update.Message.Caption != "" {
			text = update.Message.Caption
		}
		if text == "" {
			text = "[медиа]"
		}
		operatorChatIDStr := h.getSupportBotChatID()
		if operatorChatIDStr != "" {
			var operatorChatID int64
			fmt.Sscanf(operatorChatIDStr, "%d", &operatorChatID)
			if operatorChatID != 0 {
				header := fmt.Sprintf("TG %d · @%s", from.ID, from.Username)
				if _, dname, bal, ok := h.getSupportUserInfo(from.ID); ok {
					header = fmt.Sprintf("TG %d · @%s · %s · %s USDT", from.ID, from.Username, dname, bal)
				}
				if len(update.Message.Photo) > 0 {
					h.sendTelegramPhoto(token, operatorChatID, 0, update.Message.Photo[len(update.Message.Photo)-1].FileID, header+"\n"+text)
				} else if update.Message.Document != nil {
					h.sendTelegramDocument(token, operatorChatID, 0, update.Message.Document.FileID, header+"\n"+text)
				} else {
					h.sendTelegramMessage(token, operatorChatID, header+"\n"+text)
				}
				pendingReplies[operatorChatID] = fmt.Sprintf("tg:%d", from.ID)
			}
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	// Старый режим: один чат + кнопка «Ответить»
	if update.CallbackQuery != nil {
		h.supportLog("callback_query " + update.CallbackQuery.Data)
		data := update.CallbackQuery.Data
		if strings.HasPrefix(data, "support_reply:") {
			userID := strings.TrimPrefix(data, "support_reply:")
			chatID := update.CallbackQuery.Message.Chat.ID
			pendingReplies[chatID] = userID
			h.answerCallback(token, update.CallbackQuery.ID, "Следующее сообщение уйдёт пользователю")
			short := userID
			if len(short) > 8 {
				short = short[:8] + "…"
			}
			h.sendTelegramMessage(token, chatID, fmt.Sprintf("↩ Следующее сообщение → пользователю %s", short))
		}
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}

	hasContent := update.Message != nil && (update.Message.Text != "" || update.Message.Caption != "" || len(update.Message.Photo) > 0 || update.Message.Document != nil)
	if hasContent {
		chatID := update.Message.Chat.ID

		if update.Message.Text == "/start" {
			chatIDStr := fmt.Sprintf("%d", chatID)
			h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "support_bot_chat_id", chatIDStr)
			h.sendTelegramMessage(token, chatID, "Поддержка ATS WALLET. Работаем круглосуточно. Напишите ваше сообщение — ответим в этом чате.")
			c.JSON(http.StatusOK, gin.H{"ok": true})
			return
		}

		if userID, ok := pendingReplies[chatID]; ok {
			delete(pendingReplies, chatID)
			text := update.Message.Text
			if text == "" && update.Message.Caption != "" {
				text = update.Message.Caption
			}
			if strings.HasPrefix(userID, "tg:") {
				var tgUserID int64
				if _, err := fmt.Sscanf(userID, "tg:%d", &tgUserID); err == nil && tgUserID != 0 {
					if len(update.Message.Photo) > 0 {
						fileID := update.Message.Photo[len(update.Message.Photo)-1].FileID
						h.sendTelegramPhoto(token, tgUserID, 0, fileID, text)
					} else if update.Message.Document != nil {
						h.sendTelegramDocument(token, tgUserID, 0, update.Message.Document.FileID, text)
					} else if text != "" {
						h.sendTelegramMessage(token, tgUserID, text)
					}
				}
			} else {
				msg := models.SupportMessage{
					UserID:    userID,
					Message:   text,
					IsAdmin:   true,
					CreatedAt: time.Now(),
				}
				if err := h.DB.Create(&msg).Error; err == nil {
					if h.Notifier != nil {
						excerpt := msg.Message
						if len(excerpt) > 200 {
							excerpt = excerpt[:200] + "..."
						}
						h.Notifier.NotifyToUser(userID, "support", "Ответ поддержки: "+excerpt)
					}
				}
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *SupportHandler) answerCallback(token, callbackID, text string) {
	payload := map[string]interface{}{
		"callback_query_id": callbackID,
		"text":              text,
		"show_alert":        false,
	}
	data, _ := json.Marshal(payload)
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/answerCallbackQuery", token),
		"application/json",
		bytes.NewBuffer(data),
	)
	if err != nil {
		return
	}
	resp.Body.Close()
}

func (h *SupportHandler) sendTelegramMessage(token string, chatID int64, text string) {
	h.sendTelegramMessageToThread(token, chatID, 0, text)
}

func (h *SupportHandler) sendTelegramMessageToThread(token string, chatID int64, threadID int, text string) {
	payload := map[string]interface{}{
		"chat_id": chatID,
		"text":    text,
		"parse_mode": "HTML",
	}
	if threadID > 0 {
		payload["message_thread_id"] = threadID
	}
	data, _ := json.Marshal(payload)
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/sendMessage", token),
		"application/json",
		bytes.NewBuffer(data),
	)
	if err != nil {
		log.Printf("[SupportBot] sendMessage error: %v", err)
		return
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
	}
	if json.Unmarshal(body, &result) == nil && !result.OK && result.Description != "" {
		log.Printf("[SupportBot] sendMessage API error (chat_id=%d thread_id=%d): %s", chatID, threadID, result.Description)
		h.supportLog(fmt.Sprintf("sendMessage FAIL chat_id=%d thread_id=%d err=%s", chatID, threadID, result.Description))
	}
}

func (h *SupportHandler) sendTelegramPhoto(token string, chatID int64, threadID int, fileID, caption string) {
	payload := map[string]interface{}{
		"chat_id": chatID,
		"photo":   fileID,
		"parse_mode": "HTML",
	}
	if threadID > 0 {
		payload["message_thread_id"] = threadID
	}
	if caption != "" {
		payload["caption"] = caption
	}
	data, _ := json.Marshal(payload)
	resp, err := http.Post(fmt.Sprintf("https://api.telegram.org/bot%s/sendPhoto", token), "application/json", bytes.NewBuffer(data))
	if err != nil {
		log.Printf("[SupportBot] sendPhoto error: %v", err)
		return
	}
	resp.Body.Close()
}

func (h *SupportHandler) sendTelegramDocument(token string, chatID int64, threadID int, fileID, caption string) {
	payload := map[string]interface{}{
		"chat_id": chatID,
		"document": fileID,
		"parse_mode": "HTML",
	}
	if threadID > 0 {
		payload["message_thread_id"] = threadID
	}
	if caption != "" {
		payload["caption"] = caption
	}
	data, _ := json.Marshal(payload)
	resp, err := http.Post(fmt.Sprintf("https://api.telegram.org/bot%s/sendDocument", token), "application/json", bytes.NewBuffer(data))
	if err != nil {
		log.Printf("[SupportBot] sendDocument error: %v", err)
		return
	}
	resp.Body.Close()
}

// createForumTopic создаёт тему в группе-форуме. Возвращает (message_thread_id, ""). При ошибке — (0, описание).
func (h *SupportHandler) createForumTopic(token string, chatID int64, name string) (threadID int, errDesc string) {
	h.supportLog(fmt.Sprintf("createForumTopic group_id=%d name=%s", chatID, name))
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"name":       name,
		"icon_color": 7322096,
	}
	data, _ := json.Marshal(payload)
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/createForumTopic", token),
		"application/json",
		bytes.NewBuffer(data),
	)
	if err != nil {
		log.Printf("[SupportBot] createForumTopic error: %v", err)
		h.supportLog(fmt.Sprintf("createForumTopic request err=%v", err))
		return 0, err.Error()
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	var result struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		Result      struct {
			MessageThreadID int `json:"message_thread_id"`
		} `json:"result"`
	}
	if err := json.Unmarshal(body, &result); err != nil || !result.OK {
		desc := result.Description
		if desc == "" {
			desc = "unknown error"
		}
		log.Printf("[SupportBot] createForumTopic API error: %s", desc)
		h.supportLog(fmt.Sprintf("createForumTopic FAIL group_id=%d desc=%s body=%s", chatID, desc, strings.TrimSpace(string(body))))
		return 0, desc
	}
	tid := result.Result.MessageThreadID
	h.supportLog(fmt.Sprintf("createForumTopic OK group_id=%d thread_id=%d", chatID, tid))
	return tid, ""
}

func (h *SupportHandler) SetSupportBotWebhook(c *gin.Context) {
	token := h.getSupportBotToken()
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Токен бота не настроен"})
		return
	}

	var body struct {
		WebhookURL string `json:"webhookUrl"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.WebhookURL == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "webhookUrl required"})
		return
	}

	payload := map[string]string{"url": body.WebhookURL}
	data, _ := json.Marshal(payload)
	resp, err := http.Post(
		fmt.Sprintf("https://api.telegram.org/bot%s/setWebhook", token),
		"application/json",
		bytes.NewBuffer(data),
	)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка установки вебхука"})
		return
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	h.supportLog("admin set_webhook url=" + body.WebhookURL)
	c.JSON(http.StatusOK, result)
}

func (h *SupportHandler) getSupportBotUsername() string {
	token := h.getSupportBotToken()
	if token == "" {
		return ""
	}
	resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getMe", token))
	if err != nil {
		return ""
	}
	defer resp.Body.Close()
	var result struct {
		OK bool `json:"ok"`
		Result struct {
			Username string `json:"username"`
		} `json:"result"`
	}
	if json.NewDecoder(resp.Body).Decode(&result) != nil || !result.OK || result.Result.Username == "" {
		return ""
	}
	username := strings.TrimSpace(result.Result.Username)
	if username != "" {
		h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "support_bot_username", username)
	}
	return username
}

func (h *SupportHandler) GetSupportBotInfo(c *gin.Context) {
	token := h.getSupportBotToken()
	chatID := h.getSupportBotChatID()
	groupID := h.getSupportGroupID()
	supportBotUsername := ""
	webhookURL := ""
	if token != "" {
		supportBotUsername = h.getSupportBotUsername()
		if supportBotUsername == "" {
			var setting models.AppSetting
			if h.DB.Where("k = ?", "support_bot_username").First(&setting).Error == nil {
				supportBotUsername = strings.TrimSpace(setting.V)
			}
		}
		// Текущий вебхук в Telegram — чтобы админ видел, куда бот шлёт обновления (API возвращает "url" в нижнем регистре)
		if resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getWebhookInfo", token)); err == nil {
			defer resp.Body.Close()
			var whResult struct {
				OK     bool `json:"ok"`
				Result struct {
					URL string `json:"url"`
				} `json:"result"`
			}
			if json.NewDecoder(resp.Body).Decode(&whResult) == nil && whResult.OK {
				webhookURL = strings.TrimSpace(whResult.Result.URL)
			}
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"configured":          token != "",
		"chatLinked":          chatID != "",
		"supportGroupId":      groupID,
		"supportBotUsername":  supportBotUsername,
		"webhookUrl":          webhookURL,
	})
}

// GetSupportChatInfo вызывает Telegram getChat для указанного groupId и возвращает тип чата и is_forum (включены ли темы).
func (h *SupportHandler) GetSupportChatInfo(c *gin.Context) {
	token := h.getSupportBotToken()
	if token == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Токен бота не настроен"})
		return
	}
	groupIDStr := strings.TrimSpace(c.Query("groupId"))
	if groupIDStr == "" {
		groupIDStr = h.getSupportGroupID()
	}
	if groupIDStr == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Укажите groupId в query или сохраните ID группы в настройках"})
		return
	}
	var groupID int64
	if _, err := fmt.Sscanf(groupIDStr, "%d", &groupID); err != nil || groupID == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Некорректный ID группы (нужно число, например -1003782777869)"})
		return
	}
	resp, err := http.Get(fmt.Sprintf("https://api.telegram.org/bot%s/getChat?chat_id=%d", token, groupID))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка запроса к Telegram"})
		return
	}
	defer resp.Body.Close()
	var chatResult struct {
		OK          bool   `json:"ok"`
		Description string `json:"description"`
		Result      struct {
			ID      int64  `json:"id"`
			Type    string `json:"type"`
			Title   string `json:"title"`
			IsForum bool   `json:"is_forum"`
		} `json:"result"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&chatResult); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка разбора ответа"})
		return
	}
	if !chatResult.OK {
		h.supportLog(fmt.Sprintf("getChat FAIL group_id=%d desc=%s", groupID, chatResult.Description))
		c.JSON(http.StatusOK, gin.H{
			"ok": false, "error": chatResult.Description,
			"hint": "Чат не найден или бот не добавлен в группу. Добавьте бота в группу и повторите проверку.",
		})
		return
	}
	h.supportLog(fmt.Sprintf("getChat OK group_id=%d type=%s is_forum=%v title=%s", groupID, chatResult.Result.Type, chatResult.Result.IsForum, chatResult.Result.Title))
	c.JSON(http.StatusOK, gin.H{
		"ok":          true,
		"chatId":      chatResult.Result.ID,
		"type":        chatResult.Result.Type,
		"title":       chatResult.Result.Title,
		"isForum":     chatResult.Result.IsForum,
		"isForumHint": "Темы включены. createForumTopic должен работать.",
		"notForumHint": "В этой группе у Telegram отключены темы (is_forum=false). В настройках группы включите «Темы» (Topics). Группа должна быть супергруппой.",
	})
}

func (h *SupportHandler) SetSupportGroupID(c *gin.Context) {
	var body struct {
		GroupID string `json:"groupId"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "groupId required"})
		return
	}
	v := strings.TrimSpace(body.GroupID)
	h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "support_group_id", v)
	// При смене группы старые thread_id невалидны — очищаем привязки
	h.DB.Exec("DELETE FROM support_telegram_threads")
	h.DB.Exec("DELETE FROM support_app_threads")
	h.supportLog("admin set_group_id=" + v + " (telegram_threads and app_threads cleared)")
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ClearSupportGroupData удаляет из БД ID группы и все привязки тем. После этого используется только SUPPORT_GROUP_ID из ENV.
func (h *SupportHandler) ClearSupportGroupData(c *gin.Context) {
	h.DB.Exec("DELETE FROM app_settings WHERE k = ?", "support_group_id")
	h.DB.Exec("DELETE FROM support_telegram_threads")
	h.DB.Exec("DELETE FROM support_app_threads")
	h.supportLog("admin clear_group_data (support_group_id + telegram_threads + app_threads)")
	c.JSON(http.StatusOK, gin.H{"ok": true, "message": "ID группы и привязки тем очищены. Используется SUPPORT_GROUP_ID из ENV."})
}

// GetSupportBotLog возвращает последние строки support_bot.log для админки.
func (h *SupportHandler) GetSupportBotLog(c *gin.Context) {
	path := h.SupportBotLogPath
	if path == "" {
		path = "support_bot.log"
	}
	h.supportLogMu.Lock()
	f, err := os.Open(path)
	h.supportLogMu.Unlock()
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"lines": []string{}, "raw": ""})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"message": "log read failed"})
		return
	}
	defer f.Close()
	sc := bufio.NewScanner(f)
	sc.Buffer(nil, 1024*1024)
	var lines []string
	for sc.Scan() {
		lines = append(lines, sc.Text())
	}
	if len(lines) > 2000 {
		lines = lines[len(lines)-2000:]
	}
	raw := strings.Join(lines, "\n")
	if raw != "" {
		raw += "\n"
	}
	c.JSON(http.StatusOK, gin.H{"lines": lines, "raw": raw})
}

// UploadSupportFile загружает файл (фото или PDF) для чата поддержки.
func (h *SupportHandler) UploadSupportFile(c *gin.Context) {
	file, header, err := c.Request.FormFile("file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Файл не указан"})
		return
	}
	defer file.Close()

	if header.Size > maxSupportFileSize {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Файл слишком большой (макс. 10 МБ)"})
		return
	}

	ct := header.Header.Get("Content-Type")
	attachmentType := ""
	ext := filepath.Ext(header.Filename)
	switch {
	case strings.HasPrefix(ct, "image/"):
		attachmentType = "image"
		if ext == "" {
			ext = ".jpg"
		}
	case ct == "application/pdf" || strings.HasSuffix(strings.ToLower(header.Filename), ".pdf"):
		attachmentType = "pdf"
		ext = ".pdf"
	default:
		c.JSON(http.StatusBadRequest, gin.H{"message": "Допустимы только изображения и PDF"})
		return
	}

	b := make([]byte, 16)
	if _, err := rand.Read(b); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка загрузки"})
		return
	}
	name := hex.EncodeToString(b) + ext
	if err := os.MkdirAll(supportUploadDir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка загрузки"})
		return
	}
	path := filepath.Join(supportUploadDir, name)
	dst, err := os.Create(path)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка загрузки"})
		return
	}
	defer dst.Close()
	if _, err := io.Copy(dst, file); err != nil {
		os.Remove(path)
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка загрузки"})
		return
	}

	url := "/support-files/" + name
	c.JSON(http.StatusOK, gin.H{"url": url, "attachmentType": attachmentType})
}

// ServeSupportFile отдаёт загруженный файл по имени.
func (h *SupportHandler) ServeSupportFile(c *gin.Context) {
	name := c.Param("name")
	if name == "" || strings.Contains(name, "..") {
		c.Status(http.StatusNotFound)
		return
	}
	path := filepath.Join(supportUploadDir, name)
	f, err := os.Open(path)
	if err != nil {
		c.Status(http.StatusNotFound)
		return
	}
	defer f.Close()
	stat, _ := f.Stat()
	if stat.IsDir() {
		c.Status(http.StatusNotFound)
		return
	}
	ct := "application/octet-stream"
	if strings.HasSuffix(strings.ToLower(name), ".pdf") {
		ct = "application/pdf"
	} else if strings.HasSuffix(strings.ToLower(name), ".png") {
		ct = "image/png"
	} else if strings.HasSuffix(strings.ToLower(name), ".jpg") || strings.HasSuffix(strings.ToLower(name), ".jpeg") {
		ct = "image/jpeg"
	} else if strings.HasSuffix(strings.ToLower(name), ".gif") {
		ct = "image/gif"
	} else if strings.HasSuffix(strings.ToLower(name), ".webp") {
		ct = "image/webp"
	}
	c.Header("Content-Type", ct)
	io.Copy(c.Writer, f)
}
