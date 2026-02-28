package handlers

import (
	"net/http"
	"strings"

	"ats-wallet/internal/version"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

// PublicHandler обрабатывает публичные запросы (без авторизации)
type PublicHandler struct {
	DB *gorm.DB
}

// GetPublicSettings возвращает публичные настройки приложения
// Например: имена Telegram ботов для входа и техподдержки
func (h *PublicHandler) GetPublicSettings(c *gin.Context) {
	var botUsername string
	h.DB.Table("app_settings").Where("k = ?", "telegram_bot_username").Select("v").Scan(&botUsername)
	botUsername = strings.TrimSpace(botUsername)
	if botUsername == "" {
		botUsername = "ats_wallet_bot"
	}

	var supportBotUsername string
	h.DB.Table("app_settings").Where("k = ?", "support_bot_username").Select("v").Scan(&supportBotUsername)
	supportBotUsername = strings.TrimSpace(supportBotUsername)

	c.JSON(http.StatusOK, gin.H{
		"telegramBotUsername":  botUsername,
		"supportBotUsername":   supportBotUsername,
		"appVersion":           version.Version,
	})
}
