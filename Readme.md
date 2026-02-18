# ShadowAgent: Zero-Knowledge Reputation Attestation for the Autonomous Economy

> **Privacy isn't a feature. It's the product.**

## Executive Summary

**ShadowAgent** is a privacy-preserving AI agent marketplace built on Aleo where reputation is provable but identity is private. It solves the critical "Trust vs. Privacy" paradox that plagues the emerging AI agent economy.

**One-Liner:**
> "Zero-Knowledge Reputation Attestation for the Autonomous Economy"

---

## The Problem

In today's AI agent marketplaces built on public blockchains, every transaction creates a permanent surveillance trail:

```
Public Blockchain (Amiko/Solana):
├── "Company X hired LLM Fine-tuning Agent 50 times"
│   └── Competitors know: They're building a model
├── "User Y paid Medical Diagnosis Agent $500"
│   └── Insurance knows: They have health concerns
└── "Journalist Z paid Source Protection Agent"
    └── Government knows: They're investigating something
```

**ShadowAgent makes this impossible** while maintaining trust.

---

## The Solution

```
ShadowAgent on Aleo:
├── Agent proves: "4.8★ rating, 500+ jobs, $50k+ revenue"
│   └── No one knows: Which clients, what work, when
├── Client hires agent with confidence
│   └── No one knows: Who hired whom for what
└── Reputation is real, identity is private
```

---

## Key Features

### 1. Zero-Knowledge Reputation Attestation
Agents prove verifiable claims about their reputation without revealing underlying data:
- **prove_tier**: "I am Gold tier or higher"
- **prove_rating**: "My average rating is ≥ 4.5 stars"
- **prove_jobs**: "I have completed ≥ 200 jobs"
- **prove_revenue_range**: "My lifetime revenue is between $10k-$50k"

### 2. Rolling Reputation Model (O(1) Complexity)
Instead of expensive loops through individual jobs, we use cumulative statistics that update incrementally:
- `total_jobs` - Lifetime job count
- `total_rating_points` - Sum of all ratings (scaled x10)
- `total_revenue` - Lifetime earnings
- `tier` - Computed tier (New → Bronze → Silver → Gold → Diamond)

### 3. Three-Layer Sybil Resistance

| Layer | Mechanism | Attack Cost |
|-------|-----------|-------------|
| **Economic** | Burn-to-Rate: 0.5 credits per rating | 1000 fake ratings = 500+ credits |
| **Identity** | Bond staking: 10 credits per agent | Cannot create infinite agents |
| **Payment** | Minimum $0.10 per rated job | Dust transactions excluded |

> Bond staking (10 credits per agent) provides economic Sybil resistance — creating multiple fake agents becomes prohibitively expensive.

### 4. Private Escrow (HTLC)
Fair exchange without trusted intermediaries:
- Client locks payment in escrow before service
- Agent delivers service and reveals secret
- Agent claims payment atomically
- Timeout protection ensures funds are never locked forever

### 5. Semi-Private Discovery
Public listings with private backing data:
- **PUBLIC**: Agent ID, service type, verified tier badge, active status
- **PRIVATE**: Job details, revenue amounts, client identities, rating values

### 6. Session-Based Payments (Scalable Micropayments)

**The killer feature for autonomous AI economies** - Sign once, spend unlimited times within bounds:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                   SESSION-BASED PAYMENT MODEL                                │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Create Session (ONE signature)                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Client signs: "I authorize Agent X to spend up to $100                 │ │
│  │              - Max $1 per request                                      │ │
│  │              - Valid for 24 hours                                      │ │
│  │              - Rate limit: 100 requests/hour"                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  STEP 2: Use Session (NO signatures - unlimited requests within bounds)     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Request 1  ──► Agent validates ──► Execute ──► Track: $0.10            │ │
│  │ Request 2  ──► Agent validates ──► Execute ──► Track: $0.20            │ │
│  │ ...                                                                    │ │
│  │ Request 1000 ──► Until session limit reached (NO wallet popups!)       │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  STEP 3: Settlement (ONE transaction)                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Agent submits: "Client used $47.30 across 473 requests"                │ │
│  │ On-chain: Settle $47.30 to agent, refund $52.70 to client              │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  RESULT: 1 signature + 1 settlement = unlimited requests within bounds      │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

**Why this matters:**
- **UX**: 1000 API calls with 1 wallet signature (vs 1000 signatures without sessions)
- **Autonomous AI**: Agents transact within human-defined bounds without per-tx approval
- **Gas Efficiency**: Batch settlement instead of per-request transactions
- **Privacy**: Session activity stays off-chain until settlement

### 7. Reputation Decay
Time-based decay ensures reputation reflects **recent** performance, not just historical data:
- 95% retention per 7-day period (~100,800 blocks)
- Up to 10 decay periods (~70 days max look-back)
- Decay-adjusted ZK proofs via `prove_rating_decay` and `prove_tier_with_decay`

### 8. Dispute Resolution
On-chain dispute lifecycle with evidence submission and admin arbitration:
- Client opens dispute with evidence hash
- Agent responds with counter-evidence
- Admin resolves with percentage-based split (0-100% to agent)
- Prevents duplicate disputes via `active_disputes` mapping

### 9. Multi-Sig Escrow
M-of-3 signature escrow for high-value transactions:
- Configurable 1-of-3, 2-of-3, or 3-of-3 approval thresholds
- Each signer must provide the HTLC secret to approve
- Automatic ownership transfer to agent when threshold is met
- Deadline-based refund with on-chain block height verification

### 10. x402 Payment Protocol
Standard HTTP 402 flow with private Aleo escrows:
- Agent returns HTTP 402 with payment terms
- Client creates private escrow
- Client retries with escrow proof
- Agent delivers and claims payment

---

## Technical Architecture

### Deployed Smart Contracts (Aleo Testnet)

All three contracts are deployed with `@noupgrade` (immutable):

| Contract | Program ID | Transitions | Records |
|----------|------------|-------------|---------|
| **Core** | `shadow_agent.aleo` | 12 | 5 |
| **Extension** (Phase 10a) | `shadow_agent_ext.aleo` | 11 | 4 |
| **Session** (Phase 5) | `shadow_agent_session.aleo` | 8 | 3 |
| **Total** | | **31** | **12** |

### Smart Contract Records

| Record | Contract | Visibility | Purpose |
|--------|----------|------------|---------|
| `AgentReputation` | Core | Private | Cumulative reputation stats |
| `AgentBond` | Core | Private | Registration bond stake (10 credits) |
| `RatingRecord` | Core | Private | Individual job rating |
| `EscrowRecord` | Core | Private | HTLC locked payment for fair exchange |
| `ReputationProof` | Core | Private | ZK attestation output |
| `SplitEscrowRecord` | Extension | Private | Partial refund split tracking |
| `DisputeRecord` | Extension | Private | Dispute lifecycle state |
| `DecayedReputationProof` | Extension | Private | Decay-adjusted ZK proof |
| `MultiSigEscrowRecord` | Extension | Private | Multi-sig escrow payment |
| `PaymentSession` | Session | Private | Pre-authorized spending session |
| `SessionReceipt` | Session | Private | Per-request payment receipt |
| `SpendingPolicy` | Session | Private | Reusable policy template |

### On-Chain Mappings

| Mapping | Contract | Purpose |
|---------|----------|---------|
| `agent_listings` | Core | Public discovery (agent_id → PublicListing) |
| `registered_agents` | Core | Agent registration check (1 per address) |
| `used_nullifiers` | Core | Double-rating prevention |
| `active_disputes` | Extension | Track open disputes by job hash |
| `active_sessions` | Session | Prevent duplicate session IDs |

### All 31 On-Chain Transitions

**Core Contract (12):**

| Transition | Type | Purpose |
|------------|------|---------|
| `register_agent` | async | Register with bond (10 credits) |
| `unregister_agent` | async | Unregister and reclaim bond |
| `submit_rating` | async | Submit rating with burn mechanism |
| `update_reputation` | private | Agent incorporates rating (O(1)) |
| `prove_tier` | private | ZK prove tier >= threshold |
| `prove_rating` | private | ZK prove average rating >= threshold |
| `prove_jobs` | private | ZK prove jobs >= threshold |
| `prove_revenue_range` | private | ZK prove revenue within range |
| `create_escrow` | private | Lock payment for service |
| `claim_escrow` | private | Agent claims with secret |
| `refund_escrow` | private | Client reclaims after timeout |
| `update_listing` | async | Agent updates public listing |

**Extension Contract (11) — Phase 10a:**

| Transition | Type | Purpose |
|------------|------|---------|
| `propose_partial_refund` | private | Client proposes escrow split |
| `accept_partial_refund` | private | Agent accepts refund split |
| `reject_partial_refund` | private | Agent rejects refund split |
| `open_dispute` | async | Client opens dispute with evidence |
| `respond_to_dispute` | private | Agent submits counter-evidence |
| `resolve_dispute` | async | Admin resolves with % split |
| `prove_rating_decay` | async | ZK prove decayed rating >= threshold |
| `prove_tier_with_decay` | async | ZK prove tier with decay |
| `create_multisig_escrow` | private | Create M-of-3 escrow |
| `approve_escrow_release` | private | Signer approves with secret |
| `refund_multisig_escrow` | async | Refund after deadline |

**Session Contract (8) — Phase 5:**

| Transition | Type | Purpose |
|------------|------|---------|
| `create_session` | async | Client creates session (ONE signature) |
| `session_request` | async | Agent records request (no client sig) |
| `settle_session` | private | Agent claims accumulated payments |
| `close_session` | async | Client closes and reclaims unused funds |
| `pause_session` | private | Client temporarily suspends session |
| `resume_session` | private | Client reactivates paused session |
| `create_policy` | private | Create reusable spending policy template |
| `create_session_from_policy` | async | Create session from policy |

---

## Full-Stack Implementation

### TypeScript SDK (`shadow-sdk/`)

**Package:** `@shadowagent/sdk` | **103 tests**

```typescript
import { ShadowAgentClient, ServiceType, Tier } from '@shadowagent/sdk';

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

// Per-request payment with x402
const response = await client.makeRequest(agent, request);

// Session-based payment (1000 API calls, 1 signature)
const session = await client.createSession({
  agent: agentAddress,
  maxTotal: 10_000_000,
  maxPerRequest: 100_000,
  rateLimit: 100,
  durationBlocks: 14400,
});
const result = await client.requestFromSession(session, request);

// Dispute resolution
await client.openDispute(agentId, jobHash, evidenceHash);

// Multi-sig escrow
await client.createMultiSigEscrow(config);
```

```typescript
import { ShadowAgentServer, ServiceType } from '@shadowagent/sdk';

// Initialize agent
const agent = new ShadowAgentServer({
  privateKey: 'APrivateKey1...',
  network: 'testnet',
  serviceType: ServiceType.NLP,
  endpointUrl: 'https://my-agent.example.com',
  pricePerRequest: 100_000,
});

// Register on marketplace (stakes 10-credit bond)
await agent.register();

// Generate reputation proofs (including decay-adjusted)
const proof = await agent.createReputationProof(ProofType.Tier, Tier.Silver);

// Accept/reject partial refunds
await agent.acceptPartialRefund(proposal);
await agent.respondToDispute(dispute, evidenceHash);
```

**SDK Modules:**
- `client.ts` — `ShadowAgentClient` for consumers (search, pay, rate, sessions, disputes)
- `agent.ts` — `ShadowAgentServer` for providers (register, prove, claim, middleware)
- `crypto.ts` — Cryptographic utilities with lazy WASM loading (hash, sign, execute programs)
- `types.ts` — Shared types, enums (`ServiceType`, `Tier`, `SessionStatus`), and constants

### Facilitator Backend (`shadow-facilitator/`)

**Framework:** Express.js | **Port:** 3001 | **136+ tests**

The facilitator bridges HTTP clients to the Aleo network with production-grade resilience:

**API Routes:**

| Route Group | Endpoints | Purpose |
|-------------|-----------|---------|
| `/health` | `GET /`, `/ready`, `/live`, `/detailed` | Health checks (quick, readiness, liveness, detailed) |
| `/agents` | `GET /`, `POST /register`, `GET /:agentId`, `POST /:agentId/rating` | Agent discovery and registration |
| `/verify` | `POST /proofs/verify`, `POST /escrow/verify` | ZK proof and escrow verification |
| `/refunds` | `POST /`, `GET /:jobHash`, `POST /:jobHash/accept` | Partial refund management |
| `/disputes` | `POST /`, `GET /:jobHash`, `POST /:jobHash/respond`, `POST /:jobHash/resolve` | Dispute resolution lifecycle |
| `/escrows/multisig` | `POST /`, `GET /:jobHash`, `POST /:jobHash/approve` | Multi-sig escrow management |
| `/sessions` | `POST /`, `GET /:sessionId`, `POST /:sessionId/request`, settle, close, pause, resume | Session-based payment management |
| `/sessions/policies` | `POST /`, `GET /`, `GET /:policyId`, `POST /:policyId/create-session` | Spending policy templates |

**Middleware:**

| Middleware | Algorithm | Purpose |
|------------|-----------|---------|
| **x402 Payment** | HTLC | HTTP 402 Payment Required protocol with secret generation and job tracking |
| **Rate Limiter** | Token Bucket / Sliding Window / Fixed Window | Three algorithms for global, session, and per-address rate limiting |
| **Helmet** | — | Security headers (CORS, CSP, etc.) |

**Services:**

| Service | Purpose |
|---------|---------|
| `AleoService` | Aleo RPC bridge with exponential backoff retry and circuit breaker pattern |
| `IndexerService` | Agent discovery indexing with consistent hash ring for multi-instance distribution |
| `RedisService` | Persistent storage with in-memory TTLStore fallback when Redis is unavailable |

**Utilities:**

| Utility | Purpose |
|---------|---------|
| `ConsistentHashRing` | Distributed cache ownership across facilitator instances (150 virtual nodes) |
| `withRetry` / `CircuitBreaker` | Exponential backoff with jitter, circuit breaker (5 failures → open, 60s reset) |
| `TTLStore` | Bounded in-memory key-value store with TTL and LRU eviction (10K max) |
| `gracefulShutdown` | SIGTERM/SIGINT handlers for clean resource cleanup |

### Frontend (`shadow-frontend/`)

**Stack:** React 18 + Vite + TailwindCSS + Zustand | **50+ tests**

**Pages:**

| Page | Route | Features |
|------|-------|----------|
| `HomePage` | `/` | Landing page, feature showcase, tier system overview |
| `AgentDashboard` | `/agent-dashboard` | Agent profile, reputation panel, active sessions |
| `AgentDetails` | `/agent/:id` | Detailed agent info, reputation proofs, dispute history |
| `ClientDashboard` | `/client-dashboard` | Agent search, payment history, session management, pagination/sorting |
| `DisputeCenter` | `/disputes` | Dispute timeline, evidence submission, resolution tracking |

**Components (21+):** ConnectWallet, AgentCard, TierBadge, RatingForm, DisputeForm, PartialRefundModal, MultiSigEscrowForm, SessionManager, MultiSigApprovalPanel, RegistrationForm, ReputationPanel, ActiveSessionsPanel, PolicyManager, CreateSessionForm, SessionList, and more.

**State Management (Zustand Stores):**
- `agentStore` — Agent list, search filters, disputes, refunds, policies, sessions
- `walletStore` — Wallet connection, address, balance, network
- `sdkStore` — SDK client initialization, health checks, lazy WASM loading

---

## Discovery Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                     Discovery Architecture                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  PUBLIC (On-Chain Mapping)           PRIVATE (Agent's Records)          │
│  ┌─────────────────────────┐         ┌─────────────────────────┐        │
│  │ agent_id: 0x1234...     │         │ total_jobs: 523         │        │
│  │ service_type: NLP       │    ◀────│ total_revenue: $52,340  │        │
│  │ min_tier_proven: Gold   │   ZK    │ avg_rating: 4.7         │        │
│  │ is_active: true         │  Proof  │ client_list: [hidden]   │        │
│  │ endpoint: ipfs://...    │         │ job_details: [hidden]   │        │
│  └─────────────────────────┘         └─────────────────────────┘        │
│                                                                          │
│  Client sees:                        Agent controls:                     │
│  "Gold-tier NLP agent available"     What proofs to generate             │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Tier System

| Tier | Jobs Required | Revenue Required | Badge |
|------|---------------|------------------|-------|
| New | 0 | $0 | ○ |
| Bronze | 10+ | $100+ | ● |
| Silver | 50+ | $1,000+ | ●● |
| Gold | 200+ | $10,000+ | ●●● |
| Diamond | 1,000+ | $100,000+ | ◆ |

---

## The Privacy Moat

| What Public Chains Leak | What ShadowAgent Protects |
|-------------------------|---------------------------|
| "Company X hired LLM Agent 50x" | "Someone used some agent" |
| → Competitors learn AI strategy | → Strategy remains secret |
| "User Y paid Medical Agent $500" | "Someone paid something" |
| → Insurance sees health concerns | → Health data private |
| "Journalist Z used Source Agent" | "Someone used some agent" |
| → Government tracks investigation | → Sources protected |

---

## Implementation Roadmap

| Wave | Focus | Status |
|------|-------|--------|
| **1** | Core Records (AgentReputation, RatingRecord, EscrowRecord) | Deployed |
| **2** | Agent Registration with Bond Staking | Deployed |
| **3** | Rating System with Burn Mechanism | Deployed |
| **4** | Rolling Reputation Update (O(1)) | Deployed |
| **5** | Session-Based Payments (`shadow_agent_session.aleo`) | Deployed |
| **6** | Proof Generation (tier, rating, jobs, revenue) | Deployed |
| **7** | Escrow System (HTLC) | Deployed |
| **8** | TypeScript SDK (client, agent, crypto) | Deployed |
| **9** | Frontend Application (React + Zustand) | Deployed |
| **10** | Future Roadmap & Scaling | Planned |
| **10a** | Foundation Hardening (disputes, refunds, decay, multi-sig) | Deployed |

---

## Test Coverage

**250+ tests** across all components:

| Component | Test Files | Tests | Coverage |
|-----------|-----------|-------|----------|
| **SDK** | 6 | 103 | Client, agent, crypto, decay |
| **Facilitator** | 16 | 136+ | Routes, middleware, services, utilities |
| **Frontend** | 7+ | 50+ | Stores, API client, components |
| **Total** | **29+** | **250+** | |

Run all tests:
```bash
# From project root
npm test                    # SDK + Facilitator tests
cd shadow-frontend && npx vitest run   # Frontend tests
```

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Leo CLI (for smart contract development)
- Redis 7+ (optional — falls back to in-memory store)
- Docker & Docker Compose (optional — for containerized deployment)

### Installation

```bash
# Clone the repository
cd /path/to/Aleo

# Install all dependencies
cd shadow-sdk && npm install && cd ..
cd shadow-facilitator && npm install && cd ..
cd shadow-frontend && npm install && cd ..
```

### Running the Development Environment

```bash
# Terminal 1: Start the facilitator service
cd shadow-facilitator
npm run dev
# Runs on http://localhost:3001

# Terminal 2: Start the frontend
cd shadow-frontend
npm run dev
# Runs on http://localhost:5173

# Build a smart contract
cd shadow_agent
leo build
```

### Docker Deployment

```bash
# Start all services (Redis + Facilitator + Frontend via Nginx)
docker compose up --build -d

# View logs
docker compose logs -f

# Stop all services
docker compose down
```

Services:
- **Redis** — `localhost:6379` (persistent cache)
- **Facilitator** — `localhost:3001` (Express.js API)
- **Frontend** — `localhost:8080` (React SPA via Nginx)

### Environment Variables

**shadow-facilitator/.env**
```
PORT=3001
ALEO_RPC_URL=https://api.explorer.provable.com/v1
PROGRAM_ID=shadow_agent.aleo
REDIS_URL=redis://localhost:6379
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100
LOG_LEVEL=info
CORS_ORIGIN=http://localhost:5173
NODE_ENV=development
```

**shadow-frontend/.env**
```
VITE_API_URL=/api
VITE_FACILITATOR_URL=http://localhost:3001
```

---

## Project Structure

```
Aleo/
├── shadow_agent/                # Leo core contract (12 transitions, deployed)
│   ├── src/main.leo            # Registration, rating, escrow, ZK proofs
│   └── program.json
├── shadow_agent_ext/            # Leo extension contract (11 transitions, deployed)
│   ├── src/main.leo            # Disputes, refunds, decay, multi-sig
│   └── program.json
├── shadow_agent_session/        # Leo session contract (8 transitions, deployed)
│   ├── src/main.leo            # Sessions, policies, receipts
│   └── program.json
├── shadow-sdk/                  # TypeScript SDK (@shadowagent/sdk)
│   └── src/
│       ├── index.ts            # Main exports + factory functions
│       ├── client.ts           # ShadowAgentClient (search, pay, rate, sessions, disputes)
│       ├── agent.ts            # ShadowAgentServer (register, prove, claim, middleware)
│       ├── crypto.ts           # Cryptographic utilities (lazy WASM loading)
│       └── types.ts            # Shared types, enums, constants
├── shadow-facilitator/          # Express.js backend (port 3001)
│   └── src/
│       ├── index.ts            # Server setup, middleware stack, route registration
│       ├── config/             # Environment-based configuration
│       ├── routes/             # API routes (agents, sessions, disputes, refunds, multisig, verify, health)
│       ├── middleware/         # x402 payment, rate limiter (3 algorithms), security
│       ├── services/           # AleoService, IndexerService, RedisService
│       └── utils/              # ConsistentHashRing, resilience (retry/circuit breaker), TTLStore, shutdown
├── shadow-frontend/             # React 18 + Vite + TailwindCSS + Zustand
│   └── src/
│       ├── App.tsx             # Router + ErrorBoundary + Suspense
│       ├── pages/              # HomePage, AgentDashboard, ClientDashboard, DisputeCenter, AgentDetails
│       ├── components/         # 21+ UI components (wallet, cards, forms, modals, panels)
│       ├── stores/             # Zustand stores (agentStore, walletStore, sdkStore)
│       └── lib/                # API client with retry logic + SDK fallback
├── docs/                        # Technical documentation (8 documents)
│   ├── 00_Project_Overview_10_Phase_Plan.md
│   ├── 01_Smart_Contract_Implementation.md
│   ├── 02_Facilitator_Implementation.md
│   ├── 03_SDK_Implementation.md
│   ├── 04_Frontend_Implementation.md
│   ├── 05_Testing_Implementation.md
│   ├── 06_Future_Implementation_Plan.md
│   ├── 07_Technical_Flow_Diagrams.md
│   └── Deployment_Status.md
├── docker-compose.yml           # Multi-container deployment (Redis + Facilitator + Frontend)
├── package.json                 # Monorepo root scripts (build, test, typecheck, docker)
├── Technical_Docs.md            # Detailed technical specification
└── README.md
```

---

## Why Aleo?

This architecture is **impossible on public chains**. Aleo uniquely enables:

- **Private Records**: Reputation data never touches public state
- **Selective Disclosure**: Prove thresholds without revealing values
- **Bond-Based Sybil Resistance**: 10-credit economic barrier per agent registration
- **Native ZK**: First-class support for zero-knowledge proofs
- **Async Finalize**: On-chain verification of block height for decay and sessions

---

## The 30-Second Pitch

> "Amiko won 'Best Trustless Agent' at the Solana x402 Hackathon by creating on-chain reputation for AI agents. But every transaction, every rating, every client is public forever.
>
> **ShadowAgent** is the evolution — Zero-Knowledge Reputation Attestation.
>
> Agents prove 'Gold tier, 4.8 stars, $50k revenue' **without revealing a single client or job**.
>
> Three layers of Sybil resistance: burn-to-rate, bond staking, and payment-weighted ratings.
>
> Session-based payments enable **1000 API calls with 1 wallet signature** — making autonomous AI economies practical.
>
> Built on Aleo because this is **impossible** anywhere else.
>
> Privacy isn't a feature. It's the product."

---

## Key Terminology

| Don't Say | Do Say |
|-----------|--------|
| Anonymous | **Selectively Disclosed** |
| Hidden | **Privacy-Preserving** |
| Secret | **Zero-Knowledge Attested** |
| Private reputation | **ZK Reputation Attestation** |
| Can't see | **Cryptographically Protected** |

---

## Summary: Why This Wins

| Factor | Score | Reason |
|--------|-------|--------|
| **Privacy Usage** | 10/10 | Privacy IS the product |
| **Technical** | 10/10 | 31 on-chain transitions, rolling reputation, sessions, escrow, decay, multi-sig |
| **UX** | 10/10 | Session payments solve micropayment UX |
| **Practical** | 10/10 | Improves on hackathon winner (Amiko) |
| **Novel** | 10/10 | First ZK reputation + sessions for AI agents |
| **Completeness** | 10/10 | 3 deployed contracts, SDK, facilitator, frontend, 250+ tests |
| **Aleo Alignment** | 10/10 | Bond staking, ZK proofs, private records, async finalize |
| **Demo-ability** | 10/10 | Full working UI: search agents, pay, rate, dispute, sessions |

---

*ShadowAgent: Where reputation is provable but identity is private.*
