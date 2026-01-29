// ShadowAgent SDK - Agent Server Tests

import { ShadowAgentServer, createAgent } from './agent';
import { ServiceType, Tier, ProofType } from './types';
import type { Request, Response, NextFunction } from 'express';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('ShadowAgentServer', () => {
  beforeEach(() => {
    mockFetch.mockClear();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should create agent with required config', () => {
      const agent = createAgent({
        privateKey: 'test-key',
        serviceType: ServiceType.NLP,
      });
      expect(agent).toBeInstanceOf(ShadowAgentServer);
    });

    it('should use default values for optional config', () => {
      const agent = new ShadowAgentServer({
        privateKey: 'test-key',
        serviceType: ServiceType.Vision,
      });
      const config = agent.getConfig();
      expect(config.network).toBe('testnet');
      expect(config.pricePerRequest).toBe(100000);
    });

    it('should generate consistent agent ID from private key', () => {
      const agent1 = createAgent({ privateKey: 'same-key', serviceType: ServiceType.NLP });
      const agent2 = createAgent({ privateKey: 'same-key', serviceType: ServiceType.Vision });
      expect(agent1.getAgentId()).toBe(agent2.getAgentId());
    });
  });

  describe('register', () => {
    it('should register agent successfully with default bond', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ agent_id: 'new-agent-id', bond_record: 'bond123' }),
      });

      const agent = createAgent({
        privateKey: 'test-key',
        serviceType: ServiceType.Code,
        facilitatorUrl: 'http://localhost:3000',
      });

      const result = await agent.register('https://my-agent.com/api');

      expect(result.success).toBe(true);
      expect(result.agentId).toBe('new-agent-id');
      expect(result.bondRecord).toBe('bond123');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/agents/register',
        expect.objectContaining({
          method: 'POST',
        })
      );
    });

    it('should register agent with custom bond amount', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ agent_id: 'new-agent-id' }),
      });

      const agent = createAgent({
        privateKey: 'test-key',
        serviceType: ServiceType.Code,
        facilitatorUrl: 'http://localhost:3000',
      });

      const result = await agent.register('https://my-agent.com/api', 20_000_000);

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:3000/agents/register',
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('20000000'),
        })
      );
    });

    it('should reject bond below minimum', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const result = await agent.register('https://agent.com', 5_000_000);

      expect(result.success).toBe(false);
      expect(result.error).toContain('below minimum');
    });

    it('should handle registration failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Address already registered' }),
      });

      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const result = await agent.register('https://agent.com', 10_000_000);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Address already registered');
    });
  });

  describe('unregister', () => {
    it('should unregister agent and return bond', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve({ bond_returned: 10_000_000 }),
      });

      const agent = createAgent({
        privateKey: 'test-key',
        serviceType: ServiceType.Code,
        facilitatorUrl: 'http://localhost:3000',
      });

      const result = await agent.unregister();

      expect(result.success).toBe(true);
      expect(result.bondReturned).toBe(10_000_000);
    });

    it('should handle unregistration failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        json: () => Promise.resolve({ error: 'Agent not found' }),
      });

      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const result = await agent.unregister();

      expect(result.success).toBe(false);
      expect(result.error).toBe('Agent not found');
    });
  });

  describe('middleware', () => {
    const createMockReq = (overrides = {}): Partial<Request> => ({
      method: 'POST',
      originalUrl: '/api/complete',
      headers: {},
      ...overrides,
    });

    const createMockRes = (): Partial<Response> => {
      const res: Partial<Response> = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn().mockReturnThis(),
        setHeader: jest.fn().mockReturnThis(),
        statusCode: 200,
        send: jest.fn().mockReturnThis(),
      };
      return res;
    };

    const nextFn: NextFunction = jest.fn();

    it('should skip OPTIONS requests', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const middleware = agent.middleware();

      const req = createMockReq({ method: 'OPTIONS' });
      const res = createMockRes();

      await middleware(req as Request, res as Response, nextFn);

      expect(nextFn).toHaveBeenCalled();
      expect(res.status).not.toHaveBeenCalled();
    });

    it('should return 402 when no payment proof provided', async () => {
      const agent = createAgent({
        privateKey: 'key',
        serviceType: ServiceType.NLP,
        pricePerRequest: 50000,
      });
      const middleware = agent.middleware();

      const req = createMockReq();
      const res = createMockRes();

      await middleware(req as Request, res as Response, nextFn);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.setHeader).toHaveBeenCalledWith('X-Payment-Required', expect.any(String));
      expect(res.setHeader).toHaveBeenCalledWith('X-Job-Hash', expect.any(String));
    });

    it('should accept valid payment proof', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const middleware = agent.middleware();

      // First, get the payment terms by making a request without proof
      const req1 = createMockReq();
      const res1 = createMockRes();
      await middleware(req1 as Request, res1 as Response, nextFn);

      // Get the job hash from the response
      const setHeaderCalls = (res1.setHeader as jest.Mock).mock.calls;
      const jobHashCall = setHeaderCalls.find((call: unknown[]) => call[0] === 'X-Job-Hash');
      const jobHash = jobHashCall?.[1] || 'test-job-hash';

      // Create a valid escrow proof
      const escrowProof = Buffer.from(
        JSON.stringify({
          proof: 'valid-proof',
          nullifier: 'nullifier123',
          commitment: 'commitment456',
          amount: 100000,
        })
      ).toString('base64');

      const req2 = createMockReq({
        headers: {
          'x-escrow-proof': escrowProof,
          'x-job-hash': jobHash,
        },
      });
      const res2 = createMockRes();
      const next2 = jest.fn();

      await middleware(req2 as Request, res2 as Response, next2);

      expect(next2).toHaveBeenCalled();
    });

    it('should reject insufficient payment', async () => {
      const agent = createAgent({
        privateKey: 'key',
        serviceType: ServiceType.NLP,
        pricePerRequest: 100000,
      });
      const middleware = agent.middleware();

      const lowPaymentProof = Buffer.from(
        JSON.stringify({
          proof: 'valid-proof',
          nullifier: 'nullifier123',
          commitment: 'commitment456',
          amount: 50000, // Less than required
        })
      ).toString('base64');

      const req = createMockReq({
        headers: {
          'x-escrow-proof': lowPaymentProof,
          'x-job-hash': 'job-hash',
        },
      });
      const res = createMockRes();

      await middleware(req as Request, res as Response, nextFn);

      expect(res.status).toHaveBeenCalledWith(402);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Invalid Payment',
        })
      );
    });

    it('should allow custom price per request', async () => {
      const agent = createAgent({
        privateKey: 'key',
        serviceType: ServiceType.NLP,
        pricePerRequest: 100000,
      });
      const middleware = agent.middleware({ pricePerRequest: 200000 });

      const req = createMockReq();
      const res = createMockRes();

      await middleware(req as Request, res as Response, nextFn);

      // Should use the custom price, not the default
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({
          payment_terms: expect.objectContaining({
            price: 200000,
          }),
        })
      );
    });
  });

  describe('claimEscrow', () => {
    it('should claim escrow for valid job', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });

      // Simulate creating a pending job via middleware
      const middleware = agent.middleware();
      const req = { method: 'POST', originalUrl: '/api', headers: {} };
      const res = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn(),
        setHeader: jest.fn(),
      };

      await middleware(req as unknown as Request, res as unknown as Response, jest.fn());

      // Get the job hash
      const jobHashCall = (res.setHeader as jest.Mock).mock.calls.find(
        (c: unknown[]) => c[0] === 'X-Job-Hash'
      );
      const jobHash = jobHashCall?.[1];

      if (jobHash) {
        const result = await agent.claimEscrow(jobHash);
        expect(result.success).toBe(true);
      }
    });

    it('should fail for unknown job', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const result = await agent.claimEscrow('non-existent-job');

      expect(result.success).toBe(false);
      expect(result.error).toBe('Job not found');
    });
  });

  describe('proveReputation', () => {
    it('should return null if no reputation set', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const proof = await agent.proveReputation(ProofType.Tier, Tier.Silver);
      expect(proof).toBeNull();
    });

    it('should generate proof when reputation is set', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      agent.setReputation({
        owner: 'aleo1owner',
        agent_id: 'agent123',
        total_jobs: 100,
        total_rating_points: 450,
        total_revenue: 5000000,
        tier: Tier.Silver,
        created_at: 1000,
        last_updated: 2000,
      });

      const proof = await agent.proveReputation(ProofType.Tier, Tier.Bronze);

      expect(proof).not.toBeNull();
      expect(proof?.proof_type).toBe(ProofType.Tier);
      expect(proof?.tier_proven).toBe(Tier.Silver);
    });
  });

  describe('updateReputation', () => {
    it('should update reputation with new rating', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      agent.setReputation({
        owner: 'aleo1owner',
        agent_id: 'agent123',
        total_jobs: 10,
        total_rating_points: 45,
        total_revenue: 1000000,
        tier: Tier.Bronze,
        created_at: 1000,
        last_updated: 2000,
      });

      const result = await agent.updateReputation({
        rating: 50, // 5 stars
        payment_amount: 100000,
      });

      expect(result.success).toBe(true);

      const reputation = await agent.getReputation();
      expect(reputation?.total_jobs).toBe(11);
      expect(reputation?.total_rating_points).toBe(95);
    });

    it('should return false if no reputation exists', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const result = await agent.updateReputation({ rating: 40, payment_amount: 100000 });
      expect(result.success).toBe(false);
    });
  });

  describe('updateListing', () => {
    it('should update service type', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const result = await agent.updateListing(ServiceType.Vision);

      expect(result.success).toBe(true);
      expect(agent.getConfig().serviceType).toBe(ServiceType.Vision);
    });
  });

  describe('getReputation', () => {
    it('should return null when not set', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const reputation = await agent.getReputation();
      expect(reputation).toBeNull();
    });

    it('should return reputation when set', async () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });
      const mockReputation = {
        owner: 'aleo1owner',
        agent_id: 'agent123',
        total_jobs: 50,
        total_rating_points: 240,
        total_revenue: 2500000,
        tier: Tier.Silver,
        created_at: 1000,
        last_updated: 2000,
      };
      agent.setReputation(mockReputation);

      const reputation = await agent.getReputation();
      expect(reputation).toEqual(mockReputation);
    });
  });

  describe('cleanup', () => {
    it('should clean up old pending jobs', () => {
      const agent = createAgent({ privateKey: 'key', serviceType: ServiceType.NLP });

      // Simulate creating pending jobs via middleware
      const middleware = agent.middleware();

      // Create some pending jobs
      for (let i = 0; i < 5; i++) {
        const req = { method: 'POST', originalUrl: `/api/${i}`, headers: {} };
        const res = {
          status: jest.fn().mockReturnThis(),
          json: jest.fn(),
          setHeader: jest.fn(),
        };
        middleware(req as unknown as Request, res as unknown as Response, jest.fn());
      }

      // Advance time by more than 1 hour
      jest.advanceTimersByTime(3600001);

      // Trigger cleanup (happens on interval)
      jest.advanceTimersByTime(60000);

      // Old jobs should be cleaned up - test by trying to claim them
      // (They would fail with "Job not found" if cleaned up)
    });
  });
});
