package config

import (
	"os"
	"strconv"
)

type Config struct {
	AppEnv      string
	Port        string
	DatabaseURL string

	PlisioAPIKey      string
	PlisioBaseURL     string
	PlisioProduction  bool
	PublicBaseURL     string
	PlisioWebhookBase string
	AdminEmails       []string

	InternalAPIToken string
	CORSOrigins      []string

	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string
}

func Load() *Config {
	prod := getEnvBool("PLISIO_PRODUCTION", false)
	// Plisio memakai host yang sama untuk sandbox & production
	// (dibedakan oleh tipe API key). Default selalu api.plisio.net.
	base := getEnv("PLISIO_BASE_URL", "")
	if base == "" {
		base = "https://api.plisio.net/api/v1"
	}
	return &Config{
		AppEnv:              getEnv("APP_ENV", "development"),
		Port:                getEnv("PORT", "8080"),
		DatabaseURL:         getEnv("DATABASE_URL", ""),
		PlisioAPIKey:        getEnv("PLISIO_API_KEY", ""),
		PlisioBaseURL:       base,
		PlisioProduction:    prod,
		PublicBaseURL:       getEnv("NEXT_PUBLIC_APP_URL", "http://localhost"),
		PlisioWebhookBase:   getEnv("PLISIO_WEBHOOK_BASE_URL", ""),
		AdminEmails:         splitCSV(getEnv("ADMIN_EMAILS", "")),
		InternalAPIToken:    getEnv("INTERNAL_API_TOKEN", ""),
		CORSOrigins:         splitCSV(getEnv("CORS_ORIGINS", "http://localhost:3000")),
		CloudinaryCloudName: getEnv("CLOUDINARY_CLOUD_NAME", ""),
		CloudinaryAPIKey:    getEnv("CLOUDINARY_API_KEY", ""),
		CloudinaryAPISecret: getEnv("CLOUDINARY_API_SECRET", ""),
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func getEnvBool(key string, fallback bool) bool {
	if v := os.Getenv(key); v != "" {
		if b, err := strconv.ParseBool(v); err == nil {
			return b
		}
	}
	return fallback
}

func splitCSV(s string) []string {
	var out []string
	cur := ""
	for _, r := range s {
		if r == ',' {
			if cur != "" {
				out = append(out, cur)
			}
			cur = ""
			continue
		}
		cur += string(r)
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
