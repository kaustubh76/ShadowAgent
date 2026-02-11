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
  // Existing GET routes (sanity check)
  // ═══════════════════════════════════════════════════════════════════

  describe('GET /agents', () => {
    it('should return agent search results', async () => {
      const app = createApp();
      const res = await request(app).get('/agents');

      expect(res.status).toBe(200);
      expect(res.body).toHaveProperty('agents');
      expect(res.body).toHaveProperty('total');
    });
  });

  describe('GET /agents/:agentId', () => {
    it('should return 404 for non-existent agent', async () => {
      const app = createApp();
      const res = await request(app).get('/agents/nonexistent_agent_id');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('Agent not found');
    });
  });
});
