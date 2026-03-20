// Shared input validation helpers for facilitator routes

/**
 * Validate Aleo address format.
 * A proper Aleo address is "aleo1" followed by 58 Bech32-like lowercase alphanumeric characters.
 * We require at least 54 characters after the prefix for safety.
 */
export function isValidAleoAddress(value: unknown): value is string {
  return typeof value === 'string' && /^aleo1[a-z0-9]{54,}$/.test(value);
}

/** Check that a value is a finite positive number (rejects strings, NaN, Infinity, zero, negative) */
export function isPositiveNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0;
}

/** Check that a value is a finite positive integer */
export function isPositiveInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 && Number.isInteger(value);
}

/** Check that a value is a finite non-negative integer */
export function isNonNegativeInteger(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value) && value >= 0 && Number.isInteger(value);
}

/** Safe upper bounds to prevent DoS via absurdly large allocations */
export const SAFE_LIMITS = {
  /** 1 trillion microcredits */
  MAX_TOTAL: 1_000_000_000_000,
  /** 10k requests per rate-limit window */
  MAX_RATE_LIMIT: 10_000,
  /** ~2 years at 6s/block */
  MAX_DURATION_BLOCKS: 10_000_000,
  /** 1 trillion microcredits */
  MAX_ESCROW: 1_000_000_000_000,
  /** ~19 years in blocks */
  MAX_DEADLINE: 100_000_000,
} as const;
