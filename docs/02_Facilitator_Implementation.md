# ShadowAgent Facilitator Service Implementation Guide

## Overview

The Facilitator is an off-chain service that bridges HTTP requests with Aleo blockchain operations. It handles:
- x402 payment protocol negotiation
- Agent discovery and indexing
- Proof verification relay
- Transaction broadcasting

---

## 1. Project Setup

### 1.1 Initialize Node.js Project

```bash
mkdir shadow-facilitator
cd shadow-facilitator

# Initialize with TypeScript
npm init -y
npm install typescript ts-node @types/node --save-dev
npx tsc --init

# Install dependencies
npm install express cors helmet dotenv winston
npm install @aleohq/sdk axios
npm install --save-dev @types/express @types/cors
```

### 1.2 Project Structure

```
shadow-facilitator/
├── src/
│   ├── index.ts              # Entry point
│   ├── config/
│   │   └── index.ts          # Configuration
│   ├── routes/
│   │   ├── agents.ts         # Discovery endpoints
│   │   ├── verify.ts         # Proof verification
│   │   └── health.ts         # Health checks
│   ├── services/
│   │   ├── aleo.ts           # Aleo SDK wrapper
│   │   ├── indexer.ts        # Agent listing indexer
│   │   └── cache.ts          # Redis/memory cache
│   ├── middleware/
│   │   ├── x402.ts           # x402 protocol handler
│   │   ├── auth.ts           # API authentication
│   │   └── rateLimit.ts      # Rate limiting
│   ├── types/
│   │   └── index.ts          # TypeScript types
│   └── utils/
│       └── logger.ts         # Logging utility
├── tests/
├── package.json
├── tsconfig.json
├── .env.example
└── Dockerfile
```

### 1.3 TypeScript Configuration

```json
// tsconfig.json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests"]
}
```

---

## 2. Configuration Module

### 2.1 Environment Variables

```bash
# .env.example
NODE_ENV=development
PORT=3000

# Aleo Network
ALEO_NETWORK=testnet
ALEO_RPC_URL=https://api.explorer.aleo.org/v1
ALEO_PRIVATE_KEY=your_private_key_here

# Database (optional, for production)
DATABASE_URL=postgresql://user:pass@localhost:5432/shadowagent

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379

# Rate Limiting
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# Logging
LOG_LEVEL=info
```

### 2.2 Configuration File

```typescript
// src/config/index.ts
import dotenv from 'dotenv';

dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '3000', 10),

  aleo: {
    network: process.env.ALEO_NETWORK || 'testnet',
    rpcUrl: process.env.ALEO_RPC_URL || 'https://api.explorer.aleo.org/v1',
    privateKey: process.env.ALEO_PRIVATE_KEY || '',
    programId: 'shadow_agent.aleo',
  },

  database: {
    url: process.env.DATABASE_URL,
  },

  redis: {
    url: process.env.REDIS_URL,
  },

  rateLimit: {
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || '60000', 10),
    maxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || '100', 10),
  },

  logging: {
    level: process.env.LOG_LEVEL || 'info',
  },
};

// Validate required config
export function validateConfig(): void {
  if (!config.aleo.privateKey && config.env === 'production') {
    throw new Error('ALEO_PRIVATE_KEY is required in production');
  }
}
```

---

## 3. Type Definitions

```typescript
// src/types/index.ts

// Agent listing from on-chain mapping
export interface PublicListing {
  agent_id: string;
  service_type: number;
  endpoint_hash: string;
  min_tier: number;
  is_active: boolean;
}

// Agent with resolved endpoint
export interface AgentListing extends PublicListing {
  endpoint?: string;  // Resolved from hash if available
}

// x402 Payment Terms
export interface PaymentTerms {
  price: number;           // Microcents
  network: string;         // "aleo:testnet" or "aleo:mainnet"
  address: string;         // Agent's Aleo address
  escrow_required: boolean;
  secret_hash?: string;    // For HTLC
  deadline_blocks?: number;
  description?: string;
}

// Escrow Proof (from client)
export interface EscrowProof {
  proof: string;           // Serialized Aleo proof
  nullifier: string;
  commitment: string;
}

// Reputation Proof (from agent)
export interface ReputationProof {
  proof_type: number;      // 1=Rating, 2=Jobs, 3=Revenue, 4=Tier
  threshold: number;
  proof: string;           // Serialized proof
  tier_proven: number;
  generated_at: number;
}

// API Response types
export interface AgentSearchParams {
  service_type?: number;
  min_tier?: number;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface AgentSearchResponse {
  agents: AgentListing[];
  total: number;
  limit: number;
  offset: number;
}

export interface VerifyResponse {
  valid: boolean;
  error?: string;
  tier?: number;
}
```

---

## 4. Aleo Service

### 4.1 SDK Wrapper

```typescript
// src/services/aleo.ts
import { Account, ProgramManager, AleoNetworkClient } from '@aleohq/sdk';
import { config } from '../config';
import { logger } from '../utils/logger';
import { PublicListing, EscrowProof, ReputationProof } from '../types';

export class AleoService {
  private client: AleoNetworkClient;
  private account: Account | null = null;
  private programManager: ProgramManager | null = null;

  constructor() {
    this.client = new AleoNetworkClient(config.aleo.rpcUrl);
  }

  async initialize(): Promise<void> {
    if (config.aleo.privateKey) {
      this.account = new Account({ privateKey: config.aleo.privateKey });
      this.programManager = new ProgramManager(
        config.aleo.rpcUrl,
        undefined,
        undefined
      );
      logger.info('Aleo service initialized with account');
    } else {
      logger.info('Aleo service initialized in read-only mode');
    }
  }

  // Get program from network
  async getProgram(): Promise<string | null> {
    try {
      const program = await this.client.getProgram(config.aleo.programId);
      return program;
    } catch (error) {
      logger.error('Failed to get program', { error });
      return null;
    }
  }

  // Get mapping value
  async getMappingValue(
    mappingName: string,
    key: string
  ): Promise<string | null> {
    try {
      const value = await this.client.getProgramMappingValue(
        config.aleo.programId,
        mappingName,
        key
      );
      return value;
    } catch (error) {
      logger.debug('Mapping value not found', { mappingName, key });
      return null;
    }
  }

  // Get agent listing from mapping
  async getAgentListing(agentId: string): Promise<PublicListing | null> {
    const value = await this.getMappingValue('agent_listings', agentId);
    if (!value) return null;

    return this.parsePublicListing(value);
  }

  // Parse on-chain struct to TypeScript object
  private parsePublicListing(raw: string): PublicListing {
    // Aleo returns struct as formatted string, parse it
    // Format: "{ agent_id: 123field, service_type: 1u8, ... }"
    const parsed = this.parseAleoStruct(raw);

    return {
      agent_id: parsed.agent_id,
      service_type: parseInt(parsed.service_type),
      endpoint_hash: parsed.endpoint_hash,
      min_tier: parseInt(parsed.min_tier),
      is_active: parsed.is_active === 'true',
    };
  }

  // Generic Aleo struct parser
  private parseAleoStruct(raw: string): Record<string, string> {
    const result: Record<string, string> = {};

    // Remove outer braces and whitespace
    const content = raw.replace(/^\s*\{|\}\s*$/g, '').trim();

    // Split by comma, then by colon
    const pairs = content.split(',').map(s => s.trim());

    for (const pair of pairs) {
      const [key, value] = pair.split(':').map(s => s.trim());
      if (key && value) {
        // Remove type suffixes (u8, u64, field, etc.)
        result[key] = value.replace(/(u8|u16|u32|u64|u128|field|address|bool)$/, '');
      }
    }

    return result;
  }

  // Verify escrow proof
  async verifyEscrowProof(
    proof: EscrowProof,
    expectedAgent: string,
    minAmount: number
  ): Promise<boolean> {
    try {
      // In production, verify the ZK proof on-chain or locally
      // For hackathon, do basic validation

      if (!proof.proof || !proof.nullifier || !proof.commitment) {
        return false;
      }

      // TODO: Implement actual proof verification using Aleo SDK
      // const isValid = await this.programManager.verifyProof(...);

      logger.info('Escrow proof verification', {
        expectedAgent,
        minAmount,
        hasProof: !!proof.proof,
      });

      return true; // Placeholder
    } catch (error) {
      logger.error('Escrow proof verification failed', { error });
      return false;
    }
  }

  // Verify reputation proof
  async verifyReputationProof(
    proof: ReputationProof,
    proofType: number,
    threshold: number
  ): Promise<{ valid: boolean; tier?: number }> {
    try {
      if (proof.proof_type !== proofType) {
        return { valid: false };
      }

      // TODO: Implement actual proof verification

      return {
        valid: true,
        tier: proof.tier_proven,
      };
    } catch (error) {
      logger.error('Reputation proof verification failed', { error });
      return { valid: false };
    }
  }

  // Get current block height
  async getBlockHeight(): Promise<number> {
    try {
      const height = await this.client.getLatestHeight();
      return height;
    } catch (error) {
      logger.error('Failed to get block height', { error });
      return 0;
    }
  }
}

// Singleton instance
export const aleoService = new AleoService();
```

---

## 5. Agent Indexer Service

### 5.1 Indexer Implementation

```typescript
// src/services/indexer.ts
import { aleoService } from './aleo';
import { logger } from '../utils/logger';
import { AgentListing, AgentSearchParams } from '../types';

// In-memory cache for hackathon (use Redis/DB for production)
let agentCache: Map<string, AgentListing> = new Map();
let lastIndexBlock: number = 0;

export class IndexerService {
  private isIndexing: boolean = false;
  private indexInterval: NodeJS.Timeout | null = null;

  // Start background indexing
  start(intervalMs: number = 30000): void {
    logger.info('Starting agent indexer', { intervalMs });

    // Initial index
    this.indexAgents();

    // Periodic re-index
    this.indexInterval = setInterval(() => {
      this.indexAgents();
    }, intervalMs);
  }

  stop(): void {
    if (this.indexInterval) {
      clearInterval(this.indexInterval);
      this.indexInterval = null;
    }
  }

  // Index agents from on-chain mappings
  async indexAgents(): Promise<void> {
    if (this.isIndexing) return;
    this.isIndexing = true;

    try {
      const currentBlock = await aleoService.getBlockHeight();

      // For hackathon: scan known agent IDs
      // For production: use event subscription or full mapping scan

      // This is a simplified approach - in production you'd:
      // 1. Subscribe to new transactions on shadow_agent.aleo
      // 2. Parse register_agent events to get new agent_ids
      // 3. Query each agent_id from the mapping

      logger.debug('Agent indexing complete', {
        lastBlock: lastIndexBlock,
        currentBlock,
        agentCount: agentCache.size,
      });

      lastIndexBlock = currentBlock;
    } catch (error) {
      logger.error('Agent indexing failed', { error });
    } finally {
      this.isIndexing = false;
    }
  }

  // Add agent to cache (called when we learn of new agent)
  addAgent(agentId: string, listing: AgentListing): void {
    agentCache.set(agentId, listing);
  }

  // Search agents with filters
  searchAgents(params: AgentSearchParams): {
    agents: AgentListing[];
    total: number;
  } {
    let agents = Array.from(agentCache.values());

    // Apply filters
    if (params.service_type !== undefined) {
      agents = agents.filter(a => a.service_type === params.service_type);
    }

    if (params.min_tier !== undefined) {
      agents = agents.filter(a => a.min_tier >= params.min_tier);
    }

    if (params.is_active !== undefined) {
      agents = agents.filter(a => a.is_active === params.is_active);
    }

    const total = agents.length;

    // Apply pagination
    const offset = params.offset || 0;
    const limit = params.limit || 20;
    agents = agents.slice(offset, offset + limit);

    return { agents, total };
  }

  // Get single agent
  getAgent(agentId: string): AgentListing | undefined {
    return agentCache.get(agentId);
  }
}

export const indexerService = new IndexerService();
```

---

## 6. Routes Implementation

### 6.1 Agent Discovery Routes

```typescript
// src/routes/agents.ts
import { Router, Request, Response } from 'express';
import { indexerService } from '../services/indexer';
import { aleoService } from '../services/aleo';
import { AgentSearchParams, AgentSearchResponse } from '../types';
import { logger } from '../utils/logger';

const router = Router();

// GET /agents - Search agents
router.get('/', async (req: Request, res: Response) => {
  try {
    const params: AgentSearchParams = {
      service_type: req.query.service_type
        ? parseInt(req.query.service_type as string)
        : undefined,
      min_tier: req.query.min_tier
        ? parseInt(req.query.min_tier as string)
        : undefined,
      is_active: req.query.is_active !== undefined
        ? req.query.is_active === 'true'
        : undefined,
      limit: req.query.limit
        ? Math.min(parseInt(req.query.limit as string), 100)
        : 20,
      offset: req.query.offset
        ? parseInt(req.query.offset as string)
        : 0,
    };

    const { agents, total } = indexerService.searchAgents(params);

    const response: AgentSearchResponse = {
      agents,
      total,
      limit: params.limit!,
      offset: params.offset!,
    };

    res.json(response);
  } catch (error) {
    logger.error('Agent search failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

// GET /agents/:agentId - Get agent details
router.get('/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;

    // Try cache first
    let agent = indexerService.getAgent(agentId);

    // Fall back to on-chain lookup
    if (!agent) {
      const listing = await aleoService.getAgentListing(agentId);
      if (listing) {
        agent = listing;
        indexerService.addAgent(agentId, listing);
      }
    }

    if (!agent) {
      return res.status(404).json({ error: 'Agent not found' });
    }

    res.json(agent);
  } catch (error) {
    logger.error('Agent lookup failed', { error });
    res.status(500).json({ error: 'Internal server error' });
  }
});

export default router;
```

### 6.2 Verification Routes

```typescript
// src/routes/verify.ts
import { Router, Request, Response } from 'express';
import { aleoService } from '../services/aleo';
import { EscrowProof, ReputationProof, VerifyResponse } from '../types';
import { logger } from '../utils/logger';

const router = Router();

// POST /verify/escrow - Verify escrow proof
router.post('/escrow', async (req: Request, res: Response) => {
  try {
    const { proof, expected_agent, min_amount } = req.body;

    if (!proof || !expected_agent) {
      return res.status(400).json({
        valid: false,
        error: 'Missing required fields: proof, expected_agent',
      });
    }

    const escrowProof: EscrowProof = proof;
    const isValid = await aleoService.verifyEscrowProof(
      escrowProof,
      expected_agent,
      min_amount || 0
    );

    const response: VerifyResponse = {
      valid: isValid,
      error: isValid ? undefined : 'Invalid proof',
    };

    res.json(response);
  } catch (error) {
    logger.error('Escrow verification failed', { error });
    res.status(500).json({ valid: false, error: 'Verification error' });
  }
});

// POST /verify/reputation - Verify reputation proof
router.post('/reputation', async (req: Request, res: Response) => {
  try {
    const { proof, proof_type, threshold } = req.body;

    if (!proof || proof_type === undefined || threshold === undefined) {
      return res.status(400).json({
        valid: false,
        error: 'Missing required fields: proof, proof_type, threshold',
      });
    }

    const reputationProof: ReputationProof = proof;
    const result = await aleoService.verifyReputationProof(
      reputationProof,
      proof_type,
      threshold
    );

    const response: VerifyResponse = {
      valid: result.valid,
      tier: result.tier,
      error: result.valid ? undefined : 'Threshold not met',
    };

    res.json(response);
  } catch (error) {
    logger.error('Reputation verification failed', { error });
    res.status(500).json({ valid: false, error: 'Verification error' });
  }
});

export default router;
```

### 6.3 Health Check Routes

```typescript
// src/routes/health.ts
import { Router, Request, Response } from 'express';
import { aleoService } from '../services/aleo';
import { config } from '../config';

const router = Router();

// GET /health - Basic health check
router.get('/', (req: Request, res: Response) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: '1.0.0',
  });
});

// GET /health/ready - Readiness check
router.get('/ready', async (req: Request, res: Response) => {
  try {
    // Check Aleo connection
    const blockHeight = await aleoService.getBlockHeight();

    if (blockHeight === 0) {
      return res.status(503).json({
        status: 'not ready',
        reason: 'Cannot connect to Aleo network',
      });
    }

    res.json({
      status: 'ready',
      blockHeight,
      network: config.aleo.network,
    });
  } catch (error) {
    res.status(503).json({
      status: 'not ready',
      reason: 'Health check failed',
    });
  }
});

export default router;
```

---

## 7. x402 Middleware

```typescript
// src/middleware/x402.ts
import { Request, Response, NextFunction } from 'express';
import { aleoService } from '../services/aleo';
import { PaymentTerms, EscrowProof } from '../types';
import { logger } from '../utils/logger';

interface X402Options {
  getPaymentTerms: (req: Request) => PaymentTerms;
  onPaymentVerified?: (req: Request, proof: EscrowProof) => void;
}

export function x402Middleware(options: X402Options) {
  return async (req: Request, res: Response, next: NextFunction) => {
    // Check for escrow proof header
    const escrowProofHeader = req.headers['x-escrow-proof'] as string;

    if (!escrowProofHeader) {
      // No proof provided - return 402 Payment Required
      const terms = options.getPaymentTerms(req);

      const encodedTerms = Buffer.from(JSON.stringify(terms)).toString('base64');

      return res
        .status(402)
        .header('PAYMENT-REQUIRED', encodedTerms)
        .header('Content-Type', 'application/json')
        .json({
          error: 'Payment required',
          message: 'Please create an escrow and provide proof',
        });
    }

    try {
      // Parse and verify proof
      const proofData = JSON.parse(
        Buffer.from(escrowProofHeader, 'base64').toString()
      ) as EscrowProof;

      const terms = options.getPaymentTerms(req);

      const isValid = await aleoService.verifyEscrowProof(
        proofData,
        terms.address,
        terms.price
      );

      if (!isValid) {
        return res.status(402).json({
          error: 'Invalid payment proof',
          message: 'Escrow proof verification failed',
        });
      }

      // Payment verified - call optional callback
      if (options.onPaymentVerified) {
        options.onPaymentVerified(req, proofData);
      }

      // Attach proof to request for downstream use
      (req as any).escrowProof = proofData;

      next();
    } catch (error) {
      logger.error('x402 middleware error', { error });
      return res.status(400).json({
        error: 'Invalid payment proof format',
      });
    }
  };
}
```

---

## 8. Logger Utility

```typescript
// src/utils/logger.ts
import winston from 'winston';
import { config } from '../config';

export const logger = winston.createLogger({
  level: config.logging.level,
  format: winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.json()
  ),
  defaultMeta: { service: 'shadow-facilitator' },
  transports: [
    new winston.transports.Console({
      format: winston.format.combine(
        winston.format.colorize(),
        winston.format.simple()
      ),
    }),
  ],
});

// Add file transport in production
if (config.env === 'production') {
  logger.add(
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' })
  );
  logger.add(
    new winston.transports.File({ filename: 'logs/combined.log' })
  );
}
```

---

## 9. Main Application Entry Point

```typescript
// src/index.ts
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { config, validateConfig } from './config';
import { aleoService } from './services/aleo';
import { indexerService } from './services/indexer';
import { logger } from './utils/logger';
import agentsRouter from './routes/agents';
import verifyRouter from './routes/verify';
import healthRouter from './routes/health';

async function main() {
  // Validate configuration
  validateConfig();

  // Initialize services
  await aleoService.initialize();
  indexerService.start();

  // Create Express app
  const app = express();

  // Middleware
  app.use(helmet());
  app.use(cors());
  app.use(express.json());

  // Request logging
  app.use((req, res, next) => {
    logger.debug('Request', {
      method: req.method,
      path: req.path,
      query: req.query,
    });
    next();
  });

  // Routes
  app.use('/health', healthRouter);
  app.use('/agents', agentsRouter);
  app.use('/verify', verifyRouter);

  // Error handler
  app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
    logger.error('Unhandled error', { error: err.message, stack: err.stack });
    res.status(500).json({ error: 'Internal server error' });
  });

  // Start server
  app.listen(config.port, () => {
    logger.info(`Facilitator running on port ${config.port}`, {
      env: config.env,
      network: config.aleo.network,
    });
  });
}

main().catch((error) => {
  logger.error('Failed to start facilitator', { error });
  process.exit(1);
});
```

---

## 10. Docker Configuration

### 10.1 Dockerfile

```dockerfile
# Dockerfile
FROM node:18-alpine

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy source
COPY dist/ ./dist/

# Set environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/health || exit 1

# Run
CMD ["node", "dist/index.js"]
```

### 10.2 Docker Compose

```yaml
# docker-compose.yml
version: '3.8'

services:
  facilitator:
    build: .
    ports:
      - "3000:3000"
    environment:
      - NODE_ENV=production
      - ALEO_NETWORK=testnet
      - ALEO_RPC_URL=https://api.explorer.aleo.org/v1
    restart: unless-stopped
    logging:
      driver: json-file
      options:
        max-size: "10m"
        max-file: "3"
```

---

## 11. Build and Run

```bash
# Development
npm run dev

# Build
npm run build

# Production
npm start

# Docker
docker build -t shadow-facilitator .
docker run -p 3000:3000 shadow-facilitator
```

---

## 12. API Testing

```bash
# Health check
curl http://localhost:3000/health

# Search agents
curl "http://localhost:3000/agents?service_type=1&min_tier=2"

# Get agent
curl http://localhost:3000/agents/123field

# Verify escrow proof
curl -X POST http://localhost:3000/verify/escrow \
  -H "Content-Type: application/json" \
  -d '{"proof": {...}, "expected_agent": "aleo1...", "min_amount": 100000}'

# Verify reputation proof
curl -X POST http://localhost:3000/verify/reputation \
  -H "Content-Type: application/json" \
  -d '{"proof": {...}, "proof_type": 4, "threshold": 2}'
```

---

*End of Facilitator Implementation Guide*
