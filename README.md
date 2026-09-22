# WhatsApp Web API
  **Advanced Baileys WhatsApp API Wrapper**
  
![WhatsApp Bot Banner](https://files.catbox.moe/1rjzor.jpeg)

> Contoh implementasi dasar untuk terhubung ke WhatsApp menggunakan pustaka `@kelvdra/baileys`.

Repositori ini berisi contoh implementasi sederhana untuk membangun koneksi WhatsApp menggunakan pustaka **`@kelvdra/baileys`**, sebuah *wrapper* canggih berbasis Baileys untuk membangun otomasi, chatbot, dan integrasi WhatsApp dalam proyek Node.js.

---

## 📌 Tentang @kelvdra/baileys

`@kelvdra/baileys` memungkinkan Anda:

- Membuat WhatsApp bot
- Mengotomasi pengiriman dan penerimaan pesan
- Mengelola grup dan kontak
- Membuat integrasi WhatsApp berbasis WebSocket tanpa browser

Library ini berjalan sebagai **klien WhatsApp Web sekunder (multi-device)**.

---

## ✨ Fitur Utama

- 🔗 **Koneksi Multi-Device**  
  Tetap bisa menggunakan WhatsApp di ponsel saat bot berjalan.

- 💾 **Manajemen Sesi Otomatis**  
  Menyimpan dan memulihkan sesi tanpa perlu scan QR berulang kali.

- 📡 **Event Handler Lengkap**  
  Mendukung monitoring event seperti:
  - Perubahan koneksi
  - Update kredensial
  - Riwayat pesan
  - Perubahan grup

- ⚡ **Ringan & Stabil**  
  Menggunakan WebSocket langsung tanpa Selenium atau browser automation.

---

## 🛠 1. Instalasi

### Versi Stabil (Direkomendasikan)

```bash
npm install @kelvdra/baileys
```

### Versi Edge (Fitur Terbaru)

```bash
npm install @kelvdra/baileys@latest
```

---

## 🚀 2. Penggunaan Dasar

### Inisialisasi & Konfigurasi

```javascript
import makeWASocket, {
    useMultiFileAuthState,
    DisconnectReason,
    fetchLatestWaWebVersion
} from '@kelvdra/baileys';
import pino from 'pino';
import { Boom } from '@hapi/boom';

async function connectToWhatsApp() {
    const { state, saveCreds } = await useMultiFileAuthState('auth_info_baileys');

    const { version, isLatest } = await fetchLatestWaWebVersion();
    console.log(`Menggunakan WA v${version.join('.')}, Versi Terbaru: ${isLatest}`);

    const sock = makeWASocket({
        version,
        logger: pino({ level: 'silent' }),
        printQRInTerminal: true,
        auth: state,
        browser: ['Ubuntu', 'Chrome', '20.0.0'],
    });

    sock.ev.on('connection.update', (update) => {
        const { connection, lastDisconnect } = update;

        if (connection === 'close') {
            const shouldReconnect =
                (lastDisconnect.error)?.output?.statusCode !== DisconnectReason.loggedOut;

            if (shouldReconnect) connectToWhatsApp();
        }

        if (connection === 'open') {
            console.log('✅ Koneksi berhasil tersambung!');
        }
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('messaging-history.set', (history) => {
        const { chats, messages, contacts } = history;
        console.log(`Menerima ${chats.length} chat, ${messages.length} pesan, ${contacts.length} kontak.`);
    });

    sock.ev.on('groups.update', (updates) => {
        console.log('Update grup:', JSON.stringify(updates, null, 2));
    });
}

connectToWhatsApp();
```

## ⚠️ Penafian

Proyek ini tidak berafiliasi atau didukung secara resmi oleh WhatsApp atau Meta.  
Gunakan dengan tanggung jawab dan patuhi Ketentuan Layanan WhatsApp.

---

## 📞 Kontak & Dukungan

Jika Anda memiliki pertanyaan atau ingin berdiskusi, silakan bergabung ke Channel Telegram:

👉 **[Gabung Channel Telegram](https://t.me/kelvdraa)**

---
