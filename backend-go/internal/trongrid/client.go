package trongrid

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"math/big"
	"net/http"
	"time"
)

const (
	DefaultURL           = "https://api.trongrid.io"
	USDTTRC20Mainnet     = "TR7NHqjeKQxGTCi8q8ZY4pL8otSzgjLj6t"
	balanceOfSelector    = "balanceOf(address)"
)

type Client struct {
	BaseURL    string
	APIKey     string
	HTTPClient *http.Client
}

func NewClient(baseURL, apiKey string) *Client {
	if baseURL == "" {
		baseURL = DefaultURL
	}
	return &Client{
		BaseURL: baseURL,
		APIKey:  apiKey,
		HTTPClient: &http.Client{
			Timeout: 15 * time.Second,
		},
	}
}

type triggerConstantReq struct {
	OwnerAddress      string `json:"owner_address"`
	ContractAddress   string `json:"contract_address"`
	FunctionSelector  string `json:"function_selector"`
	Parameter         string `json:"parameter"`
	Visible           bool   `json:"visible"`
}

type triggerConstantResp struct {
	ConstantResult []string `json:"constant_result"`
	Result         struct {
		Result bool `json:"result"`
	} `json:"result"`
}

// GetTRC20Balance returns USDT (6 decimals) balance for the given TRON address (base58).
// contractAddress is TRC20 contract in base58; use USDTTRC20Mainnet for mainnet USDT.
func (c *Client) GetTRC20Balance(ctx context.Context, ownerBase58, contractAddress string) (*big.Int, error) {
	if contractAddress == "" {
		contractAddress = USDTTRC20Mainnet
	}
	param, err := TronAddressToHexParam(ownerBase58)
	if err != nil {
		return nil, fmt.Errorf("owner address: %w", err)
	}
	body := triggerConstantReq{
		OwnerAddress:     ownerBase58,
		ContractAddress:  contractAddress,
		FunctionSelector: balanceOfSelector,
		Parameter:         param,
		Visible:          true,
	}
	raw, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.BaseURL+"/wallet/triggerconstantcontract", bytes.NewReader(raw))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.APIKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", c.APIKey)
	}
	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("trongrid status %d", resp.StatusCode)
	}
	var out triggerConstantResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}
	if len(out.ConstantResult) == 0 {
		return big.NewInt(0), nil
	}
	hexVal := out.ConstantResult[0]
	decoded, err := hex.DecodeString(hexVal)
	if err != nil {
		return nil, err
	}
	return new(big.Int).SetBytes(decoded), nil
}

// GetTRC20Balance - удобная функция для получения USDT баланса
// Возвращает строку с балансом в USDT (6 decimals)
func GetTRC20Balance(address, baseURL, apiKey string) (string, error) {
	client := NewClient(baseURL, apiKey)
	
	// Очищаем и валидируем адрес
	address = CleanTronAddress(address)
	if !IsValidTronAddress(address) {
		return "0", fmt.Errorf("invalid TRON address: %s", address)
	}
	
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	
	balance, err := client.GetTRC20Balance(ctx, address, USDTTRC20Mainnet)
	if err != nil {
		return "0", err
	}
	
	// Конвертируем в USDT (делим на 10^6)
	balanceFloat := new(big.Float).SetInt(balance)
	divisor := new(big.Float).SetInt(big.NewInt(1000000))
	result := new(big.Float).Quo(balanceFloat, divisor)
	
	return result.Text('f', 6), nil
}

// TRC20Transfer представляет входящий TRC20 перевод
type TRC20Transfer struct {
	TransactionID string `json:"transaction_id"`
	From          string `json:"from"`
	To            string `json:"to"`
	Value         string `json:"value"`
	BlockTimestamp int64 `json:"block_timestamp"`
}

type trc20TransfersResp struct {
	Data    []TRC20Transfer `json:"data"`
	Success bool            `json:"success"`
}

// GetTRC20Transfers получает входящие USDT переводы на адрес
func (c *Client) GetTRC20Transfers(ctx context.Context, address string, minTimestamp int64) ([]TRC20Transfer, error) {
	address = CleanTronAddress(address)
	if !IsValidTronAddress(address) {
		return nil, fmt.Errorf("invalid TRON address: %s", address)
	}

	url := fmt.Sprintf("%s/v1/accounts/%s/transactions/trc20?only_to=true&contract_address=%s&limit=50&order_by=block_timestamp,desc",
		c.BaseURL, address, USDTTRC20Mainnet)
	
	if minTimestamp > 0 {
		url += fmt.Sprintf("&min_timestamp=%d", minTimestamp)
	}

	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	if c.APIKey != "" {
		req.Header.Set("TRON-PRO-API-KEY", c.APIKey)
	}

	resp, err := c.HTTPClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("trongrid status %d", resp.StatusCode)
	}

	var out trc20TransfersResp
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return nil, err
	}

	return out.Data, nil
}
