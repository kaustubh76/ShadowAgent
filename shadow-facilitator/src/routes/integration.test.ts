// ShadowAgent Facilitator - Cross-Route Integration Tests

// Integration tests involve many sequential requests — increase default timeout
jest.setTimeout(30000);

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
import sessionsRouter from './sessions';
import disputesRouter from './disputes';
import refundsRouter from './refunds';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/agents', agentsRouter);
  app.use('/sessions', sessionsRouter);
  app.use('/disputes', disputesRouter);
  app.use('/refunds', refundsRouter);
  return app;
}

describe('Cross-Route Integration Tests', () => {
  // Full E2E: register agent -> create session -> make request -> open dispute -> propose refund -> accept refund
  describe('Full lifecycle: agent registration through refund acceptance', () => {
    it('should complete the entire workflow end-to-end', async () => {
      const app = createApp();
      const ts = Date.now();
      const agentAddr = 'aleo1agent_e2e_' + ts;
      const clientAddr = 'aleo1client_e2e_' + ts;
      const jobHash = 'e2e-job-' + ts;

      // ─── Step 1: Register agent ───────────────────────────────────
      const registerRes = await request(app)
        .post('/agents/register')
        .send({ service_type: 1, address: agentAddr });

      expect(registerRes.status).toBe(201);
      expect(registerRes.body.success).toBe(true);
      expect(registerRes.body.agent_id).toBe(agentAddr);

      // ─── Step 2: Create payment session ───────────────────────────
      const sessionId = 'e2e_session_' + ts;
      const createSessionRes = await request(app)
        .post('/sessions')
        .send({
          agent: agentAddr,
          client: clientAddr,
          max_total: 5_000_000,
          max_per_request: 1_000_000,
          rate_limit: 50,
          duration_blocks: 14400,
          session_id: sessionId,
        });

      expect(createSessionRes.status).toBe(201);
      expect(createSessionRes.body.success).toBe(true);
      expect(createSessionRes.body.session.agent).toBe(agentAddr);
      expect(createSessionRes.body.session.client).toBe(clientAddr);
      expect(createSessionRes.body.session.status).toBe('active');

      // ─── Step 3: Make a request against the session ───────────────
      const requestRes = await request(app)
        .post('/sessions/' + sessionId + '/request')
        .send({ amount: 500_000, request_hash: 'e2e_req_1' });

      expect(requestRes.status).toBe(200);
      expect(requestRes.body.success).toBe(true);
      expect(requestRes.body.session.spent).toBe(500_000);
      expect(requestRes.body.receipt.amount).toBe(500_000);

      // ─── Step 4: Open dispute on the job ──────────────────────────
      const disputeRes = await request(app)
        .post('/disputes')
        .send({
          agent: agentAddr,
          client: clientAddr,
          job_hash: jobHash,
          escrow_amount: 500_000,
          evidence_hash: 'client-evidence-e2e-hash',
        });

      expect(disputeRes.status).toBe(201);
      expect(disputeRes.body.success).toBe(true);
      expect(disputeRes.body.dispute.status).toBe('opened');
      expect(disputeRes.body.dispute.agent).toBe(agentAddr);
      expect(disputeRes.body.dispute.client).toBe(clientAddr);

      // ─── Step 5: Propose partial refund ───────────────────────────
      const refundRes = await request(app)
        .post('/refunds')
        .send({
          agent: agentAddr,
          client: clientAddr,
          total_amount: 500_000,
          agent_amount: 200_000,
          job_hash: jobHash,
        });

      expect(refundRes.status).toBe(201);
      expect(refundRes.body.success).toBe(true);
      expect(refundRes.body.proposal.status).toBe('proposed');
      expect(refundRes.body.proposal.agent_amount).toBe(200_000);
      expect(refundRes.body.proposal.client_amount).toBe(300_000);

      // ─── Step 6: Accept the refund ────────────────────────────────
      const acceptRes = await request(app)
        .post('/refunds/' + jobHash + '/accept')
        .send({ agent_id: agentAddr });

      expect(acceptRes.status).toBe(200);
      expect(acceptRes.body.proposal.status).toBe('accepted');

      // ─── Step 7: Close the session ────────────────────────────────
      const closeRes = await request(app)
        .post('/sessions/' + sessionId + '/close');

      expect(closeRes.status).toBe(200);
      expect(closeRes.body.session.status).toBe('closed');
      expect(closeRes.body.refund_amount).toBe(5_000_000 - 500_000);
    });
  });

  describe('Dispute with agent response then resolution', () => {
    it('should handle dispute -> agent response -> split resolution', async () => {
      const app = createApp();
      const ts = Date.now();
      const agentAddr = 'aleo1agent_disp_' + ts;
      const clientAddr = 'aleo1client_disp_' + ts;
      const jobHash = 'disp-resolve-' + ts;

      // Register agent
      const regRes = await request(app)
        .post('/agents/register')
        .send({ service_type: 3, address: agentAddr });
      expect(regRes.status).toBe(201);

      // Open dispute
      const openRes = await request(app)
        .post('/disputes')
        .send({
          agent: agentAddr,
          client: clientAddr,
          job_hash: jobHash,
          escrow_amount: 1_000_000,
          evidence_hash: 'client-evidence-hash',
        });
      expect(openRes.status).toBe(201);
      expect(openRes.body.dispute.status).toBe('opened');

      // Agent responds with counter-evidence
      const respondRes = await request(app)
        .post('/disputes/' + jobHash + '/respond')
        .send({
          agent_id: agentAddr,
          evidence_hash: 'agent-counter-evidence-hash',
        });
      expect(respondRes.status).toBe(200);
      expect(respondRes.body.dispute.status).toBe('agent_responded');
      expect(respondRes.body.dispute.agent_evidence_hash).toBe('agent-counter-evidence-hash');

      // Admin resolves with 70/30 split
      const resolveRes = await request(app)
        .post('/disputes/' + jobHash + '/resolve')
        .send({ agent_percentage: 70 });

      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.dispute.status).toBe('resolved_split');
      expect(resolveRes.body.dispute.resolution_agent_pct).toBe(70);
      expect(resolveRes.body.settlement.agent_amount).toBe(700_000);
      expect(resolveRes.body.settlement.client_amount).toBe(300_000);
    });
  });

  describe('Session with policy enforcement', () => {
    it('should create policy -> create session within bounds -> use session -> close', async () => {
      const app = createApp();
      const ts = Date.now();
      const agentAddr = 'aleo1agent_policy_' + ts;

      // Register agent
      await request(app)
        .post('/agents/register')
        .send({ service_type: 2, address: agentAddr });

      // Create spending policy
      const policyRes = await request(app)
        .post('/sessions/policies')
        .send({
          owner: 'aleo1policy_owner_' + ts,
          max_session_value: 10_000_000,
          max_single_request: 2_000_000,
          require_proofs: false,
        });
      expect(policyRes.status).toBe(201);
      const policyId = policyRes.body.policy.policy_id;

      // Create session from policy
      const sessionRes = await request(app)
        .post('/sessions/policies/' + policyId + '/create-session')
        .send({
          agent: agentAddr,
          max_total: 5_000_000,
          max_per_request: 1_000_000,
          rate_limit: 100,
          duration_blocks: 14400,
        });
      expect(sessionRes.status).toBe(201);
      expect(sessionRes.body.policy_id).toBe(policyId);

      const sessionId = sessionRes.body.session.session_id;

      // Make requests
      const req1 = await request(app)
        .post('/sessions/' + sessionId + '/request')
        .send({ amount: 800_000, request_hash: 'policy_req_1' });
      expect(req1.status).toBe(200);

      const req2 = await request(app)
        .post('/sessions/' + sessionId + '/request')
        .send({ amount: 200_000, request_hash: 'policy_req_2' });
      expect(req2.status).toBe(200);
      expect(req2.body.session.spent).toBe(1_000_000);

      // Settle
      const settleRes = await request(app)
        .post('/sessions/' + sessionId + '/settle')
        .send({ settlement_amount: 1_000_000 });
      expect(settleRes.status).toBe(200);

      // Close
      const closeRes = await request(app)
        .post('/sessions/' + sessionId + '/close');
      expect(closeRes.status).toBe(200);
      expect(closeRes.body.refund_amount).toBe(5_000_000 - 1_000_000);
    });
  });

  describe('Rating after session completion', () => {
    it('should register agent -> run session -> rate agent', async () => {
      const app = createApp();
      const ts = Date.now();
      const agentAddr = 'aleo1agent_rate_' + ts;
      const sessionId = 'rate_session_' + ts;

      // Register
      const regRes = await request(app)
        .post('/agents/register')
        .send({ service_type: 1, address: agentAddr });
      expect(regRes.status).toBe(201);

      // Create and use session
      await request(app)
        .post('/sessions')
        .send({
          agent: agentAddr,
          client: 'aleo1client_rate_' + ts,
          max_total: 2_000_000,
          max_per_request: 500_000,
          rate_limit: 10,
          duration_blocks: 14400,
          session_id: sessionId,
        });

      await request(app)
        .post('/sessions/' + sessionId + '/request')
        .send({ amount: 250_000, request_hash: 'rate_req_1' });

      // Close session
      const closeRes = await request(app)
        .post('/sessions/' + sessionId + '/close');
      expect(closeRes.status).toBe(200);

      // Rate the agent
      const rateRes = await request(app)
        .post('/agents/' + agentAddr + '/rating')
        .send({
          job_hash: 'rate_job_' + ts,
          rating: 40,
          payment_amount: 250_000,
        });
      expect(rateRes.status).toBe(201);
      expect(rateRes.body.success).toBe(true);
      expect(rateRes.body.rating.rating).toBe(40);
    });
  });

  describe('Rejected refund followed by dispute resolution', () => {
    it('should propose refund -> reject -> resolve dispute instead', async () => {
      const app = createApp();
      const ts = Date.now();
      const agentAddr = 'aleo1agent_rej_' + ts;
      const clientAddr = 'aleo1client_rej_' + ts;
      const jobHash = 'rej-refund-' + ts;

      // Open dispute
      const disputeRes = await request(app)
        .post('/disputes')
        .send({
          agent: agentAddr,
          client: clientAddr,
          job_hash: jobHash,
          escrow_amount: 800_000,
          evidence_hash: 'client-evidence-rej',
        });
      expect(disputeRes.status).toBe(201);

      // Propose refund (same job_hash)
      const refundRes = await request(app)
        .post('/refunds')
        .send({
          agent: agentAddr,
          client: clientAddr,
          total_amount: 800_000,
          agent_amount: 600_000,
          job_hash: jobHash,
        });
      expect(refundRes.status).toBe(201);

      // Client rejects the refund proposal
      const rejectRes = await request(app)
        .post('/refunds/' + jobHash + '/reject')
        .send({ agent_id: clientAddr });
      expect(rejectRes.status).toBe(200);
      expect(rejectRes.body.proposal.status).toBe('rejected');

      // Since refund rejected, resolve via dispute
      const resolveRes = await request(app)
        .post('/disputes/' + jobHash + '/resolve')
        .send({ agent_percentage: 40 });
      expect(resolveRes.status).toBe(200);
      expect(resolveRes.body.dispute.status).toBe('resolved_split');
      expect(resolveRes.body.settlement.agent_amount).toBe(320_000);
      expect(resolveRes.body.settlement.client_amount).toBe(480_000);
    });
  });

  describe('Agent unregistration after session close', () => {
    it('should register -> use session -> close -> unregister', async () => {
      const app = createApp();
      const ts = Date.now();
      const agentAddr = 'aleo1agent_unreg_' + ts;
      const sessionId = 'unreg_session_' + ts;

      // Register
      const regRes = await request(app)
        .post('/agents/register')
        .send({ service_type: 4, address: agentAddr });
      expect(regRes.status).toBe(201);

      // Create session
      await request(app)
        .post('/sessions')
        .send({
          agent: agentAddr,
          client: 'aleo1client_unreg_' + ts,
          max_total: 1_000_000,
          max_per_request: 200_000,
          rate_limit: 20,
          duration_blocks: 14400,
          session_id: sessionId,
        });

      // Use and close session
      await request(app)
        .post('/sessions/' + sessionId + '/request')
        .send({ amount: 100_000 });

      const closeRes = await request(app)
        .post('/sessions/' + sessionId + '/close');
      expect(closeRes.status).toBe(200);

      // Unregister agent
      const unregRes = await request(app)
        .post('/agents/unregister')
        .send({ agent_id: agentAddr });
      expect(unregRes.status).toBe(200);
      expect(unregRes.body.success).toBe(true);
      expect(unregRes.body.agent_id).toBe(agentAddr);
    });
  });
});
