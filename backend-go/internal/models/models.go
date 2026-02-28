package models

import (
	"fmt"
	"time"

	"gorm.io/gorm"
)

type User struct {
	ID                 string    `gorm:"column:id;type:varchar(36);primaryKey"`
	Phone              *string   `gorm:"column:phone;type:varchar(32)"`
	Password           *string   `gorm:"column:password;type:varchar(255)"`
	TelegramID         *string   `gorm:"column:telegramId;type:varchar(32);uniqueIndex"`
	TelegramUsername   *string   `gorm:"column:telegramUsername;type:varchar(128)"`
	TelegramFirstName  *string   `gorm:"column:telegramFirstName;type:varchar(128)"`
	TelegramLastName   *string   `gorm:"column:telegramLastName;type:varchar(128)"`
	TelegramPhotoURL   *string   `gorm:"column:telegramPhotoUrl;type:varchar(512)"`
	DigitalID          *string   `gorm:"column:digitalId;type:varchar(8);uniqueIndex"` // 6-значный уникальный ID для идентификации депозитов
	CommissionPercent       string    `gorm:"column:commissionPercent;type:decimal(5,2);default:5"`
	ReferrerID              *string   `gorm:"column:referrerId;type:varchar(36)"`
	IsPartner               bool      `gorm:"column:isPartner;default:false"`
	ReferralCommissionPercent string  `gorm:"column:referralCommissionPercent;type:decimal(5,2);default:0.5"`
	SeedEncrypted           *string   `gorm:"column:seedEncrypted;type:text"`
	SeedSeenAt              *time.Time `gorm:"column:seedSeenAt;type:timestamp"`
	CreatedAt               time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (User) TableName() string { return "users" }

type AdminUser struct {
	ID           int       `gorm:"column:id;primaryKey"`
	Login        string    `gorm:"column:login;type:varchar(64)"`
	PasswordHash string    `gorm:"column:passwordHash;type:varchar(255)"`
	Role         string    `gorm:"column:role;type:varchar(32);default:super"` // super | operator
	CreatedAt    time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (AdminUser) TableName() string { return "admin_users" }

// AdminSession запись входа в админку (для отображения сессий).
type AdminSession struct {
	ID        int       `gorm:"column:id;primaryKey;autoIncrement"`
	AdminID   int       `gorm:"column:adminId"`
	Login     string    `gorm:"column:login;type:varchar(64)"`
	IP        string    `gorm:"column:ip;type:varchar(64)"`
	UserAgent string    `gorm:"column:userAgent;type:varchar(512)"`
	CreatedAt time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (AdminSession) TableName() string { return "admin_sessions" }

type Balance struct {
	ID     int    `gorm:"column:id;primaryKey"`
	UserID string `gorm:"column:userId;type:varchar(36)"`
	Symbol string `gorm:"column:symbol;type:varchar(20)"`
	Amount string `gorm:"column:amount;type:decimal(24,8);default:0"`
}

func (Balance) TableName() string { return "balances" }

type Session struct {
	ID           string    `gorm:"column:id;type:varchar(36);primaryKey"`
	UserID       string    `gorm:"column:userId;type:varchar(36)"`
	Jti          string    `gorm:"column:jti;type:varchar(64)"`
	UserAgent    *string   `gorm:"column:userAgent;type:varchar(512)"`
	DeviceType   *string   `gorm:"column:deviceType;type:varchar(64)"`
	IP           *string   `gorm:"column:ip;type:varchar(64)"`
	LastActiveAt time.Time `gorm:"column:lastActiveAt;type:timestamp"`
	CreatedAt    time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (Session) TableName() string { return "sessions" }

type PendingPayment struct {
	ID                  int        `gorm:"column:id;primaryKey"`
	UserID              string     `gorm:"column:userId;type:varchar(36)"`
	RawPayload          string     `gorm:"column:rawPayload;type:text"`
	SumKopeks           int        `gorm:"column:sumKopeks"`
	SumRub              string     `gorm:"column:sumRub;type:decimal(24,2)"`
	SumUsdt             string     `gorm:"column:sumUsdt;type:decimal(24,8)"`
	CommissionPercent   string     `gorm:"column:commissionPercent;type:decimal(5,2)"`
	Status              string     `gorm:"column:status;type:varchar(20);default:pending"`
	AssignedToAdminID   *int       `gorm:"column:assignedToAdminId"`
	ProcessedByAdminID  *int       `gorm:"column:processedByAdminId"`
	CreatedAt           time.Time  `gorm:"column:createdAt;type:timestamp"`
	ConfirmedAt         *time.Time `gorm:"column:confirmedAt"`
	RejectedAt          *time.Time `gorm:"column:rejectedAt"`
	RejectReason        *string    `gorm:"column:rejectReason;type:varchar(500)"`
}

func (PendingPayment) TableName() string { return "pending_payments" }

type Transaction struct {
	ID          int       `gorm:"column:id;primaryKey" json:"id"`
	UserID      string    `gorm:"column:userId;type:varchar(36)" json:"userId"`
	Symbol      string    `gorm:"column:symbol;type:varchar(20)" json:"symbol"`
	Amount      string    `gorm:"column:amount;type:decimal(24,8)" json:"amount"`
	Type        string    `gorm:"column:type;type:varchar(32)" json:"type"`
	RefID       *string   `gorm:"column:refId;type:varchar(128)" json:"refId,omitempty"`
	RateUsdtRub string    `gorm:"column:rateUsdtRub;type:decimal(12,4)" json:"rateUsdtRub"`
	CreatedAt   time.Time `gorm:"column:createdAt;type:timestamp" json:"createdAt"`
}

func (Transaction) TableName() string { return "transactions" }

type UserWallet struct {
	ID          int       `gorm:"column:id;primaryKey"`
	UserID      string    `gorm:"column:userId;type:varchar(36)"`
	Address     string    `gorm:"column:address;type:varchar(128)"`
	TrackID     string    `gorm:"column:trackId;type:varchar(64)"`
	BalanceUsdt string    `gorm:"column:balanceUsdt;type:decimal(24,8);default:0"`
	CreatedAt   time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (UserWallet) TableName() string { return "user_wallets" }

// WalletPool — пул адресов для пополнения. Один адрес выдаётся пользователю (userId заполняется).
type WalletPool struct {
	ID              int        `gorm:"column:id;primaryKey;autoIncrement"`
	Address         string     `gorm:"column:address;type:varchar(128);uniqueIndex"`
	UserID          *string    `gorm:"column:userId;type:varchar(36)"`
	LastKnownBalance string    `gorm:"column:lastKnownBalance;type:decimal(24,8);default:0"`
	LastCheckedAt   *time.Time `gorm:"column:lastCheckedAt;type:timestamp"`
}

func (WalletPool) TableName() string { return "wallet_pool" }

type News struct {
	ID        int       `gorm:"column:id;primaryKey;autoIncrement"`
	Title     string    `gorm:"column:title;type:varchar(255)"`
	Content   string    `gorm:"column:content;type:text"`
	ImageURL  *string   `gorm:"column:imageUrl;type:varchar(512)"`
	IsActive  bool      `gorm:"column:isActive;default:true"`
	CreatedAt time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (News) TableName() string { return "news" }

type SupportMessage struct {
	ID             int       `gorm:"column:id;primaryKey;autoIncrement"`
	UserID         string    `gorm:"column:userId;type:varchar(36)"`
	Message        string    `gorm:"column:message;type:text"`
	IsAdmin        bool      `gorm:"column:isAdmin;default:false"`
	AttachmentURL  string    `gorm:"column:attachmentUrl;type:varchar(512)"`
	AttachmentType string    `gorm:"column:attachmentType;type:varchar(32)"` // image, pdf
	CreatedAt      time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (SupportMessage) TableName() string { return "support_messages" }

// SupportThreadClose — закрытый диалог поддержки (в архиве).
type SupportThreadClose struct {
	UserID    string    `gorm:"column:userId;type:varchar(36);primaryKey"`
	ClosedAt  time.Time `gorm:"column:closedAt;type:timestamp"`
}

func (SupportThreadClose) TableName() string { return "support_thread_closes" }

// SupportTelegramThread — связь Telegram user id ↔ thread_id темы в группе поддержки (форум).
type SupportTelegramThread struct {
	TelegramUserID int64     `gorm:"column:telegramUserId;primaryKey"`
	ThreadID       int       `gorm:"column:threadId"`
	CreatedAt      time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (SupportTelegramThread) TableName() string { return "support_telegram_threads" }

// SupportAppThread — связь app userId ↔ thread_id темы в группе (сообщения из мини-приложения).
type SupportAppThread struct {
	UserID    string    `gorm:"column:userId;type:varchar(36);primaryKey"`
	ThreadID  int       `gorm:"column:threadId"`
	CreatedAt time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (SupportAppThread) TableName() string { return "support_app_threads" }

// AppSetting хранит ключ-значение (например курс usdt_rub).
type AppSetting struct {
	K string `gorm:"column:k;type:varchar(64);primaryKey"`
	V string `gorm:"column:v;type:varchar(512)"`
}

func (AppSetting) TableName() string { return "app_settings" }

// TelegramBotStart — кто запустил бота (/start).
type TelegramBotStart struct {
	ID           int       `gorm:"column:id;primaryKey;autoIncrement"`
	TelegramID   int64     `gorm:"column:telegramId;uniqueIndex"`
	Username     string    `gorm:"column:username;type:varchar(128)"`
	FirstName    string    `gorm:"column:firstName;type:varchar(128)"`
	LastName     string    `gorm:"column:lastName;type:varchar(128)"`
	LanguageCode string    `gorm:"column:languageCode;type:varchar(16)"`
	StartedAt   time.Time `gorm:"column:startedAt;type:timestamp"`
}

func (TelegramBotStart) TableName() string { return "telegram_bot_starts" }

// WithdrawalRequest — заявка на вывод (карта, СБП, внешний кошелёк).
type WithdrawalRequest struct {
	ID                 int        `gorm:"column:id;primaryKey;autoIncrement"`
	UserID             string     `gorm:"column:userId;type:varchar(36)"`
	AmountUsdt         string     `gorm:"column:amountUsdt;type:decimal(24,8)"`
	Type               string     `gorm:"column:type;type:varchar(20)"` // card | sbp | wallet
	Details            string     `gorm:"column:details;type:varchar(512)"` // номер карты, телефон СБП, адрес кошелька
	Status             string     `gorm:"column:status;type:varchar(20);default:pending"` // pending | approved | rejected
	RejectReason       *string    `gorm:"column:rejectReason;type:varchar(500)"`
	ProcessedByAdminID *int       `gorm:"column:processedByAdminId"`
	ProcessedAt        *time.Time `gorm:"column:processedAt;type:timestamp"`
	CreatedAt          time.Time  `gorm:"column:createdAt;type:timestamp"`
}

func (WithdrawalRequest) TableName() string { return "withdrawal_requests" }

// UserNotificationPref — настройки уведомлений пользователя в боте (пополнение, списание, ответ поддержки, акции).
type UserNotificationPref struct {
	UserID        string `gorm:"column:userId;type:varchar(36);primaryKey" json:"-"`
	NotifDeposit  bool   `gorm:"column:notifDeposit;default:true" json:"notifDeposit"`
	NotifWithdraw bool   `gorm:"column:notifWithdraw;default:true" json:"notifWithdraw"`
	NotifSupport  bool   `gorm:"column:notifSupport;default:true" json:"notifSupport"`
	NotifPromo    bool   `gorm:"column:notifPromo;default:true" json:"notifPromo"`
}

func (UserNotificationPref) TableName() string { return "user_notification_prefs" }

// UnidentifiedDeposit - депозит, который не удалось идентифицировать по digitalId
type UnidentifiedDeposit struct {
	ID            int        `gorm:"column:id;primaryKey;autoIncrement"`
	TxID          string     `gorm:"column:txId;type:varchar(128);uniqueIndex"`
	Amount        string     `gorm:"column:amount;type:decimal(24,8)"`
	FromAddr      string     `gorm:"column:fromAddr;type:varchar(128)"`
	Status        string     `gorm:"column:status;type:varchar(20);default:'pending'"` // pending, assigned, rejected
	AssignedToUserID *string `gorm:"column:assignedToUserId;type:varchar(36)"`
	ProcessedAt   *time.Time `gorm:"column:processedAt;type:timestamp"`
	CreatedAt     time.Time  `gorm:"column:createdAt;type:timestamp"`
}

func (UnidentifiedDeposit) TableName() string { return "unidentified_deposits" }

// ManagedWallet - кошелёк для экспорта/трансферов (wallet-manager)
type ManagedWallet struct {
	ID              int        `gorm:"column:id;primaryKey;autoIncrement"`
	Address         string     `gorm:"column:address;type:varchar(128);uniqueIndex"`
	PrivateKeyEnc   string     `gorm:"column:privateKeyEncrypted;type:text"`
	SeedEncrypted   string     `gorm:"column:seedEncrypted;type:text"`
	UserID          *string    `gorm:"column:userId;type:varchar(36)"`
	IsInPool        bool       `gorm:"column:isInPool;default:false"`
	LastBalance     string     `gorm:"column:lastBalance;type:decimal(24,8);default:0"`
	LastCheckedAt   *time.Time `gorm:"column:lastCheckedAt;type:timestamp"`
	CreatedAt       time.Time  `gorm:"column:createdAt;type:timestamp"`
}

func (ManagedWallet) TableName() string { return "managed_wallets" }

// AdminActionLog — лог действий админа над пользователем (смена реф. %, комиссии, запрос seed, операции с балансом).
type AdminActionLog struct {
	ID        int       `gorm:"column:id;primaryKey;autoIncrement"`
	UserID    string    `gorm:"column:userId;type:varchar(36);index"`
	AdminID   int       `gorm:"column:adminId"`
	Action    string    `gorm:"column:action;type:varchar(64)"`   // referral_commission_changed, commission_changed, seed_check_requested, balance_operation
	Details   string    `gorm:"column:details;type:varchar(512)"` // JSON или текст
	CreatedAt time.Time `gorm:"column:createdAt;type:timestamp"`
}

func (AdminActionLog) TableName() string { return "admin_action_logs" }

func Migrate(db *gorm.DB) error {
	// Автомиграция таблиц (PostgreSQL — все типы совместимы)
	if err := db.AutoMigrate(
		&User{}, &AdminUser{}, &AdminSession{}, &Balance{}, &Session{}, &PendingPayment{}, &Transaction{}, &UserWallet{},
		&WalletPool{}, &News{}, &SupportMessage{}, &SupportThreadClose{}, &SupportTelegramThread{}, &SupportAppThread{}, &AppSetting{}, &TelegramBotStart{}, &WithdrawalRequest{},
		&UserNotificationPref{}, &UnidentifiedDeposit{}, &ManagedWallet{}, &AdminActionLog{},
	); err != nil {
		return err
	}

	// Пересоздаём 4-значные Digital ID для всех пользователей с более длинными ID
	regenerateDigitalIDs(db)

	return nil
}

// regenerateDigitalIDs пересоздаёт 4-значные Digital ID для всех пользователей с более длинными ID
func regenerateDigitalIDs(db *gorm.DB) {
	var users []User
	// Находим пользователей с digitalId длиннее 4 символов (старые 6- или 7-значные)
	db.Where(`LENGTH("digitalId") > 4 OR "digitalId" IS NULL`).Find(&users)

	if len(users) == 0 {
		return
	}

	for _, u := range users {
		newID := generateUniqueDigitalID(db)
		db.Model(&User{}).Where("id = ?", u.ID).Update("digitalId", newID)
	}
}

// generateUniqueDigitalID генерирует уникальный 4-значный ID
func generateUniqueDigitalID(db *gorm.DB) string {
	for i := 0; i < 100; i++ {
		// 1000..9999 (4 цифры)
		n := 1000 + int(time.Now().UnixNano()%9000)
		id := fmt.Sprintf("%d", n)
		
		var exists int64
		db.Model(&User{}).Where(`"digitalId" = ?`, id).Count(&exists)
		if exists == 0 {
			return id
		}
		// Небольшая задержка для изменения UnixNano
		time.Sleep(time.Microsecond * 10)
	}
	// Фоллбэк - случайное число
	return fmt.Sprintf("%d", 1000+int(time.Now().UnixNano()%9000))
}
