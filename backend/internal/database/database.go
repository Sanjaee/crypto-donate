package database

import (
	"time"

	"gorm.io/driver/postgres"
	"gorm.io/gorm"
	"gorm.io/gorm/logger"
	"gorm.io/gorm/schema"

	"mediashare/backend/internal/models"
)

// Connect membuka koneksi GORM ke PostgreSQL.
// Semua tabel diberi prefix "ms_" agar tidak bertabrakan dengan
// aplikasi lain yang memakai database yang sama (mis. Neon shared).
func Connect(dsn string) (*gorm.DB, error) {
	db, err := gorm.Open(postgres.Open(dsn), &gorm.Config{
		Logger: logger.Default.LogMode(logger.Warn),
		NamingStrategy: schema.NamingStrategy{
			TablePrefix: "ms_",
		},
	})
	if err != nil {
		return nil, err
	}

	sqlDB, err := db.DB()
	if err != nil {
		return nil, err
	}
	sqlDB.SetMaxOpenConns(20)
	sqlDB.SetMaxIdleConns(5)
	sqlDB.SetConnMaxLifetime(time.Hour)

	return db, nil
}

// AutoMigrate membangun skema dari GORM model (source of truth).
func AutoMigrate(db *gorm.DB) error {
	// Rename kolom legacy DULU, baru AutoMigrate (hindari kolom duplikat).
	if err := fixLegacyColumns(db); err != nil {
		return err
	}
	return db.AutoMigrate(
		&models.User{},
		&models.Wallet{},
		&models.WalletTransaction{},
		&models.Donation{},
		&models.PaymentTransaction{},
		&models.MediaItem{},
		&models.StreamSetting{},
		&models.Withdrawal{},
		&models.AuditLog{},
	)
}

// fixLegacyColumns memperbaiki penamaan kolom yang dihasilkan GORM lama
// (YouTubeEnabled -> you_tube_enabled, TikTokEnabled -> tik_tok_enabled).
func fixLegacyColumns(db *gorm.DB) error {
	stmts := []string{
		`DO $$ BEGIN
			IF EXISTS (SELECT 1 FROM information_schema.columns
				WHERE table_name='ms_stream_settings' AND column_name='you_tube_enabled') THEN
				ALTER TABLE ms_stream_settings RENAME COLUMN you_tube_enabled TO youtube_enabled;
			END IF;
		END $$;`,
		`DO $$ BEGIN
			IF EXISTS (SELECT 1 FROM information_schema.columns
				WHERE table_name='ms_stream_settings' AND column_name='tik_tok_enabled') THEN
				ALTER TABLE ms_stream_settings RENAME COLUMN tik_tok_enabled TO tiktok_enabled;
			END IF;
		END $$;`,
	}
	for _, s := range stmts {
		if err := db.Exec(s).Error; err != nil {
			return err
		}
	}
	return nil
}
