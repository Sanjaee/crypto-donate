package admin

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

type stats struct {
	TotalDonations  int64 `json:"totalDonations"`
	PaidDonations   int64 `json:"paidDonations"`
	QueuedMedia     int64 `json:"queuedMedia"`
	TotalReceived   int64 `json:"totalReceived"`
}

// DashboardStats GET /dashboard/stats — statistik user yang login.
func (h *Handler) DashboardStats(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var s stats
	h.DB.Model(&models.Donation{}).Where("user_id = ?", id).Count(&s.TotalDonations)
	h.DB.Model(&models.Donation{}).Where("user_id = ? AND payment_status = ?", id, models.PaymentStatusPaid).Count(&s.PaidDonations)
	h.DB.Model(&models.MediaItem{}).Where("user_id = ? AND status = ?", id, models.MediaStatusQueued).Count(&s.QueuedMedia)
	h.DB.Model(&models.Donation{}).
		Where("user_id = ? AND payment_status = ?", id, models.PaymentStatusPaid).
		Select("COALESCE(SUM(net_amount), 0)").
		Scan(&s.TotalReceived)

	util.OK(c, s)
}
