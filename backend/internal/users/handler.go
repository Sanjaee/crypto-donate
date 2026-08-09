package users

import (
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

type publicProfile struct {
	Username    string `json:"username"`
	Name        string `json:"name"`
	AvatarURL   string `json:"avatarUrl"`
	MinDonation int64  `json:"minimumDonation"`
}

// PublicProfile data publik untuk halaman /donate/:username.
func (h *Handler) PublicProfile(c *gin.Context) {
	username := strings.ToLower(c.Param("username"))

	var user models.User
	if err := h.DB.Where("username = ?", username).First(&user).Error; err != nil {
		util.NotFound(c, "user not found")
		return
	}

	var setting models.StreamSetting
	if err := h.DB.Where("user_id = ?", user.ID).First(&setting).Error; err != nil {
		setting.MinimumDonation = 10000
	}

	util.OK(c, publicProfile{
		Username:    user.Username,
		Name:        user.Name,
		AvatarURL:   user.AvatarURL,
		MinDonation: setting.MinimumDonation,
	})
}

type updateMeRequest struct {
	Name   string `json:"name"`
	Avatar string `json:"avatarUrl"`
}

// UpdateMe PATCH /users/me.
func (h *Handler) UpdateMe(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var req updateMeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "invalid data")
		return
	}

	updates := map[string]any{}
	if req.Name != "" {
		updates["name"] = req.Name
	}
	if req.Avatar != "" {
		updates["avatar_url"] = req.Avatar
	}
	if len(updates) == 0 {
		util.BadRequest(c, "no changes provided")
		return
	}

	var user models.User
	if err := h.DB.Model(&user).Where("id = ?", id).Updates(updates).Error; err != nil {
		util.InternalError(c, "failed to update profile")
		return
	}
	if err := h.DB.First(&user, "id = ?", id).Error; err != nil {
		util.NotFound(c, "user not found")
		return
	}
	user.PasswordHash = ""
	util.OK(c, user)
}

func (h *Handler) Role(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)
	var user models.User
	if err := h.DB.First(&user, "id = ?", id).Error; err != nil {
		util.NotFound(c, "user not found")
		return
	}
	util.OK(c, gin.H{"role": user.Role})
}
