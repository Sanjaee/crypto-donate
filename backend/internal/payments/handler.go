package payments

import (
	"encoding/json"
	"fmt"
	"io"
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
	"mediashare/backend/internal/plisio"
	"mediashare/backend/internal/realtime"
	"mediashare/backend/internal/util"
)

type Handler struct {
	DB     *gorm.DB
	Plisio *plisio.Client
	Hub    *realtime.Hub
}

// settlementInfo membawa data yang dibutuhkan untuk settle.
type settlementInfo struct {
	OrderID       string
	TransactionID string // Plisio txn_id
	PaymentType   string // crypto currency (BTC, ETH, ...)
	CryptoAmount  string // nominal crypto yg dibayar
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

	var plisioStatus, pendingAmount, receivedAmount string

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
			plisioStatus = op.Status
			pendingAmount = op.PendingAmount
			receivedAmount = op.ReceivedAmount
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
					CryptoAmount:  op.Amount,
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
		if plisioStatus == "" {
			plisioStatus = toString(data["status"])
		}
		if pendingAmount == "" {
			pendingAmount = toString(data["pending_amount"])
		}
		if receivedAmount == "" {
			receivedAmount = toString(data["received_amount"])
		}
	}
	if currency == "" {
		currency = payment.PaymentType
	}

	util.OK(c, gin.H{
		"orderId":        payment.OrderID,
		"status":         payment.Status,
		"plisioStatus":   plisioStatus,
		"currency":       currency,
		"cryptoAmount":   cryptoAmount,
		"pendingAmount":  pendingAmount,
		"receivedAmount": receivedAmount,
		"walletHash":     walletHash,
		"qrCode":         qrCode,
		"grossAmount":    payment.GrossAmount,
	})
}

// DevBackfill — memperbaiki data lama: mengisi crypto_amount + currency pada
// donation PAID dari operation Plisio. Jalan di dalam container (IP ter-whitelist).
func (h *Handler) DevBackfill(c *gin.Context) {
	var payments []models.PaymentTransaction
	if err := h.DB.Where("status = ?", models.PaymentStatusPaid).Find(&payments).Error; err != nil {
		util.InternalError(c, "failed to load payments")
		return
	}
	updated := 0
	for _, p := range payments {
		if p.TransactionID == nil || *p.TransactionID == "" || strings.HasPrefix(*p.TransactionID, "MOCK-") {
			continue
		}
		op, err := h.Plisio.GetOperation(*p.TransactionID)
		if err != nil || op == nil {
			slog.Warn("backfill.skip", "txn", *p.TransactionID, "error", err)
			continue
		}
		h.DB.Table("ms_payment_transactions").Where("id = ?", p.ID).Update("raw_response", mustJSON(op))
		if op.Currency != "" && op.Amount != "" {
			h.DB.Model(&models.Donation{}).Where("id = ?", p.DonationID).
				Updates(map[string]any{"crypto_amount": op.Amount, "currency": op.Currency})
			updated++
		}
		slog.Info("backfill.ok", "order", p.OrderID, "amount", op.Amount, "currency", op.Currency)
	}
	util.OK(c, gin.H{"updated": updated})
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
		CryptoAmount:  toString(m["amount"]),
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
			donationUpdates := map[string]any{
				"status":         models.DonationStatusPaid,
				"payment_status": models.PaymentStatusPaid,
				"paid_at":        &now,
			}
			if info.CryptoAmount != "" {
				donationUpdates["crypto_amount"] = info.CryptoAmount
			}
			if info.PaymentType != "" {
				donationUpdates["currency"] = info.PaymentType
			}
			if err := tx.Model(&donation).Updates(donationUpdates).Error; err != nil {
				return err
			}
		}

		if err := h.creditWallet(tx, donation.UserID, donation.NetAmount, donation.ID, donation.DonorName); err != nil {
			return err
		}

		// Selalu buat MediaItem (termasuk donation tanpa media = hanya teks),
		// agar kartu donor tetap tampil di widget.
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

		// Notifikasi realtime ke widget yang terhubung.
		if h.Hub != nil {
			h.Hub.Notify(donation.UserID, []byte(`{"type":"media"}`))
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
	case nil:
		return ""
	default:
		return fmt.Sprintf("%v", v)
	}
}

func mustJSON(v any) string {
	b, _ := json.Marshal(v)
	return string(b)
}
