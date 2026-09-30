export type UploadCacheConfig = {
    /** cache hasil upload (default true) */
    cache?: boolean;
    /** umur cache dalam ms (default 1800000) */
    cacheTtl?: number;
    cacheMax?: number;
    /** jumlah retry setelah gagal di semua host (default 3) */
    retries?: number;
    retryDelay?: number;
    retryMaxDelay?: number;
    /** ambil media_conn saat koneksi open (default true) */
    prewarm?: boolean;
};
export type UploadCacheStats = {
    hit: number;
    miss: number;
    deduped: number;
    retried: number;
    failed: number;
};
export declare const normalizeUploadConfig: (config?: boolean | UploadCacheConfig) => Required<UploadCacheConfig> | null;
export declare const makeCachedUpload: <T extends (...args: any[]) => Promise<any>>(upload: T, options?: {
    refreshMediaConn?: (forceGet?: boolean) => Promise<any>;
    logger?: any;
    config?: boolean | UploadCacheConfig;
}) => T & {
    stats?: UploadCacheStats;
    clearCache?: () => void;
};
export declare const prewarmMediaConn: (ev: {
    on: (event: string, listener: (...args: any[]) => void) => void;
}, refreshMediaConn: (forceGet?: boolean) => Promise<any>, logger?: any, config?: boolean | UploadCacheConfig) => void;
