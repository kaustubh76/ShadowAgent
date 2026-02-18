// ShadowAgent Facilitator - Refund Route Tests

jest.setTimeout(30000);

import express from 'express';
import request from 'supertest';
import refundsRouter from './refunds';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/refunds', refundsRouter);
  return app;
}

// Each test gets a unique refund to avoid rate limiter collisions
let refundCounter = 0;
function makeRefund(overrides?: Record<string, unknown>) {
  refundCounter++;
  const ts = Date.now();
  return {
    agent: `aleo1agent_${ts}_${refundCounter}`,
    client: `aleo1client_${ts}_${refundCounter}`,
    total_amount: 1_000_000,
    agent_amount: 600_000,
    job_hash: `refund-job-${ts}-${refundCounter}`,
    ...overrides,
  };
}

describe('Refund Routes', () => {
  describe('POST /refunds', () => {
    it('should create a partial refund proposal', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/refunds')
        .send(makeRefund());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.proposal.status).toBe('proposed');
      expect(res.body.proposal.client_amount).toBe(400_000);
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/refunds')
        .send({ agent: 'aleo1test_' + Date.now() });

      expect(res.status).toBe(400);
    });

    it('should reject agent_amount exceeding total', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/refunds')
        .send(makeRefund({ agent_amount: 2_000_000 }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot exceed');
    });

    it('should reject duplicate proposal', async () => {
      const app = createApp();
      const refund = makeRefund();

      await request(app)
        .post('/refunds')
        .send(refund);

      const res = await request(app)
        .post('/refunds')
        .send(makeRefund({ job_hash: refund.job_hash, agent: refund.agent }));

      expect(res.status).toBe(409);
    });
  });

  describe('GET /refunds/:jobHash', () => {
    it('should return proposal by job hash', async () => {
      const app = createApp();
      const refund = makeRefund();

      await request(app)
        .post('/refunds')
        .send(refund);

      const res = await request(app).get(`/refunds/${refund.job_hash}`);

      expect(res.status).toBe(200);
      expect(res.body.job_hash).toBe(refund.job_hash);
    });

    it('should return 404 for non-existent proposal', async () => {
      const app = createApp();
      const res = await request(app).get('/refunds/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /refunds (list with filters)', () => {
    it('should return all proposals', async () => {
      const app = createApp();
      const refund = makeRefund();

      await request(app)
        .post('/refunds')
        .send(refund);

      const res = await request(app).get('/refunds');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should filter by status', async () => {
      const app = createApp();
      const refund = makeRefund();

      await request(app)
        .post('/refunds')
        .send(refund);

      const res = await request(app).get('/refunds?status=proposed');

      expect(res.status).toBe(200);
      for (const p of res.body) {
        expect(p.status).toBe('proposed');
      }
    });
  });

  describe('POST /refunds/:jobHash/accept', () => {
    it('should accept a proposed refund', async () => {
      const app = createApp();
      const refund = makeRefund();

      await request(app)
        .post('/refunds')
        .send(refund);

      const res = await request(app)
        .post(`/refunds/${refund.job_hash}/accept`)
        .send({ agent_id: refund.agent });

      expect(res.status).toBe(200);
      expect(res.body.proposal.status).toBe('accepted');
    });

    it('should reject accepting non-proposed refund', async () => {
      const app = createApp();
      const refund = makeRefund();

      await request(app)
        .post('/refunds')
        .send(refund);

      await request(app)
        .post(`/refunds/${refund.job_hash}/accept`)
        .send({ agent_id: refund.agent });

      const res = await request(app)
        .post(`/refunds/${refund.job_hash}/accept`)
        .send({ agent_id: refund.agent });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent refund', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/refunds/non-existent/accept')
        .send({ agent_id: 'test' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /refunds/:jobHash/reject', () => {
    it('should reject a proposed refund', async () => {
      const app = createApp();
      const refund = makeRefund();

      await request(app)
        .post('/refunds')
        .send(refund);

      const res = await request(app)
        .post(`/refunds/${refund.job_hash}/reject`)
        .send({ agent_id: refund.agent });

      expect(res.status).toBe(200);
      expect(res.body.proposal.status).toBe('rejected');
    });

    it('should not allow rejecting already accepted refund', async () => {
      const app = createApp();
      const refund = makeRefund();

      await request(app)
        .post('/refunds')
        .send(refund);

      await request(app)
        .post(`/refunds/${refund.job_hash}/accept`)
        .send({ agent_id: refund.agent });

      const res = await request(app)
        .post(`/refunds/${refund.job_hash}/reject`)
        .send({ agent_id: refund.agent });

      expect(res.status).toBe(400);
    });
  });

  describe('Per-address rate limiting', () => {
    it('should rate limit refund creation from same address', async () => {
      const app = createApp();
      const agentAddr = 'aleo1agent_rate_ref_' + Date.now();

      // Default config allows 5 refund proposals per hour per address
      let hitLimit = false;
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/refunds')
          .send(makeRefund({ agent: agentAddr }));

        if (res.status === 429) {
          expect(res.body.error).toContain('Too many');
          expect(res.headers).toHaveProperty('retry-after');
          hitLimit = true;
          break;
        }
        expect([201, 409]).toContain(res.status);
      }

      expect(hitLimit).toBe(true);
    });

    it('should include rate limit headers in responses', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/refunds')
        .send(makeRefund());

      expect(res.headers).toHaveProperty('x-ratelimit-limit');
      expect(res.headers).toHaveProperty('x-ratelimit-remaining');
      expect(res.headers).toHaveProperty('x-ratelimit-reset');
    });
  });
});
