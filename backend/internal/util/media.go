package util

import (
	"fmt"
	"net"
	"net/url"
	"regexp"
	"strings"

	"mediashare/backend/internal/models"
)

var (
	youTubeIDRe  = regexp.MustCompile(`(?:v=|youtu\.be/|shorts/|embed/)([A-Za-z0-9_-]{6,11})`)
	youtubeDomain = map[string]bool{
		"youtube.com":   true,
		"www.youtube.com": true,
		"youtu.be":      true,
		"m.youtube.com": true,
		"i.ytimg.com":   true,
		"img.youtube.com": true,
	}
	gifDomains = map[string]bool{
		"giphy.com":    true,
		"www.giphy.com": true,
		"media.giphy.com": true,
		"c.tenor.com":  true,
		"media.tenor.com": true,
		"tenor.com":    true,
		"www.tenor.com": true,
	}
	imageDomains = map[string]bool{
		"res.cloudinary.com": true,
	}
)

// ValidateMediaURL memvalidasi URL media donor.
// Tujuan: mencegah SSRF, malicious URL, dan akses jaringan internal.
func ValidateMediaURL(mediaType, raw string) (string, error) {
	raw = strings.TrimSpace(raw)
	if raw == "" {
		return "", nil
	}
	if len(raw) > 1000 {
		return "", fmt.Errorf("media URL is too long")
	}

	if mediaType == models.MediaTypeYouTube {
		id := ExtractYouTubeID(raw)
		if id == "" {
			return "", fmt.Errorf("invalid YouTube URL")
		}
		return id, nil
	}

	u, err := url.Parse(raw)
	if err != nil {
		return "", fmt.Errorf("invalid URL")
	}
	if u.Scheme != "https" && u.Scheme != "http" {
		return "", fmt.Errorf("URL must be http/https")
	}
	host := strings.ToLower(u.Hostname())
	if host == "" {
		return "", fmt.Errorf("invalid host")
	}

	// Tolak IP mentah (localhost / internal network).
	if ip := net.ParseIP(host); ip != nil {
		return "", fmt.Errorf("URL host is not allowed")
	}
	if isInternalHost(host) {
		return "", fmt.Errorf("URL host is not allowed")
	}

	var allowed bool
	switch mediaType {
	case models.MediaTypeGIF:
		allowed = gifDomains[host]
	case models.MediaTypeImage:
		allowed = imageDomains[host] || gifDomains[host]
	default:
		allowed = false
	}
	if !allowed {
		return "", fmt.Errorf("domain %s is not allowed", host)
	}
	return u.String(), nil
}

// ExtractYouTubeID mengekstrak video_id dari berbagai bentuk URL YouTube.
func ExtractYouTubeID(raw string) string {
	raw = strings.TrimSpace(raw)
	u, err := url.Parse(raw)
	if err != nil {
		return ""
	}
	host := strings.ToLower(u.Hostname())
	if !youtubeDomain[host] {
		return ""
	}
	if m := youTubeIDRe.FindStringSubmatch(raw); m != nil {
		return m[1]
	}
	if u.Hostname() == "youtu.be" {
		parts := strings.Split(strings.TrimPrefix(u.Path, "/"), "/")
		if len(parts) > 0 && len(parts[0]) >= 6 {
			return parts[0]
		}
	}
	return ""
}

func isInternalHost(host string) bool {
	lower := strings.ToLower(host)
	if lower == "localhost" || strings.HasSuffix(lower, ".localhost") {
		return true
	}
	if strings.HasSuffix(lower, ".internal") || strings.HasSuffix(lower, ".local") {
		return true
	}
	return false
}
