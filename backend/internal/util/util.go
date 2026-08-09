package util

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"regexp"
	"strings"
	"time"
)

var (
	usernameRe = regexp.MustCompile(`^[a-z0-9](?:[a-z0-9_]{2,29})$`)
	emailRe    = regexp.MustCompile(`^[^@\s]+@[^@\s]+\.[^@\s]+$`)
)

func ValidUsername(u string) bool { return usernameRe.MatchString(u) }

func ValidEmail(e string) bool { return emailRe.MatchString(e) }

// NextOrderID menghasilkan order_id unik: DON-YYYYMMDD-HHMMSS-XXXXXX
// Unik tanpa perlu sequence, aman dari race condition.
func NextOrderID() string {
	suffix := make([]byte, 3)
	if _, err := rand.Read(suffix); err != nil {
		panic(err)
	}
	return fmt.Sprintf("DON-%s-%s", time.Now().Format("20060102-150405"), hex.EncodeToString(suffix))
}

// FormatUSD memformat nominal integer (sen) ke string USD.
// Contoh: 500 -> "$5.00"
func FormatUSD(cents int64) string {
	neg := cents < 0
	if neg {
		cents = -cents
	}
	dollars := cents / 100
	c := cents % 100
	s := fmt.Sprintf("%d.%02d", dollars, c)

	// Thousands separator.
	parts := strings.SplitN(s, ".", 2)
	intPart := parts[0]
	var grouped []string
	for len(intPart) > 3 {
		grouped = append([]string{intPart[len(intPart)-3:]}, grouped...)
		intPart = intPart[:len(intPart)-3]
	}
	grouped = append([]string{intPart}, grouped...)

	out := "$" + strings.Join(grouped, ",") + "." + parts[1]
	if neg {
		out = "-" + out
	}
	return out
}
