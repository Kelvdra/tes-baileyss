// Ditambahkan khusus untuk @kelvdra/baileys: alat bantu untuk melihat semua function/fitur
// yang tersedia di library ini, lengkap dengan contoh pemakaian.
//
// Pakai:
//   import { getFunc, getSocketFunc } from '@kelvdra/baileys'
//
//   // 1) Semua function "statis" (rich message, message builder, auth-state, dll)
//   getFunc()                              // cetak semua ke console & sekaligus return array-nya
//   getFunc({ category: 'rich-messages' }) // hanya kategori tertentu
//   getFunc({ search: 'newsletter' })      // cari berdasarkan nama
//   getFunc({ silent: true })              // tidak print, cuma return array (biar bisa diolah sendiri)
//
//   // 2) Function yang nempel di object `sock` (butuh sock aktif dari makeWASocket())
//   const sock = makeWASocket({ ... })
//   getSocketFunc(sock)
//   getSocketFunc(sock, { search: 'newsletter' })
//
import { existsSync, readdirSync, statSync } from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
// lib/Utils -> lib
const LIB_ROOT = path.resolve(__dirname, '..');

// Folder mana saja yang di-scan untuk getFunc(). Socket/Signal/VoIP sengaja tidak
// discan karena isinya "factory" internal yang dipakai makeWASocket(), bukan
// function yang dipanggil langsung oleh pengguna — untuk itu pakai getSocketFunc(sock).
const SCAN_TARGETS = [
    { dir: 'Utils', category: 'utils', label: 'Utils (helper umum, auth-state, rich message, dll)' },
    { dir: 'MessageBuilder', category: 'message-builder', label: 'Message Builder (Meta AI rich response, Bloks A2UI, bot signature)' },
    { dir: 'Modded', category: 'modded', label: 'Modded (fitur bawaan Kelvdra sendiri)' },
    { dir: 'Store', category: 'store', label: 'Store (in-memory store, cache manager)' },
    { dir: 'WABinary', category: 'wabinary', label: 'WABinary (encode/decode node XMPP, jid utils)' },
    { dir: 'Types', category: 'types', label: 'Types (helper/enum bertipe function)' },
    { dir: 'Defaults', category: 'defaults', label: 'Defaults (konfigurasi & konstanta default)' },
    { dir: 'WAM', category: 'wam', label: 'WAM (WhatsApp Analytics Manager)' },
    { dir: 'WAUSync', category: 'wausync', label: 'WAUSync (USync query builder)' }
];

// Contoh pemakaian untuk function-function penting/paling sering dipakai.
// Yang tidak ada di sini akan otomatis dikasih contoh generik dari signature-nya.
const CURATED_EXAMPLES = {
    generateWAMessage: `const msg = await generateWAMessage(jid, { text: 'Halo!' }, { userJid: sock.user.id })`,
    generateWAMessageContent: `const content = await generateWAMessageContent({ text: 'Halo!' }, { userJid: sock.user.id })`,
    generateMessageIDV2: `const id = generateMessageIDV2(sock.user.id)`,
    prepareModernMessageContent: `const content = prepareModernMessageContent({ text: 'Halo', question: { text: 'Setuju?', options: ['Ya', 'Tidak'] } })`,
    sendNewsletterStatus: `await sock.sendNewsletterStatus(jid, { text: 'Halo dari status channel!' })  // lewat sock, bukan import langsung`,
    toNewsletterServerId: `const id = toNewsletterServerId('123')`,
    generateRichMessageContent: `const content = generateRichMessageContent('# Judul\\nIsi pesan **tebal**')`,
    generateTableContent: `const table = generateTableContent([['Nama','Umur'], ['Budi','20']])`,
    generateCodeBlockContent: `const code = generateCodeBlockContent('console.log(1)', 'javascript')`,
    useMultiFileAuthState: `const { state, saveCreds } = await useMultiFileAuthState('./sesi')`,
    useMongoAuthState: `const { state, saveCreds } = await useMongoAuthState({ uri: 'mongodb://localhost:27017', dbName: 'baileys' })`,
    useRedisAuthState: `const { state, saveCreds } = await useRedisAuthState({ url: 'redis://localhost:6379' })`,
    useSQLiteAuthState: `const { state, saveCreds } = await useSQLiteAuthState('./sesi.db')`,
    bindVoiceRecognition: `bindVoiceRecognition(sock, { enabled: true, transcribe: async (audioBuffer) => 'hasil teks dari STT-mu' })`,
    makeInMemoryStore: `const store = makeInMemoryStore({}); store.bind(sock.ev)`,
    makeStickerPack: `await makeStickerPack({ stickers: [...], name: 'Paket A', publisher: 'aku' })`
};

const isPlainFunction = (value) => typeof value === 'function' && !/^class[\s{]/.test(Function.prototype.toString.call(value));
const isClass = (value) => typeof value === 'function' && /^class[\s{]/.test(Function.prototype.toString.call(value));

const extractSignature = (fn, name) => {
    try {
        const src = Function.prototype.toString.call(fn);
        let match = src.match(/^(?:export\s+)?(?:default\s+)?(?:async\s+)?function\s*[^(]*\(([^)]*)\)/);
        if (!match) {
            match = src.match(/^(?:async\s*)?\(([^)]*)\)\s*=>/);
        }
        if (!match) {
            match = src.match(/^(?:async\s*)?([A-Za-z0-9_$]+)\s*=>/);
        }
        if (!match) {
            match = src.match(/^class[^(]*\(([^)]*)\)/);
        }
        const params = match ? match[1].replace(/\s+/g, ' ').trim() : '...';
        return `${name}(${params})`;
    }
    catch {
        return `${name}(...)`;
    }
};

const walkJsFiles = (dir) => {
    const out = [];
    if (!existsSync(dir)) {
        return out;
    }
    for (const entry of readdirSync(dir)) {
        const full = path.join(dir, entry);
        const stat = statSync(full);
        if (stat.isDirectory()) {
            out.push(...walkJsFiles(full));
        }
        else if (entry.endsWith('.js') && !entry.endsWith('.map.js')) {
            out.push(full);
        }
    }
    return out;
};

let cachedCatalog = null;

const buildCatalog = async () => {
    if (cachedCatalog) {
        return cachedCatalog;
    }
    const results = [];
    for (const target of SCAN_TARGETS) {
        const absDir = path.join(LIB_ROOT, target.dir);
        const files = walkJsFiles(absDir);
        for (const file of files) {
            if (path.basename(file) === 'function-explorer.js') {
                continue;
            }
            let mod;
            try {
                mod = await import(pathToFileURL(file).href);
            }
            catch {
                continue; // skip file yang gagal di-import (mis. butuh dependency optional yang belum diinstall)
            }
            const relFile = path.relative(LIB_ROOT, file).replace(/\\/g, '/');
            for (const [name, value] of Object.entries(mod)) {
                if (name === 'default') {
                    continue;
                }
                if (isPlainFunction(value) || isClass(value)) {
                    results.push({
                        name,
                        category: target.category,
                        categoryLabel: target.label,
                        file: `lib/${relFile}`,
                        kind: isClass(value) ? 'class' : (Function.prototype.toString.call(value).startsWith('async') ? 'async function' : 'function'),
                        signature: extractSignature(value, name),
                        example: CURATED_EXAMPLES[name] ?? `import { ${name} } from '@kelvdra/baileys'\n// lihat parameter: ${extractSignature(value, name)}`
                    });
                }
                else if (value && typeof value === 'object' && !Array.isArray(value)) {
                    // Object namespace seperti ElainaMessageBuilder = { Button, Carousel, Toolkit, ... }
                    for (const [subName, subValue] of Object.entries(value)) {
                        if (isPlainFunction(subValue) || isClass(subValue)) {
                            results.push({
                                name: `${name}.${subName}`,
                                category: target.category,
                                categoryLabel: target.label,
                                file: `lib/${relFile}`,
                                kind: isClass(subValue) ? 'class' : 'function',
                                signature: extractSignature(subValue, `${name}.${subName}`),
                                example: CURATED_EXAMPLES[`${name}.${subName}`] ?? `import { ${name} } from '@kelvdra/baileys'\n${name}.${subName}(...)`
                            });
                        }
                    }
                }
            }
        }
    }
    results.sort((a, b) => a.category.localeCompare(b.category) || a.name.localeCompare(b.name));
    cachedCatalog = results;
    return results;
};

const printCatalog = (entries, title) => {
    console.log(`\n=== ${title} (${entries.length} function) ===\n`);
    let lastCategory = null;
    for (const entry of entries) {
        if (entry.categoryLabel !== lastCategory) {
            lastCategory = entry.categoryLabel;
            console.log(`\n--- ${lastCategory ?? entry.category} ---`);
        }
        console.log(`• ${entry.signature}${entry.kind === 'class' ? '  [class]' : ''}`);
        console.log(`    file   : ${entry.file}`);
        console.log(`    contoh : ${entry.example.replace(/\n/g, '\n             ')}`);
    }
    console.log(`\n(total: ${entries.length} function/class ditemukan)\n`);
};

/**
 * Menampilkan (dan mengembalikan) daftar semua function statis yang diekspor oleh
 * @kelvdra/baileys — rich message, message builder, auth-state, dll.
 * Tidak termasuk function yang nempel di `sock` (pakai getSocketFunc untuk itu).
 *
 * @param {{ search?: string, category?: string, silent?: boolean }} [options]
 */
export const getFunc = async (options = {}) => {
    const { search, category, silent = false } = options;
    const all = await buildCatalog();
    let filtered = all;
    if (category) {
        filtered = filtered.filter(e => e.category.toLowerCase() === category.toLowerCase());
    }
    if (search) {
        const needle = search.toLowerCase();
        filtered = filtered.filter(e => e.name.toLowerCase().includes(needle));
    }
    if (!silent) {
        printCatalog(filtered, 'Daftar function @kelvdra/baileys');
        if (!category && !search) {
            const categories = [...new Set(all.map(e => e.category))];
            console.log(`Tip: filter per kategori dengan getFunc({ category: '...' }). Kategori tersedia: ${categories.join(', ')}`);
        }
    }
    return filtered;
};

const guessSocketCategory = (name) => {
    const n = name.toLowerCase();
    if (n.startsWith('newsletter') || n.includes('newsletter'))
        return 'Newsletter / Channel';
    if (n.startsWith('group'))
        return 'Group';
    if (n.startsWith('community') || n.includes('communities'))
        return 'Community';
    if (n.startsWith('chat'))
        return 'Chat';
    if (n.startsWith('profile') || n.includes('picture'))
        return 'Profile';
    if (n.startsWith('presence') || n === 'sendpresenceupdate')
        return 'Presence';
    if (n.startsWith('business') || n.includes('catalog') || n.includes('order') || n.includes('product'))
        return 'Business';
    if (n.includes('message') || n.startsWith('send') || n.startsWith('relay') || n.startsWith('read'))
        return 'Messages';
    if (n.includes('auth') || n.includes('creds') || n.includes('pairing') || n.includes('logout'))
        return 'Auth / Koneksi';
    if (n.includes('call'))
        return 'Call';
    return 'Lainnya';
};

/**
 * Menampilkan (dan mengembalikan) semua function yang tersedia di sebuah instance
 * `sock` hasil makeWASocket() — sendNewsletterStatus, groupCreate, sendMessage, dll.
 * Ini butuh sock yang sudah dibuat karena function-function ini dipasang runtime.
 *
 * @param {ReturnType<import('@kelvdra/baileys').makeWASocket>} sock
 * @param {{ search?: string, category?: string, silent?: boolean }} [options]
 */
export const getSocketFunc = (sock, options = {}) => {
    if (!sock || typeof sock !== 'object') {
        throw new TypeError("getSocketFunc(sock) butuh instance socket aktif, contoh: const sock = makeWASocket({...}); getSocketFunc(sock)");
    }
    const { search, category, silent = false } = options;
    const results = [];
    for (const name of Object.keys(sock)) {
        const value = sock[name];
        if (typeof value !== 'function') {
            continue;
        }
        const cat = guessSocketCategory(name);
        results.push({
            name,
            category: cat.toLowerCase().replace(/[^a-z]+/g, '-'),
            categoryLabel: cat,
            file: 'sock (runtime, dari makeWASocket())',
            kind: Function.prototype.toString.call(value).startsWith('async') ? 'async function' : 'function',
            signature: extractSignature(value, `sock.${name}`),
            example: CURATED_EXAMPLES[name] ?? `await sock.${name}(...)  // lihat parameter: ${extractSignature(value, name)}`
        });
    }
    results.sort((a, b) => a.categoryLabel.localeCompare(b.categoryLabel) || a.name.localeCompare(b.name));
    let filtered = results;
    if (category) {
        filtered = filtered.filter(e => e.categoryLabel.toLowerCase().includes(category.toLowerCase()));
    }
    if (search) {
        const needle = search.toLowerCase();
        filtered = filtered.filter(e => e.name.toLowerCase().includes(needle));
    }
    if (!silent) {
        printCatalog(filtered, 'Daftar function sock.* (@kelvdra/baileys)');
        if (!category && !search) {
            const categories = [...new Set(results.map(e => e.categoryLabel))];
            console.log(`Tip: filter per kategori dengan getSocketFunc(sock, { category: '...' }). Kategori tersedia: ${categories.join(', ')}`);
        }
    }
    return filtered;
};
