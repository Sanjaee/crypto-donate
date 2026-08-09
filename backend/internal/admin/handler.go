package admin

import (
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB *gorm.DB
}

// requireAdmin memastikan user yang login ber-role ADMIN.
func (h *Handler) requireAdmin(c *gin.Context) (uuid.UUID, bool) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)
	var user models.User
	if err := h.DB.First(&user, "id = ?", id).Error; err != nil || user.Role != models.RoleAdmin {
		util.Error(c, http.StatusForbidden, "forbidden")
		return uuid.Nil, false
	}
	return id, true
}

type userWithStats struct {
	ID              uuid.UUID `json:"id"`
	Email           string    `json:"email"`
	Username        string    `json:"username"`
	Name            string    `json:"name"`
	Role            string    `json:"role"`
	Provider        string    `json:"provider"`
	TotalDonations  int64     `json:"totalDonations"`
	TotalReceived   int64     `json:"totalReceived"` // net (USD cents)
	CreatedAt       string    `json:"createdAt"`
}

// ListUsers GET /admin/users — semua user + ringkasan donasi/pemasukan.
func (h *Handler) ListUsers(c *gin.Context) {
	if _, ok := h.requireAdmin(c); !ok {
		return
	}

	var users []models.User
	if err := h.DB.Order("created_at DESC").Find(&users).Error; err != nil {
		util.InternalError(c, "failed to load users")
		return
	}

	out := make([]userWithStats, 0, len(users))
	for _, u := range users {
		var totalDonations, totalReceived int64
		h.DB.Model(&models.Donation{}).
			Where("user_id = ? AND payment_status = ?", u.ID, models.PaymentStatusPaid).
			Count(&totalDonations)
		h.DB.Model(&models.Donation{}).
			Where("user_id = ? AND payment_status = ?", u.ID, models.PaymentStatusPaid).
			Select("COALESCE(SUM(net_amount), 0)").
			Scan(&totalReceived)
		out = append(out, userWithStats{
			ID:             u.ID,
			Email:          u.Email,
			Username:       u.Username,
			Name:           u.Name,
			Role:           u.Role,
			Provider:       u.Provider,
			TotalDonations: totalDonations,
			TotalReceived:  totalReceived,
			CreatedAt:      u.CreatedAt.Format("2006-01-02 15:04:05"),
		})
	}
	util.OK(c, out)
}

type globalStats struct {
	TotalUsers        int64 `json:"totalUsers"`
	AdminUsers        int64 `json:"adminUsers"`
	TotalDonations    int64 `json:"totalDonations"`
	PaidDonations     int64 `json:"paidDonations"`
	GrossVolume       int64 `json:"grossVolume"`
	PlatformRevenue   int64 `json:"platformRevenue"`
	NetVolume         int64 `json:"netVolume"`
	PendingPayments   int64 `json:"pendingPayments"`
	QueuedMedia       int64 `json:"queuedMedia"`
}

// GlobalStats GET /admin/stats — statistik seluruh platform.
func (h *Handler) GlobalStats(c *gin.Context) {
	if _, ok := h.requireAdmin(c); !ok {
		return
	}

	var s globalStats
	h.DB.Model(&models.User{}).Count(&s.TotalUsers)
	h.DB.Model(&models.User{}).Where("role = ?", models.RoleAdmin).Count(&s.AdminUsers)
	h.DB.Model(&models.Donation{}).Count(&s.TotalDonations)
	h.DB.Model(&models.Donation{}).Where("payment_status = ?", models.PaymentStatusPaid).Count(&s.PaidDonations)
	h.DB.Model(&models.Donation{}).Where("payment_status = ?", models.PaymentStatusPaid).
		Select("COALESCE(SUM(amount), 0)").Scan(&s.GrossVolume)
	h.DB.Model(&models.Donation{}).Where("payment_status = ?", models.PaymentStatusPaid).
		Select("COALESCE(SUM(platform_fee), 0)").Scan(&s.PlatformRevenue)
	h.DB.Model(&models.Donation{}).Where("payment_status = ?", models.PaymentStatusPaid).
		Select("COALESCE(SUM(net_amount), 0)").Scan(&s.NetVolume)
	h.DB.Model(&models.PaymentTransaction{}).Where("status = ?", models.PaymentStatusPending).Count(&s.PendingPayments)
	h.DB.Model(&models.MediaItem{}).Where("status = ?", models.MediaStatusQueued).Count(&s.QueuedMedia)

	util.OK(c, s)
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

type stats struct {
	TotalDonations int64 `json:"totalDonations"`
	PaidDonations  int64 `json:"paidDonations"`
	QueuedMedia    int64 `json:"queuedMedia"`
	TotalReceived  int64 `json:"totalReceived"`
}
