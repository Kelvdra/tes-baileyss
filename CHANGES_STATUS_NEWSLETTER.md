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

## Yang BELUM ikut ditambahkan (di luar scope "status newsletter", butuh keputusan kamu)
- `bindVoiceRecognition` (Elaina: `src/Utils/voice-recognition.js`) — fitur voice-to-text, subsistem terpisah & lebih besar.
- Beberapa fungsi tambahan di `newsletter.js` versi Elaina yang lebih luas (`toNewsletterServerIds`, `toNewsletterUserSettingInput`, `newsletterAdminInfo`, dll) — tidak wajib untuk fitur status, belum diporting supaya perubahan tetap fokus & minim risiko.

## Catatan pengujian
Sandbox tempat aku kerja tidak punya akses npm registry, jadi semua perubahan baru lolos:
- `node --check` (syntax valid) untuk semua file `.js` yang diubah/ditambah.
- Validasi resolusi seluruh `import ... from './relatif...'` di folder `lib/` (tidak ada yang nyasar, kecuali masalah lama di `lib/Store/` yang memang sudah ada sebelum perubahan ini).

**Kamu tetap perlu run `npm install` lalu test load (`node -e "import('./lib/index.js').then(()=>console.log('OK')).catch(console.error)"`) di mesin kamu sendiri** untuk verifikasi runtime penuh sebelum dipakai produksi.
