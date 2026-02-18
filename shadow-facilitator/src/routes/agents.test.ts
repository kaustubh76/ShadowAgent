// ShadowAgent Facilitator - Agent Routes Tests

// Mock the index module (logger) to prevent full app bootstrap
jest.mock('../index', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock aleo service to prevent network calls
jest.mock('../services/aleo', () => ({
  aleoService: {
    getAgentListing: jest.fn().mockResolvedValue(null),
    getAllAgentListings: jest.fn().mockResolvedValue([]),
  },
}));

import express from 'express';
import request from 'supertest';
import agentsRouter from './agents';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/agents', agentsRouter);
  return app;
}

describe('Agent Routes', () => {
  // ═══════════════════════════════════════════════════════════════════
  // POST /agents/register
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /agents/register', () => {
    it('should register a new agent with address', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/register')
        .send({ service_type: 1, address: 'aleo1register_test_addr' });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.agent_id).toBe('aleo1register_test_addr');
    });

    it('should register with only service_type', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/register')
        .send({ service_type: 3 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.agent_id).toMatch(/^agent_/);
    });

    it('should include bond_record when tx_id provided', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/register')
        .send({ service_type: 1, address: 'aleo1bond_test', tx_id: 'tx_abc123' });

      expect(res.status).toBe(201);
      expect(res.body.bond_record).toBe('tx_abc123');
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/register')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('should reject invalid address format', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/register')
        .send({ service_type: 1, address: 'invalid_address' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid address format');
    });

    it('should reject address not starting with aleo1', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/register')
        .send({ service_type: 1, address: 'btc1abcdefghijklmno' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid address format');
    });

    it('should reject out-of-range service_type', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/register')
        .send({ service_type: 99, address: 'aleo1validaddresstest' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid service_type');
    });

    it('should reject negative service_type', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/register')
        .send({ service_type: -1, address: 'aleo1validaddresstest' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid service_type');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // POST /agents/unregister
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /agents/unregister', () => {
    it('should unregister an agent by agent_id', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/unregister')
        .send({ agent_id: 'aleo1unregister_test' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.agent_id).toBe('aleo1unregister_test');
    });

    it('should unregister by address fallback', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/unregister')
        .send({ address: 'aleo1addr_fallback' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.agent_id).toBe('aleo1addr_fallback');
    });

    it('should reject missing agent_id and address', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/unregister')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required field');
    });

    it('should reject overly long agent_id', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/unregister')
        .send({ agent_id: 'a'.repeat(101) });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Invalid agent_id format');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /agents/by-address/:publicKey
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /agents/by-address/:publicKey', () => {
    it('should return 404 for unknown address', async () => {
      const app = createApp();
      const res = await request(app)
        .get('/agents/by-address/aleo1unknownaddr');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Agent not found');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // POST /agents/:agentId/rating
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /agents/:agentId/rating', () => {
    it('should accept a valid rating', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/agent123/rating')
        .send({ job_hash: 'job_1', rating: 45, payment_amount: 500000 });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.rating.job_hash).toBe('job_1');
      expect(res.body.rating.rating).toBe(45);
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/agent123/rating')
        .send({ rating: 30 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('job_hash');
    });

    it('should reject rating out of range (too low)', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/agent123/rating')
        .send({ job_hash: 'job_2', rating: 0 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('between 1 and 50');
    });

    it('should reject rating out of range (too high)', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/agent123/rating')
        .send({ job_hash: 'job_3', rating: 51 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('between 1 and 50');
    });

    it('should reject non-integer rating', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/agent123/rating')
        .send({ job_hash: 'job_float', rating: 3.7 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('integer');
    });

    it('should reject NaN rating', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/agent123/rating')
        .send({ job_hash: 'job_nan', rating: 'abc' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('integer');
    });

    it('should reject negative payment_amount', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/agent123/rating')
        .send({ job_hash: 'job_neg', rating: 25, payment_amount: -100 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('non-negative');
    });

    it('should prevent double-rating via nullifier', async () => {
      const app = createApp();
      const nullifier = 'nullifier_' + Date.now();

      // First rating succeeds
      const res1 = await request(app)
        .post('/agents/agent_dup/rating')
        .send({ job_hash: 'job_dup', rating: 25, nullifier });

      expect(res1.status).toBe(201);

      // Second rating with same nullifier fails
      const res2 = await request(app)
        .post('/agents/agent_dup/rating')
        .send({ job_hash: 'job_dup2', rating: 30, nullifier });

      expect(res2.status).toBe(409);
      expect(res2.body.error).toContain('already submitted');
    });

    it('should store on_chain flag', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/agents/agent_onchain/rating')
        .send({ job_hash: 'job_oc', rating: 40, on_chain: true, tx_id: 'tx_123' });

      expect(res.status).toBe(201);
      expect(res.body.rating.on_chain).toBe(true);
      expect(res.body.rating.tx_id).toBe('tx_123');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /agents - Search with filters
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /agents', () => {
    it('should return agent search results with default params', async () => {
      const app = createApp();
      const res = await request(app).get('/agents');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('agents');
      expect(res.body).toHaveProperty('total');
      expect(res.body).toHaveProperty('limit');
      expect(res.body).toHaveProperty('offset');
      expect(Array.isArray(res.body.agents)).toBe(true);
    });

    it('should accept service_type filter parameter', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?service_type=1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('agents');
      expect(res.body).toHaveProperty('total');
    });

    it('should accept min_tier filter parameter', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?min_tier=2');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('agents');
      expect(res.body).toHaveProperty('total');
    });

    it('should accept combined service_type and min_tier filters', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?service_type=3&min_tier=1');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('agents');
      expect(res.body).toHaveProperty('total');
    });

    it('should respect limit parameter', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?limit=5');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(5);
    });

    it('should respect offset parameter', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?offset=10');

      expect(res.status).toBe(200);
      expect(res.body.offset).toBe(10);
    });

    it('should cap limit at 100', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?limit=500');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(100);
    });

    it('should default limit to 20 when not specified', async () => {
      const app = createApp();
      const res = await request(app).get('/agents');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(20);
    });

    it('should default offset to 0 when not specified', async () => {
      const app = createApp();
      const res = await request(app).get('/agents');

      expect(res.status).toBe(200);
      expect(res.body.offset).toBe(0);
    });

    it('should accept is_active=false filter', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?is_active=false');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('agents');
    });

    it('should handle NaN service_type gracefully', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?service_type=abc');

      expect(res.status).toBe(200);
      // NaN service_type treated as undefined — returns all agents
      expect(res.body).toHaveProperty('agents');
    });

    it('should handle NaN limit gracefully', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?limit=notanumber');

      expect(res.status).toBe(200);
      expect(res.body.limit).toBe(20); // defaults to 20
    });

    it('should clamp negative offset to 0', async () => {
      const app = createApp();
      const res = await request(app).get('/agents?offset=-5');

      expect(res.status).toBe(200);
      expect(res.body.offset).toBe(0);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /agents/:agentId - Get specific agent
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /agents/:agentId', () => {
    it('should return 404 for non-existent agent', async () => {
      const app = createApp();
      const res = await request(app).get('/agents/nonexistent_agent_id');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Agent not found');
    });

    it('should return 404 with proper error message structure', async () => {
      const app = createApp();
      const res = await request(app).get('/agents/unknown_agent_xyz');

      expect(res.status).toBe(404);
      expect(res.body).toHaveProperty('error');
      expect(typeof res.body.error).toBe('string');
    });

    it('should handle special characters in agent ID', async () => {
      const app = createApp();
      const res = await request(app).get('/agents/aleo1test_special_chars_123');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Agent not found');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // GET /agents/:agentId/proof - Get agent proof
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /agents/:agentId/proof', () => {
    it('should return 404 for non-existent agent proof', async () => {
      const app = createApp();
      const res = await request(app).get('/agents/unknown_agent/proof');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Agent not found');
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Per-Address Rate Limiting (Fixed Window Counter)
  // ═══════════════════════════════════════════════════════════════════

  describe('Per-address rate limiting', () => {
    it('should rate limit registration from same address', async () => {
      const app = createApp();
      const address = 'aleo1rate_limit_reg_' + Date.now();

      // Default config allows 5 registrations per hour
      for (let i = 0; i < 5; i++) {
        const res = await request(app)
          .post('/agents/register')
          .send({ service_type: 1, address });
        expect(res.status).toBe(201);
      }

      // 6th registration should be rate limited
      const limitedRes = await request(app)
        .post('/agents/register')
        .send({ service_type: 1, address });

      expect(limitedRes.status).toBe(429);
      expect(limitedRes.body.error).toContain('Too many');
    });

    it('should rate limit rating submissions from same IP', async () => {
      const app = createApp();

      // Default config allows 10 ratings per minute per IP.
      // Previous tests in this file already consumed some of that budget
      // (since the rate limiter is a module-level singleton).
      // Keep sending until we hit 429 — it must happen within 15 attempts.
      let hitLimit = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post(`/agents/agent_rate_many_${Date.now()}_${i}/rating`)
          .send({ job_hash: `job_many_${i}`, rating: 25 });
        if (res.status === 429) {
          expect(res.body.error).toContain('Too many');
          hitLimit = true;
          break;
        }
        expect(res.status).toBe(201);
      }

      expect(hitLimit).toBe(true);
    });
  });
});
