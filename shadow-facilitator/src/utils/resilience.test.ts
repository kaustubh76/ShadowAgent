// Resilience Utilities Tests

import {
  calculateBackoffDelay,
  withRetry,
  CircuitBreaker,
  CircuitOpenError,
} from './resilience';

describe('calculateBackoffDelay', () => {
  it('should increase delay exponentially', () => {
    // With no jitter, delay = baseDelay * 2^attempt
    const d0 = calculateBackoffDelay(0, 1000, 30000, 0);
    const d1 = calculateBackoffDelay(1, 1000, 30000, 0);
    const d2 = calculateBackoffDelay(2, 1000, 30000, 0);

    expect(d0).toBe(1000);
    expect(d1).toBe(2000);
    expect(d2).toBe(4000);
  });

  it('should cap at maxDelayMs', () => {
    const delay = calculateBackoffDelay(10, 1000, 5000, 0);
    expect(delay).toBe(5000);
  });

  it('should apply jitter within range', () => {
    // With jitter=0.3, delay should be within [0.7x, 1.3x] of exponential delay
    const results: number[] = [];
    for (let i = 0; i < 100; i++) {
      results.push(calculateBackoffDelay(0, 1000, 30000, 0.3));
    }

    const min = Math.min(...results);
    const max = Math.max(...results);

    expect(min).toBeGreaterThanOrEqual(700);
    expect(max).toBeLessThanOrEqual(1300);
  });
});

describe('withRetry', () => {
  it('should return result on first success', async () => {
    const fn = jest.fn().mockResolvedValue('ok');
    const result = await withRetry(fn, { maxRetries: 3 });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(1);
  });

  it('should retry on failure and succeed eventually', async () => {
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail1'))
      .mockRejectedValueOnce(new Error('fail2'))
      .mockResolvedValue('ok');

    const result = await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10, // Very short for testing
    });

    expect(result).toBe('ok');
    expect(fn).toHaveBeenCalledTimes(3);
  });

  it('should throw after exhausting all retries', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('always fails'));

    await expect(withRetry(fn, {
      maxRetries: 2,
      baseDelayMs: 10,
    })).rejects.toThrow('always fails');

    expect(fn).toHaveBeenCalledTimes(3); // initial + 2 retries
  });

  it('should call onRetry callback before each retry', async () => {
    const onRetry = jest.fn();
    const fn = jest.fn()
      .mockRejectedValueOnce(new Error('fail'))
      .mockResolvedValue('ok');

    await withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      onRetry,
    });

    expect(onRetry).toHaveBeenCalledTimes(1);
    expect(onRetry).toHaveBeenCalledWith(
      expect.any(Error),
      1, // attempt number
      expect.any(Number), // delay
    );
  });

  it('should respect shouldRetry predicate', async () => {
    const fn = jest.fn().mockRejectedValue(new Error('non-retryable'));

    await expect(withRetry(fn, {
      maxRetries: 3,
      baseDelayMs: 10,
      shouldRetry: () => false,
    })).rejects.toThrow('non-retryable');

    expect(fn).toHaveBeenCalledTimes(1); // No retries
  });

  it('should handle non-Error throws', async () => {
    const fn = jest.fn().mockRejectedValue('string error');

    await expect(withRetry(fn, {
      maxRetries: 1,
      baseDelayMs: 10,
    })).rejects.toThrow('string error');
  });
});

describe('CircuitBreaker', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should start in closed state', () => {
    const cb = new CircuitBreaker();
    expect(cb.getState()).toBe('closed');
  });

  it('should allow requests in closed state', async () => {
    const cb = new CircuitBreaker();
    const result = await cb.execute(async () => 'ok');
    expect(result).toBe('ok');
  });

  it('should trip to open after failure threshold', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    for (let i = 0; i < 3; i++) {
      await expect(cb.execute(async () => { throw new Error('fail'); }))
        .rejects.toThrow('fail');
    }

    expect(cb.getState()).toBe('open');
  });

  it('should reject immediately when circuit is open', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 60000 });

    // Trip the breaker
    await expect(cb.execute(async () => { throw new Error('fail'); }))
      .rejects.toThrow('fail');

    // Should get CircuitOpenError
    await expect(cb.execute(async () => 'ok'))
      .rejects.toThrow(CircuitOpenError);
  });

  it('should transition to half-open after reset timeout', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });

    await expect(cb.execute(async () => { throw new Error('fail'); }))
      .rejects.toThrow('fail');

    expect(cb.getState()).toBe('open');

    jest.advanceTimersByTime(5001);

    expect(cb.getState()).toBe('half-open');
  });

  it('should close circuit on success in half-open state', async () => {
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5000,
      halfOpenSuccessThreshold: 1,
    });

    // Trip it
    await expect(cb.execute(async () => { throw new Error('fail'); }))
      .rejects.toThrow();

    jest.advanceTimersByTime(5001);
    expect(cb.getState()).toBe('half-open');

    // Succeed in half-open → closed
    const result = await cb.execute(async () => 'recovered');
    expect(result).toBe('recovered');
    expect(cb.getState()).toBe('closed');
  });

  it('should reopen on failure in half-open state', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1, resetTimeoutMs: 5000 });

    // Trip it
    await expect(cb.execute(async () => { throw new Error('fail'); }))
      .rejects.toThrow();

    jest.advanceTimersByTime(5001);
    expect(cb.getState()).toBe('half-open');

    // Fail again in half-open → back to open
    await expect(cb.execute(async () => { throw new Error('still down'); }))
      .rejects.toThrow('still down');

    expect(cb.getState()).toBe('open');
  });

  it('should reset failure count on success in closed state', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    // 2 failures
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

    // 1 success resets count
    await cb.execute(async () => 'ok');

    // 2 more failures should NOT trip (count was reset)
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

    expect(cb.getState()).toBe('closed');
  });

  it('should call onStateChange callback', async () => {
    const onStateChange = jest.fn();
    const cb = new CircuitBreaker({
      failureThreshold: 1,
      resetTimeoutMs: 5000,
      onStateChange,
    });

    // Trip to open
    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(onStateChange).toHaveBeenCalledWith('closed', 'open');

    // Wait for half-open
    jest.advanceTimersByTime(5001);
    cb.getState();
    expect(onStateChange).toHaveBeenCalledWith('open', 'half-open');

    // Succeed → closed
    await cb.execute(async () => 'ok');
    expect(onStateChange).toHaveBeenCalledWith('half-open', 'closed');
  });

  it('should manually reset', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 1 });

    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();
    expect(cb.getState()).toBe('open');

    cb.reset();
    expect(cb.getState()).toBe('closed');
  });

  it('should return stats', async () => {
    const cb = new CircuitBreaker({ failureThreshold: 3 });

    await expect(cb.execute(async () => { throw new Error('fail'); })).rejects.toThrow();

    const stats = cb.getStats();
    expect(stats.state).toBe('closed');
    expect(stats.failureCount).toBe(1);
    expect(stats.lastFailureTime).toBeGreaterThan(0);
  });
});
