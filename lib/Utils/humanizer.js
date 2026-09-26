// Anti-Sequence: jitter delay + presence "composing" sebelum sendMessage.
// Opt-in: makeWASocket({ humanize: true }) atau makeWASocket({ humanize: { minDelay: 800, maxDelay: 2300 } })
// Matikan per-pesan: sock.sendMessage(jid, content, { humanize: false })
// Matikan/hidupkan saat runtime: sock.humanize.enabled = false
const DEFAULTS = {
    enabled: true,
    minDelay: 800,
    maxDelay: 2300,
    typing: true, // kirim presence composing selama delay
    perCharMs: 0, // tambahan delay per karakter text/caption (0 = mati)
    maxTotal: 8000 // batas atas total delay
};
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const rand = (min, max) => min + Math.random() * (max - min);
export const normalizeHumanizeConfig = (config) => {
    if (!config)
        return null;
    const cfg = { ...DEFAULTS, ...(config === true ? {} : config) };
    if (cfg.maxDelay < cfg.minDelay)
        [cfg.minDelay, cfg.maxDelay] = [cfg.maxDelay, cfg.minDelay];
    return cfg;
};
// Aksi yang tidak perlu "mengetik": react, hapus, status/broadcast/newsletter.
const shouldSkip = (jid, content) => {
    if (!jid || typeof jid !== 'string')
        return true;
    if (jid.endsWith('@broadcast') || jid.endsWith('@newsletter'))
        return true;
    if (content && (content.delete || content.react || content.disappearingMessagesInMessage))
        return true;
    return false;
};
const computeDelay = (cfg, content) => {
    const textLen = typeof content?.text === 'string' ? content.text.length : typeof content?.caption === 'string' ? content.caption.length : 0;
    return Math.min(rand(cfg.minDelay, cfg.maxDelay) + textLen * (cfg.perCharMs || 0), cfg.maxTotal);
};
export const makeHumanizer = (sock, config) => {
    const state = normalizeHumanizeConfig(config);
    if (!state)
        return sock;
    const original = sock.sendMessage.bind(sock);
    const tails = new Map(); // antrian per-chat supaya urutan pesan tetap terjaga walau delay-nya acak
    const presence = async (type, jid) => {
        try {
            await sock.sendPresenceUpdate(type, jid);
        }
        catch {
            // presence gagal tidak boleh menggagalkan pengiriman
        }
    };
    sock.humanize = state;
    sock.sendMessage = (jid, content, options = {}) => {
        const { humanize: override, ...rest } = options || {};
        if (override === false || !state.enabled || shouldSkip(jid, content)) {
            return original(jid, content, rest);
        }
        const cfg = override && typeof override === 'object' ? normalizeHumanizeConfig({ ...state, ...override }) : state;
        const execute = async () => {
            if (cfg.typing)
                await presence('composing', jid);
            await sleep(computeDelay(cfg, content));
            try {
                return await original(jid, content, rest);
            }
            finally {
                if (cfg.typing)
                    void presence('paused', jid);
            }
        };
        const task = (tails.get(jid) || Promise.resolve()).then(execute);
        const tail = task.catch(() => { });
        tails.set(jid, tail);
        tail.then(() => {
            if (tails.get(jid) === tail)
                tails.delete(jid);
        });
        return task;
    };
    return sock;
};
