// API client for interacting with the facilitator service
// Uses SDK client when available, falls back to direct fetch

import { useSDKStore } from '../stores/sdkStore';
import type { AgentListing, SearchFilters, DisputeInfo, RefundInfo } from '../stores/agentStore';

// Local type definitions (mirrors SDK to avoid WASM import chain)
interface SearchParams {
  service_type?: number;
  min_tier?: number;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

interface SearchResult {
  agents: AgentListing[];
  total: number;
  limit: number;
  offset: number;
}

interface VerificationResult {
  valid: boolean;
  tier?: number;
  error?: string;
}

import { API_BASE, FACILITATOR_ENABLED } from '../config';

// Multi-sig escrow type
interface MultiSigEscrowData {
  owner: string;
  agent: string;
  amount: number;
  job_hash: string;
  secret_hash: string;
  signers: [string, string, string];
  required_sigs: number;
  sig_count: number;
  approvals: [boolean, boolean, boolean];
  status: 'locked' | 'released' | 'refunded';
  created_at: string;
  updated_at: string;
}

// Reputation proof input type
interface ReputationProofInput {
  proof_type: number;
  threshold: number;
  proof: string;
  tier?: number;
}

// Helper to get the SDK client if available
function getClient() {
  try {
    const store = useSDKStore.getState();
    return store.client;
  } catch {
    return null;
  }
}

// Empty result when facilitator is unavailable
const EMPTY_SEARCH: SearchResult = { agents: [], total: 0, limit: 20, offset: 0 };

// ═══════════════════════════════════════════════════════════════════
// Retry + Cache helpers
// ═══════════════════════════════════════════════════════════════════

export async function fetchWithRetry(
  url: string,
  options?: RequestInit,
  retries = 2,
  delay = 1000
): Promise<Response> {
  for (let i = 0; i <= retries; i++) {
    try {
      const response = await fetch(url, options);

      // Retry on 429 with Retry-After backoff
      if (response.status === 429 && i < retries) {
        const retryAfter = response.headers.get('Retry-After');
        const waitMs = retryAfter
          ? Math.min(parseInt(retryAfter, 10) * 1000, 30_000)
          : delay * (i + 1);
        await new Promise(r => setTimeout(r, waitMs));
        continue;
      }

      if (response.ok || response.status < 500) return response;
      if (i < retries) await new Promise(r => setTimeout(r, delay * (i + 1)));
    } catch (err) {
      if (i === retries) throw err;
      await new Promise(r => setTimeout(r, delay * (i + 1)));
    }
  }
  throw new Error('Max retries exceeded');
}

const _cache = new Map<string, { data: unknown; ts: number }>();
const CACHE_TTL = 30_000; // 30 seconds

function getCached<T>(key: string): T | null {
  const entry = _cache.get(key);
  if (entry && Date.now() - entry.ts < CACHE_TTL) return entry.data as T;
  _cache.delete(key);
  return null;
}

function setCache(key: string, data: unknown) {
  _cache.set(key, { data, ts: Date.now() });
}

// Search for agents - uses SDK client if available
export async function searchAgents(
  filters: SearchFilters,
  limit = 20,
  offset = 0
): Promise<SearchResult> {
  // Skip fetch when facilitator backend is not configured
  if (!FACILITATOR_ENABLED) {
    return { ...EMPTY_SEARCH, limit, offset };
  }

  try {
    const client = getClient();

    if (client) {
      const searchParams: SearchParams = {
        service_type: filters.service_type,
        min_tier: filters.min_tier,
        is_active: filters.is_active,
        limit,
        offset,
      };
      return await client.searchAgents(searchParams);
    }

    const params = new URLSearchParams();

    if (filters.service_type !== undefined) {
      params.set('service_type', String(filters.service_type));
    }
    if (filters.min_tier !== undefined) {
      params.set('min_tier', String(filters.min_tier));
    }
    if (filters.is_active !== undefined) {
      params.set('is_active', String(filters.is_active));
    }
    params.set('limit', String(limit));
    params.set('offset', String(offset));

    const url = `${API_BASE}/agents?${params.toString()}`;
    const cached = getCached<SearchResult>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return { ...EMPTY_SEARCH, limit, offset };
    }

    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return { ...EMPTY_SEARCH, limit, offset };
  }
}

// Get a specific agent - uses SDK client if available
export async function getAgent(agentId: string): Promise<AgentListing | null> {
  if (!FACILITATOR_ENABLED) return null;

  try {
    const client = getClient();

    if (client) {
      return await client.getAgent(agentId);
    }

    const url = `${API_BASE}/agents/${agentId}`;
    const cached = getCached<AgentListing>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);

    if (!response.ok) {
      return null;
    }

    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return null;
  }
}

// Verify a reputation proof - uses SDK client if available
export async function verifyReputationProof(proof: ReputationProofInput): Promise<VerificationResult> {
  const client = getClient();

  if (client) {
    return client.verifyReputationProof(proof);
  }

  // Fallback to direct fetch
  const response = await fetch(`${API_BASE}/verify/reputation`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(proof),
  });

  if (!response.ok) {
    const error = await response.json().catch(() => ({}));
    return { valid: false, error: error.message || response.statusText };
  }

  return response.json();
}

// ═══════════════════════════════════════════════════════════════════
// Phase 10a: Disputes, Refunds, Multi-Sig Escrow
// ═══════════════════════════════════════════════════════════════════

// Fetch disputes from facilitator
export async function fetchDisputes(
  params?: { client?: string; agent_id?: string; status?: string }
): Promise<DisputeInfo[]> {
  if (!FACILITATOR_ENABLED) return [];

  try {
    const searchParams = new URLSearchParams();
    if (params?.client) searchParams.set('client', params.client);
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
    if (params?.status) searchParams.set('status', params.status);

    const qs = searchParams.toString();
    const url = `${API_BASE}/disputes${qs ? `?${qs}` : ''}`;
    const cached = getCached<DisputeInfo[]>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);

    if (!response.ok) return [];
    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return [];
  }
}

// Submit a new dispute
export async function submitDispute(data: {
  agent: string;
  client: string;
  job_hash: string;
  escrow_amount: number;
  evidence_hash: string;
}): Promise<{ success: boolean; dispute?: DisputeInfo; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/disputes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to submit dispute' };
    }

    return { success: true, dispute: body.dispute };
  } catch {
    return { success: false, error: 'Network error submitting dispute' };
  }
}

// Fetch partial refund proposals
export async function fetchRefunds(
  params?: { agent_id?: string; status?: string }
): Promise<RefundInfo[]> {
  if (!FACILITATOR_ENABLED) return [];

  try {
    const searchParams = new URLSearchParams();
    if (params?.agent_id) searchParams.set('agent_id', params.agent_id);
    if (params?.status) searchParams.set('status', params.status);

    const qs = searchParams.toString();
    const url = `${API_BASE}/refunds${qs ? `?${qs}` : ''}`;
    const cached = getCached<RefundInfo[]>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);

    if (!response.ok) return [];
    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return [];
  }
}

// Submit a partial refund proposal
export async function submitRefund(data: {
  agent: string;
  client: string;
  total_amount: number;
  agent_amount: number;
  job_hash: string;
}): Promise<{ success: boolean; proposal?: RefundInfo; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to submit refund' };
    }

    return { success: true, proposal: body.proposal };
  } catch {
    return { success: false, error: 'Network error submitting refund' };
  }
}

// Fetch multi-sig escrow status
export async function fetchMultiSigEscrow(jobHash: string): Promise<MultiSigEscrowData | null> {
  if (!FACILITATOR_ENABLED) return null;

  try {
    const url = `${API_BASE}/escrows/multisig/${jobHash}`;
    const cached = getCached<MultiSigEscrowData>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);
    if (!response.ok) return null;
    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return null;
  }
}

// Create a multi-sig escrow
export async function createMultiSigEscrow(data: {
  agent: string;
  owner: string;
  amount: number;
  job_hash: string;
  secret_hash: string;
  signers: [string, string, string];
  required_signatures: number;
}): Promise<{ success: boolean; escrow?: MultiSigEscrowData; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/escrows/multisig`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to create multi-sig escrow' };
    }

    return { success: true, escrow: body.escrow };
  } catch {
    return { success: false, error: 'Network error creating multi-sig escrow' };
  }
}

// Approve a multi-sig escrow
export async function approveMultiSigEscrow(
  jobHash: string,
  signerAddress: string
): Promise<{ success: boolean; escrow?: MultiSigEscrowData; threshold_met?: boolean; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/escrows/multisig/${jobHash}/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ signer_address: signerAddress }),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to approve escrow' };
    }

    return { success: true, escrow: body.escrow, threshold_met: body.threshold_met };
  } catch {
    return { success: false, error: 'Network error approving escrow' };
  }
}

// Submit a rating for an agent
export async function submitRating(
  agentId: string,
  data: { job_hash: string; rating: number; payment_amount?: number }
): Promise<{ success: boolean; rating?: Record<string, unknown>; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/agents/${agentId}/rating`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to submit rating' };
    }

    return { success: true, rating: body.rating };
  } catch {
    return { success: false, error: 'Network error submitting rating' };
  }
}

// Respond to a dispute with counter-evidence
export async function respondToDispute(
  jobHash: string,
  evidenceHash: string
): Promise<{ success: boolean; dispute?: DisputeInfo; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/disputes/${jobHash}/respond`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ evidence_hash: evidenceHash }),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to respond to dispute' };
    }

    return { success: true, dispute: body.dispute };
  } catch {
    return { success: false, error: 'Network error responding to dispute' };
  }
}

// Accept a partial refund proposal
export async function acceptRefund(
  jobHash: string
): Promise<{ success: boolean; proposal?: RefundInfo; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/refunds/${jobHash}/accept`, {
      method: 'POST',
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to accept refund' };
    }

    return { success: true, proposal: body.proposal };
  } catch {
    return { success: false, error: 'Network error accepting refund' };
  }
}

// Reject a partial refund proposal
export async function rejectRefund(
  jobHash: string
): Promise<{ success: boolean; proposal?: RefundInfo; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/refunds/${jobHash}/reject`, {
      method: 'POST',
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to reject refund' };
    }

    return { success: true, proposal: body.proposal };
  } catch {
    return { success: false, error: 'Network error rejecting refund' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 5: Session-Based Payments
// ═══════════════════════════════════════════════════════════════════

// Session data type
export interface SessionInfo {
  session_id: string;
  client: string;
  agent: string;
  max_total: number;
  max_per_request: number;
  rate_limit: number;
  spent: number;
  request_count: number;
  valid_until: number;
  duration_blocks: number;
  status: 'active' | 'paused' | 'closed';
  created_at: string;
  updated_at: string;
  receipts: Array<{
    request_hash: string;
    amount: number;
    timestamp: string;
  }>;
}

// Create a new payment session
export async function createSession(data: {
  agent: string;
  client: string;
  max_total: number;
  max_per_request: number;
  rate_limit: number;
  duration_blocks: number;
}): Promise<{ success: boolean; session?: SessionInfo; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to create session' };
    }

    return { success: true, session: body.session };
  } catch {
    return { success: false, error: 'Network error creating session' };
  }
}

// Get session status
export async function getSession(sessionId: string): Promise<SessionInfo | null> {
  if (!FACILITATOR_ENABLED) return null;

  try {
    const url = `${API_BASE}/sessions/${sessionId}`;
    const cached = getCached<SessionInfo>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);
    if (!response.ok) return null;
    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return null;
  }
}

// List sessions with optional filters
export async function listSessions(
  params?: { client?: string; agent?: string; status?: string }
): Promise<SessionInfo[]> {
  if (!FACILITATOR_ENABLED) return [];

  try {
    const searchParams = new URLSearchParams();
    if (params?.client) searchParams.set('client', params.client);
    if (params?.agent) searchParams.set('agent', params.agent);
    if (params?.status) searchParams.set('status', params.status);

    const qs = searchParams.toString();
    const url = `${API_BASE}/sessions${qs ? `?${qs}` : ''}`;
    const cached = getCached<SessionInfo[]>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);

    if (!response.ok) return [];
    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return [];
  }
}

// Close a session
export async function closeSession(
  sessionId: string
): Promise<{ success: boolean; refund_amount?: number; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/close`, {
      method: 'POST',
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to close session' };
    }

    return { success: true, refund_amount: body.refund_amount };
  } catch {
    return { success: false, error: 'Network error closing session' };
  }
}

// Pause a session
export async function pauseSession(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/pause`, {
      method: 'POST',
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to pause session' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error pausing session' };
  }
}

// Resume a paused session
export async function resumeSession(
  sessionId: string
): Promise<{ success: boolean; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/sessions/${sessionId}/resume`, {
      method: 'POST',
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to resume session' };
    }

    return { success: true };
  } catch {
    return { success: false, error: 'Network error resuming session' };
  }
}

// ═══════════════════════════════════════════════════════════════════
// Phase 5: Spending Policies
// ═══════════════════════════════════════════════════════════════════

// Policy data type
export interface PolicyInfo {
  policy_id: string;
  owner: string;
  max_session_value: number;
  max_single_request: number;
  allowed_tiers: number;
  allowed_categories: number;
  require_proofs: boolean;
  created_at: string;
}

// Create a spending policy
export async function createPolicy(data: {
  owner: string;
  max_session_value: number;
  max_single_request: number;
  allowed_tiers?: number;
  allowed_categories?: number;
  require_proofs?: boolean;
}): Promise<{ success: boolean; policy?: PolicyInfo; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/sessions/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to create policy' };
    }

    return { success: true, policy: body.policy };
  } catch {
    return { success: false, error: 'Network error creating policy' };
  }
}

// List policies for a given owner
export async function listPolicies(
  params?: { owner?: string }
): Promise<PolicyInfo[]> {
  if (!FACILITATOR_ENABLED) return [];

  try {
    const searchParams = new URLSearchParams();
    if (params?.owner) searchParams.set('owner', params.owner);

    const qs = searchParams.toString();
    const url = `${API_BASE}/sessions/policies${qs ? `?${qs}` : ''}`;
    const cached = getCached<PolicyInfo[]>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);

    if (!response.ok) return [];
    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return [];
  }
}

// Get a specific policy
export async function getPolicy(policyId: string): Promise<PolicyInfo | null> {
  if (!FACILITATOR_ENABLED) return null;

  try {
    const url = `${API_BASE}/sessions/policies/${policyId}`;
    const cached = getCached<PolicyInfo>(url);
    if (cached) return cached;

    const response = await fetchWithRetry(url);
    if (!response.ok) return null;
    const result = await response.json();
    setCache(url, result);
    return result;
  } catch {
    return null;
  }
}

// Create a session from a policy (validates against policy bounds)
export async function createSessionFromPolicy(
  policyId: string,
  data: {
    agent: string;
    client: string;
    max_total: number;
    max_per_request: number;
    rate_limit: number;
    duration_blocks: number;
  }
): Promise<{ success: boolean; session?: SessionInfo; policy_id?: string; error?: string }> {
  if (!FACILITATOR_ENABLED) return { success: false, error: 'Facilitator not available' };

  try {
    const response = await fetch(`${API_BASE}/sessions/policies/${policyId}/create-session`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const body = await response.json();

    if (!response.ok) {
      return { success: false, error: body.error || 'Failed to create session from policy' };
    }

    return { success: true, session: body.session, policy_id: body.policy_id };
  } catch {
    return { success: false, error: 'Network error creating session from policy' };
  }
}
