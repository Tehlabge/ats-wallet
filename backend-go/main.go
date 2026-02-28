package main

import (
	"log"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"strings"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
	"gorm.io/gorm"

	"ats-wallet/internal/balancewatcher"
	"ats-wallet/internal/config"
	"ats-wallet/internal/db"
	"ats-wallet/internal/handlers"
	"ats-wallet/internal/middleware"
	"ats-wallet/internal/notify"
	"ats-wallet/internal/prometheus"
	"ats-wallet/internal/rapira"
	"ats-wallet/internal/trongrid"
	"ats-wallet/internal/wallet"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Printf("[ENV] .env not loaded: %v", err)
	} else {
		log.Printf("[ENV] .env loaded")
	}
	cfg := config.Load()
	log.Printf("[CFG] DB_HOST=%s DB_PORT=%s DB_USER=%s DB_NAME=%s", cfg.DBHost, cfg.DBPort, cfg.DBUser, cfg.DBName)
	database, err := db.New(cfg)
	if err != nil {
		log.Fatalf("DB: %v", err)
	}
	notifier := &notify.Notifier{DB: database, BotToken: cfg.TelegramBotToken, WebAppURL: cfg.TelegramWebappURL}
	// TronGrid клиент для работы с блокчейном
	tronGridClient := trongrid.NewClient(cfg.TronGridURL, cfg.TronGridAPIKey)
	
	adminH := &handlers.AdminHandler{
		DB:                database,
		AdminJWTSecret:    cfg.AdminJWTSecret,
		SeedEncryptionKey: cfg.SeedEncryptionKey,
		JWTSecret:         cfg.JWTSecret,
		Notifier:          notifier,
		TronGrid:          tronGridClient,
		WalletPassword:    cfg.WalletPassword,
	}
	authH := &handlers.AuthHandler{DB: database, JWTSecret: cfg.JWTSecret, TelegramBotToken: cfg.TelegramBotToken, TelegramBotUsername: cfg.TelegramBotUsername, SeedEncryptionKey: cfg.SeedEncryptionKey}
	publicH := &handlers.PublicHandler{DB: database}
	
	// Wallet Manager - управление кошельками TRC20 (старый менеджер для экспорта/трансферов)
	walletManager := wallet.NewManager(database, cfg.WalletPassword, cfg.SeedEncryptionKey)
	walletMgrH := handlers.NewWalletManagerHandler(walletManager, cfg.WalletPassword, cfg.TronGridURL, cfg.TronGridAPIKey)
	
	userWalletH := &handlers.WalletHandler{
		DB:       database,
		Notifier: notifier,
	}
	
	newsH := &handlers.NewsHandler{DB: database}
	supportH := &handlers.SupportHandler{DB: database, Notifier: notifier, SupportBotToken: cfg.SupportBotToken, SupportGroupID: cfg.SupportGroupID, SupportBotLogPath: "support_bot.log"}
	scanH := &handlers.ScanHandler{DB: database, Notifier: notifier}
	telegramBotH := &handlers.TelegramBotHandler{
		DB:          database,
		BotToken:    cfg.TelegramBotToken,
		WebappURL:   cfg.TelegramWebappURL,
		WebhookBase: cfg.TelegramWebhookBase,
	}
	scanLogH := &handlers.ScanLogHandler{LogPath: "scan.log", LinksLogPath: "scan_links.log", ClientErrorPath: "client_errors.log"}
	componentLogH := &handlers.ComponentLogHandler{DB: database, LogDir: "logs"}

	adminH.EnsureAdminUser()
	newsH.SeedNews()
	adminH.SeedAppSettings()

	go runRapiraRateUpdater(database)

	// Запускаем фоновую проверку депозитов на мастер-кошелёк (каждые 5 минут)
	balanceWatcher := balancewatcher.NewWatcher(database, tronGridClient, notifier, 5*time.Minute)
	balanceWatcher.Start()

	r := gin.Default()
	r.Use(cors(cfg.CORSOrigin))
	r.Use(prometheus.Middleware())
	r.Use(func(c *gin.Context) {
		log.Printf("[%s] %s %s", c.Request.Method, c.Request.URL.Path, c.Request.URL.RawQuery)
		c.Next()
	})

	// Лог сканера и клиентских ошибок (без авторизации)
	r.POST("/scan-log", scanLogH.Append)
	r.POST("/client-log", scanLogH.AppendClientError)
	// Логи по компонентам (сканер, чат, биометрия, мини-апп) — только для выбранных пользователей
	r.POST("/component-log", middleware.UserAuth(cfg.JWTSecret), componentLogH.Append)

	// Prometheus metrics (без авторизации)
	r.GET("/metrics", prometheus.Handler())

	// Публичные настройки (без авторизации)
	r.GET("/public/settings", publicH.GetPublicSettings)

	// Admin login (no auth)
	r.POST("/admin-login", adminH.Login)
	r.POST("/admin/auth/login", adminH.Login)

	// Admin routes (with auth). RequireSuper() — только для супер-админа; без него — доступ и операторам.
	admin := r.Group("/admin")
	admin.Use(middleware.AdminAuth(cfg.AdminJWTSecret))
	{
		// Просмотр пользователей - для всех админов (операторы и супер)
		admin.GET("/users", adminH.GetUsers)
		admin.GET("/user-by-query", adminH.GetUserByQuery)
		admin.GET("/user/:userId", adminH.GetUserDetail)
		admin.GET("/referrals", adminH.GetReferralsLeaderboard)
		admin.DELETE("/user/:userId", middleware.RequireSuper(), adminH.DeleteAppUser)
		
		// Только супер-админ: изменение балансов, кошельков, настроек, новостей, сессий, операторов
		admin.GET("/stats", adminH.GetStats)
		admin.GET("/pending-payments", adminH.GetPendingPayments)
		admin.GET("/payments/archive", adminH.GetPaymentArchive)
		admin.GET("/payment/:id", adminH.GetPaymentByID)
		admin.POST("/payment/:id/take", adminH.TakePaymentToWork)
		admin.POST("/confirm-payment/:id", adminH.ConfirmPayment)
		admin.POST("/reject-payment/:id", adminH.RejectPayment)
		admin.GET("/user/:userId/balance", middleware.RequireSuper(), adminH.GetUserBalance)
		admin.PATCH("/user/:userId/balance", middleware.RequireSuper(), adminH.SetUserBalance)
		admin.GET("/user/:userId/commission", middleware.RequireSuper(), adminH.GetUserCommission)
		admin.PATCH("/user/:userId/commission", middleware.RequireSuper(), adminH.SetUserCommission)
		admin.PATCH("/user/:userId/partner", middleware.RequireSuper(), adminH.PatchUserPartner)
		admin.POST("/user/:userId/balance-operation", middleware.RequireSuper(), adminH.BalanceOperation)
		admin.GET("/wallet-logs", middleware.RequireSuper(), adminH.GetWalletCreationLogs)
		admin.GET("/rate", adminH.GetRate)
		admin.PATCH("/rate", middleware.RequireSuper(), adminH.SetRate)
		admin.GET("/withdraw-commissions", middleware.RequireSuper(), adminH.GetWithdrawCommissions)
		admin.PATCH("/withdraw-commissions", middleware.RequireSuper(), adminH.SetWithdrawCommissions)
		admin.GET("/default-commission", middleware.RequireSuper(), adminH.GetDefaultCommission)
		admin.PATCH("/default-commission", middleware.RequireSuper(), adminH.SetDefaultCommission)
		admin.GET("/telegram-bot-username", middleware.RequireSuper(), adminH.GetTelegramBotUsername)
		admin.PATCH("/telegram-bot-username", middleware.RequireSuper(), adminH.SetTelegramBotUsername)
		admin.POST("/settings/support-bot-token", middleware.RequireSuper(), adminH.SetSupportBotToken)
		admin.GET("/settings/support-bot-token", middleware.RequireSuper(), adminH.GetSupportBotToken)
		admin.GET("/finance/stats", middleware.RequireSuper(), adminH.GetFinanceStats)
		admin.GET("/finance/extended", middleware.RequireSuper(), adminH.GetExtendedFinanceStats)
		admin.GET("/transactions", adminH.GetTransactions)
		admin.GET("/sessions", middleware.RequireSuper(), adminH.GetAdminSessions)
		admin.DELETE("/sessions/:id", middleware.RequireSuper(), adminH.DeleteAdminSession)
		admin.POST("/sessions/delete-batch", middleware.RequireSuper(), adminH.DeleteAdminSessionsBatch)
		admin.GET("/admins", middleware.RequireSuper(), adminH.ListAdminUsers)
		admin.POST("/admins", middleware.RequireSuper(), adminH.CreateAdminUser)
		admin.DELETE("/admins/:id", middleware.RequireSuper(), adminH.DeleteAdminUser)
		admin.PATCH("/admins/:id/password", adminH.ChangeAdminPassword)
		admin.POST("/admins/:id/login-as", middleware.RequireSuper(), adminH.LoginAsAdmin)
		admin.GET("/user/:userId/seed-check", middleware.RequireSuper(), adminH.GetUserSeedCheck)
		admin.GET("/user/:userId/action-logs", adminH.GetUserActionLogs)
		admin.GET("/operator/stats", adminH.GetOperatorStats)
		admin.GET("/operator/calendar", adminH.GetOperatorCalendarStats)
		admin.GET("/dashboard/stats", middleware.RequireSuper(), adminH.GetAdminDashboardStats)
		admin.GET("/dashboard/detailed-stats", middleware.RequireSuper(), adminH.GetDetailedStatistics)
		admin.GET("/telegram-bot-starts", middleware.RequireSuper(), adminH.GetTelegramBotStarts)
		admin.GET("/telegram-bot/webhook-info", middleware.RequireSuper(), telegramBotH.GetWebhookInfo)
		admin.POST("/telegram-bot/set-webhook", middleware.RequireSuper(), telegramBotH.SetWebhook)
		admin.POST("/telegram-bot/broadcast", middleware.RequireSuper(), telegramBotH.Broadcast)
		admin.GET("/withdrawal-requests", adminH.GetWithdrawalRequests)
		admin.POST("/withdrawal-requests/:id/approve", adminH.ApproveWithdrawalRequest)
		admin.POST("/withdrawal-requests/:id/reject", adminH.RejectWithdrawalRequest)
		admin.GET("/notification-rules", middleware.RequireSuper(), adminH.GetNotificationRules)
		admin.POST("/notification-rules", middleware.RequireSuper(), adminH.SetNotificationRules)
		admin.GET("/notification-templates", middleware.RequireSuper(), adminH.GetNotificationTemplates)
		admin.POST("/notification-templates", middleware.RequireSuper(), adminH.SetNotificationTemplates)
		admin.GET("/scan-logs", middleware.RequireSuper(), scanLogH.GetScanLogs)
		admin.GET("/scan-links", middleware.RequireSuper(), scanLogH.GetScanLinksLog)
		admin.GET("/client-logs", middleware.RequireSuper(), scanLogH.GetClientErrorLogs)
		admin.GET("/log-users", componentLogH.GetLogUsersWithDetails)
		admin.PUT("/log-users", componentLogH.SetLogUsers)
		admin.GET("/log", componentLogH.GetLog)
		
		// Авторизация по платёжному паролю (для раздела депозитов)
		admin.POST("/wallet-manager/auth", middleware.RequireSuper(), walletMgrH.Authenticate)
		
		// Управление неидентифицированными депозитами
		admin.GET("/unidentified-deposits", middleware.RequireSuper(), adminH.GetUnidentifiedDeposits)
		admin.POST("/unidentified-deposits/:id/assign", middleware.RequireSuper(), adminH.AssignUnidentifiedDeposit)
		admin.POST("/unidentified-deposits/:id/reject", middleware.RequireSuper(), adminH.RejectUnidentifiedDeposit)
		
		// Настройки депозитного кошелька
		admin.GET("/deposit-settings", middleware.RequireSuper(), adminH.GetDepositSettings)
		admin.PATCH("/deposit-settings", middleware.RequireSuper(), adminH.SetDepositSettings)
		admin.POST("/deposit-settings", middleware.RequireSuper(), adminH.SetDepositSettings)
		
		// Транзакции мастер-кошелька
		admin.GET("/wallet-transactions", middleware.RequireSuper(), adminH.GetWalletTransactions)
		admin.POST("/check-wallet-deposits", middleware.RequireSuper(), adminH.CheckWalletDepositsManual)
	}

	// Auth
	r.POST("/auth/register", authH.Register)
	r.POST("/auth/login", authH.Login)
	r.POST("/auth/telegram", authH.LoginTelegram)
	r.GET("/auth/me", middleware.UserAuth(cfg.JWTSecret), authH.Me)
	r.GET("/auth/seed", middleware.UserAuth(cfg.JWTSecret), authH.GetSeed)
	r.POST("/auth/seed-seen", middleware.UserAuth(cfg.JWTSecret), authH.ConfirmSeedSeen)
	r.POST("/auth/attach-referrer", middleware.UserAuth(cfg.JWTSecret), authH.AttachReferrer)
	r.GET("/auth/sessions", middleware.UserAuth(cfg.JWTSecret), authH.GetUserSessions)
	r.POST("/auth/sessions/revoke", middleware.UserAuth(cfg.JWTSecret), authH.RevokeUserSessions)

	// Telegram bot webhook (no auth; set in BotFather)
	r.POST("/webhook/telegram-bot", telegramBotH.Webhook)
	r.GET("/webhook/telegram-bot", telegramBotH.WebhookHealth)
	// Дублируем вебхук под /api — если на хостинге запросы к бэкенду идут только по префиксу /api
	r.POST("/api/webhook/telegram-bot", telegramBotH.Webhook)
	r.GET("/api/webhook/telegram-bot", telegramBotH.WebhookHealth)

	// Wallet (user auth)
	r.GET("/wallet/rate", userWalletH.Rate)
	r.GET("/wallet/balance", middleware.UserAuth(cfg.JWTSecret), userWalletH.Balance)
	r.GET("/wallet/transactions", middleware.UserAuth(cfg.JWTSecret), userWalletH.Transactions)
	r.GET("/wallet/deposit-address", middleware.UserAuth(cfg.JWTSecret), userWalletH.DepositAddress)
	r.GET("/wallet/withdraw-fees", middleware.UserAuth(cfg.JWTSecret), userWalletH.WithdrawFees)
	r.GET("/wallet/notification-settings", middleware.UserAuth(cfg.JWTSecret), userWalletH.GetNotificationSettings)
	r.PATCH("/wallet/notification-settings", middleware.UserAuth(cfg.JWTSecret), userWalletH.PatchNotificationSettings)
	r.POST("/wallet/withdraw-request", middleware.UserAuth(cfg.JWTSecret), userWalletH.CreateWithdrawalRequest)
	r.POST("/wallet/transfer-internal", middleware.UserAuth(cfg.JWTSecret), userWalletH.TransferInternal)
	r.GET("/wallet/referral/stats", middleware.UserAuth(cfg.JWTSecret), userWalletH.ReferralStats)
	r.POST("/wallet/referral/transfer-to-main", middleware.UserAuth(cfg.JWTSecret), userWalletH.ReferralTransferToMain)

	// News (public)
	r.GET("/news", newsH.GetNews)
	r.GET("/news/:id", newsH.GetNewsItem)

	// Scan (parse public; preview/create/status with user auth)
	r.POST("/scan/parse", scanH.Parse)
	r.POST("/scan/preview-payment", middleware.UserAuth(cfg.JWTSecret), scanH.PreviewPayment)
	r.POST("/scan/create-payment", middleware.UserAuth(cfg.JWTSecret), scanH.CreatePayment)
	r.GET("/scan/payment/:id", middleware.UserAuth(cfg.JWTSecret), scanH.GetPaymentStatus)
	r.POST("/scan/sbp", middleware.UserAuth(cfg.JWTSecret), scanH.CreatePaymentFromPayload)

	// Support (user auth)
	r.GET("/support/messages", middleware.UserAuth(cfg.JWTSecret), supportH.GetMessages)
	r.POST("/support/messages", middleware.UserAuth(cfg.JWTSecret), supportH.SendMessage)
	r.POST("/support/upload", middleware.UserAuth(cfg.JWTSecret), supportH.UploadSupportFile)
	r.POST("/support/close", middleware.UserAuth(cfg.JWTSecret), supportH.UserCloseThread)
	r.POST("/support/reopen", middleware.UserAuth(cfg.JWTSecret), supportH.UserReopenThread)
	r.GET("/support-files/:name", supportH.ServeSupportFile)

	// Admin support
	admin.GET("/support/chats", supportH.AdminGetChats)
	admin.GET("/support/threads", supportH.AdminGetChats)
	admin.POST("/support/threads/:userId/close", supportH.AdminCloseThread)
	admin.GET("/support/count", supportH.AdminGetSupportCount)
	admin.GET("/support/messages/:userId", supportH.AdminGetMessages)
	admin.POST("/support/messages/:userId", supportH.AdminSendMessage)
admin.POST("/support-bot/set-webhook", middleware.RequireSuper(), supportH.SetSupportBotWebhook)
		admin.GET("/support-bot/info", middleware.RequireSuper(), supportH.GetSupportBotInfo)
		admin.GET("/support-bot/chat-info", middleware.RequireSuper(), supportH.GetSupportChatInfo)
		admin.GET("/support-bot/log", middleware.RequireSuper(), supportH.GetSupportBotLog)
		admin.POST("/support-bot/set-group-id", middleware.RequireSuper(), supportH.SetSupportGroupID)
		admin.POST("/support-bot/clear-group-data", middleware.RequireSuper(), supportH.ClearSupportGroupData)

	// Support bot webhook (public)
	r.POST("/webhook/support-bot", supportH.SupportBotWebhook)
	// Дублируем под /api — если на хостинге к бэкенду идут только запросы с префиксом /api
	r.POST("/api/webhook/support-bot", supportH.SupportBotWebhook)

	// Admin news (super only)
	admin.GET("/news", middleware.RequireSuper(), newsH.AdminGetNews)
	admin.POST("/news", middleware.RequireSuper(), newsH.AdminCreateNews)
	admin.PATCH("/news/:id", middleware.RequireSuper(), newsH.AdminUpdateNews)
	admin.DELETE("/news/:id", middleware.RequireSuper(), newsH.AdminDeleteNews)

	log.Printf("Backend (Go) http://localhost:%s", cfg.Port)

	// Graceful shutdown
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down...")
		balanceWatcher.Stop()
		os.Exit(0)
	}()

	if err := r.Run(":" + cfg.Port); err != nil && err != http.ErrServerClosed {
		log.Fatal(err)
	}
}

func runRapiraRateUpdater(database *gorm.DB) {
	tick := time.NewTicker(5 * time.Minute)
	defer tick.Stop()
	update := func() {
		rate, err := rapira.FetchUSDTRubRate()
		if err != nil {
			log.Printf("[Rapira] fetch error: %v", err)
			return
		}
		if rate <= 0 {
			return
		}
		val := strconv.FormatFloat(rate, 'f', 4, 64)
		database.Exec("INSERT INTO app_settings (k, v) VALUES (?, ?) ON CONFLICT (k) DO UPDATE SET v = EXCLUDED.v", "usdt_rub", val)
		log.Printf("[Rapira] usdt_rub = %s", val)
	}
	update()
	for range tick.C {
		update()
	}
}

func cors(origin string) gin.HandlerFunc {
	origins := strings.Split(origin, ",")
	for i := range origins {
		origins[i] = strings.TrimSpace(origins[i])
	}
	return func(c *gin.Context) {
		o := c.Request.Header.Get("Origin")
		allow := "*"
		for _, allowed := range origins {
			if allowed != "" && (o == allowed || allowed == "*") {
				allow = o
				if allowed == "*" {
					allow = "*"
				}
				break
			}
		}
		c.Header("Access-Control-Allow-Origin", allow)
		c.Header("Access-Control-Allow-Credentials", "true")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PATCH, DELETE, OPTIONS")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	}
}
