# Perubahan: Fitur Status Newsletter (diadaptasi dari Elaina Baileys)

## File baru
- `lib/Utils/newsletter-status.js` + `.d.ts` — inti fitur: build/parse node XMPP `<status>` untuk newsletter, kirim, react, revoke, fetch.
- `lib/Utils/modern-messages.js` + `.d.ts` — dependency: `prepareModernMessageContent()`, pre-processor konten "modern" (newsletterStatus, question, statusAudience, addYours, comment, dll). Konten lama (text/image/video/dst) tetap lewat apa adanya — tidak mengubah perilaku `sendMessage` yang lama.

## File yang diedit
- `lib/Socket/index.js` / `.d.ts`
  - `sock.sendMessage` dibungkus `prepareModernMessageContent`.
  - Ditambah: `sock.sendNewsletterStatus`, `sock.sendNewsletterStatusReaction`, `sock.revokeNewsletterStatus`, `sock.getNewsletterStatuses`, `sock.getNewsletterStatusUpdates`.
- `lib/Socket/newsletter.js` / `.d.ts`
  - Ditambah: `newsletterMyAddOns`, `newsletterStatusMyAddOns`, `newsletterCanPostStatus`.
- `lib/Types/Mex.js`
  - Ditambah `QueryIds.ADMIN_CAPABILITIES` dan `XWAPaths.xwa2_newsletter_admin_capabilities` (dipakai `newsletterCanPostStatus`).
- `lib/Utils/index.js` / `.d.ts`
  - Barrel export ditambah untuk 2 file baru di atas.
- `WAProto/` (index.js, index.d.ts)
  - **Diganti ke versi lebih baru (dari Elaina Baileys)** karena skema proto lama Kelvdra belum punya field yang dibutuhkan fitur ini: `newsletterAdminProfileStatusMessage`, `StatusAttribution.Type.NEWSLETTER_STATUS`, `EventInviteMessage`, `PollAddOptionMessage`, dll. Versi baru ini adalah **superset** — semua class/field lama (596 vs 498 class) masih ada, jadi seharusnya tidak breaking untuk kode lain. `WAProto.proto` (source .proto) dihapus karena tidak tersedia dari Elaina dan sudah tidak sinkron dengan index.js yang baru — kalau butuh regenerate proto, pakai skema terbaru dari upstream.
  - Backup WAProto lama Kelvdra ada di luar paket ini (sempat dibackup di sandbox, hubungi lagi kalau perlu dikirim ulang).
- `package.json`
  - `protobufjs` dinaikkan dari `^7.2.4` ke `^7.5.6` mengikuti skema proto baru.

## Cara pakai (contoh)
```js
// Posting status teks ke channel/newsletter (harus admin channel tsb)
await sock.sendNewsletterStatus('120363xxxxxxxxx@newsletter', { text: 'Halo dari status channel!' })

// Posting status gambar
await sock.sendNewsletterStatus(jid, { image: { url: './foto.jpg' }, caption: 'Caption' })

// Cek dulu apakah akun ini boleh posting status di channel tsb
const { canPost } = await sock.newsletterCanPostStatus(jid)

// React ke status (parentServerId didapat dari getNewsletterStatuses / event)
await sock.sendNewsletterStatusReaction(jid, parentServerId, '❤️')

// Revoke/hapus status yang sudah diposting
await sock.revokeNewsletterStatus(jid, statusId)

// Ambil daftar status yang lagi tayang di suatu channel
const { statuses } = await sock.getNewsletterStatuses(jid)
```

## Tahap 3 — Bugfix wiring + fitur `getFunc()` / `getSocketFunc()`

### Bugfix (ditemukan saat mengerjakan tahap 3)
- **`lib/MessageBuilder/` (hasil porting Tahap 2) ternyata belum di-wire ke barrel manapun** — jadi sebelumnya benar-benar tidak bisa diakses sama sekali dari luar. Sudah diperbaiki di `lib/index.js` / `.d.ts`.
- Kelvdra kamu **sudah punya** `Button, ButtonV2, Carousel, AIRich, Toolkit, VERSION` sendiri di `lib/Modded/message_builder.js` (sudah aktif dari awal). Karena nama-nama itu identik dengan yang ada di `MessageBuilder/index.js` hasil porting Elaina, supaya tidak bentrok/menimpa punya Kelvdra:
  - `MessageBuilder/index.js` (Elaina) di-export dengan **namespace terpisah**: `import { ElainaMessageBuilder } from '@kelvdra/baileys'` — punya Kelvdra sendiri (`Button`, `Carousel`, dst secara flat) tetap jadi default, tidak diubah.
  - `MessageBuilder/extras.js`, `metaai.js`, `bot-signature.js` (total ~130 fungsi: Bloks A2UI, Meta AI section builder, bot signature verifier) **tidak bentrok nama** dengan apa pun di Kelvdra, jadi langsung di-export flat seperti biasa.

### Fitur baru: `getFunc()` & `getSocketFunc()`
File baru: `lib/Utils/function-explorer.js` + `.d.ts`.

```js
import { getFunc, getSocketFunc } from '@kelvdra/baileys'

// 1) Semua function "statis" (tidak butuh koneksi WhatsApp) — rich message,
//    message builder, auth-state, store, dll. Auto-scan langsung dari isi
//    package (bukan daftar manual yang bisa basi), jadi selalu akurat.
await getFunc()                               // cetak semua ke console + return array-nya
await getFunc({ category: 'message-builder' }) // filter per kategori
await getFunc({ search: 'newsletter' })        // cari berdasar nama
await getFunc({ silent: true })                // cuma return array, tidak print

// 2) Function yang nempel di `sock` (butuh sock aktif dari makeWASocket()) —
//    sendMessage, sendNewsletterStatus, groupCreate, newsletterFollow, dst.
const sock = makeWASocket({ ... })
getSocketFunc(sock)
getSocketFunc(sock, { search: 'newsletter' })
```

Setiap entri hasil `getFunc`/`getSocketFunc` berisi: `name`, `category`, `file` (lokasi source), `kind` (function/async function/class), `signature` (parameter, diekstrak otomatis dari source-nya), dan `example` (contoh pemakaian — dikurasi manual untuk fungsi-fungsi penting seperti `sendNewsletterStatus`, `useMongoAuthState`, `generateWAMessage`, dst; untuk yang belum dikurasi, otomatis dibuatkan contoh generik dari signature-nya).

Sudah dites di sandbox ini (tanpa `npm install`, jadi file yang butuh `protobufjs` otomatis di-skip dengan aman) — hasilnya 71 fungsi terdeteksi. Di komputer kamu setelah `npm install`, hampir semua modul (termasuk yang butuh proto: rich-messages, newsletter-status, MessageBuilder, dll) akan ikut terdeteksi, jumlahnya akan jauh lebih banyak (~ratusan).
- `Voip/*` (VoIP call engine) — **sengaja tidak diporting**. Folder ini membawa file biner `whatsapp.wasm` (~9.8MB) yang kemungkinan besar hasil ekstrak dari WhatsApp resmi (Meta ExecuTorch runtime). Tidak bisa diaudit isinya secara aman, dan mendistribusikan ulang binary proprietary seperti ini berisiko dari sisi hak cipta. Kalau kamu benar-benar butuh fitur call, sebaiknya diskusikan dulu secara terpisah.
- `@rexxhayanasi/wangcap-id-bridge` — dependency npm yang dipakai beberapa file INTI Elaina (`crypto.js`, `chat-utils.js`, `lt-hash.js`, yang **tidak** kami sentuh/ganti). Namanya tidak umum/tidak bisa diverifikasi isinya dari sini, jadi sengaja tidak ikut ditarik ke Kelvdra. File-file inti Kelvdra kamu tidak diubah sama sekali sehingga dependency ini juga tidak dibutuhkan.

## Tahap 2 — Penambahan besar-besaran (sesuai request "tambahin semua")
Semua fungsi Elaina yang belum ada di Kelvdra (di luar Voip) sudah diporting:

**File subsistem baru (24 file):**
- `MessageBuilder/` (bot-signature, extras, metaai, index — ~5700 baris, message builder Meta AI/Bloks A2UI, tidak ada nama yang bentrok dengan `rich-messages.js`)
- `Utils/use-mongo-auth-state.js`, `use-mysql-auth-state.js`, `use-postgres-auth-state.js`, `use-redis-auth-state.js`, `use-sqlite-auth-state.js`, `useNekoDBAuth.js`, `auth-store.js` — auth state backend alternatif (semua optional, tidak wajib install kalau tidak dipakai)
- `Utils/voice-recognition.js` (`bindVoiceRecognition`) — opt-in, kamu sediakan sendiri fungsi `transcribe`-nya
- `Utils/group-metadata-cache.js`, `html-app.js`, `html-multiplayer.js`, `link-preview-metadata.js`, `native-flow.js`, `optional-media.js`, `payment-messages.js`, `scheduled-message.js`, `sender-key-memory.js`, `status-stickers.js`, `ttl-cache.js`, `username.js`

**File yang diedit (tahap 2):**
- `lib/Utils/index.js` / `.d.ts` — barrel export ditambah untuk semua file di atas.
- `lib/Defaults/index.js` / `.d.ts` — tambah `DEFAULT_CACHE_MAX_KEYS` (dipakai `ttl-cache.js`).
- `lib/Utils/decode-wa-message.js` / `.d.ts` — tambah `extractNewsletterMessageMeta` (+ helper kecil `findChildByTag`/`readIntAttr`).
- `lib/Socket/newsletter.js` / `.d.ts` — tambah **28 fungsi baru**: `toNewsletterServerIds`, `toNewsletterUserSettingInput`, `newsletterUpdateReactions`, `newsletterFetchMessageUpdates`, `newsletterQuestionResponses`, `newsletterEnforcements`, `newsletterReports`, `newsletterAppealReport`, `newsletterAdminInfo`, `newsletterPollVoters`, `newsletterReactionSenders`, `newsletterPinMessages`, `newsletterUnpinMessages`, `newsletterLabelAiContent`, `newsletterLabelPaidPartnership`, `newsletterCreateAdminInvite`, `newsletterRevokeAdminInvite`, `newsletterAcceptAdminInvite`, `newsletterDirectoryList`, `newsletterDirectorySearch`, `newsletterDirectoryCategories`, `newsletterSendPollVote`, `newsletterInsights`, `newsletterFollowers`, `newsletterPendingAdminInvites`, `newsletterQuestionResponseState`, `newsletterRecommended`, `newsletterSimilar`.
  - `newsletterAdminCapabilities` **sengaja TIDAK ditambahkan** — duplikat dari `newsletterCanPostStatus` yang sudah ada (shape-nya lebih lengkap: `canPost`, `canPostMusic`, `capabilities`), dipilih yang lebih baik sesuai instruksi kamu.
  - `newsletterFetchMessages` versi Elaina **tidak menggantikan** punya Kelvdra (signature beda: Elaina `(type, key, count, after, before)` vs Kelvdra `(jid, count, since, after)`) — biar tidak merusak kode kamu yang sudah manggil fungsi ini dengan signature lama.
- `lib/Types/Mex.js` — tambah 24 `QueryIds` + 20 `XWAPaths` baru yang dipakai fungsi-fungsi di atas.
- `package.json` — tambah `peerDependencies`/`peerDependenciesMeta` optional: `better-sqlite3`, `fluent-ffmpeg`, `ioredis`, `mongodb`, `mysql2`, `pg` (semua opsional, hanya perlu di-install kalau backend auth-state terkait dipakai).

Semua file baru sudah discan untuk pola mencurigakan (`eval`, `child_process`, endpoint aneh, dll) — bersih. Semua lolos `node --check` dan validasi resolusi import.

## Catatan pengujian
Sandbox tempat aku kerja tidak punya akses npm registry, jadi semua perubahan baru lolos:
- `node --check` (syntax valid) untuk semua file `.js` yang diubah/ditambah.
- Validasi resolusi seluruh `import ... from './relatif...'` di folder `lib/` (tidak ada yang nyasar, kecuali masalah lama di `lib/Store/` yang memang sudah ada sebelum perubahan ini).

**Kamu tetap perlu run `npm install` lalu test load (`node -e "import('./lib/index.js').then(()=>console.log('OK')).catch(console.error)"`) di mesin kamu sendiri** untuk verifikasi runtime penuh sebelum dipakai produksi.
