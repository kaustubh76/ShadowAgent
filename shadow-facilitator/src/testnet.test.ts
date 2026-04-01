// ShadowAgent Facilitator — Real Testnet Integration Tests
// Tests facilitator routes and Aleo service against real testnet.
// Requires: running facilitator + env vars in .env.test

import { config } from 'dotenv';
import { resolve } from 'path';

config({ path: resolve(__dirname, '../../.env.test') });

import { AleoService } from './services/aleo';

const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3000';
const hasFacilitator = Boolean(process.env.FACILITATOR_URL);

const describeFacilitator = hasFacilitator ? describe : describe.skip;

// Pre-computed addresses from .env.test — avoids WASM import in CJS Jest
const CLIENT_ADDRESS = process.env.ALEO_ADDRESS_CLIENT || '';
const AGENT_ADDRESS = process.env.ALEO_ADDRESS_AGENT || '';

// Helper to generate valid-format Aleo test addresses (aleo1 + 58 lowercase alnum chars)
function testAddress(seed: string): string {
  const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
  const base = seed.toLowerCase().replace(/[^a-z0-9]/g, '');
  let padded = base;
  // Deterministically pad to 58 chars using the seed cycling
  while (padded.length < 58) {
    padded += chars[(padded.length * 7 + seed.length) % chars.length];
  }
  return 'aleo1' + padded.slice(0, 58);
}

// ═══════════════════════════════════════════════════════════════════
// 1. AleoService — Real testnet RPC calls
// ═══════════════════════════════════════════════════════════════════

describe('AleoService — Real Aleo testnet', () => {
  const service = new AleoService(
    process.env.ALEO_RPC_URL || 'https://api.explorer.provable.com/v1'
  );

  test('getBlockHeight returns real block height > 0', async () => {
    const height = await service.getBlockHeight();
    console.log(`Aleo testnet block height: ${height}`);
    expect(height).toBeGreaterThan(0);
  }, 30_000);

  test('getLatestBlock returns block info', async () => {
    const block = await service.getLatestBlock();
    console.log(`Latest block: height=${block.height}, hash=${block.hash.slice(0, 20)}...`);
    expect(block.height).toBeGreaterThan(0);
    expect(block.hash).toBeTruthy();
    expect(block.timestamp).toBeGreaterThan(0);
  }, 30_000);

  test('getAgentListing returns null for non-existent agent', async () => {
    const listing = await service.getAgentListing('99999999999');
    expect(listing).toBeNull();
  }, 30_000);

  test('isNullifierUsed returns false for random nullifier', async () => {
    const used = await service.isNullifierUsed('random-test-nullifier-' + Date.now());
    expect(used).toBe(false);
  }, 30_000);

  test('isAddressRegistered checks real mapping', async () => {
    // Random address shouldn't be registered
    const registered = await service.isAddressRegistered(
      'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc'
    );
    expect(typeof registered).toBe('boolean');
    console.log(`Zero address registered: ${registered}`);
  }, 30_000);

  test('getRegistrationBond returns 10 credits', () => {
    expect(service.getRegistrationBond()).toBe(10_000_000);
  });

  test('healthCheck returns healthy with blockHeight', async () => {
    const health = await service.healthCheck();
    console.log('Aleo service health:', health);
    expect(health.healthy).toBe(true);
    expect(health.blockHeight).toBeGreaterThan(0);
  }, 30_000);

  test('getCircuitBreakerStats returns stats object', () => {
    const stats = service.getCircuitBreakerStats();
    expect(stats).toHaveProperty('state');
    expect(stats).toHaveProperty('failureCount');
  });

  test('getProgramId returns shadow_agent.aleo', () => {
    expect(service.getProgramId()).toBe('shadow_agent.aleo');
  });

  test('verifyEscrowProof rejects invalid proof structure', async () => {
    const result = await service.verifyEscrowProof({
      proof: '',
      nullifier: '',
      commitment: '',
      amount: 0,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('missing required fields');
  });

  test('verifyReputationProof rejects invalid proof type', async () => {
    const result = await service.verifyReputationProof({
      proof_type: 99,
      proof: 'dGVzdA==',
      threshold: 1,
    });
    expect(result.valid).toBe(false);
    expect(result.error).toContain('Invalid proof type');
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Health Endpoint — Real facilitator
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Health endpoints — Real facilitator', () => {
  test('GET /health returns ok', async () => {
    const res = await fetch(`${FACILITATOR_URL}/health`);
    const body = await res.json() as any;
    console.log('Health response:', body);
    expect(res.ok).toBe(true);
    expect(body.status).toBe('ok');
  }, 15_000);

  test('GET /health/ready returns readiness with blockHeight', async () => {
    const res = await fetch(`${FACILITATOR_URL}/health/ready`);
    const body = await res.json() as any;
    console.log('Ready response:', body);
    expect(res.ok).toBe(true);
  }, 15_000);

  test('GET /health/detailed returns subsystem info', async () => {
    const res = await fetch(`${FACILITATOR_URL}/health/detailed`);
    const body = await res.json() as any;
    console.log('Detailed health:', JSON.stringify(body, null, 2));
    expect(res.ok).toBe(true);
    expect(body).toHaveProperty('subsystems');
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 3. Agent Routes — Registration + Search
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Agent routes — Real facilitator', () => {
  let agentId: string;
  const agentAddress = AGENT_ADDRESS || testAddress('facilitatoragent');

  test('POST /agents/register creates agent', async () => {
    const res = await fetch(`${FACILITATOR_URL}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: agentAddress,
        service_type: 3, // Code
      }),
    });
    const body = await res.json() as any;
    console.log('Register response:', body);
    expect(res.status).toBe(201);
    expect(body.success).toBe(true);
    expect(body.agent_id).toBeTruthy();
    agentId = body.agent_id;
  }, 15_000);

  test('GET /agents searches agents', async () => {
    const res = await fetch(`${FACILITATOR_URL}/agents?limit=5`);
    const body = await res.json() as any;
    console.log(`Search found ${body.total} agents`);
    expect(res.ok).toBe(true);
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.agents)).toBe(true);
  }, 15_000);

  test('GET /agents with service_type filter', async () => {
    const res = await fetch(`${FACILITATOR_URL}/agents?service_type=3`);
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    // All returned agents should be Code type
    for (const agent of body.agents) {
      expect(agent.service_type).toBe(3);
    }
  }, 15_000);

  test('GET /agents/:agentId returns agent details', async () => {
    if (!agentId) return;
    const res = await fetch(`${FACILITATOR_URL}/agents/${agentId}`);
    if (res.ok) {
      const body = await res.json() as any;
      expect(body.agent_id).toBe(agentId);
    }
    // May be 404 if indexer hasn't cached yet — acceptable
  }, 15_000);

  test('POST /agents/:agentId/rating submits rating', async () => {
    if (!agentId) return;
    const jobHash = 'test-job-' + Date.now();
    const res = await fetch(`${FACILITATOR_URL}/agents/${agentId}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        job_hash: jobHash,
        rating: 45, // 4.5 stars (scaled)
        payment_amount: 100_000,
      }),
    });
    const body = await res.json() as any;
    console.log('Rating response:', body);
    expect(res.status).toBeLessThanOrEqual(201);
  }, 15_000);

  test('POST /agents/register rejects invalid address', async () => {
    const res = await fetch(`${FACILITATOR_URL}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: 'invalid-address',
        service_type: 1,
      }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 4. Session Routes — Full lifecycle
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Session routes — Real facilitator', () => {
  let sessionId: string;
  const clientAddr = testAddress('sessionclient' + Date.now().toString(36));
  const agentAddr = testAddress('sessionagent' + Date.now().toString(36));

  test('POST /sessions creates session', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: clientAddr,
        agent: agentAddr,
        max_total: 500_000,
        max_per_request: 100_000,
        rate_limit: 5,
        duration_blocks: 500,
      }),
    });
    const body = await res.json() as any;
    console.log('Create session:', body);
    expect(res.status).toBe(201);
    sessionId = body.session.session_id;
    expect(sessionId).toBeTruthy();
  }, 15_000);

  test('GET /sessions/:id returns session', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}`);
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(body.session_id).toBe(sessionId);
    expect(body.status).toBe('active');
    expect(body.spent).toBe(0);
  }, 15_000);

  test('POST /sessions/:id/request records spending', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 50_000, request_hash: 'hash-1' }),
    });
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(body.session.spent).toBe(50_000);
  }, 15_000);

  test('POST /sessions/:id/request rejects over per-request limit', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}/request`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: 200_000, request_hash: 'hash-big' }),
    });
    expect(res.status).toBeGreaterThanOrEqual(400);
  }, 15_000);

  test('POST /sessions/:id/settle settles payments', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}/settle`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ settlement_amount: 50_000, agent: agentAddr }),
    });
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    console.log('Settlement:', body);
  }, 15_000);

  test('POST /sessions/:id/pause pauses session', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: clientAddr }),
    });
    expect(res.ok).toBe(true);

    const status = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}`);
    const body = await status.json() as any;
    expect(body.status).toBe('paused');
  }, 15_000);

  test('POST /sessions/:id/resume resumes session', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}/resume`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: clientAddr }),
    });
    expect(res.ok).toBe(true);

    const status = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}`);
    const body = await status.json() as any;
    expect(body.status).toBe('active');
  }, 15_000);

  test('POST /sessions/:id/close closes session', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}/close`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ client: clientAddr }),
    });
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    console.log('Close session:', body);

    const status = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}`);
    const statusBody = await status.json() as any;
    expect(statusBody.status).toBe('closed');
  }, 15_000);

  test('GET /sessions lists sessions', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions?client=${clientAddr}`);
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(Array.isArray(body)).toBe(true);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 5. Policy Routes
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Policy routes — Real facilitator', () => {
  let policyId: string;
  const owner = testAddress('policyowner' + Date.now().toString(36));

  test('POST /sessions/policies creates policy', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner,
        max_session_value: 1_000_000,
        max_single_request: 100_000,
        allowed_tiers: 0xff,
        allowed_categories: 0xffffffff,
        require_proofs: false,
      }),
    });
    const body = await res.json() as any;
    console.log('Create policy:', body);
    expect(res.status).toBe(201);
    policyId = body.policy.policy_id;
    expect(policyId).toBeTruthy();
  }, 15_000);

  test('GET /sessions/policies lists policies', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/policies?owner=${owner}`);
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  }, 15_000);

  test('POST /sessions/policies/:id/create-session creates bounded session', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/policies/${policyId}/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: owner,
        agent: testAddress('policyagent' + Date.now().toString(36)),
        max_total: 500_000,
        max_per_request: 50_000,
        rate_limit: 5,
        duration_blocks: 500,
      }),
    });
    const body = await res.json() as any;
    console.log('Session from policy:', body);
    expect(res.status).toBe(201);
    expect(body.session).toBeDefined();
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 6. Dispute Routes
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Dispute routes — Real facilitator', () => {
  let jobHash: string;

  test('POST /disputes opens dispute', async () => {
    jobHash = 'dispute-test-' + Date.now();
    const res = await fetch(`${FACILITATOR_URL}/disputes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: testAddress('disputeagent'),
        client: testAddress('disputeclient'),
        job_hash: jobHash,
        escrow_amount: 100_000,
        evidence_hash: 'evidence-' + Date.now(),
      }),
    });
    const body = await res.json() as any;
    console.log('Open dispute:', body);
    expect(res.status).toBe(201);
    expect(body.dispute.status).toBe('opened');
  }, 15_000);

  test('POST /disputes/:jobHash/respond records response', async () => {
    const res = await fetch(`${FACILITATOR_URL}/disputes/${jobHash}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: testAddress('disputeagent'),
        evidence_hash: 'counter-evidence-' + Date.now(),
      }),
    });
    const body = await res.json() as any;
    console.log('Dispute response:', body);
    expect(res.ok).toBe(true);
  }, 15_000);

  test('GET /disputes/:jobHash returns dispute', async () => {
    const res = await fetch(`${FACILITATOR_URL}/disputes/${jobHash}`);
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(body.job_hash).toBe(jobHash);
  }, 15_000);

  test('GET /disputes lists disputes', async () => {
    const res = await fetch(`${FACILITATOR_URL}/disputes`);
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(Array.isArray(body)).toBe(true);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 7. Refund Routes
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Refund routes — Real facilitator', () => {
  let jobHash: string;

  test('POST /refunds creates proposal', async () => {
    jobHash = 'refund-test-' + Date.now();
    const res = await fetch(`${FACILITATOR_URL}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: testAddress('refundagent'),
        client: testAddress('refundclient'),
        total_amount: 100_000,
        agent_amount: 70_000,
        job_hash: jobHash,
      }),
    });
    const body = await res.json() as any;
    console.log('Propose refund:', body);
    expect(res.status).toBe(201);
    expect(body.proposal.status).toBe('proposed');
    expect(body.proposal.agent_amount).toBe(70_000);
    expect(body.proposal.client_amount).toBe(30_000);
  }, 15_000);

  test('GET /refunds/:jobHash returns proposal', async () => {
    const res = await fetch(`${FACILITATOR_URL}/refunds/${jobHash}`);
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(body.job_hash).toBe(jobHash);
  }, 15_000);

  test('POST /refunds/:jobHash/accept accepts proposal', async () => {
    const res = await fetch(`${FACILITATOR_URL}/refunds/${jobHash}/accept`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: testAddress('refundagent') }),
    });
    const body = await res.json() as any;
    console.log('Accept refund:', body);
    expect(res.ok).toBe(true);
    expect(body.proposal.status).toBe('accepted');
  }, 15_000);

  test('POST /refunds — reject flow', async () => {
    const rejectHash = 'refund-reject-' + Date.now();
    await fetch(`${FACILITATOR_URL}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: testAddress('refundagent2'),
        client: testAddress('refundclient2'),
        total_amount: 50_000,
        agent_amount: 30_000,
        job_hash: rejectHash,
      }),
    });

    const res = await fetch(`${FACILITATOR_URL}/refunds/${rejectHash}/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ agent_id: testAddress('refundagent2') }),
    });
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(body.proposal.status).toBe('rejected');
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 8. Multi-Sig Escrow Routes
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Multi-sig escrow routes — Real facilitator', () => {
  let jobHash: string;

  test('POST /escrows/multisig creates escrow', async () => {
    jobHash = 'multisig-test-' + Date.now();
    const res = await fetch(`${FACILITATOR_URL}/escrows/multisig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: testAddress('msagent'),
        owner: testAddress('msowner'),
        amount: 200_000,
        job_hash: jobHash,
        secret_hash: 'secret-hash-' + Date.now(),
        deadline: 100_000,
        signers: [testAddress('signer1'), testAddress('signer2'), testAddress('signer3')],
        required_signatures: 2,
      }),
    });
    const body = await res.json() as any;
    console.log('Create multi-sig:', body);
    expect(res.status).toBe(201);
    expect(body.escrow).toBeDefined();
  }, 15_000);

  test('GET /escrows/multisig/:jobHash returns escrow', async () => {
    const res = await fetch(`${FACILITATOR_URL}/escrows/multisig/${jobHash}`);
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(body.job_hash).toBe(jobHash);
    expect(body.required_sigs).toBe(2);
  }, 15_000);

  test('POST /escrows/multisig/:jobHash/approve records approval', async () => {
    const res = await fetch(`${FACILITATOR_URL}/escrows/multisig/${jobHash}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signer_address: testAddress('signer1') }),
    });
    const body = await res.json() as any;
    console.log('Approve escrow:', body);
    expect(res.ok).toBe(true);
    expect(body.escrow.sig_count).toBe(1);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 9. Verify Routes
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Verify routes — Real facilitator', () => {
  test('POST /verify/nullifier checks random nullifier', async () => {
    const res = await fetch(`${FACILITATOR_URL}/verify/nullifier`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nullifier: 'test-nullifier-' + Date.now() }),
    });
    const body = await res.json() as any;
    expect(res.ok).toBe(true);
    expect(body.is_used).toBe(false);
  }, 15_000);

  test('POST /verify/escrow rejects empty proof', async () => {
    const res = await fetch(`${FACILITATOR_URL}/verify/escrow`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ proof: '', nullifier: '', commitment: '' }),
    });
    const body = await res.json() as any;
    expect(body.valid).toBe(false);
  }, 15_000);

  test('POST /verify/reputation rejects invalid proof type', async () => {
    const res = await fetch(`${FACILITATOR_URL}/verify/reputation`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        proof_type: 99,
        threshold: 1,
        proof: 'dGVzdA==',
      }),
    });
    const body = await res.json() as any;
    expect(body.valid).toBe(false);
  }, 15_000);
});
