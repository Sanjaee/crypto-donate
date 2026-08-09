package auth

import (
	"crypto/rand"
	"encoding/hex"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"golang.org/x/crypto/bcrypt"
	"gorm.io/gorm"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB          *gorm.DB
	AdminEmails []string
}

// roleForEmail menentukan role berdasarkan daftar admin (env ADMIN_EMAILS).
func (h *Handler) roleForEmail(email string) string {
	email = strings.ToLower(strings.TrimSpace(email))
	for _, a := range h.AdminEmails {
		if strings.ToLower(strings.TrimSpace(a)) == email {
			return models.RoleAdmin
		}
	}
	return models.RoleUser
}

type registerRequest struct {
	Email    string `json:"email" binding:"required"`
	Username string `json:"username" binding:"required"`
	Name     string `json:"name" binding:"required"`
	Password string `json:"password" binding:"required,min=8"`
}

type loginRequest struct {
	Email    string `json:"email" binding:"required"`
	Password string `json:"password" binding:"required"`
}

type oauthRequest struct {
	Email    string `json:"email" binding:"required"`
	Name     string `json:"name" binding:"required"`
	GoogleID string `json:"googleId"`
	Avatar   string `json:"avatarUrl"`
}

// Register mendaftarkan user baru + wallet + stream settings (transaction).
func (h *Handler) Register(c *gin.Context) {
	var req registerRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "invalid data")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))
	req.Username = strings.ToLower(strings.TrimSpace(req.Username))

	if !util.ValidEmail(req.Email) {
		util.BadRequest(c, "invalid email")
		return
	}
	if !util.ValidUsername(req.Username) {
		util.BadRequest(c, "username must be 3-30 characters (a-z, 0-9, _)")
		return
	}

	hash, err := bcrypt.GenerateFromPassword([]byte(req.Password), bcrypt.DefaultCost)
	if err != nil {
		util.InternalError(c, "failed to process password")
		return
	}

	user := &models.User{
		Email:        req.Email,
		Username:     req.Username,
		Name:         req.Name,
		PasswordHash: string(hash),
		Provider:     models.ProviderCredentials,
		Role:         h.roleForEmail(req.Email),
	}
	if err := createUserWithDefaults(h.DB, user); err != nil {
		util.Error(c, http.StatusConflict, "email or username already in use")
		return
	}

	util.Created(c, sanitize(user))
}

// Login memvalidasi kredensial. Dipakai frontend bila Auth.js tidak
// digunakan; untuk Auth.js gunakan VerifyCredentials.
func (h *Handler) Login(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "invalid data")
		return
	}
	user, ok := h.verifyCredentials(req.Email, req.Password)
	if !ok {
		util.Error(c, http.StatusUnauthorized, "invalid email or password")
		return
	}
	util.OK(c, sanitize(user))
}

// VerifyCredentials dipanggil Auth.js (server-side) via internal token.
func (h *Handler) VerifyCredentials(c *gin.Context) {
	var req loginRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "invalid data")
		return
	}
	user, ok := h.verifyCredentials(req.Email, req.Password)
	if !ok {
		util.Error(c, http.StatusUnauthorized, "invalid email or password")
		return
	}
	util.OK(c, sanitize(user))
}

// OAuthLogin find-or-create user dari Google (Auth.js callback).
func (h *Handler) OAuthLogin(c *gin.Context) {
	var req oauthRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "invalid data")
		return
	}
	req.Email = strings.ToLower(strings.TrimSpace(req.Email))

	var user models.User
	err := h.DB.Where("email = ?", req.Email).First(&user).Error
	if err == nil {
		// User dengan email sama sudah ada: coba tautkan google id.
		if user.GoogleID == "" && req.GoogleID != "" {
			h.DB.Model(&user).Updates(map[string]any{"google_id": req.GoogleID, "avatar_url": req.Avatar})
		}
		util.OK(c, sanitize(&user))
		return
	}
	if err != gorm.ErrRecordNotFound {
		util.InternalError(c, "failed to process account")
		return
	}

	username := uniqueUsername(h.DB, req.Email)
	user = models.User{
		Email:     req.Email,
		Username:  username,
		Name:      req.Name,
		Provider:  models.ProviderGoogle,
		GoogleID:  req.GoogleID,
		AvatarURL: req.Avatar,
		Role:      h.roleForEmail(req.Email),
	}
	if err := createUserWithDefaults(h.DB, &user); err != nil {
		util.InternalError(c, "failed to create account")
		return
	}
	util.OK(c, sanitize(&user))
}

// Me mengambil user berdasarkan X-User-ID (dari session Auth.js).
func (h *Handler) Me(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var user models.User
	if err := h.DB.First(&user, "id = ?", id).Error; err != nil {
		util.NotFound(c, "user not found")
		return
	}
	util.OK(c, sanitize(&user))
}

func (h *Handler) verifyCredentials(email, password string) (*models.User, bool) {
	email = strings.ToLower(strings.TrimSpace(email))
	var user models.User
	if err := h.DB.Where("email = ?", email).First(&user).Error; err != nil {
		return nil, false
	}
	if user.PasswordHash == "" {
		return nil, false
	}
	if bcrypt.CompareHashAndPassword([]byte(user.PasswordHash), []byte(password)) != nil {
		return nil, false
	}
	return &user, true
}

// createUserWithDefaults membuat user + wallet + stream settings atomically.
func createUserWithDefaults(db *gorm.DB, user *models.User) error {
	return db.Transaction(func(tx *gorm.DB) error {
		if err := tx.Create(user).Error; err != nil {
			return err
		}
		wallet := &models.Wallet{UserID: user.ID, Balance: 0, Currency: "USD"}
		if err := tx.Create(wallet).Error; err != nil {
			return err
		}
		settings := &models.StreamSetting{
			UserID:    user.ID,
			StreamKey: randomHex(32),
		}
		return tx.Create(settings).Error
	})
}

func uniqueUsername(db *gorm.DB, email string) string {
	base := strings.Split(email, "@")[0]
	base = strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= '0' && r <= '9':
			return r
		default:
			return '_'
		}
	}, strings.ToLower(base))
	if base == "" {
		base = "user"
	}
	if len(base) > 28 {
		base = base[:28]
	}
	candidate := base
	for i := 1; ; i++ {
		var count int64
		db.Model(&models.User{}).Where("username = ?", candidate).Count(&count)
		if count == 0 {
			return candidate
		}
		candidate = base + "_" + shortHex(i)
	}
}

func shortHex(n int) string {
	b := []byte{byte(n & 0xff)}
	return hex.EncodeToString(b)
}

func randomHex(n int) string {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		panic(err)
	}
	return hex.EncodeToString(b)
}

func sanitize(u *models.User) *models.User {
	u.PasswordHash = ""
	return u
}
