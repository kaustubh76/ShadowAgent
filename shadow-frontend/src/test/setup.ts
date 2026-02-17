import '@testing-library/jest-dom/vitest';

// Mock import.meta.env for tests
// Individual tests can override these via vi.stubEnv()
if (!import.meta.env.VITE_FACILITATOR_URL) {
  // @ts-expect-error - test env override
  import.meta.env.VITE_FACILITATOR_URL = '';
}
if (!import.meta.env.VITE_API_URL) {
  // @ts-expect-error - test env override
  import.meta.env.VITE_API_URL = '/api';
}

// Mock @provablehq/sdk to avoid WASM loading in tests
vi.mock('@provablehq/sdk', () => ({
  Account: vi.fn().mockImplementation(() => ({
    address: () => ({ to_string: () => 'aleo1testaddress' }),
  })),
  ProgramManager: vi.fn(),
  AleoNetworkClient: vi.fn(),
  AleoKeyProvider: vi.fn().mockImplementation(() => ({
    useCache: vi.fn(),
  })),
  NetworkRecordProvider: vi.fn(),
}));

// Mock @shadowagent/sdk to avoid WASM import chain
vi.mock('@shadowagent/sdk', () => ({
  ShadowAgentClient: vi.fn().mockImplementation(() => ({
    searchAgents: vi.fn().mockResolvedValue({ agents: [], total: 0, limit: 20, offset: 0 }),
    getAgent: vi.fn().mockResolvedValue(null),
    getHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
    setConfig: vi.fn(),
    verifyReputationProof: vi.fn().mockResolvedValue({ valid: true }),
  })),
}));
