// ShadowAgent Facilitator - Indexer Service Tests

import { IndexerService } from './indexer';
import { Tier, ServiceType, AgentListing } from '../types';

// Mock the aleo service
jest.mock('./aleo', () => ({
  aleoService: {
    getAgentListing: jest.fn().mockResolvedValue(null),
    getAllAgentListings: jest.fn().mockResolvedValue([]),
  },
}));

// Mock logger
jest.mock('../index', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Helper to create test agents
function createTestAgents(): AgentListing[] {
  return [
    {
      agent_id: '1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
      service_type: ServiceType.NLP,
      endpoint_hash: 'hash_nlp_endpoint',
      tier: Tier.Gold,
      is_active: true,
      registered_at: Date.now() - 86400000 * 30,
    },
    {
      agent_id: 'abcdef1234567890abcdef1234567890abcdef1234567890abcdef12345678',
      service_type: ServiceType.Vision,
      endpoint_hash: 'hash_vision_endpoint',
      tier: Tier.Silver,
      is_active: true,
      registered_at: Date.now() - 86400000 * 15,
    },
    {
      agent_id: '567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef12',
      service_type: ServiceType.Code,
      endpoint_hash: 'hash_code_endpoint',
      tier: Tier.Diamond,
      is_active: true,
      registered_at: Date.now() - 86400000 * 60,
    },
    {
      agent_id: 'def1234567890abcdef1234567890abcdef1234567890abcdef1234567890ab',
      service_type: ServiceType.Data,
      endpoint_hash: 'hash_data_endpoint',
      tier: Tier.Bronze,
      is_active: true,
      registered_at: Date.now() - 86400000 * 7,
    },
    {
      agent_id: '890abcdef1234567890abcdef1234567890abcdef1234567890abcdef123456',
      service_type: ServiceType.NLP,
      endpoint_hash: 'hash_nlp_endpoint_2',
      tier: Tier.New,
      is_active: true,
      registered_at: Date.now() - 86400000,
    },
  ];
}

describe('IndexerService', () => {
  let indexerService: IndexerService;

  beforeEach(() => {
    indexerService = new IndexerService();
    // Seed with test agents for testing
    const testAgents = createTestAgents();
    for (const agent of testAgents) {
      indexerService.cacheAgent(agent);
    }
  });

  describe('searchAgents', () => {
    it('should return all agents when no filters', async () => {
      const result = await indexerService.searchAgents({});
      expect(result.agents.length).toBeGreaterThan(0);
      expect(result.total).toBeGreaterThan(0);
    });

    it('should filter by service type', async () => {
      const result = await indexerService.searchAgents({
        service_type: ServiceType.NLP,
      });

      for (const agent of result.agents) {
        expect(agent.service_type).toBe(ServiceType.NLP);
      }
    });

    it('should filter by minimum tier', async () => {
      const result = await indexerService.searchAgents({
        min_tier: Tier.Silver,
      });

      for (const agent of result.agents) {
        expect(agent.tier).toBeGreaterThanOrEqual(Tier.Silver);
      }
    });

    it('should filter by active status', async () => {
      const result = await indexerService.searchAgents({
        is_active: true,
      });

      for (const agent of result.agents) {
        expect(agent.is_active).toBe(true);
      }
    });

    it('should respect limit and offset', async () => {
      const page1 = await indexerService.searchAgents({ limit: 2, offset: 0 });
      const page2 = await indexerService.searchAgents({ limit: 2, offset: 2 });

      expect(page1.agents.length).toBeLessThanOrEqual(2);
      expect(page2.agents.length).toBeLessThanOrEqual(2);

      // Ensure different pages have different agents (if there are enough)
      if (page1.total > 2) {
        const ids1 = page1.agents.map((a) => a.agent_id);
        const ids2 = page2.agents.map((a) => a.agent_id);
        expect(ids1).not.toEqual(ids2);
      }
    });
  });

  describe('getAgent', () => {
    it('should return agent by ID from cache', async () => {
      // First get an agent from search
      const result = await indexerService.searchAgents({ limit: 1 });
      if (result.agents.length > 0) {
        const agentId = result.agents[0].agent_id;
        const agent = await indexerService.getAgent(agentId);

        expect(agent).not.toBeNull();
        expect(agent?.agent_id).toBe(agentId);
      }
    });

    it('should return null for unknown agent', async () => {
      const agent = await indexerService.getAgent('nonexistent-agent-id');
      expect(agent).toBeNull();
    });
  });

  describe('cacheAgent', () => {
    it('should add new agent to cache', () => {
      const newAgent = {
        agent_id: 'test-agent-' + Date.now(),
        service_type: ServiceType.Custom,
        endpoint_hash: 'test-hash',
        tier: Tier.New,
        is_active: true,
      };

      indexerService.cacheAgent(newAgent);

      const cached = indexerService.getAllCachedAgents();
      const found = cached.find((a) => a.agent_id === newAgent.agent_id);
      expect(found).not.toBeUndefined();
      expect(found?.agent_id).toBe(newAgent.agent_id);
    });

    it('should update existing agent in cache', () => {
      const agentId = 'update-test-' + Date.now();

      indexerService.cacheAgent({
        agent_id: agentId,
        service_type: ServiceType.NLP,
        endpoint_hash: 'hash1',
        tier: Tier.New,
        is_active: true,
      });

      indexerService.cacheAgent({
        agent_id: agentId,
        service_type: ServiceType.Vision,
        endpoint_hash: 'hash2',
        tier: Tier.Bronze,
        is_active: false,
      });

      const cached = indexerService.getAllCachedAgents();
      const agent = cached.find((a) => a.agent_id === agentId);
      expect(agent?.service_type).toBe(ServiceType.Vision);
      expect(agent?.tier).toBe(Tier.Bronze);
      expect(agent?.is_active).toBe(false);
    });
  });

  describe('clearCache', () => {
    it('should clear all cached agents', () => {
      indexerService.clearCache();
      const cached = indexerService.getAllCachedAgents();
      expect(cached.length).toBe(0);
    });
  });

  describe('getStats', () => {
    it('should return cache statistics', () => {
      const stats = indexerService.getStats();
      expect(stats).toHaveProperty('cachedAgents');
      expect(stats).toHaveProperty('trackedAgents');
      expect(stats).toHaveProperty('lastIndexTime');
      expect(stats.cachedAgents).toBeGreaterThan(0);
    });
  });

  describe('trackAgent', () => {
    it('should add agent ID to tracked set', () => {
      const agentId = 'tracked-agent-' + Date.now();
      indexerService.trackAgent(agentId);
      const stats = indexerService.getStats();
      expect(stats.trackedAgents).toBeGreaterThan(0);
    });
  });

  describe('untrackAgent', () => {
    it('should remove agent from cache and tracking', () => {
      const testAgents = createTestAgents();
      const agentId = testAgents[0].agent_id;

      const beforeStats = indexerService.getStats();
      indexerService.untrackAgent(agentId);
      const afterStats = indexerService.getStats();

      expect(afterStats.cachedAgents).toBe(beforeStats.cachedAgents - 1);
    });
  });
});
