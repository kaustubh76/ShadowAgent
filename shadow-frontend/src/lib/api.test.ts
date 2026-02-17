import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock the config module to control FACILITATOR_ENABLED
let mockFacilitatorEnabled = false;
vi.mock('../config', () => ({
  get API_BASE() { return '/api'; },
  get FACILITATOR_ENABLED() { return mockFacilitatorEnabled; },
  get FACILITATOR_URL() { return 'http://localhost:3001'; },
}));

// Mock the sdkStore to avoid WASM
vi.mock('../stores/sdkStore', () => ({
  useSDKStore: {
    getState: () => ({ client: null }),
  },
}));

// Import AFTER mocks are set up
import {
  searchAgents,
  getAgent,
  submitDispute,
  submitRefund,
  fetchDisputes,
  fetchRefunds,
  createSession,
  closeSession,
  pauseSession,
  resumeSession,
  listSessions,
  submitRating,
  createPolicy,
  listPolicies,
} from './api';

describe('api - FACILITATOR_ENABLED guard', () => {
  beforeEach(() => {
    mockFacilitatorEnabled = false;
    vi.restoreAllMocks();
  });

  it('searchAgents returns empty when disabled', async () => {
    const result = await searchAgents({});
    expect(result.agents).toEqual([]);
    expect(result.total).toBe(0);
  });

  it('getAgent returns null when disabled', async () => {
    const result = await getAgent('agent123');
    expect(result).toBeNull();
  });

  it('submitDispute returns error when disabled', async () => {
    const result = await submitDispute({
      agent: 'a1', client: 'c1', job_hash: 'j1', escrow_amount: 1000, evidence_hash: 'e1',
    });
    expect(result.success).toBe(false);
    expect(result.error).toContain('not available');
  });

  it('fetchDisputes returns empty when disabled', async () => {
    const result = await fetchDisputes();
    expect(result).toEqual([]);
  });

  it('submitRefund returns error when disabled', async () => {
    const result = await submitRefund({
      agent: 'a1', client: 'c1', total_amount: 1000, agent_amount: 500, job_hash: 'j1',
    });
    expect(result.success).toBe(false);
  });

  it('fetchRefunds returns empty when disabled', async () => {
    const result = await fetchRefunds();
    expect(result).toEqual([]);
  });

  it('createSession returns error when disabled', async () => {
    const result = await createSession({
      agent: 'a1', client: 'c1', max_total: 10000, max_per_request: 100, rate_limit: 60, duration_blocks: 100,
    });
    expect(result.success).toBe(false);
  });

  it('closeSession returns error when disabled', async () => {
    const result = await closeSession('s1');
    expect(result.success).toBe(false);
  });

  it('pauseSession returns error when disabled', async () => {
    const result = await pauseSession('s1');
    expect(result.success).toBe(false);
  });

  it('resumeSession returns error when disabled', async () => {
    const result = await resumeSession('s1');
    expect(result.success).toBe(false);
  });

  it('listSessions returns empty when disabled', async () => {
    const result = await listSessions();
    expect(result).toEqual([]);
  });

  it('submitRating returns error when disabled', async () => {
    const result = await submitRating('agent1', { job_hash: 'j1', rating: 40 });
    expect(result.success).toBe(false);
  });

  it('createPolicy returns error when disabled', async () => {
    const result = await createPolicy({ owner: 'o1', max_session_value: 10000, max_single_request: 100 });
    expect(result.success).toBe(false);
  });

  it('listPolicies returns empty when disabled', async () => {
    const result = await listPolicies();
    expect(result).toEqual([]);
  });
});

describe('api - with facilitator enabled', () => {
  beforeEach(() => {
    mockFacilitatorEnabled = true;
    vi.restoreAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('searchAgents builds correct query params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ agents: [], total: 0, limit: 20, offset: 0 }), { status: 200 })
    );

    await searchAgents({ service_type: 1, min_tier: 3, is_active: true }, 10, 5);

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('service_type=1');
    expect(url).toContain('min_tier=3');
    expect(url).toContain('is_active=true');
    expect(url).toContain('limit=10');
    expect(url).toContain('offset=5');
  });

  it('searchAgents returns empty on network error', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const result = await searchAgents({});
    expect(result.agents).toEqual([]);
  });

  it('searchAgents returns empty on non-ok response', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
    const result = await searchAgents({});
    expect(result.agents).toEqual([]);
  });

  it('getAgent returns null on 404', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
    const result = await getAgent('nonexistent');
    expect(result).toBeNull();
  });

  it('getAgent returns agent on success', async () => {
    const agent = { agent_id: 'a1', service_type: 1, tier: 3, is_active: true };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify(agent), { status: 200 })
    );
    const result = await getAgent('a1');
    expect(result).toEqual(agent);
  });

  it('submitDispute sends correct POST body', async () => {
    const dispute = { client: 'c1', agent: 'a1', job_hash: 'j1', escrow_amount: 1000, evidence_hash: 'e1' };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ dispute }), { status: 201 })
    );
    const result = await submitDispute(dispute);
    expect(result.success).toBe(true);

    const fetchCall = vi.mocked(globalThis.fetch).mock.calls[0];
    const body = JSON.parse((fetchCall[1] as RequestInit).body as string);
    expect(body.agent).toBe('a1');
    expect(body.evidence_hash).toBe('e1');
  });

  it('createSession sends correct POST body', async () => {
    const sessionData = {
      agent: 'a1', client: 'c1', max_total: 10000, max_per_request: 100,
      rate_limit: 60, duration_blocks: 100,
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ session: { ...sessionData, session_id: 's1' } }), { status: 201 })
    );
    const result = await createSession(sessionData);
    expect(result.success).toBe(true);
  });

  it('closeSession posts to correct URL', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ refund_amount: 500 }), { status: 200 })
    );
    await closeSession('session123');
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('/sessions/session123/close');
  });

  it('listSessions includes filter params', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify([]), { status: 200 })
    );
    await listSessions({ agent: 'a1', status: 'active' });
    const url = fetchSpy.mock.calls[0][0] as string;
    expect(url).toContain('agent=a1');
    expect(url).toContain('status=active');
  });

  it('handles fetch errors gracefully for submitRating', async () => {
    vi.spyOn(globalThis, 'fetch').mockRejectedValue(new Error('Network error'));
    const result = await submitRating('agent1', { job_hash: 'j1', rating: 40 });
    expect(result.success).toBe(false);
    expect(result.error).toContain('Network error');
  });
});
