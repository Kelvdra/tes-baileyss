// Pengganti ringan untuk @adiwajshing/keyed-db (dependency itu tidak ada di package.json).
// Array terurut berdasarkan comparable { key, compare } + lookup O(1) berdasarkan id.
export class KeyedDB {
    constructor(comparable, idGetter) {
        this.comparable = comparable;
        this.idGetter = typeof idGetter === 'function' ? idGetter : (item) => item[idGetter];
        this.array = [];
        this.map = new Map(); // id -> item
        this.keys = new Map(); // id -> key saat item dimasukkan (supaya bisa dicari lagi walau item sudah dimutasi)
    }
    get length() {
        return this.array.length;
    }
    get first() {
        return this.array[0];
    }
    get last() {
        return this.array[this.array.length - 1];
    }
    // posisi sisip terurut (binary search) berdasarkan key
    _index(key) {
        let lo = 0;
        let hi = this.array.length;
        while (lo < hi) {
            const mid = (lo + hi) >>> 1;
            const midKey = this.keys.get(this.idGetter(this.array[mid]));
            if (this.comparable.compare(midKey, key) < 0)
                lo = mid + 1;
            else
                hi = mid;
        }
        return lo;
    }
    _remove(id) {
        if (!this.map.has(id))
            return false;
        const item = this.map.get(id);
        let idx = this._index(this.keys.get(id));
        while (idx < this.array.length && this.array[idx] !== item)
            idx++; // key kembar: geser sampai ketemu itemnya
        if (this.array[idx] !== item)
            idx = this.array.indexOf(item);
        if (idx >= 0)
            this.array.splice(idx, 1);
        this.map.delete(id);
        this.keys.delete(id);
        return true;
    }
    _insert(item) {
        const id = this.idGetter(item);
        const key = this.comparable.key(item);
        this.keys.set(id, key);
        this.array.splice(this._index(key), 0, item);
        this.map.set(id, item);
    }
    insert(...items) {
        for (const item of items) {
            const id = this.idGetter(item);
            if (this.map.has(id))
                throw new Error(`KeyedDB: id sudah ada: ${id}`);
            this._insert(item);
        }
    }
    insertIfAbsent(...items) {
        const added = [];
        for (const item of items) {
            if (this.map.has(this.idGetter(item)))
                continue;
            this._insert(item);
            added.push(item);
        }
        return added;
    }
    upsert(...items) {
        for (const item of items) {
            this._remove(this.idGetter(item));
            this._insert(item);
        }
    }
    get(id) {
        return this.map.get(id);
    }
    // update(id, fn) -> true jika ada; posisi diurutkan ulang karena key bisa berubah
    update(id, updateFn, returnUpdated = false) {
        const item = this.map.get(id);
        if (!item)
            return false;
        this._remove(id);
        updateFn(item);
        this._insert(item);
        return returnUpdated ? item : true;
    }
    updateAssign(id, update) {
        return this.update(id, item => Object.assign(item, update));
    }
    delete(item) {
        return this._remove(this.idGetter(item));
    }
    deleteById(id) {
        return this._remove(id);
    }
    clear() {
        this.array.length = 0;
        this.map.clear();
        this.keys.clear();
    }
    all() {
        return this.array;
    }
    // sama seperti KeyedDB asli: mengembalikan koleksi baru (punya .all())
    filter(predicate) {
        const result = new KeyedDB(this.comparable, this.idGetter);
        for (const item of this.array)
            if (predicate(item))
                result._insert(item);
        return result;
    }
    toJSON() {
        return this.array;
    }
    fromJSON(items = []) {
        this.clear();
        this.upsert(...items);
    }
    [Symbol.iterator]() {
        return this.array[Symbol.iterator]();
    }
}
export default KeyedDB;
