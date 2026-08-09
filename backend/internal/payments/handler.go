package payments

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB       *gorm.DB
	Midtrans *MidtransClient
}

type midtransNotification struct {
	TransactionStatus string `json:"transaction_status"`
	FraudStatus       string `json:"fraud_status"`
	OrderID           string `json:"order_id"`
	StatusCode        string `json:"status_code"`
	GrossAmount       string `json:"gross_amount"`
	SignatureKey      string `json:"signature_key"`
	PaymentType       string `json:"payment_type"`
	TransactionID     string `json:"transaction_id"`
	Currency          string `json:"currency"`
}

// DevSettle — DEV-ONLY. Menyimulasikan webhook settlement untuk order_id
// tertentu. Hanya aktif saat MOCK_MIDTRANS=true (guard dilakukan di router).
func (h *Handler) DevSettle(c *gin.Context) {
	orderID := c.Param("orderId")

	var payment models.PaymentTransaction
	if err := h.DB.Where("order_id = ?", orderID).First(&payment).Error; err != nil {
		util.NotFound(c, "transaction not found")
		return
	}

	n := midtransNotification{
		TransactionStatus: "settlement",
		OrderID:           orderID,
		StatusCode:        "200",
		GrossAmount:       strconv.FormatInt(payment.GrossAmount, 10),
		PaymentType:       "qris",
		TransactionID:     "MOCK-" + orderID,
	}
	if err := h.settle(payment, n); err != nil {
		slog.Error("dev.settle_error", "order_id", orderID, "error", err)
		util.InternalError(c, "failed to process settlement")
		return
	}
	slog.Info("dev.settle_ok", "order_id", orderID)
	util.OK(c, gin.H{"status": "settled"})
}

// WebhookMidtrans memproses notifikasi pembayaran dari Midtrans.
// Wajib: verify signature, verify order, verify amount, idempotency,
// dan seluruh update finansial dalam satu database transaction.
func (h *Handler) WebhookMidtrans(c *gin.Context) {
	var n midtransNotification
	if err := c.ShouldBindJSON(&n); err != nil {
		util.BadRequest(c, "invalid notification")
		return
	}

	// 1. Verify signature.
	if !h.Midtrans.VerifySignature(n.OrderID, n.StatusCode, n.GrossAmount, n.SignatureKey) {
		slog.Warn("payment.verification_failed", "order_id", n.OrderID)
		util.Error(c, http.StatusBadRequest, "signature mismatch")
		return
	}

	// 2. Lookup payment.
	var payment models.PaymentTransaction
	if err := h.DB.Where("order_id = ?", n.OrderID).First(&payment).Error; err != nil {
		slog.Warn("payment.unknown_order", "order_id", n.OrderID)
		util.Error(c, http.StatusNotFound, "order not found")
		return
	}

	// 3. Verify amount.
	if parseGross(n.GrossAmount) != payment.GrossAmount {
		slog.Warn("payment.amount_mismatch", "order_id", n.OrderID)
		util.Error(c, http.StatusBadRequest, "amount mismatch")
		return
	}

	var err error
	switch n.TransactionStatus {
	case "settlement", "capture":
		err = h.settle(payment, n)
	case "expire":
		err = h.expire(payment, n)
	case "cancel", "deny":
		err = h.cancel(payment, n)
	default:
		// status lain (pending, authorize, dll) → belum final.
		slog.Info("payment.pending_update", "order_id", n.OrderID, "status", n.TransactionStatus)
	}

	if err != nil {
		slog.Error("payment.webhook_error", "order_id", n.OrderID, "error", err)
		util.InternalError(c, "internal error")
		return
	}

	slog.Info("payment.webhook", "order_id", n.OrderID, "status", n.TransactionStatus)
	util.OK(c, gin.H{"status": "ok"})
}

// settle menandai payment/donation PAID, kredit wallet (ledger),
// dan meng-queue media. Seluruhnya atomik.
func (h *Handler) settle(p models.PaymentTransaction, n midtransNotification) error {
	return h.DB.Transaction(func(tx *gorm.DB) error {
		// Lock payment row (mencegah double processing webhook).
		var pay models.PaymentTransaction
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", p.ID).First(&pay).Error; err != nil {
			return err
		}
		if pay.Status == models.PaymentStatusPaid {
			// Idempotency: webhook duplikat.
			slog.Warn("payment.duplicate", "order_id", n.OrderID)
			return nil
		}

		now := time.Now()
		txID := n.TransactionID
		updates := map[string]any{
			"status":         models.PaymentStatusPaid,
			"payment_type":   n.PaymentType,
			"transaction_id": &txID,
			"raw_response":   mustJSON(n),
			"paid_at":        &now,
		}
		if err := tx.Model(&pay).Updates(updates).Error; err != nil {
			return err
		}

		var donation models.Donation
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", pay.DonationID).First(&donation).Error; err != nil {
			return err
		}
		if donation.Status != models.DonationStatusPaid {
			if err := tx.Model(&donation).Updates(map[string]any{
				"status":         models.DonationStatusPaid,
				"payment_status": models.PaymentStatusPaid,
				"paid_at":        &now,
			}).Error; err != nil {
				return err
			}
		}

		// Kredit wallet (row lock) + ledger.
		if err := h.creditWallet(tx, donation.UserID, donation.NetAmount, donation.ID, donation.DonorName); err != nil {
			return err
		}

		// Queue media jika ada.
		if donation.MediaType != "" && donation.MediaURL != "" {
			media := &models.MediaItem{
				DonationID: donation.ID,
				UserID:     donation.UserID,
				MediaType:  donation.MediaType,
				MediaURL:   donation.MediaURL,
				Status:     models.MediaStatusQueued,
				Duration:   10,
			}
			var setting models.StreamSetting
			if err := tx.Where("user_id = ?", donation.UserID).First(&setting).Error; err == nil && setting.DefaultDuration > 0 {
				media.Duration = setting.DefaultDuration
			}
			if err := tx.Create(media).Error; err != nil {
				return err
			}
			slog.Info("media.queued", "media_id", media.ID, "donation_id", donation.ID)
		}

		slog.Info("payment.settled", "order_id", n.OrderID, "net", donation.NetAmount)
		return nil
	})
}

// creditWallet menambah balance dengan row lock + mencatat ledger.
func (h *Handler) creditWallet(tx *gorm.DB, userID uuid.UUID, amount int64, refID uuid.UUID, donorName string) error {
	var wallet models.Wallet
	if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
		Where("user_id = ?", userID).First(&wallet).Error; err != nil {
		return err
	}

	before := wallet.Balance
	after := before + amount
	if err := tx.Model(&wallet).Update("balance", after).Error; err != nil {
		return err
	}

	desc := "Dukungan dari " + donorName
	ledger := &models.WalletTransaction{
		WalletID:      wallet.ID,
		Type:          models.LedgerCredit,
		Amount:        amount,
		BalanceBefore: before,
		BalanceAfter:  after,
		ReferenceType: models.RefTypeDonation,
		ReferenceID:   refID,
		Description:   desc,
	}
	if err := tx.Create(ledger).Error; err != nil {
		return err
	}
	slog.Info("wallet.transaction", "wallet_id", wallet.ID, "amount", amount, "balance_after", after)
	return nil
}

func (h *Handler) expire(p models.PaymentTransaction, n midtransNotification) error {
	return h.updatePaymentStatus(p, models.PaymentStatusExpired, n)
}

func (h *Handler) cancel(p models.PaymentTransaction, n midtransNotification) error {
	return h.updatePaymentStatus(p, models.PaymentStatusCancelled, n)
}

func (h *Handler) updatePaymentStatus(p models.PaymentTransaction, status string, n midtransNotification) error {
	return h.DB.Transaction(func(tx *gorm.DB) error {
		var pay models.PaymentTransaction
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", p.ID).First(&pay).Error; err != nil {
			return err
		}
		if pay.Status == models.PaymentStatusPaid {
			// Jangan downgrade payment yang sudah PAID.
			return nil
		}
		now := time.Now()
		txID := n.TransactionID
		return tx.Model(&pay).Updates(map[string]any{
			"status":         status,
			"transaction_id": &txID,
			"raw_response":   mustJSON(n),
			"paid_at":        &now,
		}).Error
	})
}

func parseGross(s string) int64 {
	s = strings.TrimSpace(s)
	s = strings.ReplaceAll(s, ".00", "")
	s = strings.ReplaceAll(s, ",", "")
	n, _ := strconv.ParseInt(s, 10, 64)
	return n
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
