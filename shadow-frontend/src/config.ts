/** Centralized environment configuration */

/** Raw facilitator URL (used for SDK client init & FACILITATOR_ENABLED check) */
export const FACILITATOR_URL =
  import.meta.env.VITE_FACILITATOR_URL || import.meta.env.VITE_API_URL || '/api';

/** Base URL for browser fetch calls — prefers the Vite proxy path to avoid CORS */
export const API_BASE =
  import.meta.env.VITE_API_URL || import.meta.env.VITE_FACILITATOR_URL || '/api';

/** Facilitator is always required for real testnet execution */
export const FACILITATOR_ENABLED = true;

// Warn in dev mode when no explicit facilitator URL is configured
if (import.meta.env.DEV && !import.meta.env.VITE_FACILITATOR_URL && !import.meta.env.VITE_API_URL) {
  console.warn('[config] No VITE_FACILITATOR_URL or VITE_API_URL set — using /api proxy fallback');
}

export const ADMIN_ADDRESS =
  import.meta.env.VITE_ADMIN_ADDRESS ||
  'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';
