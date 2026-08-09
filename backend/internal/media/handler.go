package media

import (
	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB *gorm.DB
}

// List GET /media (media milik user yang login).
func (h *Handler) List(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var list []models.MediaItem
	if err := h.DB.Where("user_id = ?", id).
		Order("created_at DESC").Limit(100).Find(&list).Error; err != nil {
		util.InternalError(c, "failed to load media")
		return
	}
	util.OK(c, list)
}

// Approve POST /media/:id/approve (QUEUED -> QUEUED, hanya milik owner).
func (h *Handler) Approve(c *gin.Context) {
	h.setStatus(c, models.MediaStatusQueued)
}

// Reject POST /media/:id/reject (QUEUED -> REJECTED, milik owner).
func (h *Handler) Reject(c *gin.Context) {
	h.setStatus(c, models.MediaStatusRejected)
}

func (h *Handler) setStatus(c *gin.Context, status string) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	mediaID, err := uuid.Parse(c.Param("id"))
	if err != nil {
		util.BadRequest(c, "invalid id")
		return
	}

	result := h.DB.Model(&models.MediaItem{}).
		Where("id = ? AND user_id = ?", mediaID, id).
		Update("status", status)
	if result.Error != nil {
		util.InternalError(c, "failed to update media")
		return
	}
	if result.RowsAffected == 0 {
		util.NotFound(c, "media not found")
		return
	}
	util.OK(c, gin.H{"status": status})
}
