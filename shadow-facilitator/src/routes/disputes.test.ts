// ShadowAgent Facilitator - Dispute Route Tests

jest.setTimeout(30000);

import express from 'express';
import request from 'supertest';
import disputesRouter from './disputes';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/disputes', disputesRouter);
  return app;
}

// Each test gets a unique dispute to avoid rate limiter collisions
let disputeCounter = 0;
function makeDispute(overrides?: Record<string, unknown>) {
  disputeCounter++;
  const ts = Date.now();
  return {
    agent: `aleo1agent_${ts}_${disputeCounter}`,
    client: `aleo1client_${ts}_${disputeCounter}`,
    job_hash: `dispute-job-${ts}-${disputeCounter}`,
    escrow_amount: 1_000_000,
    evidence_hash: 'evidence-hash-abc123',
    ...overrides,
  };
}

describe('Dispute Routes', () => {
  describe('POST /disputes', () => {
    it('should open a new dispute', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/disputes')
        .send(makeDispute());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.dispute.status).toBe('opened');
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/disputes')
        .send({ agent: 'aleo1test_missing_' + Date.now() });

      expect(res.status).toBe(400);
    });

    it('should reject duplicate dispute for same job', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const res = await request(app)
        .post('/disputes')
        .send(makeDispute({ job_hash: dispute.job_hash, client: dispute.client }));

      expect(res.status).toBe(409);
    });
  });

  describe('GET /disputes/:jobHash', () => {
    it('should return dispute by job hash', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const res = await request(app).get(`/disputes/${dispute.job_hash}`);

      expect(res.status).toBe(200);
      expect(res.body.job_hash).toBe(dispute.job_hash);
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
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const res = await request(app).get('/disputes');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
    });

    it('should filter by status=open', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

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
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const res = await request(app)
        .post(`/disputes/${dispute.job_hash}/respond`)
        .send({
          agent_id: dispute.agent,
          evidence_hash: 'agent-evidence-hash-xyz',
        });

      expect(res.status).toBe(200);
      expect(res.body.dispute.status).toBe('agent_responded');
      expect(res.body.dispute.agent_evidence_hash).toBe('agent-evidence-hash-xyz');
    });

    it('should reject response without evidence', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const uniqueAgent = `aleo1agent_noev_${Date.now()}_${disputeCounter}`;
      const res = await request(app)
        .post(`/disputes/${dispute.job_hash}/respond`)
        .send({ agent_id: uniqueAgent });

      expect(res.status).toBe(400);
    });

    it('should reject response to non-opened dispute', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      // First response
      await request(app)
        .post(`/disputes/${dispute.job_hash}/respond`)
        .send({ agent_id: dispute.agent, evidence_hash: 'hash1' });

      // Second response should fail
      const uniqueAgent2 = `aleo1agent_dup_${Date.now()}_${disputeCounter}`;
      const res = await request(app)
        .post(`/disputes/${dispute.job_hash}/respond`)
        .send({ agent_id: uniqueAgent2, evidence_hash: 'hash2' });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent dispute', async () => {
      const app = createApp();
      const uniqueAgent = `aleo1agent_404_${Date.now()}_${disputeCounter}`;
      const res = await request(app)
        .post('/disputes/non-existent/respond')
        .send({ agent_id: uniqueAgent, evidence_hash: 'hash' });

      expect(res.status).toBe(404);
    });
  });

  describe('POST /disputes/:jobHash/resolve', () => {
    it('should resolve dispute with 100% agent (resolved_agent)', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const admin = `aleo1admin_100_${Date.now()}_${disputeCounter}`;
      const res = await request(app)
        .post(`/disputes/${dispute.job_hash}/resolve`)
        .send({ agent_percentage: 100, admin_address: admin });

      expect(res.status).toBe(200);
      expect(res.body.dispute.status).toBe('resolved_agent');
      expect(res.body.dispute.resolution_agent_pct).toBe(100);
    });

    it('should resolve dispute with 0% agent (resolved_client)', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const admin = `aleo1admin_0_${Date.now()}_${disputeCounter}`;
      const res = await request(app)
        .post(`/disputes/${dispute.job_hash}/resolve`)
        .send({ agent_percentage: 0, admin_address: admin });

      expect(res.status).toBe(200);
      expect(res.body.dispute.status).toBe('resolved_client');
    });

    it('should resolve dispute with split (resolved_split)', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const admin = `aleo1admin_60_${Date.now()}_${disputeCounter}`;
      const res = await request(app)
        .post(`/disputes/${dispute.job_hash}/resolve`)
        .send({ agent_percentage: 60, admin_address: admin });

      expect(res.status).toBe(200);
      expect(res.body.dispute.status).toBe('resolved_split');
      expect(res.body.dispute.resolution_agent_pct).toBe(60);
      expect(res.body.settlement.agent_amount).toBe(600_000);
      expect(res.body.settlement.client_amount).toBe(400_000);
    });

    it('should reject invalid percentage', async () => {
      const app = createApp();
      const dispute = makeDispute();

      await request(app)
        .post('/disputes')
        .send(dispute);

      const admin = `aleo1admin_invalid_${Date.now()}_${disputeCounter}`;
      const res = await request(app)
        .post(`/disputes/${dispute.job_hash}/resolve`)
        .send({ agent_percentage: 150, admin_address: admin });

      expect(res.status).toBe(400);
    });

    it('should return 404 for non-existent dispute', async () => {
      const app = createApp();
      const admin = `aleo1admin_404_${Date.now()}_${disputeCounter}`;
      const res = await request(app)
        .post('/disputes/non-existent/resolve')
        .send({ agent_percentage: 50, admin_address: admin });

      expect(res.status).toBe(404);
    });
  });

  describe('Per-address rate limiting', () => {
    it('should rate limit dispute creation from same address', async () => {
      const app = createApp();
      const clientAddr = 'aleo1client_rate_disp_' + Date.now();

      // Default config allows 3 disputes per hour per address
      let hitLimit = false;
      for (let i = 0; i < 10; i++) {
        const res = await request(app)
          .post('/disputes')
          .send(makeDispute({ client: clientAddr }));

        if (res.status === 429) {
          expect(res.body.error).toContain('Too many');
          expect(res.headers).toHaveProperty('retry-after');
          hitLimit = true;
          break;
        }
        expect(res.status).toBe(201);
      }

      expect(hitLimit).toBe(true);
    });

    it('should include rate limit headers in responses', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/disputes')
        .send(makeDispute());

      expect(res.headers).toHaveProperty('x-ratelimit-limit');
      expect(res.headers).toHaveProperty('x-ratelimit-remaining');
      expect(res.headers).toHaveProperty('x-ratelimit-reset');
    });
  });
});
