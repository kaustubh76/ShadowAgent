import { ConsistentHashRing } from './consistentHash';

describe('ConsistentHashRing', () => {
  describe('empty ring', () => {
    it('should return null for getNode on empty ring', () => {
      const ring = new ConsistentHashRing();
      expect(ring.getNode('any-key')).toBeNull();
    });

    it('should return empty array for getNodes on empty ring', () => {
      const ring = new ConsistentHashRing();
      expect(ring.getNodes('any-key', 3)).toEqual([]);
    });

    it('should have zero node count', () => {
      const ring = new ConsistentHashRing();
      expect(ring.getNodeCount()).toBe(0);
      expect(ring.getRingSize()).toBe(0);
    });
  });

  describe('single node', () => {
    it('should assign all keys to the single node', () => {
      const ring = new ConsistentHashRing();
      ring.addNode('node-0');

      for (let i = 0; i < 100; i++) {
        expect(ring.getNode(`key-${i}`)).toBe('node-0');
      }
    });

    it('should have correct node count and ring size', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 150 });
      ring.addNode('node-0');

      expect(ring.getNodeCount()).toBe(1);
      expect(ring.getRingSize()).toBe(150);
    });

    it('should not add duplicate nodes', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 100 });
      ring.addNode('node-0');
      ring.addNode('node-0');

      expect(ring.getNodeCount()).toBe(1);
      expect(ring.getRingSize()).toBe(100);
    });
  });

  describe('multi-node distribution', () => {
    it('should distribute keys across nodes', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 150 });
      ring.addNode('node-0');
      ring.addNode('node-1');
      ring.addNode('node-2');

      const counts: Record<string, number> = { 'node-0': 0, 'node-1': 0, 'node-2': 0 };

      for (let i = 0; i < 10000; i++) {
        const node = ring.getNode(`key-${i}`);
        counts[node!]++;
      }

      // Each node should own roughly 33% of keys
      // With 150 vnodes, expect 25-40% per node
      for (const node of ['node-0', 'node-1', 'node-2']) {
        const pct = counts[node] / 10000;
        expect(pct).toBeGreaterThan(0.20);
        expect(pct).toBeLessThan(0.45);
      }
    });

    it('should be deterministic (same key always maps to same node)', () => {
      const ring = new ConsistentHashRing();
      ring.addNode('node-0');
      ring.addNode('node-1');

      const firstResult = ring.getNode('deterministic-key');
      for (let i = 0; i < 50; i++) {
        expect(ring.getNode('deterministic-key')).toBe(firstResult);
      }
    });

    it('should return correct node list', () => {
      const ring = new ConsistentHashRing();
      ring.addNode('node-a');
      ring.addNode('node-b');
      ring.addNode('node-c');

      const nodes = ring.getNodeList().sort();
      expect(nodes).toEqual(['node-a', 'node-b', 'node-c']);
    });
  });

  describe('minimal disruption on topology change', () => {
    it('should reassign fewer than 40% of keys when adding a node to 3', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 150 });
      ring.addNode('node-0');
      ring.addNode('node-1');
      ring.addNode('node-2');

      // Record initial assignments
      const totalKeys = 10000;
      const initialAssignments = new Map<string, string>();
      for (let i = 0; i < totalKeys; i++) {
        const key = `key-${i}`;
        initialAssignments.set(key, ring.getNode(key)!);
      }

      // Add a 4th node
      ring.addNode('node-3');

      // Count how many keys changed assignment
      let changed = 0;
      for (let i = 0; i < totalKeys; i++) {
        const key = `key-${i}`;
        if (ring.getNode(key) !== initialAssignments.get(key)) {
          changed++;
        }
      }

      // Ideal disruption = 1/4 = 25%. Allow up to 40%.
      const disruptionPct = changed / totalKeys;
      expect(disruptionPct).toBeLessThan(0.40);
      // At least some keys should have moved
      expect(disruptionPct).toBeGreaterThan(0.10);
    });

    it('should reassign keys from removed node only', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 150 });
      ring.addNode('node-0');
      ring.addNode('node-1');
      ring.addNode('node-2');

      // Record assignments
      const totalKeys = 5000;
      const initialAssignments = new Map<string, string>();
      for (let i = 0; i < totalKeys; i++) {
        const key = `key-${i}`;
        initialAssignments.set(key, ring.getNode(key)!);
      }

      // Remove node-1
      ring.removeNode('node-1');

      // Only keys that were on node-1 should change
      let changedFromOther = 0;
      for (let i = 0; i < totalKeys; i++) {
        const key = `key-${i}`;
        const was = initialAssignments.get(key)!;
        const now = ring.getNode(key)!;

        if (was !== 'node-1' && was !== now) {
          changedFromOther++;
        }
      }

      // Keys that were NOT on node-1 should NOT change their assignment
      expect(changedFromOther).toBe(0);
    });
  });

  describe('replication (getNodes)', () => {
    it('should return distinct physical nodes', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 50 });
      ring.addNode('node-0');
      ring.addNode('node-1');
      ring.addNode('node-2');

      const nodes = ring.getNodes('test-key', 3);
      expect(nodes.length).toBe(3);
      expect(new Set(nodes).size).toBe(3);
    });

    it('should return all available nodes if count exceeds node count', () => {
      const ring = new ConsistentHashRing();
      ring.addNode('node-0');
      ring.addNode('node-1');

      const nodes = ring.getNodes('test-key', 5);
      expect(nodes.length).toBe(2);
    });

    it('should return single node for count=1', () => {
      const ring = new ConsistentHashRing();
      ring.addNode('node-0');
      ring.addNode('node-1');

      const nodes = ring.getNodes('test-key', 1);
      expect(nodes.length).toBe(1);
      // Should match getNode result
      expect(nodes[0]).toBe(ring.getNode('test-key'));
    });
  });

  describe('node management', () => {
    it('should handle addNode idempotently', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 10 });
      ring.addNode('node-0');
      ring.addNode('node-0');
      ring.addNode('node-0');

      expect(ring.getNodeCount()).toBe(1);
      expect(ring.getRingSize()).toBe(10);
    });

    it('should handle removeNode idempotently', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 10 });
      ring.addNode('node-0');
      ring.removeNode('node-0');
      ring.removeNode('node-0');

      expect(ring.getNodeCount()).toBe(0);
      expect(ring.getRingSize()).toBe(0);
    });

    it('should handle removing non-existent node', () => {
      const ring = new ConsistentHashRing();
      ring.addNode('node-0');
      ring.removeNode('node-99');

      expect(ring.getNodeCount()).toBe(1);
    });
  });

  describe('distribution statistics', () => {
    it('should report correct vnode counts per node', () => {
      const ring = new ConsistentHashRing({ virtualNodes: 100 });
      ring.addNode('node-a');
      ring.addNode('node-b');

      const dist = ring.getDistribution();
      expect(dist.get('node-a')).toBe(100);
      expect(dist.get('node-b')).toBe(100);
    });

    it('should report empty distribution for empty ring', () => {
      const ring = new ConsistentHashRing();
      const dist = ring.getDistribution();
      expect(dist.size).toBe(0);
    });
  });

  describe('custom hash function', () => {
    it('should support custom hash function', () => {
      // Simple hash that produces predictable results
      const simpleHash = (key: string): number => {
        let h = 0;
        for (const c of key) {
          h = ((h << 5) - h + c.charCodeAt(0)) >>> 0;
        }
        return h;
      };

      const ring = new ConsistentHashRing({
        virtualNodes: 50,
        hashFunction: simpleHash,
      });
      ring.addNode('node-0');
      ring.addNode('node-1');

      // Should still produce deterministic results
      const first = ring.getNode('test-key');
      const second = ring.getNode('test-key');
      expect(first).toBe(second);
    });
  });
});
