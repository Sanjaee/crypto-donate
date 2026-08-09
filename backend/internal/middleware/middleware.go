package middleware

import (
	"net/http"
	"strings"
	"sync"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

const (
	HeaderInternalToken = "X-Internal-Token"
	HeaderUserID        = "X-User-ID"
	HeaderRequestID     = "X-Request-ID"
)

func RequestID() gin.HandlerFunc {
	return func(c *gin.Context) {
		rid := c.GetHeader(HeaderRequestID)
		if rid == "" {
			rid = uuid.NewString()
		}
		c.Set("requestID", rid)
		c.Header(HeaderRequestID, rid)
		c.Next()
	}
}

// InternalAuth memverifikasi token antar-service (Next.js <-> Go API).
// Token hanya diketahui server; request dari browser ke /api tanpa token
// akan ditolak (403).
func InternalAuth(token string) gin.HandlerFunc {
	return func(c *gin.Context) {
		if token == "" {
			c.AbortWithStatusJSON(http.StatusInternalServerError, gin.H{"error": "internal token not configured"})
			return
		}
		got := c.GetHeader(HeaderInternalToken)
		if got == "" || !secureEqual(got, token) {
			c.AbortWithStatusJSON(http.StatusForbidden, gin.H{"error": "forbidden"})
			return
		}
		c.Next()
	}
}

// UserID memastikan X-User-ID tersedia dan valid UUID.
func UserID() gin.HandlerFunc {
	return func(c *gin.Context) {
		uid := c.GetHeader(HeaderUserID)
		id, err := uuid.Parse(uid)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing or invalid user id"})
			return
		}
		c.Set("userID", id)
		c.Next()
	}
}

// RateLimit sederhana (in-memory sliding window per IP+route).
// Cocok untuk MVP single-instance. Jika multi-instance, gunakan Redis.
func RateLimit(limit int, window time.Duration) gin.HandlerFunc {
	type bucket struct {
		count    int
		windowAt time.Time
	}
	var (
		mu      sync.Mutex
		buckets = make(map[string]*bucket)
	)
	return func(c *gin.Context) {
		key := c.ClientIP() + "|" + c.FullPath()
		now := time.Now()

		mu.Lock()
		b, ok := buckets[key]
		if !ok || now.Sub(b.windowAt) > window {
			b = &bucket{count: 0, windowAt: now}
			buckets[key] = b
		}
		b.count++
		count := b.count
		mu.Unlock()

		if count > limit {
			c.AbortWithStatusJSON(http.StatusTooManyRequests, gin.H{"error": "too many requests"})
			return
		}
		c.Next()
	}
}

func secureEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var v byte
	for i := 0; i < len(a); i++ {
		v |= a[i] ^ b[i]
	}
	return v == 0
}

func ClientIP(c *gin.Context) string {
	if forwarded := c.GetHeader("X-Forwarded-For"); forwarded != "" {
		parts := strings.Split(forwarded, ",")
		if len(parts) > 0 {
			return strings.TrimSpace(parts[0])
		}
	}
	return c.ClientIP()
}
