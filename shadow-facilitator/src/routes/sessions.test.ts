// ShadowAgent Facilitator - Session Route Tests

import express from 'express';
import request from 'supertest';
import sessionsRouter from './sessions';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/sessions', sessionsRouter);
  return app;
}

const VALID_SESSION = {
  agent: 'aleo1agentxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  client: 'aleo1clientxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  max_total: 10_000_000,
  max_per_request: 500_000,
  rate_limit: 100,
  duration_blocks: 14400,
};

describe('Session Routes', () => {
  describe('POST /sessions', () => {
    it('should create a new session', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send(VALID_SESSION);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session.status).toBe('active');
      expect(res.body.session.agent).toBe(VALID_SESSION.agent);
      expect(res.body.session.max_total).toBe(VALID_SESSION.max_total);
      expect(res.body.session.spent).toBe(0);
      expect(res.body.session.request_count).toBe(0);
    });

    it('should accept a custom session_id', async () => {
      const app = createApp();
      const sessionId = 'custom_session_' + Date.now();
      const res = await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      expect(res.status).toBe(201);
      expect(res.body.session.session_id).toBe(sessionId);
    });

    it('should reject duplicate session_id', async () => {
      const app = createApp();
      const sessionId = 'dup_session_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      expect(res.status).toBe(409);
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ agent: 'aleo1test' });

      expect(res.status).toBe(400);
    });

    it('should reject max_per_request > max_total', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, max_per_request: 20_000_000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('max_per_request');
    });
  });

  describe('GET /sessions/:sessionId', () => {
    it('should return session by ID', async () => {
      const app = createApp();
      const sessionId = 'get_session_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app).get(`/sessions/${sessionId}`);

      expect(res.status).toBe(200);
      expect(res.body.session_id).toBe(sessionId);
      expect(res.body.status).toBe('active');
    });

    it('should return 404 for non-existent session', async () => {
      const app = createApp();
      const res = await request(app).get('/sessions/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('GET /sessions (list with filters)', () => {
    it('should return all sessions', async () => {
      const app = createApp();
      const sessionId = 'list_session_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app).get('/sessions');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should filter by agent', async () => {
      const app = createApp();
      const agent = 'aleo1filteragent_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, agent, session_id: 'filter_agent_' + Date.now() });

      const res = await request(app).get(`/sessions?agent=${agent}`);

      expect(res.status).toBe(200);
      for (const s of res.body) {
        expect(s.agent).toBe(agent);
      }
    });

    it('should filter by status', async () => {
      const app = createApp();
      const sessionId = 'status_filter_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app).get('/sessions?status=active');

      expect(res.status).toBe(200);
      for (const s of res.body) {
        expect(s.status).toBe('active');
      }
    });
  });

  describe('POST /sessions/:sessionId/request', () => {
    it('should record a request against a session', async () => {
      const app = createApp();
      const sessionId = 'req_session_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 100_000, request_hash: 'req_hash_001' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session.spent).toBe(100_000);
      expect(res.body.receipt.amount).toBe(100_000);
    });

    it('should reject amount exceeding per-request limit', async () => {
      const app = createApp();
      const sessionId = 'per_req_limit_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 1_000_000, request_hash: 'req_over' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('per-request limit');
    });

    it('should reject amount exceeding total budget', async () => {
      const app = createApp();
      const sessionId = 'total_limit_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({
          ...VALID_SESSION,
          session_id: sessionId,
          max_total: 200_000,
          max_per_request: 200_000,
        });

      // First request uses up most of the budget
      await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 150_000 });

      // Second request would exceed total
      const res = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 100_000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('session limit');
    });

    it('should reject request on non-active session', async () => {
      const app = createApp();
      const sessionId = 'paused_req_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      // Pause the session
      await request(app).post(`/sessions/${sessionId}/pause`);

      const res = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 100_000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('not active');
    });

    it('should reject zero or negative amount', async () => {
      const app = createApp();
      const sessionId = 'zero_amount_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 0 });

      expect(res.status).toBe(400);
    });

    it('should enforce rate limit', async () => {
      const app = createApp();
      const sessionId = 'rate_limit_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({
          ...VALID_SESSION,
          session_id: sessionId,
          rate_limit: 3,
          max_per_request: 100_000,
        });

      // Make 3 requests (at limit)
      for (let i = 0; i < 3; i++) {
        const res = await request(app)
          .post(`/sessions/${sessionId}/request`)
          .send({ amount: 10_000, request_hash: `rate_req_${i}` });
        expect(res.status).toBe(200);
      }

      // 4th request should be rate limited
      const res = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 10_000, request_hash: 'rate_req_over' });

      expect(res.status).toBe(429);
    });

    it('should include retryAfter in rate limit response', async () => {
      const app = createApp();
      const sessionId = 'rate_retry_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({
          ...VALID_SESSION,
          session_id: sessionId,
          rate_limit: 1,
          max_per_request: 100_000,
        });

      // Exhaust the limit
      await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 10_000, request_hash: 'first' });

      // Should get 429 with retryAfter
      const res = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 10_000, request_hash: 'over' });

      expect(res.status).toBe(429);
      expect(res.body.retryAfter).toBeDefined();
      expect(res.body.resetAt).toBeDefined();
    });

    it('should set window_start on session creation', async () => {
      const app = createApp();
      const sessionId = 'window_start_' + Date.now();
      const before = Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const getRes = await request(app).get(`/sessions/${sessionId}`);

      expect(getRes.body.window_start).toBeGreaterThanOrEqual(before);
      expect(getRes.body.prev_window_count).toBe(0);
    });
  });

  describe('POST /sessions/:sessionId/settle', () => {
    it('should settle accumulated payments', async () => {
      const app = createApp();
      const sessionId = 'settle_session_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      // Make some requests first
      await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 200_000 });

      await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 300_000 });

      // Settle
      const res = await request(app)
        .post(`/sessions/${sessionId}/settle`)
        .send({ settlement_amount: 500_000 });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.settlement.amount).toBe(500_000);
    });

    it('should reject settlement exceeding spent amount', async () => {
      const app = createApp();
      const sessionId = 'over_settle_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 100_000 });

      const res = await request(app)
        .post(`/sessions/${sessionId}/settle`)
        .send({ settlement_amount: 500_000 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('exceeds total spent');
    });

    it('should reject settlement on closed session', async () => {
      const app = createApp();
      const sessionId = 'closed_settle_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      // Close it
      await request(app).post(`/sessions/${sessionId}/close`);

      const res = await request(app)
        .post(`/sessions/${sessionId}/settle`)
        .send({ settlement_amount: 100_000 });

      expect(res.status).toBe(400);
    });
  });

  describe('POST /sessions/:sessionId/close', () => {
    it('should close an active session', async () => {
      const app = createApp();
      const sessionId = 'close_session_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app)
        .post(`/sessions/${sessionId}/close`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session.status).toBe('closed');
      expect(res.body.refund_amount).toBe(VALID_SESSION.max_total);
    });

    it('should calculate correct refund after spending', async () => {
      const app = createApp();
      const sessionId = 'refund_calc_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 300_000 });

      const res = await request(app)
        .post(`/sessions/${sessionId}/close`);

      expect(res.status).toBe(200);
      expect(res.body.refund_amount).toBe(VALID_SESSION.max_total - 300_000);
    });

    it('should reject closing an already closed session', async () => {
      const app = createApp();
      const sessionId = 'double_close_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      await request(app).post(`/sessions/${sessionId}/close`);

      const res = await request(app)
        .post(`/sessions/${sessionId}/close`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /sessions/:sessionId/pause', () => {
    it('should pause an active session', async () => {
      const app = createApp();
      const sessionId = 'pause_session_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app)
        .post(`/sessions/${sessionId}/pause`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session.status).toBe('paused');
    });

    it('should reject pausing a non-active session', async () => {
      const app = createApp();
      const sessionId = 'pause_closed_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      await request(app).post(`/sessions/${sessionId}/close`);

      const res = await request(app)
        .post(`/sessions/${sessionId}/pause`);

      expect(res.status).toBe(400);
    });
  });

  describe('POST /sessions/:sessionId/resume', () => {
    it('should resume a paused session', async () => {
      const app = createApp();
      const sessionId = 'resume_session_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      await request(app).post(`/sessions/${sessionId}/pause`);

      const res = await request(app)
        .post(`/sessions/${sessionId}/resume`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.session.status).toBe('active');
    });

    it('should reject resuming a non-paused session', async () => {
      const app = createApp();
      const sessionId = 'resume_active_' + Date.now();

      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      const res = await request(app)
        .post(`/sessions/${sessionId}/resume`);

      expect(res.status).toBe(400);
    });
  });

  // ═══════════════════════════════════════════════════════════════════
  // Spending Policies
  // ═══════════════════════════════════════════════════════════════════

  describe('POST /sessions/policies', () => {
    it('should create a spending policy', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sessions/policies')
        .send({
          owner: 'aleo1owner',
          max_session_value: 50_000_000,
          max_single_request: 1_000_000,
          require_proofs: true,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.policy.max_session_value).toBe(50_000_000);
      expect(res.body.policy.require_proofs).toBe(true);
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sessions/policies')
        .send({ owner: 'aleo1test' });

      expect(res.status).toBe(400);
    });

    it('should reject max_single_request > max_session_value', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sessions/policies')
        .send({
          owner: 'aleo1owner',
          max_session_value: 1_000_000,
          max_single_request: 5_000_000,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('max_single_request');
    });
  });

  describe('GET /sessions/policies', () => {
    it('should list all policies', async () => {
      const app = createApp();
      await request(app)
        .post('/sessions/policies')
        .send({
          owner: 'aleo1list_owner',
          max_session_value: 10_000_000,
          max_single_request: 500_000,
        });

      const res = await request(app).get('/sessions/policies');

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBeGreaterThan(0);
    });

    it('should filter by owner', async () => {
      const app = createApp();
      const owner = 'aleo1filter_' + Date.now();

      await request(app)
        .post('/sessions/policies')
        .send({
          owner,
          max_session_value: 10_000_000,
          max_single_request: 500_000,
        });

      const res = await request(app).get(`/sessions/policies?owner=${owner}`);

      expect(res.status).toBe(200);
      for (const p of res.body) {
        expect(p.owner).toBe(owner);
      }
    });
  });

  describe('GET /sessions/policies/:policyId', () => {
    it('should return policy by ID', async () => {
      const app = createApp();
      const createRes = await request(app)
        .post('/sessions/policies')
        .send({
          owner: 'aleo1get_policy',
          max_session_value: 20_000_000,
          max_single_request: 1_000_000,
        });

      const policyId = createRes.body.policy.policy_id;

      const res = await request(app).get(`/sessions/policies/${policyId}`);

      expect(res.status).toBe(200);
      expect(res.body.policy_id).toBe(policyId);
    });

    it('should return 404 for non-existent policy', async () => {
      const app = createApp();
      const res = await request(app).get('/sessions/policies/non-existent');
      expect(res.status).toBe(404);
    });
  });

  describe('POST /sessions/policies/:policyId/create-session', () => {
    it('should create session within policy bounds', async () => {
      const app = createApp();
      const createPolicyRes = await request(app)
        .post('/sessions/policies')
        .send({
          owner: 'aleo1policy_session',
          max_session_value: 50_000_000,
          max_single_request: 2_000_000,
        });

      const policyId = createPolicyRes.body.policy.policy_id;

      const res = await request(app)
        .post(`/sessions/policies/${policyId}/create-session`)
        .send({
          agent: 'aleo1agent_policy',
          max_total: 10_000_000,
          max_per_request: 500_000,
          rate_limit: 100,
          duration_blocks: 14400,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.session.max_total).toBe(10_000_000);
      expect(res.body.policy_id).toBe(policyId);
    });

    it('should reject session exceeding policy max_session_value', async () => {
      const app = createApp();
      const createPolicyRes = await request(app)
        .post('/sessions/policies')
        .send({
          owner: 'aleo1exceed_policy',
          max_session_value: 5_000_000,
          max_single_request: 500_000,
        });

      const policyId = createPolicyRes.body.policy.policy_id;

      const res = await request(app)
        .post(`/sessions/policies/${policyId}/create-session`)
        .send({
          agent: 'aleo1agent',
          max_total: 10_000_000,
          max_per_request: 500_000,
          rate_limit: 100,
          duration_blocks: 14400,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('policy limit');
    });

    it('should reject session exceeding policy max_single_request', async () => {
      const app = createApp();
      const createPolicyRes = await request(app)
        .post('/sessions/policies')
        .send({
          owner: 'aleo1exceed_req',
          max_session_value: 50_000_000,
          max_single_request: 100_000,
        });

      const policyId = createPolicyRes.body.policy.policy_id;

      const res = await request(app)
        .post(`/sessions/policies/${policyId}/create-session`)
        .send({
          agent: 'aleo1agent',
          max_total: 10_000_000,
          max_per_request: 500_000,
          rate_limit: 100,
          duration_blocks: 14400,
        });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('policy limit');
    });

    it('should return 404 for non-existent policy', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sessions/policies/non-existent/create-session')
        .send({
          agent: 'aleo1agent',
          max_total: 10_000_000,
          max_per_request: 500_000,
          rate_limit: 100,
          duration_blocks: 14400,
        });

      expect(res.status).toBe(404);
    });
  });

  describe('Concurrency (withSessionLock)', () => {
    it('should prevent concurrent overspend — only one of two exceeding requests succeeds', async () => {
      const app = createApp();
      const sessionId = 'concurrent_spend_' + Date.now();

      // Create a session with 1000 budget
      await request(app)
        .post('/sessions')
        .send({
          ...VALID_SESSION,
          session_id: sessionId,
          max_total: 1_000,
          max_per_request: 600,
          rate_limit: 100,
        });

      // Fire two 600-credit requests concurrently (total 1200 > 1000 limit)
      const [r1, r2] = await Promise.all([
        request(app).post(`/sessions/${sessionId}/request`).send({ amount: 600 }),
        request(app).post(`/sessions/${sessionId}/request`).send({ amount: 600 }),
      ]);

      const statuses = [r1.status, r2.status].sort();
      // Exactly one should succeed (200), one should fail (400)
      expect(statuses).toEqual([200, 400]);

      // Verify total spent is exactly 600, not 1200
      const getRes = await request(app).get(`/sessions/${sessionId}`);
      expect(getRes.body.spent).toBe(600);
    });

    it('should not block different sessions from each other', async () => {
      const app = createApp();
      const id1 = 'no_block_1_' + Date.now();
      const id2 = 'no_block_2_' + Date.now();

      await request(app).post('/sessions').send({ ...VALID_SESSION, session_id: id1 });
      await request(app).post('/sessions').send({ ...VALID_SESSION, session_id: id2 });

      // Both should succeed in parallel
      const [r1, r2] = await Promise.all([
        request(app).post(`/sessions/${id1}/request`).send({ amount: 100_000 }),
        request(app).post(`/sessions/${id2}/request`).send({ amount: 100_000 }),
      ]);

      expect(r1.status).toBe(200);
      expect(r2.status).toBe(200);
    });

    it('should serialize settle and close on same session', async () => {
      const app = createApp();
      const sessionId = 'serial_close_' + Date.now();

      await request(app).post('/sessions').send({ ...VALID_SESSION, session_id: sessionId });
      await request(app).post(`/sessions/${sessionId}/request`).send({ amount: 200_000 });

      // Settle and close concurrently
      const [settleRes, closeRes] = await Promise.all([
        request(app).post(`/sessions/${sessionId}/settle`).send({ settlement_amount: 200_000 }),
        request(app).post(`/sessions/${sessionId}/close`),
      ]);

      // Both should complete without error (order may vary)
      const succeeded = [settleRes, closeRes].filter(r => r.status === 200);
      expect(succeeded.length).toBe(2);
    });
  });

  describe('Full session lifecycle', () => {
    it('should handle create → request → settle → close', async () => {
      const app = createApp();
      const sessionId = 'lifecycle_' + Date.now();

      // 1. Create
      const createRes = await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });
      expect(createRes.status).toBe(201);

      // 2. Make requests
      await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 200_000, request_hash: 'life_req_1' });

      await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 300_000, request_hash: 'life_req_2' });

      // 3. Settle
      const settleRes = await request(app)
        .post(`/sessions/${sessionId}/settle`)
        .send({ settlement_amount: 500_000 });
      expect(settleRes.status).toBe(200);

      // 4. Close
      const closeRes = await request(app)
        .post(`/sessions/${sessionId}/close`);
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.session.status).toBe('closed');
      expect(closeRes.body.refund_amount).toBe(VALID_SESSION.max_total - 500_000);

      // 5. Verify no more requests allowed
      const afterCloseRes = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 100_000 });
      expect(afterCloseRes.status).toBe(400);
    });

    it('should handle create → pause → resume → request → close', async () => {
      const app = createApp();
      const sessionId = 'lifecycle2_' + Date.now();

      // Create
      await request(app)
        .post('/sessions')
        .send({ ...VALID_SESSION, session_id: sessionId });

      // Pause
      const pauseRes = await request(app)
        .post(`/sessions/${sessionId}/pause`);
      expect(pauseRes.body.session.status).toBe('paused');

      // Reject request while paused
      const pausedReq = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 100_000 });
      expect(pausedReq.status).toBe(400);

      // Resume
      const resumeRes = await request(app)
        .post(`/sessions/${sessionId}/resume`);
      expect(resumeRes.body.session.status).toBe('active');

      // Request works after resume
      const reqRes = await request(app)
        .post(`/sessions/${sessionId}/request`)
        .send({ amount: 100_000, request_hash: 'after_resume' });
      expect(reqRes.status).toBe(200);

      // Close
      const closeRes = await request(app)
        .post(`/sessions/${sessionId}/close`);
      expect(closeRes.body.session.status).toBe('closed');
    });
  });
});
