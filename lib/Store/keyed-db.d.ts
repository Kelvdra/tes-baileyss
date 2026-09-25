export interface Comparable<T, K> {
    key: (item: T) => K;
    compare: (k1: K, k2: K) => number;
}
export declare class KeyedDB<T, K = string> implements Iterable<T> {
    constructor(comparable: Comparable<T, any>, idGetter: keyof T | ((item: T) => K));
    readonly length: number;
    readonly first: T | undefined;
    readonly last: T | undefined;
    insert(...items: T[]): void;
    insertIfAbsent(...items: T[]): T[];
    upsert(...items: T[]): void;
    get(id: K): T | undefined;
    update(id: K, updateFn: (item: T) => void, returnUpdated?: false): boolean;
    update(id: K, updateFn: (item: T) => void, returnUpdated: true): T | false;
    updateAssign(id: K, update: Partial<T>): boolean;
    delete(item: T): boolean;
    deleteById(id: K): boolean;
    clear(): void;
    all(): T[];
    filter(predicate: (item: T) => boolean): KeyedDB<T, K>;
    toJSON(): T[];
    fromJSON(items?: T[]): void;
    [Symbol.iterator](): Iterator<T>;
}
export default KeyedDB;
