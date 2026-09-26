// sock.getRealJid(lidOrJid, { groupJid?, message? }) -> JID nomor (@s.whatsapp.net) atau null.
// Urutan: cache -> hint dari message (participantAlt/remoteJidAlt) -> lidMapping bawaan -> metadata grup.
import { isLidUser, isPnUser, jidNormalizedUser } from '../WABinary/jid-utils.js';
import { LRUMap } from './lru-map.js';
export const makeJidResolver = (sock, opts = {}) => {
    const { cacheSize = 5000, ttl = 6 * 60 * 60 * 1000, negativeTtl = 60 * 1000, useGroupMetadata = true, fallbackToLid = false, logger = sock.logger } = opts;
    const cache = new LRUMap({ max: cacheSize, ttl });
    const inflight = new Map();
    const lidMapping = () => sock.signalRepository?.lidMapping;
    const norm = (jid) => (jid ? jidNormalizedUser(jid) : '');
    const remember = (lid, pn) => {
        cache.set(lid, pn);
        cache.set(`pn:${pn}`, lid);
    };
    const persist = async (lid, pn) => {
        try {
            await lidMapping()?.storeLIDPNMappings([{ lid, pn }]);
        }
        catch (err) {
            logger?.debug?.({ err }, 'jid-resolver: gagal menyimpan mapping');
        }
    };
    const hintFromMessage = (lid, message) => {
        const key = message?.key;
        if (!key)
            return null;
        if (norm(key.participant) === lid && isPnUser(key.participantAlt))
            return norm(key.participantAlt);
        if (norm(key.remoteJid) === lid && isPnUser(key.remoteJidAlt))
            return norm(key.remoteJidAlt);
        return null;
    };
    const resolve = async (lid, ctx) => {
        let pn = null;
        let learned = false;
        try {
            const found = await lidMapping()?.getPNForLID(lid);
            if (found)
                pn = norm(found);
        }
        catch (err) {
            logger?.debug?.({ err }, 'jid-resolver: lidMapping gagal');
        }
        if (!pn && useGroupMetadata && ctx.groupJid) {
            try {
                const meta = await sock.groupMetadata(ctx.groupJid);
                const participant = meta?.participants?.find(p => [p.id, p.lid, p.jid].some(x => x && norm(x) === lid));
                const candidate = participant && [participant.phoneNumber, participant.jid, participant.id].find(x => isPnUser(x));
                if (candidate) {
                    pn = norm(candidate);
                    learned = true;
                }
            }
            catch (err) {
                logger?.debug?.({ err }, 'jid-resolver: groupMetadata gagal');
            }
        }
        if (pn) {
            remember(lid, pn);
            if (learned)
                await persist(lid, pn);
            return pn;
        }
        cache.set(lid, null, negativeTtl);
        return null;
    };
    const getRealJid = async (input, ctx = {}) => {
        if (!input || typeof input !== 'string')
            return input ?? null;
        if (!isLidUser(input))
            return jidNormalizedUser(input) || input;
        const lid = norm(input);
        const hit = cache.get(lid);
        if (typeof hit === 'string')
            return hit;
        const hint = hintFromMessage(lid, ctx.message);
        if (hint) {
            remember(lid, hint);
            await persist(lid, hint);
            return hint;
        }
        if (hit === null && !ctx.force)
            return fallbackToLid ? lid : null;
        const flightKey = `${lid}|${ctx.groupJid || ''}`;
        let promise = inflight.get(flightKey);
        if (!promise) {
            promise = resolve(lid, ctx).finally(() => inflight.delete(flightKey));
            inflight.set(flightKey, promise);
        }
        const pn = await promise;
        return pn || (fallbackToLid ? lid : null);
    };
    const getRealJids = (inputs, ctx = {}) => Promise.all((inputs || []).map(jid => getRealJid(jid, ctx)));
    const getLidForJid = async (pn) => {
        if (!pn || !isPnUser(norm(pn)))
            return isLidUser(pn) ? norm(pn) : null;
        const normalized = norm(pn);
        const cached = cache.get(`pn:${normalized}`);
        if (typeof cached === 'string')
            return cached;
        try {
            const found = await lidMapping()?.getLIDForPN(normalized);
            if (found) {
                const lid = norm(found);
                remember(lid, normalized);
                return lid;
            }
        }
        catch (err) {
            logger?.debug?.({ err }, 'jid-resolver: getLIDForPN gagal');
        }
        return null;
    };
    // Belajar otomatis dari event yang sudah lewat, tanpa network call tambahan.
    try {
        sock.ev?.on('lid-mapping.update', ({ lid, pn } = {}) => {
            if (isLidUser(lid) && isPnUser(pn))
                remember(norm(lid), norm(pn));
        });
        sock.ev?.on('messages.upsert', ({ messages = [] } = {}) => {
            for (const m of messages) {
                const key = m?.key;
                if (!key)
                    continue;
                if (isLidUser(key.participant) && isPnUser(key.participantAlt))
                    remember(norm(key.participant), norm(key.participantAlt));
                if (isLidUser(key.remoteJid) && isPnUser(key.remoteJidAlt))
                    remember(norm(key.remoteJid), norm(key.remoteJidAlt));
            }
        });
    }
    catch {
        // ev tidak tersedia: resolver tetap jalan tanpa auto-learn
    }
    sock.getRealJid = getRealJid;
    sock.getRealJids = getRealJids;
    sock.getLidForJid = getLidForJid;
    sock.jidResolver = { cache, clear: () => cache.clear() };
    return sock;
};
