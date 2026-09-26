import type { WASocket } from '../Types/index.js';
import type { WAMediaUpload } from '../Types/Message.js';

export interface NewsletterButtonItem {
    id: string;
    text?: string;
    displayText?: string;
}

export interface NewsletterListRow {
    id: string;
    title: string;
    description?: string;
    rowId?: string;
}

export interface NewsletterListSection {
    title?: string;
    rows: NewsletterListRow[];
}

export interface NewsletterButtonsParams {
    body: string;
    buttons: NewsletterButtonItem[];
    title?: string;
    footer?: string;
}

export interface NewsletterListParams {
    body: string;
    buttonText: string;
    sections: NewsletterListSection[];
    title?: string;
    footer?: string;
}

export interface NewsletterCtaUrlParams {
    body: string;
    buttonText: string;
    url: string;
    title?: string;
    footer?: string;
}

export interface NewsletterUtils {
    /** Kirim teks ke newsletter */
    sendNewsletterText(jid: string, text: string, options?: object): Promise<any>;
    /** Kirim gambar ke newsletter */
    sendNewsletterImage(jid: string, image: WAMediaUpload, options?: { caption?: string; mimetype?: string; jpegThumbnail?: string }): Promise<any>;
    /** Kirim video ke newsletter */
    sendNewsletterVideo(jid: string, video: WAMediaUpload, options?: { caption?: string; mimetype?: string; gifPlayback?: boolean }): Promise<any>;
    /** Kirim PTV (video note lingkaran) ke newsletter */
    sendNewsletterPtv(jid: string, video: WAMediaUpload, options?: { mimetype?: string }): Promise<any>;
    /** Kirim audio ke newsletter */
    sendNewsletterAudio(jid: string, audio: WAMediaUpload, options?: { mimetype?: string; seconds?: number; ptt?: boolean }): Promise<any>;
    /** Kirim dokumen ke newsletter */
    sendNewsletterDocument(jid: string, document: WAMediaUpload, options?: { mimetype?: string; fileName?: string; caption?: string }): Promise<any>;
    /** Kirim sticker ke newsletter */
    sendNewsletterSticker(jid: string, sticker: WAMediaUpload, options?: { isAnimated?: boolean }): Promise<any>;
    /** Kirim pesan dengan quick_reply buttons ke newsletter */
    sendNewsletterButtons(jid: string, params: NewsletterButtonsParams, options?: object): Promise<any>;
    /** Kirim pesan dengan single_select list ke newsletter */
    sendNewsletterList(jid: string, params: NewsletterListParams, options?: object): Promise<any>;
    /** Kirim pesan dengan CTA URL button ke newsletter */
    sendNewsletterCtaUrl(jid: string, params: NewsletterCtaUrlParams, options?: object): Promise<any>;
    /** React ke server message ID newsletter */
    sendNewsletterReact(jid: string, serverId: string, emoji?: string): Promise<any>;
    /** Edit pesan newsletter */
    editNewsletterMessage(jid: string, messageId: string, newText: string): Promise<any>;
    /** Hapus pesan newsletter */
    deleteNewsletterMessage(jid: string, messageId: string): Promise<any>;
}

/**
 * Buat object utilities newsletter terikat ke conn.
 *
 * @example
 * const nl = makeNewsletterUtils(conn);
 * await nl.sendNewsletterButtons('120363...@newsletter', {
 *   body: 'Pilih opsi:',
 *   buttons: [{ id: 'a', text: 'Opsi A' }, { id: 'b', text: 'Opsi B' }]
 * });
 */
export declare function makeNewsletterUtils(conn: WASocket): NewsletterUtils;
