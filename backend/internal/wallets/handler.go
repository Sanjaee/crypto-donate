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
	Pending       int64 `json:"pending"`
	TotalReceived int64 `json:"totalReceived"`
	Currency      string `json:"currency"`
}

// Summary GET /wallet.
// Menampilkan saldo tersedia (sinkron dengan ledger) + pending.
func (h *Handler) Summary(c *gin.Context) {
	userID, _ := c.Get("userID")
	id := userID.(uuid.UUID)

	var wallet models.Wallet
	if err := h.DB.Where("user_id = ?", id).First(&wallet).Error; err != nil {
		util.NotFound(c, "wallet not found")
		return
	}

	// Rekonsiliasi: balance harus == SUM(CREDIT) - SUM(DEBIT) dari ledger.
	var ledgerBalance int64
	h.DB.Model(&models.WalletTransaction{}).
		Where("wallet_id = ?", wallet.ID).
		Select("COALESCE(SUM(CASE WHEN type = ? THEN amount ELSE -amount END), 0)", models.LedgerCredit).
		Scan(&ledgerBalance)
	if wallet.Balance != ledgerBalance {
		// Perbaiki drift agar balance selalu konsisten dengan ledger.
		h.DB.Model(&wallet).Update("balance", ledgerBalance)
		wallet.Balance = ledgerBalance
	}

	var received, pending int64
	h.DB.Model(&models.WalletTransaction{}).
		Where("wallet_id = ? AND type = ?", wallet.ID, models.LedgerCredit).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&received)
	// Pending = donasi belum dibayar.
	h.DB.Model(&models.Donation{}).
		Where("user_id = ? AND payment_status = ?", id, models.PaymentStatusPending).
		Select("COALESCE(SUM(amount), 0)").
		Scan(&pending)

	util.OK(c, summary{
		Balance:       wallet.Balance,
		Pending:       pending,
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
