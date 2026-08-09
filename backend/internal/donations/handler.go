package donations

import (
	"encoding/json"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/payments"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB             *gorm.DB
	Midtrans       *payments.MidtransClient
	PlatformFeePct int64
}

type createDonationRequest struct {
	Username   string `json:"username" binding:"required"`
	DonorName  string `json:"donorName" binding:"required"`
	Amount     int64  `json:"amount" binding:"required,min=1000"`
	Message    string `json:"message"`
	MediaType  string `json:"mediaType"`
	MediaURL   string `json:"mediaUrl"`
}

type createDonationResponse struct {
	DonationID string `json:"donationId"`
	OrderID    string `json:"orderId"`
	SnapToken  string `json:"snapToken"`
	RedirectURL string `json:"redirectUrl"`
	Amount     int64  `json:"amount"`
}

// Create membuat donation + payment Midtrans.
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
		util.Error(c, http.StatusBadRequest, "minimum amount is "+util.FormatIDR(setting.MinimumDonation))
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
		Provider:    "MIDTRANS",
		GrossAmount: req.Amount,
		Status:      models.PaymentStatusPending,
	}
	if err := h.DB.Create(payment).Error; err != nil {
		util.InternalError(c, "failed to create payment")
		return
	}

	if h.Midtrans.ServerKey == "" && !h.Midtrans.Mock {
		util.InternalError(c, "midtrans is not configured")
		return
	}

	snap, err := h.Midtrans.CreateSnap(orderID, req.Amount, "Dukungan untuk "+user.Username)
	if err != nil || snap.Token == "" {
		raw, _ := json.Marshal(snap)
		h.DB.Model(payment).Update("raw_response", string(raw))
		util.Error(c, http.StatusBadGateway, "failed to create midtrans payment")
		return
	}

	raw, _ := json.Marshal(snap)
	h.DB.Model(payment).Update("raw_response", string(raw))

	util.OK(c, createDonationResponse{
		DonationID:  donation.ID.String(),
		OrderID:     orderID,
		SnapToken:   snap.Token,
		RedirectURL: snap.RedirectURL,
		Amount:      req.Amount,
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
		util.BadRequest(c, "id tidak valid")
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
