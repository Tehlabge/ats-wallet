package wallet

import (
	"crypto/aes"
	"crypto/cipher"
	"crypto/rand"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log"
	"time"

	"ats-wallet/internal/models"
	"ats-wallet/internal/seed"

	"gorm.io/gorm"
)

// Manager управляет кошельками системы
type Manager struct {
	DB                *gorm.DB
	WalletPassword    string // WALLET_PASSWORD из env для доступа к приватным ключам
	SeedEncryptionKey string
}

// NewManager создаёт новый менеджер кошельков
func NewManager(db *gorm.DB, walletPassword, seedEncryptionKey string) *Manager {
	return &Manager{
		DB:                db,
		WalletPassword:    walletPassword,
		SeedEncryptionKey: seedEncryptionKey,
	}
}

// ManagedWallet алиас для models.ManagedWallet
type ManagedWallet = models.ManagedWallet

// VerifyPassword проверяет пароль доступа
func (m *Manager) VerifyPassword(password string) bool {
	return password == m.WalletPassword
}

// CreateWallet создаёт новый кошелёк (без привязки к пользователю)
func (m *Manager) CreateWallet() (*ManagedWallet, string, error) {
	// Генерируем новый кошелёк с BIP39 мнемоником
	wallet, err := GenerateWalletNew()
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate wallet: %w", err)
	}

	seedPhrase := wallet.Seed

	// Шифруем приватный ключ с WALLET_PASSWORD
	privKeyEnc, err := m.encryptData(wallet.PrivateKey)
	if err != nil {
		return nil, "", fmt.Errorf("failed to encrypt private key: %w", err)
	}

	// Шифруем seed-фразу
	seedEnc, err := seed.EncryptSeed(seedPhrase, m.SeedEncryptionKey)
	if err != nil {
		return nil, "", fmt.Errorf("failed to encrypt seed: %w", err)
	}

	// Сохраняем в БД
	managed := &ManagedWallet{
		Address:       wallet.Address,
		PrivateKeyEnc: privKeyEnc,
		SeedEncrypted: seedEnc,
		CreatedAt:     time.Now(),
	}

	if err := m.DB.Create(managed).Error; err != nil {
		return nil, "", fmt.Errorf("failed to save wallet: %w", err)
	}

	log.Printf("[WalletManager] Created new wallet: %s", wallet.Address)
	return managed, seedPhrase, nil
}

// CreateWalletForUser создаёт кошелёк для конкретного пользователя
func (m *Manager) CreateWalletForUser(userID string) (*ManagedWallet, string, error) {
	// Проверяем, нет ли уже кошелька у пользователя
	var existing ManagedWallet
	if err := m.DB.Where("userId = ?", userID).First(&existing).Error; err == nil {
		return &existing, "", nil // Уже есть кошелёк
	}

	// Генерируем новый кошелёк с BIP39 мнемоником
	wallet, err := GenerateWalletNew()
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate wallet: %w", err)
	}

	seedPhrase := wallet.Seed

	// Шифруем приватный ключ с WALLET_PASSWORD
	privKeyEnc, err := m.encryptData(wallet.PrivateKey)
	if err != nil {
		return nil, "", fmt.Errorf("failed to encrypt private key: %w", err)
	}

	// Шифруем seed-фразу
	seedEnc, err := seed.EncryptSeed(seedPhrase, m.SeedEncryptionKey)
	if err != nil {
		return nil, "", fmt.Errorf("failed to encrypt seed: %w", err)
	}

	// Сохраняем в БД с привязкой к пользователю
	managed := &ManagedWallet{
		Address:       wallet.Address,
		PrivateKeyEnc: privKeyEnc,
		SeedEncrypted: seedEnc,
		UserID:        &userID,
		CreatedAt:     time.Now(),
	}

	if err := m.DB.Create(managed).Error; err != nil {
		return nil, "", fmt.Errorf("failed to save wallet: %w", err)
	}

	log.Printf("[WalletManager] Created wallet %s for user %s", wallet.Address, userID)
	return managed, seedPhrase, nil
}

// GetAllWallets возвращает все управляемые кошельки
func (m *Manager) GetAllWallets() ([]ManagedWallet, error) {
	var wallets []ManagedWallet
	if err := m.DB.Order("createdAt DESC").Find(&wallets).Error; err != nil {
		return nil, err
	}
	return wallets, nil
}

// GetWalletByID возвращает кошелёк по ID
func (m *Manager) GetWalletByID(id int) (*ManagedWallet, error) {
	var wallet ManagedWallet
	if err := m.DB.First(&wallet, id).Error; err != nil {
		return nil, err
	}
	return &wallet, nil
}

// GetDecryptedSeed возвращает расшифрованную seed-фразу
func (m *Manager) GetDecryptedSeed(walletID int) (string, error) {
	wallet, err := m.GetWalletByID(walletID)
	if err != nil {
		return "", err
	}

	return seed.DecryptSeed(wallet.SeedEncrypted, m.SeedEncryptionKey)
}

// GetDecryptedPrivateKey возвращает расшифрованный приватный ключ
func (m *Manager) GetDecryptedPrivateKey(walletID int) (string, error) {
	wallet, err := m.GetWalletByID(walletID)
	if err != nil {
		return "", err
	}

	return m.decryptData(wallet.PrivateKeyEnc)
}

// ExportWalletsEncrypted экспортирует все кошельки в JSON
func (m *Manager) ExportWalletsEncrypted() (string, error) {
	wallets, err := m.GetAllWallets()
	if err != nil {
		return "", err
	}

	type ExportWallet struct {
		ID         int    `json:"id"`
		Address    string `json:"address"`
		PrivateKey string `json:"privateKey"`
		Seed       string `json:"seed"`
		UserID     string `json:"userId,omitempty"`
		CreatedAt  string `json:"createdAt"`
	}

	var exportData []ExportWallet
	for _, w := range wallets {
		privKey, err := m.decryptData(w.PrivateKeyEnc)
		if err != nil {
			log.Printf("[WalletManager] Failed to decrypt private key for wallet %d: %v", w.ID, err)
			continue
		}

		seedPhrase, err := seed.DecryptSeed(w.SeedEncrypted, m.SeedEncryptionKey)
		if err != nil {
			log.Printf("[WalletManager] Failed to decrypt seed for wallet %d: %v", w.ID, err)
			continue
		}

		userID := ""
		if w.UserID != nil {
			userID = *w.UserID
		}

		exportData = append(exportData, ExportWallet{
			ID:         w.ID,
			Address:    w.Address,
			PrivateKey: privKey,
			Seed:       seedPhrase,
			UserID:     userID,
			CreatedAt:  w.CreatedAt.Format(time.RFC3339),
		})
	}

	jsonData, err := json.MarshalIndent(exportData, "", "  ")
	if err != nil {
		return "", err
	}

	return string(jsonData), nil
}

// ExportSingleWallet экспортирует один кошелёк
func (m *Manager) ExportSingleWallet(walletID int) (string, error) {
	wallet, err := m.GetWalletByID(walletID)
	if err != nil {
		return "", err
	}

	privKey, err := m.decryptData(wallet.PrivateKeyEnc)
	if err != nil {
		return "", err
	}

	seedPhrase, err := seed.DecryptSeed(wallet.SeedEncrypted, m.SeedEncryptionKey)
	if err != nil {
		return "", err
	}

	type ExportWallet struct {
		ID         int    `json:"id"`
		Address    string `json:"address"`
		PrivateKey string `json:"privateKey"`
		Seed       string `json:"seed"`
		CreatedAt  string `json:"createdAt"`
	}

	export := ExportWallet{
		ID:         wallet.ID,
		Address:    wallet.Address,
		PrivateKey: privKey,
		Seed:       seedPhrase,
		CreatedAt:  wallet.CreatedAt.Format(time.RFC3339),
	}

	jsonData, err := json.MarshalIndent(export, "", "  ")
	if err != nil {
		return "", err
	}

	return string(jsonData), nil
}

// GetStats возвращает статистику по кошелькам
func (m *Manager) GetStats() (map[string]interface{}, error) {
	var total int64
	var assigned int64
	var withBalance int64

	m.DB.Model(&ManagedWallet{}).Count(&total)
	m.DB.Model(&ManagedWallet{}).Where("userId IS NOT NULL").Count(&assigned)
	m.DB.Model(&ManagedWallet{}).Where("CAST(lastBalance AS DECIMAL(24,8)) > 0").Count(&withBalance)

	// Считаем общий баланс
	var totalBalance float64
	m.DB.Model(&ManagedWallet{}).Select("COALESCE(SUM(CAST(lastBalance AS DECIMAL(24,8))), 0)").Scan(&totalBalance)

	return map[string]interface{}{
		"total":        total,
		"assigned":     assigned,
		"withBalance":  withBalance,
		"totalBalance": fmt.Sprintf("%.6f", totalBalance),
	}, nil
}

// UpdateWalletBalance обновляет баланс кошелька в БД
func (m *Manager) UpdateWalletBalance(walletID int, balance string) error {
	now := time.Now()
	return m.DB.Model(&ManagedWallet{}).Where("id = ?", walletID).
		Updates(map[string]interface{}{
			"lastBalance":   balance,
			"lastCheckedAt": now,
		}).Error
}

// Вспомогательные функции шифрования

func (m *Manager) encryptData(plaintext string) (string, error) {
	key := deriveKey(m.WalletPassword)
	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonce := make([]byte, gcm.NonceSize())
	if _, err := io.ReadFull(rand.Reader, nonce); err != nil {
		return "", err
	}

	ciphertext := gcm.Seal(nonce, nonce, []byte(plaintext), nil)
	return base64.StdEncoding.EncodeToString(ciphertext), nil
}

func (m *Manager) decryptData(encryptedBase64 string) (string, error) {
	key := deriveKey(m.WalletPassword)
	ciphertext, err := base64.StdEncoding.DecodeString(encryptedBase64)
	if err != nil {
		return "", err
	}

	block, err := aes.NewCipher(key)
	if err != nil {
		return "", err
	}

	gcm, err := cipher.NewGCM(block)
	if err != nil {
		return "", err
	}

	nonceSize := gcm.NonceSize()
	if len(ciphertext) < nonceSize {
		return "", errors.New("ciphertext too short")
	}

	nonce, ciphertext := ciphertext[:nonceSize], ciphertext[nonceSize:]
	plaintext, err := gcm.Open(nil, nonce, ciphertext, nil)
	if err != nil {
		return "", err
	}

	return string(plaintext), nil
}

func deriveKey(secret string) []byte {
	h := sha256.Sum256([]byte(secret))
	return h[:]
}

// CollectAllResult результат глобального сбора
type CollectAllResult struct {
	TotalWallets   int                `json:"totalWallets"`
	SuccessCount   int                `json:"successCount"`
	FailedCount    int                `json:"failedCount"`
	SkippedCount   int                `json:"skippedCount"`
	TotalCollected string             `json:"totalCollected"`
	Results        []CollectOneResult `json:"results"`
}

// CollectOneResult результат сбора с одного кошелька
type CollectOneResult struct {
	WalletID  int    `json:"walletId"`
	Address   string `json:"address"`
	Balance   string `json:"balance"`
	Collected string `json:"collected"`
	TxID      string `json:"txId,omitempty"`
	Error     string `json:"error,omitempty"`
	Status    string `json:"status"` // success, failed, skipped
}

// GetWalletsWithBalance возвращает кошельки с балансом больше 0
func (m *Manager) GetWalletsWithBalance() ([]ManagedWallet, error) {
	var wallets []ManagedWallet
	if err := m.DB.Where("CAST(lastBalance AS DECIMAL(24,8)) > 0").Find(&wallets).Error; err != nil {
		return nil, err
	}
	return wallets, nil
}

// ClearAllWalletsResult результат очистки данных о кошельках
type ClearAllWalletsResult struct {
	ManagedWalletsDeleted int `json:"managedWalletsDeleted"`
	WalletPoolDeleted     int `json:"walletPoolDeleted"`
	UserWalletsDeleted    int `json:"userWalletsDeleted"`
	UsersUpdated          int `json:"usersUpdated"`
}

// ClearAllWallets удаляет все данные о кошельках из всех таблиц
func (m *Manager) ClearAllWallets() (*ClearAllWalletsResult, error) {
	result := &ClearAllWalletsResult{}

	// Удаляем managed_wallets
	res := m.DB.Where("1=1").Delete(&models.ManagedWallet{})
	if res.Error != nil {
		return nil, fmt.Errorf("ошибка очистки managed_wallets: %w", res.Error)
	}
	result.ManagedWalletsDeleted = int(res.RowsAffected)

	// Удаляем wallet_pool
	res = m.DB.Where("1=1").Delete(&models.WalletPool{})
	if res.Error != nil {
		return nil, fmt.Errorf("ошибка очистки wallet_pool: %w", res.Error)
	}
	result.WalletPoolDeleted = int(res.RowsAffected)

	// Удаляем user_wallets
	res = m.DB.Where("1=1").Delete(&models.UserWallet{})
	if res.Error != nil {
		return nil, fmt.Errorf("ошибка очистки user_wallets: %w", res.Error)
	}
	result.UserWalletsDeleted = int(res.RowsAffected)

	log.Printf("[WalletManager] ClearAllWallets: deleted managed=%d, pool=%d, userWallets=%d",
		result.ManagedWalletsDeleted, result.WalletPoolDeleted, result.UserWalletsDeleted)

	return result, nil
}
