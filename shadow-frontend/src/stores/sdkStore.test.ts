import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSDKStore } from './sdkStore';

// Create a mock client matching what the SDK mock returns
function createMockClient() {
  return {
    searchAgents: vi.fn().mockResolvedValue({ agents: [], total: 0, limit: 20, offset: 0 }),
    getAgent: vi.fn().mockResolvedValue(null),
    getHealth: vi.fn().mockResolvedValue({ status: 'ok' }),
    setConfig: vi.fn(),
    verifyReputationProof: vi.fn().mockResolvedValue({ valid: true }),
  };
}

describe('sdkStore', () => {
  beforeEach(() => {
    useSDKStore.setState({
      client: null,
      isInitialized: false,
      facilitatorHealthy: false,
      lastHealthCheck: null,
    });
  });

  describe('initial state', () => {
    it('starts uninitialized', () => {
      const state = useSDKStore.getState();
      expect(state.client).toBeNull();
      expect(state.isInitialized).toBe(false);
      expect(state.facilitatorHealthy).toBe(false);
      expect(state.lastHealthCheck).toBeNull();
    });
  });

  describe('initializeClient', () => {
    it('is idempotent - does not recreate client when already set', async () => {
      const mockClient = createMockClient();
      useSDKStore.setState({ client: mockClient, isInitialized: true });
      await useSDKStore.getState().initializeClient();
      expect(useSDKStore.getState().client).toBe(mockClient);
    });

    it('calls setConfig when re-initializing with config', async () => {
      const mockClient = createMockClient();
      useSDKStore.setState({ client: mockClient, isInitialized: true });
      await useSDKStore.getState().initializeClient({ timeout: 5000 });
      expect(mockClient.setConfig).toHaveBeenCalledWith({ timeout: 5000 });
    });
  });

  describe('updateConfig', () => {
    it('calls setConfig on existing client', () => {
      const mockClient = createMockClient();
      useSDKStore.setState({ client: mockClient, isInitialized: true });
      useSDKStore.getState().updateConfig({ network: 'mainnet' });
      expect(mockClient.setConfig).toHaveBeenCalledWith({ network: 'mainnet' });
    });

    it('does nothing without client', () => {
      // Should not throw
      useSDKStore.getState().updateConfig({ network: 'mainnet' });
    });
  });

  describe('checkHealth', () => {
    it('returns null when no client', async () => {
      const result = await useSDKStore.getState().checkHealth();
      expect(result).toBeNull();
    });

    it('sets facilitatorHealthy on success', async () => {
      const mockClient = createMockClient();
      useSDKStore.setState({ client: mockClient, isInitialized: true });
      const result = await useSDKStore.getState().checkHealth();
      expect(result).toEqual({ status: 'ok' });
      const state = useSDKStore.getState();
      expect(state.facilitatorHealthy).toBe(true);
      expect(state.lastHealthCheck).toBeGreaterThan(0);
    });

    it('sets facilitatorHealthy false on failure', async () => {
      const mockClient = createMockClient();
      mockClient.getHealth.mockRejectedValueOnce(new Error('Network error'));
      useSDKStore.setState({ client: mockClient, isInitialized: true });
      const result = await useSDKStore.getState().checkHealth();
      expect(result).toBeNull();
      expect(useSDKStore.getState().facilitatorHealthy).toBe(false);
    });
  });

  describe('getClient', () => {
    it('returns null and triggers init when not initialized', () => {
      const client = useSDKStore.getState().getClient();
      expect(client).toBeNull();
    });

    it('returns client when set', () => {
      const mockClient = createMockClient();
      useSDKStore.setState({ client: mockClient, isInitialized: true });
      const client = useSDKStore.getState().getClient();
      expect(client).toBe(mockClient);
    });
  });
});
