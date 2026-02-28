package notify

import (
	"bytes"
	"encoding/json"
	"log"
	"net/http"
	"strconv"
	"strings"
	"time"

	"gorm.io/gorm"

	"ats-wallet/internal/models"
)

// Rule — правило уведомления админов.
type Rule struct {
	TelegramChatIDs []string `json:"telegramChatIds"` // ID чатов (админов) для уведомления
	Events          []string `json:"events"`          // withdrawal_request, payment_request, support_message, security_code_reset
	UserIDs         []string `json:"userIds"`         // пусто = все пользователи; иначе только эти
	FromHour        *int     `json:"fromHour"`        // 0-23, начало окна (включительно)
	ToHour          *int     `json:"toHour"`          // 0-23, конец окна (включительно)
}

// AppSettingKey — ключ в app_settings для хранения правил уведомлений.
const AppSettingKey = "admin_notification_rules"

// TemplatesKey — ключ для шаблонов текста уведомлений (event -> текст с {{user}}, {{message}}, {{sumRub}}, {{sumUsdt}} и т.д.).
const TemplatesKey = "admin_notification_templates"

// Notifier отправляет уведомления админам в Telegram по правилам из app_settings
// и пользователям (deposit/withdraw) с кнопкой «Открыть кошелёк».
type Notifier struct {
	DB        *gorm.DB
	BotToken  string
	WebAppURL string // URL Mini App для кнопки «Открыть кошелёк»
}

// Notify отправляет сообщение админам по правилам для данного события.
// Если в app_settings задан шаблон для event, подставляются {{user}} и {{message}}; иначе уходит message как есть.
func (n *Notifier) Notify(event, userID, message string) {
	if n.BotToken == "" {
		return
	}
	userID = strings.TrimSpace(userID)
	userShort := userID
	if len(userShort) > 8 {
		userShort = userShort[:8] + "…"
	}
	text := message
	var templates map[string]string
	var rawTpl string
	if err := n.DB.Table("app_settings").Where("k = ?", TemplatesKey).Select("v").Scan(&rawTpl).Error; err == nil && rawTpl != "" {
		_ = json.Unmarshal([]byte(rawTpl), &templates)
		if tpl, ok := templates[event]; ok && tpl != "" {
			text = strings.ReplaceAll(tpl, "{{user}}", userShort)
			text = strings.ReplaceAll(text, "{{message}}", message)
		}
	}

	var rules []Rule
	var raw string
	if err := n.DB.Table("app_settings").Where("k = ?", AppSettingKey).Select("v").Scan(&raw).Error; err != nil || raw == "" {
		return
	}
	if err := json.Unmarshal([]byte(raw), &rules); err != nil {
		return
	}
	now := time.Now()
	hour := now.Hour()

	for _, r := range rules {
		if !contains(r.Events, event) {
			continue
		}
		if len(r.UserIDs) > 0 && !contains(r.UserIDs, userID) {
			continue
		}
		if r.FromHour != nil && r.ToHour != nil {
			from, to := *r.FromHour, *r.ToHour
			if from <= to {
				if hour < from || hour > to {
					continue
				}
			} else {
				if hour > to && hour < from {
					continue
				}
			}
		}
		for _, chatIDStr := range r.TelegramChatIDs {
			chatIDStr = strings.TrimSpace(chatIDStr)
			if chatIDStr == "" {
				continue
			}
			chatID, err := strconv.ParseInt(chatIDStr, 10, 64)
			if err != nil {
				continue
			}
			n.sendTelegram(chatID, text)
			time.Sleep(50 * time.Millisecond)
		}
	}
}

func contains(s []string, x string) bool {
	for _, v := range s {
		if v == x {
			return true
		}
	}
	return false
}

func (n *Notifier) sendTelegram(chatID int64, text string) {
	n.sendTelegramWithButton(chatID, text, "")
}

// sendTelegramWithButton отправляет сообщение в Telegram; если webAppURL не пустой — добавляет кнопку «Открыть кошелёк» (web_app).
func (n *Notifier) sendTelegramWithButton(chatID int64, text, webAppURL string) {
	payload := map[string]interface{}{
		"chat_id":    chatID,
		"text":       text,
		"parse_mode": "HTML",
	}
	if webAppURL != "" {
		payload["reply_markup"] = map[string]interface{}{
			"inline_keyboard": [][]map[string]interface{}{
				{
					{"text": "Открыть кошелёк", "web_app": map[string]string{"url": webAppURL}},
				},
			},
		}
	}
	body, _ := json.Marshal(payload)
	resp, err := http.Post("https://api.telegram.org/bot"+n.BotToken+"/sendMessage", "application/json", bytes.NewReader(body))
	if err != nil {
		log.Printf("[Notify] sendMessage error: %v", err)
		return
	}
	resp.Body.Close()
}

// Event types for user notifications (must match prefs).
const (
	UserEventDeposit  = "deposit"  // пополнение баланса
	UserEventWithdraw = "withdraw" // списание / вывод
	UserEventSupport  = "support"  // ответ тех поддержки
	UserEventPromo    = "promo"    // акции (для рассылки)
)

// NotifyToUser отправляет уведомление пользователю в Telegram, если у него включена соответствующая настройка.
func (n *Notifier) NotifyToUser(userID, event, message string) {
	if n.BotToken == "" || userID == "" {
		return
	}
	var u models.User
	if err := n.DB.Where("id = ?", userID).First(&u).Error; err != nil || u.TelegramID == nil || *u.TelegramID == "" {
		return
	}
	chatID, err := strconv.ParseInt(strings.TrimSpace(*u.TelegramID), 10, 64)
	if err != nil || chatID == 0 {
		return
	}
	var prefs models.UserNotificationPref
	if err := n.DB.Where("userId = ?", userID).First(&prefs).Error; err != nil {
		// нет записи — считаем все уведомления включёнными
		prefs = models.UserNotificationPref{UserID: userID, NotifDeposit: true, NotifWithdraw: true, NotifSupport: true, NotifPromo: true}
	}
	var allow bool
	switch event {
	case UserEventDeposit:
		allow = prefs.NotifDeposit
	case UserEventWithdraw:
		allow = prefs.NotifWithdraw
	case UserEventSupport:
		allow = prefs.NotifSupport
	case UserEventPromo:
		allow = prefs.NotifPromo
	default:
		return
	}
	if !allow {
		return
	}
	// Для поддержки и промо — с кнопкой «Открыть кошелёк», если задан WebAppURL
	if (event == UserEventSupport || event == UserEventPromo) && n.WebAppURL != "" {
		n.sendTelegramWithButton(chatID, message, n.WebAppURL)
		return
	}
	n.sendTelegram(chatID, message)
}

// NotifyToUserDeposit отправляет уведомление о пополнении: ссылка «пополнение» на Tronscan (если есть),
// сумма в USDT и RUB, внизу кнопка «Открыть кошелёк».
func (n *Notifier) NotifyToUserDeposit(userID, amountUsdt, amountRub, tronscanTxURL string) {
	if n.BotToken == "" || userID == "" {
		return
	}
	var u models.User
	if err := n.DB.Where("id = ?", userID).First(&u).Error; err != nil || u.TelegramID == nil || *u.TelegramID == "" {
		return
	}
	chatID, err := strconv.ParseInt(strings.TrimSpace(*u.TelegramID), 10, 64)
	if err != nil || chatID == 0 {
		return
	}
	var prefs models.UserNotificationPref
	if err := n.DB.Where("userId = ?", userID).First(&prefs).Error; err != nil {
		prefs = models.UserNotificationPref{UserID: userID, NotifDeposit: true}
	}
	if !prefs.NotifDeposit {
		return
	}
	linkPart := "Успешное пополнение."
	if tronscanTxURL != "" {
		linkPart = "Успешное <a href=\"" + escapeHTML(tronscanTxURL) + "\">пополнение</a>."
	}
	// Форматируем RUB с пробелами как тысячными разделителями (3 845,70)
	rubFormatted := formatRub(amountRub)
	text := linkPart + "\n\nВы получили " + amountUsdt + " USDT (" + rubFormatted + " RUB — по курсу на момент зачисления)."
	n.sendTelegramWithButton(chatID, text, n.WebAppURL)
}

func formatRub(s string) string {
	// "3845.70" или "3845,70" -> "3 845,70"
	s = strings.TrimSpace(s)
	if s == "" {
		return "0"
	}
	s = strings.ReplaceAll(s, ",", ".")
	idx := strings.Index(s, ".")
	intPart := s
	frac := ""
	if idx >= 0 {
		intPart = s[:idx]
		frac = strings.ReplaceAll(s[idx+1:], " ", "")
		if frac != "" {
			frac = "," + frac
		}
	}
	if intPart == "" || intPart == "-" {
		return "0" + frac
	}
	var b strings.Builder
	for i, r := range intPart {
		if i > 0 && (len(intPart)-i)%3 == 0 {
			b.WriteString(" ")
		}
		b.WriteRune(r)
	}
	b.WriteString(frac)
	return b.String()
}

func escapeHTML(s string) string {
	s = strings.ReplaceAll(s, "&", "&amp;")
	s = strings.ReplaceAll(s, "<", "&lt;")
	s = strings.ReplaceAll(s, ">", "&gt;")
	s = strings.ReplaceAll(s, "\"", "&quot;")
	return s
}

// NotifyToUserWithdraw отправляет уведомление о выводе с текстом message и кнопкой «Открыть кошелёк».
func (n *Notifier) NotifyToUserWithdraw(userID, message string) {
	if n.BotToken == "" || userID == "" {
		return
	}
	var u models.User
	if err := n.DB.Where("id = ?", userID).First(&u).Error; err != nil || u.TelegramID == nil || *u.TelegramID == "" {
		return
	}
	chatID, err := strconv.ParseInt(strings.TrimSpace(*u.TelegramID), 10, 64)
	if err != nil || chatID == 0 {
		return
	}
	var prefs models.UserNotificationPref
	if err := n.DB.Where("userId = ?", userID).First(&prefs).Error; err != nil {
		prefs = models.UserNotificationPref{UserID: userID, NotifWithdraw: true}
	}
	if !prefs.NotifWithdraw {
		return
	}
	n.sendTelegramWithButton(chatID, message, n.WebAppURL)
}
