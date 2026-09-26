// Store ringan & modular (anti memory leak). Semua data punya TTL dan batas ukuran.
// Backend: memoryBackend (LRU), sqliteBackend (better-sqlite3, optional), redisBackend (ioredis, optional).
// Yang disimpan: pesan (untuk getMessage / retry / poll), kontak, metadata grup. Chat list & riwayat penuh sengaja tidak disimpan.
import { LRUMap } from '../Utils/lru-map.js';
const HOUR = 60 * 60 * 1000;
export const memoryBackend = ({ max = 5000, ttl = 0 } = {}) => {
    const cache = new LRUMap({ max, ttl });
    return {
        name: 'memory',
        async get(key) {
            const v = cache.get(key);
            return v === undefined ? null : v;
        },
        async set(key, value, ttlMs) {
            cache.set(key, value, ttlMs);
        },
        async del(key) {
            cache.delete(key);
        },
        async close() {
            cache.clear();
        },
        stats: () => ({ size: cache.size })
    };
};
export const sqliteBackend = async ({ path = './baileys-store.db', db, maxMessageRows = 50000, pruneIntervalMs = 5 * 60 * 1000 } = {}) => {
    let conn = db;
    if (!conn) {
        let mod;
        try {
            mod = await import('better-sqlite3');
        }
        catch {
            throw new Error('better-sqlite3 belum terinstall. Jalankan: npm i better-sqlite3');
        }
        conn = new (mod.default || mod)(path);
    }
    conn.exec('PRAGMA journal_mode = WAL; PRAGMA synchronous = NORMAL;');
    conn.exec('CREATE TABLE IF NOT EXISTS kv (k TEXT PRIMARY KEY, v TEXT NOT NULL, exp INTEGER NOT NULL DEFAULT 0, ts INTEGER NOT NULL)');
    conn.exec('CREATE INDEX IF NOT EXISTS kv_exp ON kv(exp)');
    const sGet = conn.prepare('SELECT v, exp FROM kv WHERE k = ?');
    const sSet = conn.prepare('INSERT INTO kv (k, v, exp, ts) VALUES (?, ?, ?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v, exp = excluded.exp, ts = excluded.ts');
    const sDel = conn.prepare('DELETE FROM kv WHERE k = ?');
    const sExpire = conn.prepare('DELETE FROM kv WHERE exp > 0 AND exp <= ?');
    const sCount = conn.prepare("SELECT COUNT(*) AS n FROM kv WHERE k LIKE 'm:%'");
    const sTrim = conn.prepare("DELETE FROM kv WHERE k IN (SELECT k FROM kv WHERE k LIKE 'm:%' ORDER BY ts ASC LIMIT ?)");
    const prune = () => {
        sExpire.run(Date.now());
        const n = Number(sCount.get().n);
        if (n > maxMessageRows)
            sTrim.run(n - maxMessageRows);
    };
    prune();
    const timer = setInterval(() => { try { prune(); } catch { } }, pruneIntervalMs);
    timer.unref?.();
    return {
        name: 'sqlite',
        async get(key) {
            const row = sGet.get(key);
            if (!row)
                return null;
            if (row.exp && row.exp <= Date.now()) {
                sDel.run(key);
                return null;
            }
            return row.v;
        },
        async set(key, value, ttlMs) {
            sSet.run(key, value, ttlMs ? Date.now() + ttlMs : 0, Date.now());
        },
        async del(key) {
            sDel.run(key);
        },
        prune,
        async close() {
            clearInterval(timer);
            conn.close?.();
        }
    };
};
export const redisBackend = async ({ client, url, prefix = 'baileys:store:' } = {}) => {
    let redis = client;
    const owned = !client;
    if (!redis) {
        let mod;
        try {
            mod = await import('ioredis');
        }
        catch {
            throw new Error('ioredis belum terinstall. Jalankan: npm i ioredis');
        }
        const Redis = mod.default || mod.Redis || mod;
        redis = new Redis(url);
    }
    return {
        name: 'redis',
        get: key => redis.get(prefix + key),
        async set(key, value, ttlMs) {
            if (ttlMs)
                await redis.set(prefix + key, value, 'PX', ttlMs);
            else
                await redis.set(prefix + key, value);
        },
        async del(key) {
            await redis.del(prefix + key);
        },
        async close() {
            if (owned)
                await redis.quit();
        }
    };
};
export const makeLiteStore = ({ backend = memoryBackend(), logger, messageTtl = 24 * HOUR, contactTtl = 7 * 24 * HOUR, groupTtl = 30 * 60 * 1000, serializer } = {}) => {
    let ser = serializer || null;
    const getSerializer = async () => (ser ||= (await import('../Utils/index.js')).BufferJSON);
    const enc = async (value) => JSON.stringify(value, (await getSerializer()).replacer);
    const dec = async (text) => (text == null ? null : JSON.parse(text, (await getSerializer()).reviver));
    const mKey = (jid, id) => `m:${jid}:${id}`;
    const saveMessage = async (msg) => {
        const { remoteJid, id } = msg?.key || {};
        if (!remoteJid || !id)
            return;
        await backend.set(mKey(remoteJid, id), await enc(msg), messageTtl);
    };
    const loadMessage = async (jid, id) => dec(await backend.get(mKey(jid, id)));
    const getMessage = async (key) => (await loadMessage(key?.remoteJid, key?.id))?.message;
    const getContact = async (id) => dec(await backend.get(`c:${id}`));
    const getGroupMetadata = async (id) => dec(await backend.get(`g:${id}`));
    const merge = async (key, patch, ttl, createIfMissing) => {
        const current = await dec(await backend.get(key));
        if (!current && !createIfMissing)
            return;
        await backend.set(key, await enc({ ...(current || {}), ...patch }), ttl);
    };
    // Semua handler dijalankan berurutan lewat satu antrian: mencegah race read-modify-write
    // saat event datang beruntun (mis. contacts.upsert lalu contacts.update).
    let queue = Promise.resolve();
    const safe = (fn) => (...args) => {
        queue = queue.then(() => fn(...args)).catch(err => {
            logger?.warn?.({ err }, 'lite-store: handler error');
        });
        return queue;
    };
    const handlers = {
        'messages.upsert': safe(async ({ messages = [] }) => {
            for (const m of messages)
                await saveMessage(m);
        }),
        'messages.update': safe(async (updates = []) => {
            for (const { key, update } of updates) {
                const existing = key?.remoteJid && key?.id ? await loadMessage(key.remoteJid, key.id) : null;
                if (existing)
                    await saveMessage({ ...existing, ...update, key: existing.key });
            }
        }),
        'contacts.upsert': safe(async (contacts = []) => {
            for (const c of contacts)
                if (c?.id)
                    await merge(`c:${c.id}`, c, contactTtl, true);
        }),
        'contacts.update': safe(async (contacts = []) => {
            for (const c of contacts)
                if (c?.id)
                    await merge(`c:${c.id}`, c, contactTtl, true);
        }),
        'groups.upsert': safe(async (groups = []) => {
            for (const g of groups)
                if (g?.id)
                    await backend.set(`g:${g.id}`, await enc(g), groupTtl);
        }),
        'groups.update': safe(async (groups = []) => {
            for (const g of groups)
                if (g?.id)
                    await merge(`g:${g.id}`, g, groupTtl, false);
        }),
        'group-participants.update': safe(async ({ id }) => {
            if (id)
                await backend.del(`g:${id}`); // daftar peserta berubah -> paksa fetch ulang
        })
    };
    const bind = (ev) => {
        for (const [name, handler] of Object.entries(handlers))
            ev.on(name, handler);
        return () => {
            for (const [name, handler] of Object.entries(handlers))
                ev.off?.(name, handler);
        };
    };
    return { backend, bind, saveMessage, loadMessage, getMessage, getContact, getGroupMetadata, close: () => backend.close?.() };
};
