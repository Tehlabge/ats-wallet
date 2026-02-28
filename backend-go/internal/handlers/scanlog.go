package handlers

import (
	"bufio"
	"encoding/json"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"ats-wallet/internal/models"
)

const componentLogUsersKey = "component_log_user_ids"

var allowedComponents = map[string]bool{"scanner": true, "chat": true, "biometry": true, "miniapp": true, "auth": true}

// ScanLogHandler пишет и отдаёт лог событий сканера и клиентские ошибки.
type ScanLogHandler struct {
	LogPath         string
	LinksLogPath    string // отдельный лог со списком распознанных ссылок
	ClientErrorPath string
	mu              sync.Mutex
}

// ComponentLogHandler — логи по компонентам (сканер, чат, биометрия, запуск мини-аппа) для выбранных пользователей.
type ComponentLogHandler struct {
	DB     *gorm.DB
	LogDir string
	mu     sync.Mutex
}

func (h *ComponentLogHandler) getEnabledUserIDs() ([]string, error) {
	var raw string
	if err := h.DB.Table("app_settings").Where("k = ?", componentLogUsersKey).Select("v").Scan(&raw).Error; err != nil || raw == "" {
		return nil, nil
	}
	var ids []string
	_ = json.Unmarshal([]byte(raw), &ids)
	return ids, nil
}

func (h *ComponentLogHandler) userEnabled(userID string) bool {
	ids, err := h.getEnabledUserIDs()
	if err != nil || ids == nil {
		return false
	}
	for _, id := range ids {
		if id == userID {
			return true
		}
	}
	return false
}

// Append принимает лог от клиента и пишет в файл, если пользователь в списке.
func (h *ComponentLogHandler) Append(c *gin.Context) {
	userID, _ := c.Get("userId")
	if userID == nil {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "auth required"})
		return
	}
	uid := userID.(string)
	if !h.userEnabled(uid) {
		c.JSON(http.StatusOK, gin.H{"ok": true})
		return
	}
	var req struct {
		Component string          `json:"component"`
		Message   string          `json:"message"`
		Extra     json.RawMessage `json:"extra"`
	}
	if err := c.ShouldBindJSON(&req); err != nil || req.Component == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "component required"})
		return
	}
	if !allowedComponents[req.Component] {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid component"})
		return
	}
	dir := h.LogDir
	if dir == "" {
		dir = "logs"
	}
	if err := os.MkdirAll(dir, 0755); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "log dir failed"})
		return
	}
	entry := map[string]interface{}{
		"time":    time.Now().UTC().Format(time.RFC3339),
		"userId":  uid,
		"message": req.Message,
	}
	if len(req.Extra) > 0 {
		entry["extra"] = json.RawMessage(req.Extra)
	}
	line, _ := json.Marshal(entry)
	line = append(line, '\n')

	fpath := filepath.Join(dir, req.Component+".log")
	h.mu.Lock()
	f, err := os.OpenFile(fpath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		h.mu.Unlock()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "log write failed"})
		return
	}
	_, _ = f.Write(line)
	_ = f.Close()
	h.mu.Unlock()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetLogUsers возвращает список userId с включённым логированием (для админки).
func (h *ComponentLogHandler) GetLogUsers(c *gin.Context) {
	ids, _ := h.getEnabledUserIDs()
	if ids == nil {
		ids = []string{}
	}
	c.JSON(http.StatusOK, gin.H{"userIds": ids})
}

// SetLogUsers сохраняет список userId с включённым логированием.
func (h *ComponentLogHandler) SetLogUsers(c *gin.Context) {
	var req struct {
		UserIDs []string `json:"userIds"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "userIds required"})
		return
	}
	raw, _ := json.Marshal(req.UserIDs)
	err := h.DB.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", componentLogUsersKey, string(raw)).Error
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "save failed"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetLog возвращает содержимое лог-файла по компоненту (scanner, chat, biometry, miniapp).
func (h *ComponentLogHandler) GetLog(c *gin.Context) {
	component := strings.TrimSpace(c.Query("component"))
	if component == "" || !allowedComponents[component] {
		c.JSON(http.StatusBadRequest, gin.H{"message": "component required: scanner|chat|biometry|miniapp"})
		return
	}
	dir := h.LogDir
	if dir == "" {
		dir = "logs"
	}
	fpath := filepath.Join(dir, component+".log")
	h.mu.Lock()
	f, err := os.Open(fpath)
	h.mu.Unlock()
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"lines": []string{}, "raw": ""})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"message": "log read failed"})
		return
	}
	defer f.Close()
	var lines []string
	sc := bufio.NewScanner(f)
	sc.Buffer(nil, 1024*1024)
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

// GetLogUsersWithDetails возвращает пользователей с включённым логированием и их имена (для админ-страницы).
func (h *ComponentLogHandler) GetLogUsersWithDetails(c *gin.Context) {
	ids, _ := h.getEnabledUserIDs()
	if ids == nil {
		ids = []string{}
	}
	if len(ids) == 0 {
		c.JSON(http.StatusOK, gin.H{"users": []gin.H{}})
		return
	}
	var users []models.User
	h.DB.Where("id IN ?", ids).Find(&users)
	byID := make(map[string]gin.H)
	for _, u := range users {
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
			displayName = u.ID
			if len(displayName) > 12 {
				displayName = displayName[:12] + "…"
			}
		}
		digId := ""
		if u.DigitalID != nil {
			digId = *u.DigitalID
		}
		byID[u.ID] = gin.H{"userId": u.ID, "displayName": displayName, "digitalId": digId}
	}
	var list []gin.H
	for _, id := range ids {
		if v, ok := byID[id]; ok {
			list = append(list, v)
		} else {
			list = append(list, gin.H{"userId": id, "displayName": id, "digitalId": ""})
		}
	}
	c.JSON(http.StatusOK, gin.H{"users": list})
}

// ScanLogEntry — одна запись лога (отправляется с клиента + дополняется на сервере).
type ScanLogEntry struct {
	Time    string `json:"time"`    // серверное время при записи
	Source  string `json:"source"`  // camera | paste | manual
	Decoded string `json:"decoded"` // сырой текст с QR / вставки
	Cleaned string `json:"cleaned,omitempty"`
	Outcome string `json:"outcome"`  // ok | not_nspk | error | throttle
	Message string `json:"message,omitempty"`
	UserID  string `json:"userId,omitempty"`
}

func (h *ScanLogHandler) Append(c *gin.Context) {
	var req struct {
		Source  string `json:"source"`
		Decoded string `json:"decoded"`
		Cleaned string `json:"cleaned"`
		Outcome string `json:"outcome"`
		Message string `json:"message"`
		UserID  string `json:"userId"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "invalid body"})
		return
	}
	if req.Source == "" {
		req.Source = "camera"
	}
	if req.Outcome == "" {
		req.Outcome = "ok"
	}
	entry := ScanLogEntry{
		Time:    time.Now().UTC().Format(time.RFC3339),
		Source:  req.Source,
		Decoded: req.Decoded,
		Cleaned: req.Cleaned,
		Outcome: req.Outcome,
		Message: req.Message,
	}
	line, _ := json.Marshal(entry)
	line = append(line, '\n')

	path := h.LogPath
	if path == "" {
		path = "scan.log"
	}
	h.mu.Lock()
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		h.mu.Unlock()
		c.JSON(http.StatusInternalServerError, gin.H{"message": "log write failed"})
		return
	}
	_, _ = f.Write(line)
	_ = f.Close()

	// В отдельный лог — все распознанные ссылки/текст; подряд идущие дубликаты не пишем
	linksPath := h.LinksLogPath
	if linksPath == "" {
		linksPath = "scan_links.log"
	}
	linkText := strings.TrimSpace(req.Cleaned)
	if linkText == "" {
		linkText = strings.TrimSpace(req.Decoded)
	}
	if linkText != "" {
		userID := strings.TrimSpace(req.UserID)
		var lastLink string
		rf, err := os.Open(linksPath)
		if err == nil {
			sc := bufio.NewScanner(rf)
			sc.Buffer(nil, 1024*1024)
			for sc.Scan() {
				line := sc.Text()
				if line == "" {
					continue
				}
				parts := strings.SplitN(line, "\t", 3)
				if len(parts) >= 2 {
					lastLink = parts[len(parts)-1]
				} else {
					lastLink = line
				}
			}
			_ = rf.Close()
		}
		if lastLink != linkText {
			linkLine := entry.Time + "\t" + userID + "\t" + linkText + "\n"
			lf, err := os.OpenFile(linksPath, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
			if err == nil {
				_, _ = lf.WriteString(linkLine)
				_ = lf.Close()
			}
		}
	}
	h.mu.Unlock()

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetScanLogs возвращает содержимое лог-файла сканера (для админки).
func (h *ScanLogHandler) GetScanLogs(c *gin.Context) {
	path := h.LogPath
	if path == "" {
		path = "scan.log"
	}
	h.mu.Lock()
	f, err := os.Open(path)
	h.mu.Unlock()
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"lines": []string{}, "raw": ""})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"message": "log read failed"})
		return
	}
	defer f.Close()

	var lines []string
	sc := bufio.NewScanner(f)
	const maxLineLen = 1024 * 1024
	sc.Buffer(nil, maxLineLen)
	for sc.Scan() {
		lines = append(lines, sc.Text())
	}
	_ = sc.Err()

	// Последние 2000 строк (свежие внизу)
	if len(lines) > 2000 {
		lines = lines[len(lines)-2000:]
	}

	raw := ""
	for _, l := range lines {
		raw += l + "\n"
	}

	c.JSON(http.StatusOK, gin.H{"lines": lines, "raw": raw})
}

// ScanLinkEntry — одна запись лога ссылок для ответа API (время в нормальном формате, фильтры).
type ScanLinkEntry struct {
	Time         string `json:"time"`          // RFC3339
	TimeFormatted string `json:"timeFormatted"` // DD.MM.YYYY HH:MM:SS
	UserID       string `json:"userId"`
	Link         string `json:"link"`
}

// GetScanLinksLog возвращает лог ссылок с человекочитаемым временем и фильтрами по userId и времени.
func (h *ScanLogHandler) GetScanLinksLog(c *gin.Context) {
	path := h.LinksLogPath
	if path == "" {
		path = "scan_links.log"
	}
	filterUserID := strings.TrimSpace(c.Query("userId"))
	filterFrom := strings.TrimSpace(c.Query("from"))
	filterTo := strings.TrimSpace(c.Query("to"))

	h.mu.Lock()
	f, err := os.Open(path)
	h.mu.Unlock()
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"entries": []ScanLinkEntry{}, "raw": ""})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"message": "log read failed"})
		return
	}
	defer f.Close()

	var entries []ScanLinkEntry
	sc := bufio.NewScanner(f)
	sc.Buffer(nil, 1024*1024)
	const timeLayout = "02.01.2006 15:04:05"
	for sc.Scan() {
		line := sc.Text()
		if line == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 3)
		var timeStr, userID, link string
		if len(parts) == 3 {
			timeStr, userID, link = parts[0], parts[1], parts[2]
		} else if len(parts) == 2 {
			timeStr, link = parts[0], parts[1]
		} else {
			continue
		}
		t, errParse := time.Parse(time.RFC3339, timeStr)
		if errParse != nil {
			t = time.Now().UTC()
		}
		if filterUserID != "" && !strings.Contains(strings.ToLower(userID), strings.ToLower(filterUserID)) {
			continue
		}
		if filterFrom != "" {
			var from time.Time
			if from, errParse = time.Parse(time.RFC3339, filterFrom); errParse != nil {
				from, _ = time.Parse("2006-01-02", filterFrom)
			}
			if t.Before(from) {
				continue
			}
		}
		if filterTo != "" {
			var to time.Time
			if to, errParse = time.Parse(time.RFC3339, filterTo); errParse != nil {
				to, _ = time.Parse("2006-01-02", filterTo)
			}
			to = to.Add(24*time.Hour - time.Nanosecond)
			if t.After(to) {
				continue
			}
		}
		entries = append(entries, ScanLinkEntry{
			Time:          timeStr,
			TimeFormatted: t.Format(timeLayout),
			UserID:        userID,
			Link:          link,
		})
	}
	if len(entries) > 2000 {
		entries = entries[len(entries)-2000:]
	}
	var rawLines []string
	for _, e := range entries {
		rawLines = append(rawLines, e.TimeFormatted+"\t"+e.UserID+"\t"+e.Link)
	}
	raw := strings.Join(rawLines, "\n")
	if raw != "" {
		raw += "\n"
	}
	c.JSON(http.StatusOK, gin.H{"entries": entries, "raw": raw})
}

// AppendClientError пишет клиентскую ошибку (window.onerror / unhandledrejection) в лог-файл.
func (h *ScanLogHandler) AppendClientError(c *gin.Context) {
	var req struct {
		Message string `json:"message"`
		Stack   string `json:"stack"`
		URL     string `json:"url"`
	}
	_ = c.ShouldBindJSON(&req)
	if req.Message == "" {
		req.Message = "unknown"
	}
	entry := map[string]string{
		"time":    time.Now().UTC().Format(time.RFC3339),
		"message": req.Message,
		"stack":   req.Stack,
		"url":     req.URL,
	}
	line, _ := json.Marshal(entry)
	line = append(line, '\n')

	path := h.ClientErrorPath
	if path == "" {
		path = "client_errors.log"
	}
	h.mu.Lock()
	f, err := os.OpenFile(path, os.O_CREATE|os.O_WRONLY|os.O_APPEND, 0644)
	if err != nil {
		h.mu.Unlock()
		c.JSON(http.StatusOK, gin.H{"ok": false})
		return
	}
	_, _ = f.Write(line)
	_ = f.Close()
	h.mu.Unlock()
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// GetClientErrorLogs возвращает содержимое client_errors.log для админки.
func (h *ScanLogHandler) GetClientErrorLogs(c *gin.Context) {
	path := h.ClientErrorPath
	if path == "" {
		path = "client_errors.log"
	}
	h.mu.Lock()
	f, err := os.Open(path)
	h.mu.Unlock()
	if err != nil {
		if os.IsNotExist(err) {
			c.JSON(http.StatusOK, gin.H{"lines": []string{}, "raw": ""})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{"message": "log read failed"})
		return
	}
	defer f.Close()

	var lines []string
	sc := bufio.NewScanner(f)
	const maxLineLen = 1024 * 1024
	sc.Buffer(nil, maxLineLen)
	for sc.Scan() {
		lines = append(lines, sc.Text())
	}
	if len(lines) > 2000 {
		lines = lines[len(lines)-2000:]
	}
	raw := ""
	for _, l := range lines {
		raw += l + "\n"
	}
	c.JSON(http.StatusOK, gin.H{"lines": lines, "raw": raw})
}
