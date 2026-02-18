// TTLStore Tests

import { TTLStore } from './ttlStore';

describe('TTLStore', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('basic operations', () => {
    it('should set and get values', () => {
      const store = new TTLStore<string>();
      store.set('key1', 'value1');
      expect(store.get('key1')).toBe('value1');
      store.destroy();
    });

    it('should return undefined for missing keys', () => {
      const store = new TTLStore<string>();
      expect(store.get('missing')).toBeUndefined();
      store.destroy();
    });

    it('should check existence with has()', () => {
      const store = new TTLStore<string>();
      store.set('key1', 'value1');
      expect(store.has('key1')).toBe(true);
      expect(store.has('missing')).toBe(false);
      store.destroy();
    });

    it('should delete entries', () => {
      const store = new TTLStore<string>();
      store.set('key1', 'value1');
      expect(store.delete('key1')).toBe(true);
      expect(store.get('key1')).toBeUndefined();
      expect(store.delete('missing')).toBe(false);
      store.destroy();
    });

    it('should update existing entries in-place', () => {
      const store = new TTLStore<string>();
      store.set('key1', 'original');
      store.set('key1', 'updated');
      expect(store.get('key1')).toBe('updated');
      expect(store.size).toBe(1);
      store.destroy();
    });

    it('should report size', () => {
      const store = new TTLStore<number>();
      expect(store.size).toBe(0);
      store.set('a', 1);
      store.set('b', 2);
      expect(store.size).toBe(2);
      store.destroy();
    });

    it('should clear all entries', () => {
      const store = new TTLStore<number>();
      store.set('a', 1);
      store.set('b', 2);
      store.clear();
      expect(store.size).toBe(0);
      store.destroy();
    });
  });

  describe('TTL expiration', () => {
    it('should expire entries after TTL', () => {
      const store = new TTLStore<string>({ defaultTTLMs: 5000 });
      store.set('key1', 'value1');

      expect(store.get('key1')).toBe('value1');

      jest.advanceTimersByTime(5001);

      expect(store.get('key1')).toBeUndefined();
      expect(store.has('key1')).toBe(false);
      store.destroy();
    });

    it('should support per-entry custom TTL', () => {
      const store = new TTLStore<string>({ defaultTTLMs: 10000 });
      store.set('short', 'value', 2000);
      store.set('long', 'value', 20000);

      jest.advanceTimersByTime(3000);

      expect(store.get('short')).toBeUndefined();
      expect(store.get('long')).toBe('value');
      store.destroy();
    });

    it('should not return expired entries in values()', () => {
      const store = new TTLStore<string>({ defaultTTLMs: 5000 });
      store.set('live', 'alive');
      store.set('dying', 'soon', 1000);

      jest.advanceTimersByTime(2000);

      const vals = store.values();
      expect(vals).toEqual(['alive']);
      store.destroy();
    });

    it('should not return expired entries in entries()', () => {
      const store = new TTLStore<string>({ defaultTTLMs: 5000 });
      store.set('live', 'alive');
      store.set('dying', 'soon', 1000);

      jest.advanceTimersByTime(2000);

      const ents = store.entries();
      expect(ents).toEqual([['live', 'alive']]);
      store.destroy();
    });
  });

  describe('capacity and eviction', () => {
    it('should evict oldest entry when at capacity', () => {
      const store = new TTLStore<number>({ maxSize: 3 });
      store.set('a', 1);

      jest.advanceTimersByTime(10);
      store.set('b', 2);

      jest.advanceTimersByTime(10);
      store.set('c', 3);

      // At capacity — next set should evict 'a' (oldest lastAccessedAt)
      store.set('d', 4);

      expect(store.get('a')).toBeUndefined();
      expect(store.get('b')).toBe(2);
      expect(store.get('d')).toBe(4);
      expect(store.size).toBe(3);
      store.destroy();
    });

    it('should prefer evicting expired entries over live ones', () => {
      const store = new TTLStore<number>({ maxSize: 3, defaultTTLMs: 5000 });
      store.set('a', 1, 1000); // Short TTL
      store.set('b', 2);
      store.set('c', 3);

      jest.advanceTimersByTime(2000); // 'a' is now expired

      store.set('d', 4); // Should evict 'a' (expired) not 'b' (oldest live)

      expect(store.get('a')).toBeUndefined();
      expect(store.get('b')).toBe(2);
      expect(store.get('d')).toBe(4);
      store.destroy();
    });
  });

  describe('cleanup', () => {
    it('should remove expired entries on cleanup()', () => {
      const store = new TTLStore<string>({ defaultTTLMs: 3000 });
      store.set('live', 'alive', 10000);
      store.set('dead1', 'expired', 1000);
      store.set('dead2', 'expired', 2000);

      jest.advanceTimersByTime(3000);

      const removed = store.cleanup();
      expect(removed).toBe(2);
      expect(store.size).toBe(1);
      expect(store.get('live')).toBe('alive');
      store.destroy();
    });

    it('should run periodic cleanup via interval', () => {
      const store = new TTLStore<string>({
        defaultTTLMs: 5000,
        cleanupIntervalMs: 10000,
      });
      store.set('a', 'value');

      jest.advanceTimersByTime(6000); // Entry expired but cleanup hasn't run
      expect(store.size).toBe(1); // Still in map (lazy delete on access)

      jest.advanceTimersByTime(5000); // Total 11s — cleanup runs at 10s
      expect(store.size).toBe(0); // Cleaned up
      store.destroy();
    });
  });

  describe('destroy', () => {
    it('should clear store and stop cleanup interval', () => {
      const store = new TTLStore<string>({ defaultTTLMs: 5000 });
      store.set('key', 'value');
      store.destroy();
      expect(store.size).toBe(0);
    });
  });
});
