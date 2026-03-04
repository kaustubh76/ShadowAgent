// ShadowAgent SDK - Record Store
// Manages Aleo record ciphertexts for use as inputs to record-consuming transitions.
// Records are UTXO-style: each is consumed exactly once when used as a transition input,
// and a new record is produced as output.

export interface StoredRecord {
  /** Unique key for deduplication (e.g., txId + outputIndex) */
  key: string;
  /** Program that produced this record (e.g., 'shadow_agent.aleo') */
  programId: string;
  /** Record type name (e.g., 'AgentReputation', 'AgentBond', 'EscrowRecord') */
  recordType: string;
  /** Full record ciphertext needed for transition inputs */
  ciphertext: string;
  /** Owner address */
  owner: string;
  /** When the record was stored */
  createdAt: number;
  /** True once spent in another transition */
  consumed: boolean;
  /** Optional parsed fields for filtering/display */
  metadata?: Record<string, unknown>;
}

/**
 * In-memory record ciphertext store.
 * Tracks record lifecycle (created → consumed) for UTXO-style Aleo records.
 *
 * Usage:
 * 1. After a transaction that outputs records, call store() with each record ciphertext
 * 2. Before a transition that consumes a record, call getLatest() to get the ciphertext
 * 3. After consuming, call markConsumed() so it's not reused
 *
 * Supports optional persistence callback for saving to disk/localStorage.
 */
export class RecordStore {
  private records: Map<string, StoredRecord> = new Map();
  private persistCallback?: (records: StoredRecord[]) => void;

  constructor(options?: {
    persistCallback?: (records: StoredRecord[]) => void;
    initialRecords?: StoredRecord[];
  }) {
    this.persistCallback = options?.persistCallback;
    if (options?.initialRecords) {
      this.importRecords(options.initialRecords);
    }
  }

  /**
   * Store a record ciphertext after transaction confirmation
   */
  store(record: StoredRecord): void {
    this.records.set(record.key, record);
    this.persist();
  }

  /**
   * Get the latest unconsumed record of a given type for an owner
   */
  getLatest(programId: string, recordType: string, owner: string): StoredRecord | null {
    let latest: StoredRecord | null = null;

    for (const record of this.records.values()) {
      if (
        record.programId === programId &&
        record.recordType === recordType &&
        record.owner === owner &&
        !record.consumed
      ) {
        if (!latest || record.createdAt > latest.createdAt) {
          latest = record;
        }
      }
    }

    return latest;
  }

  /**
   * Get all unconsumed records of a given type for an owner
   */
  getAll(programId: string, recordType: string, owner: string): StoredRecord[] {
    const results: StoredRecord[] = [];

    for (const record of this.records.values()) {
      if (
        record.programId === programId &&
        record.recordType === recordType &&
        record.owner === owner &&
        !record.consumed
      ) {
        results.push(record);
      }
    }

    return results.sort((a, b) => b.createdAt - a.createdAt);
  }

  /**
   * Mark a record as consumed (after it's used as a transition input)
   */
  markConsumed(key: string): void {
    const record = this.records.get(key);
    if (record) {
      record.consumed = true;
      this.persist();
    }
  }

  /**
   * Check if a record exists and is unconsumed
   */
  has(key: string): boolean {
    const record = this.records.get(key);
    return !!record && !record.consumed;
  }

  /**
   * Import records from serialized data (e.g., from localStorage or disk)
   */
  importRecords(records: StoredRecord[]): void {
    for (const record of records) {
      this.records.set(record.key, record);
    }
  }

  /**
   * Export all records for persistence
   */
  exportRecords(): StoredRecord[] {
    return Array.from(this.records.values());
  }

  /**
   * Remove consumed records older than maxAge (cleanup)
   */
  cleanup(maxAgeMs: number = 7 * 86_400_000): void {
    const cutoff = Date.now() - maxAgeMs;
    for (const [key, record] of this.records.entries()) {
      if (record.consumed && record.createdAt < cutoff) {
        this.records.delete(key);
      }
    }
    this.persist();
  }

  private persist(): void {
    this.persistCallback?.(this.exportRecords());
  }
}
