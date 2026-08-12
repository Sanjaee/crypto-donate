package withdrawals

import (
	"errors"
	"fmt"
	"log/slog"
	"net/http"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/plisio"
	"mediashare/backend/internal/util"
)

const (
	minWithdrawCents = 500 // $5.00
	maxWithdrawCents = 5000000 // $50k
	maxPending       = 3
)

var ErrInsufficient = errors.New("insufficient balance")

type Handler struct {
	DB     *gorm.DB
	Plisio *plisio.Client
}

type createRequest struct {
	Amount    int64  `json:"amount" binding:"required"`
	Currency  string `json:"currency" binding:"required"`
	ToAddress string `json:"toAddress" binding:"required"`
}

type withdrawalResponse struct {
	ID           string `json:"id"`
	Amount       int64  `json:"amount"`
	Currency     string `json:"currency"`
	CryptoAmount string `json:"cryptoAmount"`
	ToAddress    string `json:"toAddress"`
	Status       string `json:"status"`
	TxUrl        string `json:"txUrl"`
	ErrorMessage string `json:"errorMessage"`
	CreatedAt    string `json:"createdAt"`
}

// Create POST /withdrawals — request penarikan.
// Saldo TIDAK dikurangi sampai API menyetujui (status success).
func (h *Handler) Create(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid := userID.(uuid.UUID)

	var req createRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		util.BadRequest(c, "invalid data")
		return
	}
	req.Currency = strings.ToUpper(strings.TrimSpace(req.Currency))
	req.ToAddress = strings.TrimSpace(req.ToAddress)

	if req.Amount < minWithdrawCents {
		util.Error(c, http.StatusBadRequest, "minimum withdrawal is $5.00")
		return
	}
	if req.Amount > maxWithdrawCents {
		util.Error(c, http.StatusBadRequest, "maximum withdrawal is $50,000")
		return
	}
	if !validAddress(req.Currency, req.ToAddress) {
		util.Error(c, http.StatusBadRequest, "invalid "+req.Currency+" address")
		return
	}

	// Cek saldo cukup (belum dikurangi — hanya dipotong setelah API setuju).
	var wallet models.Wallet
	if err := h.DB.Where("user_id = ?", uid).First(&wallet).Error; err != nil {
		util.NotFound(c, "wallet not found")
		return
	}
	if wallet.Balance < req.Amount {
		util.Error(c, http.StatusBadRequest, "insufficient balance")
		return
	}

	// Daftar currency + rate (dari mapping API).
	currencies, err := h.Plisio.GetCurrencies("")
	if err != nil {
		slog.Warn("withdraw.currencies_error", "error", err)
		util.InternalError(c, "currency rate unavailable")
		return
	}
	var priceUsd float64
	found := false
	for _, cur := range currencies {
		if cur.Maintenance {
			continue
		}
		if cur.Currency == req.Currency || cur.Cid == req.Currency {
			if f, err := strconv.ParseFloat(fmt.Sprintf("%v", cur.PriceUSD), 64); err == nil && f > 0 {
				priceUsd = f
				found = true
			}
			break
		}
	}
	if !found {
		util.Error(c, http.StatusBadRequest, "unsupported currency")
		return
	}
	cryptoAmount := float64(req.Amount) / 100.0 / priceUsd
	cryptoAmountStr := strconv.FormatFloat(cryptoAmount, 'f', 8, 64)

	// Duplikat & pending check.
	var pending int64
	h.DB.Model(&models.Withdrawal{}).
		Where("user_id = ? AND status IN ?", uid, []string{models.WithdrawalPending, models.WithdrawalProcessing}).
		Count(&pending)
	if pending >= maxPending {
		util.Error(c, http.StatusTooManyRequests, "too many pending withdrawals")
		return
	}

	w := &models.Withdrawal{
		UserID:    uid,
		Amount:    req.Amount,
		Currency:  req.Currency,
		ToAddress: req.ToAddress,
		Status:    models.WithdrawalProcessing,
	}
	if err := h.DB.Create(w).Error; err != nil {
		util.InternalError(c, "failed to create withdrawal")
		return
	}

	// Panggil API (nama provider diinternal, tidak terlihat di FE).
	res, apiErr := h.Plisio.Withdraw(req.Currency, req.ToAddress, cryptoAmountStr, "normal")
	if apiErr != nil {
		// API menolak → FAILED, saldo TIDAK dikurangi.
		msg := "withdrawal failed"
		if apiErr != nil && apiErr.Error() != "" {
			msg = apiErr.Error()
		}
		h.DB.Model(w).Updates(map[string]any{
			"status":        models.WithdrawalFailed,
			"error_message": trimErr(msg),
		})
		slog.Warn("withdraw.api_failed", "user_id", uid, "amount", req.Amount, "err", msg)
		h.audit(uid, w, "FAILED")
		util.Error(c, http.StatusBadGateway, "withdrawal failed")
		return
	}

	// API menyetujui → kurangi saldo (row lock) + ledger, atomic.
	err = h.DB.Transaction(func(tx *gorm.DB) error {
		var wl models.Wallet
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("user_id = ?", uid).First(&wl).Error; err != nil {
			return err
		}
		if wl.Balance < w.Amount {
			return ErrInsufficient
		}
		before := wl.Balance
		after := before - w.Amount
		if err := tx.Model(&wl).Update("balance", after).Error; err != nil {
			return err
		}
		ledger := &models.WalletTransaction{
			WalletID:      wl.ID,
			Type:          models.LedgerDebit,
			Amount:        w.Amount,
			BalanceBefore: before,
			BalanceAfter:  after,
			ReferenceType: models.RefTypeWithdrawal,
			ReferenceID:   w.ID,
			Description:   "Withdrawal to " + w.ToAddress,
		}
		if err := tx.Create(ledger).Error; err != nil {
			return err
		}
		return tx.Model(w).Updates(map[string]any{
			"status":        models.WithdrawalCompleted,
			"crypto_amount": res.Amount,
			"fee":           res.Fee,
			"ref_id":        res.ID,
			"tx_url":        res.TxURL,
			"error_message": "",
		}).Error
	})
	if err != nil && !errors.Is(err, ErrInsufficient) {
		// Gagal memproses → kembalikan status, saldo utuh.
		h.DB.Model(w).Update("status", models.WithdrawalFailed)
		util.InternalError(c, "withdrawal processing error")
		return
	}
	if errors.Is(err, ErrInsufficient) {
		h.DB.Model(w).Update("status", models.WithdrawalFailed)
		util.Error(c, http.StatusBadRequest, "insufficient balance")
		return
	}

	h.audit(uid, w, "COMPLETED")
	slog.Info("withdraw.completed", "user_id", uid, "amount", req.Amount, "currency", req.Currency)

	util.Created(c, toResponse(w))
}

// List GET /withdrawals — riwayat penarikan user.
func (h *Handler) List(c *gin.Context) {
	userID, _ := c.Get("userID")
	uid := userID.(uuid.UUID)

	var list []models.Withdrawal
	if err := h.DB.Where("user_id = ?", uid).Order("created_at DESC").Limit(50).Find(&list).Error; err != nil {
		util.InternalError(c, "failed to load withdrawals")
		return
	}
	out := make([]withdrawalResponse, 0, len(list))
	for _, w := range list {
		out = append(out, toResponse(&w))
	}
	util.OK(c, out)
}

func toResponse(w *models.Withdrawal) withdrawalResponse {
	return withdrawalResponse{
		ID:           w.ID.String(),
		Amount:       w.Amount,
		Currency:     w.Currency,
		CryptoAmount: w.CryptoAmount,
		ToAddress:    w.ToAddress,
		Status:       w.Status,
		TxUrl:        w.TxURL,
		ErrorMessage: w.ErrorMessage,
		CreatedAt:    w.CreatedAt.Format("2006-01-02 15:04:05"),
	}
}

func (h *Handler) audit(userID uuid.UUID, w *models.Withdrawal, event string) {
	h.DB.Create(&models.AuditLog{
		ActorID:      userID,
		Action:       "WITHDRAWAL_" + event,
		ResourceType: "WITHDRAWAL",
		ResourceID:   w.ID.String(),
		Metadata:     `{"amount":"` + strconv.FormatInt(w.Amount, 10) + `","currency":"` + w.Currency + `"}`,
		CreatedAt:    time.Now(),
	})
}

func trimErr(s string) string {
	if len(s) > 500 {
		return s[:500]
	}
	return s
}

func validAddress(currency, addr string) bool {
	addr = strings.TrimSpace(addr)
	if addr == "" {
		return false
	}
	switch strings.ToUpper(currency) {
	case "BTC":
		return regexp.MustCompile(`^(bc1|[13])[a-zA-HJ-NP-Z0-9]{25,39}$`).MatchString(addr)
	case "ETH", "USDC", "USDT":
		return regexp.MustCompile(`^0x[a-fA-F0-9]{40}$`).MatchString(addr)
	case "LTC":
		return regexp.MustCompile(`^[LM3][a-km-zA-HJ-NP-Z1-9]{26,33}$`).MatchString(addr)
	case "BCH":
		return regexp.MustCompile(`^[pq][a-zA-HJ-NP-Z0-9]{41}$`).MatchString(addr)
	case "DOGE":
		return regexp.MustCompile(`^D[a-zA0-9]{33}$`).MatchString(addr)
	case "XRP":
		return regexp.MustCompile(`^r[a-zA-Z0-9]{24,34}$`).MatchString(addr)
	case "SOL":
		return regexp.MustCompile(`^[1-9A-HJ-NP-Za-km-z]{32,44}$`).MatchString(addr)
	case "BNB":
		return regexp.MustCompile(`^bnb1[a-zA-HJ-NP-Z0-9]{38}$`).MatchString(addr)
	default:
		return regexp.MustCompile(`^[a-zA-Z0-9]{25,100}$`).MatchString(addr)
	}
}