// Health Check Routes

import { Router, Request, Response } from 'express';
import { aleoService } from '../services/aleo';
import { indexerService } from '../services/indexer';
import { getRedisService } from '../services/redis';
import { HealthStatus } from '../types';

const router = Router();

const VERSION = '0.1.0';
const startedAt = new Date().toISOString();

// GET /health - Basic health check
router.get('/', (req: Request, res: Response) => {
  const status: HealthStatus = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: VERSION,
  };

  res.json(status);
});

// GET /health/ready - Readiness check (includes Aleo connection)
router.get('/ready', async (req: Request, res: Response) => {
  try {
    const blockHeight = await aleoService.getBlockHeight();

    if (blockHeight > 0) {
      res.json({
        status: 'ready',
        timestamp: new Date().toISOString(),
        version: VERSION,
        blockHeight,
        network: process.env.ALEO_NETWORK || 'testnet',
      });
    } else {
      res.status(503).json({
        status: 'not ready',
        timestamp: new Date().toISOString(),
        version: VERSION,
        error: 'Cannot connect to Aleo network',
      });
    }
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      timestamp: new Date().toISOString(),
      version: VERSION,
      error: 'Health check failed',
    });
  }
});

// GET /health/live - Liveness check
router.get('/live', (req: Request, res: Response) => {
  res.json({
    status: 'live',
    timestamp: new Date().toISOString(),
  });
});

// GET /health/detailed - Detailed system status for operators
router.get('/detailed', async (req: Request, res: Response) => {
  const timestamp = new Date().toISOString();

  // Circuit breaker stats
  const circuitBreaker = aleoService.getCircuitBreakerStats();

  // Indexer stats
  const indexer = indexerService.getStats();

  // Redis connectivity
  const redis = getRedisService();
  let redisHealthy = false;
  try {
    redisHealthy = await redis.ping();
  } catch {
    // Redis unavailable
  }

  // Hash ring topology
  const ring = indexerService.getHashRing();

  res.json({
    status: 'ok',
    timestamp,
    version: VERSION,
    startedAt,
    subsystems: {
      aleo_rpc: {
        circuit_breaker: circuitBreaker.state,
        failure_count: circuitBreaker.failureCount,
        last_failure: circuitBreaker.lastFailureTime
          ? new Date(circuitBreaker.lastFailureTime).toISOString()
          : null,
      },
      indexer: {
        cached_agents: indexer.cachedAgents,
        tracked_agents: indexer.trackedAgents,
        cache_hit_rate: indexer.totalFetches > 0
          ? Math.round((indexer.cacheHits / indexer.totalFetches) * 100)
          : 0,
        total_fetches: indexer.totalFetches,
        last_index_time: indexer.lastIndexTime
          ? new Date(indexer.lastIndexTime).toISOString()
          : null,
      },
      redis: {
        connected: redisHealthy,
      },
      hash_ring: {
        node_count: ring.getNodeCount(),
        distribution: Object.fromEntries(ring.getDistribution()),
      },
    },
  });
});

export default router;
