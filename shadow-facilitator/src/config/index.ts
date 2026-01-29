import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3001', 10),

  aleo: {
    network: process.env.ALEO_NETWORK || 'testnet',
    rpcUrl: process.env.ALEO_RPC_URL || 'https://api.explorer.aleo.org/v1',
    programId: 'shadow_agent.aleo',
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

export function validateConfig(): void {
  if (!config.aleo.rpcUrl) {
    throw new Error('ALEO_RPC_URL is required');
  }
}
