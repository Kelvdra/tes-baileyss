/**
 * messages-newsletter.js
 * Helper utilities untuk kirim pesan ke WhatsApp newsletter/channel.
 *
 * Fitur:
 *   - sendNewsletterText     — teks biasa
 *   - sendNewsletterImage    — gambar + caption opsional
 *   - sendNewsletterVideo    — video + caption opsional
 *   - sendNewsletterPtv      — PTV (video note)
 *   - sendNewsletterAudio    — audio
 *   - sendNewsletterDocument — dokumen/file
 *   - sendNewsletterSticker  — sticker
 *   - sendNewsletterButtons  — teks + quick_reply buttons
 *   - sendNewsletterList     — teks + single_select list
 *   - sendNewsletterCtaUrl   — teks + CTA URL button
 *   - sendNewsletterReact    — react ke server message ID
 *   - editNewsletterMessage  — edit pesan yg sudah dikirim
 *   - deleteNewsletterMessage — hapus pesan
 */

/**
 * Normalise newsletter JID.
 * @param {string} jid
 */
function _nl(jid) {
    return jid.endsWith('@newsletter') ? jid : `${jid}@newsletter`;
}

/**
 * Buat object utils newsletter yang terikat ke conn.
 * @param {import('../Types').WASocket} conn
 */
export function makeNewsletterUtils(conn) {

    // ── internal helpers ────────────────────────────────────────────────────

    async function _send(jid, content, options = {}) {
        return conn.sendMessage(_nl(jid), content, options);
    }

    // ── Text ────────────────────────────────────────────────────────────────

    /**
     * Kirim teks ke newsletter.
     * @param {string} jid
     * @param {string} text
     * @param {object} [options]
     */
    async function sendNewsletterText(jid, text, options = {}) {
        return _send(jid, { text }, options);
    }

    // ── Media ───────────────────────────────────────────────────────────────

    /**
     * Kirim gambar ke newsletter.
     * @param {string} jid
     * @param {import('../Types').WAMediaUpload} image
     * @param {object} [options]  { caption, mimetype, jpegThumbnail }
     */
    async function sendNewsletterImage(jid, image, options = {}) {
        return _send(jid, { image, caption: options.caption, mimetype: options.mimetype, jpegThumbnail: options.jpegThumbnail }, options);
    }

    /**
     * Kirim video ke newsletter.
     * @param {string} jid
     * @param {import('../Types').WAMediaUpload} video
     * @param {object} [options]  { caption, mimetype, gifPlayback }
     */
    async function sendNewsletterVideo(jid, video, options = {}) {
        return _send(jid, { video, caption: options.caption, mimetype: options.mimetype, gifPlayback: options.gifPlayback }, options);
    }

    /**
     * Kirim PTV (video note / lingkaran) ke newsletter.
     * @param {string} jid
     * @param {import('../Types').WAMediaUpload} video
     * @param {object} [options]
     */
    async function sendNewsletterPtv(jid, video, options = {}) {
        return _send(jid, { video, ptv: true, mimetype: options.mimetype || 'video/mp4' }, options);
    }

    /**
     * Kirim audio ke newsletter.
     * @param {string} jid
     * @param {import('../Types').WAMediaUpload} audio
     * @param {object} [options]  { mimetype, seconds, ptt }
     */
    async function sendNewsletterAudio(jid, audio, options = {}) {
        return _send(jid, { audio, mimetype: options.mimetype, seconds: options.seconds, ptt: options.ptt }, options);
    }

    /**
     * Kirim dokumen ke newsletter.
     * @param {string} jid
     * @param {import('../Types').WAMediaUpload} document
     * @param {object} [options]  { mimetype, fileName, caption }
     */
    async function sendNewsletterDocument(jid, document, options = {}) {
        return _send(jid, {
            document,
            mimetype: options.mimetype || 'application/octet-stream',
            fileName: options.fileName || 'file',
            caption: options.caption
        }, options);
    }

    /**
     * Kirim sticker ke newsletter.
     * @param {string} jid
     * @param {import('../Types').WAMediaUpload} sticker
     * @param {object} [options]  { isAnimated }
     */
    async function sendNewsletterSticker(jid, sticker, options = {}) {
        return _send(jid, { sticker, isAnimated: options.isAnimated }, options);
    }

    // ── Buttons ─────────────────────────────────────────────────────────────

    /**
     * Kirim pesan dengan tombol quick_reply ke newsletter.
     *
     * @param {string} jid
     * @param {object} params
     * @param {string} params.body            — isi teks pesan
     * @param {Array<{id: string, text: string}>} params.buttons  — maks 3 tombol
     * @param {string} [params.title]         — judul header (opsional)
     * @param {string} [params.footer]        — footer (opsional)
     * @param {object} [options]
     *
     * @example
     * await nl.sendNewsletterButtons('120363...@newsletter', {
     *   body: 'Pilih salah satu:',
     *   buttons: [
     *     { id: 'btn_1', text: '✅ Setuju' },
     *     { id: 'btn_2', text: '❌ Tidak' },
     *   ],
     *   footer: 'Powered by bot'
     * });
     */
    async function sendNewsletterButtons(jid, params, options = {}) {
        const { body, buttons = [], title, footer } = params;
        const nativeButtons = buttons.map(b => ({
            name: 'quick_reply',
            buttonParamsJson: JSON.stringify({
                display_text: b.text || b.displayText || '',
                id: b.id || b.text || ''
            })
        }));
        const interactiveMessage = {
            nativeFlowMessage: {
                buttons: nativeButtons,
                messageParamsJson: '',
                messageVersion: 1
            },
            body: { text: body || '' },
            ...(footer ? { footer: { text: footer } } : {}),
            ...(title ? { header: { title, hasMediaAttachment: false, subtitle: '' } } : {})
        };
        return _send(jid, { interactiveMessage }, options);
    }

    /**
     * Kirim pesan dengan list single_select ke newsletter.
     *
     * @param {string} jid
     * @param {object} params
     * @param {string} params.body
     * @param {string} params.buttonText       — teks tombol pembuka list
     * @param {Array<{title: string, rows: Array<{id: string, title: string, description?: string}>}>} params.sections
     * @param {string} [params.title]
     * @param {string} [params.footer]
     * @param {object} [options]
     *
     * @example
     * await nl.sendNewsletterList('120363...@newsletter', {
     *   body: 'Pilih menu:',
     *   buttonText: 'Buka Menu',
     *   sections: [{
     *     title: 'Kategori',
     *     rows: [
     *       { id: 'info', title: 'Info Bot' },
     *       { id: 'help', title: 'Bantuan' },
     *     ]
     *   }]
     * });
     */
    async function sendNewsletterList(jid, params, options = {}) {
        const { body, buttonText, sections = [], title, footer } = params;
        const interactiveMessage = {
            nativeFlowMessage: {
                buttons: [{
                    name: 'single_select',
                    buttonParamsJson: JSON.stringify({
                        title: buttonText || 'Select',
                        sections: sections.map(sec => ({
                            title: sec.title || '',
                            highlight_label: '',
                            rows: (sec.rows || []).map(row => ({
                                header: '',
                                title: row.title || '',
                                description: row.description || '',
                                id: row.id || row.rowId || row.title || ''
                            }))
                        }))
                    })
                }],
                messageParamsJson: '',
                messageVersion: 1
            },
            body: { text: body || '' },
            ...(footer ? { footer: { text: footer } } : {}),
            ...(title ? { header: { title, hasMediaAttachment: false, subtitle: '' } } : {})
        };
        return _send(jid, { interactiveMessage }, options);
    }

    /**
     * Kirim pesan dengan CTA URL button ke newsletter.
     *
     * @param {string} jid
     * @param {object} params
     * @param {string} params.body
     * @param {string} params.buttonText    — teks tombol
     * @param {string} params.url           — URL tujuan
     * @param {string} [params.title]
     * @param {string} [params.footer]
     * @param {object} [options]
     *
     * @example
     * await nl.sendNewsletterCtaUrl('120363...@newsletter', {
     *   body: 'Kunjungi website kami!',
     *   buttonText: 'Buka Website',
     *   url: 'https://example.com',
     * });
     */
    async function sendNewsletterCtaUrl(jid, params, options = {}) {
        const { body, buttonText, url, title, footer } = params;
        const interactiveMessage = {
            nativeFlowMessage: {
                buttons: [{
                    name: 'cta_url',
                    buttonParamsJson: JSON.stringify({
                        display_text: buttonText || 'Open',
                        url: url || '',
                        merchant_url: url || ''
                    })
                }],
                messageParamsJson: '',
                messageVersion: 1
            },
            body: { text: body || '' },
            ...(footer ? { footer: { text: footer } } : {}),
            ...(title ? { header: { title, hasMediaAttachment: false, subtitle: '' } } : {})
        };
        return _send(jid, { interactiveMessage }, options);
    }

    // ── Reactions ───────────────────────────────────────────────────────────

    /**
     * React ke pesan newsletter via server message ID.
     * @param {string} jid
     * @param {string} serverId   — dari raw.newsletter_server_id
     * @param {string} [emoji]    — kosong untuk unreact
     */
    async function sendNewsletterReact(jid, serverId, emoji) {
        return conn.newsletterReactMessage(_nl(jid), serverId, emoji);
    }

    // ── Edit / Delete ───────────────────────────────────────────────────────

    /**
     * Edit pesan newsletter yang sudah terkirim.
     * @param {string} jid
     * @param {string} messageId  — key.id dari pesan asli
     * @param {string} newText    — teks baru
     */
    async function editNewsletterMessage(jid, messageId, newText) {
        return _send(jid, {
            text: newText,
            edit: { remoteJid: _nl(jid), fromMe: true, id: messageId }
        });
    }

    /**
     * Hapus pesan newsletter.
     * @param {string} jid
     * @param {string} messageId  — key.id dari pesan yang dihapus
     */
    async function deleteNewsletterMessage(jid, messageId) {
        return _send(jid, {
            delete: { remoteJid: _nl(jid), fromMe: true, id: messageId }
        });
    }

    // ── return ───────────────────────────────────────────────────────────────

    return {
        sendNewsletterText,
        sendNewsletterImage,
        sendNewsletterVideo,
        sendNewsletterPtv,
        sendNewsletterAudio,
        sendNewsletterDocument,
        sendNewsletterSticker,
        sendNewsletterButtons,
        sendNewsletterList,
        sendNewsletterCtaUrl,
        sendNewsletterReact,
        editNewsletterMessage,
        deleteNewsletterMessage,
    };
}
