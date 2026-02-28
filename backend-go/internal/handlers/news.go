package handlers

import (
	"net/http"
	"strconv"
	"time"

	"ats-wallet/internal/models"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type NewsHandler struct {
	DB *gorm.DB
}

func (h *NewsHandler) GetNews(c *gin.Context) {
	var news []models.News
	if err := h.DB.Where("isActive = ?", true).Order("createdAt DESC").Limit(20).Find(&news).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch news"})
		return
	}
	result := make([]gin.H, 0, len(news))
	for _, n := range news {
		result = append(result, gin.H{
			"id":        n.ID,
			"title":     n.Title,
			"content":   n.Content,
			"imageUrl":  n.ImageURL,
			"isActive":  n.IsActive,
			"createdAt": n.CreatedAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, result)
}

func (h *NewsHandler) GetNewsItem(c *gin.Context) {
	id := c.Param("id")
	var item models.News
	if err := h.DB.Where("id = ? AND isActive = ?", id, true).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "News not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{
		"id":        item.ID,
		"title":     item.Title,
		"content":   item.Content,
		"imageUrl":  item.ImageURL,
		"isActive":  item.IsActive,
		"createdAt": item.CreatedAt.Format(time.RFC3339),
	})
}

func (h *NewsHandler) AdminGetNews(c *gin.Context) {
	var news []models.News
	if err := h.DB.Order("createdAt DESC").Limit(100).Find(&news).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch news"})
		return
	}
	result := make([]gin.H, 0, len(news))
	for _, n := range news {
		result = append(result, gin.H{
			"id":        n.ID,
			"title":     n.Title,
			"text":      n.Content,
			"content":   n.Content,
			"imageUrl":  n.ImageURL,
			"isActive":  n.IsActive,
			"date":      n.CreatedAt.Format("2006-01-02"),
			"createdAt": n.CreatedAt.Format(time.RFC3339),
		})
	}
	c.JSON(http.StatusOK, result)
}

func (h *NewsHandler) AdminCreateNews(c *gin.Context) {
	var body struct {
		Title string `json:"title"`
		Text  string `json:"text"`
		Date  string `json:"date"`
	}
	if err := c.ShouldBindJSON(&body); err != nil || body.Title == "" {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Title is required"})
		return
	}
	createdAt := time.Now()
	if body.Date != "" {
		if t, err := time.Parse("2006-01-02", body.Date); err == nil {
			createdAt = t
		}
	}
	news := models.News{
		Title:     body.Title,
		Content:   body.Text,
		IsActive:  true,
		CreatedAt: createdAt,
	}
	if err := h.DB.Create(&news).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create news"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"id": news.ID})
}

func (h *NewsHandler) AdminUpdateNews(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid ID"})
		return
	}
	var item models.News
	if err := h.DB.Where("id = ?", id).First(&item).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "News not found"})
		return
	}
	var body struct {
		Title *string `json:"title"`
		Text  *string `json:"text"`
		Date  *string `json:"date"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid body"})
		return
	}
	if body.Title != nil {
		item.Title = *body.Title
	}
	if body.Text != nil {
		item.Content = *body.Text
	}
	if body.Date != nil {
		if t, err := time.Parse("2006-01-02", *body.Date); err == nil {
			item.CreatedAt = t
		}
	}
	h.DB.Save(&item)
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *NewsHandler) AdminDeleteNews(c *gin.Context) {
	idStr := c.Param("id")
	id, err := strconv.Atoi(idStr)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid ID"})
		return
	}
	if err := h.DB.Delete(&models.News{}, id).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to delete"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"ok": true})
}

func (h *NewsHandler) SeedNews() {
	var count int64
	h.DB.Model(&models.News{}).Count(&count)
	if count > 0 {
		// Для уже существующих БД: добавить новость о реферальной программе, если её ещё нет
		var exists int64
		h.DB.Model(&models.News{}).Where("title = ?", "Запущена реферальная программа").Count(&exists)
		if exists == 0 {
			h.DB.Create(&models.News{
				Title:     "Запущена реферальная программа",
				Content:   "Реферальная программа теперь доступна для всех пользователей ATS WALLET.\n\nКак участвовать:\n• Зайдите в Профиль → Реферальная программа.\n• Скопируйте свою реферальную ссылку и поделитесь ею с друзьями.\n• Когда приглашённый пользователь зарегистрируется по вашей ссылке, он станет вашим рефералом.\n• Вы получаете 0,5% от комиссий с операций реферала: обмен на рубли (карта, СБП), оплата по СБП. Начисления приходят на реферальный баланс в USDT.\n• Переведите накопленные средства на основной баланс в любой момент в разделе Профиль.\n\nПриглашайте друзей и получайте вознаграждение!",
				IsActive:  true,
				CreatedAt: time.Now(),
			})
		}
		return
	}

	now := time.Now()
	news := []models.News{
		{
			Title:     "Добро пожаловать в ATS WALLET!",
			Content:   "Мы рады приветствовать вас в нашем кошельке. ATS WALLET — это безопасный и удобный способ хранения и обмена криптовалюты. Следите за обновлениями!",
			IsActive:  true,
			CreatedAt: now.Add(-48 * time.Hour),
		},
		{
			Title:     "Обновление системы безопасности",
			Content:   "Мы улучшили систему безопасности вашего кошелька. Теперь все транзакции защищены двухфакторной аутентификацией. Ваши средства в безопасности!",
			IsActive:  true,
			CreatedAt: now.Add(-24 * time.Hour),
		},
		{
			Title:     "Новые возможности пополнения",
			Content:   "Теперь вы можете пополнять баланс через СБП и банковские карты. Комиссия от 1%. Пополнение происходит мгновенно после подтверждения оператором.",
			IsActive:  true,
			CreatedAt: now,
		},
		{
			Title:     "Запущена реферальная программа",
			Content:   "Реферальная программа теперь доступна для всех пользователей ATS WALLET.\n\nКак участвовать:\n• Зайдите в Профиль → Реферальная программа.\n• Скопируйте свою реферальную ссылку и поделитесь ею с друзьями.\n• Когда приглашённый пользователь зарегистрируется по вашей ссылке, он станет вашим рефералом.\n• Вы получаете 0,5% от комиссий с операций реферала: обмен на рубли (карта, СБП), оплата по СБП. Начисления приходят на реферальный баланс в USDT.\n• Переведите накопленные средства на основной баланс в любой момент в разделе Профиль.\n\nПриглашайте друзей и получайте вознаграждение!",
			IsActive:  true,
			CreatedAt: now,
		},
	}

	for _, n := range news {
		h.DB.Create(&n)
	}
}
