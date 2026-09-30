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
