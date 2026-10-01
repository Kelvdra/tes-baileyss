# Native Flow & Kartu A2UI — `@kelvdra/baileys`

Dua cara mengirim pesan interaktif:

| # | Fungsi | Kegunaan |
|---|--------|----------|
| 1 | `sock.sendMessage(jid, { nativeFlow, bloksWidget, … })` | Pesan dengan tombol native flow (quick reply, URL, copy, call, list), bisa dipadukan dengan kartu A2UI |
| 2 | `MB.sendA2UI(sock, jid, components, options)` | Kartu A2UI (gambar, judul, teks) dengan tombol di bawahnya |

---

## Persiapan

```js
import makeWASocket, { MB } from '@kelvdra/baileys'
import crypto from 'node:crypto'
```

Untuk CommonJS atau file yang memakai dynamic import:

```js
const { MB } = await import('@kelvdra/baileys')
```

---

## 1. `sendMessage` dengan `nativeFlow`

### 1.1 Tombol quick reply

```js
await sock.sendMessage(jid, {
  text: 'Pilih salah satu:',
  footer: 'Kelvdra Bot',
  nativeFlow: [
    { text: 'Menu', id: '.menu' },
    { text: 'Ping', id: '.ping' },
    { text: 'Owner', id: '.owner' }
  ]
})
```

Ketika tombol ditekan, `id` (misalnya `.menu`) diterima bot sebagai balasan tombol.

### 1.2 Menu dengan bottom sheet (`optionText` / `optionTitle`)

Semua tombol dikumpulkan di satu tombol utama. Saat ditekan, daftar tombol muncul dari bawah.

```js
const teks = '✨ MENU BOT\n\nPilih kategori di bawah.'

await sock.sendMessage(jid, {
  text: teks,
  footer: 'Kelvdra Bot',
  nativeFlow: [
    { text: 'Semua Menu', id: '.allmenu' },
    { text: 'Downloader', id: '.menu downloader' },
    { text: 'Sticker', id: '.menu sticker' }
  ],
  optionText: 'Pilih Kategori',   // label tombol yang membuka bottom sheet
  optionTitle: 'Kategori'         // judul di dalam bottom sheet
})
```

### 1.3 Menu + kartu A2UI (`bloksWidget`)

```js
const teks = '✨ MENU BOT\n\nPilih kategori di bawah.'

await sock.sendMessage(jid, {
  text: teks,
  footer: 'Kelvdra Bot',
  nativeFlow: [
    { text: 'Semua Menu', id: '.allmenu' },
    { text: 'Downloader', id: '.menu downloader' },
    { text: 'Sticker', id: '.menu sticker' }
  ],
  optionText: 'Pilih Kategori',
  optionTitle: 'Kategori',
  bloksWidget: {
    type: 'im_a2ui',
    uuid: crypto.randomUUID(),
    fallback: teks, // harus SAMA PERSIS dengan `text`
    data: JSON.stringify({
      type: 'info_card',
      title: '✨ MENU BOT',
      body: 'Pilih kategori di bawah.'
    })
  }
})
```

> **Penting:** `bloksWidget.fallback` harus identik byte-per-byte dengan `text`.
> Klien hanya menyembunyikan teks bubble kalau widget aktif **dan** keduanya sama.
> Kalau tidak, isi pesan bisa tampil dua kali.

### 1.4 Jenis tombol yang didukung

Setiap item di `nativeFlow` menentukan jenis tombolnya dari field yang ada:

| Field | Jenis tombol | Contoh |
|-------|--------------|--------|
| `id` | Quick reply | `{ text: 'Menu', id: '.menu' }` |
| `url` | Buka tautan | `{ text: 'Situs', url: 'https://example.com' }` |
| `copy` | Salin teks | `{ text: 'Salin Kode', copy: 'PROMO123' }` |
| `call` | Telepon | `{ text: 'Hubungi', call: '+628123456789' }` |
| `sections` | Daftar pilihan (list) | lihat contoh di bawah |
| `name` + `buttonParamsJson` | Tombol mentah (raw) | `{ name: 'send_location', buttonParamsJson: '' }` |

Field tambahan per tombol: `icon` (string), `useWebview` (khusus `url`).

```js
// URL
await sock.sendMessage(jid, {
  text: 'Tautan penting',
  nativeFlow: [
    { text: 'Website', url: 'https://example.com' },
    { text: 'Channel', url: 'https://whatsapp.com/channel/xxxx' }
  ]
})

// Copy
await sock.sendMessage(jid, {
  text: 'Kode promo kamu',
  nativeFlow: [{ text: 'Salin Kode', copy: 'PROMO123' }]
})

// Call
await sock.sendMessage(jid, {
  text: 'Butuh bantuan?',
  nativeFlow: [{ text: 'Hubungi Admin', call: '+628123456789' }]
})

// List pilihan (single_select)
await sock.sendMessage(jid, {
  text: 'Pilih layanan',
  nativeFlow: [{
    text: 'Buka Daftar',
    sections: [{
      title: 'Kategori',
      rows: [
        { title: 'Downloader', description: 'YouTube, TikTok, dll', id: '.menu downloader' },
        { title: 'Sticker', description: 'Buat stiker', id: '.menu sticker' }
      ]
    }]
  }]
})
```

### 1.5 Batasan tombol

WhatsApp Web hanya menggambar tombol yang memenuhi aturan berikut:

- Semua tombol dalam satu pesan harus **satu jenis** yang sama dengan tombol pertama.
- Quick reply maksimal **10** tombol; jenis lain maksimal **3** tombol.

Kalau dilanggar, library mencatat peringatan di log. Pesan tetap terkirim dan biasanya
tetap tergambar di ponsel, tapi bisa kosong di WhatsApp Web. Kamu bisa memeriksa daftar tombol sendiri:

```js
MB.nativeFlowButtonsViolateConstraints([
  { name: 'quick_reply', buttonParamsJson: '{}' },
  { name: 'cta_url', buttonParamsJson: '{}' }
]) // true → melanggar
```

### 1.6 Opsi tambahan

| Opsi | Fungsi |
|------|--------|
| `footer` | Teks footer |
| `optionText`, `optionTitle` | Bottom sheet (lihat 1.2) |
| `offerText`, `offerUrl`, `offerCode`, `offerExpiration` | Banner penawaran terbatas waktu |
| `flowName` | Mengganti nama flow (default `'mixed'`) |
| `audioFooter` | Audio di footer |
| `bizJid`, `shopSurface`, `id` | Menyematkan koleksi atau toko |
| `caption` + `image` / `video` / `document` | Header media (gunakan `caption`, bukan `text`) |

Contoh dengan gambar di header:

```js
await sock.sendMessage(jid, {
  image: { url: 'https://example.com/banner.jpg' },
  caption: 'Promo hari ini',
  title: 'Diskon 50%',
  subtitle: 'Terbatas',
  footer: 'Kelvdra Bot',
  nativeFlow: [
    { text: 'Beli Sekarang', url: 'https://example.com/promo' },
    { text: 'Salin Kode', copy: 'PROMO50' }
  ]
})
```

> `caption` tanpa media akan melempar error `Invalid media type for interactive message header`.

---

## 2. `MB.sendA2UI`

Mengirim kartu A2UI: klien menggambar kartu dari spesifikasi komponen yang dibawa pesan.

### 2.1 Contoh dasar

```js
const { MB } = await import('@kelvdra/baileys')

await MB.sendA2UI(sock, m.chat, [
  MB.a2uiColumn('root', ['card_image', 'card_title', 'card_body']),
  MB.a2uiImage('card_image', 'https://example.com/header.jpg'),
  MB.a2uiText('card_title', 'Selamat datang!', { variant: 'h1' }),
  MB.a2uiText('card_body', 'Senang kamu di sini.')
], {
  buttons: [{
    name: 'cta_url',
    buttonParamsJson: JSON.stringify({
      display_text: 'Gabung Grup',
      url: 'https://chat.whatsapp.com/xxxxxxxx'
    })
  }]
})
```

### 2.2 Cara kerja layout

Layout berupa **daftar datar** komponen yang saling merujuk lewat `id`:

- Harus ada tepat satu komponen dengan id **`root`**. Tanpa itu, `sendA2UI` melempar error.
- Kontainer (`Column`, `Row`) menyebut anaknya lewat **id**, tidak menyarangkannya.

Pada contoh di atas: `root` (Column) berisi `card_image`, `card_title`, dan `card_body`.

### 2.3 Builder komponen

| Builder | Menghasilkan | Keterangan |
|---------|--------------|------------|
| `MB.a2uiColumn(id, children)` | `Column` | Anak ditumpuk vertikal. `children` = array id |
| `MB.a2uiRow(id, children)` | `Row` | Anak berjajar horizontal |
| `MB.a2uiText(id, text, { variant })` | `Text` | `variant` default `'body'`, contoh lain `'h1'` |
| `MB.a2uiImage(id, url, { variant, fit })` | `Image` | Default `variant: 'header'`, `fit: 'cover'` |
| `MB.a2uiCard(id, child)` | `Card` | Membungkus **satu** id anak (bukan array) |

Contoh dengan `Card` dan `Row`:

```js
await MB.sendA2UI(sock, jid, [
  MB.a2uiCard('root', 'content'),
  MB.a2uiColumn('content', ['title', 'row']),
  MB.a2uiText('title', 'Status Server', { variant: 'h1' }),
  MB.a2uiRow('row', ['ping', 'uptime']),
  MB.a2uiText('ping', 'Ping: 42 ms'),
  MB.a2uiText('uptime', 'Uptime: 3 hari')
])
```

### 2.4 Opsi `sendA2UI`

```js
await MB.sendA2UI(sock, jid, components, {
  buttons: [],          // tombol native flow di bawah kartu (default: kosong)
  contextInfo: {},      // mis. quoted / mentions
  messageId: undefined, // ID pesan kustom
  additionalNodes: [],  // node biner tambahan

  // opsi widget A2UI
  uuid: undefined,           // default: crypto.randomUUID()
  surfaceId: undefined,      // default: 'card-<uuid>'
  fallback: '',              // teks pengganti untuk klien tanpa dukungan A2UI
  catalogId: undefined,      // default: katalog dasar A2UI
  sendDataModel: false,
  version: 'v0.9'
})
```

Fungsi mengembalikan objek pesan yang dikirim (`msg.key.id`, `msg.key.remoteJid`, dll.).

### 2.5 Error yang mungkin muncul

| Kondisi | Pesan |
|---------|-------|
| `sock` kosong | `sendA2UI requires a socket as the first argument` |
| `jid` kosong | `sendA2UI requires a target jid` |
| `buttons` bukan array | `sendA2UI buttons must be an array of native flow buttons` |
| Tidak ada komponen `root` | `a2ui components must include one with id "root"` |
| `a2uiImage` tanpa url | `a2uiImage requires a url` |
| `a2uiCard` diberi array | `a2uiCard takes the id of one child component, not an array` |

---

## Alternatif: A2UI lewat `sendMessage`

Menurut dokumentasi elaina-baileys, `bloksWidget` yang dirakit lewat `sendMessage`
sudah terkonfirmasi tergambar di Android, sedangkan helper `sendA2UI` belum
terkonfirmasi tergambar. Kalau `MB.sendA2UI` tidak memunculkan kartu di perangkatmu,
coba jalur ini. Helper `a2uiWidget` membuat objek `bloksWidget` dari daftar komponen yang sama:

```js
const teks = 'Selamat datang! Senang kamu di sini.'

await sock.sendMessage(jid, {
  text: teks,
  nativeFlow: [
    { text: 'Gabung Grup', url: 'https://chat.whatsapp.com/xxxxxxxx' }
  ],
  bloksWidget: MB.a2uiWidget([
    MB.a2uiColumn('root', ['card_title', 'card_body']),
    MB.a2uiText('card_title', 'Selamat datang!', { variant: 'h1' }),
    MB.a2uiText('card_body', 'Senang kamu di sini.')
  ], { fallback: teks }) // fallback harus sama persis dengan `text`
})
```

---

## Catatan

- Tombol dan kartu berjalan di `interactiveMessage` yang sama, sehingga kartu A2UI bisa
  memiliki baris tombol di bawahnya.
- Pesan interaktif seperti ini hanya tergambar penuh di aplikasi ponsel. Sediakan `text`
  atau `fallback` yang bermakna untuk klien yang tidak mendukungnya.
- Tombol dan kartu ini bergantung pada perilaku klien WhatsApp, yang bisa berubah
  sewaktu-waktu tanpa pemberitahuan.
- `MB.decodeBloksWidget(msg)` dapat dipakai untuk membaca kembali `bloksWidget` dari pesan yang diterima.
