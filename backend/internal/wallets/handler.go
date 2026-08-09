package wallets

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

type summary struct {
	Balance       int64 `json:"balance"`
	TotalReceived int64 `json:"totalReceived"`
	Currency      string `json:"currency"`
}

// Summary GET /wallet.
func (h *Handler) Summary(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var wallet models.Wallet
	if err := h.DB.Where("user_id = ?", id).First(&wallet).Error; err != nil {
		util.NotFound(c, "wallet not found")
		return
	}

	var received int64
	h.DB.Model(&models.WalletTransaction{}).
		Where("wallet_id = ? AND type = ?", wallet.ID, models.LedgerCredit).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&received)

	util.OK(c, summary{
		Balance:       wallet.Balance,
		TotalReceived: received,
		Currency:      wallet.Currency,
	})
}

// Transactions GET /wallet/transactions.
func (h *Handler) Transactions(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var wallet models.Wallet
	if err := h.DB.Where("user_id = ?", id).First(&wallet).Error; err != nil {
		util.NotFound(c, "wallet not found")
		return
	}

	var list []models.WalletTransaction
	if err := h.DB.Where("wallet_id = ?", wallet.ID).
		Order("created_at DESC").Limit(100).Find(&list).Error; err != nil {
		util.InternalError(c, "failed to load transactions")
		return
	}
	util.OK(c, list)
}
