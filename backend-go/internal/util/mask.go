package util

func MaskAddress(addr string) string {
	if len(addr) <= 14 {
		return addr
	}
	return addr[:8] + "..." + addr[len(addr)-6:]
}
