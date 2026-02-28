package handlers

import (
	"fmt"
	"net/http"
	"strconv"
	"strings"
	"time"

	"ats-wallet/internal/models"
	"ats-wallet/internal/notify"

	"github.com/gin-gonic/gin"
	"gorm.io/gorm"
)

type WalletHandler struct {
	DB       *gorm.DB
	Notifier *notify.Notifier
}

// Rate возвращает текущий курс USDT/RUB
func (h *WalletHandler) Rate(c *gin.Context) {
	var setting models.AppSetting
	if err := h.DB.Where("k = ?", "usdt_rub").First(&setting).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"rate": "0"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"rate": setting.V})
}

// Balance возвращает баланс пользователя
func (h *WalletHandler) Balance(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	var balances []models.Balance
	h.DB.Where("userId = ?", userID).Find(&balances)

	result := make(map[string]string)
	for _, b := range balances {
		result[b.Symbol] = b.Amount
	}

	c.JSON(http.StatusOK, gin.H{"balances": result})
}

// Transactions возвращает историю транзакций с обогащением (реквизиты вывода, статус, комментарий).
func (h *WalletHandler) Transactions(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	limitStr := c.DefaultQuery("limit", "50")
	limit, _ := strconv.Atoi(limitStr)
	if limit <= 0 || limit > 100 {
		limit = 50
	}

	var transactions []models.Transaction
	h.DB.Where("userId = ?", userID).Order("createdAt DESC").Limit(limit).Find(&transactions)

	out := make([]gin.H, 0, len(transactions))
	for _, t := range transactions {
		item := gin.H{
			"id":          t.ID,
			"userId":      t.UserID,
			"symbol":      t.Symbol,
			"amount":      t.Amount,
			"type":        t.Type,
			"rateUsdtRub": t.RateUsdtRub,
			"createdAt":   t.CreatedAt.Format(time.RFC3339),
		}
		refID := ""
		if t.RefID != nil {
			refID = *t.RefID
			item["refId"] = refID
		}
		// Вывод: подтянуть метод, реквизиты, статус, причину отклонения из withdrawal_requests
		if (t.Type == "withdrawal_hold" || t.Type == "withdrawal" || t.Type == "withdrawal_refund") && refID != "" {
			var reqID int
			if _, err := fmt.Sscanf(refID, "withdrawal_request:%d", &reqID); err != nil {
				if _, err := fmt.Sscanf(refID, "withdrawal_reject:%d", &reqID); err != nil {
					_, _ = fmt.Sscanf(refID, "withdrawal_complete:%d", &reqID)
				}
			}
			if reqID > 0 {
				var wr models.WithdrawalRequest
				if h.DB.Where("id = ?", reqID).First(&wr).Error == nil {
					item["method"] = wr.Type
					item["details"] = wr.Details
					item["status"] = wr.Status
					if wr.RejectReason != nil {
						item["rejectReason"] = *wr.RejectReason
					}
				}
			}
		}
		// Оплата СБП: подтянуть сумму в рублях и комментарий из pending_payments
		if (t.Type == "payment_debit" || t.Type == "payment") && refID != "" {
			var payID int
			if _, err := fmt.Sscanf(refID, "payment-%d", &payID); err == nil && payID > 0 {
				var pp models.PendingPayment
				if h.DB.Where("id = ?", payID).First(&pp).Error == nil {
					item["status"] = pp.Status
					if pp.RejectReason != nil {
						item["rejectReason"] = *pp.RejectReason
					}
					item["meta"] = gin.H{"sumRub": pp.SumRub}
				}
			}
		}
		out = append(out, item)
	}
	c.JSON(http.StatusOK, gin.H{"transactions": out})
}

// getMasterDepositWallet получает адрес мастер-кошелька для депозитов
func (h *WalletHandler) getMasterDepositWallet() string {
	var setting models.AppSetting
	if err := h.DB.Where("k = ?", "master_deposit_wallet").First(&setting).Error; err != nil {
		return ""
	}
	return strings.TrimSpace(setting.V)
}

// DepositAddress возвращает адрес для пополнения с суммой включающей digitalId
func (h *WalletHandler) DepositAddress(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	// Получаем пользователя для digitalId
	var user models.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Пользователь не найден"})
		return
	}

	if user.DigitalID == nil || *user.DigitalID == "" {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "DigitalID не установлен"})
		return
	}

	masterWallet := h.getMasterDepositWallet()
	if masterWallet == "" {
		c.JSON(http.StatusServiceUnavailable, gin.H{"message": "Кошелёк для пополнения не настроен"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"address":   masterWallet,
		"network":   "TRC-20",
		"digitalId": *user.DigitalID,
		"hint":      "Добавьте ваш Digital ID после точки к сумме. Например: 10." + *user.DigitalID,
	})
}

// WithdrawFees возвращает комиссии на вывод
func (h *WalletHandler) WithdrawFees(c *gin.Context) {
	var settings []models.AppSetting
	h.DB.Where("k IN ?", []string{
		"withdraw_commission_card",
		"withdraw_commission_card_fixed",
		"withdraw_commission_sbp",
		"withdraw_commission_sbp_fixed",
		"withdraw_commission_wallet",
		"withdraw_commission_wallet_fixed",
	}).Find(&settings)

	result := map[string]float64{
		"commissionCardPercent":   2.0,
		"commissionCardFixed":     0.0,
		"commissionSbpPercent":    2.0,
		"commissionSbpFixed":      0.0,
		"commissionWalletPercent": 1.0,
		"commissionWalletFixed":   0.0,
	}

	keyMap := map[string]string{
		"withdraw_commission_card":         "commissionCardPercent",
		"withdraw_commission_card_fixed":   "commissionCardFixed",
		"withdraw_commission_sbp":          "commissionSbpPercent",
		"withdraw_commission_sbp_fixed":    "commissionSbpFixed",
		"withdraw_commission_wallet":       "commissionWalletPercent",
		"withdraw_commission_wallet_fixed": "commissionWalletFixed",
	}

	for _, s := range settings {
		if newKey, ok := keyMap[s.K]; ok {
			if val, err := strconv.ParseFloat(s.V, 64); err == nil && val >= 0 {
				result[newKey] = val
			}
		}
	}

	c.JSON(http.StatusOK, result)
}

// GetNotificationSettings возвращает настройки уведомлений
func (h *WalletHandler) GetNotificationSettings(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	var pref models.UserNotificationPref
	if err := h.DB.Where("userId = ?", userID).First(&pref).Error; err != nil {
		pref = models.UserNotificationPref{
			UserID:        userID,
			NotifDeposit:  true,
			NotifWithdraw: true,
			NotifSupport:  true,
			NotifPromo:    true,
		}
	}

	c.JSON(http.StatusOK, pref)
}

// PatchNotificationSettings обновляет настройки уведомлений
func (h *WalletHandler) PatchNotificationSettings(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	var body struct {
		NotifDeposit  *bool `json:"notifDeposit"`
		NotifWithdraw *bool `json:"notifWithdraw"`
		NotifSupport  *bool `json:"notifSupport"`
		NotifPromo    *bool `json:"notifPromo"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid body"})
		return
	}

	var pref models.UserNotificationPref
	if err := h.DB.Where("userId = ?", userID).First(&pref).Error; err != nil {
		pref = models.UserNotificationPref{
			UserID:        userID,
			NotifDeposit:  true,
			NotifWithdraw: true,
			NotifSupport:  true,
			NotifPromo:    true,
		}
		h.DB.Create(&pref)
	}

	updates := make(map[string]interface{})
	if body.NotifDeposit != nil {
		updates["notifDeposit"] = *body.NotifDeposit
	}
	if body.NotifWithdraw != nil {
		updates["notifWithdraw"] = *body.NotifWithdraw
	}
	if body.NotifSupport != nil {
		updates["notifSupport"] = *body.NotifSupport
	}
	if body.NotifPromo != nil {
		updates["notifPromo"] = *body.NotifPromo
	}

	if len(updates) > 0 {
		h.DB.Model(&pref).Updates(updates)
	}

	// Перечитываем из БД, чтобы вернуть актуальные данные
	h.DB.Where("userId = ?", userID).First(&pref)
	c.JSON(http.StatusOK, pref)
}

// CreateWithdrawalRequest создаёт заявку на вывод
func (h *WalletHandler) CreateWithdrawalRequest(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	var body struct {
		AmountUsdt string `json:"amountUsdt" binding:"required"`
		Type       string `json:"type" binding:"required"`
		Details    string `json:"details" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid body"})
		return
	}

	var balance models.Balance
	if err := h.DB.Where("userId = ? AND symbol = ?", userID, "USDT").First(&balance).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Недостаточно средств"})
		return
	}

	balanceFloat, _ := strconv.ParseFloat(balance.Amount, 64)
	amountFloat, _ := strconv.ParseFloat(body.AmountUsdt, 64)

	if amountFloat <= 0 || amountFloat > balanceFloat {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Недостаточно средств"})
		return
	}

	var request models.WithdrawalRequest
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		newBalance := balanceFloat - amountFloat
		if err := tx.Model(&balance).Update("amount", strconv.FormatFloat(newBalance, 'f', 8, 64)).Error; err != nil {
			return err
		}

		request = models.WithdrawalRequest{
			UserID:     userID,
			AmountUsdt: body.AmountUsdt,
			Type:       body.Type,
			Details:    body.Details,
			Status:     "pending",
			CreatedAt:  time.Now(),
		}
		if err := tx.Create(&request).Error; err != nil {
			return err
		}

		refID := "withdraw_pending:" + strconv.Itoa(request.ID)
		tx.Create(&models.Transaction{
			UserID:    userID,
			Symbol:    "USDT",
			Amount:    "-" + body.AmountUsdt,
			Type:      "withdraw",
			RefID:     &refID,
			CreatedAt: time.Now(),
		})

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка создания заявки"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Заявка создана", "id": request.ID})
}

// TransferInternal - внутренний перевод между пользователями
func (h *WalletHandler) TransferInternal(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	var body struct {
		ToDigitalID string `json:"toDigitalId" binding:"required"`
		AmountUsdt  string `json:"amountUsdt" binding:"required"`
	}
	if err := c.ShouldBindJSON(&body); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Invalid body"})
		return
	}

	var recipient models.User
	if err := h.DB.Where("digitalId = ?", body.ToDigitalID).First(&recipient).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "Получатель не найден"})
		return
	}

	if recipient.ID == userID {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Нельзя переводить самому себе"})
		return
	}

	var senderBalance models.Balance
	if err := h.DB.Where("userId = ? AND symbol = ?", userID, "USDT").First(&senderBalance).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Недостаточно средств"})
		return
	}

	balanceFloat, _ := strconv.ParseFloat(senderBalance.Amount, 64)
	amountFloat, _ := strconv.ParseFloat(body.AmountUsdt, 64)

	if amountFloat <= 0 || amountFloat > balanceFloat {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Недостаточно средств"})
		return
	}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		newSenderBalance := balanceFloat - amountFloat
		if err := tx.Model(&senderBalance).Update("amount", strconv.FormatFloat(newSenderBalance, 'f', 8, 64)).Error; err != nil {
			return err
		}

		var recipientBalance models.Balance
		if err := tx.Where("userId = ? AND symbol = ?", recipient.ID, "USDT").First(&recipientBalance).Error; err != nil {
			recipientBalance = models.Balance{
				UserID: recipient.ID,
				Symbol: "USDT",
				Amount: "0",
			}
			tx.Create(&recipientBalance)
		}

		recipientBalanceFloat, _ := strconv.ParseFloat(recipientBalance.Amount, 64)
		newRecipientBalance := recipientBalanceFloat + amountFloat
		if err := tx.Model(&recipientBalance).Update("amount", strconv.FormatFloat(newRecipientBalance, 'f', 8, 64)).Error; err != nil {
			return err
		}

		now := time.Now()
		refID := "internal:" + strconv.FormatInt(now.UnixNano(), 10)

		senderTx := models.Transaction{
			UserID:    userID,
			Symbol:    "USDT",
			Amount:    "-" + body.AmountUsdt,
			Type:      "transfer_out",
			RefID:     &refID,
			CreatedAt: now,
		}
		tx.Create(&senderTx)

		recipientTx := models.Transaction{
			UserID:    recipient.ID,
			Symbol:    "USDT",
			Amount:    body.AmountUsdt,
			Type:      "transfer_in",
			RefID:     &refID,
			CreatedAt: now,
		}
		tx.Create(&recipientTx)

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка перевода"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Перевод выполнен"})
}

// ReferralStats возвращает статистику реферальной программы
func (h *WalletHandler) ReferralStats(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	var user models.User
	if err := h.DB.Where("id = ?", userID).First(&user).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}

	var referralsCount int64
	h.DB.Model(&models.User{}).Where("referrerId = ?", userID).Count(&referralsCount)

	var refBalance models.Balance
	h.DB.Where("userId = ? AND symbol = ?", userID, "REF_USDT").First(&refBalance)

	c.JSON(http.StatusOK, gin.H{
		"isPartner":         user.IsPartner,
		"commissionPercent": user.ReferralCommissionPercent,
		"referralsCount":    referralsCount,
		"referralBalance":   refBalance.Amount,
	})
}

// ReferralTransferToMain переводит реферальный баланс на основной
func (h *WalletHandler) ReferralTransferToMain(c *gin.Context) {
	userID := c.GetString("userId")
	if userID == "" {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Not authenticated"})
		return
	}

	var refBalance models.Balance
	if err := h.DB.Where("userId = ? AND symbol = ?", userID, "REF_USDT").First(&refBalance).Error; err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Реферальный баланс пуст"})
		return
	}

	refBalanceFloat, _ := strconv.ParseFloat(refBalance.Amount, 64)
	if refBalanceFloat <= 0 {
		c.JSON(http.StatusBadRequest, gin.H{"message": "Реферальный баланс пуст"})
		return
	}

	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Model(&refBalance).Update("amount", "0").Error; err != nil {
			return err
		}

		var mainBalance models.Balance
		if err := tx.Where("userId = ? AND symbol = ?", userID, "USDT").First(&mainBalance).Error; err != nil {
			mainBalance = models.Balance{
				UserID: userID,
				Symbol: "USDT",
				Amount: "0",
			}
			tx.Create(&mainBalance)
		}

		mainBalanceFloat, _ := strconv.ParseFloat(mainBalance.Amount, 64)
		newMainBalance := mainBalanceFloat + refBalanceFloat
		if err := tx.Model(&mainBalance).Update("amount", strconv.FormatFloat(newMainBalance, 'f', 8, 64)).Error; err != nil {
			return err
		}

		now := time.Now()
		transaction := models.Transaction{
			UserID:    userID,
			Symbol:    "USDT",
			Amount:    strconv.FormatFloat(refBalanceFloat, 'f', 8, 64),
			Type:      "referral_transfer",
			CreatedAt: now,
		}
		tx.Create(&transaction)

		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Ошибка перевода"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Перевод выполнен", "amount": strconv.FormatFloat(refBalanceFloat, 'f', 2, 64)})
}
