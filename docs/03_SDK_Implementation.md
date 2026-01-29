# ShadowAgent SDK Implementation Guide

## Overview

This guide covers implementing both the Client SDK (for service consumers) and the Agent SDK (for service providers). The SDKs abstract away blockchain complexity and provide simple TypeScript APIs.

---

## 1. Project Setup

### 1.1 Initialize SDK Package

```bash
mkdir shadow-agent-sdk
cd shadow-agent-sdk

# Initialize monorepo with workspaces
npm init -y

# Install development dependencies
npm install typescript @types/node --save-dev
npm install @aleohq/sdk axios

# Initialize TypeScript
npx tsc --init
```

### 1.2 Project Structure

```
shadow-agent-sdk/
├── src/
│   ├── index.ts              # Main exports
│   ├── client/
│   │   ├── index.ts          # Client SDK
│   │   ├── escrow.ts         # Escrow operations
│   │   └── rating.ts         # Rating operations
│   ├── agent/
│   │   ├── index.ts          # Agent SDK
│   │   ├── reputation.ts     # Reputation management
│   │   └── middleware.ts     # Express middleware
│   ├── common/
│   │   ├── aleo.ts           # Aleo SDK wrapper
│   │   ├── types.ts          # Shared types
│   │   └── constants.ts      # Constants
│   └── utils/
│       ├── crypto.ts         # Crypto utilities
│       └── encoding.ts       # Encoding helpers
├── tests/
├── package.json
├── tsconfig.json
└── README.md
```

### 1.3 Package.json Configuration

```json
{
  "name": "@shadowagent/sdk",
  "version": "1.0.0",
  "main": "dist/index.js",
  "types": "dist/index.d.ts",
  "files": ["dist"],
  "scripts": {
    "build": "tsc",
    "test": "jest",
    "prepublishOnly": "npm run build"
  },
  "dependencies": {
    "@aleohq/sdk": "^0.6.0",
    "axios": "^1.6.0"
  },
  "peerDependencies": {
    "express": "^4.18.0"
  }
}
```

---

## 2. Common Types

```typescript
// src/common/types.ts

// ═══════════════════════════════════════════════════════════════════
// CONFIGURATION TYPES
// ═══════════════════════════════════════════════════════════════════

export interface ClientConfig {
  privateKey: string;
  network: 'testnet' | 'mainnet';
  facilitatorUrl?: string;
  rpcUrl?: string;
}

export interface AgentConfig {
  privateKey: string;
  network: 'testnet' | 'mainnet';
  serviceType: ServiceType;
  endpointUrl: string;
  pricePerRequest: number;  // microcents
}

// ═══════════════════════════════════════════════════════════════════
// ON-CHAIN RECORD TYPES
// ═══════════════════════════════════════════════════════════════════

export interface AgentReputation {
  owner: string;
  agent_id: string;
  total_jobs: bigint;
  total_rating_points: bigint;
  total_revenue: bigint;
  tier: Tier;
  created_at: bigint;
  last_updated: bigint;
}

export interface RatingRecord {
  owner: string;
  client_nullifier: string;
  job_hash: string;
  rating: number;        // 1-50
  payment_amount: bigint;
  burn_proof: string;
  timestamp: bigint;
}

export interface EscrowRecord {
  owner: string;
  agent: string;
  amount: bigint;
  job_hash: string;
  deadline: bigint;
  secret_hash: string;
  status: EscrowStatus;
}

export interface ReputationProof {
  owner: string;
  proof_type: ProofType;
  threshold_met: boolean;
  tier_proven: Tier;
  generated_at: bigint;
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC DATA TYPES
// ═══════════════════════════════════════════════════════════════════

export interface PublicListing {
  agent_id: string;
  service_type: ServiceType;
  endpoint_hash: string;
  min_tier: Tier;
  is_active: boolean;
}

export interface AgentSearchResult {
  agent_id: string;
  service_type: ServiceType;
  tier: Tier;
  endpoint?: string;
  is_active: boolean;
}

// ═══════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════

export enum Tier {
  New = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Diamond = 4,
}

export enum ServiceType {
  NLP = 1,
  Vision = 2,
  Code = 3,
  Data = 4,
  Audio = 5,
  Multi = 6,
  Custom = 7,
}

export enum ProofType {
  Rating = 1,
  Jobs = 2,
  Revenue = 3,
  Tier = 4,
}

export enum EscrowStatus {
  Locked = 0,
  Released = 1,
  Refunded = 2,
}

// ═══════════════════════════════════════════════════════════════════
// x402 PROTOCOL TYPES
// ═══════════════════════════════════════════════════════════════════

export interface PaymentTerms {
  price: number;
  network: string;
  address: string;
  escrow_required: boolean;
  secret_hash?: string;
  deadline_blocks?: number;
  description?: string;
}

// ═══════════════════════════════════════════════════════════════════
// SESSION-BASED PAYMENT TYPES
// ═══════════════════════════════════════════════════════════════════

export interface PaymentSession {
  owner: string;
  agent: string;
  session_id: string;
  max_total: bigint;
  max_per_request: bigint;
  rate_limit: bigint;
  spent: bigint;
  request_count: bigint;
  window_start: bigint;
  valid_until: bigint;
  status: SessionStatus;
}

export interface SpendingPolicy {
  owner: string;
  policy_id: string;
  max_session_value: bigint;
  max_single_request: bigint;
  allowed_tiers: number;       // Bitfield
  allowed_categories: bigint;  // Bitfield
  require_proofs: boolean;
  created_at: bigint;
}

export interface SessionReceipt {
  session_id: string;
  request_hash: string;
  amount: bigint;
  timestamp: bigint;
  agent_signature: string;
}

export interface CreateSessionParams {
  agent: string;
  maxTotal: bigint;
  maxPerRequest: bigint;
  rateLimit: bigint;
  durationBlocks: number;
}

export enum SessionStatus {
  Active = 0,
  Paused = 1,
  Closed = 2,
}

export interface EscrowProof {
  proof: string;
  nullifier: string;
  commitment: string;
}

// ═══════════════════════════════════════════════════════════════════
// OPERATION PARAMETERS
// ═══════════════════════════════════════════════════════════════════

export interface CreateEscrowParams {
  agent: string;
  amount: bigint;
  jobHash: string;
  secretHash: string;
  deadlineBlocks: number;
}

export interface SubmitRatingParams {
  agentAddress: string;
  jobHash: string;
  stars: number;         // 1-5 (will be scaled to 1-50)
  paymentAmount: bigint;
}

export interface AgentSearchParams {
  serviceType?: ServiceType;
  minTier?: Tier;
  isActive?: boolean;
  limit?: number;
  offset?: number;
}
```

---

## 3. Constants

```typescript
// src/common/constants.ts

export const PROGRAM_ID = 'shadow_agent.aleo';

export const RPC_URLS = {
  testnet: 'https://api.explorer.aleo.org/v1/testnet',
  mainnet: 'https://api.explorer.aleo.org/v1/mainnet',
};

export const FACILITATOR_URLS = {
  testnet: 'https://facilitator.shadowagent.dev',
  mainnet: 'https://api.shadowagent.io',
};

// Economic constants (match smart contract)
export const RATING_BURN_COST = 500_000n;        // 0.5 credits
export const MIN_PAYMENT_FOR_RATING = 100_000n;  // $0.10

// Tier thresholds
export const TIER_THRESHOLDS = {
  [1]: { jobs: 10n, revenue: 10_000_000n },      // Bronze
  [2]: { jobs: 50n, revenue: 100_000_000n },     // Silver
  [3]: { jobs: 200n, revenue: 1_000_000_000n },  // Gold
  [4]: { jobs: 1000n, revenue: 10_000_000_000n }, // Diamond
};

// Default escrow timeout
export const DEFAULT_ESCROW_BLOCKS = 100;

// Rating scale
export const RATING_SCALE = 10;  // Multiply stars by 10
```

---

## 4. Aleo Wrapper

```typescript
// src/common/aleo.ts

import { Account, ProgramManager, AleoNetworkClient } from '@aleohq/sdk';
import { PROGRAM_ID, RPC_URLS } from './constants';

export class AleoWrapper {
  private account: Account;
  private client: AleoNetworkClient;
  private programManager: ProgramManager;
  private network: 'testnet' | 'mainnet';

  constructor(privateKey: string, network: 'testnet' | 'mainnet') {
    this.network = network;
    this.account = new Account({ privateKey });
    this.client = new AleoNetworkClient(RPC_URLS[network]);
    this.programManager = new ProgramManager(
      RPC_URLS[network],
      undefined,
      undefined
    );
  }

  get address(): string {
    return this.account.address().to_string();
  }

  get viewKey(): string {
    return this.account.viewKey().to_string();
  }

  // Execute a transition
  async execute(
    transition: string,
    inputs: string[],
    fee: number = 1_000_000
  ): Promise<string> {
    const result = await this.programManager.execute(
      PROGRAM_ID,
      transition,
      inputs,
      fee,
      undefined,
      undefined,
      this.account.privateKey()
    );

    return result;
  }

  // Get mapping value
  async getMapping(mapping: string, key: string): Promise<string | null> {
    try {
      const value = await this.client.getProgramMappingValue(
        PROGRAM_ID,
        mapping,
        key
      );
      return value;
    } catch {
      return null;
    }
  }

  // Get current block height
  async getBlockHeight(): Promise<number> {
    return await this.client.getLatestHeight();
  }

  // Parse a record from transaction output
  parseRecord<T>(recordString: string): T {
    // Remove outer braces and parse fields
    const content = recordString.replace(/^\s*\{|\}\s*$/g, '').trim();
    const pairs = content.split(',').map(s => s.trim());

    const result: any = {};
    for (const pair of pairs) {
      const [key, value] = pair.split(':').map(s => s.trim());
      if (key && value) {
        // Parse value based on type suffix
        if (value.endsWith('u64')) {
          result[key] = BigInt(value.replace('u64', ''));
        } else if (value.endsWith('u8')) {
          result[key] = parseInt(value.replace('u8', ''));
        } else if (value.endsWith('field')) {
          result[key] = value.replace('field', '');
        } else if (value.endsWith('address')) {
          result[key] = value;
        } else if (value === 'true' || value === 'false') {
          result[key] = value === 'true';
        } else {
          result[key] = value;
        }
      }
    }

    return result as T;
  }

  // Format input for Leo
  formatInput(value: any, type: string): string {
    switch (type) {
      case 'u8':
        return `${value}u8`;
      case 'u64':
        return `${value}u64`;
      case 'field':
        return `${value}field`;
      case 'address':
        return value;
      case 'bool':
        return value ? 'true' : 'false';
      default:
        return String(value);
    }
  }
}
```

---

## 5. Crypto Utilities

```typescript
// src/utils/crypto.ts

import { createHash, randomBytes } from 'crypto';

// Generate a random field element (simplified)
export function generateRandomField(): string {
  const bytes = randomBytes(32);
  return BigInt('0x' + bytes.toString('hex')).toString();
}

// Generate job hash from request parameters
export function generateJobHash(
  url: string,
  method: string,
  timestamp: number
): string {
  const data = `${url}:${method}:${timestamp}`;
  const hash = createHash('sha256').update(data).digest('hex');
  return BigInt('0x' + hash.slice(0, 62)).toString();
}

// Generate secret for HTLC
export function generateSecret(): { secret: string; hash: string } {
  const secretBytes = randomBytes(32);
  const secret = BigInt('0x' + secretBytes.toString('hex')).toString();

  // Simplified hash - in production, use BHP256 compatible hash
  const hashBytes = createHash('sha256')
    .update(secretBytes)
    .digest('hex');
  const hash = BigInt('0x' + hashBytes.slice(0, 62)).toString();

  return { secret, hash };
}

// Generate client nullifier
export function generateNullifier(
  clientAddress: string,
  jobHash: string
): string {
  const data = `${clientAddress}:${jobHash}`;
  const hash = createHash('sha256').update(data).digest('hex');
  return BigInt('0x' + hash.slice(0, 62)).toString();
}
```

---

## 6. Client SDK Implementation

```typescript
// src/client/index.ts

import axios, { AxiosInstance } from 'axios';
import { AleoWrapper } from '../common/aleo';
import {
  ClientConfig,
  PaymentTerms,
  EscrowRecord,
  AgentSearchResult,
  AgentSearchParams,
  SubmitRatingParams,
} from '../common/types';
import {
  FACILITATOR_URLS,
  RATING_BURN_COST,
  RATING_SCALE,
  DEFAULT_ESCROW_BLOCKS,
} from '../common/constants';
import { generateJobHash, generateSecret, generateRandomField } from '../utils/crypto';

export class ShadowAgentClient {
  private aleo: AleoWrapper;
  private facilitator: AxiosInstance;

  constructor(config: ClientConfig) {
    this.aleo = new AleoWrapper(config.privateKey, config.network);

    const facilitatorUrl = config.facilitatorUrl || FACILITATOR_URLS[config.network];
    this.facilitator = axios.create({
      baseURL: facilitatorUrl,
      timeout: 30000,
    });
  }

  // ═══════════════════════════════════════════════════════════════════
  // DISCOVERY
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Search for agents matching criteria
   */
  async searchAgents(params: AgentSearchParams = {}): Promise<AgentSearchResult[]> {
    const response = await this.facilitator.get('/agents', { params });
    return response.data.agents;
  }

  /**
   * Get details for a specific agent
   */
  async getAgent(agentId: string): Promise<AgentSearchResult | null> {
    try {
      const response = await this.facilitator.get(`/agents/${agentId}`);
      return response.data;
    } catch {
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // x402 REQUESTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Make a paid request to an agent service
   * Handles full x402 flow: 402 -> escrow -> retry -> claim
   */
  async request(
    url: string,
    options: RequestInit = {}
  ): Promise<Response> {
    // Step 1: Initial request
    const initialResponse = await fetch(url, options);

    if (initialResponse.status !== 402) {
      return initialResponse;
    }

    // Step 2: Parse payment terms from 402 response
    const paymentHeader = initialResponse.headers.get('PAYMENT-REQUIRED');
    if (!paymentHeader) {
      throw new Error('Missing PAYMENT-REQUIRED header');
    }

    const paymentTerms: PaymentTerms = JSON.parse(
      Buffer.from(paymentHeader, 'base64').toString()
    );

    // Step 3: Create escrow
    const jobHash = generateJobHash(
      url,
      options.method || 'GET',
      Date.now()
    );

    const escrow = await this.createEscrow({
      agent: paymentTerms.address,
      amount: BigInt(paymentTerms.price),
      jobHash,
      secretHash: paymentTerms.secret_hash!,
      deadlineBlocks: paymentTerms.deadline_blocks || DEFAULT_ESCROW_BLOCKS,
    });

    // Step 4: Generate escrow proof
    const escrowProof = await this.generateEscrowProof(escrow);

    // Step 5: Retry with proof
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-ESCROW-PROOF': Buffer.from(JSON.stringify(escrowProof)).toString('base64'),
        'X-JOB-HASH': jobHash,
      },
    });

    return response;
  }

  // ═══════════════════════════════════════════════════════════════════
  // ESCROW OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create an escrow for a service payment
   */
  async createEscrow(params: {
    agent: string;
    amount: bigint;
    jobHash: string;
    secretHash: string;
    deadlineBlocks: number;
  }): Promise<EscrowRecord> {
    const inputs = [
      params.agent,
      this.aleo.formatInput(params.amount, 'u64'),
      this.aleo.formatInput(params.jobHash, 'field'),
      this.aleo.formatInput(params.secretHash, 'field'),
      this.aleo.formatInput(params.deadlineBlocks, 'u64'),
    ];

    const txId = await this.aleo.execute('create_escrow', inputs);

    // Parse result from transaction
    // In production, you'd wait for confirmation and parse the record
    return {
      owner: this.aleo.address,
      agent: params.agent,
      amount: params.amount,
      job_hash: params.jobHash,
      deadline: BigInt(await this.aleo.getBlockHeight() + params.deadlineBlocks),
      secret_hash: params.secretHash,
      status: 0, // Locked
    } as EscrowRecord;
  }

  /**
   * Request refund after deadline passes
   */
  async refundEscrow(escrow: EscrowRecord): Promise<EscrowRecord> {
    const escrowInput = this.formatEscrowRecord(escrow);
    const txId = await this.aleo.execute('refund_escrow', [escrowInput]);

    return {
      ...escrow,
      status: 2, // Refunded
    };
  }

  private formatEscrowRecord(escrow: EscrowRecord): string {
    return `{
      owner: ${escrow.owner},
      agent: ${escrow.agent},
      amount: ${escrow.amount}u64,
      job_hash: ${escrow.job_hash}field,
      deadline: ${escrow.deadline}u64,
      secret_hash: ${escrow.secret_hash}field,
      status: ${escrow.status}u8
    }`;
  }

  private async generateEscrowProof(escrow: EscrowRecord): Promise<any> {
    // Generate ZK proof that escrow exists
    // Simplified for hackathon - in production use actual ZK proof generation
    return {
      proof: generateRandomField(),
      nullifier: generateRandomField(),
      commitment: generateRandomField(),
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // RATING OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Submit a rating for a completed job
   */
  async submitRating(params: SubmitRatingParams): Promise<void> {
    // Scale stars (1-5) to rating (1-50)
    const scaledRating = Math.round(params.stars * RATING_SCALE);

    if (scaledRating < 1 || scaledRating > 50) {
      throw new Error('Stars must be between 1 and 5');
    }

    const inputs = [
      params.agentAddress,
      this.aleo.formatInput(params.jobHash, 'field'),
      this.aleo.formatInput(scaledRating, 'u8'),
      this.aleo.formatInput(params.paymentAmount, 'u64'),
      this.aleo.formatInput(RATING_BURN_COST, 'u64'),
    ];

    await this.aleo.execute('submit_rating', inputs);
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROOF VERIFICATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Verify an agent's reputation proof
   */
  async verifyReputationProof(
    proof: any,
    proofType: number,
    threshold: number
  ): Promise<{ valid: boolean; tier?: number }> {
    const response = await this.facilitator.post('/verify/reputation', {
      proof,
      proof_type: proofType,
      threshold,
    });

    return response.data;
  }

  // ═══════════════════════════════════════════════════════════════════
  // SESSION-BASED PAYMENTS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a payment session with pre-authorized spending bounds
   * Sign once, spend many times within limits
   */
  async createSession(params: CreateSessionParams): Promise<PaymentSession> {
    const sessionId = generateRandomField();

    const inputs = [
      params.agent,
      this.aleo.formatInput(params.maxTotal, 'u64'),
      this.aleo.formatInput(params.maxPerRequest, 'u64'),
      this.aleo.formatInput(params.rateLimit, 'u64'),
      this.aleo.formatInput(params.durationBlocks, 'u64'),
    ];

    const txId = await this.aleo.execute('create_session', inputs);

    return {
      owner: this.aleo.address,
      agent: params.agent,
      session_id: sessionId,
      max_total: params.maxTotal,
      max_per_request: params.maxPerRequest,
      rate_limit: params.rateLimit,
      spent: 0n,
      request_count: 0n,
      window_start: BigInt(await this.aleo.getBlockHeight()),
      valid_until: BigInt(await this.aleo.getBlockHeight() + params.durationBlocks),
      status: SessionStatus.Active,
    };
  }

  /**
   * Make a request within an active session (NO wallet signature required)
   * The session record authorizes spending within bounds
   */
  async sessionRequest(
    session: PaymentSession,
    url: string,
    options: RequestInit = {}
  ): Promise<{ response: Response; updatedSession: PaymentSession; receipt: SessionReceipt }> {
    // Validate session locally before sending
    if (session.status !== SessionStatus.Active) {
      throw new Error('Session is not active');
    }

    const currentBlock = await this.aleo.getBlockHeight();
    if (BigInt(currentBlock) >= session.valid_until) {
      throw new Error('Session has expired');
    }

    // Make request with session proof (no signature needed)
    const response = await fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        'X-SESSION-ID': session.session_id,
        'X-SESSION-PROOF': Buffer.from(JSON.stringify({
          session_id: session.session_id,
          owner: session.owner,
          remaining: (session.max_total - session.spent).toString(),
          valid_until: session.valid_until.toString(),
        })).toString('base64'),
      },
    });

    // Parse receipt from response
    const receiptHeader = response.headers.get('X-SESSION-RECEIPT');
    if (!receiptHeader) {
      throw new Error('Agent did not return session receipt');
    }

    const receipt: SessionReceipt = JSON.parse(
      Buffer.from(receiptHeader, 'base64').toString()
    );

    // Update local session state
    const updatedSession: PaymentSession = {
      ...session,
      spent: session.spent + receipt.amount,
      request_count: session.request_count + 1n,
    };

    return { response, updatedSession, receipt };
  }

  /**
   * Close a session and refund unused funds
   */
  async closeSession(session: PaymentSession): Promise<{
    refundAmount: bigint;
    finalSession: PaymentSession;
  }> {
    const sessionInput = this.formatSessionRecord(session);
    const txId = await this.aleo.execute('close_session', [sessionInput]);

    const refundAmount = session.max_total - session.spent;

    return {
      refundAmount,
      finalSession: {
        ...session,
        status: SessionStatus.Closed,
      },
    };
  }

  /**
   * Pause a session (can be resumed later)
   */
  async pauseSession(session: PaymentSession): Promise<PaymentSession> {
    const sessionInput = this.formatSessionRecord(session);
    await this.aleo.execute('pause_session', [sessionInput]);

    return {
      ...session,
      status: SessionStatus.Paused,
    };
  }

  /**
   * Resume a paused session
   */
  async resumeSession(session: PaymentSession): Promise<PaymentSession> {
    if (session.status !== SessionStatus.Paused) {
      throw new Error('Session is not paused');
    }

    const sessionInput = this.formatSessionRecord(session);
    await this.aleo.execute('resume_session', [sessionInput]);

    return {
      ...session,
      status: SessionStatus.Active,
    };
  }

  private formatSessionRecord(session: PaymentSession): string {
    return `{
      owner: ${session.owner},
      agent: ${session.agent},
      session_id: ${session.session_id}field,
      max_total: ${session.max_total}u64,
      max_per_request: ${session.max_per_request}u64,
      rate_limit: ${session.rate_limit}u64,
      spent: ${session.spent}u64,
      request_count: ${session.request_count}u64,
      window_start: ${session.window_start}u64,
      valid_until: ${session.valid_until}u64,
      status: ${session.status}u8
    }`;
  }
}
```

---

## 7. Agent SDK Implementation

```typescript
// src/agent/index.ts

import { AleoWrapper } from '../common/aleo';
import {
  AgentConfig,
  AgentReputation,
  RatingRecord,
  ReputationProof,
  Tier,
  ProofType,
  ServiceType,
} from '../common/types';
import { generateSecret, generateRandomField } from '../utils/crypto';

export class ShadowAgentServer {
  private aleo: AleoWrapper;
  private config: AgentConfig;
  private reputation: AgentReputation | null = null;
  private secrets: Map<string, string> = new Map();

  constructor(config: AgentConfig) {
    this.config = config;
    this.aleo = new AleoWrapper(config.privateKey, config.network);
  }

  // ═══════════════════════════════════════════════════════════════════
  // REGISTRATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Register as a new agent on the marketplace
   *
   * @param bondAmount - Amount to stake as registration bond (default: 10 credits = 10_000_000 microcredits)
   * @returns AgentReputation record and bond record
   */
  async register(bondAmount: bigint = 10_000_000n): Promise<{ reputation: AgentReputation; bondRecord: string }> {
    // Validate bond amount meets minimum
    const REGISTRATION_BOND = 10_000_000n;
    if (bondAmount < REGISTRATION_BOND) {
      throw new Error(`Bond amount ${bondAmount} is below minimum ${REGISTRATION_BOND} (10 credits)`);
    }

    // Hash endpoint URL for privacy
    const endpointHash = this.hashEndpoint(this.config.endpointUrl);

    const inputs = [
      this.aleo.formatInput(this.config.serviceType, 'u8'),
      this.aleo.formatInput(endpointHash, 'field'),
      this.aleo.formatInput(bondAmount, 'u64'),
    ];

    const txId = await this.aleo.execute('register_agent', inputs);

    // Initialize local reputation state
    this.reputation = {
      owner: this.aleo.address,
      agent_id: this.hashAddress(this.aleo.address),
      total_jobs: 0n,
      total_rating_points: 0n,
      total_revenue: 0n,
      tier: Tier.New,
      created_at: BigInt(await this.aleo.getBlockHeight()),
      last_updated: BigInt(await this.aleo.getBlockHeight()),
    };

    return { reputation: this.reputation, bondRecord: txId };
  }

  /**
   * Unregister and reclaim staked bond
   *
   * @returns The bond amount returned
   */
  async unregister(): Promise<{ bondReturned: bigint }> {
    if (!this.reputation) {
      throw new Error('Agent not registered');
    }

    const txId = await this.aleo.execute('unregister_agent', [
      this.formatReputationRecord(this.reputation),
      // Bond record would be passed here in production
    ]);

    const bondAmount = 10_000_000n; // Would be read from bond record
    this.reputation = null;

    return { bondReturned: bondAmount };
  }

  private hashEndpoint(url: string): string {
    // Simplified hash - use proper BHP256 in production
    const hash = require('crypto')
      .createHash('sha256')
      .update(url)
      .digest('hex');
    return BigInt('0x' + hash.slice(0, 62)).toString();
  }

  private hashAddress(address: string): string {
    const hash = require('crypto')
      .createHash('sha256')
      .update(address)
      .digest('hex');
    return BigInt('0x' + hash.slice(0, 62)).toString();
  }

  // ═══════════════════════════════════════════════════════════════════
  // REPUTATION MANAGEMENT
  // ═══════════════════════════════════════════════════���═══════════════

  /**
   * Update reputation by consuming a rating record
   */
  async updateReputation(rating: RatingRecord): Promise<AgentReputation> {
    if (!this.reputation) {
      throw new Error('Agent not registered');
    }

    const repInput = this.formatReputationRecord(this.reputation);
    const ratingInput = this.formatRatingRecord(rating);

    const txId = await this.aleo.execute('update_reputation', [
      repInput,
      ratingInput,
    ]);

    // Update local state
    this.reputation = {
      ...this.reputation,
      total_jobs: this.reputation.total_jobs + 1n,
      total_rating_points: this.reputation.total_rating_points + BigInt(rating.rating),
      total_revenue: this.reputation.total_revenue + rating.payment_amount,
      tier: this.calculateTier(
        this.reputation.total_jobs + 1n,
        this.reputation.total_revenue + rating.payment_amount
      ),
      last_updated: BigInt(await this.aleo.getBlockHeight()),
    };

    return this.reputation;
  }

  private calculateTier(jobs: bigint, revenue: bigint): Tier {
    if (jobs >= 1000n && revenue >= 10_000_000_000n) return Tier.Diamond;
    if (jobs >= 200n && revenue >= 1_000_000_000n) return Tier.Gold;
    if (jobs >= 50n && revenue >= 100_000_000n) return Tier.Silver;
    if (jobs >= 10n && revenue >= 10_000_000n) return Tier.Bronze;
    return Tier.New;
  }

  /**
   * Get current reputation (local cache)
   */
  getReputation(): AgentReputation | null {
    return this.reputation;
  }

  /**
   * Calculate current average rating
   */
  getAverageRating(): number | null {
    if (!this.reputation || this.reputation.total_jobs === 0n) {
      return null;
    }

    const avg = Number(this.reputation.total_rating_points * 10n / this.reputation.total_jobs);
    return avg / 10;  // Scale back to 1-5
  }

  // ═══════════════════════════════════════════════════════════════════
  // PROOF GENERATION
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Generate a reputation proof
   */
  async proveReputation(
    type: ProofType,
    threshold: number
  ): Promise<ReputationProof> {
    if (!this.reputation) {
      throw new Error('Agent not registered');
    }

    const repInput = this.formatReputationRecord(this.reputation);
    let transition: string;
    let inputs: string[];

    switch (type) {
      case ProofType.Rating:
        transition = 'prove_rating';
        inputs = [repInput, this.aleo.formatInput(threshold, 'u8')];
        break;

      case ProofType.Jobs:
        transition = 'prove_jobs';
        inputs = [repInput, this.aleo.formatInput(threshold, 'u64')];
        break;

      case ProofType.Tier:
        transition = 'prove_tier';
        inputs = [repInput, this.aleo.formatInput(threshold, 'u8')];
        break;

      case ProofType.Revenue:
        throw new Error('Use proveRevenueRange for revenue proofs');

      default:
        throw new Error(`Unknown proof type: ${type}`);
    }

    const txId = await this.aleo.execute(transition, inputs);

    return {
      owner: this.aleo.address,
      proof_type: type,
      threshold_met: true,
      tier_proven: this.reputation.tier,
      generated_at: BigInt(await this.aleo.getBlockHeight()),
    };
  }

  /**
   * Generate a revenue range proof
   */
  async proveRevenueRange(
    minRevenue: bigint,
    maxRevenue: bigint
  ): Promise<ReputationProof> {
    if (!this.reputation) {
      throw new Error('Agent not registered');
    }

    const repInput = this.formatReputationRecord(this.reputation);
    const inputs = [
      repInput,
      this.aleo.formatInput(minRevenue, 'u64'),
      this.aleo.formatInput(maxRevenue, 'u64'),
    ];

    const txId = await this.aleo.execute('prove_revenue_range', inputs);

    return {
      owner: this.aleo.address,
      proof_type: ProofType.Revenue,
      threshold_met: true,
      tier_proven: this.reputation.tier,
      generated_at: BigInt(await this.aleo.getBlockHeight()),
    };
  }

  // ═══════════════════════════════════════════════════════════════════
  // ESCROW OPERATIONS
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Claim an escrow by revealing the secret
   */
  async claimEscrow(escrow: any, secret: string): Promise<void> {
    const escrowInput = this.formatEscrowRecord(escrow);
    const secretInput = this.aleo.formatInput(secret, 'field');

    await this.aleo.execute('claim_escrow', [escrowInput, secretInput]);
  }

  /**
   * Generate a new secret for an escrow (used in 402 response)
   */
  generateEscrowSecret(jobId: string): { secretHash: string } {
    const { secret, hash } = generateSecret();
    this.secrets.set(jobId, secret);
    return { secretHash: hash };
  }

  /**
   * Retrieve stored secret for claiming
   */
  getSecret(jobId: string): string | undefined {
    return this.secrets.get(jobId);
  }

  // ═══════════════════════════════════════════════════════════════════
  // SESSION-BASED PAYMENT HANDLING
  // ═══════════════════════════════════════════════════════════════════

  private activeSessions: Map<string, PaymentSession> = new Map();
  private sessionReceipts: Map<string, SessionReceipt[]> = new Map();

  /**
   * Validate an incoming session request
   * Returns true if the session is valid and has sufficient funds
   */
  validateSessionRequest(
    sessionProof: string,
    requestedAmount: bigint
  ): { valid: boolean; error?: string; session?: PaymentSession } {
    try {
      const proofData = JSON.parse(
        Buffer.from(sessionProof, 'base64').toString()
      );

      const session = this.activeSessions.get(proofData.session_id);
      if (!session) {
        return { valid: false, error: 'Unknown session' };
      }

      // Validate session bounds
      if (session.status !== 0) {
        return { valid: false, error: 'Session is not active' };
      }

      if (requestedAmount > session.max_per_request) {
        return { valid: false, error: 'Amount exceeds per-request limit' };
      }

      if (session.spent + requestedAmount > session.max_total) {
        return { valid: false, error: 'Amount exceeds session total' };
      }

      // Check expiry (simplified - should check actual block height)
      const remaining = BigInt(proofData.remaining);
      if (remaining < requestedAmount) {
        return { valid: false, error: 'Insufficient session balance' };
      }

      return { valid: true, session };
    } catch (error) {
      return { valid: false, error: 'Invalid session proof' };
    }
  }

  /**
   * Process a session request and generate a receipt
   */
  processSessionRequest(
    sessionId: string,
    amount: bigint,
    requestHash: string
  ): SessionReceipt {
    const receipt: SessionReceipt = {
      session_id: sessionId,
      request_hash: requestHash,
      amount: amount,
      timestamp: BigInt(Date.now()),
      agent_signature: generateRandomField(), // Simplified - use actual signature
    };

    // Store receipt for batch settlement
    const receipts = this.sessionReceipts.get(sessionId) || [];
    receipts.push(receipt);
    this.sessionReceipts.set(sessionId, receipts);

    return receipt;
  }

  /**
   * Batch settle receipts for a session (call periodically)
   */
  async settleSessionBatch(sessionId: string): Promise<string> {
    const receipts = this.sessionReceipts.get(sessionId);
    if (!receipts || receipts.length === 0) {
      throw new Error('No receipts to settle');
    }

    const session = this.activeSessions.get(sessionId);
    if (!session) {
      throw new Error('Session not found');
    }

    // Calculate total to settle
    const totalAmount = receipts.reduce((sum, r) => sum + r.amount, 0n);

    // Submit settlement transaction
    const sessionInput = this.formatSessionRecord(session);
    const receiptsInput = this.formatReceiptsBatch(receipts);

    const txId = await this.aleo.execute('settle_session', [
      sessionInput,
      receiptsInput,
    ]);

    // Clear settled receipts
    this.sessionReceipts.set(sessionId, []);

    return txId;
  }

  /**
   * Get pending settlement amount for a session
   */
  getPendingSettlement(sessionId: string): bigint {
    const receipts = this.sessionReceipts.get(sessionId) || [];
    return receipts.reduce((sum, r) => sum + r.amount, 0n);
  }

  // ═══════════════════════════════════════════════════════════════════
  // FORMATTING HELPERS
  // ═══════════════════════════════════════════════════════════════════

  private formatReputationRecord(rep: AgentReputation): string {
    return `{
      owner: ${rep.owner},
      agent_id: ${rep.agent_id}field,
      total_jobs: ${rep.total_jobs}u64,
      total_rating_points: ${rep.total_rating_points}u64,
      total_revenue: ${rep.total_revenue}u64,
      tier: ${rep.tier}u8,
      created_at: ${rep.created_at}u64,
      last_updated: ${rep.last_updated}u64
    }`;
  }

  private formatRatingRecord(rating: RatingRecord): string {
    return `{
      owner: ${rating.owner},
      client_nullifier: ${rating.client_nullifier}field,
      job_hash: ${rating.job_hash}field,
      rating: ${rating.rating}u8,
      payment_amount: ${rating.payment_amount}u64,
      burn_proof: ${rating.burn_proof}field,
      timestamp: ${rating.timestamp}u64
    }`;
  }

  private formatEscrowRecord(escrow: any): string {
    return `{
      owner: ${escrow.owner},
      agent: ${escrow.agent},
      amount: ${escrow.amount}u64,
      job_hash: ${escrow.job_hash}field,
      deadline: ${escrow.deadline}u64,
      secret_hash: ${escrow.secret_hash}field,
      status: ${escrow.status}u8
    }`;
  }

  private formatSessionRecord(session: PaymentSession): string {
    return `{
      owner: ${session.owner},
      agent: ${session.agent},
      session_id: ${session.session_id}field,
      max_total: ${session.max_total}u64,
      max_per_request: ${session.max_per_request}u64,
      rate_limit: ${session.rate_limit}u64,
      spent: ${session.spent}u64,
      request_count: ${session.request_count}u64,
      window_start: ${session.window_start}u64,
      valid_until: ${session.valid_until}u64,
      status: ${session.status}u8
    }`;
  }

  private formatReceiptsBatch(receipts: SessionReceipt[]): string {
    return `[${receipts.map(r => `{
      session_id: ${r.session_id}field,
      request_hash: ${r.request_hash}field,
      amount: ${r.amount}u64,
      timestamp: ${r.timestamp}u64,
      agent_signature: ${r.agent_signature}field
    }`).join(', ')}]`;
  }
}
```

---

## 8. Express Middleware

```typescript
// src/agent/middleware.ts

import { Request, Response, NextFunction } from 'express';
import { ShadowAgentServer } from './index';
import { PaymentTerms } from '../common/types';
import { generateJobHash } from '../utils/crypto';

interface MiddlewareOptions {
  agent: ShadowAgentServer;
  pricePerRequest: number;
  deadlineBlocks?: number;
}

/**
 * Express middleware for x402 payment handling
 */
export function shadowAgentMiddleware(options: MiddlewareOptions) {
  const { agent, pricePerRequest, deadlineBlocks = 100 } = options;

  return async (req: Request, res: Response, next: NextFunction) => {
    // Check for escrow proof
    const escrowProofHeader = req.headers['x-escrow-proof'] as string;

    if (!escrowProofHeader) {
      // Generate job ID and secret
      const jobId = generateJobHash(req.path, req.method, Date.now());
      const { secretHash } = agent.generateEscrowSecret(jobId);

      // Return 402 with payment terms
      const terms: PaymentTerms = {
        price: pricePerRequest,
        network: 'aleo:testnet', // or mainnet
        address: agent.getReputation()?.owner || '',
        escrow_required: true,
        secret_hash: secretHash,
        deadline_blocks: deadlineBlocks,
        description: `Payment for ${req.method} ${req.path}`,
      };

      const encodedTerms = Buffer.from(JSON.stringify(terms)).toString('base64');

      return res
        .status(402)
        .header('PAYMENT-REQUIRED', encodedTerms)
        .json({
          error: 'Payment required',
          message: 'Create an escrow and retry with proof',
        });
    }

    try {
      // Verify escrow proof
      const proofData = JSON.parse(
        Buffer.from(escrowProofHeader, 'base64').toString()
      );

      // TODO: Implement actual verification
      // For hackathon, accept any proof

      // Attach payment info to request
      (req as any).payment = {
        verified: true,
        proof: proofData,
      };

      // Continue to route handler
      next();

      // After response, claim the escrow
      res.on('finish', async () => {
        if (res.statusCode >= 200 && res.statusCode < 300) {
          const jobHash = req.headers['x-job-hash'] as string;
          const secret = agent.getSecret(jobHash);

          if (secret) {
            // Set delivery secret header
            res.setHeader('X-DELIVERY-SECRET', secret);

            // In production, also claim the escrow on-chain
          }
        }
      });

    } catch (error) {
      return res.status(400).json({
        error: 'Invalid escrow proof',
      });
    }
  };
}
```

---

## 9. Main Exports

```typescript
// src/index.ts

// Client SDK
export { ShadowAgentClient } from './client';

// Agent SDK
export { ShadowAgentServer } from './agent';
export { shadowAgentMiddleware } from './agent/middleware';

// Types
export * from './common/types';

// Constants
export * from './common/constants';

// Utilities
export {
  generateJobHash,
  generateSecret,
  generateNullifier,
  generateRandomField,
} from './utils/crypto';
```

---

## 10. Usage Examples

### 10.1 Client Usage

```typescript
import { ShadowAgentClient, ServiceType, Tier } from '@shadowagent/sdk';

async function clientExample() {
  // Initialize client
  const client = new ShadowAgentClient({
    privateKey: 'APrivateKey1...',
    network: 'testnet',
  });

  // Search for agents
  const agents = await client.searchAgents({
    serviceType: ServiceType.NLP,
    minTier: Tier.Silver,
  });

  console.log('Found agents:', agents);

  // Make paid request
  const response = await client.request('https://agent.example.com/api/analyze', {
    method: 'POST',
    body: JSON.stringify({ text: 'Hello world' }),
    headers: { 'Content-Type': 'application/json' },
  });

  const result = await response.json();
  console.log('Result:', result);

  // Submit rating
  await client.submitRating({
    agentAddress: agents[0].agent_id,
    jobHash: response.headers.get('X-JOB-HASH')!,
    stars: 5,
    paymentAmount: 100_000n,
  });
}
```

### 10.2 Agent Usage

```typescript
import express from 'express';
import {
  ShadowAgentServer,
  shadowAgentMiddleware,
  ServiceType,
} from '@shadowagent/sdk';

async function agentExample() {
  // Initialize agent
  const agent = new ShadowAgentServer({
    privateKey: 'APrivateKey1...',
    network: 'testnet',
    serviceType: ServiceType.NLP,
    endpointUrl: 'https://my-agent.example.com',
    pricePerRequest: 100_000, // $0.10
  });

  // Register on marketplace
  await agent.register('10_000_000n /* 10 credits bond */');

  // Create Express app
  const app = express();

  // Apply payment middleware
  app.use('/api', shadowAgentMiddleware({
    agent,
    pricePerRequest: 100_000,
  }));

  // Your service endpoint
  app.post('/api/analyze', (req, res) => {
    const result = { analysis: 'Your text is positive!' };
    res.json(result);
  });

  // Generate proofs
  const tierProof = await agent.proveReputation(4, 2); // Prove Silver tier
  console.log('Tier proof:', tierProof);

  app.listen(3000);
}
```

### 10.3 Session-Based Payments (Recommended for High-Frequency Usage)

```typescript
import { ShadowAgentClient, SessionStatus } from '@shadowagent/sdk';

async function sessionExample() {
  const client = new ShadowAgentClient({
    privateKey: 'APrivateKey1...',
    network: 'testnet',
  });

  // ═══════════════════════════════════════════════════════════════════
  // STEP 1: Create session (ONE wallet signature)
  // ═══════════════════════════════════════════════════════════════════

  let session = await client.createSession({
    agent: 'aleo1agent...', // Target agent address
    maxTotal: 100_000_000n,  // $100 max total spend
    maxPerRequest: 1_000_000n, // $1 max per request
    rateLimit: 100n,         // Max 100 requests per rate window
    durationBlocks: 1000,    // Valid for ~1000 blocks
  });

  console.log('Session created:', session.session_id);
  console.log('Sign once, spend up to $100!');

  // ═══════════════════════════════════════════════════════════════════
  // STEP 2: Make requests WITHOUT signing (unlimited within bounds)
  // ═══════════════════════════════════════════════════════════════════

  const receipts = [];

  // Make 100 requests - NO WALLET SIGNATURES NEEDED!
  for (let i = 0; i < 100; i++) {
    const { response, updatedSession, receipt } = await client.sessionRequest(
      session,
      'https://agent.example.com/api/analyze',
      {
        method: 'POST',
        body: JSON.stringify({ text: `Request ${i}` }),
        headers: { 'Content-Type': 'application/json' },
      }
    );

    session = updatedSession; // Update local state
    receipts.push(receipt);

    const result = await response.json();
    console.log(`Request ${i}: ${result.analysis}`);
    console.log(`  Spent so far: $${Number(session.spent) / 1_000_000}`);
  }

  console.log(`\nMade 100 requests with 0 additional signatures!`);
  console.log(`Total spent: $${Number(session.spent) / 1_000_000}`);

  // ═══════════════════════════════════════════════════════════════════
  // STEP 3: Close session and get refund
  // ═══════════════════════════════════════════════════════════════════

  const { refundAmount, finalSession } = await client.closeSession(session);

  console.log(`\nSession closed.`);
  console.log(`Refunded: $${Number(refundAmount) / 1_000_000}`);
}
```

### 10.4 Agent Handling Sessions

```typescript
import express from 'express';
import { ShadowAgentServer, generateJobHash } from '@shadowagent/sdk';

async function agentWithSessionsExample() {
  const agent = new ShadowAgentServer({
    privateKey: 'APrivateKey1...',
    network: 'testnet',
    serviceType: 1, // NLP
    endpointUrl: 'https://my-agent.example.com',
    pricePerRequest: 50_000, // $0.05 per request
  });

  await agent.register('10_000_000n /* 10 credits bond */');

  const app = express();
  app.use(express.json());

  // Session-aware middleware
  app.use('/api', async (req, res, next) => {
    const sessionProof = req.headers['x-session-proof'] as string;
    const escrowProof = req.headers['x-escrow-proof'] as string;

    // Check if this is a session request (preferred for high-frequency)
    if (sessionProof) {
      const validation = agent.validateSessionRequest(sessionProof, 50_000n);

      if (!validation.valid) {
        return res.status(402).json({
          error: 'Session validation failed',
          reason: validation.error,
        });
      }

      // Process request and generate receipt
      const requestHash = generateJobHash(req.path, req.method, Date.now());
      const receipt = agent.processSessionRequest(
        validation.session!.session_id,
        50_000n,
        requestHash
      );

      // Attach receipt to response
      res.on('finish', () => {
        res.setHeader(
          'X-SESSION-RECEIPT',
          Buffer.from(JSON.stringify(receipt)).toString('base64')
        );
      });

      (req as any).payment = { type: 'session', receipt };
      return next();
    }

    // Fall back to escrow-based x402 for single requests
    if (!escrowProof) {
      return res.status(402).json({
        error: 'Payment required',
        message: 'Use session-based payments for better UX',
        hint: 'Create a session with createSession() for unlimited requests',
      });
    }

    // Handle legacy escrow payment...
    next();
  });

  // Your service endpoint
  app.post('/api/analyze', (req, res) => {
    res.json({ analysis: 'Positive sentiment detected!' });
  });

  // Periodic batch settlement (run every N blocks or on timer)
  setInterval(async () => {
    const pending = agent.getPendingSettlement('active-session-id');
    if (pending > 0n) {
      console.log(`Settling ${pending} microcredits...`);
      await agent.settleSessionBatch('active-session-id');
    }
  }, 60000); // Every minute

  app.listen(3000);
  console.log('Agent running with session support on port 3000');
}
```

---

## 11. Build and Publish

```bash
# Build
npm run build

# Test locally
npm link
cd ../my-app
npm link @shadowagent/sdk

# Publish to npm
npm publish --access public
```

---

*End of SDK Implementation Guide*
