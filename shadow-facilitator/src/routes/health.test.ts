// ShadowAgent Facilitator - Health Route Tests

// Mock the index module (logger) to prevent full app bootstrap
jest.mock('../index', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock aleo service to control block height responses
const mockGetBlockHeight = jest.fn();
const mockGetCircuitBreakerStats = jest.fn();
jest.mock('../services/aleo', () => ({
  aleoService: {
    getBlockHeight: mockGetBlockHeight,
    getCircuitBreakerStats: mockGetCircuitBreakerStats,
  },
}));

// Mock indexer service
const mockGetStats = jest.fn();
const mockGetHashRing = jest.fn();
jest.mock('../services/indexer', () => ({
  indexerService: {
    getStats: mockGetStats,
    getHashRing: mockGetHashRing,
  },
}));

// Mock redis service
const mockPing = jest.fn();
jest.mock('../services/redis', () => ({
  getRedisService: () => ({
    ping: mockPing,
  }),
}));

import express from 'express';
import request from 'supertest';
import healthRouter from './health';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/health', healthRouter);
  return app;
}

describe('Health Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // GET /health
  describe('GET /health', () => {
    it('should return ok status with timestamp and version', async () => {
      const app = createApp();
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('0.1.0');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return a valid ISO timestamp', async () => {
      const app = createApp();
      const res = await request(app).get('/health');

      const parsed = new Date(res.body.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  // GET /health/ready
  describe('GET /health/ready', () => {
    it('should return ready when Aleo network is reachable', async () => {
      mockGetBlockHeight.mockResolvedValue(12345);

      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.blockHeight).toBe(12345);
      expect(res.body.version).toBe('0.1.0');
      expect(res.body).toHaveProperty('network');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return 503 when block height is 0', async () => {
      mockGetBlockHeight.mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not ready');
      expect(res.body.error).toContain('Cannot connect');
    });

    it('should return 503 when Aleo service throws', async () => {
      mockGetBlockHeight.mockRejectedValue(new Error('Network timeout'));

      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not ready');
      expect(res.body.error).toContain('Health check failed');
      expect(res.body.version).toBe('0.1.0');
    });

    it('should return 503 when block height is negative', async () => {
      mockGetBlockHeight.mockResolvedValue(-1);

      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not ready');
    });
  });

  // GET /health/live
  describe('GET /health/live', () => {
    it('should return live status', async () => {
      const app = createApp();
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('live');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return a valid ISO timestamp', async () => {
      const app = createApp();
      const res = await request(app).get('/health/live');

      const parsed = new Date(res.body.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('should not include version or blockHeight', async () => {
      const app = createApp();
      const res = await request(app).get('/health/live');

      expect(res.body).not.toHaveProperty('version');
      expect(res.body).not.toHaveProperty('blockHeight');
    });
  });

  // GET /health/detailed
  describe('GET /health/detailed', () => {
    beforeEach(() => {
      mockGetCircuitBreakerStats.mockReturnValue({
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
      });
      mockGetStats.mockReturnValue({
        cachedAgents: 5,
        trackedAgents: 10,
        lastIndexTime: Date.now(),
        totalFetches: 100,
        cacheHits: 80,
        cacheMisses: 20,
      });
      mockGetHashRing.mockReturnValue({
        getNodeCount: () => 1,
        getDistribution: () => new Map([['node-0', 100]]),
      });
      mockPing.mockResolvedValue(false);
    });

    it('should return all subsystem statuses', async () => {
      const app = createApp();
      const res = await request(app).get('/health/detailed');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('0.1.0');
      expect(res.body).toHaveProperty('startedAt');
      expect(res.body).toHaveProperty('subsystems');
    });

    it('should include circuit breaker status', async () => {
      mockGetCircuitBreakerStats.mockReturnValue({
        state: 'open',
        failureCount: 5,
        lastFailureTime: Date.now() - 1000,
      });

      const app = createApp();
      const res = await request(app).get('/health/detailed');

      const aleo = res.body.subsystems.aleo_rpc;
      expect(aleo.circuit_breaker).toBe('open');
      expect(aleo.failure_count).toBe(5);
      expect(aleo.last_failure).not.toBeNull();
    });

    it('should include indexer cache stats', async () => {
      const app = createApp();
      const res = await request(app).get('/health/detailed');

      const indexer = res.body.subsystems.indexer;
      expect(indexer.cached_agents).toBe(5);
      expect(indexer.tracked_agents).toBe(10);
      expect(indexer.cache_hit_rate).toBe(80);
      expect(indexer.total_fetches).toBe(100);
      expect(indexer.last_index_time).not.toBeNull();
    });

    it('should show 0% cache hit rate when no fetches', async () => {
      mockGetStats.mockReturnValue({
        cachedAgents: 0,
        trackedAgents: 0,
        lastIndexTime: 0,
        totalFetches: 0,
        cacheHits: 0,
        cacheMisses: 0,
      });

      const app = createApp();
      const res = await request(app).get('/health/detailed');

      expect(res.body.subsystems.indexer.cache_hit_rate).toBe(0);
      expect(res.body.subsystems.indexer.last_index_time).toBeNull();
    });

    it('should include redis connectivity', async () => {
      mockPing.mockResolvedValue(true);

      const app = createApp();
      const res = await request(app).get('/health/detailed');

      expect(res.body.subsystems.redis.connected).toBe(true);
    });

    it('should show redis as disconnected when ping fails', async () => {
      mockPing.mockRejectedValue(new Error('Connection refused'));

      const app = createApp();
      const res = await request(app).get('/health/detailed');

      expect(res.body.subsystems.redis.connected).toBe(false);
    });

    it('should include hash ring topology', async () => {
      mockGetHashRing.mockReturnValue({
        getNodeCount: () => 3,
        getDistribution: () => new Map([
          ['node-0', 34],
          ['node-1', 33],
          ['node-2', 33],
        ]),
      });

      const app = createApp();
      const res = await request(app).get('/health/detailed');

      const ring = res.body.subsystems.hash_ring;
      expect(ring.node_count).toBe(3);
      expect(ring.distribution).toHaveProperty('node-0');
      expect(ring.distribution).toHaveProperty('node-1');
    });

    it('should show null for last_failure when no failures', async () => {
      mockGetCircuitBreakerStats.mockReturnValue({
        state: 'closed',
        failureCount: 0,
        lastFailureTime: 0,
      });

      const app = createApp();
      const res = await request(app).get('/health/detailed');

      expect(res.body.subsystems.aleo_rpc.last_failure).toBeNull();
    });
  });
});
