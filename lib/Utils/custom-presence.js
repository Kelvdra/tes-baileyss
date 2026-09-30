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
