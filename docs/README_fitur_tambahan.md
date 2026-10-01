# Custom Presence, MMG High-Res & Anti-Delay Upload untuk `@kelvdra/baileys`

Dokumen ini berisi **kode lengkap** tiga fitur tambahan beserta cara memasangnya ke project.
Semua kode ditulis untuk struktur `lib/` yang sudah ada (ESM, JavaScript hasil build).

| Fitur | File baru | Yang ditambahkan ke `sock` |
|---|---|---|
| Custom Presence | `lib/Utils/custom-presence.js` | `sendCustomPresence`, `stopPresence`, `sendPresenceUpdate(type, jid, options)` |
| MMG High-Res | `lib/Utils/mmg.js` | `getMmgUrl`, `getMmgImageUrls`, `toMmgUrl`, `clearMmgCache`, `sendImageHd` |
| Anti-Delay Upload | `lib/Utils/upload-cache.js` | `waUploadToServer` versi cache + retry (`.stats`, `.clearCache()`) |

## Daftar isi

1. [Cara pakai singkat](#1-cara-pakai-singkat)
2. [Kode: `custom-presence.js`](#2-kode-custom-presencejs)
3. [Kode: `mmg.js`](#3-kode-mmgjs)
4. [Kode: `upload-cache.js`](#4-kode-upload-cachejs)
5. [Pemasangan (patch file yang sudah ada)](#5-pemasangan-patch-file-yang-sudah-ada)
6. [Konfigurasi](#6-konfigurasi)
7. [Batasan yang perlu diketahui](#7-batasan-yang-perlu-diketahui)

---

## 1. Cara pakai singkat

```js
// Custom Presence
await sock.sendPresenceUpdate('recording', jid, { duration: 3000 })
await sock.sendCustomPresence(jid, {
  steps: [
    { type: 'recording', duration: 2000 },
    { type: 'composing', text: 'halo kak, sebentar ya' }
  ]
})
const h = await sock.sendCustomPresence(jid, { type: 'composing', duration: 30000, wait: false })
await h.stop() // atau sock.stopPresence(jid)

// MMG High-Res
const url = await sock.getMmgUrl(buffer)
const { imagePreviewUrl, imageHighResUrl, sourceUrl } = await sock.getMmgImageUrls(buffer)
await sock.sendImageHd(jid, buffer, 'caption')
await sock.sendImageHd(jid, { url: 'https://.../foto.png' }, { caption: 'halo', viewOnce: true }, { quoted: m })

// Anti-Delay Upload (otomatis aktif)
sock.waUploadToServer.stats // { hit, miss, deduped, retried, failed }
```

---

## 2. Kode: `custom-presence.js`

Presence `composing` / `recording` dengan durasi, urutan state, repeat, dan auto-refresh. Menggunakan `sock.sendPresenceUpdate` bawaan sebagai dasar.

Simpan sebagai `lib/Utils/custom-presence.js`:

```js
// Custom Presence: composing / recording dengan durasi, urutan state, dan loop.
//
//   await sock.sendCustomPresence(jid, { type: 'recording', duration: 3000 })
//   await sock.sendCustomPresence(jid, { steps: [{ type: 'recording', duration: 2000 }, { type: 'composing', text: 'halo kak' }] })
//   await sock.sendPresenceUpdate('recording', jid, { duration: 3000 })   // argumen ketiga = opsi yang sama
//   await sock.stopPresence(jid)
//
// Batasan protokol: WhatsApp cuma punya state composing, recording (composing + media audio) dan paused.
// Tulisan "sedang mengetik..." / "merekam audio..." dirender oleh aplikasi penerima, tidak ada field teks kustom
// di stanza chatstate. Karena itu `text` di sini dipakai untuk menghitung durasi mengetik yang wajar, bukan label.
const STATES = new Set(['composing', 'recording', 'paused']);

const DEFAULTS = {
    duration: 2000, // durasi default per state
    refreshEvery: 7000, // kirim ulang state selama ditahan, karena klien penerima menghapus indikator kalau lama tidak diperbarui
    perCharMs: 60, // durasi mengetik per karakter kalau memakai `text`
    minTyping: 800,
    maxTyping: 10000,
    finish: 'paused' // 'paused' | 'none'
};

const sleep = (ms, signal) => new Promise(resolve => {
    if (signal?.aborted)
        return resolve();
    const timer = setTimeout(done, ms);
    function done() {
        clearTimeout(timer);
        signal?.removeEventListener('abort', done);
        resolve();
    }
    signal?.addEventListener('abort', done, { once: true });
});

const assertState = (type) => {
    if (!STATES.has(type))
        throw new TypeError(`state presence tidak valid: "${type}" (pakai composing, recording atau paused)`);
};

const stepDuration = (step, cfg) => {
    if (typeof step.duration === 'number' && step.duration >= 0)
        return step.duration;
    if (typeof step.text === 'string' && step.text.length) {
        return Math.min(cfg.maxTyping, Math.max(cfg.minTyping, step.text.length * cfg.perCharMs));
    }
    return cfg.duration;
};

export const normalizeSteps = (options, cfg = DEFAULTS) => {
    const source = Array.isArray(options.steps) && options.steps.length
        ? options.steps
        : [{ type: options.type ?? 'composing', duration: options.duration, text: options.text }];
    return source.map(step => {
        const type = step.type ?? 'composing';
        assertState(type);
        return { type, duration: stepDuration(step, cfg) };
    });
};

export const makeCustomPresence = (sock, config = {}) => {
    const cfg = { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) };
    // simpan versi asli, karena sock.sendPresenceUpdate akan dibungkus supaya menerima argumen ketiga
    const base = sock.sendPresenceUpdate.bind(sock);
    const sessions = new Map();

    const hold = async (step, jid, signal, onSent) => {
        if (step.type === 'paused') {
            await base('paused', jid);
            onSent?.();
            await sleep(step.duration, signal);
            return;
        }
        let remaining = step.duration;
        do {
            if (signal.aborted)
                return;
            await base(step.type, jid);
            onSent?.();
            const slice = Math.min(remaining, cfg.refreshEvery);
            await sleep(slice, signal);
            remaining -= slice;
        } while (remaining > 0);
    };

    const stopPresence = async (jid) => {
        const session = sessions.get(jid);
        if (!session)
            return false;
        session.controller.abort();
        await session.done.catch(() => { });
        return true;
    };

    const sendCustomPresence = async (jid, options = {}) => {
        if (!jid || typeof jid !== 'string')
            throw new TypeError('sendCustomPresence: jid wajib diisi');
        const opts = typeof options === 'string' ? { type: options } : options;
        const steps = normalizeSteps(opts, cfg);
        const repeat = Math.max(1, Math.floor(opts.repeat ?? 1));
        const finish = opts.finish ?? cfg.finish;
        const controller = new AbortController();
        if (opts.signal) {
            if (opts.signal.aborted)
                controller.abort();
            else
                opts.signal.addEventListener('abort', () => controller.abort(), { once: true });
        }
        // sesi baru menggantikan sesi lama di chat yang sama tanpa mengirim paused (menghindari indikator berkedip)
        sessions.get(jid)?.controller.abort();
        const session = { controller };
        let onStarted;
        let onStartFailed;
        let notified = false;
        const started = new Promise((resolve, reject) => {
            onStarted = resolve;
            onStartFailed = reject;
        });
        started.catch(() => { });
        const onSent = () => {
            notified = true;
            onStarted();
        };
        session.done = (async () => {
            try {
                for (let round = 0; round < repeat && !controller.signal.aborted; round++) {
                    for (const step of steps) {
                        if (controller.signal.aborted)
                            break;
                        await hold(step, jid, controller.signal, onSent);
                    }
                }
                onStarted();
            }
            catch (error) {
                if (!notified)
                    onStartFailed(error);
                throw error;
            }
            finally {
                if (sessions.get(jid) === session) {
                    sessions.delete(jid);
                    if (finish !== 'none') {
                        try {
                            await base(finish, jid);
                        }
                        catch {
                            // gagal mengirim paused tidak boleh menutupi hasil utama
                        }
                    }
                }
            }
        })();
        sessions.set(jid, session);
        if (opts.wait === false) {
            session.done.catch(() => { });
            await started;
            return { stop: () => stopPresence(jid) };
        }
        await session.done;
    };

    return { sendCustomPresence, stopPresence, basePresenceUpdate: base };
};
```

---

## 3. Kode: `mmg.js`

Berisi `toMmgUrl`, `makeMmg` (`getMmgUrl`, `getMmgImageUrls`) dan `makeSendImageHd` (`sendImageHd`).

Simpan sebagai `lib/Utils/mmg.js`:

```js
// MMG High-Res: URL media WhatsApp (mmg.whatsapp.net) jadi fitur bawaan.
//
//   sock.getMmgUrl(input)          -> string URL HD (tanpa upload ulang kalau sudah ada di server WA / sudah pernah di-upload)
//   sock.getMmgImageUrls(input)    -> { imagePreviewUrl, imageHighResUrl, sourceUrl } (preview & high-res otomatis sama-sama HD)
//   sock.sendImageHd(jid, img, content?, options?)
//
// Catatan: URL hasil getMmgUrl memakai jalur upload mentah (tanpa enkripsi, sama seperti Toolkit.toUrl di MessageBuilder),
// jadi bisa dipakai sebagai imagePreviewUrl / imageHighResUrl. URL media chat biasa (terenkripsi) hanya dinormalisasi,
// isinya tetap ciphertext dan tidak bisa dirender langsung.
import { Boom } from '@hapi/boom';
import { createHash } from 'crypto';
import { existsSync } from 'fs';
import { LRUCache } from 'lru-cache';
import { prepareWAMessageMedia } from './messages.js';
import { extractImageThumb, getStream, getUrlFromDirectPath, toBuffer } from './messages-media.js';

const WA_URL = /^https?:\/\/[^/]*\.whatsapp\.net\//i;
const DIRECT_PATH = /^\/(?:[a-z0-9]{1,4}\/)*v\/t\d+/i;
const MEDIA_MESSAGE_KEYS = ['imageMessage', 'videoMessage', 'documentMessage', 'audioMessage', 'stickerMessage', 'ptvMessage'];

/**
 * Sinkron. Ambil URL mmg dari string URL WA, directPath, objek { url, directPath }, atau pesan (imageMessage dll).
 * Mengembalikan undefined kalau input bukan referensi media yang sudah ada di server WA.
 */
export const toMmgUrl = (input) => {
    if (!input)
        return undefined;
    if (typeof input === 'string') {
        if (WA_URL.test(input))
            return input;
        if (DIRECT_PATH.test(input))
            return getUrlFromDirectPath(input);
        return undefined;
    }
    if (typeof input !== 'object' || Buffer.isBuffer(input) || input instanceof Uint8Array)
        return undefined;
    if (typeof input.url === 'string' && WA_URL.test(input.url))
        return input.url;
    if (typeof input.directPath === 'string' && input.directPath)
        return getUrlFromDirectPath(input.directPath);
    const inner = input.message && typeof input.message === 'object' ? input.message : input;
    for (const key of MEDIA_MESSAGE_KEYS) {
        if (inner[key]) {
            const found = toMmgUrl(inner[key]);
            if (found)
                return found;
        }
    }
    return undefined;
};

/** Normalisasi input media (Buffer, path, URL http(s), data:, base64, { url }, { stream }) jadi Buffer. */
export const readMediaInput = async (input, httpOptions) => {
    if (Buffer.isBuffer(input))
        return input;
    if (input instanceof Uint8Array)
        return Buffer.from(input);
    if (typeof input === 'string') {
        const isRemote = /^(https?|data):/i.test(input);
        if (isRemote || existsSync(input)) {
            const { stream } = await getStream({ url: input }, httpOptions);
            return toBuffer(stream);
        }
        return Buffer.from(input, 'base64');
    }
    if (input && typeof input === 'object' && ('url' in input || 'stream' in input)) {
        const { stream } = await getStream(input, httpOptions);
        return toBuffer(stream);
    }
    throw new Boom('Input media tidak dikenali (butuh Buffer, path, URL, base64, { url } atau { stream })', { statusCode: 400 });
};

const sniffImageMime = (buffer) => {
    if (buffer.length >= 8 && buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])))
        return 'image/png';
    if (buffer.length >= 12 && buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP')
        return 'image/webp';
    if (buffer.length >= 3 && buffer.subarray(0, 3).toString('ascii') === 'GIF')
        return 'image/gif';
    return 'image/jpeg';
};

const MMG_DEFAULTS = {
    cacheTtl: 30 * 60 * 1000,
    cacheMax: 300
};

export const makeMmg = ({ waUploadToServer, logger, config } = {}) => {
    const cfg = { ...MMG_DEFAULTS, ...(config && typeof config === 'object' ? config : {}) };
    const cache = new LRUCache({ max: cfg.cacheMax, ttl: cfg.cacheTtl });
    const inflight = new Map();

    const uploadRaw = async (buffer, mediaType) => {
        const content = { [mediaType]: buffer };
        // thumbnail tidak dipakai untuk URL mentah, dilewati supaya upload tidak menunggu proses resize
        if (mediaType === 'image' || mediaType === 'video')
            content.jpegThumbnail = Buffer.alloc(0);
        const message = await prepareWAMessageMedia(content, {
            upload: waUploadToServer,
            jid: 'mmg@newsletter',
            logger
        });
        const media = message?.[`${mediaType}Message`];
        const url = media?.url || (media?.directPath ? getUrlFromDirectPath(media.directPath) : undefined);
        if (!url)
            throw new Boom('Upload MMG selesai tapi server tidak mengembalikan URL', { statusCode: 500 });
        return url;
    };

    const getMmgUrl = async (input, { mediaType = 'image', force = false } = {}) => {
        const existing = toMmgUrl(input);
        if (existing)
            return existing;
        const buffer = await readMediaInput(input, undefined);
        if (!buffer?.length)
            throw new Boom('getMmgUrl: media kosong atau tidak terbaca', { statusCode: 400 });
        const key = `${mediaType}:${createHash('sha256').update(buffer).digest('base64')}`;
        if (!force) {
            const hit = cache.get(key);
            if (hit)
                return hit;
            const pending = inflight.get(key);
            if (pending)
                return pending;
        }
        const task = uploadRaw(buffer, mediaType).then(url => {
            cache.set(key, url);
            return url;
        });
        inflight.set(key, task);
        try {
            return await task;
        }
        finally {
            if (inflight.get(key) === task)
                inflight.delete(key);
        }
    };

    const getMmgImageUrls = async (input, options = {}) => {
        if (Array.isArray(input))
            return Promise.all(input.map(item => getMmgImageUrls(item, options)));
        const url = await getMmgUrl(input, { ...options, mediaType: 'image' });
        return { imagePreviewUrl: url, imageHighResUrl: url, sourceUrl: url };
    };

    return {
        toMmgUrl,
        getMmgUrl,
        getMmgImageUrls,
        clearMmgCache: () => cache.clear()
    };
};

/**
 * sendImageHd(jid, image, content?, options?) — sama polanya dengan sendMessage(jid, content, options).
 * `content` boleh string (jadi caption). Opsi tambahan di content: thumbWidth (default 256), thumbQuality (default 75), mimetype.
 */
export const makeSendImageHd = (sock, config = {}) => {
    const defaults = { thumbWidth: 256, thumbQuality: 75, ...(config && typeof config === 'object' ? config : {}) };
    return async (jid, image, content = {}, options = {}) => {
        if (!jid)
            throw new Boom('sendImageHd: jid wajib diisi', { statusCode: 400 });
        const extra = typeof content === 'string' ? { caption: content } : { ...content };
        const { thumbWidth = defaults.thumbWidth, thumbQuality = defaults.thumbQuality, ...messageContent } = extra;
        const buffer = await readMediaInput(image, undefined);
        if (!buffer?.length)
            throw new Boom('sendImageHd: gambar kosong atau tidak terbaca', { statusCode: 400 });
        const hd = {};
        try {
            const { buffer: thumb, original } = await extractImageThumb(buffer, thumbWidth, thumbQuality);
            hd.jpegThumbnail = thumb;
            if (original?.width && original?.height) {
                hd.width = original.width;
                hd.height = original.height;
            }
        }
        catch (error) {
            sock.logger?.warn?.({ trace: error?.stack }, 'sendImageHd: gagal membuat thumbnail HD, lanjut tanpa thumbnail kustom');
        }
        return sock.sendMessage(jid, {
            mimetype: sniffImageMime(buffer),
            ...hd,
            ...messageContent,
            image: buffer
        }, options);
    };
};
```

---

## 4. Kode: `upload-cache.js`

Pembungkus `waUploadToServer`: cache hasil upload, dedupe upload identik, retry + backoff, dan pre-warm `media_conn`.

Simpan sebagai `lib/Utils/upload-cache.js`:

```js
// Anti-Delay Upload: bungkus waUploadToServer dengan
//   1. cache hasil upload (kunci: mediaType + sha256 file terenkripsi) -> upload identik tidak diulang
//   2. dedupe upload identik yang sedang berjalan (dua kirim bersamaan cuma upload sekali)
//   3. retry dengan exponential backoff + jitter, dan paksa refresh media_conn sebelum mencoba lagi
//   4. pre-warm media_conn saat koneksi terbuka supaya upload pertama tidak menunggu query media_conn
// Aktif default. Matikan: makeWASocket({ uploadCache: false }).
// Atur: makeWASocket({ uploadCache: { retries: 3, retryDelay: 400, retryMaxDelay: 4000, cacheTtl: 1800000, cacheMax: 500, prewarm: true } })
import { LRUCache } from 'lru-cache';

const DEFAULTS = {
    cache: true,
    cacheTtl: 30 * 60 * 1000,
    cacheMax: 500,
    retries: 3,
    retryDelay: 400,
    retryMaxDelay: 4000,
    prewarm: true
};

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

export const normalizeUploadConfig = (config) => {
    if (config === false)
        return null;
    return { ...DEFAULTS, ...(config && typeof config === 'object' ? config : {}) };
};

// error yang tidak akan sembuh dengan mengulang
const isPermanent = (error) => {
    if (error?.code === 'ENOENT' || error?.code === 'EACCES')
        return true;
    const status = error?.output?.statusCode;
    return typeof status === 'number' && status >= 400 && status < 500;
};

export const makeCachedUpload = (upload, { refreshMediaConn, logger, config } = {}) => {
    const cfg = normalizeUploadConfig(config);
    if (!cfg)
        return upload;
    const cache = new LRUCache({ max: cfg.cacheMax, ttl: cfg.cacheTtl });
    const inflight = new Map();
    const stats = { hit: 0, miss: 0, deduped: 0, retried: 0, failed: 0 };

    const run = async (filePath, opts) => {
        // stream yang sudah terbaca tidak bisa diulang, jadi retry hanya untuk path file
        const attempts = typeof filePath === 'string' ? Math.max(0, cfg.retries) + 1 : 1;
        let lastError;
        for (let attempt = 0; attempt < attempts; attempt++) {
            if (attempt > 0) {
                stats.retried++;
                const base = Math.min(cfg.retryMaxDelay, cfg.retryDelay * 2 ** (attempt - 1));
                await sleep(base * (0.75 + Math.random() * 0.5));
                try {
                    await refreshMediaConn?.(true);
                }
                catch (error) {
                    logger?.debug?.({ trace: error?.stack }, 'upload retry: gagal refresh media_conn');
                }
                logger?.warn?.({ attempt, mediaType: opts?.mediaType }, 'upload gagal, mencoba lagi');
            }
            try {
                return await upload(filePath, opts);
            }
            catch (error) {
                lastError = error;
                if (isPermanent(error))
                    break;
            }
        }
        stats.failed++;
        throw lastError;
    };

    const wrapped = async (filePath, opts = {}) => {
        const key = cfg.cache && opts?.fileEncSha256B64 && opts?.mediaType ? `${opts.mediaType}:${opts.fileEncSha256B64}` : null;
        if (key) {
            const hit = cache.get(key);
            if (hit) {
                stats.hit++;
                return { ...hit };
            }
            const pending = inflight.get(key);
            if (pending) {
                stats.deduped++;
                return { ...(await pending) };
            }
        }
        stats.miss++;
        const task = run(filePath, opts);
        if (!key)
            return task;
        inflight.set(key, task);
        try {
            const result = await task;
            if (result?.mediaUrl || result?.directPath)
                cache.set(key, result);
            return { ...result };
        }
        finally {
            if (inflight.get(key) === task)
                inflight.delete(key);
        }
    };
    wrapped.stats = stats;
    wrapped.clearCache = () => cache.clear();
    return wrapped;
};

export const prewarmMediaConn = (ev, refreshMediaConn, logger, config) => {
    const cfg = normalizeUploadConfig(config);
    if (!cfg || !cfg.prewarm)
        return;
    ev.on('connection.update', ({ connection }) => {
        if (connection !== 'open')
            return;
        refreshMediaConn(true).catch(error => logger?.debug?.({ trace: error?.stack }, 'pre-warm media_conn gagal'));
    });
};
```

---

## 5. Pemasangan (patch file yang sudah ada)

### 5.1 `lib/Utils/index.js`

Tambahkan di bawah export terakhir (sebelum baris `//# sourceMappingURL`):

```js
export * from './upload-cache.js';
export * from './mmg.js';
export * from './custom-presence.js';
```

### 5.2 `lib/Utils/messages-media.js`

Beri `extractImageThumb` parameter `quality` (default 50, jadi perilaku lama tidak berubah):

```js
export const extractImageThumb = async (bufferOrFilePath, width = 32, quality = 50) => {
    // ...
    const buffer = await img.resize(width).jpeg({ quality }).toBuffer();   // jalur sharp
    // ...
    .getBuffer('image/jpeg', { quality });                                 // jalur jimp
```

### 5.3 `lib/Socket/messages-send.js`

**Import** (di samping import lain):

```js
import { makeCachedUpload, prewarmMediaConn } from '../Utils/upload-cache.js'
import { makeMmg } from '../Utils/mmg.js'
```

**Perbaiki `refreshMediaConn`** supaya promise gagal tidak menetap (bug lama: satu query gagal membuat semua upload berikutnya error):

```js
const refreshMediaConn = async (forceGet = false) => {
    const media = await Promise.resolve(mediaConn).catch(() => undefined);
    if (!media || forceGet || new Date().getTime() - media.fetchDate.getTime() > media.ttl * 1000) {
        const pending = (async () => {
            // ... isi query media_conn tidak berubah ...
        })();
        mediaConn = pending;
        pending.catch(() => {
            if (mediaConn === pending)
                mediaConn = undefined;
        });
    }
    return mediaConn;
};
```

**Ganti pembuatan `waUploadToServer`:**

```js
const waUploadToServer = makeCachedUpload(getWAUploadToServer(config, refreshMediaConn), { refreshMediaConn, logger, config: config.uploadCache });
prewarmMediaConn(ev, refreshMediaConn, logger, config.uploadCache);
```

**Buat instance MMG** (tepat sebelum `const kelvdra = new hydra(...)`):

```js
const mmg = makeMmg({ waUploadToServer, logger, config: config.mmg });
```

**Teruskan ke `aiClient`** dan **return object**:

```js
const aiClient = { ...sock, relayMessage, waUploadToServer, getMmgUrl: mmg.getMmgUrl }

return {
    ...sock,
    // ...
    refreshMediaConn,
    waUploadToServer,
    ...mmg,          // toMmgUrl, getMmgUrl, getMmgImageUrls, clearMmgCache
    kelvdra,
    // ...
};
```

### 5.4 `lib/MessageBuilder/index.js`

Supaya `AIRich.addImage` dll. ikut memakai cache MMG, ubah `Toolkit.toUrl`:

```js
static async toUrl(_client, path, mediaType = 'document') {
    if (!path) throw new Error('Url or buffer needed');

    if (typeof _client?.getMmgUrl === 'function') {
        return _client.getMmgUrl(path, { mediaType });
    }

    // ... kode lama (prepareWAMessageMedia) tetap sebagai fallback ...
}
```

### 5.5 `lib/Socket/index.js`

Import:

```js
import { makeCustomPresence } from '../Utils/custom-presence.js';
import { makeSendImageHd } from '../Utils/mmg.js';
```

Pasang di dalam `makeWASocket`. `sendPresenceUpdate` harus dibungkus **sebelum** `makeHumanizer`, dan `sendImageHd` dipasang **setelah** `makeHumanizer` supaya memakai `sendMessage` final:

```js
// Custom Presence
const presence = makeCustomPresence(sock, newConfig.customPresence);
sock.sendCustomPresence = presence.sendCustomPresence;
sock.stopPresence = presence.stopPresence;
sock.sendPresenceUpdate = (type, toJid, options) => options && toJid && type !== 'available' && type !== 'unavailable'
    ? presence.sendCustomPresence(toJid, typeof options === 'object' ? { type, ...options } : { type })
    : presence.basePresenceUpdate(type, toJid);

makeHumanizer(sock, newConfig.humanize);

// MMG High-Res
sock.sendImageHd = makeSendImageHd(sock, newConfig.imageHd);
```

Tanpa argumen ketiga, `sendPresenceUpdate` memanggil fungsi asli, jadi kode lama tidak terpengaruh.

---

## 6. Konfigurasi

```js
const sock = makeWASocket({
  // Anti-Delay Upload (false = matikan)
  uploadCache: {
    retries: 3,            // retry setelah gagal di semua host
    retryDelay: 400,       // ms, backoff eksponensial + jitter
    retryMaxDelay: 4000,
    cacheTtl: 30 * 60_000,
    cacheMax: 500,
    prewarm: true          // ambil media_conn saat koneksi open
  },
  // MMG
  mmg: { cacheTtl: 30 * 60_000, cacheMax: 300 },
  imageHd: { thumbWidth: 256, thumbQuality: 75 },
  // Presence
  customPresence: { duration: 2000, refreshEvery: 7000, perCharMs: 60, finish: 'paused' }
})
```

Opsi `sendCustomPresence`:

| Opsi | Keterangan |
|---|---|
| `type` | `'composing'` \| `'recording'` \| `'paused'` |
| `duration` | Lama state dalam ms (default 2000) |
| `text` | Kalau `duration` kosong, durasi dihitung dari panjang teks |
| `steps` | Array `{ type, duration, text }`, menggantikan opsi tunggal di atas |
| `repeat` | Ulangi seluruh `steps` sekian kali |
| `finish` | `'paused'` (default) atau `'none'` |
| `wait` | `false` = kembali segera dan mengembalikan `{ stop }` |
| `signal` | `AbortSignal` untuk membatalkan |

---

## 7. Batasan yang perlu diketahui

- **Teks label kustom pada presence tidak bisa dikirim.** WhatsApp hanya punya `composing`, `recording`, dan `paused`; tulisan "sedang mengetik..." dirender oleh aplikasi penerima. Opsi `text` hanya dipakai untuk menghitung durasi.
- **Gambar di Baileys memang dikirim tanpa kompresi.** `sendImageHd` tidak mengubah kualitas gambar yang diterima; ia menajamkan thumbnail inline, mengisi width/height asli, dan mendeteksi mimetype.
- **URL dari `getMmgUrl`** berasal dari jalur upload mentah (tanpa enkripsi), cocok untuk `imagePreviewUrl` / `imageHighResUrl`. URL media chat biasa hanya dinormalisasi; isinya tetap terenkripsi.
- **Cache upload tidak membuat kirim ulang gambar yang sama ke chat lain jadi instan**, karena media chat memakai `mediaKey` acak. Cache paling terasa di AIRich, `getMmgUrl`, newsletter, kirim bersamaan, dan retry.
- Retry hanya berlaku untuk upload dari path file; stream yang sudah terbaca tidak bisa diulang. Error permanen (`ENOENT`, 4xx) tidak di-retry.
- Kode ini diuji dengan unit test mock (`node --test test/features.test.js`), belum diuji ke server WhatsApp asli.
