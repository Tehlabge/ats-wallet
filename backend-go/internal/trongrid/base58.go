package trongrid

import (
	"errors"
	"fmt"
	"strings"
)

const alphabet = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz"

var decodeMap [256]int

func init() {
	for i := range decodeMap {
		decodeMap[i] = -1
	}
	for i, c := range alphabet {
		decodeMap[c] = i
	}
}

// CleanTronAddress очищает адрес от пробелов и проверяет формат
func CleanTronAddress(addr string) string {
	return strings.TrimSpace(addr)
}

// IsValidTronAddress проверяет, является ли адрес валидным TRON-адресом
func IsValidTronAddress(addr string) bool {
	addr = CleanTronAddress(addr)
	if len(addr) != 34 {
		return false
	}
	if !strings.HasPrefix(addr, "T") {
		return false
	}
	for _, c := range addr {
		if decodeMap[c] < 0 {
			return false
		}
	}
	return true
}

func DecodeBase58(s string) ([]byte, error) {
	s = CleanTronAddress(s)
	if len(s) == 0 {
		return nil, errors.New("empty base58")
	}
	for i, c := range s {
		if decodeMap[c] < 0 {
			return nil, fmt.Errorf("invalid base58 character '%c' at position %d", c, i)
		}
	}
	var num []byte
	for _, c := range s {
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
	return num, nil
}

func TronAddressToHexParam(base58 string) (string, error) {
	b, err := DecodeBase58(base58)
	if err != nil {
		return "", err
	}
	if len(b) != 25 {
		return "", errors.New("invalid tron address length")
	}
	addr20 := b[1:21]
	const hexChars = "0123456789abcdef"
	out := make([]byte, 64)
	for i := 0; i < 12; i++ {
		out[i*2] = '0'
		out[i*2+1] = '0'
	}
	for i, by := range addr20 {
		out[24+i*2] = hexChars[by>>4]
		out[24+i*2+1] = hexChars[by&0x0f]
	}
	return string(out), nil
}
