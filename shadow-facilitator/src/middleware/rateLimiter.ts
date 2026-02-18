// Rate Limiting Algorithms for ShadowAgent Facilitator
//
// Three algorithms for different use cases:
// - Token Bucket: Global HTTP rate limiting (allows bursts)
// - Sliding Window Counter: Session-based rate limiting (smooth enforcement)
// - Fixed Window Counter: Per-address operations (simple, low-frequency)

import { Request, Response, NextFunction } from 'express';

// ═══════════════════════════════════════════════════════════════════
// Interfaces
// ═══════════════════════════════════════════════════════════════════

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;       // Unix timestamp (ms) when the window/bucket resets
  retryAfter?: number;   // Seconds until the client can retry
}

export interface RateLimiterConfig {
  maxRequests: number;
  windowMs: number;
}

export interface RateLimiter {
  check(key: string): RateLimitResult;
  reset(key: string): void;
  cleanup(): void;
}

// ═══════════════════════════════════════════════════════════════════
// Token Bucket — for global HTTP rate limiting
//
// Allows bursts up to capacity while enforcing a sustained average rate.
// Tokens refill continuously at (maxRequests / windowMs) per millisecond.
// ═══════════════════════════════════════════════════════════════════

interface TokenBucketEntry {
  tokens: number;
  lastRefill: number;
}

export class TokenBucketLimiter implements RateLimiter {
  private buckets: Map<string, TokenBucketEntry> = new Map();
  private capacity: number;
  private refillRate: number; // tokens per millisecond
  private windowMs: number;

  constructor(config: RateLimiterConfig) {
    this.capacity = config.maxRequests;
    this.windowMs = config.windowMs;
    this.refillRate = config.maxRequests / config.windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = this.buckets.get(key);

    if (!entry) {
      entry = { tokens: this.capacity, lastRefill: now };
      this.buckets.set(key, entry);
    }

    // Refill tokens based on elapsed time
    const elapsed = now - entry.lastRefill;
    entry.tokens = Math.min(
      this.capacity,
      entry.tokens + elapsed * this.refillRate
    );
    entry.lastRefill = now;

    if (entry.tokens >= 1) {
      entry.tokens -= 1;
      return {
        allowed: true,
        remaining: Math.floor(entry.tokens),
        resetAt: now + this.windowMs,
      };
    }

    // Denied: calculate when next token will be available
    const retryAfterMs = (1 - entry.tokens) / this.refillRate;
    return {
      allowed: false,
      remaining: 0,
      resetAt: now + retryAfterMs,
      retryAfter: Math.ceil(retryAfterMs / 1000),
    };
  }

  reset(key: string): void {
    this.buckets.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    const staleThreshold = this.windowMs * 2;
    for (const [key, entry] of this.buckets) {
      if (now - entry.lastRefill > staleThreshold) {
        this.buckets.delete(key);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Sliding Window Counter — for session-based rate limiting
//
// Combines current window count with weighted previous window count
// to eliminate the boundary-burst problem of fixed windows.
// Matches the Leo contract's block-based window semantics.
// ═══════════════════════════════════════════════════════════════════

interface SlidingWindowEntry {
  previousCount: number;
  currentCount: number;
  windowStart: number;
}

export class SlidingWindowCounterLimiter implements RateLimiter {
  private windows: Map<string, SlidingWindowEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(config: RateLimiterConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = this.windows.get(key);

    if (!entry) {
      entry = { previousCount: 0, currentCount: 0, windowStart: now };
      this.windows.set(key, entry);
    }

    const elapsed = now - entry.windowStart;

    // Skipped an entire window — reset completely
    if (elapsed >= this.windowMs * 2) {
      entry.previousCount = 0;
      entry.currentCount = 0;
      entry.windowStart = now;
    } else if (elapsed >= this.windowMs) {
      // Rolled into the next window
      entry.previousCount = entry.currentCount;
      entry.currentCount = 0;
      entry.windowStart = entry.windowStart + this.windowMs;
    }

    // Weighted count: fraction of previous window that overlaps with sliding window
    const windowElapsed = now - entry.windowStart;
    const previousWeight = Math.max(0, 1 - (windowElapsed / this.windowMs));
    const estimatedCount =
      entry.previousCount * previousWeight + entry.currentCount;

    if (estimatedCount + 1 > this.maxRequests) {
      const resetAt = entry.windowStart + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(Math.max(0, resetAt - now) / 1000),
      };
    }

    entry.currentCount += 1;
    const newEstimate =
      entry.previousCount * previousWeight + entry.currentCount;

    return {
      allowed: true,
      remaining: Math.max(0, Math.floor(this.maxRequests - newEstimate)),
      resetAt: entry.windowStart + this.windowMs,
    };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    const staleThreshold = this.windowMs * 3;
    for (const [key, entry] of this.windows) {
      if (now - entry.windowStart > staleThreshold) {
        this.windows.delete(key);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Fixed Window Counter — for per-address operations
//
// Simple counter per time window. Best for low-frequency operations
// like agent registration and rating submission.
// ═══════════════════════════════════════════════════════════════════

interface FixedWindowEntry {
  count: number;
  windowStart: number;
}

export class FixedWindowCounterLimiter implements RateLimiter {
  private windows: Map<string, FixedWindowEntry> = new Map();
  private maxRequests: number;
  private windowMs: number;

  constructor(config: RateLimiterConfig) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
  }

  check(key: string): RateLimitResult {
    const now = Date.now();
    let entry = this.windows.get(key);

    if (!entry || now - entry.windowStart >= this.windowMs) {
      entry = { count: 0, windowStart: now };
      this.windows.set(key, entry);
    }

    if (entry.count >= this.maxRequests) {
      const resetAt = entry.windowStart + this.windowMs;
      return {
        allowed: false,
        remaining: 0,
        resetAt,
        retryAfter: Math.ceil(Math.max(0, resetAt - now) / 1000),
      };
    }

    entry.count += 1;
    return {
      allowed: true,
      remaining: this.maxRequests - entry.count,
      resetAt: entry.windowStart + this.windowMs,
    };
  }

  reset(key: string): void {
    this.windows.delete(key);
  }

  cleanup(): void {
    const now = Date.now();
    for (const [key, entry] of this.windows) {
      if (now - entry.windowStart >= this.windowMs * 2) {
        this.windows.delete(key);
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════
// Redis-Backed Fixed Window Counter — for restart-resilient rate limiting
//
// Uses Redis INCR+EXPIRE when connected, falls back to in-memory
// FixedWindowCounterLimiter when Redis is unavailable.
// ═══════════════════════════════════════════════════════════════════

export interface RedisRateLimitAdapter {
  increment(category: string, key: string, windowMs: number): Promise<number>;
  getCount(category: string, key: string): Promise<number>;
  reset(category: string, key: string): Promise<boolean>;
  isAvailable(): boolean;
}

export class RedisBackedFixedWindowLimiter implements RateLimiter {
  private fallback: FixedWindowCounterLimiter;
  private redis: RedisRateLimitAdapter | null;
  private category: string;
  private maxRequests: number;
  private windowMs: number;

  constructor(
    config: RateLimiterConfig & { category: string },
    redis?: RedisRateLimitAdapter,
  ) {
    this.maxRequests = config.maxRequests;
    this.windowMs = config.windowMs;
    this.category = config.category;
    this.redis = redis || null;
    this.fallback = new FixedWindowCounterLimiter(config);
  }

  /**
   * Check rate limit. Uses Redis when available, in-memory otherwise.
   * Note: Redis path is async but we return a sync result.
   * For the sync RateLimiter interface, this uses the in-memory fallback.
   * Use checkAsync() for Redis-backed checking.
   */
  check(key: string): RateLimitResult {
    // Sync path always uses in-memory fallback
    return this.fallback.check(key);
  }

  /**
   * Async check that uses Redis when available.
   */
  async checkAsync(key: string): Promise<RateLimitResult> {
    if (!this.redis?.isAvailable()) {
      return this.fallback.check(key);
    }

    try {
      const count = await this.redis.increment(this.category, key, this.windowMs);

      if (count < 0) {
        // Redis error — fall back to in-memory
        return this.fallback.check(key);
      }

      if (count > this.maxRequests) {
        return {
          allowed: false,
          remaining: 0,
          resetAt: Date.now() + this.windowMs,
          retryAfter: Math.ceil(this.windowMs / 1000),
        };
      }

      return {
        allowed: true,
        remaining: this.maxRequests - count,
        resetAt: Date.now() + this.windowMs,
      };
    } catch {
      // Redis failure — fall back to in-memory
      return this.fallback.check(key);
    }
  }

  reset(key: string): void {
    this.fallback.reset(key);
    if (this.redis?.isAvailable()) {
      this.redis.reset(this.category, key).catch(() => {});
    }
  }

  cleanup(): void {
    this.fallback.cleanup();
  }
}

// ═══════════════════════════════════════════════════════════════════
// Express Middleware Factories
// ═══════════════════════════════════════════════════════════════════

export interface RateLimitMiddlewareOptions {
  maxRequests: number;
  windowMs: number;
  keyExtractor?: (req: Request) => string;
  message?: string;
  onLimitReached?: (req: Request, res: Response) => void;
}

/**
 * Global HTTP rate limiter middleware (Token Bucket).
 * Keyed by IP address by default. Allows bursts while enforcing sustained rate.
 */
export function createGlobalRateLimiter(options: RateLimitMiddlewareOptions) {
  const limiter = new TokenBucketLimiter({
    maxRequests: options.maxRequests,
    windowMs: options.windowMs,
  });

  // Periodic cleanup every 60 seconds
  const cleanupInterval = setInterval(() => limiter.cleanup(), 60_000);
  if (cleanupInterval.unref) cleanupInterval.unref();

  const keyExtractor = options.keyExtractor ||
    ((req: Request) => req.ip || req.socket?.remoteAddress || 'unknown');

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = keyExtractor(req);
    const result = limiter.check(key);

    // Set standard rate limit headers
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter || 1);
      if (options.onLimitReached) {
        options.onLimitReached(req, res);
        return;
      }
      res.status(429).json({
        error: options.message || 'Too many requests, please try again later',
        retryAfter: result.retryAfter,
      });
      return;
    }

    next();
  };
}

/**
 * Per-address rate limiter for specific routes (Fixed Window).
 * Keyed by address from request body or IP. For registration, rating, dispute endpoints.
 */
export function createAddressRateLimiter(options: RateLimitMiddlewareOptions) {
  const limiter = new FixedWindowCounterLimiter({
    maxRequests: options.maxRequests,
    windowMs: options.windowMs,
  });

  const cleanupInterval = setInterval(() => limiter.cleanup(), 60_000);
  if (cleanupInterval.unref) cleanupInterval.unref();

  const keyExtractor = options.keyExtractor ||
    ((req: Request) => {
      return req.body?.address || req.body?.client ||
             req.body?.owner || req.ip || 'unknown';
    });

  return (req: Request, res: Response, next: NextFunction): void => {
    const key = `addr:${keyExtractor(req)}`;
    const result = limiter.check(key);

    // Set standard rate limit headers
    res.setHeader('X-RateLimit-Limit', options.maxRequests);
    res.setHeader('X-RateLimit-Remaining', result.remaining);
    res.setHeader('X-RateLimit-Reset', Math.ceil(result.resetAt / 1000));

    if (!result.allowed) {
      res.setHeader('Retry-After', result.retryAfter || 1);
      if (options.onLimitReached) {
        options.onLimitReached(req, res);
        return;
      }
      res.status(429).json({
        error: options.message || 'Too many requests for this address',
        retryAfter: result.retryAfter,
      });
      return;
    }

    next();
  };
}

// ═══════════════════════════════════════════════════════════════════
// Redis Adapter Factory
// ═══════════════════════════════════════════════════════════════════

/**
 * Create a RedisRateLimitAdapter from the RedisService.
 * Usage:
 *   import { getRedisService } from '../services/redis';
 *   const adapter = createRedisAdapter(getRedisService());
 *   const limiter = new RedisBackedFixedWindowLimiter({ ... }, adapter);
 */
export function createRedisAdapter(redisService: {
  incrementRateLimit(category: string, key: string, windowMs: number): Promise<number>;
  getRateLimitCount(category: string, key: string): Promise<number>;
  resetRateLimit(category: string, key: string): Promise<boolean>;
  isConnected(): boolean;
}): RedisRateLimitAdapter {
  return {
    increment: (cat, key, windowMs) => redisService.incrementRateLimit(cat, key, windowMs),
    getCount: (cat, key) => redisService.getRateLimitCount(cat, key),
    reset: (cat, key) => redisService.resetRateLimit(cat, key),
    isAvailable: () => redisService.isConnected(),
  };
}
