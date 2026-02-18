// SDK Client Store - Zustand state management for ShadowAgentClient
// Uses lazy import to avoid blocking React mount with WASM loading

import { create } from 'zustand';
import { FACILITATOR_URL as DEFAULT_FACILITATOR_URL } from '../config';

interface HealthStatus {
  status: string;
  blockHeight?: number;
}

interface SDKState {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  client: any | null;
  isInitialized: boolean;
  facilitatorHealthy: boolean;
  lastHealthCheck: number | null;

  // Actions
  initializeClient: (config?: Record<string, unknown>) => Promise<void>;
  updateConfig: (updates: Record<string, unknown>) => void;
  checkHealth: () => Promise<HealthStatus | null>;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  getClient: () => any;
}

export const useSDKStore = create<SDKState>((set, get) => ({
  client: null,
  isInitialized: false,
  facilitatorHealthy: false,
  lastHealthCheck: null,

  initializeClient: async (config?) => {
    const existingClient = get().client;
    if (existingClient) {
      if (config) {
        existingClient.setConfig(config);
      }
      return;
    }

    try {
      // Lazy import to avoid blocking React mount with WASM loading
      const { ShadowAgentClient } = await import('@shadowagent/sdk');
      const client = new ShadowAgentClient({
        network: 'testnet',
        facilitatorUrl: DEFAULT_FACILITATOR_URL,
        timeout: 30000,
        ...config,
      });
      set({ client, isInitialized: true });
    } catch (error) {
      console.error('Failed to initialize SDK client:', error);
      set({ isInitialized: false });
    }
  },

  updateConfig: (updates) => {
    const { client } = get();
    if (client) {
      client.setConfig(updates);
    }
  },

  checkHealth: async () => {
    const { client } = get();
    if (!client) return null;

    try {
      const health = await client.getHealth();
      set({
        facilitatorHealthy: health.status === 'ok',
        lastHealthCheck: Date.now(),
      });
      return health;
    } catch {
      set({ facilitatorHealthy: false, lastHealthCheck: Date.now() });
      return null;
    }
  },

  getClient: () => {
    const state = get();
    if (!state.client) {
      // Trigger async init, return null for now
      state.initializeClient();
      return null;
    }
    return state.client;
  },
}));
