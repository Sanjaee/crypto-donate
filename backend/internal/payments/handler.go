package payments

import (
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"gorm.io/gorm"
	"gorm.io/gorm/clause"

	"mediashare/backend/internal/models"
	"mediashare/backend/internal/plisio"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB     *gorm.DB
	Plisio *plisio.Client
}

// settlementInfo membawa data yang dibutuhkan untuk settle.
type settlementInfo struct {
	OrderID       string
	TransactionID string // Plisio txn_id
	PaymentType   string // crypto currency (BTC, ETH, ...)
	Raw           any
}

// Currencies GET /payments/currencies — daftar metode pembayaran crypto
// dari Plisio (sungguhan). Degrade gracefully bila belum dikonfigurasi.
func (h *Handler) Currencies(c *gin.Context) {
	if !plisio.IsConfigured(h.Plisio) {
		slog.Warn("plisio not configured; currencies empty")
		util.OK(c, []any{})
		return
	}
	cs, err := h.Plisio.GetCurrencies("")
	if err != nil {
		slog.Warn("plisio currencies error", "error", err)
		util.OK(c, []any{})
		return
	}
	out := make([]map[string]any, 0, len(cs))
	for _, cur := range cs {
		if cur.Hidden == 1 || cur.Maintenance {
			continue
		}
		out = append(out, map[string]any{
			"cid":      cur.Cid,
			"currency": cur.Currency,
			"name":     cur.Name,
			"icon":     cur.Icon,
			"priceUsd": cur.PriceUSD,
		})
	}
	util.OK(c, out)
}

// Status GET /payments/:orderId/status — status pembayaran publik
// untuk halaman payment donor (pending / paid / expired / cancelled).
// Jika masih pending, cek ulang status operation di Plisio (reconcile)
// sehingga halaman payment update walau tanpa webhook.
func (h *Handler) Status(c *gin.Context) {
	orderID := c.Param("orderId")

	var payment models.PaymentTransaction
	if err := h.DB.Where("order_id = ?", orderID).First(&payment).Error; err != nil {
		util.NotFound(c, "transaction not found")
		return
	}

	// Reconcile: masih pending + ada txn_id + Plisio terkonfigurasi.
	if payment.Status == models.PaymentStatusPending &&
		payment.TransactionID != nil &&
		*payment.TransactionID != "" &&
		plisio.IsConfigured(h.Plisio) {
		op, err := h.Plisio.GetOperation(*payment.TransactionID)
		if err != nil {
			slog.Warn("payment.reconcile_error",
				"order_id", orderID,
				"txn_id", *payment.TransactionID,
				"error", err.Error(),
			)
		} else if op != nil {
			slog.Info("payment.reconcile",
				"order_id", orderID,
				"txn_id", *payment.TransactionID,
				"plisio_status", op.Status,
				"amount", op.Amount,
				"currency", op.Currency,
			)
			switch op.Status {
			case "completed", "mismatch":
				// "mismatch" = dana masuk tapi nominal tidak sesuai
				// (over/underpaid). Dukung tetap dikreditkan.
				info := settlementInfo{
					OrderID:       orderID,
					TransactionID: *payment.TransactionID,
					PaymentType:   op.Currency,
					Raw: map[string]any{
						"status":       op.Status,
						"order_number": orderID,
						"txn_id":       *payment.TransactionID,
						"amount":       op.Amount,
						"currency":     op.Currency,
					},
				}
				if err := h.settle(payment, info); err != nil {
					slog.Error("payment.reconcile_error", "order_id", orderID, "error", err)
				}
				h.DB.Where("order_id = ?", orderID).First(&payment)
			case "expired":
				h.expire(payment, settlementInfo{OrderID: orderID, TransactionID: *payment.TransactionID})
				h.DB.Where("order_id = ?", orderID).First(&payment)
			case "cancelled", "error":
				h.cancel(payment, settlementInfo{OrderID: orderID, TransactionID: *payment.TransactionID})
				h.DB.Where("order_id = ?", orderID).First(&payment)
			}
		}
	}

	// Parsing raw_response Plisio untuk data QR / wallet / crypto amount.
	var qrCode, walletHash, cryptoAmount, currency string
	var raw map[string]any
	if json.Unmarshal([]byte(payment.RawResponse), &raw) == nil {
		data, _ := raw["data"].(map[string]any)
		if data == nil {
			data = raw
		}
		qrCode = toString(data["qr_code"])
		walletHash = toString(data["wallet_hash"])
		cryptoAmount = toString(data["amount"])
		currency = toString(data["currency"])
	}
	if currency == "" {
		currency = payment.PaymentType
	}

	util.OK(c, gin.H{
		"orderId":      payment.OrderID,
		"status":       payment.Status,
		"currency":     currency,
		"cryptoAmount": cryptoAmount,
		"walletHash":   walletHash,
		"qrCode":       qrCode,
		"grossAmount":  payment.GrossAmount,
	})
}

// WebhookPlisio memproses callback pembayaran crypto dari Plisio.
// Wajib: verify HMAC, lookup order, idempotency, seluruh update finansial
// dalam satu database transaction.
func (h *Handler) WebhookPlisio(c *gin.Context) {
	raw, err := io.ReadAll(io.LimitReader(c.Request.Body, 1<<20))
	if err != nil {
		util.BadRequest(c, "invalid callback")
		return
	}

	m, err := h.Plisio.VerifyCallback(raw)
	if err != nil {
		slog.Warn("payment.verification_failed", "error", err)
		util.Error(c, http.StatusBadRequest, "invalid callback")
		return
	}

	orderNumber := toString(m["order_number"])
	txnID := toString(m["txn_id"])
	status := toString(m["status"])
	currency := toString(m["currency"])
	if orderNumber == "" {
		util.BadRequest(c, "order_number missing")
		return
	}

	var payment models.PaymentTransaction
	if err := h.DB.Where("order_id = ?", orderNumber).First(&payment).Error; err != nil {
		slog.Warn("payment.unknown_order", "order_number", orderNumber)
		util.Error(c, http.StatusNotFound, "order not found")
		return
	}

	// Opsional: verifikasi nominal fiat bila dikirim Plisio.
	if sa := toString(m["source_amount"]); sa != "" {
		if f, err := strconv.ParseFloat(sa, 64); err == nil {
			if int64(f) != payment.GrossAmount {
				slog.Warn("payment.amount_mismatch", "order_number", orderNumber)
				util.Error(c, http.StatusBadRequest, "amount mismatch")
				return
			}
		}
	}

	info := settlementInfo{
		OrderID:       orderNumber,
		TransactionID: txnID,
		PaymentType:   currency,
		Raw:           m,
	}

	switch status {
	case "completed":
		err = h.settle(payment, info)
	case "expired":
		err = h.expire(payment, info)
	case "cancelled", "error":
		err = h.cancel(payment, info)
	default:
		// new / pending / pending internal — belum final.
		slog.Info("payment.pending_update", "order_number", orderNumber, "status", status)
	}

	if err != nil {
		slog.Error("payment.webhook_error", "order_number", orderNumber, "error", err)
		util.InternalError(c, "internal error")
		return
	}

	slog.Info("payment.webhook", "order_number", orderNumber, "status", status)
	util.OK(c, gin.H{"status": "ok"})
}

// settle menandai payment/donation PAID, kredit wallet (ledger),
// dan meng-queue media. Seluruhnya atomik.
func (h *Handler) settle(p models.PaymentTransaction, info settlementInfo) error {
	return h.DB.Transaction(func(tx *gorm.DB) error {
		var pay models.PaymentTransaction
		if err := tx.Clauses(clause.Locking{Strength: "UPDATE"}).
			Where("id = ?", p.ID).First(&pay).Error; err != nil {
			return err
		}
		if pay.Status == models.PaymentStatusPaid {
			// Idempotency: webhook duplikat.
			slog.Warn("payment.duplicate", "order_number", info.OrderID)
			return nil
		}

		now := time.Now()
		txID := info.TransactionID
		if err := tx.Model(&pay).Updates(map[string]any{
			"status":         models.PaymentStatusPaid,
			"payment_type":   info.PaymentType,
			"transaction_id": &txID,
			"raw_response":   mustJSON(info.Raw),
			"paid_at":        &now,
		}).Error; err != nil {
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

		if err := h.creditWallet(tx, donation.UserID, donation.NetAmount, donation.ID, donation.DonorName); err != nil {
			return err
		}

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

		slog.Info("payment.settled", "order_number", info.OrderID, "net", donation.NetAmount)
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

	desc := "Support from " + donorName
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

func (h *Handler) expire(p models.PaymentTransaction, info settlementInfo) error {
	return h.updatePaymentStatus(p, models.PaymentStatusExpired, info)
}

func (h *Handler) cancel(p models.PaymentTransaction, info settlementInfo) error {
	return h.updatePaymentStatus(p, models.PaymentStatusCancelled, info)
}

func (h *Handler) updatePaymentStatus(p models.PaymentTransaction, status string, info settlementInfo) error {
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
		txID := info.TransactionID
		return tx.Model(&pay).Updates(map[string]any{
			"status":         status,
			"transaction_id": &txID,
			"raw_response":   mustJSON(info.Raw),
			"paid_at":        &now,
		}).Error
	})
}

func toString(v any) string {
	switch t := v.(type) {
	case string:
		return t
	case float64:
		return strconv.FormatFloat(t, 'f', -1, 64)
	default:
		return fmt.Sprintf("%v", v)
	}
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
