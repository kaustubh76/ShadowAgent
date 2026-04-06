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
import jobsRouter from './routes/jobs';
import { x402Middleware } from './middleware/x402';
import { createGlobalRateLimiter } from './middleware/rateLimiter';
import { indexerService } from './services/indexer';
import { getRedisService } from './services/redis';
import { config, validateConfig } from './config';
import { installShutdownHandlers, onShutdown } from './utils/shutdown';

dotenv.config();
validateConfig();

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
// Helmet must allow cross-origin requests — disable conflicting policies
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: false,
}));

// CORS — allow Vercel frontend + localhost dev
const corsOriginEnv = process.env.CORS_ORIGIN;
const corsOrigin = !corsOriginEnv || corsOriginEnv === '*'
  ? true  // `true` reflects the request origin (like '*' but works with credentials)
  : corsOriginEnv.split(',').map(s => s.trim());
app.use(cors({
  origin: corsOrigin,
  methods: ['GET', 'POST', 'PATCH', 'OPTIONS'],
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
  credentials: true,
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
app.use('/jobs', jobsRouter);

// x402 protected example endpoint
app.use('/api', x402Middleware({ pricePerRequest: 100000 }));
app.get('/api/example', (req, res) => {
  res.json({
    message: 'Payment verified! Here is your response.',
    timestamp: new Date().toISOString(),
  });
});

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const requestId = (req as express.Request & { id?: string }).id;
  logger.error('Unhandled error', { error: err.message, stack: err.stack, requestId });
  res.status(500).json({
    error: 'Internal server error',
    request_id: requestId,
    message: process.env.NODE_ENV === 'development' ? err.message : undefined,
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

// Install graceful shutdown handlers (SIGTERM, SIGINT)
installShutdownHandlers();

// Start server — bind to 0.0.0.0 so Render/Docker can route external traffic
const server = app.listen(Number(PORT), '0.0.0.0', async () => {
  logger.info(`ShadowAgent Facilitator running on port ${PORT}`);
  logger.info(`Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`Network: ${process.env.ALEO_NETWORK || 'testnet'}`);
  logger.info(`Program ID: ${process.env.PROGRAM_ID || 'shadow_agent.aleo'}`);
  logger.info(`RPC URL: ${process.env.ALEO_RPC_URL || 'https://api.explorer.aleo.org/v1'}`);

  // Log environment warnings
  for (const warning of envWarnings) {
    logger.warn(warning);
  }

  // Check Redis connectivity (non-blocking)
  const redis = getRedisService();
  try {
    await redis.connect();
    logger.info('Redis: connected');
  } catch {
    logger.warn('Redis: unavailable, using in-memory fallback');
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

  // Seed known agents directly into cache (bypasses on-chain BHP256 hash lookup)
  // Format: address:service_type:tier (e.g., "aleo1abc...:1:2,aleo1def...:3:0")
  // Tier is optional — defaults to 0 (New) for backward compatibility
  const seedAgents = process.env.SEED_AGENTS;
  if (seedAgents) {
    const entries = seedAgents.split(',').map(e => e.trim()).filter(Boolean);
    for (const entry of entries) {
      const parts = entry.split(':');
      const address = parts[0];
      const serviceTypeStr = parts[1] || '1';
      const tierStr = parts[2];
      const trimmedAddress = address?.trim();
      if (trimmedAddress && trimmedAddress.startsWith('aleo1') && trimmedAddress.length >= 50) {
        const parsedType = parseInt(serviceTypeStr, 10);
        const parsedTier = tierStr !== undefined ? parseInt(tierStr, 10) : 0;
        if (!Number.isFinite(parsedType) || parsedType < 0 || parsedType > 7) {
          logger.warn(`Skipping seed agent ${trimmedAddress}: invalid service_type ${serviceTypeStr}`);
          continue;
        }
        if (!Number.isFinite(parsedTier) || parsedTier < 0 || parsedTier > 4) {
          logger.warn(`Skipping seed agent ${trimmedAddress}: invalid tier ${tierStr}`);
          continue;
        }
        indexerService.cacheAgent({
          agent_id: trimmedAddress,
          service_type: parsedType,
          endpoint_hash: '',
          tier: parsedTier as import('./types').Tier,
          is_active: true,
          registered_at: Date.now() - Math.floor(Math.random() * 7 * 86_400_000),
        }, true);
        logger.info(`Seeded agent: ${trimmedAddress} (type=${parsedType}, tier=${parsedTier})`);
      } else if (trimmedAddress) {
        logger.warn(`Skipping seed agent with invalid address: ${trimmedAddress}`);
      }
    }
  }

  // Seed jobs on startup (JSON array from SEED_JOBS env var)
  const seedJobsEnv = process.env.SEED_JOBS;
  if (seedJobsEnv) {
    try {
      const jobDefs = JSON.parse(seedJobsEnv);
      if (Array.isArray(jobDefs)) {
        const { seedJobs } = await import('./routes/jobs');
        const count = seedJobs(jobDefs);
        logger.info(`Seeded ${count} jobs`);
      }
    } catch (err) {
      logger.error('Failed to parse SEED_JOBS:', err);
    }
  }

  // Seed demo data (ratings, sessions, disputes, refunds, policies, multi-sig)
  // Always seed — in-memory stores are empty on every restart
  if (process.env.SKIP_DEMO_SEED !== 'true') {
    try {
      const { seedDemoData } = await import('./seedData');
      await seedDemoData(Number(PORT));
      logger.info('Demo data seeded (ratings, sessions, disputes, refunds, policies)');
    } catch (err) {
      logger.warn('Demo data seeding failed (non-critical):', err);
    }
  }

  // Print startup readiness summary
  const redisStatus = redis.isConnected() ? 'connected' : 'in-memory fallback';
  const cachedCount = indexerService.getStats().cachedAgents;
  const lines = [
    '',
    '  ┌─────────────────────────────────────────────┐',
    '  │     ShadowAgent Facilitator Ready            │',
    '  ├─────────────────────────────────────────────┤',
    `  │  Server:      http://0.0.0.0:${PORT}             │`,
    `  │  Environment: ${(process.env.NODE_ENV || 'development').padEnd(29)}│`,
    `  │  Network:     ${(process.env.ALEO_NETWORK || 'testnet').padEnd(29)}│`,
    `  │  Redis:       ${redisStatus.padEnd(29)}│`,
    `  │  Agents:      ${String(cachedCount + ' cached').padEnd(29)}│`,
    '  └─────────────────────────────────────────────┘',
    '',
  ];
  for (const line of lines) {
    logger.info(line);
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
