package main

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/gin-contrib/cors"
	"github.com/gin-gonic/gin"
	"gorm.io/gorm"

	"mediashare/backend/internal/admin"
	"mediashare/backend/internal/auth"
	"mediashare/backend/internal/config"
	"mediashare/backend/internal/database"
	"mediashare/backend/internal/donations"
	"mediashare/backend/internal/media"
	"mediashare/backend/internal/middleware"
	"mediashare/backend/internal/models"
	"mediashare/backend/internal/payments"
	"mediashare/backend/internal/plisio"
	"mediashare/backend/internal/realtime"
	"mediashare/backend/internal/streamsettings"
	"mediashare/backend/internal/users"
	"mediashare/backend/internal/wallets"
	"mediashare/backend/internal/widgets"
)

func main() {
	cfg := config.Load()

	if cfg.DatabaseURL == "" {
		slog.Error("DATABASE_URL wajib diisi")
		os.Exit(1)
	}
	if cfg.InternalAPIToken == "" {
		slog.Warn("INTERNAL_API_TOKEN kosong — endpoint internal DIBLOKIR")
	}

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		slog.Error("gagal konek database", "error", err)
		os.Exit(1)
	}
	if err := database.AutoMigrate(db); err != nil {
		slog.Error("gagal migrasi database", "error", err)
		os.Exit(1)
	}
	ensureDefaultStreamSettings(db)
	promoteAdmins(db, cfg.AdminEmails)

	plisioClient := plisio.New(cfg.PlisioAPIKey, cfg.PlisioBaseURL)

	r := setupRouter(cfg, db, plisioClient)

	srv := &http.Server{
		Addr:              ":" + cfg.Port,
		Handler:           r,
		ReadHeaderTimeout: 10 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      20 * time.Second,
		IdleTimeout:       60 * time.Second,
	}

	go func() {
		slog.Info("server started", "port", cfg.Port, "env", cfg.AppEnv)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "error", err)
			os.Exit(1)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	<-quit

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	_ = srv.Shutdown(ctx)
	slog.Info("server stopped")
}

func setupRouter(cfg *config.Config, db *gorm.DB, plisioClient *plisio.Client) *gin.Engine {
	if cfg.AppEnv == "production" {
		gin.SetMode(gin.ReleaseMode)
	}
	r := gin.New()
	r.Use(gin.Recovery())
	r.Use(middleware.RequestID())

	// CORS — hanya origin terdaftar.
	r.Use(cors.New(cors.Config{
		AllowOrigins:     cfg.CORSOrigins,
		AllowMethods:     []string{"GET", "POST", "PATCH", "DELETE", "OPTIONS"},
		AllowHeaders:     []string{"Origin", "Content-Type", "Accept", "Authorization", middleware.HeaderInternalToken, middleware.HeaderUserID},
		ExposeHeaders:    []string{},
		AllowCredentials: true,
		MaxAge:           12 * time.Hour,
	}))

	api := r.Group("/api")

	hub := realtime.NewHub()

	authH := &auth.Handler{DB: db, AdminEmails: cfg.AdminEmails}
	usersH := &users.Handler{DB: db}
	donationsH := &donations.Handler{DB: db, Plisio: plisioClient, Config: cfg, PlatformFeePct: cfg.PlatformFeePct}
	paymentsH := &payments.Handler{DB: db, Plisio: plisioClient, Hub: hub}
	walletsH := &wallets.Handler{DB: db}
	mediaH := &media.Handler{DB: db, Hub: hub}
	widgetsH := &widgets.Handler{DB: db, Hub: hub}
	settingsH := &streamsettings.Handler{DB: db}
	adminH := &admin.Handler{DB: db}

	// ---- Public (rate limited) ----
	api.POST("/auth/register", middleware.RateLimit(10, time.Minute), authH.Register)
	api.POST("/auth/login", middleware.RateLimit(10, time.Minute), authH.Login)

	api.GET("/users/:username", usersH.PublicProfile)
	api.POST("/donations", middleware.RateLimit(10, time.Minute), donationsH.Create)

	// ---- Plisio webhook (HMAC verified, rate limited) ----
	api.POST("/webhooks/plisio", middleware.RateLimit(120, time.Minute), paymentsH.WebhookPlisio)

	// ---- Daftar metode pembayaran crypto ----
	api.GET("/payments/currencies", middleware.RateLimit(60, time.Minute), paymentsH.Currencies)

	// ---- Status pembayaran (publik, untuk halaman payment donor) ----
	api.GET("/payments/:orderId/status", middleware.RateLimit(120, time.Minute), paymentsH.Status)

	// ---- Widget polling (public, rate limited khusus) ----
	widgetGroup := api.Group("/widgets/mediashare")
	widgetGroup.GET("/config", middleware.RateLimit(120, time.Minute), widgetsH.Config)
	widgetGroup.GET("/media", middleware.RateLimit(120, time.Minute), widgetsH.NextMedia)
	widgetGroup.GET("/stream", middleware.RateLimit(120, time.Minute), widgetsH.Stream)
	widgetGroup.POST("/:id/complete", middleware.RateLimit(120, time.Minute), widgetsH.Complete)

	// ---- Internal (hanya dari Next.js server via INTERNAL_API_TOKEN) ----
	internal := api.Group("", middleware.InternalAuth(cfg.InternalAPIToken))
	internal.POST("/auth/verify-credentials", middleware.RateLimit(30, time.Minute), authH.VerifyCredentials)
	internal.POST("/auth/oauth", middleware.RateLimit(30, time.Minute), authH.OAuthLogin)

	// Backfill crypto lama (protected oleh INTERNAL_API_TOKEN).
	internal.POST("/dev/backfill-crypto", paymentsH.DevBackfill)

	authed := internal.Group("", middleware.UserID())
	authed.GET("/auth/me", authH.Me)
	authed.GET("/users/me", authH.Me)
	authed.PATCH("/users/me", usersH.UpdateMe)
	authed.GET("/dashboard/stats", adminH.DashboardStats)

	// ---- Admin (khusus role ADMIN) ----
	authed.GET("/admin/users", adminH.ListUsers)
	authed.GET("/admin/stats", adminH.GlobalStats)

	authed.GET("/wallet", walletsH.Summary)
	authed.GET("/wallet/transactions", walletsH.Transactions)

	authed.GET("/donations", donationsH.List)
	authed.GET("/donations/:id", donationsH.Get)

	authed.GET("/media", mediaH.List)
	authed.POST("/media/test", mediaH.Test)
	authed.POST("/media/:id/approve", mediaH.Approve)
	authed.POST("/media/:id/reject", mediaH.Reject)

	authed.GET("/stream-settings", settingsH.Get)
	authed.PATCH("/stream-settings", settingsH.Update)
	authed.POST("/stream-settings/regenerate-key", settingsH.RegenerateKey)

	r.GET("/healthz", func(c *gin.Context) {
		sqlDB, _ := db.DB()
		if err := sqlDB.PingContext(c.Request.Context()); err != nil {
			c.JSON(http.StatusServiceUnavailable, gin.H{"status": "unhealthy"})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "ok"})
	})

	return r
}

// ensureDefaultStreamSettings membuat stream setting untuk user yang belum punya.
func ensureDefaultStreamSettings(db *gorm.DB) {
	var users []models.User
	db.Find(&users)
	for _, u := range users {
		var count int64
		db.Model(&models.StreamSetting{}).Where("user_id = ?", u.ID).Count(&count)
		if count == 0 {
			db.Create(&models.StreamSetting{
				UserID:          u.ID,
				StreamKey:       randomHex(32),
				MinimumDonation: 100,
				DefaultDuration: 10,
				YouTubeEnabled:  true,
				TikTokEnabled:   true,
				GIFEnabled:      true,
				ImageEnabled:    true,
				ShowDonorName:   true,
				ShowMessage:     true,
				ShowAmount:      true,
			})
		}
	}
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

// promoteAdmins menetapkan role ADMIN untuk email pada env ADMIN_EMAILS.
func promoteAdmins(db *gorm.DB, adminEmails []string) {
	if len(adminEmails) == 0 {
		return
	}
	for _, email := range adminEmails {
		email = strings.ToLower(strings.TrimSpace(email))
		if email == "" {
			continue
		}
		db.Model(&models.User{}).Where("LOWER(email) = ?", email).Update("role", models.RoleAdmin)
	}
}
