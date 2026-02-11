// Agent Store - Zustand state management for agent/client data
// Types defined locally to avoid eager SDK imports that trigger WASM loading

import { create } from 'zustand';

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

  // Client mode (for consumers)
  searchResults: AgentListing[];
  selectedAgent: AgentListing | null;
  filters: SearchFilters;
  isSearching: boolean;

  // Transaction history
  transactions: Array<{
    id: string;
    type: 'escrow_created' | 'escrow_claimed' | 'rating_submitted' | 'dispute_opened' | 'dispute_resolved' | 'partial_refund_proposed' | 'partial_refund_accepted';
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

  // Actions - Transactions
  addTransaction: (transaction: Omit<AgentState['transactions'][0], 'id' | 'timestamp'>) => void;
  clearTransactions: () => void;
}

export const useAgentStore = create<AgentState>((set) => ({
  // Initial state
  isRegistered: false,
  agentId: null,
  reputation: null,
  effectiveRating: null,
  decayPeriods: 0,
  effectiveTier: null,
  disputes: [],
  partialRefunds: [],
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
}));

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
