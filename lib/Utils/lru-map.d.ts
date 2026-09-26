export declare class LRUMap<V = any> {
    constructor(options?: { max?: number; ttl?: number });
    /** undefined = miss, null = negative cache */
    get(key: string): V | null | undefined;
    set(key: string, value: V | null, ttl?: number): this;
    delete(key: string): boolean;
    clear(): void;
    readonly size: number;
}
