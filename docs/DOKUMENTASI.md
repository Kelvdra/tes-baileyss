![@kelvdra/baileys](./banner.svg)

# 📘 Dokumentasi `@kelvdra/baileys`

> Fork Baileys (WhiskeySockets) yang dimodifikasi oleh **Kelvdra**.
> Versi paket: `1.0.6` · Modul: **ESM** · Node.js **≥ 20** · Lisensi: MIT

**Catatan tentang dokumen ini.** Isinya disusun dari pembacaan seluruh kode di `lib/`, ditambah uji offline (paket dipasang, di-`import`, socket dibuat, dan handler `hydra` dipanggil tanpa koneksi ke WhatsApp). Contoh yang mengirim pesan ke WhatsApp sungguhan **belum dijalankan**, jadi tampilan akhir di aplikasi WhatsApp bisa berbeda tergantung versi klien penerima. Dokumen ini sudah diperbarui setelah pengecekan ulang terhadap `package.json` dan `lib/` versi terbaru: masalah `chalk`/`axios` hilang dari `dependencies` dan `makeInMemoryStore` gagal di-`import` **sudah diperbaiki** (lihat [2.1](#21--chalk-dan-axios--sudah-diperbaiki) dan [15.2](#152--sudah-diperbaiki--makeinmemorystore-sekarang-berfungsi)). Masalah lain yang masih berlaku ada di [Bagian 15](#15-masalah-yang-diketahui--saran-perbaikan).

---

## Daftar Isi

1. [Ringkasan & apa yang dimodifikasi](#1-ringkasan--apa-yang-dimodifikasi)
2. [Baca dulu: 3 hal penting sebelum memakai](#2-baca-dulu-3-hal-penting-sebelum-memakai)
3. [Instalasi](#3-instalasi)
4. [Struktur project](#4-struktur-project)
5. [Quick start: koneksi, QR, pairing code, reconnect](#5-quick-start)
6. [Konfigurasi socket](#6-konfigurasi-socket)
7. [Event](#7-event)
8. [Menerima & membaca pesan](#8-menerima--membaca-pesan)
9. [Cara kerja `sendMessage` (routing hydra)](#9-cara-kerja-sendmessage)
10. [Pesan standar Baileys](#10-pesan-standar-baileys)
11. [Fitur khusus Kelvdra](#11-fitur-khusus-kelvdra)
12. [API socket lainnya](#12-api-socket-lainnya)
13. [Media, auth, store, dan helper](#13-media-auth-store-dan-helper)
14. [Contoh pola bot dengan plugin](#14-contoh-pola-bot-dengan-plugin)
15. [Masalah yang diketahui & saran perbaikan](#15-masalah-yang-diketahui--saran-perbaikan)
16. [Tips performa](#16-tips-performa)
17. [Penafian](#17-penafian)

---

## 1. Ringkasan & apa yang dimodifikasi

`@kelvdra/baileys` adalah klien WhatsApp Web **multi-device** berbasis WebSocket (tanpa browser/Selenium), turunan dari Baileys seri `7.0.0-rc` (mendukung LID, `whatsapp-rust-bridge`, dsb).

Bagian yang **ditambahkan atau diubah** dibanding Baileys biasa:

| Lokasi | Perubahan |
|---|---|
| `lib/Socket/hydra.js` *(file baru)* | Class `hydra` berisi handler pesan khusus: payment, product, interactive, album, event, poll result, carousel, order, sticker pack, status mention, group status. |
| `lib/Socket/messages-send.js` | Membuat instance `hydra` (diekspos sebagai `sock.kelvdra`), **routing di `sendMessage`** ke handler hydra, serta fungsi baru `sendStatusMentions` dan `sendAlbumMessage`. |
| `lib/Utils/messages.js` | `generateWAMessageContent` mendukung tipe konten tambahan: `interactiveButtons`, `buttons`, `templateButtons`, `sections` (list), `listReply`, `payment`, `stickerPack`, `collection`, `ptv`, `limitSharing`, `sharePhoneNumber`, `requestPhoneNumber`, dll. |
| `lib/index.js` | Menampilkan banner `chalk` saat library di-import. |
| `lib/Defaults/index.js` | Konstanta tambahan (`HISTORY_SYNC_PAUSED_TIMEOUT_MS`, `TimeMs`). |

Selain itu seluruh API Baileys 7.x tetap tersedia (grup, komunitas, newsletter, profil, privasi, label, katalog bisnis, dll.).

---

## 2. Baca dulu: 3 hal penting sebelum memakai

### 2.1 ✅ `chalk` dan `axios` — sudah diperbaiki

Di versi sebelumnya, `lib/index.js` meng-import `chalk` dan `lib/Socket/hydra.js` meng-import `axios` tanpa keduanya tercantum di `package.json`, sehingga `import '@kelvdra/baileys'` gagal dengan `ERR_MODULE_NOT_FOUND`.

**Sudah diperbaiki di versi ini** — `package.json` sekarang mencantumkan `"chalk": "^5.3.0"` dan `"axios": "^1.13.6"` di `dependencies`, jadi tidak perlu install manual lagi. `npm install @kelvdra/baileys` saja sudah cukup untuk dua paket ini.

### 2.2 `printQRInTerminal` sudah tidak berfungsi

`README.md` memakai `printQRInTerminal: true`. Di kode `socket.js`, opsi ini hanya mencetak peringatan *deprecated* dan **tidak lagi mencetak QR**. QR harus ditangani sendiri lewat event `connection.update` (`update.qr`), atau pakai pairing code. Contohnya ada di [Bagian 5](#5-quick-start).

### 2.3 Dua "gaya" key pesan

Karena ada handler hydra, ada dua cara menulis beberapa jenis pesan:

| Jenis | Gaya hydra (di-route ke `hydra`) | Gaya standar (lewat `generateWAMessageContent`) |
|---|---|---|
| Payment | `requestPaymentMessage: {...}` | `payment: {...}` |
| Product | `productMessage: {...}` | `product: {...}` |
| Interactive | `interactiveMessage: {...}` | `interactiveButtons: [...]` |
| Event | `eventMessage: {...}` | `event: {...}` |
| Album | `albumMessage: [...]` | `sock.sendAlbumMessage(...)` |
| Poll result | `pollResultMessage: {...}` | *(tidak ada)* |
| Carousel | `carouselMessage: {...}` / `carousel` | *(tidak ada)* |

Field di dalamnya **berbeda** antar gaya. Bagian 11 menjelaskan keduanya.

---

## 3. Instalasi

```bash
npm install @kelvdra/baileys chalk axios pino @hapi/boom

# Opsional (sesuai kebutuhan):
npm install sharp            # thumbnail gambar, konversi sticker pack
npm install jimp             # alternatif sharp untuk sticker pack
npm install link-preview-js  # link preview otomatis di pesan teks
npm install audio-decode     # durasi/waveform audio (voice note)
npm install qrcode-terminal  # menampilkan QR di terminal
```

**Requirement:** Node.js 20 atau lebih baru (`engine-requirements.js` akan menghentikan proses jika di bawah 20).

**ESM.** Project pengguna harus memakai ESM (`"type": "module"` di `package.json`, atau file `.mjs`). Jika masih CommonJS:

```js
// CommonJS
const { default: makeWASocket, useMultiFileAuthState } = await import('@kelvdra/baileys')
```

**Pengganti drop-in untuk `@whiskeysockets/baileys`** (opsional, memakai alias npm):

```json
{
  "dependencies": {
    "@whiskeysockets/baileys": "npm:@kelvdra/baileys@1.0.5-rc.2"
  }
}
```

---

## 4. Struktur project

```
kelvdra-baileys/
├── package.json              # nama, versi, dependensi
├── engine-requirements.js    # cek Node >= 20
├── WAProto/                  # definisi protobuf WhatsApp (proto, index.js, index.d.ts)
├── .github/workflows/main.yml# publish otomatis ke npm saat push tag v*
└── lib/
    ├── index.js              # entry point (export semuanya + banner chalk)
    ├── Defaults/             # DEFAULT_CONNECTION_CONFIG, konstanta, versi WA Web
    ├── Signal/               # enkripsi Signal (libsignal, group cipher, LID mapping)
    ├── Socket/
    │   ├── index.js          # makeWASocket -> makeCommunitiesSocket(config)
    │   ├── socket.js         # koneksi WS, handshake, pairing code, keep-alive
    │   ├── chats.js          # profil, privasi, chatModify, label, presence
    │   ├── groups.js         # fungsi grup
    │   ├── communities.js    # fungsi komunitas
    │   ├── newsletter.js     # fungsi channel/newsletter
    │   ├── business.js       # katalog & profil bisnis
    │   ├── messages-recv.js  # menerima & mendekripsi pesan, retry, receipt
    │   ├── messages-send.js  # kirim pesan, sendMessage, sendStatusMentions, sendAlbumMessage
    │   ├── hydra.js          # ★ class hydra (fitur khusus Kelvdra)
    │   └── mex.js
    ├── Store/                # makeInMemoryStore, makeCacheManagerAuthState
    ├── Types/                # definisi TypeScript
    ├── Utils/                # generateWAMessage*, downloadMediaMessage, auth state, crypto, dll.
    ├── WABinary/             # encode/decode node biner WhatsApp + helper JID
    ├── WAM/ · WAUSync/       # analitik & query USync
    └── index.d.ts
```

Rantai socket (dari paling dasar ke paling atas):
`socket` → `chats` → `newsletter` → `messages-recv` → `messages-send` → `groups` → `business`/`communities` → `makeWASocket`.

---

## 5. Quick start

### 5.1 Koneksi dengan QR code

```js
import makeWASocket, {
  useMultiFileAuthState,
  DisconnectReason,
  fetchLatestWaWebVersion,
  makeCacheableSignalKeyStore,
  Browsers
} from '@kelvdra/baileys'
import pino from 'pino'
import qrcode from 'qrcode-terminal'

const logger = pino({ level: 'silent' })

async function start() {
  const { state, saveCreds } = await useMultiFileAuthState('session')
  const { version } = await fetchLatestWaWebVersion()

  const sock = makeWASocket({
    version,
    logger,
    browser: Browsers.ubuntu('Chrome'),
    auth: {
      creds: state.creds,
      keys: makeCacheableSignalKeyStore(state.keys, logger)
    },
    syncFullHistory: false
  })

  sock.ev.on('creds.update', saveCreds)

  sock.ev.on('connection.update', ({ connection, lastDisconnect, qr }) => {
    if (qr) qrcode.generate(qr, { small: true })   // ← QR harus ditangani sendiri

    if (connection === 'open') console.log('✅ Tersambung sebagai', sock.user?.id)

    if (connection === 'close') {
      const code = lastDisconnect?.error?.output?.statusCode
      const loggedOut = code === DisconnectReason.loggedOut
      console.log('Koneksi terputus, kode:', code)
      if (!loggedOut) start()          // reconnect (restartRequired, connectionLost, dst.)
      else console.log('Sesi logout — hapus folder "session" lalu scan ulang.')
    }
  })

  return sock
}

start()
```

### 5.2 Koneksi dengan pairing code (tanpa QR)

```js
const sock = makeWASocket({ /* konfigurasi sama seperti di atas */ })

if (!sock.authState.creds.registered) {
  const nomor = '6281234567890'                 // format internasional, tanpa "+"
  const kode = await sock.requestPairingCode(nomor)
  console.log('Kode pairing:', kode)            // masukkan di WhatsApp → Perangkat tertaut
}
```

`requestPairingCode(phoneNumber, customPairingCode?)` — jika memakai kode kustom, panjangnya **harus tepat 8 karakter** (kode akan ditolak dengan error jika tidak).

### 5.3 Kirim pesan pertama

```js
sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return
  const m = messages[0]
  if (!m.message || m.key.fromMe) return

  const teks = m.message.conversation || m.message.extendedTextMessage?.text || ''
  if (teks === '.ping') {
    await sock.sendMessage(m.key.remoteJid, { text: 'pong 🏓' }, { quoted: m })
  }
})
```

---

## 6. Konfigurasi socket

`makeWASocket(config)` menggabungkan `config` dengan `DEFAULT_CONNECTION_CONFIG`. Opsi yang paling sering dipakai:

| Opsi | Default | Keterangan |
|---|---|---|
| `auth` | — (**wajib**) | Objek `{ creds, keys }` dari `useMultiFileAuthState`. |
| `version` | `[2, 3000, 1033105955]` | Versi WA Web. Ambil yang terbaru dengan `fetchLatestWaWebVersion()`. |
| `browser` | `Browsers.macOS('Chrome')` | Nama perangkat di daftar "Perangkat tertaut". Helper: `Browsers.ubuntu/macOS/windows/baileys/appropriate`. |
| `logger` | pino child | Logger pino. Pakai `pino({ level: 'silent' })` agar sepi. |
| `syncFullHistory` | `true` ⚠️ | Minta riwayat lengkap dari HP. **Disarankan `false`** untuk bot. |
| `shouldSyncHistoryMessage` | mengikuti `syncFullHistory` | Fungsi untuk memilih history sync mana yang diproses. |
| `markOnlineOnConnect` | `true` | Tandai akun "online" saat tersambung. Set `false` agar notifikasi HP tetap muncul. |
| `emitOwnEvents` | `true` | Pesan yang dikirim socket ini ikut memicu `messages.upsert`. |
| `getMessage` | `async () => undefined` | Dipakai untuk retry/dekripsi ulang (kembalikan `proto.IMessage` dari store Anda). |
| `cachedGroupMetadata` | `async () => undefined` | Cache metadata grup → kirim ke grup lebih cepat. **Juga dipakai `sendStatusMentions`.** |
| `connectTimeoutMs` | `20000` | Timeout koneksi. |
| `keepAliveIntervalMs` | `30000` | Interval ping. |
| `defaultQueryTimeoutMs` | `60000` | Timeout query. |
| `retryRequestDelayMs` / `maxMsgRetryCount` | `250` / `5` | Pengaturan retry pesan. |
| `enableRecentMessageCache` | `true` | Cache pesan terbaru untuk retry. |
| `enableAutoSessionRecreation` | `true` | Buat ulang sesi Signal otomatis jika gagal. |
| `generateHighQualityLinkPreview` | `false` | Upload thumbnail link preview kualitas tinggi. |
| `linkPreviewImageThumbnailWidth` | `192` | Lebar thumbnail link preview. |
| `mediaCache` | — | Cache media agar URL yang sama tidak di-upload ulang. |
| `shouldIgnoreJid` | `() => false` | Abaikan JID tertentu (mis. `jid => jid.endsWith('@broadcast')`). |
| `patchMessageBeforeSending` | identity | Modifikasi pesan sebelum dienkripsi & dikirim. |
| `countryCode` | `'US'` | Kode negara nomor yang dipakai. |
| `agent` / `fetchAgent` | — | Proxy untuk WebSocket / untuk fetch media. |
| `options` | `{}` | Opsi `fetch` (mis. header) untuk unduh/unggah. |

---

## 7. Event

Semua lewat `sock.ev.on(nama, handler)`.

| Event | Isi | Kapan |
|---|---|---|
| `connection.update` | `{ connection, lastDisconnect, qr, isNewLogin, receivedPendingNotifications, … }` | Status koneksi berubah / QR baru |
| `creds.update` | kredensial parsial | Wajib disimpan: `sock.ev.on('creds.update', saveCreds)` |
| `messaging-history.set` | `{ chats, contacts, messages, isLatest, syncType }` | History sync |
| `messages.upsert` | `{ messages, type: 'notify' \| 'append', requestId? }` | Pesan masuk / baru |
| `messages.update` | `[{ key, update }]` | Status/isi pesan berubah (edit, read, dll.) |
| `messages.delete` | `{ keys }` atau `{ jid, all }` | Pesan dihapus |
| `messages.reaction` | `[{ key, reaction }]` | Reaksi emoji |
| `messages.media-update` | `[{ key, media, error }]` | Hasil re-upload media |
| `message-receipt.update` | `[{ key, receipt }]` | Centang terkirim/dibaca |
| `chats.upsert` / `chats.update` / `chats.delete` | data chat | Perubahan chat |
| `contacts.upsert` / `contacts.update` | data kontak | Perubahan kontak |
| `presence.update` | `{ id, presences }` | Mengetik/online (setelah `presenceSubscribe`) |
| `groups.upsert` / `groups.update` | metadata grup | Grup baru / berubah |
| `group-participants.update` | `{ id, author, participants, action }` | Anggota masuk/keluar/promote/demote |
| `group.join-request` | permintaan bergabung | Grup dengan persetujuan admin |
| `blocklist.set` / `blocklist.update` | daftar blokir | Perubahan blokir |
| `labels.edit` / `labels.association` | label | Label WhatsApp Business |
| `lid-mapping.update` | pemetaan LID↔PN | Pemetaan ID baru |
| `newsletter.reaction` / `newsletter.view` | data channel | Aktivitas channel |
| `newsletter-participants.update` / `newsletter-settings.update` | data channel | Perubahan channel |

Memproses banyak event sekaligus (dianjurkan, karena event di-buffer):

```js
sock.ev.process(async (events) => {
  if (events['connection.update']) { /* ... */ }
  if (events['creds.update'])      { await saveCreds() }
  if (events['messages.upsert'])   { /* ... */ }
})
```

Contoh anggota grup:

```js
sock.ev.on('group-participants.update', async ({ id, participants, action }) => {
  // action: 'add' | 'remove' | 'promote' | 'demote' | 'modify'
  if (action === 'add') {
    await sock.sendMessage(id, {
      text: `Selamat datang ${participants.map(p => '@' + p.split('@')[0]).join(', ')}!`,
      mentions: participants
    })
  }
})
```

> Di seri 7.x, `participants` pada sebagian event bisa berupa objek/LID, bukan sekadar string PN. Periksa isinya dengan `console.log` pada versi Anda sebelum mengandalkan `p.split('@')`.

---

## 8. Menerima & membaca pesan

### 8.1 Bentuk pesan (`WAMessage`)

```js
m.key.remoteJid     // chat: '628…@s.whatsapp.net', '1203…@g.us', atau '…@lid'
m.key.fromMe        // dikirim oleh akun sendiri?
m.key.id            // ID pesan
m.key.participant   // pengirim di grup
m.key.remoteJidAlt  // alternatif JID (PN ↔ LID), bila ada
m.key.participantAlt
m.pushName          // nama tampilan pengirim
m.message           // isi pesan (proto.IMessage)
m.messageTimestamp
```

Di Baileys 7.x, identitas bisa berupa **LID** (`…@lid`) selain nomor telepon (PN). Helper yang tersedia: `isLidUser(jid)`, `isPnUser(jid)`, `jidDecode(jid)`, `jidNormalizedUser(jid)`, `areJidsSameUser(a, b)`.

### 8.2 Mengambil teks dari berbagai jenis pesan

```js
import { getContentType, extractMessageContent, jidNormalizedUser, isJidGroup } from '@kelvdra/baileys'

export function parseMessage(sock, m) {
  const content = extractMessageContent(m.message)        // membuka viewOnce/ephemeral/dsb.
  const type = getContentType(content)                    // mis. 'extendedTextMessage'
  const msg = content?.[type]

  let body = ''
  switch (type) {
    case 'conversation':                body = content.conversation; break
    case 'extendedTextMessage':         body = msg.text; break
    case 'imageMessage':
    case 'videoMessage':
    case 'documentMessage':             body = msg.caption || ''; break
    case 'buttonsResponseMessage':      body = msg.selectedButtonId; break
    case 'listResponseMessage':         body = msg.singleSelectReply?.selectedRowId; break
    case 'templateButtonReplyMessage':  body = msg.selectedId; break
    case 'interactiveResponseMessage':  // jawaban tombol native flow
      try { body = JSON.parse(msg.nativeFlowResponseMessage?.paramsJson || '{}').id } catch {}
      break
  }

  const from = m.key.remoteJid
  const isGroup = isJidGroup(from)
  const sender = jidNormalizedUser(isGroup ? (m.key.participant || m.participant) : from)
  const quoted = msg?.contextInfo?.quotedMessage      // pesan yang di-reply
  const mentioned = msg?.contextInfo?.mentionedJid || []

  return { type, body: body || '', from, isGroup, sender, quoted, mentioned }
}
```

### 8.3 Menandai dibaca, presence

```js
await sock.readMessages([m.key])                          // centang biru
await sock.sendPresenceUpdate('composing', m.key.remoteJid) // "sedang mengetik…"
await sock.sendPresenceUpdate('recording', m.key.remoteJid) // "merekam suara…"
await sock.sendPresenceUpdate('paused', m.key.remoteJid)
```

`WAPresence`: `'unavailable' | 'available' | 'composing' | 'recording' | 'paused'`.

---

## 9. Cara kerja `sendMessage`

```js
const hasil = await sock.sendMessage(jid, content, options)
```

Sebelum masuk ke jalur standar Baileys, `sendMessage` memanggil `sock.kelvdra.detectType(content)`. Jika `content` memiliki salah satu key di tabel berikut, pesan diproses handler `hydra`. Pengecekan berurutan dari atas, **key pertama yang cocok menang**.

| Key di `content` | Tipe | Handler | Nilai yang dikembalikan |
|---|---|---|---|
| `requestPaymentMessage` | `PAYMENT` | `handlePayment` | ID pesan (`string`) |
| `productMessage` | `PRODUCT` | `handleProduct` | ID pesan (`string`) |
| `interactiveMessage` | `INTERACTIVE` | `handleInteractive` | ID pesan (`string`) |
| `albumMessage` | `ALBUM` | `handleAlbum` | objek pesan album (`WAMessage`) |
| `eventMessage` | `EVENT` | `handleEvent` | `WAMessage` |
| `pollResultMessage` | `POLL_RESULT` | `handlePollResult` | `WAMessage` |
| `carouselMessage` atau `carousel` | `CAROUSEL` | `handleCarousel` | `WAMessage` |
| `statusMentionMessage`, `orderMessage`, `groupStatus`, `stickerPack` | terdeteksi, **tidak ada `case`** | — | jatuh ke jalur standar (lihat [15.3](#153-handler-yang-tidak-ter-route)) |
| lainnya | `null` | — | jalur standar Baileys → `WAMessage` |

Hal yang perlu diingat:

- Pada jalur hydra, opsi yang dipakai hanya `quoted` dan `filter`. Opsi lain (`ephemeralExpiration`, `messageId`, `statusJidList`, dst.) **diabaikan**.
- Pesan dari jalur hydra **tidak** ikut `upsertMessage`, jadi `emitOwnEvents` tidak berlaku untuknya.
- `PAYMENT`, `PRODUCT`, `INTERACTIVE` mengembalikan **string ID**, bukan objek pesan. Jika Anda butuh `key` untuk edit/hapus, ambil dari ID tersebut: `{ remoteJid: jid, fromMe: true, id }`.

---

## 10. Pesan standar Baileys

Semua contoh memakai `sock.sendMessage(jid, content, options)`. `m` adalah pesan masuk (untuk `quoted`).

### 10.1 Teks, reply, mention

```js
await sock.sendMessage(jid, { text: 'Halo!' })
await sock.sendMessage(jid, { text: 'Balasan' }, { quoted: m })

// Mention
await sock.sendMessage(jid, {
  text: 'Halo @628123456789',
  mentions: ['628123456789@s.whatsapp.net']
})

// Matikan link preview otomatis
await sock.sendMessage(jid, { text: 'https://example.com', linkPreview: null })
```

### 10.2 Media

```js
// Gambar (URL, Buffer, atau { stream })
await sock.sendMessage(jid, { image: { url: 'https://…/foto.jpg' }, caption: 'Caption' })
await sock.sendMessage(jid, { image: fs.readFileSync('foto.jpg'), caption: 'Dari Buffer' })

// Video, GIF, video bulat (PTV)
await sock.sendMessage(jid, { video: { url: 'video.mp4' }, caption: 'Video' })
await sock.sendMessage(jid, { video: { url: 'anim.mp4' }, gifPlayback: true })
await sock.sendMessage(jid, { ptv: true, video: { url: 'video.mp4' } })

// Audio & voice note
await sock.sendMessage(jid, { audio: { url: 'lagu.mp3' }, mimetype: 'audio/mpeg' })
await sock.sendMessage(jid, { audio: { url: 'vn.ogg' }, mimetype: 'audio/ogg; codecs=opus', ptt: true })

// Dokumen
await sock.sendMessage(jid, {
  document: { url: 'laporan.pdf' },
  mimetype: 'application/pdf',
  fileName: 'Laporan.pdf',
  caption: 'Laporan bulan ini'
})

// Stiker (harus sudah berformat WebP)
await sock.sendMessage(jid, { sticker: fs.readFileSync('stiker.webp') })

// View once
await sock.sendMessage(jid, { image: { url: 'rahasia.jpg' }, viewOnce: true })
```

> Library tidak mengonversi format. Stiker harus WebP, voice note sebaiknya OGG/Opus.

### 10.3 Kontak & lokasi

```js
const vcard =
  'BEGIN:VCARD\nVERSION:3.0\n' +
  'FN:Kelvdra\n' +
  'TEL;type=CELL;type=VOICE;waid=628123456789:+62 812-3456-789\n' +
  'END:VCARD'

await sock.sendMessage(jid, {
  contacts: { displayName: 'Kelvdra', contacts: [{ vcard }] }   // >1 kontak → contactsArrayMessage
})

await sock.sendMessage(jid, {
  location: { degreesLatitude: -6.2, degreesLongitude: 106.816, name: 'Jakarta', address: 'DKI Jakarta' }
})
```

### 10.4 Reaksi, edit, hapus, forward, pin

```js
await sock.sendMessage(jid, { react: { text: '🔥', key: m.key } })   // hapus reaksi: text: ''

const kirim = await sock.sendMessage(jid, { text: 'versi lama' })
await sock.sendMessage(jid, { text: 'versi baru', edit: kirim.key })     // edit
await sock.sendMessage(jid, { delete: kirim.key })                       // hapus untuk semua

await sock.sendMessage(tujuan, { forward: m })                           // forward
await sock.sendMessage(jid, { pin: m.key, type: 1, time: 86400 })        // pin 24 jam (type 2 = lepas pin)
```

Menghapus pesan orang lain di grup hanya bisa bila akun bot admin.

### 10.5 Poll

```js
await sock.sendMessage(jid, {
  poll: { name: 'Makan apa?', values: ['Nasi goreng', 'Mie ayam', 'Bakso'], selectableCount: 1 }
})
```

`selectableCount` harus `0 … jumlah opsi`. `1` memakai poll v3 (pilihan tunggal); selain itu memakai poll multi-pilihan. `toAnnouncementGroup: true` dipakai untuk grup pengumuman komunitas.

### 10.6 Event (undangan acara)

```js
await sock.sendMessage(jid, {
  event: {
    name: 'Rapat Komunitas',
    description: 'Bahas rencana bulan depan',
    startDate: new Date('2026-10-01T19:00:00+07:00'),
    endDate: new Date('2026-10-01T21:00:00+07:00'),
    location: { degreesLatitude: -6.2, degreesLongitude: 106.816, name: 'Kantor' },
    call: 'video',               // opsional: 'audio' | 'video' → membuat link panggilan
    extraGuestsAllowed: true
  }
})
```

### 10.7 Undangan grup, disappearing, dan lain-lain

```js
await sock.sendMessage(jid, {
  groupInvite: {
    jid: '1203630000000000@g.us',
    subject: 'Nama Grup',
    inviteCode: 'ABCDEFGH',
    inviteExpiration: Math.floor(Date.now() / 1000) + 3 * 86400,
    text: 'Yuk gabung!'
  }
})

await sock.sendMessage(grupJid, { disappearingMessagesInChat: 86400 })   // grup: 24 jam; false/0 = mati
await sock.sendMessage(jid, { text: 'Hilang sendiri' }, { ephemeralExpiration: 86400 })

await sock.sendMessage(jid, { sharePhoneNumber: true })     // bagikan nomor telepon (untuk chat LID)
await sock.sendMessage(jid, { requestPhoneNumber: true })   // minta nomor telepon
await sock.sendMessage(jid, { limitSharing: true })         // batasi bagikan chat
```

### 10.8 Iklan eksternal / kartu pratinjau (`externalAdReply`)

```js
await sock.sendMessage(jid, {
  text: 'Cek website kami',
  contextInfo: {
    externalAdReply: {
      title: 'Judul kartu',
      body: 'Deskripsi singkat',
      thumbnailUrl: 'https://…/thumb.jpg',
      sourceUrl: 'https://example.com',
      mediaType: 1,
      renderLargerThumbnail: true
    }
  }
})
```

### 10.9 Status (story) teks

```js
await sock.sendMessage('status@broadcast',
  { text: 'Halo dunia', backgroundColor: '#1E1E1E', font: 3 },
  { statusJidList: ['628123456789@s.whatsapp.net'] }   // siapa yang boleh melihat
)
```

### 10.10 Opsi `sendMessage` (argumen ke-3)

| Opsi | Fungsi |
|---|---|
| `quoted` | Pesan yang di-reply (objek `WAMessage` lengkap) |
| `ephemeralExpiration` | Detik sebelum pesan hilang |
| `messageId` | ID pesan kustom |
| `timestamp` | `Date` kustom |
| `statusJidList` | Penerima status (`status@broadcast`) |
| `backgroundColor`, `font` | Untuk status teks |
| `mediaUploadTimeoutMs` | Timeout upload media |
| `useCachedGroupMetadata` | Pakai cache metadata grup |
| `filter` | (khusus Kelvdra, jalur hydra) kirim hanya ke `participant: { jid }` |

---

## 11. Fitur khusus Kelvdra

### 11.1 Tombol native flow: `interactiveButtons` *(gaya standar)*

Tombol interaktif modern. Setiap tombol berisi `name` dan `buttonParamsJson` (string JSON).

```js
await sock.sendMessage(jid, {
  text: 'Pilih menu di bawah ini',
  title: 'Menu Bot',
  subtitle: 'Kelvdra Bot',
  footer: '© Kelvdra',
  interactiveButtons: [
    { name: 'quick_reply',
      buttonParamsJson: JSON.stringify({ display_text: 'Ping', id: '.ping' }) },
    { name: 'cta_url',
      buttonParamsJson: JSON.stringify({ display_text: 'Website', url: 'https://example.com', merchant_url: 'https://example.com' }) },
    { name: 'cta_copy',
      buttonParamsJson: JSON.stringify({ display_text: 'Salin kode', copy_code: 'KODE123' }) },
    { name: 'cta_call',
      buttonParamsJson: JSON.stringify({ display_text: 'Telepon', phone_number: '+628123456789' }) },
    { name: 'single_select',
      buttonParamsJson: JSON.stringify({
        title: 'Pilih kategori',
        sections: [{ title: 'Kategori', rows: [
          { title: 'Musik', description: 'Cari lagu', id: '.play' },
          { title: 'Download', description: 'Unduh video', id: '.dl' }
        ] }]
      }) }
  ]
}, { quoted: m })
```

> Nama tombol (`quick_reply`, `cta_url`, `cta_copy`, `cta_call`, `single_select`) dan isi parameternya adalah format native flow bawaan WhatsApp, bukan bagian kode Anda. Kode library hanya meneruskannya apa adanya.

**Dengan media** (gambar/video/dokumen) — gunakan `caption` (bukan `text`):

```js
await sock.sendMessage(jid, {
  image: { url: 'https://…/banner.jpg' },
  caption: 'Promo hari ini',
  title: 'Diskon',
  subtitle: 'Terbatas',
  footer: '© Kelvdra',
  hasMediaAttachment: true,
  interactiveButtons: [
    { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Ambil', id: '.klaim' }) }
  ]
})
```

Varian dengan media dibangun dari kode yang agak tidak lazim (lihat [15.7](#157-catatan-kecil-lain)); uji dulu di perangkat Anda.

**Membaca klik tombol:** lihat `interactiveResponseMessage` di [8.2](#82-mengambil-teks-dari-berbagai-jenis-pesan) — `id` ada di `nativeFlowResponseMessage.paramsJson`.

### 11.2 Tombol klasik, template, dan list

```js
// Buttons klasik (buttonsMessage)
await sock.sendMessage(jid, {
  text: 'Pilih salah satu',
  footer: 'Footer',
  buttons: [
    { buttonId: 'id1', buttonText: { displayText: 'Opsi 1' } },
    { buttonId: 'id2', buttonText: { displayText: 'Opsi 2' } }
  ]
})

// List message — JANGAN sertakan key `text` (lihat catatan di bawah)
await sock.sendMessage(jid, {
  title: 'Judul List',
  footer: 'Footer',
  buttonText: 'Buka daftar',
  sections: [
    { title: 'Bagian 1', rows: [
      { title: 'Item A', rowId: 'a', description: 'Deskripsi A' },
      { title: 'Item B', rowId: 'b', description: 'Deskripsi B' }
    ] }
  ]
})

// Membalas tombol/list (mengirim balasan sebagai pengguna)
await sock.sendMessage(jid, { buttonReply: { displayText: 'Opsi 1', id: 'id1', index: 0 }, type: 'plain' })
```

> ⚠️ **List message dan key `text`.** Di `generateWAMessageContent`, cabang `text` dicek lebih dulu daripada cabang `sections`. Jika Anda menulis `text` bersama `sections`, hasilnya hanya **pesan teks biasa** (list-nya hilang) — saya buktikan lewat uji offline. Jadi list harus dikirim **tanpa `text`**; konsekuensinya kolom deskripsi list (yang diisi dari `text`) kosong. Kalau butuh deskripsi, gunakan tombol `single_select` di `interactiveButtons` ([11.1](#111-tombol-native-flow-interactivebuttons-gaya-standar)).

`buttonReply.type`: `'plain' | 'template' | 'list' | 'interactive'`. Untuk `templateButtons`, kode memeriksa key `template` (lihat [15.7](#157-catatan-kecil-lain)). Tampilan buttons klasik & template bergantung versi WhatsApp penerima; untuk hasil yang paling konsisten gunakan `interactiveButtons`.

### 11.3 Payment request

**Gaya hydra** (`requestPaymentMessage`):

```js
await sock.sendMessage(jid, {
  requestPaymentMessage: {
    amount: 15000000,                        // nilai × 1000  →  ditampilkan Rp15.000
    currency: 'IDR',
    from: '628123456789@s.whatsapp.net',     // yang diminta membayar
    note: 'Pembayaran pesanan #123',
    expiry: 0                                // 0 = tanpa kedaluwarsa
    // sticker: { stickerMessage: {...} }    // opsional: catatan berupa stiker
    // background: { id, placeholderArgb }   // opsional
  }
}, { quoted: m })
```

`amount` diteruskan langsung ke `amount1000`, jadi **kalikan 1000 sendiri** (uji offline: `amount: 15000000` menghasilkan `amount1000: "15000000"`).

**Gaya standar** (`payment`):

```js
await sock.sendMessage(jid, {
  payment: {
    currency: 'IDR', amount: 15000000, from: '628123456789@s.whatsapp.net',
    note: 'Tagihan', expiry: 0,
    image: { placeholderArgb: 4278190080, textArgb: 4294967295, subtextArgb: 4294967295 }
  }
})
```

### 11.4 Product message

**Gaya hydra** (`productMessage`) — dibungkus `viewOnceMessage` + tombol native flow:

```js
await sock.sendMessage(jid, {
  productMessage: {
    title: 'Kaos Polos',
    description: 'Bahan katun combed 30s',
    thumbnail: { url: 'https://…/kaos.jpg' },     // atau Buffer
    productId: 'SKU-001',
    retailerId: 'TOKO-KELVDRA',
    url: 'https://example.com/kaos',
    priceAmount1000: 85000000,                    // Rp85.000 (× 1000)
    currencyCode: 'IDR',
    body: 'Stok terbatas!',
    footer: '© Kelvdra Store',
    buttons: [
      { name: 'cta_url',
        buttonParamsJson: JSON.stringify({ display_text: 'Beli', url: 'https://example.com/kaos', merchant_url: 'https://example.com' }) }
    ]
  }
}, { quoted: m })
```

**Gaya standar** (`product`):

```js
await sock.sendMessage(jid, {
  product: {
    productImage: { url: 'https://…/kaos.jpg' },
    productId: 'SKU-001', title: 'Kaos Polos', description: 'Katun combed',
    currencyCode: 'IDR', priceAmount1000: 85000000, retailerId: 'TOKO', url: 'https://example.com/kaos',
    productImageCount: 1
  },
  businessOwnerJid: '628123456789@s.whatsapp.net',
  body: 'Deskripsi', footer: 'Footer'
})
```

### 11.5 Interactive message (gaya hydra)

Field `title` dipakai sebagai **teks body** pesan. Tombol ditulis mentah (`{ name, buttonParamsJson }`). Media boleh berupa `image`, `video`, `document`, atau `thumbnail` (string URL).

```js
await sock.sendMessage(jid, {
  interactiveMessage: {
    title: 'Selamat datang di Kelvdra Bot',      // → body
    footer: 'Powered by @kelvdra/baileys',
    image: { url: 'https://…/banner.jpg' },      // atau video / document / thumbnail
    buttons: [
      { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Menu', id: '.menu' }) },
      { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Channel', url: 'https://t.me/kelvdraa' }) }
    ],
    contextInfo: { mentionedJid: [], isForwarded: false },
    externalAdReply: {
      title: 'Kelvdra', body: 'Bot WhatsApp',
      thumbnailUrl: 'https://…/thumb.jpg', sourceUrl: 'https://example.com',
      renderLargerThumbnail: true
    }
  }
}, { quoted: m })
```

Dokumen sebagai header:

```js
await sock.sendMessage(jid, {
  interactiveMessage: {
    title: 'File terlampir', footer: 'Footer',
    document: { url: 'laporan.pdf' }, mimetype: 'application/pdf', fileName: 'Laporan.pdf',
    jpegThumbnail: { url: 'https://…/cover.jpg' },
    buttons: [{ name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'OK', id: '.ok' }) }]
  }
})
```

Anda juga bisa memberi `nativeFlowMessage: { messageParamsJson, … }` untuk menimpa/menambah parameter tingkat pesan.

### 11.6 Carousel

Mendukung dua mode kartu: **gambar biasa** dan **produk** (aktif bila kartu punya `productTitle`). Gambar dimuat dari **URL** (`imageUrl`).

```js
await sock.sendMessage(jid, {
  carouselMessage: {                         // boleh juga: carousel: {...}
    caption: 'Katalog hari ini',
    footer: 'Geser ke samping →',
    cards: [
      {
        imageUrl: 'https://…/produk1.jpg',
        headerTitle: 'Produk 1', headerSubtitle: 'Terlaris',
        bodyText: 'Deskripsi produk 1', footerText: 'Rp50.000',
        buttons: [
          { name: 'cta_url', params: { display_text: 'Lihat', url: 'https://example.com/1', merchant_url: 'https://example.com' } }
        ]
      },
      {
        // mode produk
        imageUrl: 'https://…/produk2.jpg',
        productTitle: 'Produk 2', productDescription: 'Deskripsi', productId: 'P2',
        currencyCode: 'IDR', priceAmount1000: '75000000', retailerId: 'TOKO', url: 'https://example.com/2',
        bodyText: 'Diskon 10%', footerText: 'Stok terbatas',
        buttons: [{ name: 'quick_reply', params: { display_text: 'Pesan', id: '.order 2' } }]
      }
    ]
  }
}, { quoted: m })
```

⚠️ Di carousel, tombol memakai **`params` (objek)** — handler yang mengubahnya jadi JSON. Ini berbeda dari `interactiveButtons`/`interactiveMessage` yang memakai `buttonParamsJson` (string).

### 11.7 Album (banyak foto/video dalam satu grup pesan)

Cara yang direkomendasikan — `sock.sendAlbumMessage(jid, medias, options)`:

```js
await sock.sendAlbumMessage(jid, [
  { image: { url: 'https://…/1.jpg' }, caption: 'Foto 1' },
  { image: { url: 'https://…/2.jpg' }, caption: 'Foto 2' },
  { video: { url: 'https://…/3.mp4' }, caption: 'Video 3' }
], { quoted: m, delay: 800 })
```

- Minimal **2 media** (kurang dari itu melempar `RangeError`), tiap item wajib punya `image` atau `video`.
- `delay` (ms, default 500) = jeda antar media.

Alternatif lewat `sendMessage` (handler hydra):

```js
await sock.sendMessage(jid, {
  albumMessage: [
    { image: { url: 'https://…/1.jpg' }, caption: 'Foto 1' },
    { image: { url: 'https://…/2.jpg' }, caption: 'Foto 2' }
  ]
}, { quoted: m })
```

Catatan: `handleAlbum` menempelkan banyak metadata tetap ke setiap media (lihat [15.6](#156-nilai-yang-di-hardcode)). `sendAlbumMessage` lebih bersih (hanya `messageSecret` dan `messageAssociation`).

### 11.8 Event (gaya hydra)

```js
await sock.sendMessage(jid, {
  eventMessage: {
    name: 'Meetup Bot Developer',
    description: 'Ngobrol soal WhatsApp bot',
    location: { degreesLatitude: -6.2, degreesLongitude: 106.816, name: 'Jakarta' },
    joinLink: '',
    startTime: Math.floor(Date.now() / 1000) + 3600,        // detik (Unix)
    endTime:   Math.floor(Date.now() / 1000) + 7200,
    extraGuestsAllowed: true,
    isCanceled: false
  }
}, { quoted: m })
```

Jika `startTime`/`endTime` tidak diisi, handler memakai `Date.now()` (milidetik) sebagai default, sedangkan jalur `event` standar memakai **detik**. Untuk hasil tanggal yang benar, isi sendiri dalam detik seperti contoh di atas, atau gunakan jalur standar ([10.6](#106-event-undangan-acara)).

### 11.9 Poll result (snapshot hasil polling)

```js
await sock.sendMessage(jid, {
  pollResultMessage: {
    name: 'Hasil voting: Makan apa?',
    pollVotes: [
      { optionName: 'Nasi goreng', optionVoteCount: 12 },
      { optionName: 'Mie ayam',    optionVoteCount: 8 }
    ],
    newsletter: {                           // ← WAJIB ada (kalau tidak, handler error)
      newsletterName: 'Kelvdra Channel',
      newsletterJid: '120363000000000000@newsletter'
    }
  }
}, { quoted: m })
```

### 11.10 Sticker pack

Lewat jalur standar (`stickerPack`), library memproses gambar → WebP, memaketkan ke ZIP, mengenkripsi, dan mengunggahnya.

```js
import fs from 'fs'

await sock.sendMessage(jid, {
  stickerPack: {
    name: 'Kelvdra Pack',
    publisher: 'Kelvdra',
    description: 'Paket stiker pertama',        // opsional
    cover: fs.readFileSync('cover.png'),        // atau { url } — ikon tray
    stickers: [
      { data: fs.readFileSync('s1.png'), emojis: ['😀'], accessibilityLabel: 'Senyum' },
      { data: { url: 'https://…/s2.webp' }, emojis: ['🔥'] }
    ]
  }
})
```

Batasan (dari kode): 1–**120** stiker, tiap stiker hasil WebP **≤ 1 MB** (yang lebih besar dilewati), total ZIP **≤ 10 MB**. Wajib memasang `sharp` (atau `jimp` sebagai cadangan; konversi WebP butuh `sharp`).

### 11.11 Status mention

`sock.sendStatusMentions(content, jids)` mengunggah status dan **menyebut** daftar JID (orang atau grup) sehingga mereka menerima notifikasi status.

```js
// Status gambar
await sock.sendStatusMentions(
  { image: { url: 'https://…/banner.jpg' }, caption: 'Halo semuanya!' },
  ['628123456789@s.whatsapp.net', '1203630000000000@g.us']
)

// Status teks (font 0–8, warna hex)
await sock.sendStatusMentions(
  { text: 'Selamat pagi', font: 2, textColor: '#FFFFFF', backgroundColor: '#128C7E' },
  ['628123456789@s.whatsapp.net']
)

// Status audio / voice note
await sock.sendStatusMentions(
  { audio: { url: 'vn.ogg' }, mimetype: 'audio/ogg; codecs=opus', ptt: true, backgroundColor: '#000000' },
  ['628123456789@s.whatsapp.net']
)
```

Perilaku dari kode:

- Untuk media, `text` otomatis dijadikan `caption`. Bila `font/textColor/backgroundColor` tidak diisi pada status teks, nilainya **acak**.
- Setiap JID target diberi pesan mention terpisah dengan **jeda 2 detik** — banyak target = lama.
- Untuk **grup**, anggota grup diambil dari `cachedGroupMetadata(id)` atau `global.groupMetadataCache(id)`. Karena default `cachedGroupMetadata` mengembalikan `undefined`, atur salah satunya, mis.:

  ```js
  global.groupMetadataCache = async (jid) => sock.groupMetadata(jid)
  ```

  Bila keduanya tidak tersedia, grup tersebut dilewati (error dicatat di log).
- Mengembalikan pesan status yang dibuat (`WAMessage`).

### 11.12 Handler yang hanya bisa dipanggil langsung

`sock.kelvdra` mengekspos seluruh method hydra. Dua handler berikut **tidak** ter-route dari `sendMessage`, tetapi dapat dipanggil manual (belum diuji ke WhatsApp):

```js
// Order message (dibuat dari katalog)
await sock.kelvdra.handleOrderMessage({
  orderMessage: {
    thumbnail: 'https://…/produk.jpg',        // URL (diunduh via axios) atau Buffer
    itemCount: 2,
    message: 'Pesanan Anda',
    orderTitle: 'Order #123',
    totalAmount1000: 150000000,
    totalCurrencyCode: 'IDR'
  }
}, jid, m)

// Status grup (groupStatusMessageV2)
await sock.kelvdra.handleGroupStory(
  { groupStatus: { image: { url: 'https://…/banner.jpg' }, caption: 'Pengumuman' } },
  '1203630000000000@g.us'
)
```

Ringkasan seluruh method `sock.kelvdra`:

| Method | Fungsi | Bisa dari `sendMessage`? |
|---|---|---|
| `detectType(content)` | Menentukan tipe hydra dari key `content` | (internal) |
| `handlePayment` | Payment request | ✅ `requestPaymentMessage` |
| `handleProduct` | Product + tombol | ✅ `productMessage` |
| `handleInteractive` | Interactive + media | ✅ `interactiveMessage` |
| `handleAlbum` | Album | ✅ `albumMessage` |
| `handleEvent` | Event | ✅ `eventMessage` |
| `handlePollResult` | Snapshot hasil poll | ✅ `pollResultMessage` |
| `handleCarousel` | Carousel | ✅ `carouselMessage` / `carousel` |
| `handleOrderMessage` | Order | ❌ panggil manual |
| `handleGroupStory` | Status grup | ❌ panggil manual |
| `handleStMention` | Status mention (versi lama) | ❌ **rusak**, pakai `sendStatusMentions` |
| `handleStickerPack` | Sticker pack | ❌ **rusak**, pakai `stickerPack` |

### 11.13 Custom Presence, MMG High-Res, dan Anti-Delay Upload

Tiga fitur tambahan. Semuanya aktif tanpa konfigurasi; perilaku lama tidak berubah.

#### Custom Presence

`sock.sendPresenceUpdate(type, jid)` tetap bekerja seperti biasa. Argumen ketiga (opsional) membuka opsi durasi dan urutan state:

```js
// Rekam voice note selama 3 detik, lalu otomatis paused
await sock.sendPresenceUpdate('recording', jid, { duration: 3000 })

// Urutan: merekam 2 detik, lalu mengetik. Durasi mengetik dihitung dari panjang teks
await sock.sendCustomPresence(jid, {
  steps: [
    { type: 'recording', duration: 2000 },
    { type: 'composing', text: 'halo kak, sebentar ya' }
  ],
  repeat: 1,          // ulangi seluruh steps
  finish: 'paused'    // 'paused' (default) | 'none'
})

// Jalan di background, hentikan kapan saja
const h = await sock.sendCustomPresence(jid, { type: 'composing', duration: 30000, wait: false })
await h.stop()          // atau: await sock.stopPresence(jid)
```

State yang ditahan lama dikirim ulang tiap 7 detik (`customPresence: { refreshEvery }`), dan sesi baru di chat yang sama menggantikan sesi lama tanpa mengirim `paused`.

**Batasan protokol:** WhatsApp hanya punya tiga state chat (`composing`, `recording`, `paused`). Tulisan "sedang mengetik..." / "merekam audio..." dirender oleh aplikasi penerima, jadi **teks label kustom tidak bisa dikirim**. Opsi `text` hanya dipakai untuk menghitung durasi mengetik yang wajar.

#### MMG High-Res

```js
// URL mmg.whatsapp.net dari sumber apa pun. Kalau sudah ada di server WA, tidak ada upload sama sekali
const url = await sock.getMmgUrl(buffer)                       // Buffer / path / URL / base64 / { url }
const same = await sock.getMmgUrl('/v/t62.7118-24/abc?oe=1')  // directPath -> URL, tanpa upload
const fromMsg = sock.toMmgUrl(m.message)                       // versi sinkron, dari pesan / objek media

// Bentuk yang dipakai builder: preview dan high-res otomatis sama-sama HD
const { imagePreviewUrl, imageHighResUrl, sourceUrl } = await sock.getMmgImageUrls(buffer)
const list = await sock.getMmgImageUrls([bufA, bufB])          // array -> array

// Kirim gambar HD
await sock.sendImageHd(jid, buffer, 'caption')
await sock.sendImageHd(jid, { url: 'https://…/foto.png' }, { caption: 'halo', viewOnce: true }, { quoted: m })
```

- Konten yang sama hanya di-upload sekali (cache berdasarkan SHA-256, 30 menit). `Toolkit.resolveMedia` di `MessageBuilder` (AIRich `addImage`, dll.) otomatis memakai cache ini.
- `sendImageHd(jid, image, content?, options?)` mengikuti pola `sendMessage`. `content` boleh string (jadi caption). Ia mengirim byte asli tanpa kompresi, mengisi `width`/`height` asli, mendeteksi mimetype (jpeg/png/webp/gif), dan membuat thumbnail inline lebih tajam (default 256px, kualitas 75; ubah lewat `thumbWidth` / `thumbQuality` di `content` atau `imageHd: {}` di config).
- URL hasil `getMmgUrl` berasal dari jalur upload mentah (tanpa enkripsi), jadi cocok untuk `imagePreviewUrl` / `imageHighResUrl`. URL media chat biasa hanya dinormalisasi, isinya tetap terenkripsi.

#### Anti-Delay Upload

`waUploadToServer` sekarang dibungkus: hasil upload di-cache, upload identik yang berjalan bersamaan digabung, gagal di semua host akan di-retry dengan exponential backoff (dan `media_conn` dipaksa refresh sebelum mencoba lagi), dan `media_conn` diambil di muka saat koneksi `open`.

```js
const sock = makeWASocket({
  uploadCache: { retries: 3, retryDelay: 400, retryMaxDelay: 4000, cacheTtl: 30 * 60_000, cacheMax: 500, prewarm: true }
  // uploadCache: false  -> matikan
})
sock.waUploadToServer.stats        // { hit, miss, deduped, retried, failed }
sock.waUploadToServer.clearCache()
```

Sekalian diperbaiki: sebelumnya kalau query `media_conn` pertama gagal, promise yang gagal itu menetap dan semua upload berikutnya ikut error sampai socket dibuat ulang. Sekarang state tersebut dibersihkan otomatis.

Catatan: media chat biasa dienkripsi dengan `mediaKey` acak, jadi kirim ulang gambar yang sama ke chat lain tetap upload ulang. Cache paling terasa untuk jalur upload mentah (`getMmgUrl`, AIRich, newsletter) dan untuk retry/kirim bersamaan.

Unit test: `node --test test/features.test.js` (butuh `npm install` dulu).

### 11.14 HTML di dalam pesan: `sendHTML`

Mengirim halaman HTML (lengkap dengan CSS dan JavaScript) sebagai pesan. Ada dua mode: HTML tampil langsung di dalam gelembung chat, atau gelembung "Klik Aku" yang membuka layar HTML.

```js
sock.sendHTML(jid, html, options?)
```

`html` boleh berupa `string` atau `Buffer`, dan tidak boleh kosong (kalau kosong akan melempar `TypeError`).

**Mode langsung** — HTML tampil di dalam pesan:

```js
await sock.sendHTML(ctx.chat, html, { text: 'Offline Sound Test' })
```

**Mode screen** — gelembung "Klik Aku" yang membuka layar HTML:

```js
await sock.sendHTML(ctx.chat, html, { screen: true, title: 'Popioo Whack' })
```

#### Opsi

| Opsi | Default | Keterangan |
|---|---|---|
| `text` | sama dengan `title` | Teks fallback gelembung chat (dipakai jika klien tidak bisa menampilkan HTML). |
| `title` | `'HTML'` | Mode screen: judul gelembung dan judul layar. Gelembung tampil sebagai `<title>: *Klik Aku*`. |
| `screen` | `false` | `true` = gelembung "Klik Aku" yang membuka layar HTML. `false` = tampil langsung. |
| `tabHeader` | `'HTML'` | Nama tab pada mode screen. |
| `trustedSources` | `[]` | Daftar sumber tepercaya yang diteruskan ke payload HTML. |
| `url` | — | Diteruskan ke payload HTML bila diisi. |
| `notification` | `true` | Kirim sebagai pesan dengan notifikasi. |
| `quoted`, `messageId`, dll. | — | Sisa opsi diteruskan ke pengiriman pesan (`AIRich.send`), misalnya `quoted` untuk membalas pesan. |

#### Contoh lengkap: Sound Test (offline)

Halaman berisi tombol beep, tombol LOW/MID/HIGH, slider frekuensi 100–2000 Hz, dan melodi sederhana. Semua suara dibuat dengan Web Audio API, tanpa file audio dan tanpa jaringan.

```js
const html = `
<style>
*{
  -webkit-tap-highlight-color:transparent;
  -webkit-user-select:none;
  user-select:none;
}
body{
  margin:0;
  background:transparent;
  font-family:Arial,sans-serif;
  color:#eee;
}
.box{
  width:100%;
  max-width:620px;
  margin:auto;
  padding:16px;
  box-sizing:border-box;
}
.card{
  background:rgba(255,255,255,.06);
  border:1px solid rgba(255,255,255,.15);
  border-radius:16px;
  padding:22px;
  box-sizing:border-box;
}
.title{
  font-size:22px;
  font-weight:bold;
  color:white;
}
.sub{
  font-size:12px;
  color:rgba(255,255,255,.5);
  margin-top:5px;
}
button{
  width:100%;
  border:0;
  border-radius:12px;
  padding:14px;
  margin-top:12px;
  font-size:15px;
  font-weight:bold;
  color:white;
  background:#6c5ce7;
  cursor:pointer;
}
button:active{
  transform:scale(.97);
}
.row{
  display:flex;
  gap:10px;
}
.row button{
  flex:1;
}
.status{
  margin-top:16px;
  text-align:center;
  font-size:12px;
  color:rgba(255,255,255,.55);
}
input{
  width:100%;
  box-sizing:border-box;
  margin-top:15px;
}
</style>

<div class="box">
  <div class="card">
    <div class="title">🔊 Sound Test</div>
    <div class="sub">Offline audio test</div>

    <button id="beep">TEST BEEP</button>

    <div class="row">
      <button id="low">LOW</button>
      <button id="mid">MID</button>
      <button id="high">HIGH</button>
    </div>

    <button id="melody">PLAY MELODY</button>

    <div style="margin-top:18px;font-size:12px;color:#aaa">
      Frequency:
      <span id="freqText">440 Hz</span>
    </div>

    <input
      id="freq"
      type="range"
      min="100"
      max="2000"
      value="440"
    >

    <div id="status" class="status">
      Ready — tekan tombol untuk mengeluarkan suara
    </div>
  </div>
</div>

<script>

let audioCtx = null;

function getAudio(){

  if(!audioCtx){
    audioCtx = new (
      window.AudioContext ||
      window.webkitAudioContext
    )();
  }

  if(audioCtx.state === 'suspended'){
    audioCtx.resume();
  }

  return audioCtx;
}

function playTone(
  freq,
  duration = 0.3,
  type = 'sine'
){

  const ctx = getAudio();

  const osc = ctx.createOscillator();
  const gain = ctx.createGain();

  osc.type = type;

  osc.frequency.setValueAtTime(
    freq,
    ctx.currentTime
  );

  gain.gain.setValueAtTime(
    0.0001,
    ctx.currentTime
  );

  gain.gain.exponentialRampToValueAtTime(
    0.35,
    ctx.currentTime + 0.02
  );

  gain.gain.exponentialRampToValueAtTime(
    0.0001,
    ctx.currentTime + duration
  );

  osc.connect(gain);
  gain.connect(ctx.destination);

  osc.start();

  osc.stop(
    ctx.currentTime +
    duration +
    0.05
  );

  document.getElementById(
    'status'
  ).textContent =
    'Playing ' + freq + ' Hz';
}

document.getElementById(
  'beep'
).onclick = function(){

  playTone(
    440,
    0.5,
    'sine'
  );

};

document.getElementById(
  'low'
).onclick = function(){

  playTone(
    220,
    0.5,
    'sine'
  );

};

document.getElementById(
  'mid'
).onclick = function(){

  playTone(
    440,
    0.5,
    'sine'
  );

};

document.getElementById(
  'high'
).onclick = function(){

  playTone(
    880,
    0.5,
    'sine'
  );

};

document.getElementById(
  'freq'
).oninput = function(){

  document.getElementById(
    'freqText'
  ).textContent =
    this.value + ' Hz';

};

document.getElementById(
  'freq'
).onchange = function(){

  playTone(
    Number(this.value),
    0.5,
    'sine'
  );

};

document.getElementById(
  'melody'
).onclick = async function(){

  const notes = [
    261.63,
    329.63,
    392.00,
    523.25,
    392.00,
    329.63,
    261.63
  ];

  document.getElementById(
    'status'
  ).textContent =
    'Playing melody...';

  for(
    let i = 0;
    i < notes.length;
    i++
  ){

    playTone(
      notes[i],
      0.22,
      'sine'
    );

    await new Promise(
      function(resolve){
        setTimeout(
          resolve,
          260
        );
      }
    );

  }

  document.getElementById(
    'status'
  ).textContent =
    'Melody selesai';

};

</script>
`;

// Mode langsung: HTML tampil di dalam pesan
await sock.sendHTML(ctx.chat, html, { text: 'Offline Sound Test' })

// Mode screen: gelembung "Klik Aku" yang membuka layar HTML
await sock.sendHTML(ctx.chat, html, { screen: true, title: 'Sound Test' })
```

#### Catatan batasan

Poin di bawah diambil dari pengecekan yang ada di `lib/Utils/html-app.js` (`checkHtmlApp`), jadi ikuti sebagai panduan saat menulis HTML:

- **Ukuran:** batas anggaran sekitar 960 KB setelah di-escape (karakter non-ASCII seperti emoji dan aksen membengkak jadi `\uXXXX`). Pesan di atas 1 MB dibuang klien penerima tanpa pesan error.
- **Tanpa jaringan:** `fetch`, XHR, `sendBeacon`, `EventSource`, dan resource remote (`src`/`href` ke `http(s)://`) tidak berfungsi. Sematkan gambar/font sebagai `data:` URI.
- **Tanpa storage:** `localStorage`, `sessionStorage`, `indexedDB`, `document.cookie`, dan `caches` melempar `SecurityError`.
- **`crypto.subtle`** tidak tersedia (bukan secure context).
- **Loop animasi/timer** (`requestAnimationFrame`, `setInterval`) sebaiknya dihentikan saat gelembung tidak terlihat (`document.hidden`, `visibilitychange`, atau `IntersectionObserver`), supaya tidak menguras baterai.
- **Tinggi:** sebaiknya tetapkan tinggi `html`/`body` secara eksplisit, atau panggil `AndroidBridge.updateSize`.

`sendHTML` sendiri tidak menjalankan pengecekan ini. Untuk memeriksa HTML sebelum dikirim, panggil `checkHtmlApp` yang sudah diekspor:

```js
import { checkHtmlApp } from '@kelvdra/baileys'

const { ok, problems, warnings, wireBytes } = checkHtmlApp(html)
if (!ok) console.log(problems)
```

Contoh Sound Test di atas hanya memakai Web Audio API, tanpa jaringan dan tanpa storage, jadi aman terhadap batasan tersebut. Karena tidak menetapkan tinggi, `checkHtmlApp` akan memberi *warning* soal tinggi.

---

## 12. API socket lainnya

### 12.1 Grup

| Fungsi | Keterangan |
|---|---|
| `groupCreate(subject, participants)` | Buat grup → `GroupMetadata` |
| `groupMetadata(jid)` | Ambil metadata (subject, desc, participants, …) |
| `groupFetchAllParticipating()` | Semua grup yang diikuti → `{ [jid]: metadata }` |
| `groupParticipantsUpdate(jid, [jid…], action)` | `action`: `'add' \| 'remove' \| 'promote' \| 'demote' \| 'modify'` |
| `groupUpdateSubject(jid, subject)` / `groupUpdateDescription(jid, desc?)` | Ubah nama / deskripsi |
| `groupSettingUpdate(jid, setting)` | `'announcement'` (hanya admin kirim), `'not_announcement'`, `'locked'` (hanya admin edit info), `'unlocked'` |
| `groupMemberAddMode(jid, mode)` | `'admin_add' \| 'all_member_add'` |
| `groupJoinApprovalMode(jid, 'on' \| 'off')` | Persetujuan admin |
| `groupRequestParticipantsList(jid)` / `groupRequestParticipantsUpdate(jid, [jid…], 'approve' \| 'reject')` | Permintaan bergabung |
| `groupInviteCode(jid)` / `groupRevokeInvite(jid)` | Ambil / reset kode undangan |
| `groupAcceptInvite(code)` / `groupGetInviteInfo(code)` | Gabung / lihat info dari kode |
| `groupAcceptInviteV4(key, inviteMessage)` / `groupRevokeInviteV4(groupJid, invitedJid)` | Undangan via pesan |
| `groupToggleEphemeral(jid, detik)` | Pesan sementara (0 = mati) |
| `groupLeave(jid)` | Keluar grup |

```js
const meta = await sock.groupMetadata(grupJid)
const admins = meta.participants.filter(p => p.admin).map(p => p.id)

await sock.groupParticipantsUpdate(grupJid, ['628123456789@s.whatsapp.net'], 'promote')
await sock.groupSettingUpdate(grupJid, 'announcement')

const kode = await sock.groupInviteCode(grupJid)
console.log('https://chat.whatsapp.com/' + kode)
```

### 12.2 Komunitas

Setara fungsi grup, berawalan `community…`: `communityCreate(subject, body)`, `communityCreateGroup(subject, participants, parentCommunityJid)`, `communityMetadata`, `communityFetchAllParticipating`, `communityFetchLinkedGroups`, `communityLinkGroup(groupJid, parentCommunityJid)`, `communityUnlinkGroup`, `communityParticipantsUpdate`, `communityUpdateSubject`, `communityUpdateDescription`, `communityInviteCode`, `communityRevokeInvite`, `communityAcceptInvite`, `communityGetInviteInfo`, `communitySettingUpdate`, `communityMemberAddMode`, `communityJoinApprovalMode`, `communityToggleEphemeral`, `communityLeave`, `communityRequestParticipantsList/Update`, `communityAcceptInviteV4`, `communityRevokeInviteV4`.

### 12.3 Newsletter / Channel

```js
const ch = await sock.newsletterCreate('Channel Kelvdra', 'Update rilis terbaru')
await sock.newsletterFollow('120363000000000000@newsletter')
await sock.newsletterMute(jid)      // newsletterUnmute
await sock.newsletterUpdateName(jid, 'Nama baru')
await sock.newsletterUpdateDescription(jid, 'Deskripsi baru')
await sock.newsletterUpdatePicture(jid, fs.readFileSync('logo.jpg'))
await sock.newsletterReactMessage(jid, serverId, '🔥')
const info = await sock.newsletterMetadata('invite', 'KODEUNDANGAN')   // atau ('jid', '…@newsletter')
const pesan = await sock.newsletterFetchMessages(jid, 20, 0, 0)

// Kirim ke channel = sendMessage biasa ke JID @newsletter
await sock.sendMessage('120363000000000000@newsletter', { text: 'Pengumuman!' })
```

Fungsi lain: `newsletterSubscribers`, `newsletterAdminCount`, `newsletterChangeOwner`, `newsletterDemote`, `newsletterDelete`, `newsletterRemovePicture`, `newsletterUpdate`, `subscribeNewsletterUpdates`.

### 12.4 Profil, presence, dan privasi

```js
await sock.updateProfileName('Kelvdra Bot')
await sock.updateProfileStatus('Online 24 jam')
await sock.updateProfilePicture(sock.user.id, fs.readFileSync('foto.jpg'))
await sock.removeProfilePicture(sock.user.id)

const foto   = await sock.profilePictureUrl(jid, 'image')      // atau 'preview'
const status = await sock.fetchStatus(jid)
const [cek]  = await sock.onWhatsApp('628123456789')            // { jid, exists }
const bisnis = await sock.getBusinessProfile(jid)
const blok   = await sock.fetchBlocklist()
await sock.updateBlockStatus(jid, 'block')                       // 'unblock'
```

Privasi (`WAPrivacyValue = 'all' | 'contacts' | 'contact_blacklist' | 'none'`):

```js
await sock.updateLastSeenPrivacy('contacts')
await sock.updateProfilePicturePrivacy('all')
await sock.updateStatusPrivacy('contacts')
await sock.updateOnlinePrivacy('match_last_seen')      // 'all' | 'match_last_seen'
await sock.updateReadReceiptsPrivacy('none')           // 'all' | 'none'
await sock.updateGroupsAddPrivacy('contacts')          // 'all' | 'contacts' | 'contact_blacklist'
await sock.updateCallPrivacy('known')                  // 'all' | 'known'
await sock.updateMessagesPrivacy('contacts')           // 'all' | 'contacts'
await sock.updateDisableLinkPreviewsPrivacy(true)
await sock.updateDefaultDisappearingMode(86400)
const privasi = await sock.fetchPrivacySettings(true)
```

### 12.5 `chatModify`, label, kontak

```js
const lastMsg = [{ key: m.key, messageTimestamp: m.messageTimestamp }]

await sock.chatModify({ archive: true,  lastMessages: lastMsg }, jid)
await sock.chatModify({ pin: true }, jid)
await sock.chatModify({ mute: Date.now() + 8 * 3600 * 1000 }, jid)   // mute 8 jam; null = unmute
await sock.chatModify({ markRead: true, lastMessages: lastMsg }, jid)
await sock.chatModify({ clear: true }, jid)
await sock.chatModify({ delete: true, lastMessages: lastMsg }, jid)
await sock.chatModify({ star: { messages: [{ id: m.key.id, fromMe: m.key.fromMe }], star: true } }, jid)

await sock.addChatLabel(jid, labelId)       // removeChatLabel
await sock.addMessageLabel(jid, m.key.id, labelId)
await sock.addOrEditContact(jid, { fullName: 'Nama Kontak' })
await sock.removeContact(jid)
await sock.star(jid, [{ id: m.key.id, fromMe: false }], true)
```

Fitur bisnis: `getCatalog`, `getCollections`, `productCreate`, `productUpdate`, `productDelete`, `getOrderDetails`, `updateBussinesProfile`, `updateCoverPhoto`, `removeCoverPhoto`, `addOrEditQuickReply`, `removeQuickReply`.

### 12.6 Level rendah

`sock.relayMessage(jid, proto.IMessage, { messageId, additionalNodes, statusJidList, … })`, `sock.query(node)`, `sock.sendNode(node)`, `sock.sendReceipt(s)`, `sock.assertSessions(jids)`, `sock.waUploadToServer`, `sock.executeUSyncQuery`, `sock.waitForMessage(id)`, `sock.waitForConnectionUpdate(check)`, `sock.end(err)`, `sock.logout()`, `sock.user`, `sock.ws`, `sock.authState`, `sock.signalRepository`.

---

## 13. Media, auth, store, dan helper

### 13.1 Mengunduh media

```js
import { downloadMediaMessage, getContentType, extractMessageContent } from '@kelvdra/baileys'
import pino from 'pino'

const content = extractMessageContent(m.message)
const type = getContentType(content)     // 'imageMessage' | 'videoMessage' | 'audioMessage' | 'documentMessage' | 'stickerMessage'

if (['imageMessage', 'videoMessage', 'audioMessage', 'documentMessage', 'stickerMessage'].includes(type)) {
  const buffer = await downloadMediaMessage(
    m, 'buffer', {},
    { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage }
  )
  fs.writeFileSync('hasil.bin', buffer)
}
```

Argumen ke-2: `'buffer'` atau `'stream'`. `reuploadRequest` dipakai jika media sudah kedaluwarsa di server WhatsApp.

Media dari pesan yang di-reply:

```js
const quotedMsg = content?.[type]?.contextInfo?.quotedMessage
if (quotedMsg) {
  const fake = { key: { remoteJid: m.key.remoteJid, id: content[type].contextInfo.stanzaId }, message: quotedMsg }
  const buf = await downloadMediaMessage(fake, 'buffer', {}, { logger: pino({ level: 'silent' }), reuploadRequest: sock.updateMediaMessage })
}
```

### 13.2 Auth state & penyimpanan

```js
const { state, saveCreds } = await useMultiFileAuthState('session')   // simpan ke folder
```

- `useMultiFileAuthState` menulis banyak file kecil; cocok untuk satu-dua sesi. Untuk banyak sesi/produksi, buat auth state sendiri (database) berdasar antarmuka `{ creds, keys: { get, set } }`.
- `makeCacheableSignalKeyStore(state.keys, logger)` menambah cache di memori untuk kunci Signal (mengurangi baca disk).
- `makeCacheManagerAuthState` (paket `cache-manager`) tersedia di `Store/`.

### 13.3 Store pesan

⚠️ `makeInMemoryStore` **tidak bisa dipakai di build ini**. Saat saya panggil, ia melempar error (`require is not defined in ES module scope`, dan tanpa `logger` juga `Defaults_1 is not defined`). Penyebabnya: file `Store/make-in-memory-store.js` masih memakai `require('@adiwajshing/keyed-db')` di dalam modul ESM, dan paket itu tidak ada di `dependencies` (lihat [15.2](#152-makeinmemorystore-tidak-berfungsi)).

Kebutuhan paling umum dari store adalah `getMessage` untuk retry/dekripsi ulang. Penggantinya bisa berupa cache sederhana buatan sendiri:

```js
const msgStore = new Map()                       // key: "jid:id" → proto.IMessage
const MAX = 5000

sock.ev.on('messages.upsert', ({ messages }) => {
  for (const m of messages) {
    if (!m.key?.id || !m.message) continue
    msgStore.set(`${m.key.remoteJid}:${m.key.id}`, m.message)
    if (msgStore.size > MAX) msgStore.delete(msgStore.keys().next().value)   // buang yang terlama
  }
})

// saat membuat socket:
// makeWASocket({ …, getMessage: async (key) => msgStore.get(`${key.remoteJid}:${key.id}`) })
```

Untuk cache metadata grup (mempercepat kirim ke grup), pakai `cachedGroupMetadata`:

```js
import NodeCache from '@cacheable/node-cache'
const groupCache = new NodeCache({ stdTTL: 300, useClones: false })

sock.ev.on('groups.update', async ([ev]) => {
  const meta = await sock.groupMetadata(ev.id); groupCache.set(ev.id, meta)
})
sock.ev.on('group-participants.update', async (ev) => {
  const meta = await sock.groupMetadata(ev.id); groupCache.set(ev.id, meta)
})
// makeWASocket({ …, cachedGroupMetadata: async (jid) => groupCache.get(jid) })
```

`makeCacheManagerAuthState` (berbasis `cache-manager`) juga diekspor dari `Store/`, tetapi belum saya uji.

### 13.4 Helper yang diekspor

Seluruh `lib/Utils`, `lib/WABinary`, `lib/Defaults`, `lib/Store`, `lib/Types`, `lib/WAUSync`, dan `WAProto` di-export dari entry point. Yang paling sering dipakai:

| Kelompok | Nama |
|---|---|
| Koneksi | `makeWASocket` (default), `DisconnectReason`, `Browsers`, `fetchLatestWaWebVersion`, `fetchLatestBaileysVersion`, `S_WHATSAPP_NET` |
| Auth | `useMultiFileAuthState`, `makeCacheableSignalKeyStore`, `initAuthCreds`, `BufferJSON` |
| JID | `jidNormalizedUser`, `jidDecode`, `jidEncode`, `isJidGroup`, `isJidNewsletter`, `isJidStatusBroadcast`, `isLidUser`, `isPnUser`, `areJidsSameUser` |
| Pesan | `proto`, `getContentType`, `extractMessageContent`, `normalizeMessageContent`, `generateWAMessage`, `generateWAMessageContent`, `generateWAMessageFromContent`, `generateForwardMessageContent`, `generateMessageID` / `generateMessageIDV2`, `prepareWAMessageMedia` |
| Media | `downloadMediaMessage`, `downloadContentFromMessage`, `getAudioDuration`, `getAudioWaveform`, `encryptedStream` |
| Umum | `delay`, `unixTimestampSeconds`, `Boom` (dari `@hapi/boom`) |

---

## 14. Contoh pola bot dengan plugin

Pola sederhana: satu handler `messages.upsert` yang memuat semua plugin dari folder `plugins/`.

**`plugins/ping.js`**

```js
export default {
  name: 'ping',
  cmd: ['ping', 'p'],
  async run({ sock, m, from }) {
    await sock.sendMessage(from, { text: 'pong 🏓' }, { quoted: m })
  }
}
```

**`plugins/menu.js`** — memakai fitur khusus Kelvdra

```js
export default {
  name: 'menu',
  cmd: ['menu'],
  async run({ sock, m, from }) {
    await sock.sendMessage(from, {
      text: 'Pilih menu',
      footer: '© Kelvdra Bot',
      interactiveButtons: [
        { name: 'quick_reply', buttonParamsJson: JSON.stringify({ display_text: 'Ping', id: '.ping' }) },
        { name: 'cta_url', buttonParamsJson: JSON.stringify({ display_text: 'Channel', url: 'https://t.me/kelvdraa' }) }
      ]
    }, { quoted: m })
  }
}
```

**`handler.js`**

```js
import fs from 'fs'
import path from 'path'
import { pathToFileURL } from 'url'
import { parseMessage } from './parse.js'        // fungsi dari bagian 8.2

const plugins = []
for (const file of fs.readdirSync('./plugins').filter(f => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(path.resolve('plugins', file)).href)
  plugins.push(mod.default)
}

const PREFIX = '.'

export async function handleMessage(sock, m) {
  if (!m.message || m.key.fromMe) return
  const { body, from, isGroup, sender } = parseMessage(sock, m)
  if (!body.startsWith(PREFIX)) return

  const [command, ...args] = body.slice(PREFIX.length).trim().split(/\s+/)
  const plugin = plugins.find(p => p.cmd.includes(command.toLowerCase()))
  if (!plugin) return

  try {
    await plugin.run({ sock, m, from, isGroup, sender, args, text: args.join(' ') })
  } catch (err) {
    console.error(`[plugin:${plugin.name}]`, err)
    await sock.sendMessage(from, { text: 'Terjadi kesalahan saat menjalankan perintah.' }, { quoted: m })
  }
}
```

**Menghubungkan ke socket**

```js
import { handleMessage } from './handler.js'

sock.ev.on('messages.upsert', async ({ messages, type }) => {
  if (type !== 'notify') return
  for (const m of messages) handleMessage(sock, m).catch(console.error)
})
```

---

## 15. Masalah yang diketahui & saran perbaikan

Semua poin di bawah ditemukan dari pembacaan kode dan uji offline. Yang bertanda ✅ sudah saya buktikan dengan menjalankan kodenya; sisanya berdasarkan pembacaan.

### 15.1 ✅ SUDAH DIPERBAIKI — dependensi yang tadinya hilang

`chalk` dan `axios` sekarang sudah ada di `dependencies` pada `package.json` versi ini. Lihat [2.1](#21--chalk-dan-axios--sudah-diperbaiki).

Masih relevan untuk dipertimbangkan: membuat banner di `lib/index.js` opsional (mis. hanya tampil bila `process.env.KELVDRA_BANNER !== '0'`), karena saat ini selalu tercetak setiap kali library di-`import`.

### 15.2 ✅ SUDAH DIPERBAIKI — `makeInMemoryStore` sekarang berfungsi

Sebelumnya `Store/make-in-memory-store.js` memakai `require('@adiwajshing/keyed-db')` di dalam modul ESM (→ `ReferenceError: require is not defined`) dan bergantung pada paket eksternal yang tidak ada di `dependencies`.

**Di versi ini sudah diganti** menjadi `import { KeyedDB } from './keyed-db.js'` — implementasi `keyed-db` sekarang dibundel langsung di dalam `lib/Store/`, jadi tidak lagi bergantung pada paket luar dan tidak akan gagal di-`import`. `makeInMemoryStore` bisa dipakai langsung tanpa workaround.

### 15.3 Handler yang tidak ter-route

`detectType` mengenali `statusMentionMessage`, `orderMessage`, `groupStatus`, dan `stickerPack`, tetapi `switch` di `sendMessage` tidak punya `case` untuk keempatnya.

- ✅ `orderMessage` / `groupStatus` / `statusMentionMessage` lewat `sendMessage` jatuh ke jalur standar dan gagal dengan **`Invalid media type`**.
- `stickerPack` tetap berfungsi karena jalur standar mendukungnya ([11.10](#1110-sticker-pack)).
- ✅ `handleStickerPack` memanggil `utils.prepareStickerPackMessage`, yang **tidak ada** → `TypeError`. Gunakan `stickerPack` standar.
- `handleStMention` berisi bug (`media` tidak dideklarasikan, `mediaType` adalah `const` yang diubah, `target` tidak terdefinisi, dan `this.user` tidak ada di kelas `hydra`) sehingga akan error. Gunakan `sendStatusMentions`.

Usulan untuk meroute dua yang berguna, di `switch` pada `messages-send.js`:

```js
case 'ORDER':
    return await kelvdra.handleOrderMessage(content, jid, quoted);
case 'GROUP_STATUS':
    return await kelvdra.handleGroupStory(content, jid, quoted);
```

### 15.4 `handlePollResult` wajib `newsletter`

✅ Tanpa `pollResultMessage.newsletter`, handler melempar `TypeError: Cannot read properties of undefined (reading 'newsletterName')`. Selain itu nilai *default* `newsletterName` dan `newsletterJid` tertukar (nama diisi JID, JID diisi "Newsletter"). Usulan: `pollData.newsletter?.newsletterName ?? 'Newsletter'` dan `pollData.newsletter?.newsletterJid ?? ''`.

### 15.5 Perbaikan kecil di `sendStatusMentions`

Fungsi ini memakai `link_preview_1.getUrlInfo` dan `axiosOptions` yang tidak terdefinisi di file tersebut. Efeknya kecil (error tertangkap dan link preview pada status teks dilewati), tetapi mudah diperbaiki:

```js
getUrlInfo: text => getUrlInfo(text, {
    thumbnailWidth: linkPreviewImageThumbnailWidth,
    fetchOpts: { timeout: 3000, ...(httpRequestOptions || {}) },
    logger,
    uploadImage: generateHighQualityLinkPreview ? waUploadToServer : undefined
}),
```

Untuk grup, fungsi ini juga bergantung pada `global.groupMetadataCache` bila `cachedGroupMetadata` kosong ([11.11](#1111-status-mention)).

### 15.6 Nilai yang di-hardcode

Beberapa handler menempelkan nilai tetap yang akan terlihat oleh penerima atau ikut terkirim. Sebaiknya Anda tinjau apakah memang dikehendaki:

| Handler | Nilai tetap |
|---|---|
| `handleAlbum` | `forwardingScore: 99999`, `isForwarded: true`, `starred`, `labels`, `disappearingMode` dengan semua flag `initiatedBy…: true`, info newsletter `newsletterName: "WhatsApp"`, `senderName: "7-Yuukey"`, `mentionedJid: [jid]` |
| `handleEvent` | Info newsletter `"D \| 7eppeli-Exloration"` dengan JID `120363421563597486@newsletter`, `mentionedJid: [jid]`, `supportPayload` (`is_ai_message: true`) |
| `handleOrderMessage` | `orderId: "7EPPELI25022008"`, `token: "7EPPELI_EXAMPLE_TOKEN"`, `sellerJid: "0@whatsapp.net"`, `status: "ACCEPTED"` |
| `handleProduct` / `handleCarousel` | `businessOwnerJid: "0@s.whatsapp.net"`, beberapa default seperti `productId: "123456"`, `retailerId: "Retailer"` |

Metadata "diteruskan dari channel" atau info bisnis yang tidak sesuai kenyataan dapat terlihat janggal bagi penerima, dan pola pesan yang tidak wajar berisiko menarik tindakan dari WhatsApp terhadap akun. Untuk penggunaan biasa, `sendAlbumMessage` dan jalur standar (`event`, `product`, `payment`) lebih aman karena tidak menambahkan atribut tersebut.

### 15.7 Catatan kecil lain

- **Tipe TypeScript** (`.d.ts`) belum mencakup `sendStatusMentions`, `sendAlbumMessage`, `kelvdra`, serta key `carouselMessage`, `interactiveMessage`, `productMessage`, dst. Pengguna TS perlu casting (`(sock as any).sendStatusMentions(…)`) atau tambahan deklarasi.
- **Tipe tanpa implementasi:** `Types/Message.d.ts` mendeklarasikan `shop`, `cards`, `order`, `pollResult`, `keep`, `call`, `adminInvite`, `paymentInvite`, tetapi tidak ada handler-nya di `generateWAMessageContent` (memakai key itu berujung `Invalid media type`). Untuk carousel dan poll result gunakan gaya hydra; untuk order gunakan `handleOrderMessage` manual.
- **`collection`:** kondisi footer terbalik (`'footer' in message && !message.footer`), sehingga `footer` yang Anda isi tidak pernah dipakai. Seharusnya `!!message.footer`.
- **`templateButtons`:** cabangnya baru aktif bila `message` memiliki key `template` (bukan hanya `templateButtons`), dan pada varian media terdapat `Object.assign(msg, m)` dengan `msg` yang tidak terdefinisi. Anggap fitur ini eksperimental; ✅ dengan `template: true` + `text`, uji offline menghasilkan `templateMessage`.
- **`interactiveButtons` + media:** implementasi menempelkan objek media ke dalam `interactiveMessage` dan ke `header` dengan `Object.assign`. Cara ini lazim di banyak fork, tetapi sebaiknya diuji di perangkat penerima.
- **`README.md`** memakai `printQRInTerminal: true` yang sudah tidak berfungsi ([2.2](#22-printqrinterminal-sudah-tidak-berfungsi)).
- **`package.json`**: `homepage` dan `repository` masih menunjuk ke `WhiskeySockets/Baileys`.

### 15.8 `catch {}` kosong di jalur auth state

Beberapa `catch` di jalur baca/tulis auth state tidak melakukan apa-apa, sehingga kegagalan baca/tulis sesi tidak pernah muncul di log:

- `useMultiFileAuthState` (`readData`, `removeData`) dan `useNekoDBAuth` (`readData`, `removeData`, `clearAuth`) sekarang menerima parameter `logger` opsional (default: logger internal Baileys) dan akan `logger.warn(...)` bila terjadi error nyata. Untuk `readData` di `useMultiFileAuthState`, error `ENOENT` (file memang belum ada, mis. login pertama) sengaja tidak dianggap sebagai kegagalan dan tidak di-log — hanya error lain (file corrupt, permission, dsb.) yang dicatat.
- `socket.js` (penutupan WebSocket saat koneksi berakhir) sekarang juga mencatat `logger.warn` bila `ws.close()` gagal, alih-alih diam.
- Ini bukan seluruh empty-catch di repo — sisanya ada di kode VoIP (`lib/VoIP/*`) yang authored terpisah, dan di dua file vendor (`lib/assets/wasm/worker-modules.js`, `loader.js`) yang merupakan bundle minified WhatsApp Web sendiri untuk WASM VoIP, bukan kode yang ditulis di repo ini.

Kalau pakai versi lama fork ini, cukup teruskan `logger` yang sama dengan yang dipakai `makeWASocket({ logger })` ke `useMultiFileAuthState(folder, logger)` / `useNekoDBAuth(db, collectionName, logger)` untuk dapat log ini.

### 15.9 `rich-messages.js`: V1 vs V2 tidak terdokumentasi

`generateTableContent`/`V2`, `generateCodeBlockContent`/`V2`, `generateLinkContent`/`V2`, dan `tokenizeCode`/`V2` sengaja dibuat paralel (keduanya dipakai, bukan dead code — kecuali `sendTable` yang **tidak** di-expose di `sock`, hanya `sendTableV2`), tapi sebelumnya tidak ada komentar/README yang menjelaskan bedanya. Sekarang sudah ditambahkan JSDoc di `rich-messages.js`/`.d.ts`; ringkasnya:

| | V1 (`generateXContent`) | V2 (`generateXContentV2`) |
|---|---|---|
| Format payload | `richResponseMessage.submessages` klasik (`messageType` 2/4/5, `tableMetadata`/`codeMetadata`) | `richResponseMessage.unifiedResponse.data`: JSON `sections` ber-`GenAI*UXPrimitive` yang di-base64 |
| Bot JID yang dipakai | `867051314767696@bot` | `259786046210223@bot` |
| Expose di `sock` | `sendCodeBlock`, `sendLink` (⚠️ `sendTable` **tidak ada**) | `sendTableV2`, `sendCodeBlockV2`, `sendLinkV2` |

Karena rendering di sisi client WhatsApp bisa berbeda tergantung versi app/persona bot yang ditiru, kalau salah satu tidak tampil dengan benar di device tujuan, coba versi satunya.

---

## 16. Tips performa

- Set `syncFullHistory: false`. Default library adalah `true`, sehingga saat pertama tersambung socket mengunduh dan memproses riwayat besar.
- Isi `cachedGroupMetadata` dengan cache TTL beberapa menit ([13.3](#133-store-pesan)) agar tiap kirim ke grup tidak memicu query metadata.
- Gunakan `makeCacheableSignalKeyStore(state.keys, logger)` untuk mengurangi baca/tulis disk kunci Signal.
- Pakai `sock.ev.process(...)` atau handler `messages.upsert` yang tidak memblokir; jalankan tugas berat (unduh, konversi, panggilan API) tanpa `await` berantai di handler utama, dan beri batas waktu.
- Jangan `await` tugas panjang di dalam loop `for (const m of messages)`; proses paralel dengan batas (mis. `p-queue`, sudah menjadi dependensi library ini).
- Pakai `logger` level `silent`/`warn` di produksi; level `debug` sangat berisik.
- Pertimbangkan `markOnlineOnConnect: false` bila akun bot juga dipakai di HP.
- Untuk banyak sesi, jangan gunakan `useMultiFileAuthState` (banyak file kecil); simpan kredensial dan kunci di database.
- Beri jeda antar pesan massal (mis. `await delay(1000–3000)`) dan hindari kirim beruntun ke banyak nomor; ini juga mengurangi risiko pembatasan akun.

---

## 17. Penafian

Proyek ini tidak berafiliasi, disponsori, atau didukung oleh WhatsApp maupun Meta. Gunakan dengan tanggung jawab dan patuhi Ketentuan Layanan WhatsApp; penggunaan untuk spam, penipuan, atau pelecehan dapat menyebabkan akun diblokir. Baileys adalah proyek komunitas dan protokol WhatsApp dapat berubah sewaktu-waktu, sehingga sebagian fitur dapat berhenti berfungsi tanpa pemberitahuan.

Kontak & dukungan pengembang: Channel Telegram [t.me/kelvdraa](https://t.me/kelvdraa).


## Anti-Sequence, Lite Store & LID Resolver

### Humanize (jitter delay + typing presence) — opt-in
```js
const sock = makeWASocket({ /* ... */ humanize: true })                          // 0.8–2.3 dtk + presence composing
const sock = makeWASocket({ humanize: { minDelay: 1000, maxDelay: 3000, perCharMs: 20 } })
await sock.sendMessage(jid, { text: 'cepat' }, { humanize: false })              // lewati untuk satu pesan
sock.humanize.enabled = false                                                    // matikan saat runtime
```
Pesan ke chat yang sama dikirim berurutan (urutan terjaga). React, delete, status, dan newsletter tidak di-delay.

### Lite Store (anti memory leak)
```js
import { makeLiteStore, memoryBackend, sqliteBackend, redisBackend } from '@kelvdra/baileys'
const store = makeLiteStore({ backend: await sqliteBackend({ path: './store.db' }) }) // atau memoryBackend({ max: 5000 }) / redisBackend({ url })
store.bind(sock.ev)
const sock = makeWASocket({ getMessage: store.getMessage })
```
Semua data punya TTL dan batas ukuran. Menyimpan pesan, kontak, dan metadata grup (bukan daftar chat penuh).
`better-sqlite3` / `ioredis` opsional (peer dependency).

### LID → JID resolver — aktif otomatis (`jidResolver: false` untuk mematikan)
```js
const jid = await sock.getRealJid(m.key.participant, { groupJid: m.key.remoteJid, message: m })  // null jika tidak ketemu
const lid = await sock.getLidForJid('62812xxxx@s.whatsapp.net')
```

### Perbaikan
- `makeInMemoryStore` sebelumnya error di mode ESM (`require`, `Defaults_1`, `Utils_1`, dll tidak terdefinisi, dan butuh `@adiwajshing/keyed-db` yang tidak ada di dependencies). Sekarang memakai `KeyedDB` lokal (`lib/Store/keyed-db.js`) tanpa dependency tambahan.
- Store baru punya batas pesan per chat: `makeInMemoryStore({ maxMessagesPerChat: 500 })` (default 500, `0` = tanpa batas).
- `contacts.update` untuk kontak yang tidak dikenal tidak lagi menghentikan update kontak berikutnya di batch yang sama.
