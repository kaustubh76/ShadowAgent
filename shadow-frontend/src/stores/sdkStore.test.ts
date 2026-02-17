import { describe, it, expect, beforeEach, vi } from 'vitest';
import { useSDKStore } from './sdkStore';

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
    it('creates a client and sets initialized', async () => {
      await useSDKStore.getState().initializeClient();
      const state = useSDKStore.getState();
      expect(state.client).toBeDefined();
      expect(state.isInitialized).toBe(true);
    });

    it('is idempotent - does not recreate client', async () => {
      await useSDKStore.getState().initializeClient();
      const client1 = useSDKStore.getState().client;
      await useSDKStore.getState().initializeClient();
      const client2 = useSDKStore.getState().client;
      expect(client1).toBe(client2);
    });

    it('calls setConfig when re-initializing with config', async () => {
      await useSDKStore.getState().initializeClient();
      const client = useSDKStore.getState().client;
      await useSDKStore.getState().initializeClient({ timeout: 5000 });
      expect(client.setConfig).toHaveBeenCalledWith({ timeout: 5000 });
    });
  });

  describe('updateConfig', () => {
    it('calls setConfig on existing client', async () => {
      await useSDKStore.getState().initializeClient();
      useSDKStore.getState().updateConfig({ network: 'mainnet' });
      const client = useSDKStore.getState().client;
      expect(client.setConfig).toHaveBeenCalledWith({ network: 'mainnet' });
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
      await useSDKStore.getState().initializeClient();
      const result = await useSDKStore.getState().checkHealth();
      expect(result).toEqual({ status: 'ok' });
      const state = useSDKStore.getState();
      expect(state.facilitatorHealthy).toBe(true);
      expect(state.lastHealthCheck).toBeGreaterThan(0);
    });

    it('sets facilitatorHealthy false on failure', async () => {
      await useSDKStore.getState().initializeClient();
      const client = useSDKStore.getState().client;
      client.getHealth.mockRejectedValueOnce(new Error('Network error'));
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

    it('returns client when initialized', async () => {
      await useSDKStore.getState().initializeClient();
      const client = useSDKStore.getState().getClient();
      expect(client).toBeDefined();
      expect(client).not.toBeNull();
    });
  });
});
