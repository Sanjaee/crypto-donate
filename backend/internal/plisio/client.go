package plisio

import (
	"crypto/hmac"
	"crypto/sha1"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"regexp"
	"strconv"
	"time"
)

const defaultBaseURL = "https://api.plisio.net/api/v1"

type Client struct {
	APIKey   string
	BaseURL  string
	http     *http.Client
}

func New(apiKey, baseURL string) *Client {
	if baseURL == "" {
		baseURL = defaultBaseURL
	}
	return &Client{
		APIKey:  apiKey,
		BaseURL: baseURL,
		http:    &http.Client{Timeout: 15 * time.Second},
	}
}

// IsConfigured true bila secret key asli terpasang (bukan placeholder).
func IsConfigured(c *Client) bool {
	return c != nil && c.APIKey != "" && c.APIKey != "CHANGE_ME"
}

type CreateInvoiceParams struct {
	Currency       string // BTC, ETH, ... (opsional; default dipilih Plisio)
	AllowedPsysCids string // comma-separated, mis. "BTC,ETH" — batasi pilihan pembayaran
	OrderName      string
	OrderNumber    string // harus unik per invoice
	Amount         float64 // jumlah crypto (opsional jika pakai fiat)
	SourceCurrency string // fiat, contoh USD
	SourceAmount   float64
	Description    string
	Email          string
	CallbackURL    string
	ExpireMin      int
}

type Invoice struct {
	TxnID                string `json:"txn_id"`
	InvoiceURL           string `json:"invoice_url"`
	InvoiceTotalSum      string `json:"invoice_total_sum"`
	Amount               string `json:"amount"`
	PendingAmount        string `json:"pending_amount"`
	WalletHash           string `json:"wallet_hash"`
	PsysCid              string `json:"psys_cid"`
	Currency             string `json:"currency"`
	Status               string `json:"status"`
	SourceCurrency       string `json:"source_currency"`
	SourceAmount         string `json:"source_amount"`
	SourceRate           string `json:"source_rate"`
	QRCode               string `json:"qr_code"`
	VerifyHash           string `json:"verify_hash"`
	InvoiceCommission    string `json:"invoice_commission"`
	InvoiceSum           string `json:"invoice_sum"`
	ExpectedConfirmations string `json:"expected_confirmations"`
	ExpireUTC            string `json:"expire_utc"`
}

type APIResponse struct {
	Status string  `json:"status"`
	Data   Invoice `json:"data"`
}

type APIError struct {
	Status string `json:"status"`
	Data   struct {
		Name    string `json:"name"`
		Message string `json:"message"`
		Code    int    `json:"code"`
	} `json:"data"`
}

func (e *APIError) Error() string {
	return fmt.Sprintf("plisio: %s (code=%d)", e.Data.Message, e.Data.Code)
}

type Currency struct {
	Name        string `json:"name"`
	Cid         string `json:"cid"`
	Currency    string `json:"currency"`
	Icon        string `json:"icon"`
	PriceUSD    any    `json:"price_usd"`
	Hidden      int    `json:"hidden"`
	Maintenance bool   `json:"maintenance"`
}

// CreateInvoice membuat invoice crypto via Plisio.
// Catatan: hanya kirim param yang didukung; param kosong/ekstra dapat
// memicu HTTP 422 dari Plisio.
func (c *Client) CreateInvoice(p CreateInvoiceParams) (*Invoice, error) {
	q := url.Values{}
	q.Set("api_key", c.APIKey)
	if p.Currency != "" {
		q.Set("currency", p.Currency)
	}
	if p.AllowedPsysCids != "" {
		q.Set("allowed_psys_cids", p.AllowedPsysCids)
	}
	q.Set("order_name", p.OrderName)
	q.Set("order_number", p.OrderNumber)
	if p.Amount > 0 {
		q.Set("amount", strconv.FormatFloat(p.Amount, 'f', 8, 64))
	}
	if p.SourceCurrency != "" {
		q.Set("source_currency", p.SourceCurrency)
		q.Set("source_amount", strconv.FormatFloat(p.SourceAmount, 'f', 2, 64))
	}
	if p.Description != "" {
		q.Set("description", p.Description)
	}
	if p.Email != "" {
		q.Set("email", p.Email)
	}
	if p.CallbackURL != "" {
		q.Set("callback_url", p.CallbackURL)
	}
	if p.ExpireMin > 0 {
		q.Set("expire_min", strconv.Itoa(p.ExpireMin))
	}
	q.Set("json", "true")
	return c.get("/invoices/new", q)
}

type Operation struct {
	TxnID          string `json:"txn_id"`
	Type           string `json:"type"`
	Status         string `json:"status"` // new / pending / completed / expired / cancelled / error
	Amount         string `json:"amount"`
	PendingAmount  string `json:"pending_amount"`
	ReceivedAmount string `json:"received_amount"`
	Currency       string `json:"currency"`
	SourceCurrency string `json:"source_currency"`
	SourceAmount   string `json:"source_amount"`
	InvoiceURL     string `json:"invoice_url"`
	Confirmations  any    `json:"confirmations"` // bisa number atau string
}

// GetOperation mengambil status operation/invoice dari Plisio.
// Dipakai untuk reconcile (polling) saat webhook tidak tersedia.
func (c *Client) GetOperation(txnID string) (*Operation, error) {
	q := url.Values{}
	q.Set("api_key", c.APIKey)
	body, err := c.request("/operations/"+txnID, q)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Status string    `json:"status"`
		Data   Operation `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	if resp.Status != "success" {
		return nil, fmt.Errorf("plisio operation: status=%s", resp.Status)
	}
	return &resp.Data, nil
}

// Currency memuat daftar crypto yang didukung Plisio.
// fiat menentukan rate dasar (misal "USD"). Kosong = tanpa rate fiat.
func (c *Client) GetCurrencies(fiat string) ([]Currency, error) {
	q := url.Values{}
	q.Set("api_key", c.APIKey)
	path := "/currencies"
	if fiat != "" {
		path += "/" + fiat
	}
	body, err := c.request(path, q)
	if err != nil {
		return nil, err
	}
	var resp struct {
		Status string     `json:"status"`
		Data   []Currency `json:"data"`
	}
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	if resp.Status != "success" {
		return nil, fmt.Errorf("plisio currencies: status=%s", resp.Status)
	}
	return resp.Data, nil
}

// VerifyCallback memverifikasi HMAC-SHA1 callback Plisio.
// Mendukung callback JSON (json=true) dan form-urlencoded.
func (c *Client) VerifyCallback(rawBody []byte) (map[string]any, error) {
	// 1. coba parse sebagai JSON
	var m map[string]any
	if err := json.Unmarshal(rawBody, &m); err == nil {
		if v, ok := m["verify_hash"].(string); ok {
			if c.checkHMAC(rawBody, v, "json") || c.checkHMACMap(m, v) {
				return m, nil
			}
			return nil, fmt.Errorf("plisio: verify_hash mismatch (json)")
		}
	}
	// 2. coba form-urlencoded
	if vals, err := url.ParseQuery(string(rawBody)); err == nil {
		if v := vals.Get("verify_hash"); v != "" {
			m = map[string]any{}
			for k, vs := range vals {
				if len(vs) > 0 {
					m[k] = vs[0]
				}
			}
			if c.checkHMAC(rawBody, v, "form") {
				return m, nil
			}
			return nil, fmt.Errorf("plisio: verify_hash mismatch (form)")
		}
	}
	return nil, fmt.Errorf("plisio: unable to parse callback")
}

// checkHMAC memverifikasi dengan menghapus field verify_hash dari raw body.
func (c *Client) checkHMAC(raw []byte, provided, kind string) bool {
	// hapus "verify_hash":"..." beserta koma
	re := regexp.MustCompile(`"verify_hash"\s*:\s*"[^"]*",?`)
	cleaned := re.ReplaceAll(raw, []byte{})
	// untuk form: hapus &verify_hash=...
	if kind == "form" {
		reForm := regexp.MustCompile(`[&]?verify_hash=[^&]*`)
		cleaned = reForm.ReplaceAll(cleaned, []byte{})
	}
	return c.hmacHex(cleaned) == provided
}

// checkHMACMap memverifikasi versi JSON.stringify(parsed-minus-verify_hash)
// sesuai contoh Node di dokumentasi Plisio (kunci terurut alfabet oleh Go).
func (c *Client) checkHMACMap(m map[string]any, provided string) bool {
	delete(m, "verify_hash")
	b, err := json.Marshal(m)
	if err != nil {
		return false
	}
	return c.hmacHex(b) == provided
}

func (c *Client) hmacHex(data []byte) string {
	mac := hmac.New(sha1.New, []byte(c.APIKey))
	mac.Write(data)
	return hex.EncodeToString(mac.Sum(nil))
}

func (c *Client) get(path string, q url.Values) (*Invoice, error) {
	body, err := c.request(path, q)
	if err != nil {
		return nil, err
	}
	var resp APIResponse
	if err := json.Unmarshal(body, &resp); err != nil {
		return nil, err
	}
	if resp.Status != "success" {
		var apiErr APIError
		if json.Unmarshal(body, &apiErr) == nil {
			return nil, &apiErr
		}
		return nil, fmt.Errorf("plisio: status=%s body=%s", resp.Status, string(body))
	}
	return &resp.Data, nil
}

func (c *Client) request(path string, q url.Values) ([]byte, error) {
	u := c.BaseURL + path + "?" + q.Encode()
	req, err := http.NewRequest(http.MethodGet, u, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	body, err := io.ReadAll(io.LimitReader(resp.Body, 2<<20))
	if err != nil {
		return nil, err
	}
	if resp.StatusCode >= 400 {
		return body, &APIError{Status: "error", Data: struct {
			Name    string `json:"name"`
			Message string `json:"message"`
			Code    int    `json:"code"`
		}{Message: fmt.Sprintf("HTTP %d: %s", resp.StatusCode, string(body))}}
	}
	return body, nil
}
