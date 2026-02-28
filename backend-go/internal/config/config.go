package config

import (
	"os"
	"strings"
)

type Config struct {
	Port               string
	DBHost             string
	DBPort             string
	DBUser             string
	DBPass             string
	DBName             string
	DBSSLMode          string // sslmode для PostgreSQL: disable, require, verify-full
	JWTSecret          string
	AdminJWTSecret     string
	CORSOrigin         string
	TelegramBotToken    string // для проверки initData Mini App и вебхука бота
	TelegramBotUsername string // имя бота без @ для реферальной ссылки (например MyWalletBot)
	TelegramWebappURL   string // URL Mini App для кнопки в боте
	TelegramWebhookBase string // Публичный URL бэкенда для вебхука (например https://api.yourdomain.com)
	SeedEncryptionKey   string // Ключ для шифрования seed-фраз (если пусто — используется JWT_SECRET)
	TronGridURL         string // TronGrid API (например https://api.trongrid.io)
	TronGridAPIKey      string // Опционально для лимитов
	WalletPassword      string // Пароль для доступа к приватным ключам кошельков
	SupportBotToken     string // Токен бота техподдержки (Telegram)
	SupportGroupID      string // ID группы техподдержки из ENV SUPPORT_GROUP_ID (супергруппа с темами)
}

func Load() *Config {
	return &Config{
		Port:           getEnv("PORT", "4000"),
		DBHost:         getEnv("DB_HOST", "localhost"),
		DBPort:         getEnv("DB_PORT", "5432"),
		DBUser:         getEnv("DB_USERNAME", getEnv("POSTGRES_USER", "wallet")),
		DBPass:         getEnv("DB_PASSWORD", getEnv("POSTGRES_PASSWORD", "")),
		DBName:         getEnv("DB_DATABASE", getEnv("POSTGRES_DB", "wallet")),
		DBSSLMode:      getEnv("DB_SSLMODE", "disable"),
		JWTSecret:      getEnv("JWT_SECRET", "ats-wallet-secret-key"),
		AdminJWTSecret:  getEnv("ADMIN_JWT_SECRET", getEnv("ADMIN_PASSWORD", "ats-admin-secret")),
		CORSOrigin:     getEnv("CORS_ORIGIN", "http://localhost:3000"),
		TelegramBotToken:    getEnv("TELEGRAM_BOT_TOKEN", ""),
		TelegramBotUsername: getEnv("TELEGRAM_BOT_USERNAME", ""),
		TelegramWebappURL:   getEnv("TELEGRAM_WEBAPP_URL", "https://yourdomain.com"),
		TelegramWebhookBase: getEnv("TELEGRAM_WEBHOOK_BASE", "https://yourdomain.com"),
		SeedEncryptionKey:   getEnv("SEED_ENCRYPTION_KEY", getEnv("JWT_SECRET", "ats-wallet-secret-key")),
		TronGridURL:         getEnv("TRONGRID_URL", "https://api.trongrid.io"),
		TronGridAPIKey:      getEnv("TRONGRID_API_KEY", ""),
		WalletPassword:      getEnv("WALLET_PASSWORD", ""),
		SupportBotToken:     getEnv("SUPPORT_BOT_TOKEN", ""),
		SupportGroupID:      getEnv("SUPPORT_GROUP_ID", "-1003782777869"),
	}
}

func getEnv(k, def string) string {
	if v := os.Getenv(k); v != "" {
		return strings.TrimSpace(strings.ReplaceAll(v, "\r", ""))
	}
	return def
}
