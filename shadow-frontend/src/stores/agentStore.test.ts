import { describe, it, expect, beforeEach } from 'vitest';
import {
  useAgentStore,
  getTierName,
  getServiceTypeName,
  calculateAverageRating,
  formatRevenue,
  Tier,
  ServiceType,
} from './agentStore';

describe('agentStore', () => {
  beforeEach(() => {
    // Reset store to initial state before each test
    useAgentStore.setState({
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
      searchResults: [],
      selectedAgent: null,
      filters: { is_active: true },
      isSearching: false,
      transactions: [],
    });
  });

  describe('initial state', () => {
    it('starts with default values', () => {
      const state = useAgentStore.getState();
      expect(state.isRegistered).toBe(false);
      expect(state.agentId).toBeNull();
      expect(state.reputation).toBeNull();
      expect(state.disputes).toEqual([]);
      expect(state.sessions).toEqual([]);
      expect(state.searchResults).toEqual([]);
      expect(state.filters).toEqual({ is_active: true });
      expect(state.transactions).toEqual([]);
    });
  });

  describe('setRegistered', () => {
    it('sets registration state with agent ID', () => {
      useAgentStore.getState().setRegistered(true, 'agent123');
      const state = useAgentStore.getState();
      expect(state.isRegistered).toBe(true);
      expect(state.agentId).toBe('agent123');
    });

    it('sets registration without agent ID', () => {
      useAgentStore.getState().setRegistered(true);
      const state = useAgentStore.getState();
      expect(state.isRegistered).toBe(true);
      expect(state.agentId).toBeNull();
    });

    it('clears registration', () => {
      useAgentStore.getState().setRegistered(true, 'agent123');
      useAgentStore.getState().setRegistered(false);
      const state = useAgentStore.getState();
      expect(state.isRegistered).toBe(false);
      expect(state.agentId).toBeNull();
    });
  });

  describe('setReputation', () => {
    it('sets reputation data', () => {
      const rep = { totalJobs: 100, totalRatingPoints: 450, totalRevenue: 50000, tier: Tier.Gold };
      useAgentStore.getState().setReputation(rep);
      expect(useAgentStore.getState().reputation).toEqual(rep);
    });

    it('clears reputation with null', () => {
      useAgentStore.getState().setReputation({ totalJobs: 10, totalRatingPoints: 40, totalRevenue: 100, tier: Tier.Bronze });
      useAgentStore.getState().setReputation(null);
      expect(useAgentStore.getState().reputation).toBeNull();
    });
  });

  describe('setDecayInfo', () => {
    it('sets decay-aware reputation info', () => {
      useAgentStore.getState().setDecayInfo(4.2, 3, Tier.Silver);
      const state = useAgentStore.getState();
      expect(state.effectiveRating).toBe(4.2);
      expect(state.decayPeriods).toBe(3);
      expect(state.effectiveTier).toBe(Tier.Silver);
    });
  });

  describe('search actions', () => {
    it('sets search results', () => {
      const agents = [
        { agent_id: 'a1', service_type: ServiceType.NLP, endpoint_hash: '', tier: Tier.Gold, is_active: true },
      ];
      useAgentStore.getState().setSearchResults(agents);
      expect(useAgentStore.getState().searchResults).toEqual(agents);
    });

    it('selects an agent', () => {
      const agent = { agent_id: 'a1', service_type: ServiceType.Code, endpoint_hash: '', tier: Tier.Bronze, is_active: true };
      useAgentStore.getState().selectAgent(agent);
      expect(useAgentStore.getState().selectedAgent).toEqual(agent);
    });

    it('clears selected agent', () => {
      useAgentStore.getState().selectAgent(null);
      expect(useAgentStore.getState().selectedAgent).toBeNull();
    });

    it('sets filters', () => {
      useAgentStore.getState().setFilters({ service_type: ServiceType.Vision, min_tier: Tier.Silver });
      expect(useAgentStore.getState().filters).toEqual({ service_type: ServiceType.Vision, min_tier: Tier.Silver });
    });

    it('sets searching state', () => {
      useAgentStore.getState().setSearching(true);
      expect(useAgentStore.getState().isSearching).toBe(true);
      useAgentStore.getState().setSearching(false);
      expect(useAgentStore.getState().isSearching).toBe(false);
    });
  });

  describe('disputes', () => {
    it('sets disputes array', () => {
      const disputes = [
        { client: 'c1', agent: 'a1', job_hash: 'j1', escrow_amount: 1000, status: 'opened' as const, resolution_agent_pct: 0, opened_at: '2025-01-01' },
      ];
      useAgentStore.getState().setDisputes(disputes);
      expect(useAgentStore.getState().disputes).toEqual(disputes);
    });

    it('prepends new dispute', () => {
      const d1 = { client: 'c1', agent: 'a1', job_hash: 'j1', escrow_amount: 1000, status: 'opened' as const, resolution_agent_pct: 0, opened_at: '2025-01-01' };
      const d2 = { client: 'c2', agent: 'a2', job_hash: 'j2', escrow_amount: 2000, status: 'opened' as const, resolution_agent_pct: 0, opened_at: '2025-01-02' };
      useAgentStore.getState().addDispute(d1);
      useAgentStore.getState().addDispute(d2);
      const disputes = useAgentStore.getState().disputes;
      expect(disputes).toHaveLength(2);
      expect(disputes[0]).toEqual(d2); // Most recent first
    });
  });

  describe('sessions', () => {
    const makeSession = (id: string, agent: string, status: 'active' | 'paused' | 'closed' = 'active') => ({
      session_id: id,
      client: 'c1',
      agent,
      max_total: 10000,
      max_per_request: 100,
      rate_limit: 60,
      spent: 0,
      request_count: 0,
      valid_until: 99999,
      duration_blocks: 100,
      status,
      created_at: '2025-01-01',
      updated_at: '2025-01-01',
      receipts: [],
    });

    it('adds session to the front', () => {
      useAgentStore.getState().addSession(makeSession('s1', 'a1'));
      useAgentStore.getState().addSession(makeSession('s2', 'a1'));
      expect(useAgentStore.getState().sessions).toHaveLength(2);
      expect(useAgentStore.getState().sessions[0].session_id).toBe('s2');
    });

    it('updates a specific session', () => {
      useAgentStore.getState().addSession(makeSession('s1', 'a1'));
      useAgentStore.getState().updateSession('s1', { spent: 500, request_count: 5 });
      const updated = useAgentStore.getState().sessions[0];
      expect(updated.spent).toBe(500);
      expect(updated.request_count).toBe(5);
    });

    it('updates activeSession when matching', () => {
      const session = makeSession('s1', 'a1');
      useAgentStore.getState().addSession(session);
      useAgentStore.getState().setActiveSession(session);
      useAgentStore.getState().updateSession('s1', { spent: 200 });
      expect(useAgentStore.getState().activeSession?.spent).toBe(200);
    });

    it('does not update activeSession when non-matching', () => {
      const s1 = makeSession('s1', 'a1');
      const s2 = makeSession('s2', 'a1');
      useAgentStore.getState().addSession(s1);
      useAgentStore.getState().addSession(s2);
      useAgentStore.getState().setActiveSession(s1);
      useAgentStore.getState().updateSession('s2', { spent: 300 });
      expect(useAgentStore.getState().activeSession?.spent).toBe(0);
    });
  });

  describe('policies', () => {
    it('adds policy to front', () => {
      const p1 = { policy_id: 'p1', owner: 'o1', max_session_value: 10000, max_single_request: 100, allowed_tiers: 15, allowed_categories: 127, require_proofs: false, created_at: '2025-01-01' };
      useAgentStore.getState().addPolicy(p1);
      expect(useAgentStore.getState().policies).toHaveLength(1);
      expect(useAgentStore.getState().policies[0].policy_id).toBe('p1');
    });
  });

  describe('transactions', () => {
    it('adds transaction with auto-generated id and timestamp', () => {
      useAgentStore.getState().addTransaction({ type: 'escrow_created', agentId: 'a1', amount: 1000 });
      const txns = useAgentStore.getState().transactions;
      expect(txns).toHaveLength(1);
      expect(txns[0].type).toBe('escrow_created');
      expect(txns[0].id).toBeDefined();
      expect(txns[0].timestamp).toBeGreaterThan(0);
    });

    it('caps transactions at 50', () => {
      for (let i = 0; i < 55; i++) {
        useAgentStore.getState().addTransaction({ type: 'rating_submitted', agentId: `a${i}` });
      }
      expect(useAgentStore.getState().transactions).toHaveLength(50);
    });

    it('clears all transactions', () => {
      useAgentStore.getState().addTransaction({ type: 'escrow_created', agentId: 'a1' });
      useAgentStore.getState().clearTransactions();
      expect(useAgentStore.getState().transactions).toEqual([]);
    });
  });
});

describe('helper functions', () => {
  describe('getTierName', () => {
    it('returns correct names for all tiers', () => {
      expect(getTierName(Tier.New)).toBe('New');
      expect(getTierName(Tier.Bronze)).toBe('Bronze');
      expect(getTierName(Tier.Silver)).toBe('Silver');
      expect(getTierName(Tier.Gold)).toBe('Gold');
      expect(getTierName(Tier.Diamond)).toBe('Diamond');
    });

    it('returns Unknown for invalid tier', () => {
      expect(getTierName(99 as Tier)).toBe('Unknown');
    });
  });

  describe('getServiceTypeName', () => {
    it('returns correct names for all service types', () => {
      expect(getServiceTypeName(ServiceType.NLP)).toBe('NLP');
      expect(getServiceTypeName(ServiceType.Vision)).toBe('Vision');
      expect(getServiceTypeName(ServiceType.Code)).toBe('Code');
      expect(getServiceTypeName(ServiceType.Data)).toBe('Data');
      expect(getServiceTypeName(ServiceType.Audio)).toBe('Audio');
      expect(getServiceTypeName(ServiceType.Multi)).toBe('Multi');
      expect(getServiceTypeName(ServiceType.Custom)).toBe('Custom');
    });

    it('returns Unknown for invalid type', () => {
      expect(getServiceTypeName(99 as ServiceType)).toBe('Unknown');
    });
  });

  describe('calculateAverageRating', () => {
    it('calculates correct average', () => {
      expect(calculateAverageRating(450, 10)).toBe(4.5);
      expect(calculateAverageRating(500, 10)).toBe(5.0);
    });

    it('returns 0 for zero jobs', () => {
      expect(calculateAverageRating(0, 0)).toBe(0);
    });
  });

  describe('formatRevenue', () => {
    it('formats microcents to dollars', () => {
      expect(formatRevenue(1_000_000)).toBe('$1.00');
      expect(formatRevenue(52_340_000)).toBe('$52.34');
      expect(formatRevenue(0)).toBe('$0.00');
    });
  });
});
