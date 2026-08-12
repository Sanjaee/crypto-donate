package models

import (
	"fmt"
	"strconv"
	"time"

	"github.com/google/uuid"
	"gorm.io/gorm"
)

const (
	RoleUser  = "USER"
	RoleAdmin = "ADMIN"

	ProviderCredentials = "CREDENTIALS"
	ProviderGoogle      = "GOOGLE"

	DonationStatusPending   = "PENDING"
	DonationStatusPaid      = "PAID"
	DonationStatusExpired   = "EXPIRED"
	DonationStatusCancelled = "CANCELLED"

	PaymentStatusPending   = "PENDING"
	PaymentStatusPaid      = "PAID"
	PaymentStatusExpired   = "EXPIRED"
	PaymentStatusCancelled = "CANCELLED"

	MediaStatusQueued   = "QUEUED"
	MediaStatusPlaying  = "PLAYING"
	MediaStatusPlayed   = "PLAYED"
	MediaStatusRejected = "REJECTED"
	MediaStatusExpired  = "EXPIRED"

	LedgerCredit = "CREDIT"
	LedgerDebit  = "DEBIT"

	RefTypeDonation   = "DONATION"
	RefTypeWithdrawal = "WITHDRAWAL"
	RefTypeFee        = "PLATFORM_FEE"

	MediaTypeYouTube = "youtube"
	MediaTypeTikTok  = "tiktok"
	MediaTypeGIF     = "gif"
	MediaTypeImage   = "image"
)

type User struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	Email        string    `gorm:"size:255;uniqueIndex;not null" json:"email"`
	Username     string    `gorm:"size:50;uniqueIndex;not null" json:"username"`
	Name         string    `gorm:"size:100;not null" json:"name"`
	PasswordHash string    `gorm:"size:255" json:"-"`
	AvatarURL    string    `gorm:"size:500" json:"avatarUrl"`
	Provider     string    `gorm:"size:20;not null;default:CREDENTIALS" json:"provider"`
	GoogleID     string    `gorm:"size:100;index" json:"-"`
	Role         string    `gorm:"size:20;not null;default:USER" json:"role"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

type Wallet struct {
	ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID    uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"userId"`
	Balance   int64     `gorm:"not null;default:0" json:"balance"`
	Currency  string    `gorm:"size:10;not null;default:USD" json:"currency"`
	CreatedAt time.Time `json:"createdAt"`
	UpdatedAt time.Time `json:"updatedAt"`
}

type WalletTransaction struct {
	ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	WalletID      uuid.UUID `gorm:"type:uuid;index;not null" json:"walletId"`
	Type          string    `gorm:"size:20;not null" json:"type"`
	Amount        int64     `gorm:"not null" json:"amount"`
	BalanceBefore int64     `gorm:"not null" json:"balanceBefore"`
	BalanceAfter  int64     `gorm:"not null" json:"balanceAfter"`
	ReferenceType string    `gorm:"size:50;index" json:"referenceType"`
	ReferenceID   uuid.UUID `gorm:"type:uuid;index" json:"referenceId"`
	Description   string    `gorm:"size:255" json:"description"`
	CreatedAt     time.Time `json:"createdAt"`
}

type Donation struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	UserID        uuid.UUID  `gorm:"type:uuid;index:idx_donation_user_created,priority:1;not null" json:"userId"`
	DonorName     string     `gorm:"size:100;not null" json:"donorName"`
	Amount        int64      `gorm:"not null" json:"amount"`
	CryptoAmount  string     `gorm:"size:50" json:"cryptoAmount"` // nominal crypto yg dibayar sukses
	Currency      string     `gorm:"size:20" json:"currency"`     // BTC / SOL / ...
	Message       string     `gorm:"type:text" json:"message"`
	MediaType     string     `gorm:"size:20" json:"mediaType"`
	MediaURL      string     `gorm:"size:1000" json:"mediaUrl"`
	Status        string     `gorm:"size:20;not null;default:PENDING" json:"status"`
	PaymentStatus string     `gorm:"size:20;not null;default:PENDING" json:"paymentStatus"`
	PlatformFee   int64      `gorm:"not null;default:0" json:"platformFee"`
	NetAmount     int64      `gorm:"not null;default:0" json:"netAmount"`
	CreatedAt     time.Time  `gorm:"index:idx_donation_user_created,priority:2" json:"createdAt"`
	PaidAt        *time.Time `json:"paidAt"`
}

type PaymentTransaction struct {
	ID            uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	DonationID    uuid.UUID  `gorm:"type:uuid;index;not null" json:"donationId"`
	OrderID       string     `gorm:"size:100;uniqueIndex;not null" json:"orderId"`
	Provider      string     `gorm:"size:20;not null;default:PLISIO" json:"provider"`
	GrossAmount   int64      `gorm:"not null" json:"grossAmount"`
	Status        string     `gorm:"size:20;not null;default:PENDING" json:"status"`
	PaymentType   string     `gorm:"size:50" json:"paymentType"`
	TransactionID *string    `gorm:"size:100;uniqueIndex" json:"transactionId"` // nullable: beberapa NULL diizinkan
	RawResponse   string     `gorm:"type:text" json:"rawResponse"`
	CreatedAt     time.Time  `json:"createdAt"`
	PaidAt        *time.Time `json:"paidAt"`
}

type MediaItem struct {
	ID         uuid.UUID  `gorm:"type:uuid;primaryKey" json:"id"`
	DonationID uuid.UUID  `gorm:"type:uuid;index;not null" json:"donationId"`
	UserID     uuid.UUID  `gorm:"type:uuid;index:idx_media_queue,priority:1;not null" json:"userId"`
	MediaType  string     `gorm:"size:20;not null" json:"mediaType"`
	MediaURL   string     `gorm:"size:1000;not null" json:"mediaUrl"`
	Status     string     `gorm:"size:20;not null;default:QUEUED;index:idx_media_queue,priority:2" json:"status"`
	Duration   int        `gorm:"not null;default:10" json:"duration"`
	CreatedAt  time.Time  `gorm:"index:idx_media_queue,priority:3" json:"createdAt"`
	StartedAt  *time.Time `json:"startedAt"`
	PlayedAt   *time.Time `json:"playedAt"`
}

type StreamSetting struct {
	ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID          uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"userId"`
	StreamKey       string    `gorm:"size:64;uniqueIndex;not null" json:"streamKey"`
	MinimumDonation int64     `gorm:"not null;default:100" json:"minimumDonation"`
	DefaultDuration int       `gorm:"not null;default:10" json:"defaultDuration"`
	YouTubeEnabled  bool      `gorm:"column:youtube_enabled;not null;default:true" json:"youtubeEnabled"`
	TikTokEnabled   bool      `gorm:"column:tiktok_enabled;not null;default:true" json:"tiktokEnabled"`
	GIFEnabled      bool      `gorm:"not null;default:true" json:"gifEnabled"`
	ImageEnabled    bool      `gorm:"not null;default:true" json:"imageEnabled"`
	ShowDonorName   bool      `gorm:"not null;default:true" json:"showDonorName"`
	ShowMessage     bool      `gorm:"not null;default:true" json:"showMessage"`
	ShowAmount      bool      `gorm:"not null;default:true" json:"showAmount"`
	QRBgColor       string    `gorm:"size:20;default:#F7931A" json:"qrBgColor"` // default bg = primary
	QRColor         string    `gorm:"size:20;default:#000000" json:"qrColor"`
	CreatedAt       time.Time `json:"createdAt"`
	UpdatedAt       time.Time `json:"updatedAt"`
}

const (
	WithdrawalPending   = "PENDING"
	WithdrawalProcessing = "PROCESSING"
	WithdrawalCompleted = "COMPLETED"
	WithdrawalRejected  = "REJECTED"
	WithdrawalFailed    = "FAILED"
)

// GlobalConfig menyimpan pengaturan platform (fee, dll).
// Satu baris per key. Diisi dari admin, dibaca saat settle/withdraw.
type GlobalConfig struct {
	Key       string `gorm:"size:50;primaryKey" json:"key"`
	Value     string `gorm:"size:200;not null" json:"value"`
	UpdatedAt time.Time `json:"updatedAt"`
}

// GetPlatformFee mengembalikan fee persen (contoh 5 = 5%) dari config global.
func GetPlatformFee(db *gorm.DB) int64 {
	var cfg GlobalConfig
	if err := db.Where("`key` = ?", "platform_fee_pct").First(&cfg).Error; err != nil {
		return 5 // default 5%
	}
	n, _ := strconv.ParseInt(cfg.Value, 10, 64)
	if n <= 0 || n > 50 {
		return 5
	}
	return n
}

// SetPlatformFee memperbarui fee persen.
func SetPlatformFee(db *gorm.DB, pct int64) error {
	if pct < 0 || pct > 50 {
		return fmt.Errorf("fee must be 0-50%%")
	}
	return db.Save(&GlobalConfig{Key: "platform_fee_pct", Value: strconv.FormatInt(pct, 10), UpdatedAt: time.Now()}).Error
}

type Withdrawal struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	UserID       uuid.UUID `gorm:"type:uuid;index;not null" json:"userId"`
	Amount       int64     `gorm:"not null" json:"amount"` // USD cents (debit penuh)
	PlatformFee  int64     `gorm:"not null;default:0" json:"platformFee"`
	NetAmount    int64     `gorm:"not null;default:0" json:"netAmount"` // Amount - PlatformFee
	Currency     string    `gorm:"size:20;not null" json:"currency"`
	ToAddress    string    `gorm:"size:200;not null" json:"toAddress"`
	CryptoAmount string    `gorm:"size:50" json:"cryptoAmount"`
	Fee          string    `gorm:"size:50" json:"fee"` // network fee dari API
	Status       string    `gorm:"size:20;not null;default:PENDING" json:"status"`
	RefID        string    `gorm:"size:100" json:"refId"` // operation id dari API
	TxURL        string    `gorm:"size:500" json:"txUrl"`
	ErrorMessage string    `gorm:"size:500" json:"errorMessage"`
	CreatedAt    time.Time `json:"createdAt"`
	UpdatedAt    time.Time `json:"updatedAt"`
}

func (w *Withdrawal) BeforeCreate(tx *gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

type AuditLog struct {
	ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
	ActorID      uuid.UUID `gorm:"type:uuid;index" json:"actorId"`
	Action       string    `gorm:"size:100;not null" json:"action"`
	ResourceType string    `gorm:"size:50;index" json:"resourceType"`
	ResourceID   string    `gorm:"size:100" json:"resourceId"`
	IPAddress    string    `gorm:"size:50" json:"ipAddress"`
	UserAgent    string    `gorm:"size:300" json:"userAgent"`
	Metadata     string    `gorm:"type:text" json:"metadata"`
	CreatedAt    time.Time `json:"createdAt"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.ID == uuid.Nil {
		u.ID = uuid.New()
	}
	return nil
}

func (w *Wallet) BeforeCreate(tx *gorm.DB) error {
	if w.ID == uuid.Nil {
		w.ID = uuid.New()
	}
	return nil
}

func (wt *WalletTransaction) BeforeCreate(tx *gorm.DB) error {
	if wt.ID == uuid.Nil {
		wt.ID = uuid.New()
	}
	return nil
}

func (d *Donation) BeforeCreate(tx *gorm.DB) error {
	if d.ID == uuid.Nil {
		d.ID = uuid.New()
	}
	return nil
}

func (p *PaymentTransaction) BeforeCreate(tx *gorm.DB) error {
	if p.ID == uuid.Nil {
		p.ID = uuid.New()
	}
	return nil
}

func (m *MediaItem) BeforeCreate(tx *gorm.DB) error {
	if m.ID == uuid.Nil {
		m.ID = uuid.New()
	}
	return nil
}

func (s *StreamSetting) BeforeCreate(tx *gorm.DB) error {
	if s.ID == uuid.Nil {
		s.ID = uuid.New()
	}
	return nil
}

func (a *AuditLog) BeforeCreate(tx *gorm.DB) error {
	if a.ID == uuid.Nil {
		a.ID = uuid.New()
	}
	return nil
}
