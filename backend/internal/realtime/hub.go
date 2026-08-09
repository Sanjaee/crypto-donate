package realtime

import (
	"sync"

	"github.com/google/uuid"
)

// Hub menghubungkan event pembayaran/media ke widget yang terhubung via SSE.
// In-memory, cukup untuk single-instance MVP.
type Hub struct {
	mu      sync.Mutex
	clients map[uuid.UUID]map[chan []byte]struct{}
}

func NewHub() *Hub {
	return &Hub{clients: map[uuid.UUID]map[chan []byte]struct{}{}}
}

// Subscribe mendaftarkan channel untuk user tertentu.
// Mengembalikan channel dan fungsi unsubscribe.
func (h *Hub) Subscribe(userID uuid.UUID) (<-chan []byte, func()) {
	ch := make(chan []byte, 16)
	h.mu.Lock()
	if h.clients[userID] == nil {
		h.clients[userID] = map[chan []byte]struct{}{}
	}
	h.clients[userID][ch] = struct{}{}
	h.mu.Unlock()

	unsub := func() {
		h.mu.Lock()
		if set, ok := h.clients[userID]; ok {
			delete(set, ch)
			if len(set) == 0 {
				delete(h.clients, userID)
			}
		}
		h.mu.Unlock()
	}
	return ch, unsub
}

// Notify mengirim event ke semua subscriber user tertentu (non-blocking).
func (h *Hub) Notify(userID uuid.UUID, event []byte) {
	h.mu.Lock()
	defer h.mu.Unlock()
	for ch := range h.clients[userID] {
		select {
		case ch <- event:
		default: // client lambat — buang event, widget punya fallback polling
		}
	}
}
