package rapira

import (
	"encoding/json"
	"fmt"
	"net/http"
	"time"
)

const defaultURL = "https://api.rapira.net/market/exchange-plate-mini?symbol=USDT/RUB"

type exchangePlate struct {
	Ask struct {
		Items []struct {
			Price  float64 `json:"price"`
			Amount float64 `json:"amount"`
		} `json:"items"`
	} `json:"ask"`
}

// FetchUSDTRubRate запрашивает курс USDT/RUB: среднее из цен первых трёх ордеров ask.
// Возвращает 0 при ошибке.
func FetchUSDTRubRate() (float64, error) {
	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Get(defaultURL)
	if err != nil {
		return 0, err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return 0, fmt.Errorf("rapira API status %d", resp.StatusCode)
	}
	var data exchangePlate
	if err := json.NewDecoder(resp.Body).Decode(&data); err != nil {
		return 0, err
	}
	items := data.Ask.Items
	if len(items) < 3 {
		if len(items) == 0 {
			return 0, fmt.Errorf("no ask items")
		}
		// меньше трёх — считаем среднее по имеющимся
		var sum float64
		for _, it := range items {
			sum += it.Price
		}
		return sum / float64(len(items)), nil
	}
	avg := (items[0].Price + items[1].Price + items[2].Price) / 3
	return avg, nil
}
