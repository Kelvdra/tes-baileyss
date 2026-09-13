import type { WASocket } from '../Types/index.js';

/**
 * Resolve LID / mention JID / participant ID menjadi JID @s.whatsapp.net.
 *
 * @param conn    WASocket instance
 * @param m       serialized message object (dari handler)
 * @param target  JID/LID eksplisit, opsional (override dari m)
 * @returns       JID @s.whatsapp.net atau null jika tidak bisa di-resolve
 *
 * @example
 * const jid = await resolveJid(conn, m);
 * if (!jid) return conn.sendMessage(m.chat, { text: 'Gagal resolve JID' });
 * await conn.sendMessage(m.chat, { text: `JID: ${jid}` });
 *
 * @example
 * // Resolve dari mention pertama
 * const jid = await resolveJid(conn, m, m.mentionedJid?.[0]);
 */
export declare function resolveJid(
    conn: WASocket,
    m: {
        sender?: string;
        jid?: string;
        chat?: string;
        isGroup?: boolean;
        mentionedJid?: string[];
        quoted?: { sender?: string; participant?: string };
    },
    target?: string | null
): Promise<string | null>;

/**
 * Resolve banyak JID/LID sekaligus.
 *
 * @example
 * const jids = await resolveJids(conn, m, m.mentionedJid);
 */
export declare function resolveJids(
    conn: WASocket,
    m: Parameters<typeof resolveJid>[1],
    targets?: string[]
): Promise<(string | null)[]>;
