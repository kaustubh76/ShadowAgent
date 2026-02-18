// TTL-Based In-Memory Store
//
// Provides bounded, auto-evicting storage for route-level data.
// Entries expire after a configurable TTL and are cleaned up periodically.
// Max capacity enforced with LRU eviction (oldest entry removed first).

export interface TTLStoreOptions {
  /** Maximum number of entries (default: 10000) */
  maxSize?: number;
  /** Time-to-live in milliseconds (default: 24 hours) */
  defaultTTLMs?: number;
  /** How often to run cleanup in milliseconds (default: 60 seconds) */
  cleanupIntervalMs?: number;
}

interface StoreEntry<T> {
  value: T;
  createdAt: number;
  lastAccessedAt: number;
  ttlMs: number;
}

export class TTLStore<T> {
  private store: Map<string, StoreEntry<T>> = new Map();
  private maxSize: number;
  private defaultTTLMs: number;
  private cleanupInterval: ReturnType<typeof setInterval> | null = null;

  constructor(options: TTLStoreOptions = {}) {
    this.maxSize = options.maxSize ?? 10_000;
    this.defaultTTLMs = options.defaultTTLMs ?? 86_400_000; // 24 hours
    const cleanupMs = options.cleanupIntervalMs ?? 60_000;

    this.cleanupInterval = setInterval(() => this.cleanup(), cleanupMs);
    if (this.cleanupInterval.unref) this.cleanupInterval.unref();
  }

  /** Get an entry by key. Returns undefined if expired or missing. */
  get(key: string): T | undefined {
    const entry = this.store.get(key);
    if (!entry) return undefined;

    if (this.isExpired(entry)) {
      this.store.delete(key);
      return undefined;
    }

    entry.lastAccessedAt = Date.now();
    return entry.value;
  }

  /** Check if a key exists and is not expired. */
  has(key: string): boolean {
    const entry = this.store.get(key);
    if (!entry) return false;
    if (this.isExpired(entry)) {
      this.store.delete(key);
      return false;
    }
    return true;
  }

  /** Set an entry with optional custom TTL. Evicts oldest if at capacity. */
  set(key: string, value: T, ttlMs?: number): void {
    // If key already exists, update in-place (no eviction needed)
    if (this.store.has(key)) {
      const entry = this.store.get(key)!;
      entry.value = value;
      entry.lastAccessedAt = Date.now();
      entry.ttlMs = ttlMs ?? this.defaultTTLMs;
      return;
    }

    // Evict if at capacity
    if (this.store.size >= this.maxSize) {
      this.evictOldest();
    }

    const now = Date.now();
    this.store.set(key, {
      value,
      createdAt: now,
      lastAccessedAt: now,
      ttlMs: ttlMs ?? this.defaultTTLMs,
    });
  }

  /** Delete an entry by key. Returns true if the entry existed. */
  delete(key: string): boolean {
    return this.store.delete(key);
  }

  /** Get all non-expired values. */
  values(): T[] {
    const result: T[] = [];
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt >= entry.ttlMs) {
        this.store.delete(key);
      } else {
        result.push(entry.value);
      }
    }
    return result;
  }

  /** Get all non-expired entries as [key, value] pairs. */
  entries(): Array<[string, T]> {
    const result: Array<[string, T]> = [];
    const now = Date.now();
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt >= entry.ttlMs) {
        this.store.delete(key);
      } else {
        result.push([key, entry.value]);
      }
    }
    return result;
  }

  /** Current number of entries (may include expired entries not yet cleaned). */
  get size(): number {
    return this.store.size;
  }

  /** Remove all expired entries. */
  cleanup(): number {
    const now = Date.now();
    let removed = 0;
    for (const [key, entry] of this.store) {
      if (now - entry.createdAt >= entry.ttlMs) {
        this.store.delete(key);
        removed++;
      }
    }
    return removed;
  }

  /** Clear all entries. */
  clear(): void {
    this.store.clear();
  }

  /** Stop the cleanup interval (for graceful shutdown). */
  destroy(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
    this.store.clear();
  }

  private isExpired(entry: StoreEntry<T>): boolean {
    return Date.now() - entry.createdAt >= entry.ttlMs;
  }

  private evictOldest(): void {
    let oldestKey: string | null = null;
    let oldestTime = Infinity;

    for (const [key, entry] of this.store) {
      // Prefer evicting expired entries first
      if (this.isExpired(entry)) {
        this.store.delete(key);
        return;
      }
      if (entry.lastAccessedAt < oldestTime) {
        oldestTime = entry.lastAccessedAt;
        oldestKey = key;
      }
    }

    if (oldestKey) {
      this.store.delete(oldestKey);
    }
  }
}
