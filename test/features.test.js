import assert from 'node:assert/strict';
import { test } from 'node:test';
import { makeCustomPresence, normalizeSteps } from '../lib/Utils/custom-presence.js';
import { makeMmg, makeSendImageHd, toMmgUrl } from '../lib/Utils/mmg.js';
import { makeCachedUpload } from '../lib/Utils/upload-cache.js';

const OK = { mediaUrl: 'https://mmg.whatsapp.net/v/t62.7118-24/abc?ccb=11-4&oh=x&oe=1', directPath: '/v/t62.7118-24/abc?ccb=11-4&oh=x&oe=1' };
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

test('upload-cache: upload identik cuma sekali, sisanya cache hit', async () => {
    let calls = 0;
    const up = makeCachedUpload(async () => { calls++; return { ...OK }; }, { config: {} });
    const opts = { mediaType: 'image', fileEncSha256B64: 'AAA' };
    await up('/tmp/x', opts);
    await up('/tmp/x', opts);
    await up('/tmp/x', { ...opts, mediaType: 'video' });
    assert.equal(calls, 2);
    assert.equal(up.stats.hit, 1);
});

test('upload-cache: upload bersamaan di-dedupe', async () => {
    let calls = 0;
    const up = makeCachedUpload(async () => { calls++; await sleep(30); return { ...OK }; }, { config: {} });
    const opts = { mediaType: 'image', fileEncSha256B64: 'BBB' };
    const [a, b] = await Promise.all([up('/tmp/x', opts), up('/tmp/y', opts)]);
    assert.equal(calls, 1);
    assert.deepEqual(a, b);
    assert.equal(up.stats.deduped, 1);
});

test('upload-cache: retry lalu berhasil, dan refresh media_conn dipaksa', async () => {
    let calls = 0;
    const refreshed = [];
    const up = makeCachedUpload(async () => {
        if (++calls < 3) throw new Error('boom');
        return { ...OK };
    }, { config: { retryDelay: 1, retryMaxDelay: 2 }, refreshMediaConn: async (force) => { refreshed.push(force); } });
    const res = await up('/tmp/x', { mediaType: 'image', fileEncSha256B64: 'CCC' });
    assert.equal(res.mediaUrl, OK.mediaUrl);
    assert.equal(calls, 3);
    assert.deepEqual(refreshed, [true, true]);
});

test('upload-cache: gagal terus -> throw setelah retries habis, hasil gagal tidak di-cache', async () => {
    let calls = 0;
    const up = makeCachedUpload(async () => { calls++; throw new Error('down'); }, { config: { retries: 2, retryDelay: 1, retryMaxDelay: 2 } });
    const opts = { mediaType: 'image', fileEncSha256B64: 'DDD' };
    await assert.rejects(up('/tmp/x', opts), /down/);
    assert.equal(calls, 3);
    await assert.rejects(up('/tmp/x', opts), /down/);
    assert.equal(calls, 6);
});

test('upload-cache: error permanen (ENOENT) tidak diulang; stream tidak diulang', async () => {
    let calls = 0;
    const enoent = Object.assign(new Error('nofile'), { code: 'ENOENT' });
    const up = makeCachedUpload(async () => { calls++; throw enoent; }, { config: { retryDelay: 1 } });
    await assert.rejects(up('/tmp/x', { mediaType: 'image', fileEncSha256B64: 'EEE' }));
    assert.equal(calls, 1);
    calls = 0;
    const up2 = makeCachedUpload(async () => { calls++; throw new Error('x'); }, { config: { retryDelay: 1 } });
    await assert.rejects(up2({ pipe() {} }, { mediaType: 'image', fileEncSha256B64: 'FFF' }));
    assert.equal(calls, 1);
});

test('upload-cache: uploadCache:false mengembalikan fungsi asli', () => {
    const fn = async () => OK;
    assert.equal(makeCachedUpload(fn, { config: false }), fn);
});

test('mmg: toMmgUrl dari URL WA, directPath, objek, dan pesan', () => {
    assert.equal(toMmgUrl(OK.mediaUrl), OK.mediaUrl);
    assert.equal(toMmgUrl(OK.directPath), OK.mediaUrl);
    assert.equal(toMmgUrl('/o1/v/t24/f2/m232/x?oe=1'), 'https://mmg.whatsapp.net/o1/v/t24/f2/m232/x?oe=1');
    assert.equal(toMmgUrl({ directPath: OK.directPath }), OK.mediaUrl);
    assert.equal(toMmgUrl({ message: { imageMessage: { url: OK.mediaUrl } } }), OK.mediaUrl);
    assert.equal(toMmgUrl({ videoMessage: { directPath: OK.directPath } }), OK.mediaUrl);
    assert.equal(toMmgUrl('/tmp/foto.png'), undefined);
    assert.equal(toMmgUrl('https://example.com/a.png'), undefined);
    assert.equal(toMmgUrl(Buffer.from('abc')), undefined);
    assert.equal(toMmgUrl(null), undefined);
});

test('mmg: getMmgUrl upload sekali per konten, referensi WA tanpa upload', async () => {
    let uploads = 0;
    const { getMmgUrl, getMmgImageUrls } = makeMmg({ waUploadToServer: async () => { uploads++; return { ...OK }; } });
    const img = Buffer.from('gambar-palsu-1');
    const [u1, u2] = await Promise.all([getMmgUrl(img), getMmgUrl(Buffer.from('gambar-palsu-1'))]);
    assert.equal(u1, OK.mediaUrl);
    assert.equal(u2, OK.mediaUrl);
    assert.equal(uploads, 1);
    await getMmgUrl(img);
    assert.equal(uploads, 1);
    assert.equal(await getMmgUrl(OK.directPath), OK.mediaUrl);
    assert.equal(uploads, 1);
    const urls = await getMmgImageUrls(img);
    assert.equal(urls.imagePreviewUrl, urls.imageHighResUrl);
    assert.equal(uploads, 1);
    await getMmgUrl(Buffer.from('gambar-lain'));
    assert.equal(uploads, 2);
    await assert.rejects(getMmgUrl(Buffer.alloc(0)), /kosong/);
});

const fakeSock = () => {
    const sent = [];
    return { sent, sendPresenceUpdate: async (type, jid) => { sent.push([type, jid]); } };
};

test('presence: normalizeSteps memakai text untuk durasi dan menolak state salah', () => {
    const [a] = normalizeSteps({ type: 'composing', text: 'x'.repeat(50) });
    assert.equal(a.duration, 3000);
    const [b] = normalizeSteps({ type: 'recording' });
    assert.equal(b.duration, 2000);
    assert.throws(() => normalizeSteps({ type: 'available' }), /tidak valid/);
});

test('presence: urutan recording lalu composing, ditutup paused', async () => {
    const sock = fakeSock();
    const p = makeCustomPresence(sock, { refreshEvery: 1000 });
    await p.sendCustomPresence('a@s.whatsapp.net', { steps: [{ type: 'recording', duration: 10 }, { type: 'composing', duration: 10 }] });
    assert.deepEqual(sock.sent.map(x => x[0]), ['recording', 'composing', 'paused']);
});

test('presence: state ditahan lama dikirim ulang tiap refreshEvery', async () => {
    const sock = fakeSock();
    const p = makeCustomPresence(sock, { refreshEvery: 20 });
    await p.sendCustomPresence('a@s.whatsapp.net', { type: 'composing', duration: 70, finish: 'none' });
    const n = sock.sent.filter(x => x[0] === 'composing').length;
    assert.ok(n >= 3 && n <= 5, `composing terkirim ${n}x`);
});

test('presence: wait:false, stopPresence mengirim paused, sesi baru menggantikan tanpa paused', async () => {
    const sock = fakeSock();
    const p = makeCustomPresence(sock, { refreshEvery: 1000 });
    const jid = 'b@s.whatsapp.net';
    const handle = await p.sendCustomPresence(jid, { type: 'recording', duration: 5000, wait: false });
    assert.deepEqual(sock.sent, [['recording', jid]]);
    await p.sendCustomPresence(jid, { type: 'composing', duration: 5000, wait: false });
    await sleep(5);
    assert.deepEqual(sock.sent.map(x => x[0]), ['recording', 'composing']);
    assert.equal(await p.stopPresence(jid), true);
    assert.deepEqual(sock.sent.map(x => x[0]), ['recording', 'composing', 'paused']);
    assert.equal(await p.stopPresence(jid), false);
    assert.equal(typeof handle.stop, 'function');
});

test('presence: error dari pengiriman pertama sampai ke pemanggil', async () => {
    const sock = { sendPresenceUpdate: async () => { throw new Error('closed'); } };
    const p = makeCustomPresence(sock);
    await assert.rejects(p.sendCustomPresence('a@s.whatsapp.net', { type: 'composing', duration: 10 }), /closed/);
    await assert.rejects(p.sendCustomPresence('a@s.whatsapp.net', { type: 'composing', duration: 10, wait: false }), /closed/);
});

test('sendImageHd: caption string, mimetype terdeteksi, buffer asli dan opsi kirim diteruskan', async () => {
    const calls = [];
    const send = makeSendImageHd({ sendMessage: async (...args) => { calls.push(args); return { ok: true }; } });
    const png = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), Buffer.alloc(32)]);
    const quoted = { key: { id: 'Q' } };
    const res = await send('a@s.whatsapp.net', png, 'halo', { quoted });
    assert.deepEqual(res, { ok: true });
    const [jid, content, options] = calls[0];
    assert.equal(jid, 'a@s.whatsapp.net');
    assert.equal(content.image, png);
    assert.equal(content.caption, 'halo');
    assert.equal(content.mimetype, 'image/png');
    assert.equal(options.quoted, quoted);
    await send('a@s.whatsapp.net', png, { caption: 'x', mimetype: 'image/jpeg', viewOnce: true, thumbWidth: 128 });
    const second = calls[1][1];
    assert.equal(second.mimetype, 'image/jpeg');
    assert.equal(second.viewOnce, true);
    assert.equal('thumbWidth' in second, false);
});

test('sendImageHd: jid kosong atau gambar kosong ditolak', async () => {
    const send = makeSendImageHd({ sendMessage: async () => ({}) });
    await assert.rejects(send('', Buffer.from('x')), /jid/);
    await assert.rejects(send('a@s.whatsapp.net', Buffer.alloc(0)), /kosong/);
});
