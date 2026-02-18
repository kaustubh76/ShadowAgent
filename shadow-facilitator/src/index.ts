// ShadowAgent Facilitator Service
// HTTP to Aleo bridge for x402 payments and discovery

import express from 'express';
import crypto from 'crypto';
import cors from 'cors';
import helmet from 'helmet';
import dotenv from 'dotenv';
import { createLogger, format, transports } from 'winston';

import agentsRouter from './routes/agents';
import verifyRouter from './routes/verify';
import healthRouter from './routes/health';
import refundsRouter from './routes/refunds';
import disputesRouter from './routes/disputes';
import multisigRouter from './routes/multisig';
import sessionsRouter from './routes/sessions';
import { x402Middleware } from './middleware/x402';
import { createGlobalRateLimiter } from './middleware/rateLimiter';
import { indexerService } from './services/indexer';
import { getRedisService } from './services/redis';
import { config } from './config';
import { installShutdownHandlers, onShutdown } from './utils/shutdown';

dotenv.config();

// Validate required environment variables
function validateEnv() {
  const warnings: string[] = [];

  if (!process.env.ALEO_RPC_URL) {
    warnings.push('ALEO_RPC_URL not set, using default: https://api.explorer.aleo.org/v1');
  }
  if (!process.env.PROGRAM_ID) {
    warnings.push('PROGRAM_ID not set, using default: shadow_agent.aleo');
  }

  return warnings;
}

const envWarnings = validateEnv();

// Logger setup
export const logger = createLogger({
  level: process.env.LOG_LEVEL || 'info',
  format: format.combine(
    format.timestamp(),
    format.errors({ stack: true }),
    format.json()
  ),
  transports: [
    new transports.Console({
      format: format.combine(
        format.colorize(),
        format.simple()
      ),
    }),
  ],
});

// Express app
const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Escrow-Proof', 'X-Job-Hash'],
  exposedHeaders: [
    'X-Delivery-Secret',
    'X-Job-Id',
    'X-Job-Hash',
    'X-Payment-Required',
    'X-Payment-Network',
    'Payment-Required',
    'X-RateLimit-Limit',
    'X-RateLimit-Remaining',
    'X-RateLimit-Reset',
    'X-Request-ID',
    'Retry-After',
  ],
}));
app.use(express.json({ limit: '100kb' }));

// X-Request-ID — attach a unique ID to every request for tracing
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
  (req as express.Request & { id?: string }).id = requestId;
  next();
});

// Request timeout — 30s default, prevents hanging connections
const REQUEST_TIMEOUT_MS = parseInt(process.env.REQUEST_TIMEOUT_MS || '30000', 10);
app.use((req, res, next) => {
  req.setTimeout(REQUEST_TIMEOUT_MS, () => {
    if (!res.headersSent) {
      res.status(408).json({ error: 'Request timeout' });
    }
  });
  next();
});

// Health endpoint — exempt from rate limiting (used by load balancers / monitoring)
app.use('/health', healthRouter);

// Global rate limiter (Token Bucket) — applies to all routes below
app.use(createGlobalRateLimiter({
  maxRequests: config.rateLimit.global.maxRequests,
  windowMs: config.rateLimit.global.windowMs,
  message: 'Too many requests from this IP, please try again later',
  onLimitReached: (req, res) => {
    logger.warn(`Global rate limit exceeded for IP ${req.ip}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later',
    });
  },
}));

// Request logging
app.use((req, res, next) => {
  const requestId = (req as express.Request & { id?: string }).id;
  logger.info(`${req.method} ${req.path}`, {
    ip: req.ip,
    requestId,
    userAgent: req.get('user-agent'),
  });
  next();
});

// Routes
app.use('/agents', agentsRouter);
app.use('/verify', verifyRouter);
app.use('/refunds', refundsRouter);
app.use('/disputes', disputesRouter);
app.use('/escrows/multisig', multisigRouter);
app.use('/sessions', sessionsRouter);

// x402 protected example endpoint
app.use('/api', x402Middleware({ pricePerRequest: 100000 }));
app.get('/api/example', (req, res) => {
  res.json({
    message: 'Payment verified! Here is your response.',
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
  logger.error('Unhandled error', { error: err.message, stack: err.stack });
  res.status(500).json({
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Install graceful shutdown handlers (SIGTERM, SIGINT)
installShutdownHandlers();

// Start server
const server = app.listen(PORT, async () => {
  logger.info(`ShadowAgent Facilitator running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Network: ${process.env.ALEO_NETWORK || 'testnet'}`);
  logger.info(`Program ID: ${process.env.PROGRAM_ID || 'shadow_agent.aleo'}`);
  logger.info(`RPC URL: ${process.env.ALEO_RPC_URL || 'https://api.explorer.aleo.org/v1'}`);

  // Log environment warnings
  for (const warning of envWarnings) {
    logger.warn(warning);
  }

  // Start background indexer
  indexerService.startIndexing();

  // Import initial agents from config if provided
  const initialAgents = process.env.INITIAL_AGENT_IDS;
  if (initialAgents) {
    const agentIds = initialAgents.split(',').map(id => id.trim()).filter(Boolean);
    if (agentIds.length > 0) {
      logger.info(`Importing ${agentIds.length} initial agents from config...`);
      await indexerService.importAgents(agentIds);
    }
  }
});

// Register shutdown cleanup in dependency order (LIFO — last registered runs first)
onShutdown('HTTP server', () => {
  return new Promise<void>((resolve) => {
    server.close(() => resolve());
  });
});
onShutdown('Background indexer', () => indexerService.stopIndexing());
onShutdown('Redis connection', async () => {
  const redis = getRedisService();
  if (redis.isConnected()) {
    await redis.disconnect();
  }
});

export default app;
