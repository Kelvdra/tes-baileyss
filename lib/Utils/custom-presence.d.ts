export type ChatPresenceState = 'composing' | 'recording' | 'paused';
export type PresenceStep = {
    type?: ChatPresenceState;
    /** durasi state dalam ms (default 2000) */
    duration?: number;
    /** kalau duration tidak diisi, durasi dihitung dari panjang teks (mensimulasikan mengetik) */
    text?: string;
};
export type CustomPresenceOptions = PresenceStep & {
    /** urutan state, menggantikan type/duration/text */
    steps?: PresenceStep[];
    /** ulangi seluruh steps sekian kali (default 1) */
    repeat?: number;
    /** state penutup (default 'paused') */
    finish?: 'paused' | 'none';
    /** false = kembali setelah state pertama terkirim, presence lanjut di background dan mengembalikan { stop } */
    wait?: boolean;
    signal?: AbortSignal;
};
export type CustomPresenceConfig = {
    duration?: number;
    /** interval kirim ulang state yang ditahan lama (default 7000) */
    refreshEvery?: number;
    perCharMs?: number;
    minTyping?: number;
    maxTyping?: number;
    finish?: 'paused' | 'none';
};
export type CustomPresenceMethods = {
    sendCustomPresence: (jid: string, options?: CustomPresenceOptions | ChatPresenceState) => Promise<void | {
        stop: () => Promise<boolean>;
    }>;
    stopPresence: (jid: string) => Promise<boolean>;
};
export declare const normalizeSteps: (options: CustomPresenceOptions, cfg?: CustomPresenceConfig) => Required<Pick<PresenceStep, 'type' | 'duration'>>[];
export declare const makeCustomPresence: (sock: {
    sendPresenceUpdate: (type: any, jid?: string) => Promise<void>;
}, config?: CustomPresenceConfig) => CustomPresenceMethods & {
    basePresenceUpdate: (type: any, jid?: string) => Promise<void>;
};
