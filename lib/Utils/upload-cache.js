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
