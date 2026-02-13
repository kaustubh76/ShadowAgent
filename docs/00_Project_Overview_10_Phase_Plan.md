# ShadowAgent: 10-Phase Master Plan

## Private AI Agent Commerce on Aleo

ShadowAgent is a privacy-preserving marketplace for AI agent services built on the Aleo blockchain. It enables AI agents to build verifiable reputation through zero-knowledge proofs while keeping all transaction details private. Clients can discover, hire, and pay agents without revealing their usage patterns, and agents can prove their track record without exposing individual job details.

---

## Deployment Status

| Field | Value |
|-------|-------|
| **Program** | `shadow_agent.aleo` |
| **Network** | Aleo Testnet |
| **Deploy TX** | `at105knrkmfhsc8mlzd3sz5nmk2vy4jnsjdktdwq4fr236jcssasvpqp2sv9p` |
| **Constructor** | `@noupgrade` (immutable) |

---

## Quick Reference: All 10 Phases

| Phase | Name | Status | Primary Doc |
|-------|------|--------|-------------|
| 1 | Smart Contract Foundation | Completed | `01_Smart_Contract_Implementation.md` |
| 2 | Core On-Chain Transitions | Completed | `01_Smart_Contract_Implementation.md` |
| 3 | ZK Proof System | Completed | `01_Smart_Contract_Implementation.md` |
| 4 | Escrow & Payment System | Completed | `01_Smart_Contract_Implementation.md` |
| 5 | Session-Based Payments | Designed (not deployed) | `01_Smart_Contract_Implementation.md` |
| 6 | Facilitator Service | Completed | `02_Facilitator_Implementation.md` |
| 7 | SDK Development | Completed | `03_SDK_Implementation.md` |
| 8 | Frontend Application | Completed | `04_Frontend_Implementation.md` |
| 9 | Testing & Quality Assurance | Completed | `05_Testing_Implementation.md` |
| 10 | Future Roadmap & Scaling | Planned | `06_Future_Implementation_Plan.md` |
| 10a | Foundation Hardening | Completed | See Phase 10a section below |

**Status Legend:**
- **Completed** = documented, implemented, and deployed on Aleo Testnet
- **Designed (not deployed)** = fully specified in documentation but not present in deployed smart contracts
- **Planned** = fully designed and documented for future implementation

> **Note on Rating Scale:** The on-chain contract uses a **1-50 integer scale** (where 10 = 1 star). The frontend UI presents this as **1-5 stars** (e.g., user selects 4 stars -> on-chain value = 40). The SDK auto-scales between these formats via `RATING_SCALE = 10`.

> **Note on Phase Mapping:** This 10-phase plan maps to the internal documentation structure as follows: Phases 1-5 correspond to Sections 3-9 of `01_Smart_Contract_Implementation.md`, Phase 6 = `02_Facilitator`, Phase 7 = `03_SDK`, Phase 8 = `04_Frontend`, Phase 9 = `05_Testing`, Phase 10 = `06_Future_Implementation_Plan`.

---

## System Architecture

```
┌──────────────────────────────────────────────────────────────────────────────┐
│                         SHADOWAGENT ARCHITECTURE                             │
├──────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│   FRONTEND (React 18 + Vite)                                                │
│   ├── Pages: Home, AgentDashboard, ClientDashboard, AgentDetails, Disputes  │
│   ├── State: Zustand (walletStore, agentStore, sdkStore)                    │
│   └── Wallet: Shield Wallet via @provablehq/sdk (WASM)                     │
│         │                                                                    │
│         ├──── Direct On-Chain ────────────────────────────────┐              │
│         │     (register, escrow, rate, prove, dispute, refund)│              │
│         │                                                     │              │
│         ▼                                                     ▼              │
│   FACILITATOR (Express.js)                          ALEO BLOCKCHAIN          │
│   ├── Routes: /agents, /verify,                     ├── shadow_agent.aleo   │
│   │   /disputes, /refunds,                          │   (12 transitions)    │
│   │   /escrows/multisig                             ├── shadow_agent_ext.aleo│
│   └── Cache: Agent directory                        │   (11 transitions)    │
│         │                                           ├── 4 mappings          │
│         │                                           └── 9 records           │
│         │                                                     ▲              │
│         └──── Reads On-Chain State ───────────────────────────┘              │
│                                                                              │
│   SDK (@shadowagent/sdk)                                                     │
│   ├── ShadowAgentClient (consumer-facing)                                   │
│   ├── ShadowAgentServer (provider-facing)                                   │
│   ├── shadowAgentMiddleware (Express.js)                                    │
│   └── Crypto utilities (fields, hashes, nullifiers)                         │
│                                                                              │
└──────────────────────────────────────────────────────────────────────────────┘
```

---

## Phase 1: Smart Contract Foundation

**Status:** Completed

**Objective:** Define the core data model, economic constants, and helper logic that underpin all on-chain operations for the ShadowAgent protocol.

### Key Deliverables

**Data Structures (6 core structs + 3 session structs):**

| Struct | Purpose | Key Fields | Status |
|--------|---------|------------|--------|
| `AgentReputation` | Agent's private reputation data | `agent_id`, `total_jobs`, `total_rating_points`, `total_revenue`, `tier` | Deployed |
| `AgentBond` | Registration bond (returned on unregister) | `agent_id`, `amount`, `staked_at` | Deployed |
| `RatingRecord` | Rating submission receipt | `client_nullifier`, `job_hash`, `rating`, `payment_amount`, `burn_proof` | Deployed |
| `ReputationProof` | ZK proof of reputation | `proof_type`, `threshold_met`, `tier_proven` | Deployed |
| `EscrowRecord` | HTLC escrow payment | `agent`, `amount`, `job_hash`, `deadline`, `secret_hash`, `status` | Deployed |
| `PublicListing` | Agent's public marketplace listing | `agent_id`, `service_type`, `endpoint_hash`, `min_tier`, `is_active` | Deployed |
| `PaymentSession` | Pre-authorized spending session | `max_total`, `max_per_request`, `rate_limit`, `spent`, `valid_until` | Designed, not deployed |
| `SpendingPolicy` | Reusable authorization rules | `max_session_value`, `allowed_tiers`, `allowed_categories`, `require_proofs` | Designed, not deployed |
| `SessionReceipt` | Per-request settlement receipt | `session_id`, `request_hash`, `amount`, `agent_signature` | Designed, not deployed |

**Economic Constants:**

| Constant | Value | Purpose |
|----------|-------|---------|
| `REGISTRATION_BOND` | 10,000,000 microcredits (10 credits) | Minimum bond to register as agent |
| `RATING_BURN_COST` | 500,000 microcredits (0.5 credits) | Burn cost per rating (Sybil resistance) |
| `MIN_PAYMENT_FOR_RATING` | 100,000 microcredits ($0.10) | Minimum payment required to rate |

**Tier Thresholds (dual requirement: jobs AND revenue):**

| Tier | Min Jobs | Min Revenue |
|------|----------|-------------|
| Bronze | 10 | 10,000,000 (10 credits) |
| Silver | 50 | 100,000,000 (100 credits) |
| Gold | 200 | 1,000,000,000 (1,000 credits) |
| Diamond | 1,000 | 10,000,000,000 (10,000 credits) |

**Helper Functions:**
- `calculate_tier()` -- determines agent tier from cumulative jobs and revenue, requiring both thresholds be met simultaneously

**Reference:** [01_Smart_Contract_Implementation.md](01_Smart_Contract_Implementation.md) -- Sections 3-4 (Data Structures, Constants, Helpers)

---

## Phase 2: Core On-Chain Transitions

**Status:** Completed (3 transitions verified on-chain)

**Objective:** Implement the core state transitions for agent registration, rating submission, reputation management, and public listing updates.

### Key Deliverables

**Transitions:**

| Transition | Type | Description |
|-----------|------|-------------|
| `register_agent` | Public + Finalize | Register as agent with bond (min 10 credits). Creates `AgentReputation` + `AgentBond` records. Sets `registered_agents` mapping. |
| `unregister_agent` | Public + Finalize | Unregister and reclaim staked bond. Removes from `registered_agents`. |
| `submit_rating` | Public + Finalize | Rate an agent (1-50 scale). Burns 0.5 credits. Generates nullifier to prevent double-rating via `used_nullifiers` mapping. |
| `update_reputation` | Private | Agent consumes `RatingRecord` to update `AgentReputation`. Accumulates jobs, rating points, revenue. Auto-upgrades tier. |
| `update_listing` | Public + Finalize | Update agent's public listing (service type, endpoint, active status). |

**On-Chain Verification:**

| Transition | Transaction ID | Status |
|-----------|---------------|--------|
| `register_agent` | `at1hr25c...qzgp` | Confirmed |
| `create_escrow` | `at197amq...efpp` | Confirmed |
| `submit_rating` | `at1qv5p2...agqv` | Confirmed |

**On-Chain Mappings:**

| Mapping | Key | Value | Purpose |
|---------|-----|-------|---------|
| `registered_agents` | `address` | `boolean` | 1 registration per address (Sybil prevention) |
| `agent_listings` | `field` | `PublicListing` | Public agent profile data |
| `used_nullifiers` | `field` | `boolean` | Prevents double-rating same job |

> **Note:** For complete deployment evidence (TX IDs, mappings, records, network config), see [Deployment_Status.md](Deployment_Status.md).

**Reference:** [01_Smart_Contract_Implementation.md](01_Smart_Contract_Implementation.md) -- Section 5 (Core Transitions), [Deployment_Status.md](Deployment_Status.md)

---

## Phase 3: ZK Proof System

**Status:** Completed

**Objective:** Enable agents to generate zero-knowledge proofs of their reputation attributes (tier, rating, job count, revenue) without revealing actual values.

### Key Deliverables

**Proof Transitions:**

| Transition | Proves | Input | Privacy Guarantee |
|-----------|--------|-------|-------------------|
| `prove_tier` | Tier >= threshold | `AgentReputation` + threshold `u8` | Reveals only that tier meets minimum, not exact tier or stats |
| `prove_rating` | Average rating >= threshold | `AgentReputation` + threshold `u8` | Reveals only pass/fail, not actual rating average |
| `prove_jobs` | Total jobs >= threshold | `AgentReputation` + threshold `u64` | Reveals only that job count meets minimum |
| `prove_revenue_range` | Revenue in [min, max] | `AgentReputation` + min `u64` + max `u64` | Reveals only that revenue falls within range, not exact amount |

**Output:** All proof transitions produce a `ReputationProof` record containing:
- `proof_type` -- which attribute was proven (Rating/Jobs/Revenue/Tier)
- `threshold_met` -- boolean result
- `tier_proven` -- agent's tier at time of proof
- `generated_at` -- block height timestamp

**Use Cases:**
- Agent proves Gold tier to access premium client pools
- Agent proves 4.0+ average rating to win competitive bids
- Agent proves 200+ jobs completed for enterprise qualification
- Agent proves revenue in $10K-$100K range without revealing exact earnings

**Reference:** [01_Smart_Contract_Implementation.md](01_Smart_Contract_Implementation.md) -- Section 6 (Proof Transitions)

---

## Phase 4: Escrow & Payment System

**Status:** Completed

**Objective:** Implement hash-time-locked escrow payments enabling trustless service delivery between clients and agents via the x402 protocol.

### Key Deliverables

**Escrow Transitions:**

| Transition | Actor | Description |
|-----------|-------|-------------|
| `create_escrow` | Client | Lock funds with secret_hash, job_hash, and deadline. Creates private `EscrowRecord`. |
| `claim_escrow` | Agent | Reveal secret matching secret_hash to claim locked payment. |
| `refund_escrow` | Client | Reclaim funds after deadline passes if agent hasn't claimed. |

**x402 Protocol Flow:**

```
Client                      Agent Service               Blockchain
  |                              |                           |
  |-- GET /api/service --------->|                           |
  |<-- 402 Payment Required -----|                           |
  |   (PAYMENT-REQUIRED header)  |                           |
  |                              |                           |
  |-- create_escrow ------------>|-------------------------->|
  |   (amount, secret_hash,      |                           |
  |    deadline, job_hash)       |                           |
  |                              |                           |
  |-- GET /api/service --------->|                           |
  |   (X-ESCROW-PROOF header)    |                           |
  |<-- 200 + Service Result -----|                           |
  |   (X-DELIVERY-SECRET header) |                           |
  |                              |                           |
  |                              |-- claim_escrow ---------->|
  |                              |   (reveal secret)         |
```

**x402 Protocol Steps:**

| Step | Actor | Action | HTTP Details |
|------|-------|--------|-------------|
| 1 | Client | Request service | `GET /api/service` (no payment headers) |
| 2 | Agent | Reject with payment terms | `402` + `PAYMENT-REQUIRED` header (base64 JSON) |
| 3 | Client | Create escrow on-chain | `create_escrow(agent, amount, job_hash, secret_hash, deadline)` |
| 4 | Blockchain | Return private escrow record | `EscrowRecord` (private to client) |
| 5 | Client | Retry with proof | `GET /api/service` + `X-ESCROW-PROOF` + `X-JOB-HASH` headers |
| 6 | Agent | Verify proof, deliver service | `200 OK` + `X-DELIVERY-SECRET` + `X-JOB-ID` headers |
| 7 | Agent | Claim payment | `claim_escrow(escrow, secret)` on-chain |
| 8 | Blockchain | Release funds to agent | Escrow settled |

**x402 Custom HTTP Headers:**

| Header | Direction | Encoding | Purpose |
|--------|-----------|----------|---------|
| `PAYMENT-REQUIRED` | Agent -> Client | Base64 JSON | Payment terms (price, network, address, secret_hash, deadline) |
| `X-ESCROW-PROOF` | Client -> Agent | Base64 JSON | Proof of escrow creation (proof, nullifier, commitment) |
| `X-JOB-HASH` | Client -> Agent | Plain string | Deterministic hash of request (URL + method + timestamp) |
| `X-DELIVERY-SECRET` | Agent -> Client | Plain string | Secret for escrow claim (proves delivery) |
| `X-JOB-ID` | Agent -> Client | Plain string | Job identifier for tracking |

**Payment Terms Payload** (contents of `PAYMENT-REQUIRED` header):

```json
{
  "price": 100000,
  "network": "aleo:testnet",
  "address": "aleo1agent...",
  "escrow_required": true,
  "secret_hash": "abc123...",
  "deadline_blocks": 100,
  "description": "Payment for GET /api/service"
}
```

**Edge Cases:**

| Scenario | Behavior |
|----------|----------|
| Escrow expires (deadline passes) | Client calls `refund_escrow` to reclaim funds |
| Invalid/forged proof | Agent middleware returns `402` with "Invalid payment proof" |
| Agent offline after escrow | Client waits for deadline, then calls `refund_escrow` |
| Double-claim attempt | On-chain escrow status prevents re-claiming |

> For the full x402 flow diagram with middleware internals, see [07_Technical_Flow_Diagrams.md](07_Technical_Flow_Diagrams.md) Section 2.2. For SDK implementation, see [03_SDK_Implementation.md](03_SDK_Implementation.md) `request()` method and `shadowAgentMiddleware`.

**Security Properties:**
- **Hash-time-locked:** Agent must reveal correct secret to claim
- **Deadline-enforced:** Client can reclaim after deadline if agent doesn't deliver
- **Private records:** Escrow details visible only to client and agent
- **Atomic:** Either agent claims or client refunds -- no funds lost

**Reference:** [01_Smart_Contract_Implementation.md](01_Smart_Contract_Implementation.md) -- Section 7 (Escrow System), [07_Technical_Flow_Diagrams.md](07_Technical_Flow_Diagrams.md)

---

## Phase 5: Session-Based Payments

**Status:** Designed (not deployed)

> **Important:** The 6 session transitions described below are fully specified in the documentation but are **not present in the deployed `shadow_agent.aleo` contract**. The deployed contract contains 12 core transitions (Phases 1-4). Session-based payments will be implemented in a future deployment.

**Objective:** Solve the fundamental x402 UX problem (1000 API calls = 1000 wallet signatures) by enabling "sign once, spend within bounds" sessions for high-frequency AI agent interactions.

### Key Deliverables

**Session Lifecycle Transitions:**

| Transition | Signatures | Description |
|-----------|------------|-------------|
| `create_session` | 1 (client) | Lock funds with spending policy (max total, per-request cap, rate limit, duration) |
| `session_request` | 0 | Agent claims within bounds -- NO client signature required |
| `settle_session` | 1 (agent) | Batch up to 100 receipts into a single on-chain settlement TX |
| `close_session` | 1 (client) | Close session, refund unused funds (max_total - spent) |
| `pause_session` | 1 (client) | Temporarily suspend session (can be resumed) |
| `resume_session` | 1 (client) | Reactivate a paused session |

**Session Bounds:**

| Parameter | Purpose |
|-----------|---------|
| `max_total` | Maximum total spend for entire session |
| `max_per_request` | Cap on any single request amount |
| `rate_limit` | Maximum requests per rate window (100 blocks) |
| `valid_until` | Expiry block height |

**Tiered Authorization Model:**

| Tier | Use Case | Authorization | Settlement |
|------|----------|---------------|------------|
| Micro | <$1/req | Per-request signatures | Instant |
| Standard | <$1000/session | Session creation only | End of session |
| Premium | Unlimited | Policy + session | Periodic batches |
| Autonomous | AI-to-AI | Policy bounds only | Async settlement |

**Impact:**
- 1000 requests = **0 additional wallet signatures** (vs 1000 with plain x402)
- 1000 requests = **1 settlement TX** (vs 1000 individual TXs)
- Session activity stays **off-chain** until settlement (additional privacy)

> **Note:** Session payments are fully designed (Doc 01, Section 9) but **not yet deployed on-chain**. The deployed `shadow_agent.aleo` contract contains 12 core transitions (Phases 1-4). Session transitions will be added in a future contract deployment. The Future Implementation Plan (Doc 06, Section 3.2.2) covers production-scale enhancements.

**Reference:** [01_Smart_Contract_Implementation.md](01_Smart_Contract_Implementation.md) -- Section 9 (Session-Based Payments), [06_Future_Implementation_Plan.md](06_Future_Implementation_Plan.md) -- Section 3.2.2 (Production Enhancements)

---

## Phase 6: Facilitator Service

**Status:** Completed

**Objective:** Build a backend service that bridges the frontend to the Aleo blockchain, providing agent discovery, proof verification, and real-time event indexing.

### Key Deliverables

**Technology:** Node.js + Express.js + TypeScript

**API Routes:**

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/agents` | GET | Search agents with filters (service_type, min_tier, is_active) + pagination |
| `/agents/:agentId` | GET | Get details for a specific agent |
| `/verify/escrow` | POST | Verify an escrow proof (proof, expected_agent, min_amount) |
| `/verify/reputation` | POST | Verify a reputation proof (proof, proof_type, threshold) |
| `/health` | GET | Basic health check (status, timestamp) |
| `/health/ready` | GET | Readiness check (Aleo connection + block height) |

**Services:**
- **Aleo Service:** Blockchain client for mapping queries, block height, transaction verification
- **Indexer Service:** Scans blocks for agent registrations, listing updates, and rating events
- **Agent Directory:** In-memory + database cache of agent listings for fast search

**Middleware:** CORS, rate limiting, request logging, error handling

**Architecture:**
```
Frontend  -->  Facilitator API  -->  Aleo Blockchain
                    |
               Event Indexer (real-time block scanning)
                    |
               Agent Directory (cached listings)
```

**Reference:** [02_Facilitator_Implementation.md](02_Facilitator_Implementation.md)

---

## Phase 7: SDK Development

**Status:** Completed

**Objective:** Provide TypeScript SDKs for both service consumers (Client SDK) and service providers (Agent SDK) that abstract away blockchain complexity.

### Key Deliverables

**Package:** `@shadowagent/sdk` (TypeScript, npm-publishable)

**Client SDK (`ShadowAgentClient`):**

| Category | Methods |
|----------|---------|
| Discovery | `searchAgents()`, `getAgent()` |
| x402 Payments | `request()` (full x402 flow), `createEscrow()`, `refundEscrow()` |
| Ratings | `submitRating()` (1-5 stars, auto-scaled to 1-50) |
| Verification | `verifyReputationProof()` |
| Sessions | `createSession()`, `sessionRequest()`, `closeSession()`, `pauseSession()`, `resumeSession()` |

**Agent SDK (`ShadowAgentServer`):**

| Category | Methods |
|----------|---------|
| Registration | `register()`, `unregister()` |
| Reputation | `updateReputation()`, `getReputation()`, `getAverageRating()` |
| Proofs | `proveReputation()`, `proveRevenueRange()` |
| Escrow | `claimEscrow()`, `generateEscrowSecret()`, `getSecret()` |
| Sessions | `validateSessionRequest()`, `processSessionRequest()`, `settleSessionBatch()`, `getPendingSettlement()` |

**Express Middleware (`shadowAgentMiddleware`):**
- Automatic 402 response with payment terms
- Escrow proof verification on retry
- Session-aware payment handling (session proof OR escrow proof)
- Post-response escrow claim with delivery secret

**Crypto Utilities:**
- `generateRandomField()` -- random field element
- `generateJobHash()` -- deterministic hash from URL + method + timestamp
- `generateSecret()` -- HTLC secret + hash pair
- `generateNullifier()` -- deterministic per client+job (Sybil resistance)

**Common Types:** 20+ TypeScript interfaces and enums matching Leo contract types (`AgentReputation`, `RatingRecord`, `EscrowRecord`, `PaymentSession`, `Tier`, `ServiceType`, `ProofType`, `EscrowStatus`, `SessionStatus`, etc.)

**Reference:** [03_SDK_Implementation.md](03_SDK_Implementation.md)

---

## Phase 8: Frontend Application

**Status:** Completed

**Objective:** Build a React single-page application providing agent registration/management (for providers) and agent discovery/hiring (for consumers), with direct Aleo blockchain integration.

### Key Deliverables

**Technology Stack:**

| Package | Version | Purpose |
|---------|---------|---------|
| React | 18.2 | UI framework |
| TypeScript | 5.3.3 | Type safety |
| Vite | 5.0.10 | Build tool (ESNext target for WASM) |
| Tailwind CSS | 3.4.0 | Utility-first styling |
| Zustand | 4.4.7 | State management |
| React Router DOM | 6.21.1 | Client-side routing |
| @provablehq/sdk | 0.9.15+ | Aleo blockchain SDK (WASM) |

**Pages:**

| Route | Page | Purpose |
|-------|------|---------|
| `/` | HomePage | Landing page: hero, features, roadmap, tier system, CTA |
| `/agent` | AgentDashboard | Register agent, view stats, generate ZK proofs, unregister |
| `/client` | ClientDashboard | Search agents with filters (service type, tier, status) |
| `/agents/:id` | AgentDetails | Agent detail view + hire modal + reputation proof modal |
| `*` | NotFound | 404 error page |

**State Management (Zustand):**
- `walletStore` -- connection state, address, balance, network
- `agentStore` -- registration status, reputation, search results, filters, transactions
- `sdkStore` -- SDK client lifecycle, health checks (30-second interval)

**Wallet Integration (Shield Wallet):**
- Connect/disconnect via `@provablehq/sdk`
- Transaction signing using `ProgramManager.execute()` with `ExecuteOptions` object API
- Balance fetching via direct RPC mapping lookup (`credits.aleo/mapping/account`)
- RPC endpoint: `https://api.explorer.provable.com/v1`

**On-Chain Queries:**
- `registered_agents/{address}` -- check if agent is registered
- `agent_listings/{agent_id}field` -- get agent's public listing
- `used_nullifiers/{nullifier}field` -- Sybil resistance check

**Design System:**
- Custom color tokens: shadow palette (brand purple), surface levels (0-4)
- 20+ animations: fade-in, scale-in, float, pulse-soft, glow-pulse, shine, gradient-shift
- Glassmorphism, card-shine effects, ambient mesh backgrounds
- Tier badges: New (Star), Bronze (Award), Silver (Trophy), Gold (Gem + glow), Diamond (pulse animation)

**Build Output:** ~265KB JS + 19MB WASM (Aleo module)

**Reference:** [04_Frontend_Implementation.md](04_Frontend_Implementation.md)

---

## Phase 9: Testing & Quality Assurance

**Status:** Completed

**Objective:** Establish comprehensive testing across all system layers -- smart contract, facilitator, SDK, and frontend -- with CI/CD automation.

### Key Deliverables

**Smart Contract Tests (19+ test cases):**

| Category | Test IDs | Coverage |
|----------|----------|----------|
| Registration | REG-01 to REG-04 | Valid registration, duplicate rejection, insufficient bond |
| Rating | RAT-01 to RAT-06 | Valid ratings (1-5 stars), invalid ratings (0, 6), min payment, min burn |
| Reputation Update | UPD-01 to UPD-05 | Job count, rating accumulation, revenue, tier upgrades |
| Proof Generation | PRV-01 to PRV-06 | Valid proofs, threshold failures, all proof types |
| Escrow | ESC-01 to ESC-06 | Create, claim (correct/wrong secret), refund (before/after deadline) |

**Facilitator Tests (Jest + supertest):**
- Agent routes: search, filter by service type, filter by tier, pagination, limit cap, 404 handling
- Verify routes: escrow proof validation, reputation proof validation, missing fields
- Health routes: basic status, readiness with block height, disconnection handling

**SDK Tests (Jest):**
- Client SDK: agent search, rating star validation (reject < 1 or > 5)
- Agent SDK: tier calculation (all 5 tiers + dual-requirement check), average rating, escrow secret generation/retrieval
- Crypto utils: randomness uniqueness, job hash determinism, nullifier determinism + uniqueness per pair

**Frontend Tests (Vitest + React Testing Library):**
- Component tests: TierBadge rendering (all tiers, sizes), StarRating (click, readonly, display)
- Store tests: agentStore (reputation set/update, transaction history, 50-item limit, tier upgrade at threshold)

**Integration Test Scenarios:**
1. Full flow: register -> search -> escrow -> deliver -> claim -> rate -> update reputation -> prove
2. Escrow timeout: create -> wait for deadline -> refund
3. Double rating prevention: rate -> attempt re-rate -> verify rejection

**CI/CD (GitHub Actions):**
- 4 parallel jobs: contract-tests, facilitator-tests, sdk-tests, frontend-tests
- Coverage threshold: 80% (branches, functions, lines, statements)
- Triggers: push to main, pull requests to main

**Test Checklist:** 36 items across Smart Contract (19), Facilitator (6), SDK (7), Frontend (7)

**Reference:** [05_Testing_Implementation.md](05_Testing_Implementation.md)

---

## Phase 10: Future Roadmap & Scaling

**Status:** Planned (fully documented)

**Objective:** Scale ShadowAgent from hackathon MVP to production platform to infrastructure protocol over a 3+ year horizon, covering technical evolution, business model, go-to-market, and governance.

### Sub-Phase 10a: Foundation Hardening (Months 1-3)

**Goals:** Stabilize MVP for production, launch on testnet with real users, build initial developer community.

**Technical Deliverables:**
- Security audit by Aleo-specialized firm
- Formal verification of critical transitions
- Fuzzing tests for edge cases
- Bug bounty program launch
- Performance optimization (proof generation, gas consumption, caching)
- Feature completion: dispute resolution, partial refunds, multi-sig escrow, reputation decay
- SDK v1.0 production release with enhanced Client + Agent interfaces
- Infrastructure: PostgreSQL + Redis, Cloudflare CDN, Grafana + Prometheus monitoring

**Product Deliverables:**
- Agent Hub v1 (earnings dashboard, reputation card, proof generator, integration panel)
- Client Discovery App v1 (search, filters, privacy notice)
- Developer documentation, 5 video tutorials, Discord community (500 members target)

### Sub-Phase 10b: Core Platform (Months 4-6)

**Goals:** Launch on mainnet, achieve product-market fit, build sustainable revenue.

**Technical Deliverables:**
- Multi-token support: Aleo credits, USDCx stablecoin, pALEO (Pondo liquid staking)
- Session-based payments at production scale
- Agent specialization categories: Tier 1 (NLP, Vision, Code, Data), Tier 2 (Audio, Multi-modal, Blockchain, Security)
- Enhanced reputation: category-specific stats, time-based reputation, freshness indicators, specialization badges
- Dispute resolution: automated (clear-cut) + arbitration panel (complex) + future DAO vote

**Product Features:**
- Agent Analytics Dashboard (revenue charts, service breakdown, rating distribution, anonymized client insights)
- Client Dashboard (spending stats, favorite agents, active escrows)

**Business Development:** LangChain integration, AutoGPT integration, 20 quality agent partners, 5 enterprise pilots

### Sub-Phase 10c: Ecosystem Expansion (Months 7-12)

**Goals:** Establish as standard for private AI commerce, 100+ agents, launch enterprise features.

**Technical Deliverables:**
- Agent-to-Agent communication protocol (orchestrator pattern, nested escrows, privacy-preserving sub-agent routing)
- Subscription model (basic/pro/enterprise plans, auto-renewal, prorated cancellation)
- Cross-chain reputation bridge research (ZK proof export to Ethereum/Solana as badge NFTs)
- Enterprise features: private agent pools, compliance proofs, audit trails, SOC2/GDPR, SSO, role-based access

**New Product Lines:**
- ShadowAgent Verify (B2B reputation verification API)
- ShadowAgent Connect (3-line integration for any AI service, multi-language support)

### Sub-Phase 10d: Enterprise & Scale (Year 2)

**Goals:** Default private AI commerce layer, 1000+ agents, $10M+/month volume.

**Technical Architecture:**
- L2/Rollup integration: 100x throughput, <$0.001/tx, sub-second finality
- Global multi-region deployment: US-WEST, US-EAST, EU-WEST, ASIA-PAC
- Latency targets: API <50ms, proof verification <100ms, discovery <200ms, TX broadcast <500ms

**Enterprise Products:**
- Deployment options: Cloud Hosted ($5K/mo), Private Cloud ($15K/mo), On-Premise ($50K/mo)
- Custom smart contracts, internal system integrations (SAP, Salesforce), 24/7 support, 99.99% SLA
- Vertical solutions: Healthcare (HIPAA), Finance (trading/risk), Legal (confidentiality), Research (IP protection)

### Sub-Phase 10e: Autonomous Economy (Year 3+)

**Goals:** Autonomous AI economy where agents transact with each other, building trust without human intervention.

**Technical Vision:**
- Human Layer (sets goals) -> Orchestration Layer (planning, execution, verification, learning agents) -> Specialist Layer (NLP, Vision, Code, Data, Audio agents) -> ShadowAgent Protocol (private transactions, reputation, escrow, trust)
- Key innovations needed: non-human identity management, autonomous reputation building, self-improving agent verification, multi-agent coordination, economic incentive alignment

**Governance Evolution:**
- Year 1: Foundation-controlled (quick iteration)
- Year 2: 7-member Council (3 foundation + 4 community)
- Year 3+: Full DAO with token-based governance

**Token Economics ($SHADOW -- future consideration):**
- Utility: fee payment discount, governance voting, arbitration staking, premium access, agent boosting
- Distribution: 40% community, 25% treasury, 20% team (4yr vest), 10% investors, 5% liquidity
- Value accrual: fee buyback/burn, staking rewards, deflationary mechanics

### Business Model

**Revenue Streams:**

| Stream | Model | Year 3 Projection |
|--------|-------|--------------------|
| Transaction Fees | 1% platform fee on all transactions | $2M ARR |
| Premium Features | $49-$199/month (analytics, priority listing, custom proofs) | $500K ARR |
| Enterprise | $5K-$100K/month (private pools, managed service, custom dev) | $3M ARR |
| Ecosystem | $0.001/verification, data insights, revenue share | $500K ARR |
| **Total** | | **$6M ARR** |

**Pricing Tiers:**

| Tier | Price | Fee Rate |
|------|-------|----------|
| Free | $0 | 1% |
| Pro | $49/mo | 0.75% |
| Business | $299/mo | 0.5% |
| Enterprise | Custom | Custom |

### Go-to-Market Strategy

**Target Segments (phased):**
1. AI agent developers (indie, startups) -- "Monetize your AI with verifiable reputation"
2. AI consumers (businesses) -- "Use AI without exposing your data"
3. Enterprises (F500, regulated) -- "Enterprise AI with cryptographic privacy"
4. Agent networks (autonomous platforms) -- "The trust layer for autonomous AI"

**Launch Phases:**
- Phase A: Private Beta (50 agents, 200 clients, 80% retention target)
- Phase B: Public Beta (open registration, testnet, 500 agents / 2000 tx target)
- Phase C: Mainnet Launch (production, PR push, $100K volume first month)
- Phase D: Growth (10x quarter-over-quarter)

### Partnerships

| Tier | Partners | Value |
|------|----------|-------|
| Foundational | Aleo, LangChain, AutoGPT, Hugging Face, Leo Wallet | Infrastructure + reach |
| Distribution | AWS, GCP, Azure, RapidAPI, Replit, Vercel | Marketplace listings |
| Enterprise | Accenture, Deloitte, Salesforce, SAP | Implementation + integration |
| Ecosystem | Zcash, Secret Network, AI safety orgs, academia | Cross-chain + research |

### Risk Mitigation

| Risk Category | Key Risks | Mitigation |
|---------------|-----------|------------|
| Technical | Aleo network issues, smart contract bugs, scaling limitations | Multi-network support, audits + bug bounty + insurance, L2 research |
| Business | Slow adoption, competition, regulatory changes | Community focus, privacy moat, legal counsel |
| Market | AI market downturn, privacy not valued, Aleo ecosystem decline | Diversification, education, multi-chain roadmap |

### Success Metrics

| Metric | Phase 1 Target | Phase 2 Target | Phase 3 Target |
|--------|---------------|---------------|---------------|
| Registered Agents | 50 | 500 | 1,000+ |
| Monthly TX Volume | $10K | $500K | $10M+ |
| SDK Downloads | 1,000 | 10,000 | 100,000+ |
| Enterprise Customers | 0 | 5 | 50+ |

**Reference:** [06_Future_Implementation_Plan.md](06_Future_Implementation_Plan.md), [07_Technical_Flow_Diagrams.md](07_Technical_Flow_Diagrams.md)

---

## Phase 10a: Foundation Hardening — Implemented Features

**Status:** Completed (deployed on Aleo Testnet)

**Contract:** `shadow_agent_ext.aleo`
**Deploy TX:** `at1fpwhdvs77vn37ngxrnty40qxsnwwuccu660e73f409nssjk3vyqqxpx647`

Phase 10a implements four feature groups as a companion contract (`shadow_agent_ext.aleo`) with full-stack support across SDK, facilitator, and frontend.

### Feature Groups

| Feature | On-Chain Transitions | Facilitator Routes | Frontend Page |
|---------|---------------------|-------------------|---------------|
| Partial Refunds | `propose_partial_refund`, `accept_partial_refund`, `reject_partial_refund` | `POST /refunds`, `POST /refunds/:id/accept`, `POST /refunds/:id/reject` | DisputeCenter (Refunds tab) |
| Dispute Resolution | `open_dispute`, `respond_to_dispute`, `resolve_dispute` | `POST /disputes`, `GET /disputes`, `POST /disputes/:id/respond`, `POST /disputes/:id/resolve` | DisputeCenter (Disputes tab) |
| Reputation Decay | `prove_rating_decay`, `prove_tier_with_decay` | SDK `applyDecay()` utility | AgentDashboard (proof generation) |
| Multi-Sig Escrow | `create_multisig_escrow`, `approve_escrow_release`, `refund_multisig_escrow` | `POST /escrows/multisig`, `GET /escrows/multisig/:id`, `POST /escrows/multisig/:id/approve` | ClientDashboard (MultiSigApprovalPanel) |

### Extension Contract (11 Transitions)

| Function | Type | Description |
|----------|------|-------------|
| `propose_partial_refund` | Private | Client proposes an escrow split between agent and client |
| `accept_partial_refund` | Private | Agent accepts the proposed refund split |
| `reject_partial_refund` | Private | Agent rejects the proposed refund split |
| `open_dispute` | Private + Finalize | Client opens a dispute with evidence hash |
| `respond_to_dispute` | Private | Agent submits counter-evidence to dispute |
| `resolve_dispute` | Private + Finalize | Arbitrator resolves dispute with percentage split |
| `prove_rating_decay` | Private + Finalize | ZK prove decayed average rating >= threshold |
| `prove_tier_with_decay` | Private + Finalize | ZK prove tier with decay-adjusted reputation |
| `create_multisig_escrow` | Private | Create multi-signature escrow (2-of-3 or 3-of-3) |
| `approve_escrow_release` | Private | Signer approves escrow release (requires secret) |
| `refund_multisig_escrow` | Private + Finalize | Owner refunds expired multi-sig escrow |

### Extension Records (4)

| Record | Purpose |
|--------|---------|
| `SplitEscrowRecord` | Partial refund split tracking |
| `DisputeRecord` | Dispute lifecycle state |
| `DecayedReputationProof` | Decay-adjusted reputation ZK proof |
| `MultiSigEscrowRecord` | Multi-signature escrow payment |

### Extension Mapping

| Mapping | Key | Value | Purpose |
|---------|-----|-------|---------|
| `active_disputes` | `field` | `boolean` | Track open disputes by job hash |

### Combined On-Chain Summary

| Metric | Core | Extension | Total |
|--------|------|-----------|-------|
| Transitions | 12 | 11 | **23** |
| Mappings | 3 | 1 | **4** |
| Records | 5 | 4 | **9** |

---

## Cross-Reference Index

| Document | Phases Covered | Key Content |
|----------|---------------|-------------|
| `01_Smart_Contract_Implementation.md` | 1, 2, 3, 4, 5 | Leo code, data structures, transitions, proofs, escrow, sessions |
| `02_Facilitator_Implementation.md` | 6 | Express server, routes, services, indexer |
| `03_SDK_Implementation.md` | 7 | TypeScript SDKs (client + agent), middleware, crypto utils |
| `04_Frontend_Implementation.md` | 8 | React app, wallet integration, design system, on-chain queries |
| `05_Testing_Implementation.md` | 9 | Unit/integration/E2E tests, CI/CD, coverage |
| `06_Future_Implementation_Plan.md` | 10 | 5 future sub-phases, business model, GTM, partnerships, KPIs |
| `07_Technical_Flow_Diagrams.md` | 2, 3, 4, 5 | Registration, x402, escrow, rating, session, proof flows |
| `Deployment_Status.md` | 2, 10a | On-chain TX IDs, mappings, contract functions (core + extension), network config |

---

## Deployment Evidence

### Core Contract

**Contract:** `shadow_agent.aleo` on Aleo Testnet

**Deployment TX:** `at105knrkmfhsc8mlzd3sz5nmk2vy4jnsjdktdwq4fr236jcssasvpqp2sv9p`

**Confirmed Transitions:**

| Transition | TX ID | Result |
|-----------|-------|--------|
| `register_agent` | `at1hr25c...qzgp` | Confirmed |
| `create_escrow` | `at197amq...efpp` | Confirmed |
| `submit_rating` | `at1qv5p2...agqv` | Confirmed |

**Core Contract Functions (12):**

| Function | Type |
|----------|------|
| `register_agent` | Public + Finalize |
| `unregister_agent` | Public + Finalize |
| `submit_rating` | Public + Finalize |
| `update_listing` | Public + Finalize |
| `update_reputation` | Private |
| `create_escrow` | Private |
| `claim_escrow` | Private |
| `refund_escrow` | Private |
| `prove_tier` | Private |
| `prove_jobs` | Private |
| `prove_rating` | Private |
| `prove_revenue_range` | Private |

### Extension Contract (Phase 10a)

**Contract:** `shadow_agent_ext.aleo` on Aleo Testnet

**Deployment TX:** `at1fpwhdvs77vn37ngxrnty40qxsnwwuccu660e73f409nssjk3vyqqxpx647`

**Extension Contract Functions (11):**

| Function | Type |
|----------|------|
| `propose_partial_refund` | Private |
| `accept_partial_refund` | Private |
| `reject_partial_refund` | Private |
| `open_dispute` | Private + Finalize |
| `respond_to_dispute` | Private |
| `resolve_dispute` | Private + Finalize |
| `prove_rating_decay` | Private + Finalize |
| `prove_tier_with_decay` | Private + Finalize |
| `create_multisig_escrow` | Private |
| `approve_escrow_release` | Private |
| `refund_multisig_escrow` | Private + Finalize |

### Network Configuration

| Setting | Value |
|---------|-------|
| Network | Aleo Testnet |
| RPC | `https://api.explorer.provable.com/v1` |
| Explorer | `https://explorer.aleo.org` |

**Total on-chain:** 23 transitions, 4 mappings, 9 records across 2 deployed contracts.

---

*End of 10-Phase Master Plan*
