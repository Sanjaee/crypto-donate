package logger

import (
	"log/slog"
	"os"

	"github.com/gin-gonic/gin"
)

const ctxKey = "appLogger"

// Init men-set default slog ke JSON output stdout dengan label service/env.
func Init(env string) *slog.Logger {
	h := slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{Level: slog.LevelInfo})
	base := slog.New(h).With("service", "api", "env", env)
	slog.SetDefault(base)
	return base
}

// Middleware menempelkan logger request-scoped (berisi request_id) ke gin context.
// Wajib dijalankan SETELAH middleware.RequestID().
func Middleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		lg := slog.Default().With("request_id", c.GetString("requestID"))
		c.Set(ctxKey, lg)
		c.Next()
	}
}

// From mengembalikan logger milik request saat ini, fallback ke slog.Default().
func From(c *gin.Context) *slog.Logger {
	if c != nil {
		if v, ok := c.Get(ctxKey); ok {
			if lg, ok := v.(*slog.Logger); ok {
				return lg
			}
		}
	}
	return slog.Default()
}

// With menambahkan pasangan key/value ke logger request (membuat instance baru).
func With(c *gin.Context, key string, value any) {
	lg := From(c)
	c.Set(ctxKey, lg.With(key, value))
}
