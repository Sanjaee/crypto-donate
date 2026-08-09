package plisio

import (
	"encoding/base64"

	"github.com/skip2/go-qrcode"
)

// QRDataURI menghasilkan QR code PNG sebagai data URI.
// Dipakai untuk menampilkan QR pembayaran tanpa bergantung pada
// white-label Plisio (wallet address crypto cukup untuk membayar).
func QRDataURI(text string, size int) string {
	if text == "" {
		return ""
	}
	png, err := qrcode.Encode(text, qrcode.Medium, size)
	if err != nil {
		return ""
	}
	return "data:image/png;base64," + base64.StdEncoding.EncodeToString(png)
}
