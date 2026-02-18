// Redis Service for Persistent Storage
// Provides caching and persistent storage for facilitator operations

import Redis from 'ioredis';

// Lazy logger — avoids circular dependency with index.ts during tests
let _logger: { warn: (msg: string, ...a: unknown[]) => void; error: (msg: string, ...a: unknown[]) => void; info: (msg: string, ...a: unknown[]) => void } | null = null;
function getLogger() {
  if (_logger) return _logger;
  try {
    if (process.env.NODE_ENV !== 'test') {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      _logger = require('../index').logger;
    }
  } catch { /* not available */ }
  return _logger;
}

// Default Redis configuration
const DEFAULT_REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const DEFAULT_KEY_PREFIX = 'shadowagent:';

// TTL values in seconds
const TTL = {
  PENDING_JOB: 3600, // 1 hour
  AGENT_CACHE: 300, // 5 minutes
  ESCROW: 86400, // 24 hours
  NULLIFIER: 0, // Never expires (permanent)
};

export interface PendingJob {
  jobHash: string;
  agentId: string;
  amount: number;
  secretHash: string;
  createdAt: number;
  deadline: number;
  status: 'pending' | 'claimed' | 'refunded' | 'expired';
}

export interface CachedAgent {
  agentId: string;
  listing: {
    service_type: number;
    endpoint_hash: string;
    min_tier: number;
    is_active: boolean;
  };
  reputation?: {
    total_jobs: number;
    total_rating_points: number;
    total_revenue: number;
    tier: number;
  };
  cachedAt: number;
}

export class RedisService {
  private client: Redis | null = null;
  private keyPrefix: string;
  private connected: boolean = false;

  constructor(redisUrl: string = DEFAULT_REDIS_URL, keyPrefix: string = DEFAULT_KEY_PREFIX) {
    this.keyPrefix = keyPrefix;

    try {
      this.client = new Redis(redisUrl, {
        maxRetriesPerRequest: 3,
        enableReadyCheck: true,
        lazyConnect: true,
      });

      this.client.on('connect', () => {
        this.connected = true;
        getLogger()?.info('Redis connected');
      });

      this.client.on('error', (error) => {
        (getLogger() || console).warn('Redis error:', error.message);
        this.connected = false;
      });

      this.client.on('close', () => {
        this.connected = false;
      });
    } catch (error) {
      (getLogger() || console).warn('Redis initialization failed, using in-memory fallback');
      this.client = null;
    }
  }

  /**
   * Connect to Redis
   */
  async connect(): Promise<boolean> {
    if (!this.client) return false;

    try {
      await this.client.connect();
      this.connected = true;
      return true;
    } catch (error) {
      (getLogger() || console).warn('Redis connection failed:', error);
      return false;
    }
  }

  /**
   * Check if Redis is available
   */
  isConnected(): boolean {
    return this.connected && this.client !== null;
  }

  /**
   * Get prefixed key
   */
  private key(type: string, id: string): string {
    return `${this.keyPrefix}${type}:${id}`;
  }

  // ═══════════════════════════════════════════════════════════════════
  // PENDING JOBS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Store a pending job
   */
  async setPendingJob(job: PendingJob): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('job', job.jobHash);
      await this.client!.set(key, JSON.stringify(job), 'EX', TTL.PENDING_JOB);
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to set pending job:', error);
      return false;
    }
  }

  /**
   * Get a pending job
   */
  async getPendingJob(jobHash: string): Promise<PendingJob | null> {
    if (!this.isConnected()) return null;

    try {
      const key = this.key('job', jobHash);
      const data = await this.client!.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      (getLogger() || console).error('Failed to get pending job:', error);
      return null;
    }
  }

  /**
   * Update job status
   */
  async updateJobStatus(
    jobHash: string,
    status: PendingJob['status']
  ): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const job = await this.getPendingJob(jobHash);
      if (!job) return false;

      job.status = status;
      return this.setPendingJob(job);
    } catch (error) {
      (getLogger() || console).error('Failed to update job status:', error);
      return false;
    }
  }

  /**
   * Delete a pending job
   */
  async deletePendingJob(jobHash: string): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('job', jobHash);
      await this.client!.del(key);
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to delete pending job:', error);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // JOB SECRETS (separate from job metadata for security isolation)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Store an HTLC secret for a pending job.
   * Stored in a separate key from the job itself so it doesn't leak
   * through debug/listing endpoints.
   */
  async setJobSecret(jobHash: string, secret: string): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('secret', jobHash);
      await this.client!.set(key, secret, 'EX', TTL.PENDING_JOB);
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to set job secret:', error);
      return false;
    }
  }

  /**
   * Retrieve the HTLC secret for a pending job.
   */
  async getJobSecret(jobHash: string): Promise<string | null> {
    if (!this.isConnected()) return null;

    try {
      const key = this.key('secret', jobHash);
      return await this.client!.get(key);
    } catch (error) {
      (getLogger() || console).error('Failed to get job secret:', error);
      return null;
    }
  }

  /**
   * Delete the HTLC secret for a completed job.
   */
  async deleteJobSecret(jobHash: string): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('secret', jobHash);
      await this.client!.del(key);
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to delete job secret:', error);
      return false;
    }
  }

  /**
   * Get all pending jobs for an agent
   */
  async getAgentPendingJobs(agentId: string): Promise<PendingJob[]> {
    if (!this.isConnected()) return [];

    try {
      const pattern = this.key('job', '*');
      const jobs: PendingJob[] = [];
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.client!.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        for (const key of keys) {
          const data = await this.client!.get(key);
          if (data) {
            const job = JSON.parse(data) as PendingJob;
            if (job.agentId === agentId && job.status === 'pending') {
              jobs.push(job);
            }
          }
        }
      } while (cursor !== '0');

      return jobs;
    } catch (error) {
      (getLogger() || console).error('Failed to get agent pending jobs:', error);
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // AGENT CACHE
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Cache agent data
   */
  async cacheAgent(agent: CachedAgent): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('agent', agent.agentId);
      agent.cachedAt = Date.now();
      await this.client!.set(key, JSON.stringify(agent), 'EX', TTL.AGENT_CACHE);
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to cache agent:', error);
      return false;
    }
  }

  /**
   * Get cached agent
   */
  async getCachedAgent(agentId: string): Promise<CachedAgent | null> {
    if (!this.isConnected()) return null;

    try {
      const key = this.key('agent', agentId);
      const data = await this.client!.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      (getLogger() || console).error('Failed to get cached agent:', error);
      return null;
    }
  }

  /**
   * Invalidate agent cache
   */
  async invalidateAgentCache(agentId: string): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('agent', agentId);
      await this.client!.del(key);
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to invalidate agent cache:', error);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // NULLIFIERS (Permanent storage for double-rating prevention)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Mark a nullifier as used (permanent)
   */
  async markNullifierUsed(nullifier: string): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('nullifier', nullifier);
      await this.client!.set(key, Date.now().toString());
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to mark nullifier used:', error);
      return false;
    }
  }

  /**
   * Check if nullifier is used
   */
  async isNullifierUsed(nullifier: string): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('nullifier', nullifier);
      const exists = await this.client!.exists(key);
      return exists === 1;
    } catch (error) {
      (getLogger() || console).error('Failed to check nullifier:', error);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // ESCROW TRACKING
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Store escrow data
   */
  async setEscrow(
    escrowId: string,
    data: {
      client: string;
      agent: string;
      amount: number;
      jobHash: string;
      deadline: number;
      secretHash: string;
      status: 'locked' | 'released' | 'refunded';
      createdAt: number;
    }
  ): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const key = this.key('escrow', escrowId);
      await this.client!.set(key, JSON.stringify(data), 'EX', TTL.ESCROW);
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to set escrow:', error);
      return false;
    }
  }

  /**
   * Get escrow data
   */
  async getEscrow(escrowId: string): Promise<{
    client: string;
    agent: string;
    amount: number;
    jobHash: string;
    deadline: number;
    secretHash: string;
    status: 'locked' | 'released' | 'refunded';
    createdAt: number;
  } | null> {
    if (!this.isConnected()) return null;

    try {
      const key = this.key('escrow', escrowId);
      const data = await this.client!.get(key);
      return data ? JSON.parse(data) : null;
    } catch (error) {
      (getLogger() || console).error('Failed to get escrow:', error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // RATE LIMIT STATE (for restart resilience)
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Atomically increment a rate limit counter with automatic expiry.
   * Returns the new counter value, or -1 on failure.
   */
  async incrementRateLimit(
    category: string,
    key: string,
    windowMs: number
  ): Promise<number> {
    if (!this.isConnected()) return -1;

    try {
      const redisKey = this.key(`rate:${category}`, key);
      const count = await this.client!.incr(redisKey);

      // Set expiry on first increment
      if (count === 1) {
        const ttlSeconds = Math.ceil(windowMs / 1000) + 60; // Window + 60s buffer
        await this.client!.expire(redisKey, ttlSeconds);
      }

      return count;
    } catch (error) {
      (getLogger() || console).error('Failed to increment rate limit:', error);
      return -1;
    }
  }

  /**
   * Get current rate limit counter value.
   */
  async getRateLimitCount(
    category: string,
    key: string
  ): Promise<number> {
    if (!this.isConnected()) return 0;

    try {
      const redisKey = this.key(`rate:${category}`, key);
      const count = await this.client!.get(redisKey);
      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      (getLogger() || console).error('Failed to get rate limit count:', error);
      return 0;
    }
  }

  /**
   * Reset a rate limit counter.
   */
  async resetRateLimit(
    category: string,
    key: string
  ): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const redisKey = this.key(`rate:${category}`, key);
      await this.client!.del(redisKey);
      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to reset rate limit:', error);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // UTILITY
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Health check
   */
  async ping(): Promise<boolean> {
    if (!this.client) return false;

    try {
      const result = await this.client.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }

  /**
   * Disconnect from Redis
   */
  async disconnect(): Promise<void> {
    if (this.client) {
      await this.client.quit();
      this.connected = false;
    }
  }

  /**
   * Clear all ShadowAgent keys (for testing)
   */
  async clearAll(): Promise<boolean> {
    if (!this.isConnected()) return false;

    try {
      const pattern = `${this.keyPrefix}*`;
      let cursor = '0';

      do {
        const [nextCursor, keys] = await this.client!.scan(cursor, 'MATCH', pattern, 'COUNT', 100);
        cursor = nextCursor;

        if (keys.length > 0) {
          await this.client!.del(...keys);
        }
      } while (cursor !== '0');

      return true;
    } catch (error) {
      (getLogger() || console).error('Failed to clear all keys:', error);
      return false;
    }
  }
}

// Singleton instance
let redisService: RedisService | null = null;

/**
 * Get the Redis service instance
 */
export function getRedisService(): RedisService {
  if (!redisService) {
    redisService = new RedisService();
  }
  return redisService;
}

/**
 * Initialize Redis with custom configuration
 */
export function initRedis(
  redisUrl?: string,
  keyPrefix?: string
): RedisService {
  redisService = new RedisService(redisUrl, keyPrefix);
  return redisService;
}

export default RedisService;
