# crypto-donate

Platform **Media Share / Saweria-like** untuk menerima dukungan
(gift/donation) dari audience, memproses pembayaran melalui
**Midtrans**, menyimpan saldo menggunakan **wallet ledger**, dan
menampilkan media donation secara realtime pada halaman widget.

Project ini dirancang sebagai SaaS yang ringan dan mudah di-deploy pada
satu VPS menggunakan:

-   Next.js
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   Go + Gin
-   PostgreSQL
-   Nginx
-   Docker Compose
-   Midtrans

> **Catatan arsitektur:** versi awal sengaja tidak menggunakan Redis,
> RabbitMQ, Kafka, WebSocket server, worker terpisah, atau OBS. Media
> queue menggunakan PostgreSQL dan widget menggunakan polling ringan
> setiap beberapa detik.

------------------------------------------------------------------------

## 1. Tujuan Project

MediaShare adalah platform yang memungkinkan setiap user memiliki
halaman donation sendiri.

Contoh:

``` text
https://domain.com/donate/ahmad
```

Audience dapat memberikan:

-   Nama
-   Nominal dukungan
-   Pesan
-   YouTube
-   TikTok
-   GIF
-   Image/media lain yang diizinkan

Setelah pembayaran berhasil:

``` text
Donor
  ↓
Donation
  ↓
Midtrans
  ↓
Midtrans Webhook
  ↓
Go API
  ↓
PostgreSQL Transaction
  ├── Payment = PAID
  ├── Donation = PAID
  ├── Wallet + amount
  └── Media = QUEUED
          ↓
Widget Polling
          ↓
Media tampil
          ↓
PLAYED
```

------------------------------------------------------------------------

# 2. Konsep Utama

Setiap akun mempunyai `streamKey` unik.

Contoh:

``` text
4aa54dbc476e138ce8d91fa1a28808c8
```

Widget dapat diakses melalui:

``` text
https://domain.com/widgets/mediashare?streamKey=4aa54dbc476e138ce8d91fa1a28808c8
```

Halaman widget bertindak sebagai **mirror/display page**.

Tidak diperlukan OBS untuk menjalankan widget.

Widget dapat dibuka langsung menggunakan:

-   Browser
-   Monitor kedua
-   TV/display
-   iframe
-   Browser Source jika nanti ingin digunakan dengan OBS/streaming
    software

------------------------------------------------------------------------

# 3. Architecture

``` text
                         INTERNET
                            │
                            ▼
                    ┌───────────────┐
                    │  CLOUDFLARE   │
                    │ DNS / CDN/WAF │
                    └───────┬───────┘
                            │
                            ▼
                    ┌───────────────┐
                    │     NGINX     │
                    │ Reverse Proxy │
                    │ SSL / RateLimit
                    └───────┬───────┘
                            │
               ┌────────────┴────────────┐
               │                         │
               ▼                         ▼
        ┌─────────────┐          ┌─────────────┐
        │   NEXT.JS   │          │    GO API   │
        │    :3000    │          │    :8080    │
        │             │          │             │
        │ Landing     │          │ Auth        │
        │ Dashboard   │          │ Donations   │
        │ Donate Page │          │ Payments    │
        │ Widget      │          │ Wallet      │
        └─────────────┘          │ Media Queue │
                                 └──────┬──────┘
                                        │
                                        ▼
                                ┌───────────────┐
                                │  PostgreSQL   │
                                │     :5432     │
                                └───────┬───────┘
                                        ▲
                                        │
                                ┌───────┴───────┐
                                │    MIDTRANS   │
                                └───────────────┘
```

------------------------------------------------------------------------

# 4. Kenapa Tidak Menggunakan Redis/RabbitMQ?

Versi awal tidak membutuhkan message broker.

PostgreSQL sudah dapat digunakan sebagai durable queue untuk media.

Status media:

``` text
QUEUED
   │
   ▼
PLAYING
   │
   ▼
PLAYED
```

Pengambilan queue dapat menggunakan PostgreSQL transaction via GORM:

``` go
tx := db.WithContext(ctx)
media := &models.MediaItem{}
err := tx.Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
    Where("status = ? AND user_id = ?", models.MediaStatusQueued, userID).
    Order("created_at ASC").
    Limit(1).
    Find(&media).Error
```

Keuntungan:

-   Lebih sederhana
-   Lebih sedikit container
-   Tidak membutuhkan Redis
-   Tidak membutuhkan RabbitMQ
-   Data queue persistent
-   Backup database sekaligus backup queue
-   Cocok untuk VPS kecil

Jika jumlah widget aktif sudah sangat besar, arsitektur dapat
ditingkatkan menggunakan Redis + WebSocket/SSE.

------------------------------------------------------------------------

# 5. Realtime Media

Widget menggunakan polling.

Contoh:

``` text
GET /api/widgets/mediashare/media?streamKey=xxxx
```

dilakukan setiap:

``` text
2-3 detik
```

Flow:

``` text
Browser
   │
   │ GET media
   ▼
Go API
   │
   ▼
PostgreSQL
   │
   ├── empty
   │
   └── media available
          │
          ▼
       PLAYING
          │
          ▼
      Media tampil
          │
          ▼
       PLAYED
```

Untuk MVP, polling lebih sederhana daripada WebSocket.

------------------------------------------------------------------------

# 6. Stack

## Frontend

-   Next.js App Router
-   TypeScript
-   Tailwind CSS
-   shadcn/ui
-   React Server Components
-   Client Components hanya ketika diperlukan

## Backend

-   Go
-   Gin
-   **GORM** (ORM)
-   REST API
-   PostgreSQL
-   GORM transaction (`db.Transaction`)
-   Middleware authentication
-   Rate limiting
-   Structured logging (log/slog)

## Frontend UI (shadcn/ui)

Component yang digunakan:

``` text
button        card        input        label
switch        tabs        dialog       table
badge         skeleton    separator    alert-dialog
sonner (toast)
```

Setup:

``` bash
npx shadcn@latest init
npx shadcn@latest add button card input label switch tabs dialog table badge skeleton separator alert-dialog sonner
```

## Payment

-   Midtrans
-   Payment notification/webhook
-   Signature verification
-   Idempotent payment processing

## Infrastructure

-   Docker
-   Docker Compose
-   Nginx
-   Cloudflare
-   PostgreSQL volume

------------------------------------------------------------------------

# 7. Docker Services

Versi minimal hanya menggunakan 4 service:

``` text
nginx
nextjs
api
postgres
```

Tidak menggunakan:

``` text
Redis       ❌
RabbitMQ    ❌
Kafka       ❌
Worker      ❌
WebSocket   ❌
OBS         ❌
```

------------------------------------------------------------------------

# 8. Project Structure

``` text
mediashare/
│
├── frontend/
│   ├── app/
│   │   ├── (marketing)/
│   │   │
│   │   ├── (auth)/
│   │   │   ├── login/
│   │   │   └── register/
│   │   │
│   │   ├── api/
│   │   │   ├── auth/
│   │   │   │   └── [...nextauth]/   ← Auth.js (Google + Credentials)
│   │   │   ├── wallet/
│   │   │   ├── donations/
│   │   │   ├── media/
│   │   │   └── stream-settings/
│   │   │
│   │   ├── dashboard/
│   │   │   ├── page.tsx
│   │   │   ├── donations/
│   │   │   ├── wallet/
│   │   │   ├── mediashare/
│   │   │   ├── settings/
│   │   │   └── profile/
│   │   │
│   │   ├── donate/
│   │   │   └── [username]/
│   │   │
│   │   └── widgets/
│   │       └── mediashare/
│   │           └── page.tsx
│   │
│   ├── components/
│   │   └── ui/                 ← shadcn/ui components
│   ├── hooks/
│   ├── lib/
│   ├── types/
│   └── Dockerfile
│
├── backend/
│   ├── cmd/
│   │   └── server/
│   │       └── main.go
│   │
│   ├── internal/
│   │   ├── auth/
│   │   ├── users/
│   │   ├── donations/
│   │   ├── payments/           ← Midtrans + webhook
│   │   ├── wallets/            ← ledger
│   │   ├── media/              ← queue (SKIP LOCKED)
│   │   ├── widgets/
│   │   ├── models/             ← GORM models (source of truth schema)
│   │   ├── middleware/
│   │   └── database/           ← GORM connect + AutoMigrate
│   │
│   ├── go.mod
│   ├── go.sum
│   └── Dockerfile
│
├── nginx/
│   └── nginx.conf
│
├── docker-compose.yml
├── .env.example
├── .gitignore
└── README.md
```

------------------------------------------------------------------------

# 9. Public Pages

``` text
/
```

Landing page.

``` text
/login
/register
```

Authentication.

``` text
/donate/:username
```

Halaman donation publik.

Contoh:

``` text
/donate/ahmad
```

``` text
/widgets/mediashare?streamKey=xxxx
```

Media Share widget.

------------------------------------------------------------------------

# 10. Dashboard

``` text
/dashboard
/dashboard/profile
/dashboard/settings

/dashboard/donations
/dashboard/donations/:id

/dashboard/wallet
/dashboard/wallet/transactions

/dashboard/mediashare
/dashboard/mediashare/settings

/dashboard/stream-key
```

------------------------------------------------------------------------

# 11. Admin Dashboard

Admin dapat memiliki:

``` text
/admin
/admin/users
/admin/donations
/admin/payments
/admin/wallets
/admin/withdrawals
/admin/media
/admin/reports
/admin/logs
```

Dashboard overview:

``` text
Users
Donations
Gross Volume
Platform Revenue
Pending Payments
Pending Withdrawals
Queued Media
```

------------------------------------------------------------------------

# 12. Database Design

## Users

``` text
users
--------------------------------
id UUID PRIMARY KEY
email
username UNIQUE
name
password_hash
avatar_url
role
created_at
updated_at
```

Role:

``` text
USER
ADMIN
```

------------------------------------------------------------------------

## Wallets

``` text
wallets
--------------------------------
id UUID PRIMARY KEY
user_id UUID UNIQUE
balance BIGINT
currency
created_at
updated_at
```

Currency default:

``` text
IDR
```

Nominal disimpan sebagai integer.

Contoh:

``` text
Rp50.000
```

disimpan:

``` text
50000
```

Jangan menggunakan floating point untuk uang.

------------------------------------------------------------------------

# 13. Wallet Ledger

Jangan hanya mengandalkan:

``` sql
wallet.balance
```

Gunakan ledger.

``` text
wallet_transactions
--------------------------------
id
wallet_id
type
amount
balance_before
balance_after
reference_type
reference_id
description
created_at
```

Contoh:

``` text
+50.000
DONATION
DON-001
```

Kemudian:

``` text
-50.000
WITHDRAWAL
WD-001
```

Balance dapat menjadi cached balance yang harus selalu konsisten dengan
ledger.

------------------------------------------------------------------------

# 14. Donation

``` text
donations
--------------------------------
id
user_id
donor_name
amount
message
media_type
media_url
status
payment_status
created_at
paid_at
```

Contoh:

``` json
{
  "donorName": "Budi",
  "amount": 50000,
  "message": "Semangat stream!",
  "mediaType": "youtube",
  "mediaUrl": "https://youtube.com/watch?v=xxxx"
}
```

------------------------------------------------------------------------

# 15. Payment Transactions

Payment dipisahkan dari donation.

``` text
payment_transactions
--------------------------------
id
donation_id
order_id
provider
gross_amount
status
payment_type
transaction_id
raw_response
created_at
paid_at
```

Contoh:

``` text
order_id:
DON-20260808-000001

provider:
MIDTRANS

gross_amount:
50000

status:
pending
```

------------------------------------------------------------------------

# 16. Media Queue

``` text
media_items
--------------------------------
id
donation_id
user_id
media_type
media_url
status
duration
created_at
started_at
played_at
```

Status:

``` text
QUEUED
PLAYING
PLAYED
REJECTED
EXPIRED
```

------------------------------------------------------------------------

# 17. Stream Settings

``` text
stream_settings
-------------------------------
id
user_id
stream_key UNIQUE
minimum_donation
default_duration
youtube_enabled
tiktok_enabled
gif_enabled
image_enabled
show_donor_name
show_message
show_amount
created_at
updated_at
```

------------------------------------------------------------------------

## Model GORM

Semua tabel didefinisikan sebagai GORM model di
`backend/internal/models/`. Skema dibangun otomatis via
`db.AutoMigrate(...)`.

``` go
package models

import (
    "time"

    "github.com/google/uuid"
    "gorm.io/gorm"
)

const (
    RoleUser  = "USER"
    RoleAdmin = "ADMIN"
)

type User struct {
    ID           uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
    Email        string    `gorm:"size:255;uniqueIndex;not null" json:"email"`
    Username     string    `gorm:"size:50;uniqueIndex;not null" json:"username"`
    Name         string    `gorm:"size:100;not null" json:"name"`
    PasswordHash string    `gorm:"size:255" json:"-"`
    AvatarURL    string    `gorm:"size:500" json:"avatarUrl"`
    Role         string    `gorm:"size:20;not null;default:USER" json:"role"`
    CreatedAt    time.Time `json:"createdAt"`
    UpdatedAt    time.Time `json:"updatedAt"`
}

type Wallet struct {
    ID        uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
    UserID    uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"userId"`
    Balance   int64     `gorm:"not null;default:0" json:"balance"` // integer, jangan pakai float
    Currency  string    `gorm:"size:10;not null;default:IDR" json:"currency"`
    CreatedAt time.Time `json:"createdAt"`
    UpdatedAt time.Time `json:"updatedAt"`

    Transactions []WalletTransaction `json:"transactions,omitempty"`
}

type WalletTransaction struct {
    ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
    WalletID      uuid.UUID `gorm:"type:uuid;index;not null" json:"walletId"`
    Type          string    `gorm:"size:20;not null" json:"type"` // CREDIT / DEBIT
    Amount        int64     `gorm:"not null" json:"amount"`
    BalanceBefore int64     `gorm:"not null" json:"balanceBefore"`
    BalanceAfter  int64     `gorm:"not null" json:"balanceAfter"`
    ReferenceType string    `gorm:"size:50;index" json:"referenceType"` // DONATION / WITHDRAWAL
    ReferenceID   uuid.UUID `gorm:"type:uuid;index" json:"referenceId"`
    Description   string    `gorm:"size:255" json:"description"`
    CreatedAt     time.Time `json:"createdAt"`
}

type Donation struct {
    ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
    UserID        uuid.UUID `gorm:"type:uuid;index:idx_donation_user_created,priority:1;not null" json:"userId"`
    DonorName     string    `gorm:"size:100;not null" json:"donorName"`
    Amount        int64     `gorm:"not null" json:"amount"`
    Message       string    `gorm:"type:text" json:"message"`
    MediaType     string    `gorm:"size:20" json:"mediaType"` // youtube / tiktok / gif / image
    MediaURL      string    `gorm:"size:1000" json:"mediaUrl"`
    Status        string    `gorm:"size:20;not null;default:PENDING" json:"status"`
    PaymentStatus string    `gorm:"size:20;not null;default:PENDING" json:"paymentStatus"`
    PlatformFee   int64     `gorm:"not null;default:0" json:"platformFee"`
    NetAmount     int64     `gorm:"not null;default:0" json:"netAmount"`
    CreatedAt     time.Time `gorm:"index:idx_donation_user_created,priority:2" json:"createdAt"`
    PaidAt        *time.Time `json:"paidAt"`
}

type PaymentTransaction struct {
    ID            uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
    DonationID    uuid.UUID `gorm:"type:uuid;index;not null" json:"donationId"`
    OrderID       string    `gorm:"size:100;uniqueIndex;not null" json:"orderId"`
    Provider      string    `gorm:"size:20;not null;default:MIDTRANS" json:"provider"`
    GrossAmount   int64     `gorm:"not null" json:"grossAmount"`
    Status        string    `gorm:"size:20;not null;default:PENDING" json:"status"`
    PaymentType   string    `gorm:"size:50" json:"paymentType"`
    TransactionID string    `gorm:"size:100;uniqueIndex" json:"transactionId"`
    RawResponse   string    `gorm:"type:text" json:"rawResponse"`
    CreatedAt     time.Time `json:"createdAt"`
    PaidAt        *time.Time `json:"paidAt"`
}

type MediaItem struct {
    ID         uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
    DonationID uuid.UUID `gorm:"type:uuid;index;not null" json:"donationId"`
    UserID     uuid.UUID `gorm:"type:uuid;index:idx_media_queue,priority:1;not null" json:"userId"`
    MediaType  string    `gorm:"size:20;not null" json:"mediaType"`
    MediaURL   string    `gorm:"size:1000;not null" json:"mediaUrl"`
    Status     string    `gorm:"size:20;not null;default:QUEUED;index:idx_media_queue,priority:2" json:"status"`
    Duration   int       `gorm:"not null;default:10" json:"duration"`
    CreatedAt  time.Time `gorm:"index:idx_media_queue,priority:3" json:"createdAt"`
    StartedAt  *time.Time `json:"startedAt"`
    PlayedAt   *time.Time `json:"playedAt"`
}

type StreamSetting struct {
    ID              uuid.UUID `gorm:"type:uuid;primaryKey" json:"id"`
    UserID          uuid.UUID `gorm:"type:uuid;uniqueIndex;not null" json:"userId"`
    StreamKey       string    `gorm:"size:64;uniqueIndex;not null" json:"streamKey"`
    MinimumDonation int64     `gorm:"not null;default:10000" json:"minimumDonation"`
    DefaultDuration int       `gorm:"not null;default:10" json:"defaultDuration"`
    YouTubeEnabled  bool      `gorm:"not null;default:true" json:"youtubeEnabled"`
    TikTokEnabled   bool      `gorm:"not null;default:true" json:"tiktokEnabled"`
    GIFEnabled      bool      `gorm:"not null;default:true" json:"gifEnabled"`
    ImageEnabled    bool      `gorm:"not null;default:true" json:"imageEnabled"`
    ShowDonorName   bool      `gorm:"not null;default:true" json:"showDonorName"`
    ShowMessage     bool      `gorm:"not null;default:true" json:"showMessage"`
    ShowAmount      bool      `gorm:"not null;default:true" json:"showAmount"`
    CreatedAt       time.Time `json:"createdAt"`
    UpdatedAt       time.Time `json:"updatedAt"`
}

func (u *User) BeforeCreate(tx *gorm.DB) error {
    u.ID = uuid.New()
    return nil
}

// (hook serupa untuk Wallet, WalletTransaction, Donation,
// PaymentTransaction, MediaItem, StreamSetting)
```

Index queue composite `(user_id, status, created_at)` didefinisikan lewat
tag `gorm:"index:idx_media_queue,..."` di atas.

------------------------------------------------------------------------

# 18. Entity Relationship

``` mermaid
erDiagram

    USERS ||--|| WALLETS : owns
    USERS ||--|| STREAM_SETTINGS : configures
    USERS ||--o{ DONATIONS : receives
    USERS ||--o{ MEDIA_ITEMS : owns
    WALLETS ||--o{ WALLET_TRANSACTIONS : contains
    DONATIONS ||--o| PAYMENT_TRANSACTIONS : creates
    DONATIONS ||--o| MEDIA_ITEMS : creates

    USERS {
        uuid id PK
        string email
        string username
        string name
        string password_hash
        string role
        datetime created_at
    }

    WALLETS {
        uuid id PK
        uuid user_id FK
        bigint balance
        string currency
        datetime created_at
    }

    WALLET_TRANSACTIONS {
        uuid id PK
        uuid wallet_id FK
        string type
        bigint amount
        bigint balance_before
        bigint balance_after
        string reference_type
        uuid reference_id
        datetime created_at
    }

    DONATIONS {
        uuid id PK
        uuid user_id FK
        string donor_name
        bigint amount
        text message
        string media_type
        text media_url
        string status
        string payment_status
        datetime created_at
        datetime paid_at
    }

    PAYMENT_TRANSACTIONS {
        uuid id PK
        uuid donation_id FK
        string order_id
        string provider
        bigint gross_amount
        string status
        string payment_type
        string transaction_id
        json raw_response
        datetime created_at
    }

    MEDIA_ITEMS {
        uuid id PK
        uuid donation_id FK
        uuid user_id FK
        string media_type
        text media_url
        string status
        int duration
        datetime created_at
        datetime started_at
        datetime played_at
    }

    STREAM_SETTINGS {
        uuid id PK
        uuid user_id FK
        string stream_key
        bigint minimum_donation
        int default_duration
        boolean youtube_enabled
        boolean tiktok_enabled
        boolean gif_enabled
        boolean image_enabled
    }
```

------------------------------------------------------------------------

# 19. Donation Flow

``` text
Donor
  │
  │ submit donation
  ▼
Next.js
  │
  ▼
Go API
  │
  ├── validate amount
  ├── validate username
  ├── validate media
  └── create donation
          │
          ▼
      Midtrans
          │
          ▼
    Payment Method
          │
          ▼
    Payment Success
          │
          ▼
    Midtrans Webhook
          │
          ▼
       Go API
          │
          ├── verify signature
          ├── verify order
          ├── verify amount
          ├── check idempotency
          │
          ▼
   PostgreSQL Transaction
          │
          ├── payment = PAID
          ├── donation = PAID
          ├── wallet + net amount
          └── media = QUEUED
```

------------------------------------------------------------------------

# 20. Midtrans Webhook Security

Frontend tidak boleh menentukan bahwa pembayaran sudah berhasil.

Jangan melakukan:

``` text
POST /wallet/add
{
  "amount": 50000
}
```

Pembayaran harus dikonfirmasi berdasarkan notification dari Midtrans.

Flow:

``` text
Midtrans
   │
   ▼
POST /api/webhooks/midtrans
   │
   ▼
Verify signature
   │
   ▼
Verify order_id
   │
   ▼
Verify amount
   │
   ▼
Check transaction status
   │
   ▼
Check duplicate processing
   │
   ▼
Database transaction
```

------------------------------------------------------------------------

# 21. Idempotency

Webhook payment dapat dikirim lebih dari satu kali.

Sistem harus aman terhadap:

``` text
Webhook #1
Webhook #2
Webhook #3
```

Jangan sampai:

``` text
Rp50.000
Rp50.000
Rp50.000
```

masuk ke wallet.

Gunakan unique constraint pada:

``` text
order_id
transaction_id
```

dan proses webhook dalam database transaction.

Contoh:

``` text
IF payment already PAID
    return success
END
```

------------------------------------------------------------------------

# 22. Media Validation

Media URL tidak boleh diterima secara bebas.

Gunakan whitelist.

Contoh domain yang diizinkan:

``` text
youtube.com
youtu.be
giphy.com
tenor.com
```

Validasi:

``` text
URL format
      ↓
HTTPS
      ↓
Domain whitelist
      ↓
Media type
      ↓
Size limit
      ↓
Duration limit
```

Tujuannya mencegah:

-   SSRF
-   malicious URL
-   internal network access
-   abusive media
-   terlalu besar
-   media dengan durasi berlebihan

Jangan fetch URL user secara bebas dari backend.

------------------------------------------------------------------------

# 23. YouTube

Video YouTube sebaiknya tidak di-download ke server.

Simpan:

``` text
video_id
```

Contoh:

``` text
dQw4w9WgXcQ
```

Kemudian widget menggunakan embed/player.

Dengan demikian:

``` text
Server
   │
   └── tidak menyimpan video
```

Server tetap ringan.

------------------------------------------------------------------------

# 24. Widget

URL:

``` text
/widgets/mediashare?streamKey=xxxx
```

Contoh tampilan:

``` text
┌─────────────────────────────────────┐
│                                     │
│          MEDIA CONTENT              │
│                                     │
│          YouTube / GIF              │
│                                     │
│    ┌─────────────────────────────┐  │
│    │ Budi                        │  │
│    │ Rp50.000                    │  │
│    │                             │  │
│    │ Semangat streamnya! 🔥      │  │
│    └─────────────────────────────┘  │
│                                     │
└─────────────────────────────────────┘
```

Widget dapat memiliki:

-   Transparent background
-   Animation
-   Sound
-   Donor name
-   Donation amount
-   Message
-   Media
-   Custom duration
-   Custom position

------------------------------------------------------------------------

# 25. Widget Polling

Contoh API:

``` http
GET /api/widgets/mediashare/media?streamKey=xxxx
```

Response:

``` json
{
  "data": {
    "id": "uuid",
    "donorName": "Budi",
    "amount": 50000,
    "message": "Semangat!",
    "mediaType": "youtube",
    "mediaUrl": "dQw4w9WgXcQ",
    "duration": 10
  }
}
```

Jika tidak ada queue:

``` json
{
  "data": null
}
```

Widget polling:

``` text
2 seconds
```

------------------------------------------------------------------------

# 26. Mencegah Double Play

Jika dua browser membuka widget yang sama:

``` text
Browser A
Browser B
```

media tidak boleh dimainkan dua kali.

Gunakan:

``` sql
FOR UPDATE SKIP LOCKED
```

diimplementasikan dengan GORM:

``` go
err := db.WithContext(ctx).
    Clauses(clause.Locking{Strength: "UPDATE", Options: "SKIP LOCKED"}).
    Where("status = ? AND user_id = ?", models.MediaStatusQueued, userID).
    Order("created_at ASC").
    Limit(1).
    Find(&media).Error
```

Flow:

``` text
QUEUED
   │
   ▼
Transaction
   │
   ▼
SELECT FOR UPDATE SKIP LOCKED
   │
   ▼
PLAYING
```

Setelah selesai:

``` text
PLAYING
   │
   ▼
PLAYED
```

PostgreSQL bertindak sebagai queue coordinator.

------------------------------------------------------------------------

# 27. API Design

## Authentication

``` http
POST /api/auth/register
POST /api/auth/login
POST /api/auth/logout
GET  /api/auth/me
```

## Users

``` http
GET   /api/users/:username
PATCH /api/users/me
```

## Donations

``` http
POST /api/donations
GET  /api/donations
GET  /api/donations/:id
```

## Payments

``` http
POST /api/payments/midtrans
POST /api/webhooks/midtrans
```

## Wallet

``` http
GET /api/wallet
GET /api/wallet/transactions
```

## Media

``` http
GET  /api/media
POST /api/media/:id/approve
POST /api/media/:id/reject
```

## Widget

``` http
GET  /api/widgets/mediashare
GET  /api/widgets/mediashare/media
POST /api/widgets/mediashare/:id/playing
POST /api/widgets/mediashare/:id/complete
```

## Stream Settings

``` http
GET   /api/stream-settings
PATCH /api/stream-settings
POST  /api/stream-settings/regenerate-key
```

------------------------------------------------------------------------

# 28. Donation Page UI

Donation page dapat mengikuti konsep:

``` text
┌──────────────────────────┐
│       Creator Name       │
│                          │
│   Terima kasih sudah     │
│         donate           │
├──────────────────────────┤
│ Dukungan                 │
│                          │
│ Nominal                  │
│                          │
│ [1K] [5K] [25K] [50K]    │
│                          │
│ Dari                     │
│ [ Nama                  ]│
│                          │
│ Pesan                    │
│ [ Selamat pagi          ]│
│                          │
│ Media                    │
│ [YouTube] [TikTok] [GIF] │
│                          │
│ Pembayaran               │
│ [QRIS] [GoPay] [OVO]     │
│                          │
│ Total: Rp50.000          │
│                          │
│    [ Kirim Dukungan ]    │
└──────────────────────────┘
```

------------------------------------------------------------------------

# 29. Dashboard Media Share

``` text
Media Share
────────────────────────────────

Widget URL

https://domain.com/widgets/
mediashare?streamKey=XXXX

[ Copy URL ]

Status
● Active

Queue
────────────────────────────────

Budi
Rp50.000
"Semangat bro!"

PLAYING

Andi
Rp25.000
"GG"

QUEUED
```

Settings:

``` text
Minimum Donation
Rp10.000

Display Duration
10 seconds

Enable YouTube
✓

Enable GIF
✓

Enable Image
✓

Show Donor Name
✓

Show Amount
✓

Show Message
✓
```

------------------------------------------------------------------------

# 30. Wallet

Wallet menampilkan:

``` text
Available Balance
Rp2.500.000

Pending Balance
Rp250.000

Total Received
Rp10.000.000
```

Transaction:

``` text
+ Rp50.000
Donation
Budi
08 Aug 2026

- Rp100.000
Withdrawal
08 Aug 2026
```

------------------------------------------------------------------------

# 31. Platform Fee

Contoh:

``` text
Donation:
Rp100.000

Platform Fee:
5%

Net:
Rp95.000
```

Database sebaiknya menyimpan:

``` text
gross_amount
platform_fee
net_amount
```

Contoh:

``` text
gross_amount = 100000
platform_fee  = 5000
net_amount    = 95000
```

Biaya payment gateway perlu diperhitungkan sesuai konfigurasi dan metode
pembayaran yang digunakan.

------------------------------------------------------------------------

# 32. Withdrawal

Withdrawal dapat dibuat pada fase berikutnya.

Flow:

``` text
User
 │
 ▼
Create Withdrawal
 │
 ▼
Check Balance
 │
 ▼
Lock Wallet Amount
 │
 ▼
Pending
 │
 ▼
Admin Review
 │
 ├── Approved
 │      │
 │      ▼
 │   Process
 │
 └── Rejected
        │
        ▼
   Refund wallet
```

Status:

``` text
PENDING
PROCESSING
COMPLETED
REJECTED
FAILED
```

Withdrawal harus memiliki audit trail.

------------------------------------------------------------------------

# 33. Security

## Authentication

Gunakan:

-   Secure session
-   HttpOnly cookie
-   Secure cookie
-   SameSite
-   Password hashing
-   Rate limiting
-   CSRF protection jika diperlukan berdasarkan auth architecture

Jangan menyimpan password plaintext.

------------------------------------------------------------------------

## Authorization

Backend harus selalu mengecek ownership.

Contoh:

``` text
User A
GET /api/donations/ID_USER_B
```

harus:

``` text
403 Forbidden
```

Jangan hanya mengandalkan frontend.

------------------------------------------------------------------------

# 34. Rate Limiting

Endpoint yang perlu rate limit:

``` text
POST /auth/login
POST /auth/register
POST /donations
POST /webhooks/*
GET /widgets/*
POST /media/*
```

Widget polling dapat diberi rate limit khusus.

------------------------------------------------------------------------

# 35. SQL Injection

GORM selalu melakukan parameterized query secara internal.

Jangan:

``` go
query := "SELECT * FROM users WHERE email = '" + email + "'"
```

Gunakan GORM:

``` go
var user models.User
err := db.Where("email = ?", email).First(&user).Error
```

Semua placeholder `?` di-bind sebagai parameter oleh driver
`pgx`/`lib/pq`, sehingga aman dari SQL injection.

------------------------------------------------------------------------

# 36. Docker Security

Jangan expose PostgreSQL ke internet.

Hindari:

``` yaml
ports:
  - "5432:5432"
```

PostgreSQL cukup berada di internal Docker network.

Public hanya:

``` text
80
443
```

------------------------------------------------------------------------

# 37. Environment Variables

`.env`:

``` env
APP_ENV=production

POSTGRES_DB=mediashare
POSTGRES_USER=mediashare
POSTGRES_PASSWORD=CHANGE_ME

DATABASE_URL=postgres://mediashare:CHANGE_ME@postgres:5432/mediashare?sslmode=disable

MIDTRANS_SERVER_KEY=CHANGE_ME
MIDTRANS_CLIENT_KEY=CHANGE_ME
MIDTRANS_IS_PRODUCTION=false

NEXT_PUBLIC_APP_URL=https://domain.com
```

Jangan commit:

``` text
.env
```

ke Git.

Commit:

``` text
.env.example
```

------------------------------------------------------------------------

# 38. Docker Compose

Contoh minimal:

``` yaml
services:

  nginx:
    image: nginx:alpine
    restart: unless-stopped
    ports:
      - "80:80"
      - "443:443"
    volumes:
      - ./nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    depends_on:
      - nextjs
      - api

  nextjs:
    build:
      context: ./frontend
    restart: unless-stopped
    environment:
      NODE_ENV: production
      NEXT_PUBLIC_API_URL: https://domain.com/api
    depends_on:
      - api

  api:
    build:
      context: ./backend
    restart: unless-stopped
    environment:
      APP_ENV: production
      PORT: 8080
      DATABASE_URL: ${DATABASE_URL}
      MIDTRANS_SERVER_KEY: ${MIDTRANS_SERVER_KEY}
      MIDTRANS_CLIENT_KEY: ${MIDTRANS_CLIENT_KEY}
      MIDTRANS_IS_PRODUCTION: ${MIDTRANS_IS_PRODUCTION}
    depends_on:
      postgres:
        condition: service_healthy

  postgres:
    image: postgres:17-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: mediashare
      POSTGRES_USER: mediashare
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U mediashare"]
      interval: 5s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
```

------------------------------------------------------------------------

# 39. Nginx Routing

Konsep:

``` text
domain.com
    │
    ▼
  Nginx
    │
    ├── /api/*
    │      ↓
    │     Go
    │
    ├── /webhooks/*
    │      ↓
    │     Go
    │
    ├── /widgets/*
    │      ↓
    │    Next.js
    │
    └── /*
           ↓
        Next.js
```

------------------------------------------------------------------------

# 40. Cron Jobs

Cron tidak digunakan untuk realtime media.

Realtime:

``` text
Browser polling
```

Cron hanya untuk maintenance seperti:

``` text
Expired payment cleanup
Old media cleanup
Payment reconciliation
Expired session cleanup
Database maintenance
```

Contoh:

``` text
*/5 * * * *
```

dapat digunakan untuk pekerjaan ringan tertentu.

Untuk versi awal, cron dapat dijalankan melalui scheduler sederhana di
Go atau host cron tanpa menambah container worker.

------------------------------------------------------------------------

# 41. Logging

Go gunakan structured logging.

Contoh:

``` text
INFO donation.created
INFO payment.webhook
INFO payment.settled
INFO wallet.transaction
INFO media.queued
INFO media.played
WARN payment.duplicate
ERROR payment.verification_failed
```

Log penting:

``` text
request_id
user_id
donation_id
payment_id
order_id
status
duration
```

Jangan log:

``` text
password
MIDTRANS_SECRET
session token
private credentials
```

------------------------------------------------------------------------

# 42. Audit Log

Untuk sistem uang, admin action perlu dicatat.

``` text
audit_logs
--------------------------------
id
actor_id
action
resource_type
resource_id
ip_address
user_agent
metadata
created_at
```

Contoh:

``` text
ADMIN_APPROVED_WITHDRAWAL
WITHDRAWAL
WD-001
```

------------------------------------------------------------------------

# 43. Backup

PostgreSQL harus mempunyai backup.

Minimal:

``` text
Daily database backup
```

Simpan backup di lokasi berbeda dari VPS.

Jangan hanya mengandalkan:

``` text
Docker volume
```

karena volume bukan backup.

------------------------------------------------------------------------

# 44. Deployment

Clone repository:

``` bash
git clone https://github.com/yourname/mediashare.git
cd mediashare
```

Buat environment:

``` bash
cp .env.example .env
```

Edit:

``` bash
nano .env
```

Build:

``` bash
docker compose build
```

Start:

``` bash
docker compose up -d
```

Check:

``` bash
docker compose ps
```

Logs:

``` bash
docker compose logs -f api
```

Next.js:

``` bash
docker compose logs -f nextjs
```

Nginx:

``` bash
docker compose logs -f nginx
```

------------------------------------------------------------------------

# 45. Database Migration

Menggunakan **GORM AutoMigrate** yang dijalankan dari backend saat
startup (`cmd/server/main.go`).

``` go
err := db.AutoMigrate(
    &models.User{},
    &models.Wallet{},
    &models.WalletTransaction{},
    &models.Donation{},
    &models.PaymentTransaction{},
    &models.MediaItem{},
    &models.StreamSetting{},
    &models.AuditLog{},
)
```

GORM model di `backend/internal/models/` adalah satu-satunya source of
truth untuk skema.

> **Catatan Neon/shared database:** semua tabel diberi prefix `ms_`
> (`ms_users`, `ms_wallets`, ...) via `schema.NamingStrategy{TablePrefix: "ms_"}`.
> Ini memungkinkan aplikasi berjalan di database Neon yang sama dengan
> aplikasi lain tanpa bentrok nama tabel.

Untuk perubahan skema produksi: buat model baru / ubah tag di model, lalu
AutoMigrate menambahkan kolom, indeks, dan constraint baru tanpa
menghapus data. Jika dibutuhkan backfill/transformasi data, tulis script
migrasi Go terpisah yang dijalankan sekali (versioned).

------------------------------------------------------------------------

# 46. Development

Frontend:

``` bash
cd frontend
npm install
npm run dev
```

Backend:

``` bash
cd backend
go run ./cmd/server
```

Database:

``` bash
docker compose up postgres -d
```

------------------------------------------------------------------------

# 47. Production Flow

``` text
GitHub
   │
   ▼
GitHub Actions
   │
   ├── Test frontend
   ├── Test Go
   ├── Build Docker
   └── Deploy
          │
          ▼
        VPS
          │
          ▼
    Docker Compose
```

CI harus gagal jika:

``` text
test failed
lint failed
build failed
```

Jangan deploy build yang gagal.

------------------------------------------------------------------------

# 48. Performance

Target awal:

``` text
Next.js
SSR/RSC
```

Gunakan Client Component hanya untuk:

-   polling widget
-   interactive form
-   dashboard table
-   payment UI
-   animation

Widget dapat dibuat sangat ringan.

Polling:

``` text
2-3 sec
```

Database query wajib menggunakan index.

Index penting:

``` text
users.username

stream_settings.stream_key

donations.user_id
donations.created_at

payment_transactions.order_id
payment_transactions.transaction_id

media_items.user_id
media_items.status
media_items.created_at
```

Untuk queue:

``` text
(user_id, status, created_at)
```

Index didefinisikan via tag GORM di model:

``` go
UserID    uuid.UUID `gorm:"type:uuid;index:idx_media_queue,priority:1;not null" json:"userId"`
Status    string    `gorm:"size:20;not null;index:idx_media_queue,priority:2" json:"status"`
CreatedAt time.Time `gorm:"index:idx_media_queue,priority:3" json:"createdAt"`
```

------------------------------------------------------------------------

# 49. Scaling

## Stage 1 --- MVP

``` text
1 VPS
4 GB RAM

Nginx
Next.js
Go
PostgreSQL
```

Cocok untuk memvalidasi product.

------------------------------------------------------------------------

## Stage 2

Jika traffic meningkat:

``` text
Cloudflare
     │
     ▼
Load Balancer
     │
 ┌───┴────┐
 ▼        ▼
Go #1    Go #2
    │
    ▼
PostgreSQL
```

Widget tetap polling.

------------------------------------------------------------------------

## Stage 3

Jika realtime sudah membutuhkan latency lebih rendah:

``` text
Go
 │
 ▼
Redis Pub/Sub
 │
 ▼
SSE / WebSocket
 │
 ▼
Widget
```

Redis baru ditambahkan ketika benar-benar dibutuhkan.

------------------------------------------------------------------------

# 50. Media Queue Scaling

Versi MVP:

``` text
PostgreSQL Queue
```

Scaling berikutnya:

``` text
PostgreSQL
     │
     ▼
Redis Pub/Sub
     │
     ▼
WebSocket/SSE
```

Tetapi database tetap menjadi source of truth.

Redis hanya digunakan sebagai transport/realtime layer, bukan sumber
utama data uang.

------------------------------------------------------------------------

# 51. Payment State Machine

``` text
PENDING
   │
   ├── settlement
   │      ↓
   │    PAID
   │
   ├── expire
   │      ↓
   │   EXPIRED
   │
   └── cancel
          ↓
       CANCELLED
```

Donation hanya boleh masuk wallet jika:

``` text
payment_status = PAID
```

------------------------------------------------------------------------

# 52. Media State Machine

``` text
QUEUED
   │
   ▼
PLAYING
   │
   ▼
PLAYED
```

Alternative:

``` text
QUEUED
   │
   ├── reject
   │     ↓
   │  REJECTED
   │
   └── timeout
         ↓
      EXPIRED
```

------------------------------------------------------------------------

# 53. Wallet State Machine

Untuk withdrawal:

``` text
AVAILABLE
   │
   ▼
WITHDRAWAL REQUEST
   │
   ▼
PENDING
   │
   ▼
PROCESSING
   │
   ├── success
   │      ↓
   │  COMPLETED
   │
   └── failed
          ↓
       REFUNDED
```

------------------------------------------------------------------------

# 54. Important Financial Rules

1.  Jangan menggunakan float untuk nominal uang.
2.  Jangan percaya nominal dari frontend.
3.  Jangan menambah wallet berdasarkan redirect pembayaran.
4.  Gunakan Midtrans webhook.
5.  Verifikasi signature.
6.  Gunakan idempotency.
7.  Gunakan database transaction.
8.  Simpan ledger.
9.  Simpan audit log.
10. Jangan menghapus financial transaction secara permanen.
11. Gunakan status reversal/refund jika terjadi koreksi.
12. Backup PostgreSQL secara berkala.

------------------------------------------------------------------------

# 55. Recommended MVP Scope

## Phase 1 --- Foundation

-   [ ] Monorepo
-   [ ] Next.js
-   [ ] shadcn/ui setup
-   [ ] Go Gin
-   [ ] GORM setup + AutoMigrate
-   [ ] PostgreSQL
-   [ ] Docker Compose
-   [ ] Nginx
-   [ ] Environment config
-   [ ] Logging

## Phase 2 --- Authentication

-   [ ] Register
-   [ ] Login
-   [ ] Logout
-   [ ] Session
-   [ ] Profile
-   [ ] Username
-   [ ] Role

## Phase 3 --- Creator Page

-   [ ] Public profile
-   [ ] Donation page
-   [ ] Donation form
-   [ ] Custom message
-   [ ] Minimum donation
-   [ ] Stream key

## Phase 4 --- Midtrans

-   [ ] Create payment
-   [ ] Midtrans integration
-   [ ] Webhook
-   [ ] Signature verification
-   [ ] Idempotency
-   [ ] Payment status

## Phase 5 --- Wallet

-   [ ] Wallet
-   [ ] Ledger
-   [ ] Balance
-   [ ] Transaction history
-   [ ] Platform fee

## Phase 6 --- Media Share

-   [ ] Media queue
-   [ ] YouTube
-   [ ] GIF
-   [ ] Image
-   [ ] Media validation
-   [ ] Queue state
-   [ ] Polling
-   [ ] Widget
-   [ ] Animation
-   [ ] Display settings

## Phase 7 --- Dashboard

-   [ ] Donation history
-   [ ] Wallet dashboard
-   [ ] Media queue
-   [ ] Widget settings
-   [ ] Stream key management
-   [ ] Analytics

## Phase 8 --- Admin

-   [ ] User management
-   [ ] Donation management
-   [ ] Payment management
-   [ ] Media moderation
-   [ ] Withdrawal management
-   [ ] Audit log
-   [ ] System statistics

## Phase 9 --- Withdrawal

-   [ ] Withdrawal request
-   [ ] Balance validation
-   [ ] Pending withdrawal
-   [ ] Admin approval
-   [ ] Processing
-   [ ] Completion
-   [ ] Failed/refund

------------------------------------------------------------------------

# 56. Example User Journey

Creator:

``` text
Register
   ↓
Choose username
   ↓
Dashboard
   ↓
Generate Stream Key
   ↓
Customize Media Share
   ↓
Copy Widget URL
```

Creator mendapatkan:

``` text
https://domain.com/widgets/mediashare?streamKey=xxxx
```

Donor:

``` text
Open creator donation page
        ↓
Enter name
        ↓
Enter amount
        ↓
Enter message
        ↓
Select media
        ↓
Choose payment
        ↓
Pay through Midtrans
```

Setelah sukses:

``` text
Midtrans
   ↓
Webhook
   ↓
Donation PAID
   ↓
Wallet credited
   ↓
Media QUEUED
   ↓
Widget detects media
   ↓
Media PLAYING
   ↓
Media PLAYED
```

------------------------------------------------------------------------

# 57. Contoh Endpoint Widget

Request:

``` http
GET /api/widgets/mediashare/media?streamKey=4aa54dbc476e138ce8d91fa1a28808c8
```

Response:

``` json
{
  "data": {
    "id": "9b0d...",
    "donorName": "Ahmad",
    "amount": 50000,
    "message": "Semangat!",
    "mediaType": "youtube",
    "mediaUrl": "dQw4w9WgXcQ",
    "duration": 10
  }
}
```

Setelah selesai:

``` http
POST /api/widgets/mediashare/9b0d.../complete
```

Server:

``` text
PLAYING → PLAYED
```

------------------------------------------------------------------------

# 58. Design Principle

Project ini mengikuti prinsip:

### Backend authoritative

Frontend tidak menentukan:

-   Payment success
-   Wallet balance
-   Donation paid
-   Withdrawal completed

Semua ditentukan backend.

### PostgreSQL as source of truth

Data penting berada di PostgreSQL.

### Simple first

Jangan menambahkan infrastructure sebelum dibutuhkan.

### Stateless application

Next.js dan Go dapat dijalankan lebih dari satu instance.

### Financial consistency

Wallet menggunakan ledger + transaction.

### Secure by default

-   HTTPS
-   HttpOnly cookie
-   Rate limit
-   Parameterized query
-   Webhook verification
-   URL whitelist
-   Authorization
-   Audit log

------------------------------------------------------------------------

# 59. Final Architecture

``` text
                           INTERNET
                              │
                              ▼
                       ┌─────────────┐
                       │ Cloudflare  │
                       └──────┬──────┘
                              │
                              ▼
                       ┌─────────────┐
                       │    NGINX    │
                       └──────┬──────┘
                              │
                 ┌────────────┴────────────┐
                 │                         │
                 ▼                         ▼
          ┌─────────────┐          ┌─────────────┐
          │   NEXT.JS   │          │   GO GIN    │
          │             │          │             │
          │ Landing     │          │ Auth        │
          │ Dashboard   │          │ Donations   │
          │ Donate      │          │ Payments    │
          │ Widget      │          │ Wallet      │
          └─────────────┘          │ Media Queue │
                                   └──────┬──────┘
                                          │
                                          ▼
                                   ┌─────────────┐
                                   │ PostgreSQL  │
                                   │             │
                                   │ Users       │
                                   │ Wallets     │
                                   │ Ledger      │
                                   │ Donations   │
                                   │ Payments    │
                                   │ Media Queue │
                                   └──────┬──────┘
                                          ▲
                                          │
                                   ┌──────┴──────┐
                                   │   Midtrans  │
                                   └─────────────┘


Widget:

/widgets/mediashare?streamKey=XXXX
              │
              ▼
          Next.js
              │
         Polling 2-3s
              │
              ▼
           Go API
              │
              ▼
         PostgreSQL
              │
              ▼
       QUEUED → PLAYING
              │
              ▼
         Media tampil
              │
              ▼
       PLAYING → PLAYED
```

------------------------------------------------------------------------

# 60. Conclusion

MediaShare dapat dibuat sebagai SaaS ringan tanpa infrastructure yang
kompleks.

Arsitektur awal yang direkomendasikan:

``` text
Next.js
   +
Go Gin
   +
PostgreSQL
   +
Nginx
   +
Docker Compose
   +
Midtrans
```

Realtime menggunakan:

``` text
PostgreSQL Queue
+
Polling 2-3 detik
```

bukan:

``` text
Redis
RabbitMQ
WebSocket
OBS
```

Dengan desain ini, satu VPS dapat menjalankan seluruh aplikasi dengan
resource yang relatif kecil, sementara struktur database dan API sudah
disiapkan agar nantinya dapat berkembang menjadi platform donation/Media
Share SaaS yang lebih besar.

------------------------------------------------------------------------

## License

Tambahkan license sesuai kebutuhan project.

Contoh:

``` text
MIT License
```
