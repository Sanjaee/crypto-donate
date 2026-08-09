package donations

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"mediashare/backend/internal/config"
	"mediashare/backend/internal/models"
	"mediashare/backend/internal/plisio"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB             *gorm.DB
	Plisio         *plisio.Client
	Config         *config.Config
	PlatformFeePct int64
}

type createDonationRequest struct {
	Username  string `json:"username" binding:"required"`
	DonorName string `json:"donorName" binding:"required"`
	Amount    int64  `json:"amount" binding:"required"`
	Currency  string `json:"currency"` // crypto: BTC, ETH, ...
	Message   string `json:"message"`
	MediaType string `json:"mediaType"`
	MediaURL  string `json:"mediaUrl"`
}

type createDonationResponse struct {
	DonationID   string `json:"donationId"`
	OrderID      string `json:"orderId"`
	TxnID        string `json:"txnId"`
	InvoiceURL   string `json:"invoiceUrl"`
	QRCode       string `json:"qrCode"`
	Currency     string `json:"currency"`
	CryptoAmount string `json:"cryptoAmount"`
	WalletHash   string `json:"walletHash"`
	Amount       int64  `json:"amount"`
}

// Create membuat donation + invoice crypto (Plisio).
func (h *Handler) Create(c *gin.Context) {
	var req createDonationRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "invalid data")
		return
	}
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))
	req.DonorName = strings.TrimSpace(req.DonorName)
	req.MediaType = strings.ToLower(strings.TrimSpace(req.MediaType))

	if len(req.DonorName) > 100 {
		util.BadRequest(c, "donor name is too long")
		return
	}
	if len(req.Message) > 500 {
		util.BadRequest(c, "message is too long")
		return
	}

	var user models.User
	if err := h.DB.Where("username = ?", req.Username).First(&user).Error; err != nil {
		util.NotFound(c, "user not found")
		return
	}

	var setting models.StreamSetting
	if err := h.DB.Where("user_id = ?", user.ID).First(&setting).Error; err != nil {
		util.NotFound(c, "stream setting not found")
		return
	}

	if req.Amount < setting.MinimumDonation {
		util.Error(c, http.StatusBadRequest, "minimum amount is "+util.FormatUSD(setting.MinimumDonation))
		return
	}

	if !plisio.IsConfigured(h.Plisio) {
		util.Error(c, http.StatusServiceUnavailable, "Payment provider is not configured yet")
		return
	}

	normalizedURL := ""
	if req.MediaType != "" {
		if !mediaTypeEnabled(setting, req.MediaType) {
			util.Error(c, http.StatusBadRequest, "media type not allowed")
			return
		}
		normalized, err := util.ValidateMediaURL(req.MediaType, req.MediaURL)
		if err != nil {
			util.Error(c, http.StatusBadRequest, err.Error())
			return
		}
		normalizedURL = normalized
	}

	// Platform fee + net amount (dihitung server, tidak dari frontend).
	platformFee := req.Amount * h.PlatformFeePct / 100
	netAmount := req.Amount - platformFee

	donation := &models.Donation{
		UserID:        user.ID,
		DonorName:     req.DonorName,
		Amount:        req.Amount,
		Message:       req.Message,
		MediaType:     req.MediaType,
		MediaURL:      normalizedURL,
		Status:        models.DonationStatusPending,
		PaymentStatus: models.PaymentStatusPending,
		PlatformFee:   platformFee,
		NetAmount:     netAmount,
	}
	if err := h.DB.Create(donation).Error; err != nil {
		util.InternalError(c, "failed to create donation")
		return
	}

	// Generate order_id unik (DON-...-timestamp-rand).
	orderID := util.NextOrderID()

	payment := &models.PaymentTransaction{
		DonationID:  donation.ID,
		OrderID:     orderID,
		Provider:    "PLISIO",
		GrossAmount: req.Amount,
		Status:      models.PaymentStatusPending,
	}
	if err := h.DB.Create(payment).Error; err != nil {
		util.InternalError(c, "failed to create payment")
		return
	}

	inv, err := h.createInvoice(req, orderID, user.Username)
	if err != nil {
		slog.Error("donation.create_invoice_error", "order_id", orderID, "error", err)
		h.DB.Model(payment).Update("raw_response", mustJSON(map[string]any{"error": err.Error()}))
		util.Error(c, http.StatusBadGateway, "failed to create crypto invoice")
		return
	}
	if inv != nil {
		raw, _ := json.Marshal(inv)
		h.DB.Model(payment).Updates(map[string]any{
			"raw_response":   string(raw),
			"transaction_id": inv.TxnID,
		})
	}

	util.OK(c, createDonationResponse{
		DonationID:   donation.ID.String(),
		OrderID:      orderID,
		TxnID:        inv.TxnID,
		InvoiceURL:   inv.InvoiceURL,
		QRCode:       qrCodeForInvoice(inv),
		Currency:     orDefault(inv.Currency, "BTC"),
		CryptoAmount: inv.Amount,
		WalletHash:   inv.WalletHash,
		Amount:       req.Amount,
	})
}

// qrCodeForInvoice mengambil QR dari response create-invoice Plisio.
// Jika white-label tidak menyediakan qr_code, generate dari wallet address
// atau invoice URL (data invoice asli, bukan simulasi).
func qrCodeForInvoice(inv *plisio.Invoice) string {
	if inv == nil {
		return ""
	}
	if inv.QRCode != "" {
		return inv.QRCode
	}
	if inv.WalletHash != "" {
		if qr := plisio.QRDataURI(inv.WalletHash, 256); qr != "" {
			return qr
		}
	}
	if inv.InvoiceURL != "" {
		return plisio.QRDataURI(inv.InvoiceURL, 256)
	}
	return ""
}

// createInvoice membuat invoice Plisio sungguhan.
func (h *Handler) createInvoice(req createDonationRequest, orderID, username string) (*plisio.Invoice, error) {
	if h.Plisio == nil || h.Plisio.APIKey == "" {
		return nil, fmt.Errorf("payment provider is not configured")
	}

	// callback base URL: utamakan PLISIO_WEBHOOK_BASE_URL (domain/tunnel),
	// fallback ke NEXT_PUBLIC_APP_URL. localhost tidak bisa diakses Plisio.
	cbBase := h.Config.PlisioWebhookBase
	if cbBase == "" {
		cbBase = h.Config.PublicBaseURL
	}
	cb := cbBase + "/api/webhooks/plisio?json=true"
	currency := strings.ToUpper(strings.TrimSpace(req.Currency))
	if currency == "" {
		currency = "BTC"
	}
	return h.Plisio.CreateInvoice(plisio.CreateInvoiceParams{
		Currency:        currency,
		AllowedPsysCids: currency, // hanya tampilkan QR untuk currency terpilih
		OrderName:       "Support for " + username,
		OrderNumber:     orderID,
		SourceCurrency:  "USD",
		SourceAmount:    float64(req.Amount) / 100, // cents -> USD
		Description:     req.Message,
		CallbackURL:     cb,
		ExpireMin:       60,
	})
}

// List menampilkan donation milik user yang sedang login.
func (h *Handler) List(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var list []models.Donation
	if err := h.DB.Where("user_id = ?", id).Order("created_at DESC").Limit(50).Find(&list).Error; err != nil {
		util.InternalError(c, "failed to load data")
		return
	}
	util.OK(c, list)
}

// Get detail donation (ownership check).
func (h *Handler) Get(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	donationID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		util.BadRequest(c, "invalid id")
		return
	}

	var donation models.Donation
	if err := h.DB.Where("id = ? AND user_id = ?", donationID, id).First(&donation).Error; err != nil {
		util.NotFound(c, "donation not found")
		return
	}
	util.OK(c, donation)
}

func mediaTypeEnabled(s models.StreamSetting, mediaType string) bool {
	switch mediaType {
	case models.MediaTypeYouTube:
		return s.YouTubeEnabled
	case models.MediaTypeTikTok:
		return s.TikTokEnabled
	case models.MediaTypeGIF:
		return s.GIFEnabled
	case models.MediaTypeImage:
		return s.ImageEnabled
	}
	return false
}

func orDefault(v, def string) string {
	if v == "" {
		return def
	}
	return v
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
