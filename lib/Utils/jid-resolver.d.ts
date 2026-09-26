export type JidResolverOptions = {
    cacheSize?: number;
    /** TTL cache hasil ditemukan (ms, default 6 jam) */
    ttl?: number;
    /** TTL cache hasil tidak ditemukan (ms, default 60 dtk) */
    negativeTtl?: number;
    /** coba metadata grup bila mapping tidak ada (default true) */
    useGroupMetadata?: boolean;
    /** kembalikan LID asli (bukan null) jika gagal resolve */
    fallbackToLid?: boolean;
    logger?: any;
};
export type GetRealJidContext = {
    groupJid?: string;
    /** pesan yang membawa participantAlt/remoteJidAlt sebagai petunjuk */
    message?: { key?: { remoteJid?: string | null; participant?: string | null; participantAlt?: string | null; remoteJidAlt?: string | null } };
    /** abaikan negative cache */
    force?: boolean;
};
export interface JidResolverMethods {
    getRealJid: (jid: string | null | undefined, ctx?: GetRealJidContext) => Promise<string | null>;
    getRealJids: (jids: Array<string | null | undefined>, ctx?: GetRealJidContext) => Promise<Array<string | null>>;
    getLidForJid: (jid: string) => Promise<string | null>;
    jidResolver: { cache: import('./lru-map.js').LRUMap<string>; clear: () => void };
}
export declare const makeJidResolver: <T extends object>(sock: T, opts?: JidResolverOptions) => T & JidResolverMethods;
