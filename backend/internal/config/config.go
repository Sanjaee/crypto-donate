package config

import (
	"os"
	"strconv"
)

type Config struct {
	AppEnv      string
	Port        string
	DatabaseURL string

	MidtransServerKey string
	MidtransClientKey string
	MidtransIsProd    bool
	MidtransMock      bool

	InternalAPIToken string
	PlatformFeePct   int64
	CORSOrigins      []string

	CloudinaryCloudName string
	CloudinaryAPIKey    string
	CloudinaryAPISecret string
}

func Load() *Config {
	return &Config{
		AppEnv:              getEnv("APP_ENV", "development"),
		Port:                getEnv("PORT", "8080"),
		DatabaseURL:         getEnv("DATABASE_URL", ""),
		MidtransServerKey:   getEnv("MIDTRANS_SERVER_KEY", ""),
		MidtransClientKey:   getEnv("MIDTRANS_CLIENT_KEY", ""),
		MidtransIsProd:      getEnvBool("MIDTRANS_IS_PRODUCTION", false),
		MidtransMock:        getEnvBool("MOCK_MIDTRANS", false),
		InternalAPIToken:    getEnv("INTERNAL_API_TOKEN", ""),
		PlatformFeePct:      getEnvInt64("PLATFORM_FEE_PERCENT", 5),
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

func getEnvInt64(key string, fallback int64) int64 {
	if v := os.Getenv(key); v != "" {
		if n, err := strconv.ParseInt(v, 10, 64); err == nil {
			return n
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
