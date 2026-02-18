// Resilience Utilities: Exponential Backoff with Jitter + Circuit Breaker
//
// - Exponential backoff prevents thundering herd on retry
// - Jitter decorrelates retries from multiple clients
// - Circuit breaker stops wasting resources on a down service

// ═══════════════════════════════════════════════════════════════════
// Exponential Backoff with Jitter
// ═══════════════════════════════════════════════════════════════════

export interface RetryOptions {
  /** Maximum number of retry attempts (default: 3) */
  maxRetries?: number;
  /** Base delay in ms (default: 1000) */
  baseDelayMs?: number;
  /** Maximum delay in ms — caps exponential growth (default: 30000) */
  maxDelayMs?: number;
  /** Jitter factor 0-1 — fraction of delay that is randomized (default: 0.3) */
  jitterFactor?: number;
  /** Only retry on these error types. If empty, retries all errors. */
  retryableErrors?: Array<new (...args: unknown[]) => Error>;
  /** Predicate to decide if an error is retryable (overrides retryableErrors) */
  shouldRetry?: (error: Error, attempt: number) => boolean;
  /** Called before each retry with the error and delay */
  onRetry?: (error: Error, attempt: number, delayMs: number) => void;
}

/**
 * Calculate delay for a given attempt using exponential backoff + jitter.
 * Formula: min(maxDelay, baseDelay * 2^attempt) * (1 - jitter + random*jitter)
 */
export function calculateBackoffDelay(
  attempt: number,
  baseDelayMs: number,
  maxDelayMs: number,
  jitterFactor: number,
): number {
  const exponentialDelay = Math.min(maxDelayMs, baseDelayMs * Math.pow(2, attempt));
  const jitter = 1 - jitterFactor + Math.random() * jitterFactor * 2;
  return Math.floor(exponentialDelay * jitter);
}

/**
 * Execute an async function with exponential backoff retry.
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {},
): Promise<T> {
  const {
    maxRetries = 3,
    baseDelayMs = 1000,
    maxDelayMs = 30_000,
    jitterFactor = 0.3,
    shouldRetry,
    onRetry,
  } = options;

  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // Last attempt — don't retry
      if (attempt >= maxRetries) break;

      // Check if we should retry this error
      if (shouldRetry && !shouldRetry(lastError, attempt)) break;

      const delay = calculateBackoffDelay(attempt, baseDelayMs, maxDelayMs, jitterFactor);
      onRetry?.(lastError, attempt + 1, delay);

      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  throw lastError!;
}

// ═══════════════════════════════════════════════════════════════════
// Circuit Breaker
// ═══════════════════════════════════════════════════════════════════

export type CircuitState = 'closed' | 'open' | 'half-open';

export interface CircuitBreakerOptions {
  /** Number of consecutive failures to trip the breaker (default: 5) */
  failureThreshold?: number;
  /** How long to stay open before trying half-open, in ms (default: 60000) */
  resetTimeoutMs?: number;
  /** Number of successful requests in half-open to close the circuit (default: 1) */
  halfOpenSuccessThreshold?: number;
  /** Called when circuit state changes */
  onStateChange?: (from: CircuitState, to: CircuitState) => void;
}

export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private failureCount = 0;
  private successCount = 0;
  private lastFailureTime = 0;
  private failureThreshold: number;
  private resetTimeoutMs: number;
  private halfOpenSuccessThreshold: number;
  private onStateChange?: (from: CircuitState, to: CircuitState) => void;

  constructor(options: CircuitBreakerOptions = {}) {
    this.failureThreshold = options.failureThreshold ?? 5;
    this.resetTimeoutMs = options.resetTimeoutMs ?? 60_000;
    this.halfOpenSuccessThreshold = options.halfOpenSuccessThreshold ?? 1;
    this.onStateChange = options.onStateChange;
  }

  /**
   * Execute a function through the circuit breaker.
   * Throws CircuitOpenError if the circuit is open.
   */
  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      // Check if enough time has passed to try half-open
      if (Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
        this.transition('half-open');
      } else {
        throw new CircuitOpenError(
          `Circuit breaker is open. Retry after ${Math.ceil((this.lastFailureTime + this.resetTimeoutMs - Date.now()) / 1000)}s`
        );
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    if (this.state === 'half-open') {
      this.successCount++;
      if (this.successCount >= this.halfOpenSuccessThreshold) {
        this.transition('closed');
      }
    } else {
      // Reset failure count on any success in closed state
      this.failureCount = 0;
    }
  }

  private onFailure(): void {
    this.lastFailureTime = Date.now();

    if (this.state === 'half-open') {
      // Any failure in half-open trips back to open
      this.transition('open');
      return;
    }

    this.failureCount++;
    if (this.failureCount >= this.failureThreshold) {
      this.transition('open');
    }
  }

  private transition(to: CircuitState): void {
    if (this.state === to) return;
    const from = this.state;
    this.state = to;

    if (to === 'closed') {
      this.failureCount = 0;
      this.successCount = 0;
    } else if (to === 'half-open') {
      this.successCount = 0;
    }

    this.onStateChange?.(from, to);
  }

  /** Get the current circuit state. */
  getState(): CircuitState {
    // Auto-check for half-open transition
    if (this.state === 'open' && Date.now() - this.lastFailureTime >= this.resetTimeoutMs) {
      this.transition('half-open');
    }
    return this.state;
  }

  /** Manually reset the circuit breaker to closed state. */
  reset(): void {
    this.transition('closed');
  }

  /** Get circuit breaker stats. */
  getStats(): {
    state: CircuitState;
    failureCount: number;
    successCount: number;
    lastFailureTime: number;
  } {
    return {
      state: this.getState(),
      failureCount: this.failureCount,
      successCount: this.successCount,
      lastFailureTime: this.lastFailureTime,
    };
  }
}

export class CircuitOpenError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CircuitOpenError';
  }
}
