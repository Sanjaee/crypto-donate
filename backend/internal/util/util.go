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

// FormatIDR memformat nominal integer ke string Rupiah.
func FormatIDR(n int64) string {
	neg := n < 0
	if neg {
		n = -n
	}
	s := fmt.Sprintf("%d", n)
	var parts []string
	for len(s) > 3 {
		parts = append([]string{s[len(s)-3:]}, parts...)
		s = s[:len(s)-3]
	}
	parts = append([]string{s}, parts...)
	out := "Rp" + strings.Join(parts, ".")
	if neg {
		out = "-" + out
	}
	return out
}
