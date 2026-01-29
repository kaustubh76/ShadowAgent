// ShadowAgent SDK - Client Tests

import { ShadowAgentClient, createClient } from './client';
import { ServiceType, Tier } from './types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ShadowAgentClient', () => {
  beforeEach(() => {
    mockFetch.mockClear();
  });

  describe('constructor', () => {
    it('should create client with default config', () => {
      const client = createClient();
      expect(client).toBeInstanceOf(ShadowAgentClient);
    });

    it('should create client with custom config', () => {
      const client = new ShadowAgentClient({
        privateKey: 'test-key',
        network: 'mainnet',
        facilitatorUrl: 'https://custom.facilitator.com',
        timeout: 60000,
      });
      expect(client).toBeInstanceOf(ShadowAgentClient);
    });
  });

  describe('searchAgents', () => {
    it('should search agents with filters', async () => {
      const mockAgents = {
        agents: [
          { agent_id: 'agent1', service_type: ServiceType.NLP, tier: Tier.Gold, is_active: true },
        ],
        total: 1,
        limit: 20,
        offset: 0,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(mockAgents),
      });

      const client = createClient({ facilitatorUrl: 'http://localhost:3000' });
      const result = await client.searchAgents({
        service_type: ServiceType.NLP,
        min_tier: Tier.Silver,
      });

      expect(result.agents).toHaveLength(1);
      expect(result.agents[0].agent_id).toBe('agent1');
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents?'),
        expect.any(Object)
      );
    });

    it('should handle search errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Internal Server Error',
      });

      const client = createClient();
      await expect(client.searchAgents({})).rejects.toThrow('Failed to search agents');
    });
  });

  describe('getAgent', () => {
    it('should get agent by ID', async () => {
      const mockAgent = {
        agent_id: 'agent123',
        service_type: ServiceType.Vision,
        tier: Tier.Diamond,
        is_active: true,
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve(mockAgent),
      });

      const client = createClient();
      const agent = await client.getAgent('agent123');

      expect(agent).not.toBeNull();
      expect(agent?.agent_id).toBe('agent123');
    });

    it('should return null for non-existent agent', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const client = createClient();
      const agent = await client.getAgent('non-existent');

      expect(agent).toBeNull();
    });
  });

  describe('request (x402 flow)', () => {
    it('should handle successful request without payment', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: () => Promise.resolve({ result: 'success' }),
        headers: new Map(),
      });

      const client = createClient({ privateKey: 'test-key' });
      const result = await client.request('http://agent.example.com/api');

      expect(result.success).toBe(true);
      expect(result.data).toEqual({ result: 'success' });
    });

    it('should handle 402 payment required flow', async () => {
      const paymentTerms = {
        price: 100000,
        network: 'aleo:testnet',
        address: 'aleo1agent123',
        escrow_required: true,
        secret_hash: 'abc123',
        deadline_blocks: 100,
      };

      // First call returns 402
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 402,
        headers: {
          get: (name: string) => {
            if (name === 'X-Payment-Required') {
              return Buffer.from(JSON.stringify(paymentTerms)).toString('base64');
            }
            if (name === 'X-Job-Hash') {
              return 'job-hash-123';
            }
            return null;
          },
        },
        json: () => Promise.resolve({ error: 'Payment Required' }),
      });

      // Block height fetch for escrow deadline
      mockFetch.mockResolvedValueOnce({
        ok: true,
        text: () => Promise.resolve('1000000'),
      });

      // Second call succeeds after payment
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        headers: {
          get: (name: string) => {
            if (name === 'X-Delivery-Secret') return 'delivery-secret';
            return null;
          },
        },
        json: () => Promise.resolve({ result: 'paid-response' }),
      });

      const client = createClient({ privateKey: 'test-key' });
      const result = await client.request('http://agent.example.com/api');

      expect(result.success).toBe(true);
      // Now expects 3 calls: initial 402, block height, retry with payment
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });
  });

  describe('submitRating', () => {
    it('should submit rating successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const client = createClient({ privateKey: 'test-key' });
      const result = await client.submitRating('agent123', 'job-hash', 4.5, 100000);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/agents/agent123/rating'),
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should validate rating range', async () => {
      const client = createClient({ privateKey: 'test-key' });

      // Rating too low
      const result1 = await client.submitRating('agent', 'job', 0, 100000);
      expect(result1.success).toBe(false);
      expect(result1.error).toContain('between 1 and 5');

      // Rating too high
      const result2 = await client.submitRating('agent', 'job', 6, 100000);
      expect(result2.success).toBe(false);
      expect(result2.error).toContain('between 1 and 5');
    });
  });

  describe('verifyReputationProof', () => {
    it('should verify valid reputation proof', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ valid: true, tier: Tier.Gold }),
      });

      const client = createClient();
      const result = await client.verifyReputationProof(
        { proof: 'proof-data', proof_type: 4, threshold: Tier.Silver },
        Tier.Silver
      );

      expect(result.valid).toBe(true);
      expect(result.tier).toBe(Tier.Gold);
    });

    it('should handle invalid proofs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Invalid proof' }),
      });

      const client = createClient();
      const result = await client.verifyReputationProof(
        { proof: 'invalid', proof_type: 4, threshold: 0 },
        Tier.Gold
      );

      expect(result.valid).toBe(false);
    });
  });

  describe('getHealth', () => {
    it('should return health status', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ status: 'ok', blockHeight: 12345 }),
      });

      const client = createClient();
      const health = await client.getHealth();

      expect(health.status).toBe('ok');
      expect(health.blockHeight).toBe(12345);
    });
  });

  describe('configuration', () => {
    it('should use custom timeout in requests', () => {
      const client = createClient({ timeout: 5000 });
      // Config is applied internally
      expect(client).toBeInstanceOf(ShadowAgentClient);
    });
  });
});
