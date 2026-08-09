package widgets

import (
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB *gorm.DB
}

type mediaResponse struct {
	ID        string `json:"id"`
	DonorName string `json:"donorName"`
	Amount    int64  `json:"amount"`
	Message   string `json:"message"`
	MediaType string `json:"mediaType"`
	MediaURL  string `json:"mediaUrl"`
	Duration  int    `json:"duration"`
}

type widgetConfig struct {
	ShowDonorName bool   `json:"showDonorName"`
	ShowMessage   bool   `json:"showMessage"`
	ShowAmount    bool   `json:"showAmount"`
	MinimumDonation int64 `json:"minimumDonation"`
}

// Config GET /widgets/mediashare/config?streamKey=xxx
func (h *Handler) Config(c *gin.Context) {
	setting, ok := h.settingByKey(c)
	if !ok {
		return
	}
	util.OK(c, widgetConfig{
		ShowDonorName: setting.ShowDonorName,
		ShowMessage:   setting.ShowMessage,
		ShowAmount:    setting.ShowAmount,
		MinimumDonation: setting.MinimumDonation,
	})
}

// NextMedia GET /widgets/mediashare/media?streamKey=xxx
// Mengambil 1 media QUEUED dengan FOR UPDATE SKIP LOCKED.
// Hanya satu widget yang mendapat media (mencegah double play).
func (h *Handler) NextMedia(c *gin.Context) {
	setting, ok := h.settingByKey(c)
	if !ok {
		return
	}

	var media models.MediaItem
	err := h.DB.Transaction(func(tx *gorm.DB) error {
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
			Where("status = ? AND user_id = ?", models.MediaStatusQueued, setting.UserID).
			Order("created_at ASC").
			Limit(1).
			Find(&media).Error; err != nil {
			return err
		}
		if media.ID == uuid.Nil {
			return nil
		}
		now := time.Now()
		return tx.Model(&media).Updates(map[string]any{
			"status":     models.MediaStatusPlaying,
			"started_at": &now,
		}).Error
	})
	if err != nil {
		util.InternalError(c, "failed to fetch media")
		return
	}

	if media.ID == uuid.Nil {
		util.OK(c, nil)
		return
	}

	var donation models.Donation
	h.DB.Select("donor_name, amount, message").Where("id = ?", media.DonationID).First(&donation)

	util.OK(c, mediaResponse{
		ID:        media.ID.String(),
		DonorName: donation.DonorName,
		Amount:    donation.Amount,
		Message:   donation.Message,
		MediaType: media.MediaType,
		MediaURL:  media.MediaURL,
		Duration:  media.Duration,
	})
}

// Complete POST /widgets/mediashare/:id/complete?streamKey=xxx
// PLAYING -> PLAYED.
func (h *Handler) Complete(c *gin.Context) {
	setting, ok := h.settingByKey(c)
	if !ok {
		return
	}
	mediaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		util.BadRequest(c, "invalid id")
		return
	}

	result := h.DB.Model(&models.MediaItem{}).
		Where("id = ? AND user_id = ? AND status = ?", mediaID, setting.UserID, models.MediaStatusPlaying).
		Updates(map[string]any{"status": models.MediaStatusPlayed, "played_at": time.Now()})
	if result.Error != nil {
		util.InternalError(c, "failed to update media")
		return
	}
	if result.RowsAffected == 0 {
		util.NotFound(c, "media not found or already played")
		return
	}
	util.OK(c, gin.H{"status": models.MediaStatusPlayed})
}

func (h *Handler) settingByKey(c *gin.Context) (*models.StreamSetting, bool) {
	key := c.Query("streamKey")
	if key == "" {
		util.BadRequest(c, "streamKey is required")
		return nil, false
	}
	var setting models.StreamSetting
	if err := h.DB.Where("stream_key = ?", key).First(&setting).Error; err != nil {
		util.Error(c, http.StatusNotFound, "invalid stream key")
		return nil, false
	}
	return &setting, true
}
