import dotenv from 'dotenv';
import { existsSync } from 'fs';

// Load .env first, then .env.production as fallback (for Render where .env is gitignored)
dotenv.config();
if (existsSync('.env.production')) {
  dotenv.config({ path: '.env.production', override: false });
}

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  aleo: {
    network: process.env.ALEO_NETWORK || 'testnet',
    rpcUrl: process.env.ALEO_RPC_URL || 'https://api.explorer.aleo.org/v1',
    programId: 'shadow_agent.aleo',
  },

  rateLimit: {
    // Global HTTP rate limiting (Token Bucket) — per IP
    global: {
      windowMs: parseInt(process.env.RATE_LIMIT_GLOBAL_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_GLOBAL_MAX || '100', 10),
    },
    // Session-based rate limiting (Sliding Window Counter) — per session
    session: {
      windowMs: parseInt(process.env.RATE_LIMIT_SESSION_WINDOW_MS || '600000', 10), // 10min = ~100 blocks
    },
    // Per-address operations (Fixed Window Counter)
    perAddress: {
      registration: {
        windowMs: parseInt(process.env.RATE_LIMIT_REGISTER_WINDOW_MS || '3600000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_REGISTER_MAX || '5', 10),
      },
      rating: {
        windowMs: parseInt(process.env.RATE_LIMIT_RATING_WINDOW_MS || '60000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_RATING_MAX || '10', 10),
      },
      dispute: {
        windowMs: parseInt(process.env.RATE_LIMIT_DISPUTE_WINDOW_MS || '3600000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_DISPUTE_MAX || '3', 10),
      },
      refund: {
        windowMs: parseInt(process.env.RATE_LIMIT_REFUND_WINDOW_MS || '3600000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_REFUND_MAX || '5', 10),
      },
      multisig: {
        windowMs: parseInt(process.env.RATE_LIMIT_MULTISIG_WINDOW_MS || '60000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_MULTISIG_MAX || '10', 10),
      },
      job: {
        windowMs: parseInt(process.env.RATE_LIMIT_JOB_WINDOW_MS || '60000', 10),
        maxRequests: parseInt(process.env.RATE_LIMIT_JOB_MAX || '10', 10),
      },
    },
    // x402 payment generation rate limiting (Token Bucket) — per IP
    x402: {
      windowMs: parseInt(process.env.RATE_LIMIT_X402_WINDOW_MS || '60000', 10),
      maxRequests: parseInt(process.env.RATE_LIMIT_X402_MAX || '20', 10),
    },
  },

  consistentHash: {
    virtualNodes: parseInt(process.env.CONSISTENT_HASH_VNODES || '150', 10),
    replicationFactor: parseInt(process.env.CONSISTENT_HASH_REPLICATION || '1', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export function validateConfig(): void {
  if (!config.aleo.rpcUrl) {
    throw new Error('ALEO_RPC_URL is required');
  }

  // Validate rate limit values are positive and finite (parseInt on invalid env vars returns NaN)
  const rateLimits = [
    { name: 'global.windowMs', value: config.rateLimit.global.windowMs },
    { name: 'global.maxRequests', value: config.rateLimit.global.maxRequests },
    { name: 'session.windowMs', value: config.rateLimit.session.windowMs },
    { name: 'x402.windowMs', value: config.rateLimit.x402.windowMs },
    { name: 'x402.maxRequests', value: config.rateLimit.x402.maxRequests },
  ];
  for (const { name, value } of rateLimits) {
    if (!Number.isFinite(value) || value <= 0) {
      throw new Error(`Invalid rate limit config: ${name} must be a positive number, got ${value}`);
    }
  }
}
