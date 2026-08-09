package payments

import (
	"bytes"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

type MidtransClient struct {
	ServerKey   string
	ClientKey   string
	IsProduction bool
	Mock        bool // dev-only: jangan panggil Midtrans sungguhan
	httpClient  *http.Client
}

func NewMidtransClient(serverKey, clientKey string, isProd, mock bool) *MidtransClient {
	return &MidtransClient{
		ServerKey:    serverKey,
		ClientKey:    clientKey,
		IsProduction: isProd,
		Mock:         mock,
		httpClient:   &http.Client{Timeout: 15 * time.Second},
	}
}

func (m *MidtransClient) snapURL() string {
	if m.IsProduction {
		return "https://app.midtrans.com/snap/v1/transactions"
	}
	return "https://app.sandbox.midtrans.com/snap/v1/transactions"
}

type SnapRequest struct {
	TransactionDetails struct {
		OrderID     string `json:"order_id"`
		GrossAmount int64  `json:"gross_amount"`
	} `json:"transaction_details"`
	CustomerDetails struct {
		FirstName string `json:"first_name"`
	} `json:"customer_details,omitempty"`
	ItemDetails []struct {
		ID       string `json:"id"`
		Price    int64  `json:"price"`
		Quantity int    `json:"quantity"`
		Name     string `json:"name"`
	} `json:"item_details,omitempty"`
}

type SnapResponse struct {
	Token       string `json:"token"`
	RedirectURL string `json:"redirect_url"`
	StatusCode  string `json:"status_code"`
	ErrorMessage string `json:"error_message"`
	StatusMessage string `json:"status_message"`
}

func (m *MidtransClient) CreateSnap(orderID string, amount int64, itemName string) (*SnapResponse, error) {
	// Dev-only: bypass Midtrans sungguhan.
	if m.Mock {
		return &SnapResponse{
			Token:        "mock-" + orderID,
			RedirectURL:  "http://localhost:3000/donate?mock_pay=" + orderID,
			StatusCode:   "201",
			StatusMessage: "mock created",
		}, nil
	}

	var req SnapRequest
	req.TransactionDetails.OrderID = orderID
	req.TransactionDetails.GrossAmount = amount
	req.CustomerDetails.FirstName = "Donor"
	req.ItemDetails = []struct {
		ID       string `json:"id"`
		Price    int64  `json:"price"`
		Quantity int    `json:"quantity"`
		Name     string `json:"name"`
	}{{ID: "donation", Price: amount, Quantity: 1, Name: itemName}}

	body, err := json.Marshal(req)
	if err != nil {
		return nil, err
	}

	httpReq, err := http.NewRequest(http.MethodPost, m.snapURL(), bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("Accept", "application/json")
	httpReq.SetBasicAuth(m.ServerKey, "")

	resp, err := m.httpClient.Do(httpReq)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, 1<<20))
	if err != nil {
		return nil, err
	}

	var snap SnapResponse
	if err := json.Unmarshal(data, &snap); err != nil {
		return nil, fmt.Errorf("midtrans: invalid response: %s", string(data))
	}
	if resp.StatusCode >= 400 {
		return &snap, fmt.Errorf("midtrans: status=%d msg=%s", resp.StatusCode, snap.StatusMessage)
	}
	return &snap, nil
}

// VerifySignature memverifikasi signature Midtrans:
// sha512(order_id + status_code + gross_amount + server_key)
// grossAmountStr harus nilai string persis seperti diterima dari
// notifikasi (contoh "50000.00"), karena itulah yang dipakai Midtrans.
func (m *MidtransClient) VerifySignature(orderID, statusCode, grossAmountStr, signature string) bool {
	raw := orderID + statusCode + grossAmountStr + m.ServerKey
	hash := sha512.Sum512([]byte(raw))
	return secureHexEqual(signature, hex.EncodeToString(hash[:]))
}

func secureHexEqual(a, b string) bool {
	if len(a) != len(b) {
		return false
	}
	var v byte
	for i := 0; i < len(a); i++ {
		v |= a[i] ^ b[i]
	}
	return v == 0
}
