package wallet

import (
	"crypto/ecdsa"
	"crypto/sha256"
	"encoding/binary"
	"encoding/hex"
	"errors"
	"fmt"

	"github.com/ethereum/go-ethereum/crypto"
	"github.com/tyler-smith/go-bip32"
	"github.com/tyler-smith/go-bip39"
	"golang.org/x/crypto/sha3"
)

// GeneratedWallet содержит данные сгенерированного кошелька
type GeneratedWallet struct {
	Address    string // TRON адрес в Base58Check (начинается с T)
	PrivateKey string // Приватный ключ в hex
	Seed       string // 12-word seed phrase (BIP39 mnemonic)
}

// GenerateWallet создаёт новый TRON кошелёк из существующей seed-фразы
func GenerateWallet(seedPhrase string) (*GeneratedWallet, error) {
	// Валидируем мнемоник
	if !bip39.IsMnemonicValid(seedPhrase) {
		return nil, errors.New("invalid mnemonic phrase")
	}

	// Получаем seed из мнемоника (без пароля)
	seed := bip39.NewSeed(seedPhrase, "")

	// Деривируем приватный ключ по пути m/44'/195'/0'/0/0 (TRON BIP44 path)
	privateKey, err := derivePrivateKey(seed)
	if err != nil {
		return nil, fmt.Errorf("failed to derive private key: %w", err)
	}

	// Получаем публичный ключ
	publicKey := privateKey.Public().(*ecdsa.PublicKey)

	// Генерируем TRON адрес
	address, err := publicKeyToTronAddress(publicKey)
	if err != nil {
		return nil, err
	}

	return &GeneratedWallet{
		Address:    address,
		PrivateKey: hex.EncodeToString(crypto.FromECDSA(privateKey)),
		Seed:       seedPhrase,
	}, nil
}

// GenerateWalletNew создаёт новый кошелёк с новой seed-фразой
func GenerateWalletNew() (*GeneratedWallet, error) {
	// Генерируем новую мнемоническую фразу (128 бит энтропии = 12 слов)
	entropy, err := bip39.NewEntropy(128)
	if err != nil {
		return nil, fmt.Errorf("failed to generate entropy: %w", err)
	}

	mnemonic, err := bip39.NewMnemonic(entropy)
	if err != nil {
		return nil, fmt.Errorf("failed to generate mnemonic: %w", err)
	}

	// Получаем seed из мнемоника
	seed := bip39.NewSeed(mnemonic, "")

	// Деривируем приватный ключ по пути m/44'/195'/0'/0/0 (TRON BIP44 path)
	privateKey, err := derivePrivateKey(seed)
	if err != nil {
		return nil, fmt.Errorf("failed to derive private key: %w", err)
	}

	// Получаем публичный ключ
	publicKey := privateKey.Public().(*ecdsa.PublicKey)

	// Генерируем TRON адрес
	address, err := publicKeyToTronAddress(publicKey)
	if err != nil {
		return nil, err
	}

	return &GeneratedWallet{
		Address:    address,
		PrivateKey: hex.EncodeToString(crypto.FromECDSA(privateKey)),
		Seed:       mnemonic,
	}, nil
}

// derivePrivateKey деривирует приватный ключ из seed по BIP44 пути для TRON
// Путь: m/44'/195'/0'/0/0
// 195 = TRON coin type
func derivePrivateKey(seed []byte) (*ecdsa.PrivateKey, error) {
	// Создаём мастер ключ
	masterKey, err := bip32.NewMasterKey(seed)
	if err != nil {
		return nil, err
	}

	// BIP44 путь для TRON: m/44'/195'/0'/0/0
	// 44' - BIP44 purpose
	// 195' - TRON coin type (hardened)
	// 0' - account (hardened)
	// 0 - change (external)
	// 0 - address index

	purpose, err := masterKey.NewChildKey(bip32.FirstHardenedChild + 44)
	if err != nil {
		return nil, err
	}

	coinType, err := purpose.NewChildKey(bip32.FirstHardenedChild + 195) // TRON = 195
	if err != nil {
		return nil, err
	}

	account, err := coinType.NewChildKey(bip32.FirstHardenedChild + 0)
	if err != nil {
		return nil, err
	}

	change, err := account.NewChildKey(0)
	if err != nil {
		return nil, err
	}

	addressIndex, err := change.NewChildKey(0)
	if err != nil {
		return nil, err
	}

	// Конвертируем в ECDSA приватный ключ
	privateKey, err := crypto.ToECDSA(addressIndex.Key)
	if err != nil {
		return nil, err
	}

	return privateKey, nil
}

// GenerateWalletRandom создаёт кошелёк со случайным приватным ключом (без seed-фразы)
func GenerateWalletRandom() (*GeneratedWallet, string, error) {
	// Генерируем случайный приватный ключ напрямую
	privateKey, err := crypto.GenerateKey()
	if err != nil {
		return nil, "", fmt.Errorf("failed to generate private key: %w", err)
	}

	publicKey := privateKey.Public().(*ecdsa.PublicKey)

	address, err := publicKeyToTronAddress(publicKey)
	if err != nil {
		return nil, "", err
	}

	privKeyHex := hex.EncodeToString(crypto.FromECDSA(privateKey))

	return &GeneratedWallet{
		Address:    address,
		PrivateKey: privKeyHex,
	}, privKeyHex, nil
}

// publicKeyToTronAddress конвертирует публичный ключ в TRON адрес (Base58Check)
func publicKeyToTronAddress(publicKey *ecdsa.PublicKey) (string, error) {
	// Сериализуем публичный ключ (без prefix 0x04)
	pubBytes := crypto.FromECDSAPub(publicKey)
	if len(pubBytes) != 65 {
		return "", errors.New("invalid public key length")
	}

	// Keccak256 хеш от публичного ключа (без первого байта 0x04)
	hash := sha3.NewLegacyKeccak256()
	hash.Write(pubBytes[1:])
	addressBytes := hash.Sum(nil)

	// Берём последние 20 байт
	addressBytes = addressBytes[len(addressBytes)-20:]

	// Добавляем TRON prefix 0x41
	tronAddress := make([]byte, 21)
	tronAddress[0] = 0x41
	copy(tronAddress[1:], addressBytes)

	// Конвертируем в Base58Check
	return base58CheckEncode(tronAddress), nil
}

// Base58 алфавит (без 0, O, I, l)
const base58Alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

// base58CheckEncode кодирует байты в Base58Check формат
func base58CheckEncode(input []byte) string {
	// Двойной SHA256 для checksum
	hash1 := sha256.Sum256(input)
	hash2 := sha256.Sum256(hash1[:])
	checksum := hash2[:4]

	// Добавляем checksum
	payload := append(input, checksum...)

	// Base58 encode
	return base58Encode(payload)
}

// base58Encode кодирует байты в Base58
func base58Encode(input []byte) string {
	if len(input) == 0 {
		return ""
	}

	// Считаем ведущие нули
	zeros := 0
	for _, b := range input {
		if b == 0 {
			zeros++
		} else {
			break
		}
	}

	// Конвертируем в big integer и затем в base58
	size := len(input)*138/100 + 1
	buf := make([]byte, size)

	high := size - 1
	for _, b := range input {
		carry := int(b)
		j := size - 1
		for ; j > high || carry != 0; j-- {
			carry += 256 * int(buf[j])
			buf[j] = byte(carry % 58)
			carry /= 58
		}
		high = j
	}

	// Пропускаем ведущие нули в результате
	j := 0
	for j < size && buf[j] == 0 {
		j++
	}

	// Преобразуем в строку
	result := make([]byte, zeros+size-j)
	for i := 0; i < zeros; i++ {
		result[i] = '1'
	}
	for i := zeros; j < size; i, j = i+1, j+1 {
		result[i] = base58Alphabet[buf[j]]
	}

	return string(result)
}

// ValidateTronAddress проверяет валидность TRON адреса
func ValidateTronAddress(address string) bool {
	if len(address) != 34 {
		return false
	}
	if address[0] != 'T' {
		return false
	}
	// Проверяем что все символы валидны для Base58
	for _, c := range address {
		if !isBase58Char(byte(c)) {
			return false
		}
	}
	return true
}

func isBase58Char(c byte) bool {
	for i := 0; i < len(base58Alphabet); i++ {
		if base58Alphabet[i] == c {
			return true
		}
	}
	return false
}

// Suppress unused import warning
var _ = binary.BigEndian
