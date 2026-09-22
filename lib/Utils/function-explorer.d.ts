export interface FunctionCatalogEntry {
    name: string;
    category: string;
    categoryLabel: string;
    file: string;
    kind: 'function' | 'async function' | 'class';
    signature: string;
    example: string;
}
export interface GetFuncOptions {
    /** Cari berdasarkan (sebagian) nama function, case-insensitive. */
    search?: string;
    /** Filter berdasarkan kategori (lihat daftar kategori di output getFunc()/getSocketFunc()). */
    category?: string;
    /** true = tidak print ke console, cuma return array-nya. Default: false. */
    silent?: boolean;
}
/**
 * Menampilkan (dan mengembalikan) daftar semua function statis yang diekspor oleh
 * @kelvdra/baileys — rich message, message builder, auth-state, dll.
 */
export declare const getFunc: (options?: GetFuncOptions) => Promise<FunctionCatalogEntry[]>;
/**
 * Menampilkan (dan mengembalikan) semua function yang tersedia di sebuah instance
 * `sock` hasil makeWASocket() — sendNewsletterStatus, groupCreate, sendMessage, dll.
 */
export declare const getSocketFunc: (sock: Record<string, any>, options?: GetFuncOptions) => FunctionCatalogEntry[];
