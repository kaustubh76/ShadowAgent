// ShadowAgent Facilitator - Refund Route Tests

import express from 'express';
import request from 'supertest';
import refundsRouter from './refunds';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/refunds', refundsRouter);
  return app;
}

const VALID_REFUND = {
  agent: 'aleo1agentxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  client: 'aleo1clientxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  total_amount: 1_000_000,
  agent_amount: 600_000,
  job_hash: 'refund-job-001',
};

describe('Refund Routes', () => {
  describe('POST /refunds', () => {
    it('should create a partial refund proposal', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/refunds')
        .send(VALID_REFUND);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.proposal.status).toBe('proposed');
      expect(res.body.proposal.client_amount).toBe(400_000);
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/refunds')
        .send({ agent: 'aleo1test' });

      expect(res.status).toBe(400);
    });

    it('should reject agent_amount exceeding total', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: 'overflow-test', agent_amount: 2_000_000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('cannot exceed');
    });

    it('should reject duplicate proposal', async () => {
      const app = createApp();
      const jobHash = 'dup-refund-' + Date.now();

      await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

      const res = await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /refunds/:jobHash', () => {
    it('should return proposal by job hash', async () => {
      const app = createApp();
      const jobHash = 'get-refund-' + Date.now();

      await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

      const res = await request(app).get(`/refunds/${jobHash}`);

      expect(res.status).toBe(200);
      expect(res.body.job_hash).toBe(jobHash);
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
      const jobHash = 'list-refund-' + Date.now();

      await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

      const res = await request(app).get('/refunds');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should filter by status', async () => {
      const app = createApp();
      const jobHash = 'filter-refund-' + Date.now();

      await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

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
      const jobHash = 'accept-refund-' + Date.now();

      await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

      const res = await request(app)
        .post(`/refunds/${jobHash}/accept`)
        .send({ agent_id: VALID_REFUND.agent });

      expect(res.status).toBe(200);
      expect(res.body.proposal.status).toBe('accepted');
    });

    it('should reject accepting non-proposed refund', async () => {
      const app = createApp();
      const jobHash = 'double-accept-' + Date.now();

      await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

      await request(app)
        .post(`/refunds/${jobHash}/accept`)
        .send({ agent_id: VALID_REFUND.agent });

      const res = await request(app)
        .post(`/refunds/${jobHash}/accept`)
        .send({ agent_id: VALID_REFUND.agent });

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
      const jobHash = 'reject-refund-' + Date.now();

      await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

      const res = await request(app)
        .post(`/refunds/${jobHash}/reject`)
        .send({ agent_id: VALID_REFUND.agent });

      expect(res.status).toBe(200);
      expect(res.body.proposal.status).toBe('rejected');
    });

    it('should not allow rejecting already accepted refund', async () => {
      const app = createApp();
      const jobHash = 'accept-then-reject-' + Date.now();

      await request(app)
        .post('/refunds')
        .send({ ...VALID_REFUND, job_hash: jobHash });

      await request(app)
        .post(`/refunds/${jobHash}/accept`)
        .send({ agent_id: VALID_REFUND.agent });

      const res = await request(app)
        .post(`/refunds/${jobHash}/reject`)
        .send({ agent_id: VALID_REFUND.agent });

      expect(res.status).toBe(400);
    });
  });
});
