package streamsettings

import (
	"crypto/rand"
	"encoding/hex"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB *gorm.DB
}

// Get GET /stream-settings.
func (h *Handler) Get(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var setting models.StreamSetting
	if err := h.DB.Where("user_id = ?", id).First(&setting).Error; err != nil {
		setting = models.StreamSetting{
			UserID:          id,
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
			QRBgColor:       "#F7931A",
			QRColor:         "#000000",
		}
		h.DB.Create(&setting)
	}
	util.OK(c, setting)
}

type updateRequest struct {
	MinimumDonation *int64 `json:"minimumDonation"`
	DefaultDuration *int   `json:"defaultDuration"`
	YouTubeEnabled  *bool  `json:"youtubeEnabled"`
	TikTokEnabled   *bool  `json:"tiktokEnabled"`
	GIFEnabled      *bool  `json:"gifEnabled"`
	ImageEnabled    *bool  `json:"imageEnabled"`
	ShowDonorName   *bool  `json:"showDonorName"`
	ShowMessage     *bool  `json:"showMessage"`
	ShowAmount      *bool  `json:"showAmount"`
	QRBgColor       *string `json:"qrBgColor"`
	QRColor         *string `json:"qrColor"`
}

// Update PATCH /stream-settings.
func (h *Handler) Update(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var req updateRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "invalid data")
		return
	}

	updates := map[string]any{}
	if req.MinimumDonation != nil {
		if *req.MinimumDonation < 0 {
			util.BadRequest(c, "invalid minimum donation")
			return
		}
		updates["minimum_donation"] = *req.MinimumDonation
	}
	if req.DefaultDuration != nil {
		if *req.DefaultDuration < 3 || *req.DefaultDuration > 120 {
			util.BadRequest(c, "duration must be between 3-120 seconds")
			return
		}
		updates["default_duration"] = *req.DefaultDuration
	}
	if req.YouTubeEnabled != nil {
		updates["youtube_enabled"] = *req.YouTubeEnabled
	}
	if req.TikTokEnabled != nil {
		updates["tiktok_enabled"] = *req.TikTokEnabled
	}
	if req.GIFEnabled != nil {
		updates["gif_enabled"] = *req.GIFEnabled
	}
	if req.ImageEnabled != nil {
		updates["image_enabled"] = *req.ImageEnabled
	}
	if req.ShowDonorName != nil {
		updates["show_donor_name"] = *req.ShowDonorName
	}
	if req.ShowMessage != nil {
		updates["show_message"] = *req.ShowMessage
	}
	if req.ShowAmount != nil {
		updates["show_amount"] = *req.ShowAmount
	}
	if req.QRBgColor != nil {
		if v := strings.TrimSpace(*req.QRBgColor); v != "" {
			updates["qr_bg_color"] = v
		}
	}
	if req.QRColor != nil {
		if v := strings.TrimSpace(*req.QRColor); v != "" {
			updates["qr_color"] = v
		}
	}
	if len(updates) == 0 {
		util.BadRequest(c, "no changes provided")
		return
	}

	if err := h.DB.Model(&models.StreamSetting{}).Where("user_id = ?", id).Updates(updates).Error; err != nil {
		util.InternalError(c, "failed to update settings")
		return
	}

	var setting models.StreamSetting
	h.DB.Where("user_id = ?", id).First(&setting)
	util.OK(c, setting)
}

// RegenerateKey POST /stream-settings/regenerate-key.
func (h *Handler) RegenerateKey(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	newKey := randomHex(32)
	if err := h.DB.Model(&models.StreamSetting{}).
		Where("user_id = ?", id).
		Update("stream_key", newKey).Error; err != nil {
		util.InternalError(c, "failed to generate new stream key")
		return
	}
	util.OK(c, gin.H{"streamKey": newKey})
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}
