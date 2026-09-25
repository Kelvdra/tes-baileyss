import type { proto } from '../../WAProto/index.js';
import type { Contact, GroupMetadata, WAMessage, WAMessageKey } from '../Types/index.js';
export interface LiteStoreBackend {
    readonly name: string;
    get(key: string): Promise<string | null>;
    set(key: string, value: string, ttlMs?: number): Promise<void>;
    del(key: string): Promise<void>;
    close?(): Promise<void>;
    prune?(): void;
    stats?(): { size: number };
}
export declare const memoryBackend: (opts?: { max?: number; ttl?: number }) => LiteStoreBackend;
export declare const sqliteBackend: (opts?: { path?: string; db?: any; maxMessageRows?: number; pruneIntervalMs?: number }) => Promise<LiteStoreBackend>;
export declare const redisBackend: (opts?: { client?: any; url?: string; prefix?: string }) => Promise<LiteStoreBackend>;
export type LiteStoreConfig = {
    backend?: LiteStoreBackend;
    logger?: any;
    /** default 24 jam */
    messageTtl?: number;
    /** default 7 hari */
    contactTtl?: number;
    /** default 30 menit */
    groupTtl?: number;
    serializer?: { replacer: any; reviver: any };
};
export declare const makeLiteStore: (config?: LiteStoreConfig) => {
    backend: LiteStoreBackend;
    bind: (ev: { on: Function; off?: Function }) => () => void;
    saveMessage: (msg: WAMessage) => Promise<void>;
    loadMessage: (jid: string, id: string) => Promise<WAMessage | null>;
    /** cocok langsung untuk config getMessage */
    getMessage: (key: WAMessageKey) => Promise<proto.IMessage | undefined>;
    getContact: (id: string) => Promise<Contact | null>;
    getGroupMetadata: (id: string) => Promise<GroupMetadata | null>;
    close: () => Promise<void> | undefined;
};
