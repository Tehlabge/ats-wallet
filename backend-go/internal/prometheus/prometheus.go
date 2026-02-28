package prometheus

import (
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/collectors"
	"github.com/prometheus/client_golang/prometheus/promhttp"
)

var (
	// HTTPRequestsTotal — счётчик запросов по методу и пути (без query).
	HTTPRequestsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ats_http_requests_total",
			Help: "Total HTTP requests by method and path",
		},
		[]string{"method", "path"},
	)
	// SupportMessagesTotal — счётчик сообщений в поддержку (от пользователя и от админа).
	SupportMessagesTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ats_support_messages_total",
			Help: "Total support messages by direction",
		},
		[]string{"direction"}, // "user" | "admin"
	)
	// SupportBotWebhookTotal — счётчик вебхуков бота поддержки.
	SupportBotWebhookTotal = prometheus.NewCounter(
		prometheus.CounterOpts{
			Name: "ats_support_bot_webhook_total",
			Help: "Total support bot webhook calls",
		},
	)
	// AuthLoginAttemptsTotal — вход пользователя (phone или telegram).
	AuthLoginAttemptsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ats_auth_login_attempts_total",
			Help: "User login attempts by method and result",
		},
		[]string{"method", "result"}, // method: phone | telegram; result: success | failure
	)
	// AdminLoginAttemptsTotal — вход в админку.
	AdminLoginAttemptsTotal = prometheus.NewCounterVec(
		prometheus.CounterOpts{
			Name: "ats_admin_login_attempts_total",
			Help: "Admin login attempts by result",
		},
		[]string{"result"}, // result: success | failure
	)
)

func init() {
	register := func(c prometheus.Collector) {
		if err := prometheus.Register(c); err != nil {
			// При рестарте PM2 возможна повторная регистрация — не паникуем
			if !strings.Contains(err.Error(), "already registered") && !strings.Contains(err.Error(), "duplicate") {
				panic(err)
			}
		}
	}
	register(collectors.NewGoCollector())
	register(collectors.NewProcessCollector(collectors.ProcessCollectorOpts{}))
	register(HTTPRequestsTotal)
	register(SupportMessagesTotal)
	register(SupportBotWebhookTotal)
	register(AuthLoginAttemptsTotal)
	register(AdminLoginAttemptsTotal)
}

// Handler возвращает Gin handler для эндпоинта /metrics (для Prometheus).
func Handler() gin.HandlerFunc {
	return gin.WrapH(promhttp.Handler())
}

// Middleware считает запросы по method и path (path без query).
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		path := c.Request.URL.Path
		if path == "" {
			path = "/"
		}
		HTTPRequestsTotal.WithLabelValues(c.Request.Method, path).Inc()
		c.Next()
	}
}
