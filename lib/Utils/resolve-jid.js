/**
 * resolve-jid.js
 * Resolve LID / participant ID menjadi JID WhatsApp asli (@s.whatsapp.net).
 *
 * Berguna saat participant.jid di grup adalah format @lid,
 * dan kamu butuh nomor WA aslinya.
 */

import { isJidGroup, jidNormalizedUser } from '../WABinary/index.js';

/**
 * Resolve LID, mention JID, atau sender menjadi JID @s.whatsapp.net.
 *
 * @param {import('../Types').WASocket} conn
 * @param {object} m        — serialized message object
 * @param {string} [target] — JID/LID eksplisit (opsional, override otomatis)
 * @returns {Promise<string|null>}
 *
 * @example
 * // Di dalam handler:
 * const jid = await resolveJid(conn, m);
 * if (!jid) return conn.sendMessage(m.chat, { text: 'Tidak bisa resolve JID' });
 * await conn.sendMessage(m.chat, { text: `JID: ${jid}` });
 *
 * @example
 * // Dengan target eksplisit (misalnya dari mention):
 * const jid = await resolveJid(conn, m, m.mentionedJid?.[0]);
 */
export async function resolveJid(conn, m, target) {
    // Tentukan input — prioritas: target > mention > quoted sender > sender
    const input =
        target ||
        (m.mentionedJid && m.mentionedJid[0]) ||
        (m.quoted && (m.quoted.sender || m.quoted.participant)) ||
        m.sender ||
        m.jid;

    if (!input) return null;

    // Sudah berbentuk JID normal → langsung return
    if (/@s\.whatsapp\.net$/.test(input)) {
        return jidNormalizedUser(input);
    }

    // Jika bukan di grup, tidak bisa resolve LID via groupMetadata
    if (!m.isGroup || !m.chat) {
        // Coba normalise saja (untuk kasus user JID tanpa domain)
        if (/^\d+$/.test(input.split('@')[0])) {
            return `${input.split('@')[0]}@s.whatsapp.net`;
        }
        return null;
    }

    let meta;
    try {
        meta = await conn.groupMetadata(m.chat);
    } catch {
        return null;
    }

    if (!meta || !Array.isArray(meta.participants)) return null;

    // Cari match di participants: by jid, id, lid, atau user number
    const inputUser = input.split('@')[0];
    const participant = meta.participants.find(p => {
        if (!p) return false;
        const pJid = p.jid || p.id || '';
        const pLid = p.lid || '';
        return (
            pJid === input ||
            pLid === input ||
            pJid.split('@')[0] === inputUser ||
            pLid.split('@')[0] === inputUser
        );
    });

    if (participant) {
        // Return JID yang sudah pasti @s.whatsapp.net
        const resolved = participant.jid || participant.id;
        if (resolved && /@s\.whatsapp\.net$/.test(resolved)) {
            return jidNormalizedUser(resolved);
        }
    }

    return null;
}

/**
 * Resolve banyak JID/LID sekaligus.
 *
 * @param {import('../Types').WASocket} conn
 * @param {object} m
 * @param {string[]} targets
 * @returns {Promise<(string|null)[]>}
 *
 * @example
 * const jids = await resolveJids(conn, m, m.mentionedJid);
 */
export async function resolveJids(conn, m, targets = []) {
    return Promise.all(targets.map(t => resolveJid(conn, m, t)));
}
