// Consistent Hash Ring with Virtual Nodes
//
// Distributes keys across nodes with minimal disruption when nodes
// are added or removed. Virtual nodes (vnodes) ensure even distribution.
//
// Used for:
// - Distributed agent cache ownership across facilitator instances
// - Request routing to the correct facilitator instance
// - Ring-aware cache eviction in IndexerService

import crypto from 'crypto';

export interface ConsistentHashRingOptions {
  virtualNodes?: number;   // Virtual nodes per physical node (default: 150)
  hashFunction?: (key: string) => number;
}

interface VirtualNode {
  hash: number;
  nodeId: string;
}

export class ConsistentHashRing {
  private ring: VirtualNode[] = []; // Sorted by hash
  private nodes: Set<string> = new Set();
  private virtualNodeCount: number;
  private hashFn: (key: string) => number;

  constructor(options: ConsistentHashRingOptions = {}) {
    this.virtualNodeCount = options.virtualNodes || 150;
    this.hashFn = options.hashFunction || ConsistentHashRing.defaultHash;
  }

  /**
   * Default hash: MD5 truncated to 32-bit unsigned integer.
   * Fast with good distribution — not used for cryptographic purposes.
   */
  static defaultHash(key: string): number {
    const hash = crypto.createHash('md5').update(key).digest();
    return hash.readUInt32BE(0);
  }

  /**
   * Add a node to the ring with `virtualNodeCount` virtual nodes.
   */
  addNode(nodeId: string): void {
    if (this.nodes.has(nodeId)) return;

    this.nodes.add(nodeId);

    for (let i = 0; i < this.virtualNodeCount; i++) {
      const virtualKey = `${nodeId}#vnode${i}`;
      const hash = this.hashFn(virtualKey);
      this.ring.push({ hash, nodeId });
    }

    this.ring.sort((a, b) => a.hash - b.hash);
  }

  /**
   * Remove a node. Keys previously owned by this node are reassigned
   * to the next clockwise node — only ~1/N of keys are affected.
   */
  removeNode(nodeId: string): void {
    if (!this.nodes.has(nodeId)) return;

    this.nodes.delete(nodeId);
    this.ring = this.ring.filter(vnode => vnode.nodeId !== nodeId);
  }

  /**
   * Get the node responsible for a key (clockwise walk from key hash).
   */
  getNode(key: string): string | null {
    if (this.ring.length === 0) return null;

    const hash = this.hashFn(key);

    // Binary search for first vnode with hash >= key hash
    let low = 0;
    let high = this.ring.length - 1;

    // If hash exceeds all vnodes, wrap to first node
    if (hash > this.ring[high].hash) {
      return this.ring[0].nodeId;
    }

    while (low < high) {
      const mid = (low + high) >>> 1;
      if (this.ring[mid].hash < hash) {
        low = mid + 1;
      } else {
        high = mid;
      }
    }

    return this.ring[low].nodeId;
  }

  /**
   * Get N distinct physical nodes for a key (for replication).
   * Walks clockwise collecting unique node IDs.
   */
  getNodes(key: string, count: number): string[] {
    if (this.ring.length === 0) return [];

    const result: string[] = [];
    const seen = new Set<string>();
    const hash = this.hashFn(key);

    // Find starting position via binary search
    let startIdx = 0;
    if (hash <= this.ring[this.ring.length - 1].hash) {
      let low = 0;
      let high = this.ring.length - 1;
      while (low < high) {
        const mid = (low + high) >>> 1;
        if (this.ring[mid].hash < hash) {
          low = mid + 1;
        } else {
          high = mid;
        }
      }
      startIdx = low;
    }

    // Walk clockwise, collecting distinct physical nodes
    for (let i = 0; i < this.ring.length && result.length < count; i++) {
      const idx = (startIdx + i) % this.ring.length;
      const nodeId = this.ring[idx].nodeId;
      if (!seen.has(nodeId)) {
        seen.add(nodeId);
        result.push(nodeId);
      }
    }

    return result;
  }

  /**
   * Get all physical node IDs in the ring.
   */
  getNodeList(): string[] {
    return Array.from(this.nodes);
  }

  /**
   * Number of physical nodes.
   */
  getNodeCount(): number {
    return this.nodes.size;
  }

  /**
   * Total number of virtual nodes on the ring.
   */
  getRingSize(): number {
    return this.ring.length;
  }

  /**
   * Distribution statistics: number of virtual nodes per physical node.
   */
  getDistribution(): Map<string, number> {
    const dist = new Map<string, number>();
    for (const node of this.nodes) {
      dist.set(node, 0);
    }
    for (const vnode of this.ring) {
      dist.set(vnode.nodeId, (dist.get(vnode.nodeId) || 0) + 1);
    }
    return dist;
  }
}
