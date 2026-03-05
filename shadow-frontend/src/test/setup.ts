import '@testing-library/jest-dom/vitest';

// Set default env vars for tests
// Individual tests can override these via vi.stubEnv()
if (!import.meta.env.VITE_FACILITATOR_URL) {
  // @ts-expect-error - test env override
  import.meta.env.VITE_FACILITATOR_URL = '';
}
if (!import.meta.env.VITE_API_URL) {
  // @ts-expect-error - test env override
  import.meta.env.VITE_API_URL = '/api';
}
