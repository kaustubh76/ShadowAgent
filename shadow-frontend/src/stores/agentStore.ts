// Agent Store - Zustand state management for agent/client data
// Types defined locally to avoid eager SDK imports that trigger WASM loading

import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { listSessions, fetchDisputes, fetchRefunds, getPendingEscrows, fetchJobs, type MultiSigEscrowData } from '../lib/api';
import { FACILITATOR_ENABLED } from '../config';

// Local enums mirroring SDK values (avoids WASM import chain)
export enum ServiceType {
  NLP = 1,
  Vision = 2,
  Code = 3,
  Data = 4,
  Audio = 5,
  Multi = 6,
  Custom = 7,
}

export enum Tier {
  New = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Diamond = 4,
}

export interface AgentListing {
  agent_id: string;
  service_type: ServiceType;
  endpoint_hash: string;
  tier: Tier;
  is_active: boolean;
  registered_at?: number;
}

// Local interface for search filters
export interface SearchFilters {
  service_type?: ServiceType;
  min_tier?: Tier;
  is_active?: boolean;
}

// Phase 10a: Dispute and Refund types
export interface DisputeInfo {
  client: string;
  agent: string;
  job_hash: string;
  escrow_amount: number;
  status: 'opened' | 'agent_responded' | 'resolved_client' | 'resolved_agent' | 'resolved_split';
  resolution_agent_pct: number;
  opened_at: string;
}

export interface RefundInfo {
  agent: string;
  client: string;
  total_amount: number;
  agent_amount: number;
  client_amount: number;
  job_hash: string;
  status: 'proposed' | 'accepted' | 'rejected';
}

// Phase 5: Spending policy info
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

// Phase 5: Session info
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

// Escrow-backed job info
export interface JobInfo {
  job_id: string;
  job_hash: string;
  agent: string;
  client: string;
  title: string;
  description: string;
  service_type: ServiceType;
  pricing: number;
  escrow_amount: number;
  secret_hash: string;
  multisig_enabled: boolean;
  signers?: [string, string, string];
  required_signatures?: number;
  escrow_status: 'pending' | 'locked' | 'released' | 'refunded';
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

interface AgentState {
  // Agent mode (for service providers)
  isRegistered: boolean;
  agentId: string | null;
  reputation: {
    totalJobs: number;
    totalRatingPoints: number;
    totalRevenue: number;
    tier: Tier;
  } | null;

  // Phase 10a: Decay-aware reputation
  effectiveRating: number | null;
  decayPeriods: number;
  effectiveTier: Tier | null;

  // Phase 10a: Disputes and refunds
  disputes: DisputeInfo[];
  partialRefunds: RefundInfo[];

  // Phase 5: Sessions & Policies
  sessions: SessionInfo[];
  activeSession: SessionInfo | null;
  policies: PolicyInfo[];
  activePolicy: PolicyInfo | null;

  // Pending multi-sig escrows awaiting user's approval
  pendingEscrows: MultiSigEscrowData[];

  // Escrow-backed jobs
  jobs: JobInfo[];

  // Client mode (for consumers)
  searchResults: AgentListing[];
  selectedAgent: AgentListing | null;
  filters: SearchFilters;
  isSearching: boolean;

  // Transaction history
  transactions: Array<{
    id: string;
    type: 'escrow_created' | 'escrow_claimed' | 'rating_submitted' | 'dispute_opened' | 'dispute_resolved' | 'partial_refund_proposed' | 'partial_refund_accepted' | 'session_created' | 'session_closed' | 'session_request' | 'session_settled' | 'job_created' | 'job_started' | 'job_completed' | 'job_cancelled';
    agentId: string;
    amount?: number;
    timestamp: number;
  }>;

  // Actions - Agent
  setRegistered: (isRegistered: boolean, agentId?: string) => void;
  setReputation: (reputation: AgentState['reputation']) => void;
  setDecayInfo: (effectiveRating: number, decayPeriods: number, effectiveTier: Tier) => void;

  // Actions - Client
  setSearchResults: (results: AgentListing[]) => void;
  selectAgent: (agent: AgentListing | null) => void;
  setFilters: (filters: SearchFilters) => void;
  setSearching: (isSearching: boolean) => void;

  // Actions - Disputes & Refunds
  setDisputes: (disputes: DisputeInfo[]) => void;
  addDispute: (dispute: DisputeInfo) => void;
  setPartialRefunds: (refunds: RefundInfo[]) => void;
  addPartialRefund: (refund: RefundInfo) => void;

  // Actions - Sessions
  setSessions: (sessions: SessionInfo[]) => void;
  addSession: (session: SessionInfo) => void;
  updateSession: (sessionId: string, updates: Partial<SessionInfo>) => void;
  setActiveSession: (session: SessionInfo | null) => void;

  // Actions - Pending Escrows
  setPendingEscrows: (escrows: MultiSigEscrowData[]) => void;

  // Actions - Jobs
  setJobs: (jobs: JobInfo[]) => void;
  addJob: (job: JobInfo) => void;
  updateJob: (jobId: string, updates: Partial<JobInfo>) => void;
  removeJob: (jobId: string) => void;

  // Actions - Policies
  setPolicies: (policies: PolicyInfo[]) => void;
  addPolicy: (policy: PolicyInfo) => void;
  setActivePolicy: (policy: PolicyInfo | null) => void;

  // Actions - Transactions
  addTransaction: (transaction: Omit<AgentState['transactions'][0], 'id' | 'timestamp'>) => void;
  clearTransactions: () => void;
  hydrateFromFacilitator: (address: string) => Promise<void>;
}

export const useAgentStore = create<AgentState>()(
  persist(
    (set) => ({
  // Initial state
  isRegistered: false,
  agentId: null,
  reputation: null,
  effectiveRating: null,
  decayPeriods: 0,
  effectiveTier: null,
  disputes: [],
  partialRefunds: [],
  sessions: [],
  activeSession: null,
  policies: [],
  activePolicy: null,
  pendingEscrows: [],
  jobs: [],
  searchResults: [],
  selectedAgent: null,
  filters: { is_active: true },
  isSearching: false,
  transactions: [],

  // Agent actions
  setRegistered: (isRegistered, agentId) =>
    set({ isRegistered, agentId: agentId || null }),

  setReputation: (reputation) => set({ reputation }),

  setDecayInfo: (effectiveRating, decayPeriods, effectiveTier) =>
    set({ effectiveRating, decayPeriods, effectiveTier }),

  // Client actions
  setSearchResults: (results) => set({ searchResults: results }),

  selectAgent: (agent) => set({ selectedAgent: agent }),

  setFilters: (filters) => set({ filters }),

  setSearching: (isSearching) => set({ isSearching }),

  // Disputes & Refunds actions
  setDisputes: (disputes) => set({ disputes }),

  addDispute: (dispute) =>
    set((state) => ({ disputes: [dispute, ...state.disputes] })),

  setPartialRefunds: (refunds) => set({ partialRefunds: refunds }),

  addPartialRefund: (refund) =>
    set((state) => ({ partialRefunds: [refund, ...state.partialRefunds] })),

  // Session actions
  setSessions: (sessions) => set({ sessions }),

  addSession: (session) =>
    set((state) => ({ sessions: [session, ...state.sessions] })),

  updateSession: (sessionId, updates) =>
    set((state) => ({
      sessions: state.sessions.map(s =>
        s.session_id === sessionId ? { ...s, ...updates } : s
      ),
      activeSession: state.activeSession?.session_id === sessionId
        ? { ...state.activeSession, ...updates }
        : state.activeSession,
    })),

  setActiveSession: (session) => set({ activeSession: session }),

  // Pending escrows actions
  setPendingEscrows: (escrows) => set({ pendingEscrows: escrows }),

  // Job actions
  setJobs: (jobs) => set({ jobs }),

  addJob: (job) =>
    set((state) => ({ jobs: [job, ...state.jobs] })),

  updateJob: (jobId, updates) =>
    set((state) => ({
      jobs: state.jobs.map(j =>
        j.job_id === jobId ? { ...j, ...updates } : j
      ),
    })),

  removeJob: (jobId) =>
    set((state) => ({
      jobs: state.jobs.filter(j => j.job_id !== jobId),
    })),

  // Policy actions
  setPolicies: (policies) => set({ policies }),

  addPolicy: (policy) =>
    set((state) => ({ policies: [policy, ...state.policies] })),

  setActivePolicy: (policy) => set({ activePolicy: policy }),

  // Transaction actions
  addTransaction: (transaction) =>
    set((state) => ({
      transactions: [
        {
          ...transaction,
          id: crypto.randomUUID(),
          timestamp: Date.now(),
        },
        ...state.transactions,
      ].slice(0, 50), // Keep last 50 transactions
    })),

  clearTransactions: () => set({ transactions: [] }),

  hydrateFromFacilitator: async (address: string) => {
    if (!FACILITATOR_ENABLED) return;

    try {
      const [sessions, disputes, refunds, pendingEscrows, clientJobs] = await Promise.all([
        listSessions({ client: address }),
        fetchDisputes({ client: address }),
        fetchRefunds({ agent_id: address }),
        getPendingEscrows(address),
        fetchJobs({ client: address }),
      ]);

      // Also fetch as agent role
      const [agentSessions, agentDisputes, agentJobs] = await Promise.all([
        listSessions({ agent: address }),
        fetchDisputes({ agent_id: address }),
        fetchJobs({ agent: address }),
      ]);

      // Combine and deduplicate sessions
      const allSessions = [...sessions];
      for (const s of agentSessions) {
        if (!allSessions.find(e => e.session_id === s.session_id)) {
          allSessions.push(s);
        }
      }

      // Combine and deduplicate disputes
      const allDisputes = [...disputes];
      for (const d of agentDisputes) {
        if (!allDisputes.find(e => e.job_hash === d.job_hash)) {
          allDisputes.push(d);
        }
      }

      // Combine and deduplicate jobs
      const allJobs = [...clientJobs];
      for (const j of agentJobs) {
        if (!allJobs.find(e => e.job_id === j.job_id)) {
          allJobs.push(j);
        }
      }

      type TxType = AgentState['transactions'][0]['type'];
      const hydrated: Array<{ type: TxType; agentId: string; amount?: number; timestamp: number }> = [];

      for (const s of allSessions) {
        hydrated.push({
          type: 'session_created',
          agentId: s.agent,
          amount: s.max_total,
          timestamp: new Date(s.created_at).getTime(),
        });
        if (s.status === 'closed') {
          hydrated.push({
            type: 'session_closed',
            agentId: s.agent,
            timestamp: new Date(s.updated_at).getTime(),
          });
        }
      }

      for (const d of allDisputes) {
        hydrated.push({
          type: 'dispute_opened',
          agentId: d.agent,
          amount: d.escrow_amount,
          timestamp: new Date(d.opened_at).getTime(),
        });
        if (d.status.startsWith('resolved')) {
          hydrated.push({
            type: 'dispute_resolved',
            agentId: d.agent,
            amount: d.escrow_amount,
            timestamp: new Date(d.opened_at).getTime() + 1000,
          });
        }
      }

      for (const j of allJobs) {
        hydrated.push({
          type: 'job_created',
          agentId: j.agent,
          amount: j.escrow_amount,
          timestamp: new Date(j.created_at).getTime(),
        });
        if (j.status === 'in_progress') {
          hydrated.push({
            type: 'job_started',
            agentId: j.agent,
            amount: j.escrow_amount,
            timestamp: new Date(j.updated_at).getTime(),
          });
        } else if (j.status === 'completed') {
          hydrated.push({
            type: 'job_completed',
            agentId: j.agent,
            amount: j.escrow_amount,
            timestamp: new Date(j.updated_at).getTime(),
          });
        } else if (j.status === 'cancelled') {
          hydrated.push({
            type: 'job_cancelled',
            agentId: j.agent,
            amount: j.escrow_amount,
            timestamp: new Date(j.updated_at).getTime(),
          });
        }
      }

      for (const r of refunds) {
        hydrated.push({
          type: 'partial_refund_proposed',
          agentId: r.agent,
          amount: r.total_amount,
          timestamp: Date.now() - 60000,
        });
        if (r.status === 'accepted') {
          hydrated.push({
            type: 'partial_refund_accepted',
            agentId: r.agent,
            amount: r.total_amount,
            timestamp: Date.now() - 30000,
          });
        }
      }

      // Store sessions/disputes/refunds in their respective arrays too
      set((state) => {
        // Merge hydrated txns with existing, deduplicate by type+agentId+timestamp
        const existing = state.transactions;
        const existingKeys = new Set(existing.map(t => `${t.type}:${t.agentId}:${t.timestamp}`));
        const newTxns = hydrated.filter(h => !existingKeys.has(`${h.type}:${h.agentId}:${h.timestamp}`));
        const merged = [
          ...existing,
          ...newTxns.map(t => ({ ...t, id: crypto.randomUUID() })),
        ]
          .sort((a, b) => b.timestamp - a.timestamp)
          .slice(0, 50);

        return {
          transactions: merged,
          sessions: allSessions,
          disputes: allDisputes,
          partialRefunds: refunds,
          pendingEscrows,
          jobs: allJobs,
        };
      });
    } catch {
      // Silently fail - facilitator may not be running
    }
  },
    }),
    {
      name: 'shadow-agent-store',
      partialize: (state) => ({
        isRegistered: state.isRegistered,
        agentId: state.agentId,
        reputation: state.reputation,
        filters: state.filters,
        transactions: state.transactions,
        jobs: state.jobs,
      }),
    }
  )
);

// Helper functions
export function getTierName(tier: Tier): string {
  const names: Record<Tier, string> = {
    [Tier.New]: 'New',
    [Tier.Bronze]: 'Bronze',
    [Tier.Silver]: 'Silver',
    [Tier.Gold]: 'Gold',
    [Tier.Diamond]: 'Diamond',
  };
  return names[tier] || 'Unknown';
}

export function getServiceTypeName(type: ServiceType): string {
  const names: Record<ServiceType, string> = {
    [ServiceType.NLP]: 'NLP',
    [ServiceType.Vision]: 'Vision',
    [ServiceType.Code]: 'Code',
    [ServiceType.Data]: 'Data',
    [ServiceType.Audio]: 'Audio',
    [ServiceType.Multi]: 'Multi',
    [ServiceType.Custom]: 'Custom',
  };
  return names[type] || 'Unknown';
}

export function calculateAverageRating(points: number, jobs: number): number {
  if (jobs === 0) return 0;
  return (points / jobs) / 10; // Convert from scaled to stars
}

export function formatRevenue(microcents: number): string {
  return `$${(microcents / 1_000_000).toLocaleString('en-US', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
