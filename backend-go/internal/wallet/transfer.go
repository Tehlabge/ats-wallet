package wallet

import (
	"bytes"
	"context"
	"crypto/ecdsa"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"math/big"
	"net/http"
	"time"

	"github.com/ethereum/go-ethereum/crypto"
)

// TransferRequest - запрос на перевод
type TransferRequest struct {
	FromWalletID int     `json:"fromWalletId"`
	ToAddress    string  `json:"toAddress"`
	AmountUsdt   float64 `json:"amountUsdt"`
	Password     string  `json:"password"`
}

// TransferResult - результат перевода
type TransferResult struct {
	TxID        string `json:"txId"`
	FromAddress string `json:"fromAddress"`
	ToAddress   string `json:"toAddress"`
	Amount      string `json:"amount"`
	Status      string `json:"status"`
}

// USDT TRC20 контракт на mainnet
const USDTTRC20Contract = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"

// TransferUSDT выполняет перевод USDT с управляемого кошелька
func (m *Manager) TransferUSDT(ctx context.Context, req TransferRequest, tronGridURL, tronGridAPIKey string) (*TransferResult, error) {
	// Проверяем пароль
	if req.Password != m.WalletPassword {
		return nil, errors.New("неверный пароль кошелька")
	}

	// Получаем кошелёк
	wallet, err := m.GetWalletByID(req.FromWalletID)
	if err != nil {
		return nil, fmt.Errorf("кошелёк не найден: %w", err)
	}

	// Расшифровываем приватный ключ
	privateKeyHex, err := m.decryptData(wallet.PrivateKeyEnc)
	if err != nil {
		return nil, fmt.Errorf("ошибка расшифровки ключа: %w", err)
	}

	// Валидируем адрес получателя
	if !ValidateTronAddress(req.ToAddress) {
		return nil, errors.New("неверный адрес получателя")
	}

	// Конвертируем сумму в минимальные единицы (6 decimals для USDT)
	amountSun := big.NewInt(int64(req.AmountUsdt * 1e6))
	if amountSun.Cmp(big.NewInt(0)) <= 0 {
		return nil, errors.New("сумма должна быть больше 0")
	}

	// Создаём и подписываем транзакцию
	txID, err := m.broadcastTRC20Transfer(ctx, privateKeyHex, wallet.Address, req.ToAddress, amountSun, tronGridURL, tronGridAPIKey)
	if err != nil {
		return nil, fmt.Errorf("ошибка отправки транзакции: %w", err)
	}

	return &TransferResult{
		TxID:        txID,
		FromAddress: wallet.Address,
		ToAddress:   req.ToAddress,
		Amount:      fmt.Sprintf("%.6f USDT", req.AmountUsdt),
		Status:      "sent",
	}, nil
}

// broadcastTRC20Transfer создаёт, подписывает и отправляет TRC20 transfer транзакцию
func (m *Manager) broadcastTRC20Transfer(ctx context.Context, privateKeyHex, fromAddr, toAddr string, amount *big.Int, tronGridURL, tronGridAPIKey string) (string, error) {
	if tronGridURL == "" {
		tronGridURL = "https://api.trongrid.io"
	}

	// 1. Создаём транзакцию через TronGrid API
	txRaw, err := m.createTRC20Transaction(ctx, fromAddr, toAddr, amount, tronGridURL, tronGridAPIKey)
	if err != nil {
		return "", err
	}

	// 2. Подписываем транзакцию
	signedTx, err := m.signTransaction(txRaw, privateKeyHex)
	if err != nil {
		return "", err
	}

	// 3. Отправляем транзакцию
	txID, err := m.broadcastTransaction(ctx, signedTx, tronGridURL, tronGridAPIKey)
	if err != nil {
		return "", err
	}

	return txID, nil
}

// createTRC20Transaction создаёт TRC20 transfer транзакцию
func (m *Manager) createTRC20Transaction(ctx context.Context, fromAddr, toAddr string, amount *big.Int, baseURL, apiKey string) (map[string]interface{}, error) {
	// Кодируем параметры для transfer(address,uint256)
	// Selector: a9059cbb
	toHex, err := addressToHex(toAddr)
	if err != nil {
		return nil, err
	}

	// Параметр: адрес получателя (32 байта) + сумма (32 байта)
	parameter := fmt.Sprintf("%064s%064s", toHex[2:], fmt.Sprintf("%064x", amount))

	body := map[string]interface{}{
		"owner_address":     fromAddr,
		"contract_address":  USDTTRC20Contract,
		"function_selector": "transfer(address,uint256)",
		"parameter":         parameter,
		"fee_limit":         30000000, // 30 TRX fee limit
		"call_value":        0,
		"visible":           true,
	}

	jsonBody, _ := json.Marshal(body)
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/wallet/triggersmartcontract", bytes.NewReader(jsonBody))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", apiKey)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, err
	}

	if result["result"] == nil {
		return nil, fmt.Errorf("API error: %s", string(respBody))
	}

	resultObj, ok := result["result"].(map[string]interface{})
	if !ok || resultObj["result"] != true {
		msg := "unknown error"
		if resultObj != nil {
			if m, ok := resultObj["message"].(string); ok {
				msg = m
			}
		}
		return nil, fmt.Errorf("transaction creation failed: %s", msg)
	}

	tx, ok := result["transaction"].(map[string]interface{})
	if !ok {
		return nil, errors.New("no transaction in response")
	}

	return tx, nil
}

// signTransaction подписывает транзакцию приватным ключом
func (m *Manager) signTransaction(tx map[string]interface{}, privateKeyHex string) (map[string]interface{}, error) {
	// Получаем txID (raw_data_hex hash)
	txID, ok := tx["txID"].(string)
	if !ok {
		return nil, errors.New("no txID in transaction")
	}

	txIDBytes, err := hex.DecodeString(txID)
	if err != nil {
		return nil, err
	}

	// Декодируем приватный ключ
	privateKeyBytes, err := hex.DecodeString(privateKeyHex)
	if err != nil {
		return nil, err
	}

	privateKey, err := crypto.ToECDSA(privateKeyBytes)
	if err != nil {
		return nil, err
	}

	// Подписываем
	signature, err := crypto.Sign(txIDBytes, privateKey)
	if err != nil {
		return nil, err
	}

	// Добавляем подпись в транзакцию
	tx["signature"] = []string{hex.EncodeToString(signature)}

	return tx, nil
}

// broadcastTransaction отправляет подписанную транзакцию в сеть
func (m *Manager) broadcastTransaction(ctx context.Context, signedTx map[string]interface{}, baseURL, apiKey string) (string, error) {
	jsonBody, _ := json.Marshal(signedTx)
	req, err := http.NewRequestWithContext(ctx, "POST", baseURL+"/wallet/broadcasttransaction", bytes.NewReader(jsonBody))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "application/json")
	if apiKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", apiKey)
	}

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return "", err
	}

	if result["result"] != true {
		msg := "broadcast failed"
		if m, ok := result["message"].(string); ok {
			msg = m
		}
		if code, ok := result["code"].(string); ok {
			msg = fmt.Sprintf("%s (code: %s)", msg, code)
		}
		return "", errors.New(msg)
	}

	txID, _ := result["txid"].(string)
	if txID == "" {
		txID, _ = signedTx["txID"].(string)
	}

	return txID, nil
}

// addressToHex конвертирует TRON адрес в hex формат для параметров
func addressToHex(address string) (string, error) {
	decoded, err := base58Decode(address)
	if err != nil {
		return "", err
	}
	if len(decoded) != 25 {
		return "", errors.New("invalid address length")
	}
	// Убираем первый байт (0x41) и последние 4 байта (checksum)
	addrBytes := decoded[1:21]
	return "0x" + hex.EncodeToString(addrBytes), nil
}

// base58Decode декодирует Base58Check адрес
func base58Decode(s string) ([]byte, error) {
	const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"
	var decodeMap [256]int
	for i := range decodeMap {
		decodeMap[i] = -1
	}
	for i, c := range alphabet {
		decodeMap[c] = i
	}

	if len(s) == 0 {
		return nil, errors.New("empty input")
	}

	var num []byte
	for _, c := range s {
		if decodeMap[c] < 0 {
			return nil, errors.New("invalid base58 character")
		}
		carry := decodeMap[c]
		for j := len(num) - 1; j >= 0; j-- {
			carry += 58 * int(num[j])
			num[j] = byte(carry % 256)
			carry /= 256
		}
		for carry > 0 {
			num = append([]byte{byte(carry % 256)}, num...)
			carry /= 256
		}
	}

	// Добавляем ведущие нули
	for _, c := range s {
		if c != '1' {
			break
		}
		num = append([]byte{0}, num...)
	}

	return num, nil
}

// GetPrivateKeyFromSeed получает приватный ключ ECDSA из seed фразы
func GetPrivateKeyFromSeed(seedPhrase string) (*ecdsa.PrivateKey, error) {
	// Используем простое хеширование seed фразы (как в generator.go)
	// В реальном приложении лучше использовать BIP39/BIP44
	hash := crypto.Keccak256([]byte(seedPhrase))
	return crypto.ToECDSA(hash)
}

// CollectAllToAddress собирает все USDT со всех кошельков на один адрес
func (m *Manager) CollectAllToAddress(ctx context.Context, toAddress string, tronGridURL, tronGridAPIKey string) (*CollectAllResult, error) {
	// Валидируем адрес получателя
	if !ValidateTronAddress(toAddress) {
		return nil, errors.New("неверный адрес получателя")
	}

	// Получаем все кошельки
	var wallets []ManagedWallet
	if err := m.DB.Find(&wallets).Error; err != nil {
		return nil, fmt.Errorf("ошибка получения кошельков: %w", err)
	}

	result := &CollectAllResult{
		TotalWallets: len(wallets),
		Results:      make([]CollectOneResult, 0),
	}

	var totalCollected float64

	for _, w := range wallets {
		oneResult := CollectOneResult{
			WalletID: w.ID,
			Address:  w.Address,
			Balance:  w.LastBalance,
		}

		// Пропускаем если это тот же адрес
		if w.Address == toAddress {
			oneResult.Status = "skipped"
			oneResult.Error = "это адрес получателя"
			result.Results = append(result.Results, oneResult)
			continue
		}

		// Проверяем баланс
		balanceStr := w.LastBalance
		if balanceStr == "" || balanceStr == "0" {
			oneResult.Status = "skipped"
			oneResult.Error = "нулевой баланс"
			result.Results = append(result.Results, oneResult)
			continue
		}

		// Конвертируем баланс
		var balance float64
		fmt.Sscanf(balanceStr, "%f", &balance)
		if balance <= 0 {
			oneResult.Status = "skipped"
			oneResult.Error = "нулевой баланс"
			result.Results = append(result.Results, oneResult)
			continue
		}

		// Расшифровываем приватный ключ
		privateKeyHex, err := m.decryptData(w.PrivateKeyEnc)
		if err != nil {
			oneResult.Status = "failed"
			oneResult.Error = fmt.Sprintf("ошибка расшифровки ключа: %v", err)
			result.FailedCount++
			result.Results = append(result.Results, oneResult)
			continue
		}

		// Переводим весь баланс
		amountSun := big.NewInt(int64(balance * 1e6))
		txID, err := m.broadcastTRC20Transfer(ctx, privateKeyHex, w.Address, toAddress, amountSun, tronGridURL, tronGridAPIKey)
		if err != nil {
			oneResult.Status = "failed"
			oneResult.Error = fmt.Sprintf("ошибка перевода: %v", err)
			result.FailedCount++
			result.Results = append(result.Results, oneResult)
			continue
		}

		oneResult.Status = "success"
		oneResult.TxID = txID
		oneResult.Collected = fmt.Sprintf("%.6f", balance)
		totalCollected += balance
		result.SuccessCount++
		result.Results = append(result.Results, oneResult)
	}

	result.TotalCollected = fmt.Sprintf("%.6f USDT", totalCollected)
	return result, nil
}
