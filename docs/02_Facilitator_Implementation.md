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
npm install @provablehq/sdk axios
npm install --save-dev @types/express @types/cors
```

### 1.2 Project Structure

```
shadow-facilitator/
├── src/
│   ├── index.ts              # Entry point + route registration
│   ├── config/
│   │   └── index.ts          # Configuration (port, rate limits, consistent hash)
│   ├── routes/
│   │   ├── agents.ts         # Agent discovery endpoints
│   │   ├── verify.ts         # Proof verification endpoints
│   │   ├── health.ts         # Health check endpoints
│   │   ├── disputes.ts       # Dispute resolution endpoints (Phase 10a)
│   │   ├── refunds.ts        # Partial refund endpoints (Phase 10a)
│   │   ├── multisig.ts       # Multi-sig escrow endpoints (Phase 10a)
│   │   └── sessions.ts       # Session-based payment endpoints (Phase 5)
│   ├── services/
│   │   ├── aleo.ts           # Aleo SDK wrapper
│   │   ├── indexer.ts        # Agent listing indexer + cache
│   │   └── redis.ts          # Redis service (optional, for caching/rate limiting)
│   ├── middleware/
│   │   ├── x402.ts           # x402 protocol handler
│   │   └── rateLimiter.ts    # Rate limiting (Token Bucket, Sliding Window, Fixed Window)
│   ├── types.ts              # TypeScript type definitions
│   ├── test-setup.ts         # Test environment setup
│   └── utils/
│       ├── ttlStore.ts       # Time-to-live in-memory store
│       ├── consistentHash.ts # Consistent hashing for distributed lookups
│       ├── resilience.ts     # Circuit breaker / retry utilities
│       └── shutdown.ts       # Graceful shutdown handlers (SIGTERM/SIGINT)
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
PORT=3001

# Aleo Network
ALEO_NETWORK=testnet
ALEO_RPC_URL=https://api.explorer.aleo.org/v1
ALEO_PRIVATE_KEY=your_private_key_here

# Database (optional, for production)
DATABASE_URL=postgresql://user:pass@localhost:5432/shadowagent

# Redis (optional, for caching)
REDIS_URL=redis://localhost:6379

# Rate Limiting — Global (Token Bucket, per IP)
RATE_LIMIT_GLOBAL_WINDOW_MS=60000
RATE_LIMIT_GLOBAL_MAX=100

# Rate Limiting — Per-Address Operations (Fixed Window)
RATE_LIMIT_REGISTER_WINDOW_MS=3600000
RATE_LIMIT_REGISTER_MAX=5
RATE_LIMIT_RATING_WINDOW_MS=60000
RATE_LIMIT_RATING_MAX=10
RATE_LIMIT_DISPUTE_WINDOW_MS=3600000
RATE_LIMIT_DISPUTE_MAX=3
RATE_LIMIT_REFUND_WINDOW_MS=3600000
RATE_LIMIT_REFUND_MAX=5
RATE_LIMIT_MULTISIG_WINDOW_MS=60000
RATE_LIMIT_MULTISIG_MAX=10

# Rate Limiting — Session (Sliding Window Counter)
RATE_LIMIT_SESSION_WINDOW_MS=600000

# Rate Limiting — x402 (Token Bucket, per IP)
RATE_LIMIT_X402_WINDOW_MS=60000
RATE_LIMIT_X402_MAX=20

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
      windowMs: parseInt(process.env.RATE_LIMIT_SESSION_WINDOW_MS || '600000', 10),
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
    },
    // x402 payment rate limiting (Token Bucket) — per IP
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
import { Account, ProgramManager, AleoNetworkClient } from '@provablehq/sdk';
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
  // MVP NOTE: This is a placeholder implementation that performs basic field
  // validation only. Full ZK proof verification using the Aleo SDK is planned
  // for the Foundation Hardening phase (Phase 10a). See 06_Future_Implementation_Plan.md.
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

      return true; // MVP STUB: Returns true if fields are present. Production will verify ZK proof.
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
      // MVP STUB: Returns valid if proof_type matches. Production will verify ZK proof.

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

      // MVP NOTE: Uses in-memory cache (agentCache Map) for agent directory.
      // Config references DATABASE_URL but the MVP does not use a persistent database.
      // Production will use PostgreSQL + Redis (see 06_Future_Implementation_Plan.md Phase 10a).
      //
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

### 6.4 Dispute Routes (Phase 10a)

```typescript
// src/routes/disputes.ts
import { Router, Request, Response } from 'express';
import { createAddressRateLimiter } from '../middleware/rateLimiter';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';

const router = Router();

// Per-address rate limiting: 3 disputes per hour
const disputeLimiter = createAddressRateLimiter({
  ...config.rateLimit.perAddress.dispute,
  keyExtractor: (req) => req.body?.client || req.body?.agent || req.ip || 'unknown',
});

interface DisputeRecord {
  client: string;
  agent: string;
  job_hash: string;
  escrow_amount: number;
  client_evidence_hash: string;
  agent_evidence_hash: string;
  status: 'opened' | 'agent_responded' | 'resolved_client' | 'resolved_agent' | 'resolved_split';
  resolution_agent_pct: number;
  opened_at: string;
  responded_at?: string;
  resolved_at?: string;
}

// Disputes expire after 90 days
const disputeStore = new TTLStore<DisputeRecord>({ maxSize: 50_000, defaultTTLMs: 90 * 86_400_000 });

// POST /disputes          — Open a dispute
// GET  /disputes/:jobHash — Get dispute by job hash
// GET  /disputes          — List disputes (filter: client, agent, status)
// POST /disputes/:jobHash/respond — Agent responds with counter-evidence
// POST /disputes/:jobHash/resolve — Admin resolves with percentage split or winner

export default router;
```

### 6.5 Refund Routes (Phase 10a)

```typescript
// src/routes/refunds.ts
import { Router, Request, Response } from 'express';
import { createAddressRateLimiter } from '../middleware/rateLimiter';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';

const router = Router();

// Per-address rate limiting: 5 refund proposals per hour
const refundLimiter = createAddressRateLimiter({
  ...config.rateLimit.perAddress.refund,
  keyExtractor: (req) => req.body?.agent || req.body?.client || req.ip || 'unknown',
});

interface RefundProposal {
  agent: string;
  client: string;
  total_amount: number;
  agent_amount: number;
  client_amount: number;
  job_hash: string;
  status: 'proposed' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

// Refund proposals expire after 30 days
const refundStore = new TTLStore<RefundProposal>({ maxSize: 50_000, defaultTTLMs: 30 * 86_400_000 });

// POST /refunds              — Propose a partial refund (validates agent_amount <= total_amount)
// GET  /refunds/:jobHash     — Get refund proposal by job hash
// GET  /refunds              — List refunds (filter: client, agent, status)
// POST /refunds/:jobHash/accept  — Agent accepts refund proposal
// POST /refunds/:jobHash/reject  — Agent rejects refund proposal

export default router;
```

### 6.6 Multi-Sig Escrow Routes (Phase 10a)

```typescript
// src/routes/multisig.ts
import { Router, Request, Response } from 'express';
import { createAddressRateLimiter } from '../middleware/rateLimiter';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';

const router = Router();

// Per-address rate limiting: 10 multisig operations per minute
const multisigLimiter = createAddressRateLimiter({
  ...config.rateLimit.perAddress.multisig,
  keyExtractor: (req) => req.body?.owner || req.body?.signer_address || req.ip || 'unknown',
});

interface MultiSigEscrowRecord {
  owner: string;
  agent: string;
  amount: number;
  job_hash: string;
  deadline: number;
  secret_hash: string;
  signers: [string, string, string];
  required_sigs: number;
  sig_count: number;
  approvals: [boolean, boolean, boolean];
  status: 'locked' | 'released' | 'refunded';
  created_at: string;
  updated_at: string;
}

// Escrows expire after 30 days; per-job mutex prevents TOCTOU race on concurrent approvals
const multisigStore = new TTLStore<MultiSigEscrowRecord>({ maxSize: 50_000, defaultTTLMs: 30 * 86_400_000 });

// POST /escrows/multisig                      — Create multi-sig escrow (3 signers, M-of-3)
// GET  /escrows/multisig/pending/:address      — Get pending escrows for signer
// GET  /escrows/multisig/:jobHash              — Get escrow by job hash
// POST /escrows/multisig/:jobHash/approve      — Approve escrow release (mutex-protected)

export default router;
```

### 6.7 Session Routes (Phase 5)

```typescript
// src/routes/sessions.ts
import { Router, Request, Response } from 'express';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';

const router = Router();

// Per-session mutex to prevent TOCTOU race on concurrent requests
const sessionLocks = new Map<string, Promise<void>>();

// Sessions expire after 7 days; policies after 30 days
const SESSION_TTL_MS = 7 * 86_400_000;
const POLICY_TTL_MS  = 30 * 86_400_000;

const sessionStore = new TTLStore<SessionRecord>({ maxSize: 100_000, defaultTTLMs: SESSION_TTL_MS });
const policyStore  = new TTLStore<PolicyRecord>({ maxSize: 50_000, defaultTTLMs: POLICY_TTL_MS });

// ── Policy endpoints ──
// POST /sessions/policies                          — Create a spending policy
// GET  /sessions/policies                          — List policies for an owner
// GET  /sessions/policies/:policyId                — Get specific policy
// POST /sessions/policies/:policyId/create-session — Create session from policy

// ── Session endpoints ──
// POST /sessions                    — Create a new session directly
// GET  /sessions                    — List sessions (filter: client, agent, status)
// GET  /sessions/:sessionId         — Get session details
// POST /sessions/:sessionId/request — Process a session request (mutex-protected, sliding window rate limit)
// POST /sessions/:sessionId/settle  — Settle accumulated receipts
// POST /sessions/:sessionId/close   — Close a session
// POST /sessions/:sessionId/pause   — Pause a session
// POST /sessions/:sessionId/resume  — Resume a paused session

// IMPORTANT: Static path `/policies` is registered BEFORE parameterized `/:sessionId`
// to prevent Express from matching "policies" as a session ID.

export default router;
```

### 6.8 Utility Modules

| Module | Purpose |
|--------|---------|
| `utils/ttlStore.ts` | Generic in-memory key-value store with configurable TTL and max size. Used by disputes (90d), refunds (30d), multisig (30d), and sessions (7d). |
| `utils/consistentHash.ts` | Consistent hashing ring for distributed agent lookups. Configurable virtual nodes (default 150) and replication factor. |
| `utils/resilience.ts` | Circuit breaker and retry utilities for external service calls (Aleo RPC, Redis). |
| `utils/shutdown.ts` | Graceful shutdown handler supporting SIGTERM/SIGINT with ordered cleanup (LIFO registration order). |

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

## 7.5 Rate Limiting Strategies

The facilitator uses three distinct rate limiting strategies implemented in `src/middleware/rateLimiter.ts`:

| Strategy | Algorithm | Scope | Use Case |
|----------|-----------|-------|----------|
| **Token Bucket** | `TokenBucketLimiter` | Per IP (global) | Global HTTP rate limiting — allows bursts up to bucket size |
| **Sliding Window Counter** | `SlidingWindowCounterLimiter` | Per session | Session request rate limiting — smooth enforcement, matches on-chain block windows (~100 blocks = 10min) |
| **Fixed Window Counter** | `FixedWindowCounterLimiter` | Per address | Per-operation limits (registration: 5/hr, rating: 10/min, dispute: 3/hr, refund: 5/hr, multisig: 10/min) |

There is also a **Redis-backed Fixed Window** (`RedisBackedFixedWindowLimiter`) that persists counts across server restarts, falling back to in-memory when Redis is unavailable.

**Exported factory functions:**
- `createGlobalRateLimiter(opts)` — Token Bucket middleware applied before all routes (except `/health`)
- `createAddressRateLimiter(opts)` — Fixed Window middleware with configurable `keyExtractor` for per-route use
- `createSessionRateLimiter(opts)` — Sliding Window middleware for session routes

All limiters set standard response headers: `X-RateLimit-Limit`, `X-RateLimit-Remaining`, `X-RateLimit-Reset`, `Retry-After`.

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

const app = express();
const PORT = process.env.PORT || 3001;

// Middleware
app.use(helmet());
app.use(cors({
  origin: process.env.CORS_ORIGIN || '*',
  methods: ['GET', 'POST', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Escrow-Proof', 'X-Job-Hash'],
}));
app.use(express.json({ limit: '100kb' }));

// X-Request-ID — attach a unique ID to every request for tracing
app.use((req, res, next) => {
  const requestId = (req.headers['x-request-id'] as string) || crypto.randomUUID();
  res.setHeader('X-Request-ID', requestId);
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
}));

// Routes
app.use('/agents', agentsRouter);
app.use('/verify', verifyRouter);
app.use('/refunds', refundsRouter);
app.use('/disputes', disputesRouter);
app.use('/escrows/multisig', multisigRouter);
app.use('/sessions', sessionsRouter);

// Error handler
app.use((err: Error, req: express.Request, res: express.Response, next: express.NextFunction) => {
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
  console.log(`ShadowAgent Facilitator running on port ${PORT}`);
  indexerService.startIndexing();
});

// Register shutdown cleanup in dependency order (LIFO — last registered runs first)
onShutdown('HTTP server', () => new Promise<void>((resolve) => server.close(() => resolve())));
onShutdown('Background indexer', () => indexerService.stopIndexing());
onShutdown('Redis connection', async () => {
  const redis = getRedisService();
  if (redis.isConnected()) await redis.disconnect();
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
ENV PORT=3001

EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3001/health || exit 1

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
      - "3001:3001"
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
docker run -p 3001:3001 shadow-facilitator
```

---

## 12. API Testing

```bash
# Health check
curl http://localhost:3001/health

# Search agents
curl "http://localhost:3001/agents?service_type=1&min_tier=2"

# Get agent
curl http://localhost:3001/agents/123field

# Verify escrow proof
curl -X POST http://localhost:3001/verify/escrow \
  -H "Content-Type: application/json" \
  -d '{"proof": {...}, "expected_agent": "aleo1...", "min_amount": 100000}'

# Verify reputation proof
curl -X POST http://localhost:3001/verify/reputation \
  -H "Content-Type: application/json" \
  -d '{"proof": {...}, "proof_type": 4, "threshold": 2}'

# Propose a partial refund (Phase 10a)
curl -X POST http://localhost:3001/refunds \
  -H "Content-Type: application/json" \
  -d '{"agent": "aleo1...", "total_amount": 100000, "agent_amount": 70000, "job_hash": "abc123"}'

# Open a dispute (Phase 10a)
curl -X POST http://localhost:3001/disputes \
  -H "Content-Type: application/json" \
  -d '{"client": "aleo1...", "agent": "aleo1...", "job_hash": "abc123", "escrow_amount": 100000, "evidence_hash": "sha256..."}'

# Create multi-sig escrow (Phase 10a)
curl -X POST http://localhost:3001/escrows/multisig \
  -H "Content-Type: application/json" \
  -d '{"owner": "aleo1...", "agent": "aleo1...", "amount": 100000, "job_hash": "abc123", "signers": ["aleo1a...", "aleo1b...", "aleo1c..."], "required_sigs": 2}'

# Create a session (Phase 5)
curl -X POST http://localhost:3001/sessions \
  -H "Content-Type: application/json" \
  -d '{"client": "aleo1...", "agent": "aleo1...", "max_total": 500000, "max_per_request": 10000, "rate_limit": 50, "duration_blocks": 1000}'

# Create a spending policy (Phase 5)
curl -X POST http://localhost:3001/sessions/policies \
  -H "Content-Type: application/json" \
  -d '{"owner": "aleo1...", "max_session_value": 1000000, "max_single_request": 50000}'

# Get session status
curl http://localhost:3001/sessions/{sessionId}
```

---

*End of Facilitator Implementation Guide*
