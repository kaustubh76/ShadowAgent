/** Centralized environment configuration */

export const FACILITATOR_URL =
  import.meta.env.VITE_FACILITATOR_URL || import.meta.env.VITE_API_URL || '/api';

export const API_BASE = import.meta.env.VITE_API_URL || '/api';

export const FACILITATOR_ENABLED = !!import.meta.env.VITE_FACILITATOR_URL;
