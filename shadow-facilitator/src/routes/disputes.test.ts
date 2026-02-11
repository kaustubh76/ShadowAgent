// ShadowAgent Facilitator - Dispute Route Tests

import express from 'express';
import request from 'supertest';
import disputesRouter from './disputes';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/disputes', disputesRouter);
  return app;
}

const VALID_DISPUTE = {
  agent: 'aleo1agentxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  client: 'aleo1clientxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  job_hash: 'dispute-job-001',
  escrow_amount: 1_000_000,
  evidence_hash: 'evidence-hash-abc123',
};

describe('Dispute Routes', () => {
  describe('POST /disputes', () => {
    it('should open a new dispute', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/disputes')
        .send(VALID_DISPUTE);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.dispute.status).toBe('opened');
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/disputes')
        .send({ agent: 'aleo1test' });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate dispute for same job', async () => {
      const app = createApp();
      const jobHash = 'dup-dispute-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      expect(res.status).toBe(409);
    });
  });

  describe('GET /disputes/:jobHash', () => {
    it('should return dispute by job hash', async () => {
      const app = createApp();
      const jobHash = 'get-dispute-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app).get(`/disputes/${jobHash}`);

      expect(res.status).toBe(200);
      expect(res.body.job_hash).toBe(jobHash);
      expect(res.body.status).toBe('opened');
    });

    it('should return 404 for non-existent dispute', async () => {
      const app = createApp();
      const res = await request(app).get('/disputes/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /disputes (list with filters)', () => {
    it('should return all disputes', async () => {
      const app = createApp();
      const jobHash = 'list-dispute-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app).get('/disputes');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should filter by status=open', async () => {
      const app = createApp();
      const jobHash = 'open-filter-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app).get('/disputes?status=open');

      expect(res.status).toBe(200);
      for (const d of res.body) {
        expect(['opened', 'agent_responded']).toContain(d.status);
      }
    });
  });

  describe('POST /disputes/:jobHash/respond', () => {
    it('should allow agent to respond with evidence', async () => {
      const app = createApp();
      const jobHash = 'respond-dispute-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app)
        .post(`/disputes/${jobHash}/respond`)
        .send({
          agent_id: VALID_DISPUTE.agent,
          evidence_hash: 'agent-evidence-hash-xyz',
        });

      expect(res.status).toBe(200);
      expect(res.body.dispute.status).toBe('agent_responded');
      expect(res.body.dispute.agent_evidence_hash).toBe('agent-evidence-hash-xyz');
    });

    it('should reject response without evidence', async () => {
      const app = createApp();
      const jobHash = 'no-evidence-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app)
        .post(`/disputes/${jobHash}/respond`)
        .send({ agent_id: VALID_DISPUTE.agent });

      expect(res.status).toBe(400);
    });

    it('should reject response to non-opened dispute', async () => {
      const app = createApp();
      const jobHash = 'already-responded-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      // First response
      await request(app)
        .post(`/disputes/${jobHash}/respond`)
        .send({ agent_id: VALID_DISPUTE.agent, evidence_hash: 'hash1' });

      // Second response should fail
      const res = await request(app)
        .post(`/disputes/${jobHash}/respond`)
        .send({ agent_id: VALID_DISPUTE.agent, evidence_hash: 'hash2' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent dispute', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/disputes/non-existent/respond')
        .send({ agent_id: 'test', evidence_hash: 'hash' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /disputes/:jobHash/resolve', () => {
    it('should resolve dispute with 100% agent (resolved_agent)', async () => {
      const app = createApp();
      const jobHash = 'resolve-agent-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app)
        .post(`/disputes/${jobHash}/resolve`)
        .send({ agent_percentage: 100 });

      expect(res.status).toBe(200);
      expect(res.body.dispute.status).toBe('resolved_agent');
      expect(res.body.dispute.resolution_agent_pct).toBe(100);
    });

    it('should resolve dispute with 0% agent (resolved_client)', async () => {
      const app = createApp();
      const jobHash = 'resolve-client-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app)
        .post(`/disputes/${jobHash}/resolve`)
        .send({ agent_percentage: 0 });

      expect(res.status).toBe(200);
      expect(res.body.dispute.status).toBe('resolved_client');
    });

    it('should resolve dispute with split (resolved_split)', async () => {
      const app = createApp();
      const jobHash = 'resolve-split-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app)
        .post(`/disputes/${jobHash}/resolve`)
        .send({ agent_percentage: 60 });

      expect(res.status).toBe(200);
      expect(res.body.dispute.status).toBe('resolved_split');
      expect(res.body.dispute.resolution_agent_pct).toBe(60);
      expect(res.body.settlement.agent_amount).toBe(600_000);
      expect(res.body.settlement.client_amount).toBe(400_000);
    });

    it('should reject invalid percentage', async () => {
      const app = createApp();
      const jobHash = 'invalid-pct-' + Date.now();

      await request(app)
        .post('/disputes')
        .send({ ...VALID_DISPUTE, job_hash: jobHash });

      const res = await request(app)
        .post(`/disputes/${jobHash}/resolve`)
        .send({ agent_percentage: 150 });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent dispute', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/disputes/non-existent/resolve')
        .send({ agent_percentage: 50 });

      expect(res.status).toBe(404);
    });
  });
});
