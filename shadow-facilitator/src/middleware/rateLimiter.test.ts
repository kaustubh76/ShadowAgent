import express from 'express';
import request from 'supertest';
import {
  TokenBucketLimiter,
  SlidingWindowCounterLimiter,
  FixedWindowCounterLimiter,
  RedisBackedFixedWindowLimiter,
  RedisRateLimitAdapter,
  createGlobalRateLimiter,
  createAddressRateLimiter,
  createRedisAdapter,
} from './rateLimiter';

// ═══════════════════════════════════════════════════════════════════
// Token Bucket Limiter
// ═══════════════════════════════════════════════════════════════════

describe('TokenBucketLimiter', () => {
  it('should allow requests within capacity', () => {
    const limiter = new TokenBucketLimiter({ maxRequests: 5, windowMs: 60000 });

    for (let i = 0; i < 5; i++) {
      const result = limiter.check('client1');
      expect(result.allowed).toBe(true);
    }
  });

  it('should deny requests after capacity exhausted', () => {
    const limiter = new TokenBucketLimiter({ maxRequests: 3, windowMs: 60000 });

    for (let i = 0; i < 3; i++) {
      limiter.check('client1');
    }

    const result = limiter.check('client1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
    expect(result.retryAfter).toBeGreaterThan(0);
  });

  it('should track remaining tokens correctly', () => {
    const limiter = new TokenBucketLimiter({ maxRequests: 5, windowMs: 60000 });

    const r1 = limiter.check('client1');
    expect(r1.remaining).toBe(4);

    const r2 = limiter.check('client1');
    expect(r2.remaining).toBe(3);
  });

  it('should refill tokens over time', () => {
    jest.useFakeTimers();
    const limiter = new TokenBucketLimiter({ maxRequests: 10, windowMs: 10000 });

    // Exhaust all tokens
    for (let i = 0; i < 10; i++) {
      limiter.check('client1');
    }
    expect(limiter.check('client1').allowed).toBe(false);

    // Advance time by 5 seconds (half the window) — should refill 5 tokens
    jest.advanceTimersByTime(5000);

    const result = limiter.check('client1');
    expect(result.allowed).toBe(true);
    // After refill of ~5 tokens, minus 1 consumed = ~4 remaining
    expect(result.remaining).toBeGreaterThanOrEqual(3);

    jest.useRealTimers();
  });

  it('should isolate different keys', () => {
    const limiter = new TokenBucketLimiter({ maxRequests: 2, windowMs: 60000 });

    limiter.check('clientA');
    limiter.check('clientA');
    expect(limiter.check('clientA').allowed).toBe(false);

    // clientB should still have full capacity
    expect(limiter.check('clientB').allowed).toBe(true);
  });

  it('should provide retryAfter in seconds when denied', () => {
    const limiter = new TokenBucketLimiter({ maxRequests: 1, windowMs: 60000 });

    limiter.check('client1');
    const denied = limiter.check('client1');

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeDefined();
    expect(denied.retryAfter).toBeGreaterThan(0);
  });

  it('should handle reset', () => {
    const limiter = new TokenBucketLimiter({ maxRequests: 1, windowMs: 60000 });

    limiter.check('client1');
    expect(limiter.check('client1').allowed).toBe(false);

    limiter.reset('client1');
    expect(limiter.check('client1').allowed).toBe(true);
  });

  it('should clean up stale entries', () => {
    jest.useFakeTimers();
    const limiter = new TokenBucketLimiter({ maxRequests: 5, windowMs: 1000 });

    limiter.check('stale-client');

    // Advance past 2x window (stale threshold)
    jest.advanceTimersByTime(3000);
    limiter.cleanup();

    // Entry should be removed — new check starts fresh
    const result = limiter.check('stale-client');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);

    jest.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Sliding Window Counter Limiter
// ═══════════════════════════════════════════════════════════════════

describe('SlidingWindowCounterLimiter', () => {
  it('should allow requests within window limit', () => {
    const limiter = new SlidingWindowCounterLimiter({ maxRequests: 5, windowMs: 60000 });

    for (let i = 0; i < 5; i++) {
      const result = limiter.check('session1');
      expect(result.allowed).toBe(true);
    }
  });

  it('should deny requests exceeding window limit', () => {
    const limiter = new SlidingWindowCounterLimiter({ maxRequests: 3, windowMs: 60000 });

    for (let i = 0; i < 3; i++) {
      limiter.check('session1');
    }

    const result = limiter.check('session1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset after full window expires', () => {
    jest.useFakeTimers();
    const limiter = new SlidingWindowCounterLimiter({ maxRequests: 2, windowMs: 10000 });

    limiter.check('session1');
    limiter.check('session1');
    expect(limiter.check('session1').allowed).toBe(false);

    // Advance past TWO windows — completely clears previous window carry-over
    jest.advanceTimersByTime(20001);

    // After skipping 2+ windows: previousCount=0, currentCount=0
    const result = limiter.check('session1');
    expect(result.allowed).toBe(true);

    jest.useRealTimers();
  });

  it('should weight previous window correctly', () => {
    jest.useFakeTimers();
    const limiter = new SlidingWindowCounterLimiter({ maxRequests: 10, windowMs: 10000 });

    // Fill previous window with 8 requests
    for (let i = 0; i < 8; i++) {
      limiter.check('session1');
    }

    // Advance to 50% through new window
    jest.advanceTimersByTime(15000);
    // previousWeight ≈ 0.5, estimated = 8 * 0.5 + currentCount = 4 + 0 = 4

    // Should allow several more requests
    const result = limiter.check('session1');
    expect(result.allowed).toBe(true);

    jest.useRealTimers();
  });

  it('should completely reset after skipping an entire window', () => {
    jest.useFakeTimers();
    const limiter = new SlidingWindowCounterLimiter({ maxRequests: 2, windowMs: 10000 });

    limiter.check('session1');
    limiter.check('session1');
    expect(limiter.check('session1').allowed).toBe(false);

    // Skip 2+ full windows
    jest.advanceTimersByTime(25000);

    const result = limiter.check('session1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBeGreaterThan(0);

    jest.useRealTimers();
  });

  it('should provide retryAfter when denied', () => {
    const limiter = new SlidingWindowCounterLimiter({ maxRequests: 1, windowMs: 30000 });

    limiter.check('session1');
    const denied = limiter.check('session1');

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeDefined();
    expect(denied.retryAfter).toBeGreaterThan(0);
  });

  it('should handle cleanup of stale entries', () => {
    jest.useFakeTimers();
    const limiter = new SlidingWindowCounterLimiter({ maxRequests: 5, windowMs: 1000 });

    limiter.check('stale-session');

    jest.advanceTimersByTime(5000);
    limiter.cleanup();

    // Fresh check after cleanup
    const result = limiter.check('stale-session');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);

    jest.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Fixed Window Counter Limiter
// ═══════════════════════════════════════════════════════════════════

describe('FixedWindowCounterLimiter', () => {
  it('should allow requests within fixed window', () => {
    const limiter = new FixedWindowCounterLimiter({ maxRequests: 5, windowMs: 60000 });

    for (let i = 0; i < 5; i++) {
      const result = limiter.check('addr1');
      expect(result.allowed).toBe(true);
    }
  });

  it('should deny after window limit reached', () => {
    const limiter = new FixedWindowCounterLimiter({ maxRequests: 3, windowMs: 60000 });

    for (let i = 0; i < 3; i++) {
      limiter.check('addr1');
    }

    const result = limiter.check('addr1');
    expect(result.allowed).toBe(false);
    expect(result.remaining).toBe(0);
  });

  it('should reset counter in new window', () => {
    jest.useFakeTimers();
    const limiter = new FixedWindowCounterLimiter({ maxRequests: 2, windowMs: 10000 });

    limiter.check('addr1');
    limiter.check('addr1');
    expect(limiter.check('addr1').allowed).toBe(false);

    // Advance past the window
    jest.advanceTimersByTime(10001);

    const result = limiter.check('addr1');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(1);

    jest.useRealTimers();
  });

  it('should track remaining correctly', () => {
    const limiter = new FixedWindowCounterLimiter({ maxRequests: 5, windowMs: 60000 });

    expect(limiter.check('addr1').remaining).toBe(4);
    expect(limiter.check('addr1').remaining).toBe(3);
    expect(limiter.check('addr1').remaining).toBe(2);
    expect(limiter.check('addr1').remaining).toBe(1);
    expect(limiter.check('addr1').remaining).toBe(0);
  });

  it('should provide retryAfter when denied', () => {
    const limiter = new FixedWindowCounterLimiter({ maxRequests: 1, windowMs: 30000 });

    limiter.check('addr1');
    const denied = limiter.check('addr1');

    expect(denied.allowed).toBe(false);
    expect(denied.retryAfter).toBeDefined();
    expect(denied.retryAfter).toBeGreaterThan(0);
  });

  it('should isolate different keys', () => {
    const limiter = new FixedWindowCounterLimiter({ maxRequests: 1, windowMs: 60000 });

    limiter.check('addrA');
    expect(limiter.check('addrA').allowed).toBe(false);
    expect(limiter.check('addrB').allowed).toBe(true);
  });

  it('should handle cleanup', () => {
    jest.useFakeTimers();
    const limiter = new FixedWindowCounterLimiter({ maxRequests: 5, windowMs: 1000 });

    limiter.check('stale-addr');

    jest.advanceTimersByTime(3000);
    limiter.cleanup();

    const result = limiter.check('stale-addr');
    expect(result.allowed).toBe(true);
    expect(result.remaining).toBe(4);

    jest.useRealTimers();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Express Middleware: createGlobalRateLimiter
// ═══════════════════════════════════════════════════════════════════

describe('createGlobalRateLimiter middleware', () => {
  function createTestApp(maxRequests: number, windowMs: number) {
    const app = express();
    app.use(express.json());
    app.use(createGlobalRateLimiter({ maxRequests, windowMs }));
    app.get('/test', (_req, res) => {
      res.json({ ok: true });
    });
    return app;
  }

  it('should pass requests within limit', async () => {
    const app = createTestApp(5, 60000);

    for (let i = 0; i < 5; i++) {
      const res = await request(app).get('/test');
      expect(res.status).toBe(200);
      expect(res.body.ok).toBe(true);
    }
  });

  it('should return 429 after limit exceeded', async () => {
    const app = createTestApp(2, 60000);

    await request(app).get('/test');
    await request(app).get('/test');

    const res = await request(app).get('/test');
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Too many requests');
    expect(res.body.retryAfter).toBeDefined();
  });

  it('should set X-RateLimit-* headers', async () => {
    const app = createTestApp(10, 60000);

    const res = await request(app).get('/test');
    expect(res.headers['x-ratelimit-limit']).toBe('10');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });

  it('should set Retry-After header on 429', async () => {
    const app = createTestApp(1, 60000);

    await request(app).get('/test');
    const res = await request(app).get('/test');

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('should use custom key extractor', async () => {
    const app = express();
    app.use(express.json());
    app.use(createGlobalRateLimiter({
      maxRequests: 1,
      windowMs: 60000,
      keyExtractor: (req) => req.query.apiKey as string || 'anonymous',
    }));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    // First key gets through
    const r1 = await request(app).get('/test?apiKey=key1');
    expect(r1.status).toBe(200);

    // Same key blocked
    const r2 = await request(app).get('/test?apiKey=key1');
    expect(r2.status).toBe(429);

    // Different key gets through
    const r3 = await request(app).get('/test?apiKey=key2');
    expect(r3.status).toBe(200);
  });

  it('should use custom onLimitReached handler', async () => {
    const app = express();
    app.use(express.json());
    app.use(createGlobalRateLimiter({
      maxRequests: 1,
      windowMs: 60000,
      onLimitReached: (_req, res) => {
        res.status(429).json({ custom: 'limit message' });
      },
    }));
    app.get('/test', (_req, res) => res.json({ ok: true }));

    await request(app).get('/test');
    const res = await request(app).get('/test');

    expect(res.status).toBe(429);
    expect(res.body.custom).toBe('limit message');
  });
});

// ═══════════════════════════════════════════════════════════════════
// Express Middleware: createAddressRateLimiter
// ═══════════════════════════════════════════════════════════════════

describe('createAddressRateLimiter middleware', () => {
  function createTestApp(maxRequests: number, windowMs: number) {
    const app = express();
    app.use(express.json());
    app.post('/register', createAddressRateLimiter({ maxRequests, windowMs }), (_req, res) => {
      res.status(201).json({ success: true });
    });
    return app;
  }

  it('should pass requests within limit', async () => {
    const app = createTestApp(3, 60000);

    for (let i = 0; i < 3; i++) {
      const res = await request(app)
        .post('/register')
        .send({ address: 'aleo1test' });
      expect(res.status).toBe(201);
    }
  });

  it('should return 429 after limit exceeded', async () => {
    const app = createTestApp(2, 60000);

    await request(app).post('/register').send({ address: 'aleo1test' });
    await request(app).post('/register').send({ address: 'aleo1test' });

    const res = await request(app).post('/register').send({ address: 'aleo1test' });
    expect(res.status).toBe(429);
    expect(res.body.error).toContain('Too many');
  });

  it('should set Retry-After header on 429', async () => {
    const app = createTestApp(1, 60000);

    await request(app).post('/register').send({ address: 'aleo1test' });
    const res = await request(app).post('/register').send({ address: 'aleo1test' });

    expect(res.status).toBe(429);
    expect(res.headers['retry-after']).toBeDefined();
  });

  it('should set X-RateLimit-* headers on all responses', async () => {
    const app = createTestApp(5, 60000);

    const res = await request(app).post('/register').send({ address: 'aleo1headers_test' });
    expect(res.status).toBe(201);
    expect(res.headers['x-ratelimit-limit']).toBe('5');
    expect(res.headers['x-ratelimit-remaining']).toBeDefined();
    expect(res.headers['x-ratelimit-reset']).toBeDefined();
  });
});

// ═══════════════════════════════════════════════════════════════════
// Redis-Backed Fixed Window Limiter
// ═══════════════════════════════════════════════════════════════════

describe('RedisBackedFixedWindowLimiter', () => {
  function createMockRedis(connected = true): RedisRateLimitAdapter {
    const counters = new Map<string, number>();
    return {
      increment: jest.fn(async (cat, key) => {
        const k = `${cat}:${key}`;
        const v = (counters.get(k) || 0) + 1;
        counters.set(k, v);
        return v;
      }),
      getCount: jest.fn(async (cat, key) => counters.get(`${cat}:${key}`) || 0),
      reset: jest.fn(async (cat, key) => {
        counters.delete(`${cat}:${key}`);
        return true;
      }),
      isAvailable: jest.fn(() => connected),
    };
  }

  it('should use Redis when available (checkAsync)', async () => {
    const redis = createMockRedis(true);
    const limiter = new RedisBackedFixedWindowLimiter(
      { maxRequests: 3, windowMs: 60000, category: 'test' },
      redis,
    );

    const r1 = await limiter.checkAsync('user1');
    expect(r1.allowed).toBe(true);
    expect(r1.remaining).toBe(2);
    expect(redis.increment).toHaveBeenCalledWith('test', 'user1', 60000);
  });

  it('should deny after exceeding limit via Redis', async () => {
    const redis = createMockRedis(true);
    const limiter = new RedisBackedFixedWindowLimiter(
      { maxRequests: 2, windowMs: 60000, category: 'test' },
      redis,
    );

    await limiter.checkAsync('user1');
    await limiter.checkAsync('user1');
    const r3 = await limiter.checkAsync('user1');

    expect(r3.allowed).toBe(false);
    expect(r3.remaining).toBe(0);
  });

  it('should fall back to in-memory when Redis is unavailable', async () => {
    const redis = createMockRedis(false);
    const limiter = new RedisBackedFixedWindowLimiter(
      { maxRequests: 2, windowMs: 60000, category: 'test' },
      redis,
    );

    const r1 = await limiter.checkAsync('user1');
    expect(r1.allowed).toBe(true);
    expect(redis.increment).not.toHaveBeenCalled();
  });

  it('should fall back on Redis error', async () => {
    const redis = createMockRedis(true);
    (redis.increment as jest.Mock).mockRejectedValue(new Error('Redis down'));

    const limiter = new RedisBackedFixedWindowLimiter(
      { maxRequests: 2, windowMs: 60000, category: 'test' },
      redis,
    );

    // Should not throw — falls back to in-memory
    const result = await limiter.checkAsync('user1');
    expect(result.allowed).toBe(true);
  });

  it('should use in-memory for sync check()', () => {
    const redis = createMockRedis(true);
    const limiter = new RedisBackedFixedWindowLimiter(
      { maxRequests: 2, windowMs: 60000, category: 'test' },
      redis,
    );

    const r1 = limiter.check('user1');
    expect(r1.allowed).toBe(true);
    // Sync check should NOT call Redis
    expect(redis.increment).not.toHaveBeenCalled();
  });

  it('should reset both Redis and in-memory', () => {
    const redis = createMockRedis(true);
    const limiter = new RedisBackedFixedWindowLimiter(
      { maxRequests: 2, windowMs: 60000, category: 'test' },
      redis,
    );

    limiter.check('user1');
    limiter.reset('user1');

    expect(redis.reset).toHaveBeenCalledWith('test', 'user1');
  });
});

// ═══════════════════════════════════════════════════════════════════
// createRedisAdapter
// ═══════════════════════════════════════════════════════════════════

describe('createRedisAdapter', () => {
  it('should create an adapter from a RedisService-like object', () => {
    const mockService = {
      incrementRateLimit: jest.fn().mockResolvedValue(1),
      getRateLimitCount: jest.fn().mockResolvedValue(0),
      resetRateLimit: jest.fn().mockResolvedValue(true),
      isConnected: jest.fn().mockReturnValue(true),
    };

    const adapter = createRedisAdapter(mockService);

    expect(adapter.isAvailable()).toBe(true);
    adapter.increment('test', 'key', 60000);
    expect(mockService.incrementRateLimit).toHaveBeenCalledWith('test', 'key', 60000);
  });
});
