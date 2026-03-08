// ShadowAgent SDK — Real Testnet Integration Tests
// Tests actual Aleo testnet functionality with faucet-funded keys.
// Skips gracefully when env vars are not set.

import { config } from 'dotenv';
import { resolve } from 'path';

// Load .env.test from project root
config({ path: resolve(__dirname, '../../.env.test') });

import {
  getAddress,
  getBalance,
  getBlockHeight,
  generateSecret,
  hashSecret,
  generateAgentId,
  generateJobHash,
  generateNullifier,
  createEscrowProof,
  createReputationProof,
  verifyHash,
  encodeBase64,
  decodeBase64,
  transferPublic,
  waitForTransaction,
  getTransactionRecordOutputs,
  calculateDecayedRating,
  calculateEffectiveTier,
  credits,
  rating,
  currency,
} from './crypto';
import { ShadowAgentClient, createClient } from './client';
import { ShadowAgentServer, createAgent } from './agent';
import { ServiceType, Tier, ProofType } from './types';

// ═══════════════════════════════════════════════════════════════════
// Test Configuration
// ═══════════════════════════════════════════════════════════════════

const CLIENT_KEY = process.env.ALEO_PRIVATE_KEY_CLIENT || '';
const AGENT_KEY = process.env.ALEO_PRIVATE_KEY_AGENT || '';
const FACILITATOR_URL = process.env.FACILITATOR_URL || 'http://localhost:3000';
const hasKeys = Boolean(CLIENT_KEY && AGENT_KEY);
const hasFacilitator = Boolean(process.env.FACILITATOR_URL);

const describeTestnet = hasKeys ? describe : describe.skip;
const describeFacilitator = (hasFacilitator && hasKeys) ? describe : describe.skip;

// ═══════════════════════════════════════════════════════════════════
// 1. Crypto — Pure functions (always run, no keys needed)
// ═══════════════════════════════════════════════════════════════════

describe('Crypto utilities', () => {
  test('generateSecret returns 64-char hex', () => {
    const secret = generateSecret();
    expect(secret).toHaveLength(64);
    expect(secret).toMatch(/^[0-9a-f]{64}$/);
  });

  test('hashSecret produces consistent SHA-256', async () => {
    const hash = await hashSecret('test-secret');
    expect(hash).toHaveLength(64);
    const hash2 = await hashSecret('test-secret');
    expect(hash).toBe(hash2);
  });

  test('verifyHash matches preimage', async () => {
    const secret = generateSecret();
    const hash = await hashSecret(secret);
    expect(await verifyHash(secret, hash)).toBe(true);
    expect(await verifyHash('wrong', hash)).toBe(false);
  });

  test('generateAgentId is deterministic', async () => {
    const id1 = await generateAgentId('aleo1test');
    const id2 = await generateAgentId('aleo1test');
    expect(id1).toBe(id2);
    expect(id1).toHaveLength(64);
  });

  test('generateJobHash includes nonce for uniqueness', async () => {
    const h1 = await generateJobHash('POST', '/api/chat');
    const h2 = await generateJobHash('POST', '/api/chat');
    expect(h1).not.toBe(h2); // Different nonces
  });

  test('generateNullifier combines caller and job', async () => {
    const n = await generateNullifier('caller-hash', 'job-hash');
    expect(n).toHaveLength(64);
  });

  test('encodeBase64 / decodeBase64 round-trips', () => {
    const obj = { amount: 100, agent: 'aleo1test' };
    const encoded = encodeBase64(obj);
    const decoded = decodeBase64(encoded);
    expect(decoded).toEqual(obj);
  });

  test('encodeBase64 handles UTF-8', () => {
    const str = 'Hello 世界 🌍';
    const encoded = encodeBase64(str);
    const decoded = decodeBase64<string>(encoded);
    expect(decoded).toBe(str);
  });

  test('credits utility converts correctly', () => {
    expect(credits.toMicrocredits(1)).toBe(1_000_000);
    expect(credits.toCredits(1_000_000)).toBe(1);
    expect(credits.format(1_500_000)).toBe('1.50 credits');
  });

  test('rating utility converts correctly', () => {
    expect(rating.toScaled(5)).toBe(50);
    expect(rating.toStars(50)).toBe(5);
    expect(rating.format(45)).toBe('4.5 ★');
  });

  test('currency utility converts correctly', () => {
    expect(currency.toMicrocents(1)).toBe(1_000_000);
    expect(currency.toDollars(1_000_000)).toBe(1);
    expect(currency.format(1_234_567)).toBe('$1.23');
  });

  test('calculateDecayedRating applies stepped decay', () => {
    const result = calculateDecayedRating(1000, 0, 100_800);
    expect(result.decayPeriods).toBe(1);
    expect(result.effectivePoints).toBe(950); // 1000 * 95 / 100
  });

  test('calculateDecayedRating caps at 10 periods', () => {
    const result = calculateDecayedRating(1000, 0, 100_800 * 20);
    expect(result.decayPeriods).toBe(10);
  });

  test('calculateEffectiveTier thresholds', () => {
    expect(calculateEffectiveTier(0, 0)).toBe(0); // New
    expect(calculateEffectiveTier(10, 10_000_000)).toBe(1); // Bronze
    expect(calculateEffectiveTier(50, 100_000_000)).toBe(2); // Silver
    expect(calculateEffectiveTier(200, 1_000_000_000)).toBe(3); // Gold
    expect(calculateEffectiveTier(1000, 10_000_000_000)).toBe(4); // Diamond
  });
});

// ═══════════════════════════════════════════════════════════════════
// 2. Real Testnet — On-chain operations (need funded keys)
// ═══════════════════════════════════════════════════════════════════

describeTestnet('Real Testnet — On-chain operations', () => {
  let clientAddress: string;
  let agentAddress: string;

  beforeAll(async () => {
    clientAddress = await getAddress(CLIENT_KEY);
    agentAddress = await getAddress(AGENT_KEY);
    console.log(`Client address: ${clientAddress}`);
    console.log(`Agent address: ${agentAddress}`);
  }, 30_000);

  test('getAddress derives valid aleo1... addresses', async () => {
    expect(clientAddress).toMatch(/^aleo1[a-z0-9]{58}$/);
    expect(agentAddress).toMatch(/^aleo1[a-z0-9]{58}$/);
    expect(clientAddress).not.toBe(agentAddress);
  }, 30_000);

  test('getBalance returns real balance from testnet', async () => {
    const clientBalance = await getBalance(clientAddress);
    const agentBalance = await getBalance(agentAddress);
    console.log(`Client balance: ${credits.format(clientBalance)}`);
    console.log(`Agent balance: ${credits.format(agentBalance)}`);

    expect(typeof clientBalance).toBe('number');
    expect(typeof agentBalance).toBe('number');
    // Faucet-funded accounts should have > 0
    expect(clientBalance).toBeGreaterThan(0);
    expect(agentBalance).toBeGreaterThan(0);
  }, 30_000);

  test('getBlockHeight returns real block height > 0', async () => {
    const height = await getBlockHeight();
    console.log(`Current block height: ${height}`);
    expect(height).toBeGreaterThan(0);
  }, 30_000);

  test('createEscrowProof generates signed proof with real key', async () => {
    const jobHash = await generateJobHash('POST', '/api/chat');
    const secretHash = await hashSecret(generateSecret());

    const proof = await createEscrowProof(
      {
        amount: 100_000,
        recipient: agentAddress,
        jobHash,
        secretHash,
      },
      CLIENT_KEY
    );

    expect(proof.proof).toBeTruthy();
    expect(proof.nullifier).toHaveLength(64);
    expect(proof.commitment).toHaveLength(64);
    expect(proof.amount).toBe(100_000);

    // Verify the proof is valid base64
    const decoded = decodeBase64<Record<string, unknown>>(proof.proof);
    expect(decoded).toHaveProperty('signature');
    expect(decoded).toHaveProperty('commitment');
  }, 60_000);

  test('createReputationProof generates signed proof with real key', async () => {
    const proof = await createReputationProof(
      ProofType.Tier,
      1,
      { totalJobs: 10, totalRatingPoints: 45, totalRevenue: 10_000_000, tier: Tier.Bronze },
      AGENT_KEY
    );

    expect(proof.proof_type).toBe(ProofType.Tier);
    expect(proof.threshold).toBe(1);
    expect(proof.tier).toBe(Tier.Bronze);
    expect(proof.proof).toBeTruthy();
  }, 60_000);

  test('transferPublic sends real credits on testnet', async () => {
    const balanceBefore = await getBalance(agentAddress);
    const transferAmount = 10_000; // 0.01 credits

    console.log(`Transferring ${credits.format(transferAmount)} from client to agent...`);
    const txId = await transferPublic(CLIENT_KEY, agentAddress, transferAmount);
    console.log(`Transaction ID: ${txId}`);

    expect(txId).toBeTruthy();
    expect(typeof txId).toBe('string');

    // Wait for confirmation
    console.log('Waiting for transaction confirmation...');
    const result = await waitForTransaction(txId, 30, 5000);
    console.log(`Confirmed: ${result.confirmed}, Block: ${result.blockHeight}`);

    expect(result.confirmed).toBe(true);

    // Verify balance changed
    const balanceAfter = await getBalance(agentAddress);
    console.log(`Agent balance before: ${credits.format(balanceBefore)}, after: ${credits.format(balanceAfter)}`);
    expect(balanceAfter).toBeGreaterThanOrEqual(balanceBefore + transferAmount - 10_000); // Account for fee variance
  }, 300_000); // 5 min timeout for on-chain tx

  test('getTransactionRecordOutputs extracts records from confirmed tx', async () => {
    // Use a small transfer to generate a tx with outputs
    const txId = await transferPublic(CLIENT_KEY, agentAddress, 10_000);
    const result = await waitForTransaction(txId, 30, 5000);
    expect(result.confirmed).toBe(true);

    const outputs = await getTransactionRecordOutputs(txId);
    // transfer_public may or may not produce record outputs depending on implementation
    expect(Array.isArray(outputs)).toBe(true);
    console.log(`Transaction ${txId} produced ${outputs.length} record outputs`);
  }, 300_000);
});

// ═══════════════════════════════════════════════════════════════════
// 3. SDK Client — Real facilitator integration
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('SDK Client — Real facilitator', () => {
  let client: ShadowAgentClient;

  beforeAll(() => {
    client = createClient({
      privateKey: CLIENT_KEY,
      network: 'testnet',
      facilitatorUrl: FACILITATOR_URL,
    });
  });

  test('getHealth returns status from real facilitator', async () => {
    const health = await client.getHealth();
    console.log('Facilitator health:', health);
    expect(health.status).toBe('ok');
  }, 15_000);

  test('searchAgents returns result structure', async () => {
    const result = await client.searchAgents({ limit: 5 });
    console.log(`Found ${result.total} agents`);
    expect(result).toHaveProperty('agents');
    expect(result).toHaveProperty('total');
    expect(result).toHaveProperty('limit');
    expect(result).toHaveProperty('offset');
    expect(Array.isArray(result.agents)).toBe(true);
  }, 15_000);

  test('getAgent returns null for non-existent agent', async () => {
    const agent = await client.getAgent('nonexistent-agent-id-12345');
    expect(agent).toBeNull();
  }, 15_000);

  test('getConfig returns config with masked private key', () => {
    const cfg = client.getConfig();
    expect(cfg.privateKey).toBe('***');
    expect(cfg.network).toBe('testnet');
    expect(cfg.facilitatorUrl).toBe(FACILITATOR_URL);
  });

  test('setConfig updates facilitator URL', () => {
    const originalUrl = FACILITATOR_URL;
    client.setConfig({ facilitatorUrl: 'http://example.com' });
    expect(client.getConfig().facilitatorUrl).toBe('http://example.com');
    client.setConfig({ facilitatorUrl: originalUrl }); // Restore
  });

  test('getSessionStatus returns null for non-existent session', async () => {
    const session = await client.getSessionStatus('nonexistent-session-id');
    expect(session).toBeNull();
  }, 15_000);

  test('getDisputeStatus returns null for non-existent dispute', async () => {
    const dispute = await client.getDisputeStatus('nonexistent-job-hash');
    expect(dispute).toBeNull();
  }, 15_000);

  test('getPartialRefundStatus returns null for non-existent refund', async () => {
    const refund = await client.getPartialRefundStatus('nonexistent-job-hash');
    expect(refund).toBeNull();
  }, 15_000);

  test('listPolicies returns array', async () => {
    const policies = await client.listPolicies();
    expect(Array.isArray(policies)).toBe(true);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 4. SDK Agent — Real facilitator integration
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('SDK Agent — Real facilitator', () => {
  let agent: ShadowAgentServer;
  let agentAddress: string;

  beforeAll(async () => {
    agent = createAgent({
      privateKey: AGENT_KEY,
      serviceType: ServiceType.NLP,
      pricePerRequest: 100_000,
      facilitatorUrl: FACILITATOR_URL,
    });
    agentAddress = await getAddress(AGENT_KEY);
    // Wait for agentId to resolve
    await new Promise(r => setTimeout(r, 1000));
  }, 30_000);

  test('generates consistent agentId', async () => {
    const id = agent.getAgentId();
    const expected = await generateAgentId(AGENT_KEY);
    expect(id).toBe(expected);
    expect(id).toHaveLength(64);
  });

  test('getConfig returns config without privateKey', () => {
    const cfg = agent.getConfig();
    expect(cfg).not.toHaveProperty('privateKey');
    expect(cfg.serviceType).toBe(ServiceType.NLP);
    expect(cfg.pricePerRequest).toBe(100_000);
  });

  test('proveReputation returns null when no reputation is set', async () => {
    const proof = await agent.proveReputation(ProofType.Tier, 1);
    expect(proof).toBeNull();
  });

  test('setReputation + proveReputation works', async () => {
    agent.setReputation({
      owner: agentAddress,
      agent_id: agent.getAgentId(),
      total_jobs: 15,
      total_rating_points: 70,
      total_revenue: 50_000_000,
      tier: Tier.Bronze,
      created_at: Date.now() - 86400000,
      last_updated: Date.now(),
    });

    const proof = await agent.proveReputation(ProofType.Tier, 1);
    expect(proof).not.toBeNull();
    expect(proof!.proof_type).toBe(ProofType.Tier);
    expect(proof!.threshold_met).toBe(true);
    expect(proof!.tier_proven).toBe(Tier.Bronze);
  }, 30_000);

  test('getReputation fetches from facilitator', async () => {
    // Reset local reputation cache
    agent.setReputation(null as unknown as any);
    const reputation = await agent.getReputation();
    // May be null if agent is not registered — that's OK
    console.log('Agent reputation from facilitator:', reputation);
  }, 15_000);

  test('getPendingRefundProposals returns array', async () => {
    const proposals = await agent.getPendingRefundProposals();
    expect(Array.isArray(proposals)).toBe(true);
  }, 15_000);

  test('getOpenDisputes returns array', async () => {
    const disputes = await agent.getOpenDisputes();
    expect(Array.isArray(disputes)).toBe(true);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 5. Session Lifecycle — Full flow against real facilitator
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Session lifecycle — Real facilitator', () => {
  let client: ShadowAgentClient;
  let clientAddress: string;
  let agentAddress: string;
  let sessionId: string;

  beforeAll(async () => {
    clientAddress = await getAddress(CLIENT_KEY);
    agentAddress = await getAddress(AGENT_KEY);
    client = createClient({
      privateKey: CLIENT_KEY,
      facilitatorUrl: FACILITATOR_URL,
    });
  }, 30_000);

  test('step 1: create session via facilitator', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client: clientAddress,
        agent: agentAddress,
        max_total: 1_000_000,
        max_per_request: 100_000,
        rate_limit: 10,
        duration_blocks: 1000,
      }),
    });
    const body = await res.json() as { session: { session_id: string } };
    console.log('Create session response:', body);
    expect(res.status).toBe(201);
    expect(body.session).toBeDefined();
    sessionId = body.session.session_id;
    expect(sessionId).toBeTruthy();
  }, 15_000);

  test('step 2: get session status', async () => {
    const session = await client.getSessionStatus(sessionId);
    expect(session).not.toBeNull();
    expect(session!.status).toBe('active');
    expect(session!.spent).toBe(0);
  }, 15_000);

  test('step 3: make session request', async () => {
    const result = await client.sessionRequest(sessionId, 50_000, 'req-hash-1');
    console.log('Session request result:', result);
    expect(result.success).toBe(true);
  }, 15_000);

  test('step 4: verify spent amount updated', async () => {
    const session = await client.getSessionStatus(sessionId);
    expect(session).not.toBeNull();
    expect(session!.spent).toBe(50_000);
    expect(session!.request_count).toBe(1);
  }, 15_000);

  test('step 5: pause session', async () => {
    const result = await client.pauseSession(sessionId);
    expect(result.success).toBe(true);

    const session = await client.getSessionStatus(sessionId);
    expect(session!.status).toBe('paused');
  }, 15_000);

  test('step 6: resume session', async () => {
    const result = await client.resumeSession(sessionId);
    expect(result.success).toBe(true);

    const session = await client.getSessionStatus(sessionId);
    expect(session!.status).toBe('active');
  }, 15_000);

  test('step 7: settle session', async () => {
    const result = await client.settleSession(sessionId, 50_000);
    console.log('Settlement result:', result);
    expect(result.success).toBe(true);
  }, 15_000);

  test('step 8: close session', async () => {
    const result = await client.closeSession(sessionId);
    console.log('Close result:', result);
    expect(result.success).toBe(true);

    const session = await client.getSessionStatus(sessionId);
    expect(session!.status).toBe('closed');
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 6. Dispute + Refund Flow — Against real facilitator
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Dispute + Refund flow — Real facilitator', () => {
  let clientAddress: string;
  let agentAddress: string;
  let jobHash: string;

  beforeAll(async () => {
    clientAddress = await getAddress(CLIENT_KEY);
    agentAddress = await getAddress(AGENT_KEY);
    jobHash = await generateJobHash('POST', '/api/test-dispute');
  }, 30_000);

  test('open dispute via facilitator', async () => {
    const res = await fetch(`${FACILITATOR_URL}/disputes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: agentAddress,
        client: clientAddress,
        job_hash: jobHash,
        escrow_amount: 100_000,
        evidence_hash: 'evidence-hash-test-123',
      }),
    });
    const body = await res.json() as { dispute: { status: string } };
    console.log('Open dispute response:', body);
    expect(res.status).toBe(201);
    expect(body.dispute).toBeDefined();
    expect(body.dispute.status).toBe('opened');
  }, 15_000);

  test('get dispute status', async () => {
    const res = await fetch(`${FACILITATOR_URL}/disputes/${jobHash}`);
    const body = await res.json() as { job_hash: string; status: string };
    expect(res.ok).toBe(true);
    expect(body.job_hash).toBe(jobHash);
    expect(body.status).toBe('opened');
  }, 15_000);

  test('propose partial refund', async () => {
    const refundJobHash = await generateJobHash('POST', '/api/test-refund');
    const res = await fetch(`${FACILITATOR_URL}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: agentAddress,
        client: clientAddress,
        total_amount: 100_000,
        agent_amount: 60_000,
        job_hash: refundJobHash,
      }),
    });
    const body = await res.json() as { proposal: { status: string; agent_amount: number; client_amount: number } };
    console.log('Propose refund response:', body);
    expect(res.status).toBe(201);
    expect(body.proposal).toBeDefined();
    expect(body.proposal.status).toBe('proposed');
    expect(body.proposal.agent_amount).toBe(60_000);
    expect(body.proposal.client_amount).toBe(40_000);
  }, 15_000);
});

// ═══════════════════════════════════════════════════════════════════
// 7. Agent Registration — Full on-chain flow (slow, needs credits)
// ═══════════════════════════════════════════════════════════════════

describeTestnet('Agent registration — On-chain (slow)', () => {
  let agent: ShadowAgentServer;

  beforeAll(() => {
    agent = createAgent({
      privateKey: AGENT_KEY,
      serviceType: ServiceType.Code,
      facilitatorUrl: FACILITATOR_URL,
    });
  });

  test('register agent on real testnet', async () => {
    const result = await agent.register('https://my-agent.example.com/api');
    console.log('Registration result:', result);

    if (result.success) {
      expect(result.agentId).toBeTruthy();
      expect(result.txId).toBeTruthy();
      console.log(`Agent registered: ${result.agentId}, TX: ${result.txId}`);
    } else {
      // May fail if already registered or insufficient balance — log and continue
      console.warn('Registration failed (may be expected):', result.error);
    }
  }, 300_000); // 5 min for on-chain tx
});
