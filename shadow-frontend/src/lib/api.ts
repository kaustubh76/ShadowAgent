// API client for interacting with the facilitator service
// Uses SDK client when available, falls back to direct fetch

import { useSDKStore } from '../stores/sdkStore';
import type { AgentListing, SearchFilters } from '../stores/agentStore';

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

const API_BASE = import.meta.env.VITE_API_URL || '/api';

// Facilitator backend availability flag
// Set to true when VITE_FACILITATOR_URL points to a running backend
const FACILITATOR_ENABLED = !!import.meta.env.VITE_FACILITATOR_URL;

// Health status type (SDK returns simplified version)
interface HealthStatus {
  status: 'ok' | 'degraded' | 'down' | string;
  timestamp?: string;
  version?: string;
  blockHeight?: number;
}

// Escrow proof input type
interface EscrowProofInput {
  proof: string;
  nullifier: string;
  commitment: string;
  amount?: number;
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

    const response = await fetch(`${API_BASE}/agents?${params.toString()}`);

    if (!response.ok) {
      return { ...EMPTY_SEARCH, limit, offset };
    }

    return response.json();
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

    const response = await fetch(`${API_BASE}/agents/${agentId}`);

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

// Verify an escrow proof (direct fetch only - SDK doesn't have this method)
export async function verifyEscrowProof(proof: EscrowProofInput): Promise<VerificationResult> {
  const response = await fetch(`${API_BASE}/verify/escrow`, {
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

// Get health status - uses SDK client if available
export async function getHealth(): Promise<HealthStatus | null> {
  if (!FACILITATOR_ENABLED) return null;

  try {
    const client = getClient();

    if (client) {
      const health = await client.getHealth();
      return {
        status: health.status as HealthStatus['status'],
        blockHeight: health.blockHeight,
      };
    }

    const response = await fetch(`${API_BASE}/health`);

    if (!response.ok) {
      return null;
    }

    return response.json();
  } catch {
    return null;
  }
}

// Get readiness status
export async function getReadiness(): Promise<HealthStatus> {
  const response = await fetch(`${API_BASE}/health/ready`);

  if (!response.ok) {
    throw new Error(`Readiness check failed: ${response.statusText}`);
  }

  return response.json();
}
