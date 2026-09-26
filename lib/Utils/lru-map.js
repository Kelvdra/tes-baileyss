// LRU + TTL map kecil tanpa dependency, dipakai resolver & lite store.
// get() -> undefined = miss, null = negative cache. (Terpisah dari TTLCache bawaan di ttl-cache.js.)
export class LRUMap {
    constructor({ max = 1000, ttl = 0 } = {}) {
        this.max = max;
        this.ttl = ttl;
        this.map = new Map();
    }
    get(key) {
        const entry = this.map.get(key);
        if (!entry)
            return undefined;
        if (entry.exp && entry.exp <= Date.now()) {
            this.map.delete(key);
            return undefined;
        }
        this.map.delete(key);
        this.map.set(key, entry); // refresh posisi LRU
        return entry.v;
    }
    set(key, value, ttl = this.ttl) {
        this.map.delete(key);
        this.map.set(key, { v: value, exp: ttl ? Date.now() + ttl : 0 });
        while (this.map.size > this.max)
            this.map.delete(this.map.keys().next().value);
        return this;
    }
    delete(key) {
        return this.map.delete(key);
    }
    clear() {
        this.map.clear();
    }
    get size() {
        return this.map.size;
    }
}
