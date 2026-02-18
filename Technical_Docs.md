# ShadowAgent Technical Documentation

## Version 2.0 | Aleo Buildathon

---

# Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Design](#2-architecture-design)
3. [Data Models & Records](#3-data-models--records)
4. [Smart Contract Specifications](#4-smart-contract-specifications)
5. [API Specifications](#5-api-specifications)
6. [Security Model](#6-security-model)
7. [Cryptographic Primitives](#7-cryptographic-primitives)
8. [Integration Specifications](#8-integration-specifications)
9. [Deployment Guide](#9-deployment-guide)
10. [Testing Strategy](#10-testing-strategy)

---

# 1. System Overview

## 1.1 Purpose

ShadowAgent is a privacy-preserving AI agent marketplace built on Aleo that enables:
- Zero-knowledge reputation attestation for AI service providers
- Anonymous service consumption for clients
- Sybil-resistant rating mechanisms
- Fair exchange through private escrow

## 1.2 Core Problem Statement

Current AI agent marketplaces (e.g., Amiko on Solana) expose all transaction data publicly:
- Client identities and spending patterns
- Agent revenue and client lists
- Service usage frequency and timing
- Rating histories linked to identities

This creates a surveillance infrastructure incompatible with enterprise AI adoption, personal privacy, and sensitive use cases.

## 1.3 Solution Architecture

ShadowAgent separates public discovery from private transactions:

| Layer | Visibility | Purpose |
|-------|------------|---------|
| Discovery Layer | Public | Agent listings, verified tier badges, service types |
| Transaction Layer | Private | Payments, job details, client identities |
| Reputation Layer | Private | Individual ratings, revenue amounts, client history |
| Proof Layer | Selective | ZK attestations of aggregate reputation thresholds |

## 1.4 Key Innovations

1. **Rolling Reputation Model**: O(1) complexity for reputation proofs
2. **Burn-to-Rate Sybil Resistance**: Economic cost for rating submission
3. **Bond-Based Identity Gating**: 10-credit stake per agent registration
4. **Private Escrow with HTLC**: Trustless fair exchange
5. **Semi-Private Discovery**: Public listings with private backing data

---

# 2. Architecture Design

## 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           SHADOWAGENT ARCHITECTURE                           │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                         CLIENT LAYER                                  │   │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  │   │
│  │  │  Web App    │  │  CLI Tool   │  │  SDK        │  │  AI Agent   │  │   │
│  │  │  (React)    │  │  (Node.js)  │  │  (TS/Python)│  │  Integration│  │   │
│  │  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  │   │
│  └─────────┼────────────────┼────────────────┼────────────────┼─────────┘   │
│            │                │                │                │              │
│            ▼                ▼                ▼                ▼              │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                       PROTOCOL LAYER                                  │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    x402 Payment Handler                          │ │   │
│  │  │  • HTTP 402 Response Generation                                  │ │   │
│  │  │  • Payment Terms Encoding                                        │ │   │
│  │  │  • Proof Verification                                            │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                    Facilitator Service                           │ │   │
│  │  │  • HTTP ↔ Aleo Bridge                                           │ │   │
│  │  │  • Proof Relay                                                   │ │   │
│  │  │  • Discovery Indexing                                            │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                      │                                       │
│                                      ▼                                       │
│  ┌──────────────────────────────────────────────────────────────────────┐   │
│  │                        ALEO NETWORK LAYER                             │   │
│  │  ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐       │   │
│  │  │ shadow_agent    │  │ shadow_agent    │  │ shadow_agent    │       │   │
│  │  │ .aleo           │  │ _ext.aleo       │  │ _session.aleo   │       │   │
│  │  │                 │  │                 │  │                 │       │   │
│  │  │ • Registration  │  │ • Disputes      │  │ • Sessions      │       │   │
│  │  │ • Reputation    │  │ • Refunds       │  │ • Policies      │       │   │
│  │  │ • Escrow        │  │ • Decay Proofs  │  │ • Receipts      │       │   │
│  │  │ • ZK Proofs     │  │ • Multi-Sig     │  │ • Rate Limits   │       │   │
│  │  │                 │  │                 │  │                 │       │   │
│  │  └─────────────────┘  └─────────────────┘  └─────────────────┘       │   │
│  │                                                                       │   │
│  │  ┌─────────────────────────────────────────────────────────────────┐ │   │
│  │  │                      ON-CHAIN STATE                              │ │   │
│  │  │  Mappings (Public):           Records (Private):                 │ │   │
│  │  │  • agent_listings             • AgentReputation                  │ │   │
│  │  │  • used_nullifiers            • RatingRecord                     │ │   │
│  │  │  • registered_agents          • EscrowRecord                     │ │   │
│  │  │  • active_disputes            • ReputationProof                  │ │   │
│  │  │  • active_sessions            • PaymentSession + more            │ │   │
│  │  └─────────────────────────────────────────────────────────────────┘ │   │
│  └──────────────────────────────────────────────────────────────────────┘   │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 2.2 Component Interactions

### 2.2.1 Agent Registration Flow

```
┌────────┐     ┌────────────┐     ┌─────────────┐
│  Agent │     │ Facilitator│     │ Aleo Network│
└───┬────┘     └─────┬──────┘     └──────┬──────┘
    │                │                   │
    │ 1. Register    │                   │
    │  (bond: 10 cr) │                   │
    │ ───────────────>                   │
    │                │                   │
    │                │ 2. register_agent │
    │                │  (stake bond)     │
    │                │ ─────────────────>│
    │                │                   │
    │                │                   │ 3. Verify not
    │                │                   │    already registered
    │                │                   │    (registered_agents)
    │                │                   │
    │                │                   │ 4. Create Records
    │                │                   │    + Listing
    │                │                   │
    │ 5. AgentReputation + AgentBond     │
    │ <───────────────────────────────────
    │                │                   │
```

### 2.2.2 Service Purchase Flow

```
┌────────┐     ┌────────┐     ┌────────────┐     ┌─────────────┐
│ Client │     │  Agent │     │ Facilitator│     │ Aleo Network│
└───┬────┘     └───┬────┘     └─────┬──────┘     └──────┬──────┘
    │              │                │                   │
    │ 1. GET /api  │                │                   │
    │ ─────────────>                │                   │
    │              │                │                   │
    │ 2. HTTP 402  │                │                   │
    │ <─────────────                │                   │
    │              │                │                   │
    │ 3. create_escrow              │                   │
    │ ─────────────────────────────────────────────────>│
    │              │                │                   │
    │              │                │   4. EscrowRecord │
    │ <─────────────────────────────────────────────────│
    │              │                │                   │
    │ 5. GET /api + Escrow Proof    │                   │
    │ ─────────────>                │                   │
    │              │                │                   │
    │              │ 6. Verify Proof│                   │
    │              │ ───────────────>                   │
    │              │                │                   │
    │ 7. Service + Secret           │                   │
    │ <─────────────                │                   │
    │              │                │                   │
    │              │ 8. claim_escrow│                   │
    │              │ ───────────────────────────────────>
    │              │                │                   │
    │ 9. submit_rating (with burn)  │                   │
    │ ─────────────────────────────────────────────────>│
    │              │                │                   │
    │              │ 10. update_reputation              │
    │              │ ───────────────────────────────────>
    │              │                │                   │
```

### 2.2.3 Reputation Proof Flow

```
┌────────┐     ┌────────┐     ┌─────────────┐
│ Client │     │  Agent │     │ Aleo Network│
└───┬────┘     └───┬────┘     └──────┬──────┘
    │              │                 │
    │ 1. Request   │                 │
    │    Proof     │                 │
    │ ─────────────>                 │
    │              │                 │
    │              │ 2. prove_tier   │
    │              │ ────────────────>
    │              │                 │
    │              │                 │ 3. ZK Circuit
    │              │                 │    Execution
    │              │                 │ ───────────>
    │              │                 │
    │              │ 4. ReputationProof
    │              │ <────────────────
    │              │                 │
    │ 5. Proof     │                 │
    │ <─────────────                 │
    │              │                 │
    │ 6. Verify    │                 │
    │ ─────────────────────────────>│
    │              │                 │
    │ 7. Valid/Invalid              │
    │ <─────────────────────────────│
    │              │                 │
```

## 2.3 Network Topology

```
┌─────────────────────────────────────────────────────────────────────────┐
│                        DEPLOYMENT TOPOLOGY                               │
├─────────────────────────────────────────────────────────────────────────┤
│                                                                          │
│  REGION A (Primary)              REGION B (Secondary)                   │
│  ┌─────────────────────┐         ┌─────────────────────┐               │
│  │ Facilitator Node 1  │◄───────►│ Facilitator Node 2  │               │
│  │ • x402 Handler      │   Sync  │ • x402 Handler      │               │
│  │ • Discovery Index   │         │ • Discovery Index   │               │
│  └──────────┬──────────┘         └──────────┬──────────┘               │
│             │                               │                           │
│             ▼                               ▼                           │
│  ┌─────────────────────────────────────────────────────────────────┐   │
│  │                      ALEO NETWORK                                │   │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐             │   │
│  │  │Validator│  │Validator│  │Validator│  │Validator│             │   │
│  │  │  Node 1 │  │  Node 2 │  │  Node 3 │  │  Node N │             │   │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘             │   │
│  └─────────────────────────────────────────────────────────────────┘   │
│                                                                          │
│  CLIENT DISTRIBUTION                                                    │
│  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐      │
│  │ Web App │  │   CLI   │  │AI Agent │  │AI Agent │  │   SDK   │      │
│  │  User   │  │  User   │  │Provider │  │Consumer │  │Developer│      │
│  └─────────┘  └─────────┘  └─────────┘  └─────────┘  └─────────┘      │
│                                                                          │
└─────────────────────────────────────────────────────────────────────────┘
```

---

# 3. Data Models & Records

## 3.1 Record Types Overview

| Record Type | Visibility | Purpose | Owner |
|-------------|------------|---------|-------|
| AgentReputation | Private | Cumulative reputation data | Agent |
| RatingRecord | Private | Individual job rating | Agent (transferred from Client) |
| EscrowRecord | Private | Locked payment for fair exchange | Client → Agent |
| ReputationProof | Private | ZK attestation output | Agent |

## 3.2 AgentReputation Record

### Purpose
Stores the cumulative reputation statistics for an agent. Uses rolling updates for O(1) proof generation.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Agent's Aleo address | Must match caller |
| agent_id | field | Unique identifier derived from address | Hash of owner address |
| total_jobs | u64 | Cumulative completed job count | Increments only |
| total_rating_points | u64 | Sum of all ratings (scaled x10) | Range: 0 to max_u64 |
| total_revenue | u64 | Lifetime revenue in microcents | Increments only |
| tier | u8 | Computed reputation tier | Range: 0-4 |
| created_at | u64 | Block height of registration | Immutable after creation |
| last_updated | u64 | Block height of last update | Updates on each job |

### Tier Calculation Logic

| Tier | Name | Required Jobs | Required Revenue |
|------|------|---------------|------------------|
| 0 | New | 0 | $0 |
| 1 | Bronze | 10+ | $100+ |
| 2 | Silver | 50+ | $1,000+ |
| 3 | Gold | 200+ | $10,000+ |
| 4 | Diamond | 1,000+ | $100,000+ |

### Average Rating Calculation

```
average_rating = (total_rating_points * 10) / total_jobs
```

Example: 470 points from 100 jobs = 4.7 stars

## 3.3 RatingRecord

### Purpose
Represents a single job completion and rating. Consumed by agent to update their rolling reputation.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Agent receiving the rating | Transferred on creation |
| client_nullifier | field | Hash preventing double-rating | Unique per client+job |
| job_hash | field | Unique job identifier | Hash of job parameters |
| rating | u8 | Star rating scaled x10 | Range: 1-50 (0.1 to 5.0 stars) |
| payment_amount | u64 | Payment for this job in microcents | Min: 100,000 ($0.10) |
| burn_proof | field | Proof that rating fee was burned | Required for Sybil resistance |
| timestamp | u64 | Block height of rating submission | Set on creation |

### Rating Scale

| Value | Stars | Description |
|-------|-------|-------------|
| 10 | 1.0 ★ | Poor |
| 20 | 2.0 ★★ | Below Average |
| 30 | 3.0 ★★★ | Average |
| 40 | 4.0 ★★★★ | Good |
| 50 | 5.0 ★★★★★ | Excellent |

## 3.4 EscrowRecord

### Purpose
Implements Hash Time-Locked Contract (HTLC) for fair exchange between client and agent.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Current owner (starts as client) | Transfers to agent on claim |
| agent | address | Service provider | Immutable |
| amount | u64 | Locked payment amount | Min: 100,000 microcents |
| job_hash | field | Unique job identifier | Links to RatingRecord |
| deadline | u64 | Block height for timeout | Must be future block |
| secret_hash | field | Hash of delivery secret | Agent knows preimage |
| status | u8 | Escrow state | 0=Locked, 1=Released, 2=Refunded |

### State Transitions

```
                    ┌─────────────────┐
                    │     LOCKED      │
                    │    (status=0)   │
                    └────────┬────────┘
                             │
              ┌──────────────┴──────────────┐
              │                             │
              ▼                             ▼
    ┌─────────────────┐          ┌─────────────────┐
    │    RELEASED     │          │    REFUNDED     │
    │   (status=1)    │          │   (status=2)    │
    │                 │          │                 │
    │ Agent reveals   │          │ Deadline passed │
    │ secret, claims  │          │ Client reclaims │
    └─────────────────┘          └─────────────────┘
```

## 3.5 ReputationProof

### Purpose
Output of ZK reputation attestation. Shareable proof that agent meets certain thresholds.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Agent who generated proof | Must be proof generator |
| proof_type | u8 | Type of attestation | 1=Rating, 2=Jobs, 3=Revenue, 4=Tier |
| threshold_met | bool | Whether threshold was satisfied | Always true (assert fails otherwise) |
| tier_proven | u8 | Agent's tier at proof time | Range: 0-4 |
| generated_at | u64 | Block height of proof generation | Set on creation |

### Proof Types

| Type | Value | What It Proves |
|------|-------|----------------|
| Rating | 1 | "My average rating is ≥ X stars" |
| Jobs | 2 | "I have completed ≥ N jobs" |
| Revenue | 3 | "My lifetime revenue is in range [X, Y]" |
| Tier | 4 | "My tier is ≥ T" |

## 3.6 PublicListing Struct

### Purpose
Public discovery information for agents. Stored in on-chain mapping.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| agent_id | field | Links to private AgentReputation | Hash of agent address |
| service_type | u8 | Category of service offered | See Service Types table |
| endpoint_hash | field | Hash of service URL | IPFS or HTTP endpoint |
| min_tier | u8 | Minimum proven tier for display | Updated via proofs |
| is_active | bool | Whether agent is accepting jobs | Toggle by agent |

### Service Types

| Value | Type | Description |
|-------|------|-------------|
| 1 | NLP | Natural Language Processing |
| 2 | Vision | Computer Vision / Image Analysis |
| 3 | Code | Code Generation / Review |
| 4 | Data | Data Analysis / Processing |
| 5 | Audio | Speech / Audio Processing |
| 6 | Multi | Multi-modal AI |
| 7 | Custom | Custom / Other |

## 3.7 PaymentSession Record

### Purpose
Enables session-based payments for scalable micropayments. Sign once, transact unlimited times within bounds.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Client (record owner) | Must match session creator |
| agent | address | Authorized agent | Immutable after creation |
| session_id | field | Unique identifier | Hash of session params |
| nonce | field | Replay protection | Random per session |
| max_total | u64 | Maximum total spend | Must be > 0 |
| max_per_request | u64 | Maximum per request | Must be ≤ max_total |
| rate_limit | u64 | Max requests per 100 blocks | Must be > 0 |
| spent | u64 | Running total spent | Updated off-chain |
| request_count | u64 | Number of requests | Updated off-chain |
| valid_until | u64 | Expiry block height | Future block required |
| status | u8 | Session state | 0=Active, 1=Paused, 2=Closed |
| commitment | field | Hash of session params | For verification |

### Session State Transitions

```
                    ┌──────────────┐
                    │   CREATED    │
                    │  (On-chain)  │
                    └──────┬───────┘
                           │ Funds locked
                           ▼
                    ┌──────────────┐
                    │    ACTIVE    │◄────────────┐
                    │              │             │
                    └──────┬───────┘             │
                           │                     │ Top-up
            ┌──────────────┼──────────────┐     │
            ▼              ▼              ▼     │
     ┌────────────┐ ┌────────────┐ ┌────────────┐
     │  REQUEST   │ │  PARTIAL   │ │  TOPPED    │
     │ PROCESSED  │ │  SETTLE    │ │    UP      │──┘
     └─────┬──────┘ └─────┬──────┘ └────────────┘
           │              │
           ▼              ▼
     ┌─────────────────────────────────────────┐
     │              EXHAUSTED                   │
     │  (Budget depleted OR expired OR closed) │
     └──────────────────┬──────────────────────┘
                        │
                        ▼
                 ┌──────────────┐
                 │   SETTLED    │
                 │  (On-chain)  │
                 └──────────────┘
```

## 3.8 SpendingPolicy Record (Autonomous Agents)

### Purpose
Allows humans to delegate spending authority to their AI agents within defined bounds.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Human owner | Policy creator |
| authorized_agent | address | AI agent that can spend | Must be specified |
| daily_max | u64 | Maximum daily spend | Auto-resets every ~24h |
| monthly_max | u64 | Maximum monthly spend | Auto-resets every ~30d |
| per_vendor_max | u64 | Max per external agent | Prevents concentration |
| allowed_categories | u64 | Bitmask of ServiceTypes | Filter vendors |
| min_vendor_tier | u8 | Minimum vendor tier | Quality control |
| spent_today | u64 | Today's spending | Rolling counter |
| spent_this_month | u64 | Month's spending | Rolling counter |
| valid_until | u64 | Policy expiry | Block height |
| status | u8 | Policy state | 0=Active, 1=Paused, 2=Revoked |

## 3.9 On-Chain Mappings

### agent_listings
```
mapping agent_listings: field => PublicListing
```
- Key: agent_id (field)
- Value: PublicListing struct
- Purpose: Public agent discovery

### used_nullifiers
```
mapping used_nullifiers: field => bool
```
- Key: client_nullifier (field)
- Value: boolean (true if used)
- Purpose: Prevent double-rating attacks

### registered_agents
```
mapping registered_agents: address => bool
```
- Key: Agent's Aleo address
- Value: boolean (true if registered)
- Purpose: One agent per address (Sybil resistance via bond staking)

---

# 4. Smart Contract Specifications

## 4.1 Program Overview

| Program | Purpose | Dependencies |
|---------|---------|--------------|
| shadow_agent.aleo | Core marketplace logic | credits.aleo |

## 4.2 Constants

| Constant | Value | Unit | Purpose |
|----------|-------|------|---------|
| RATING_BURN_COST | 500,000 | microcredits | Cost to submit rating |
| MIN_PAYMENT_FOR_RATING | 100,000 | microcents | Minimum job value |
| BRONZE_JOBS | 10 | jobs | Bronze tier threshold |
| BRONZE_REVENUE | 10,000,000 | microcents ($100) | Bronze tier threshold |
| SILVER_JOBS | 50 | jobs | Silver tier threshold |
| SILVER_REVENUE | 100,000,000 | microcents ($1,000) | Silver tier threshold |
| GOLD_JOBS | 200 | jobs | Gold tier threshold |
| GOLD_REVENUE | 1,000,000,000 | microcents ($10,000) | Gold tier threshold |
| DIAMOND_JOBS | 1,000 | jobs | Diamond tier threshold |
| DIAMOND_REVENUE | 10,000,000,000 | microcents ($100,000) | Diamond tier threshold |

## 4.3 Transition Specifications

### 4.3.1 register_agent

**Purpose**: Register a new agent with bond staking for Sybil resistance.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| service_type | u8 | Private | Agent's service category |
| endpoint_hash | field | Private | Hash of service endpoint URL |
| bond_amount | u64 | Private | Bond stake (min 10 credits / 10,000,000 microcredits) |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| AgentReputation | Record | Initial reputation record |
| AgentBond | Record | Bond stake record (returned on unregister) |

**Finalize Effects**:
- Verifies caller address not previously registered via `registered_agents` mapping
- Marks address as registered
- Creates PublicListing in `agent_listings` mapping

**Failure Conditions**:
- Address already registered
- Bond amount below minimum (10 credits)

### 4.3.2 submit_rating

**Purpose**: Submit a private rating for a completed job with burn mechanism.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| agent_address | address | Private | Agent being rated |
| job_hash | field | Private | Unique job identifier |
| rating | u8 | Private | Rating value (1-50) |
| payment_amount | u64 | Private | Job payment amount |
| burn_amount | u64 | Private | Credits to burn (≥500,000) |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| RatingRecord | Record | Rating record owned by agent |

**Finalize Effects**:
- Verifies client_nullifier not previously used
- Marks nullifier as used
- Burns specified credits

**Failure Conditions**:
- Rating out of range (1-50)
- Payment below minimum
- Burn amount insufficient
- Nullifier already used (double-rating attempt)

### 4.3.3 update_reputation

**Purpose**: Agent consumes rating to update rolling reputation.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| current_rep | AgentReputation | Private | Agent's current reputation record |
| new_rating | RatingRecord | Private | Rating record to incorporate |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| AgentReputation | Record | Updated reputation record |

**State Changes**:
- total_jobs incremented by 1
- total_rating_points increased by rating value
- total_revenue increased by payment amount
- tier recalculated based on new values
- last_updated set to current block height

**Failure Conditions**:
- Rating owner doesn't match reputation owner
- Invalid record ownership

### 4.3.4 prove_rating

**Purpose**: Generate ZK proof of minimum average rating.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| reputation | AgentReputation | Private | Agent's reputation record |
| min_rating | u8 | Public | Minimum rating threshold (scaled x10) |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| ReputationProof | Record | Proof of rating threshold |

**Calculation**:
```
avg_rating = (total_rating_points * 10) / total_jobs
assert(avg_rating >= min_rating)
```

**Failure Conditions**:
- Average rating below threshold

### 4.3.5 prove_jobs

**Purpose**: Generate ZK proof of minimum job count.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| reputation | AgentReputation | Private | Agent's reputation record |
| min_jobs | u64 | Public | Minimum job count |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| ReputationProof | Record | Proof of job count threshold |

**Failure Conditions**:
- Job count below threshold

### 4.3.6 prove_revenue_range

**Purpose**: Generate ZK proof of revenue within range (extra privacy).

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| reputation | AgentReputation | Private | Agent's reputation record |
| min_revenue | u64 | Public | Minimum revenue |
| max_revenue | u64 | Public | Maximum revenue |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| ReputationProof | Record | Proof of revenue range |

**Failure Conditions**:
- Revenue outside specified range

### 4.3.7 prove_tier

**Purpose**: Generate ZK proof of minimum tier level.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| reputation | AgentReputation | Private | Agent's reputation record |
| required_tier | u8 | Public | Minimum tier (0-4) |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| ReputationProof | Record | Proof of tier threshold |

**Failure Conditions**:
- Tier below required level

### 4.3.8 create_escrow

**Purpose**: Client locks payment for fair exchange.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| agent | address | Private | Agent to receive payment |
| amount | u64 | Private | Payment amount |
| job_hash | field | Private | Unique job identifier |
| secret_hash | field | Private | Hash of delivery secret |
| blocks_until_deadline | u64 | Private | Timeout in blocks |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| EscrowRecord | Record | Locked escrow owned by client |

### 4.3.9 claim_escrow

**Purpose**: Agent claims payment by revealing secret.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| escrow | EscrowRecord | Private | Escrow to claim |
| secret | field | Private | Preimage of secret_hash |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| EscrowRecord | Record | Released escrow owned by agent |

**Failure Conditions**:
- Secret doesn't match hash
- Caller is not the agent
- Deadline has passed

### 4.3.10 refund_escrow

**Purpose**: Client reclaims payment after deadline.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| escrow | EscrowRecord | Private | Escrow to refund |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| EscrowRecord | Record | Refunded escrow owned by client |

**Failure Conditions**:
- Caller is not original owner
- Deadline has not passed
- Escrow already released or refunded

---

# 5. API Specifications

## 5.1 x402 HTTP Protocol

### 5.1.1 Payment Required Response

**Status Code**: 402

**Headers**:
| Header | Value | Description |
|--------|-------|-------------|
| PAYMENT-REQUIRED | Base64 JSON | Payment terms |
| Content-Type | application/json | Response format |

**Payment Terms Schema**:
```
{
  "price": number,           // Amount in microcents
  "network": string,         // "aleo:mainnet" or "aleo:testnet"
  "address": string,         // Agent's Aleo address
  "escrow_required": boolean,// Whether escrow is mandatory
  "secret_hash": string,     // Hash for HTLC (if escrow required)
  "deadline_blocks": number, // Blocks until timeout
  "description": string      // Human-readable service description
}
```

### 5.1.2 Payment Proof Request

**Headers**:
| Header | Value | Description |
|--------|-------|-------------|
| X-ESCROW-PROOF | Base64 JSON | ZK proof of escrow |
| X-JOB-HASH | string | Unique job identifier |

**Escrow Proof Schema**:
```
{
  "proof": string,           // Aleo ZK proof
  "nullifier": string,       // Escrow nullifier
  "commitment": string       // Escrow commitment
}
```

### 5.1.3 Successful Response

**Status Code**: 200

**Headers**:
| Header | Value | Description |
|--------|-------|-------------|
| X-DELIVERY-SECRET | string | Secret for escrow claim |
| X-JOB-ID | string | Job identifier for rating |

## 5.2 Facilitator API

### 5.2.1 Discovery Endpoints

#### GET /agents
Search for agents by criteria.

**Query Parameters**:
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| service_type | number | No | Filter by service type |
| min_tier | number | No | Minimum tier (0-4) |
| is_active | boolean | No | Only active agents |
| limit | number | No | Max results (default 20) |
| offset | number | No | Pagination offset |

**Response Schema**:
```
{
  "agents": [
    {
      "agent_id": string,
      "service_type": number,
      "tier": number,
      "endpoint": string,
      "is_active": boolean
    }
  ],
  "total": number,
  "limit": number,
  "offset": number
}
```

#### GET /agents/:agent_id
Get agent details.

**Response Schema**:
```
{
  "agent_id": string,
  "service_type": number,
  "tier": number,
  "endpoint": string,
  "is_active": boolean,
  "proofs": [
    {
      "type": string,
      "threshold": number,
      "verified": boolean,
      "generated_at": number
    }
  ]
}
```

### 5.2.2 Proof Verification Endpoints

#### POST /verify/escrow
Verify escrow proof.

**Request Body**:
```
{
  "proof": string,
  "expected_agent": string,
  "min_amount": number
}
```

**Response Schema**:
```
{
  "valid": boolean,
  "error": string | null
}
```

#### POST /verify/reputation
Verify reputation proof.

**Request Body**:
```
{
  "proof": string,
  "proof_type": number,
  "threshold": number
}
```

**Response Schema**:
```
{
  "valid": boolean,
  "tier": number,
  "error": string | null
}
```

## 5.3 SDK Interface Specifications

### 5.3.1 Client SDK Interface

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| constructor | config: ClientConfig | void | Initialize client |
| request | url: string, options?: RequestInit | Promise<Response> | Make x402 request |
| searchAgents | filters: AgentFilters | Promise<AgentListing[]> | Search agents |
| submitRating | params: RatingParams | Promise<void> | Submit job rating |
| verifyProof | proof: ReputationProof | Promise<boolean> | Verify agent proof |

### 5.3.2 Agent SDK Interface

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| constructor | config: AgentConfig | void | Initialize agent |
| register | params: RegistrationParams | Promise<AgentReputation> | Register as agent |
| middleware | pricePerRequest: number | ExpressMiddleware | x402 middleware |
| claimPayment | escrow: EscrowRecord, secret: string | Promise<void> | Claim escrow |
| updateReputation | rating: RatingRecord | Promise<AgentReputation> | Update reputation |
| proveReputation | type: ProofType, threshold: number | Promise<ReputationProof> | Generate proof |

---

# 6. Security Model

## 6.1 Threat Model

### 6.1.1 Attacker Capabilities

| Attacker Type | Capabilities | Mitigations |
|---------------|--------------|-------------|
| Malicious Agent | Create fake ratings, inflate reputation | Burn-to-rate, bond staking |
| Malicious Client | Double-spend, refuse payment | Escrow HTLC |
| Network Observer | Transaction correlation | Private records, timing obfuscation |
| Sybil Attacker | Create multiple identities | Bond staking (10 credits/agent) |
| Front-runner | Observe and exploit transactions | Private records hide amounts |

### 6.1.2 Security Properties

| Property | Implementation | Verification |
|----------|----------------|--------------|
| Payment Privacy | Aleo private records | Transaction analysis |
| Reputation Integrity | Rolling hash chain | ZK verification |
| Sybil Resistance | Bond staking + burn mechanism | Economic analysis |
| Fair Exchange | HTLC escrow | Game-theoretic proof |
| Non-repudiation | Nullifier tracking | Double-spend impossible |

## 6.2 Sybil Resistance Analysis

### 6.2.1 Attack Cost Calculation

To fake Gold Tier (200 jobs, $10k revenue):

| Component | Cost per Unit | Quantity | Total Cost |
|-----------|---------------|----------|------------|
| Registration bond | 10 credits | 1 | 10 credits per agent |
| Rating burn | 0.5 credits | 200 | 100 credits |
| Gas fees | ~0.001 credits | 200 | 0.2 credits |
| Minimum payments | $0.10 | 200 | $20 (self-paid) |

**Result**: Sybil attack is economically irrational — 110+ credits burned per fake agent for manufactured reputation.

### 6.2.2 Defense Layers

```
┌─────────────────────────────────────────────────────────────────────┐
│                      SYBIL DEFENSE LAYERS                            │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  Layer 1: Bond Staking (10 credits per agent)                       │
│  ├── Economic barrier: 10 credits locked per registration           │
│  ├── Creating N fake agents costs N × 10 credits                   │
│  └── Bond reclaimable on unregister (honest agents get funds back)  │
│                                                                      │
│  Layer 2: Economic Burn (Burn-to-Rate)                              │
│  ├── Every rating costs 0.5 credits                                 │
│  ├── Cost scales linearly with fake ratings                         │
│  └── Makes large-scale attacks expensive                            │
│                                                                      │
│  Layer 3: Payment Weighting                                         │
│  ├── Higher payments = More reputation weight                       │
│  ├── Dust attacks have minimal impact                               │
│  └── Real economic activity dominates                               │
│                                                                      │
│  Layer 4: Minimum Thresholds                                        │
│  ├── Jobs under $0.10 cannot generate ratings                       │
│  ├── Prevents micro-transaction spam                                │
│  └── Ensures economic substance                                     │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 6.3 Privacy Guarantees

### 6.3.1 Information Disclosure Matrix

| Information | Client | Agent | Network | Facilitator |
|-------------|--------|-------|---------|-------------|
| Payment amount | ✓ | ✓ | ✗ | ✗ |
| Payer identity | ✓ | ✗ | ✗ | ✗ |
| Recipient identity | ✗ | ✓ | ✗ | ✗ |
| Job details | ✓ | ✓ | ✗ | ✗ |
| Rating value | ✓ | ✓ | ✗ | ✗ |
| Aggregate stats | ✗ | ✓ | ✗ | ✗ |
| Tier badge | ✗ | ✓ | ✓ | ✓ |

### 6.3.2 Zero-Knowledge Properties

| Proof Type | Public Input | Private Input | Proven Statement |
|------------|--------------|---------------|------------------|
| prove_rating | min_rating | AgentReputation | "avg rating ≥ threshold" |
| prove_jobs | min_jobs | AgentReputation | "job count ≥ threshold" |
| prove_revenue | min, max | AgentReputation | "revenue in range" |
| prove_tier | required_tier | AgentReputation | "tier ≥ required" |

## 6.4 Escrow Security

### 6.4.1 HTLC Security Properties

| Property | Guarantee | Mechanism |
|----------|-----------|-----------|
| Atomicity | Payment and delivery are linked | Secret hash |
| Timeout | Funds never locked forever | Block height deadline |
| Non-custodial | No third party holds funds | On-chain records |
| Privacy | Amount hidden from network | Private records |

### 6.4.2 Escrow State Machine Security

| State | Valid Transitions | Authorization |
|-------|-------------------|---------------|
| Locked | Released, Refunded | N/A |
| Released | None (terminal) | Agent with secret |
| Refunded | None (terminal) | Client after deadline |

---

# 7. Cryptographic Primitives

## 7.1 Hash Functions

### 7.1.1 BHP256

**Usage**: Primary hash function for Aleo

**Applications in ShadowAgent**:
- Agent ID generation: `agent_id = BHP256::hash_to_field(owner_address)`
- Client nullifier: `nullifier = BHP256::hash_to_field(client_address + job_hash)`
- Secret hash: `secret_hash = BHP256::hash_to_field(secret)`
- Burn proof: `burn_proof = BHP256::hash_to_field(burn_amount + block_height)`

### 7.1.2 Poseidon

**Usage**: ZK-friendly hash function

**Applications**:
- Merkle tree construction (if needed for future features)
- Commitment schemes

## 7.2 Zero-Knowledge Circuits

### 7.2.1 Proof Generation

| Proof | Circuit Complexity | Proving Time (Est.) |
|-------|-------------------|---------------------|
| prove_rating | O(1) | ~1-2 seconds |
| prove_jobs | O(1) | ~1 second |
| prove_revenue | O(1) | ~1-2 seconds |
| prove_tier | O(1) | ~1 second |
| escrow verification | O(1) | ~1 second |

### 7.2.2 Verification

All proofs are verified on-chain with constant-time verification (~O(1)).

## 7.3 Record Encryption

### 7.3.1 Aleo Record Model

- Records encrypted with owner's view key
- Only owner can decrypt and view contents
- Network sees encrypted ciphertext only
- Proofs generated without decryption

### 7.3.2 Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                      ALEO KEY HIERARCHY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Private Key (seed)                                             │
│       │                                                          │
│       ├──► View Key (decrypt records)                           │
│       │                                                          │
│       ├──► Proving Key (generate proofs)                        │
│       │                                                          │
│       └──► Address (public identifier)                          │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

---

# 8. Integration Specifications

## 8.1 Agent Registration (Bond Staking)

### 8.1.1 Sybil Resistance Mechanism

The deployed contract uses bond staking (10 credits per agent) as the identity layer for Sybil resistance. Each Aleo address can register at most one agent.

### 8.1.2 Registration Flow

```
1. Agent calls register_agent with service_type, endpoint_hash, and bond_amount (≥ 10 credits)
2. Contract generates unique agent_id from caller address via BHP256 hash
3. Finalize verifies address not already in registered_agents mapping
4. Marks address as registered, creates PublicListing in agent_listings
5. Agent receives AgentReputation record + AgentBond record
```

### 8.1.3 Registration Verification

| Check | Purpose | Implementation |
|-------|---------|----------------|
| Bond minimum | Ensure economic stake | `assert(bond_amount >= 10_000_000)` |
| Uniqueness | One agent per address | `registered_agents` mapping lookup |
| Unregister | Reclaim bond | `unregister_agent` returns bond, sets `is_active: false` |

## 8.2 x402 Protocol Integration

### 8.2.1 Protocol Compliance

| x402 Feature | ShadowAgent Implementation |
|--------------|---------------------------|
| HTTP 402 status | Fully compliant |
| PAYMENT-REQUIRED header | Base64 JSON with Aleo terms |
| Payment verification | ZK proof instead of on-chain lookup |
| Settlement | Private Aleo transactions |

### 8.2.2 Session-Based Payments (Scalable Micropayments)

**Problem**: Per-request signing creates unusable UX at scale (1000 API calls = 1000 wallet signatures).

**Solution**: Sign once, spend within bounds.

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    SESSION-BASED PAYMENT MODEL                               │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  STEP 1: Create Session (ONE signature)                                     │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Client signs: "I authorize Agent X to spend up to $100                 │ │
│  │              - Max $1 per request                                      │ │
│  │              - Valid for 24 hours                                      │ │
│  │              - Rate limit: 100 requests/hour"                          │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  STEP 2: Use Session (NO signatures)                                        │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Request 1  ──► Agent validates ──► Execute ──► Track: $0.10           │ │
│  │ Request 2  ──► Agent validates ──► Execute ──► Track: $0.20           │ │
│  │ ...                                                                    │ │
│  │ Request N  ──► Until session limit reached                            │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                              │                                               │
│                              ▼                                               │
│  STEP 3: Settlement (ONE transaction)                                       │
│  ┌────────────────────────────────────────────────────────────────────────┐ │
│  │ Agent submits: "Client used $47.30 across 473 requests"               │ │
│  │ On-chain: Settle $47.30 to agent, refund $52.70 to client             │ │
│  └────────────────────────────────────────────────────────────────────────┘ │
│                                                                              │
│  RESULT: 1 signature + 1 settlement = unlimited requests within bounds     │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

### 8.2.3 PaymentSession Record

| Field | Type | Description |
|-------|------|-------------|
| owner | address | Client (record owner) |
| agent | address | Authorized agent |
| session_id | field | Unique identifier |
| max_total | u64 | Maximum total spend (microcredits) |
| max_per_request | u64 | Maximum per single request |
| rate_limit | u64 | Max requests per 100 blocks |
| spent | u64 | Running total spent |
| request_count | u64 | Number of requests processed |
| valid_until | u64 | Expiry block height |
| status | u8 | 0=Active, 1=Paused, 2=Closed |

### 8.2.4 Session Transitions

| Transition | Purpose | Signature Required |
|------------|---------|-------------------|
| create_session | Lock funds, define bounds | Yes (one-time) |
| settle_session | Agent claims accumulated spend | No |
| close_session | Client closes, gets refund | No |
| top_up_session | Client adds more funds | Yes |

### 8.2.5 Tiered Authorization System

| Tier | Limit | Auth Required | Use Case |
|------|-------|---------------|----------|
| **Micro** | $1/req, $10 total | Auto (from deposit pool) | Casual browsing |
| **Standard** | $10/req, $1000 total | Session signature | Regular API usage |
| **Premium** | Unlimited | Per-transaction | High-value services |

### 8.2.6 Privacy Benefits

- Fewer on-chain transactions → Less metadata leakage
- Batched settlement → Individual request amounts hidden
- Only final total revealed on-chain, not usage patterns

### 8.2.7 Extension: Privacy Headers

| Header | Purpose | Format |
|--------|---------|--------|
| X-ESCROW-PROOF | ZK proof of locked escrow | Base64 JSON |
| X-SESSION-TOKEN | Session authorization token | Base64 JSON |
| X-STATE-RECEIPT | Agent's state receipt (response) | Base64 JSON |
| X-DELIVERY-SECRET | Secret for claim | Hex string |
| X-JOB-HASH | Unique job identifier | Hex string |
| X-REPUTATION-PROOF | Agent's tier proof | Base64 JSON |

### 8.2.8 Autonomous Agent Sessions

For true agent economies, humans set spending policies that their AI agents operate within:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                    AUTONOMOUS AGENT SPENDING POLICY                          │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  Human defines policy (ONE TIME):                                           │
│  {                                                                          │
│    "authorized_agent": "aleo1myagent...",  // Human's AI agent             │
│    "spending_limits": {                                                     │
│      "daily_max": 50_000_000,      // $50/day                              │
│      "monthly_max": 500_000_000,   // $500/month                           │
│      "per_vendor_max": 100_000_000 // $100 per external agent              │
│    },                                                                       │
│    "allowed_categories": ["nlp", "code", "data"],                          │
│    "min_vendor_tier": 2            // Silver+ only                         │
│  }                                                                          │
│                                                                              │
│  Agent operates autonomously within policy:                                 │
│  • Discovers vendors matching policy                                        │
│  • Creates sessions within bounds (NO human approval)                      │
│  • Executes tasks, settles payments automatically                          │
│  • Human sees daily summary: "Agent spent $12.50 across 3 vendors"        │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## 8.3 Token Integration

### 8.3.1 Supported Tokens

| Token | Type | Status | Notes |
|-------|------|--------|-------|
| Aleo Credits | Native | Supported | Default for burns |
| pALEO | Liquid staking | Planned | Via Pondo |
| USDCx | Stablecoin | Planned | Via Circle |

### 8.3.2 Multi-Token Support

Future enhancement to allow payment in multiple tokens:

```
Payment Terms:
{
  "accepts": [
    { "token": "credits", "amount": 500000 },
    { "token": "pALEO", "amount": 450000 },
    { "token": "USDCx", "amount": 100000 }
  ]
}
```

## 8.4 AI Platform Integration

### 8.4.1 Supported Platforms

| Platform | Integration Type | Use Case |
|----------|-----------------|----------|
| LangChain | Tool/Agent | AI agent framework |
| AutoGPT | Plugin | Autonomous agents |
| Hugging Face | API wrapper | Model inference |
| OpenAI | API wrapper | GPT integration |

### 8.4.2 MCP (Model Context Protocol) Support

ShadowAgent agents can be registered as MCP tools:

```
Tool Definition:
{
  "name": "shadowagent_service",
  "description": "Privacy-preserving AI service",
  "parameters": {
    "agent_id": "string",
    "input": "object"
  },
  "payment": {
    "protocol": "x402",
    "network": "aleo"
  }
}
```

---

# 9. Deployment Guide

## 9.1 Prerequisites

### 9.1.1 Development Environment

| Component | Version | Purpose |
|-----------|---------|---------|
| Leo | ≥1.12.0 | Smart contract language |
| snarkOS | ≥2.2.0 | Aleo node software |
| Node.js | ≥18.0.0 | SDK runtime |
| Rust | ≥1.75.0 | Native tooling |

### 9.1.2 Network Requirements

| Network | RPC Endpoint | Faucet |
|---------|--------------|--------|
| Testnet | https://api.explorer.aleo.org/v1/testnet | https://faucet.aleo.org |
| Mainnet | https://api.explorer.aleo.org/v1/mainnet | N/A |

## 9.2 Deployment Steps

### 9.2.1 Smart Contract Deployment

```
Step 1: Compile Leo program
Step 2: Generate deployment transaction
Step 3: Broadcast to network
Step 4: Wait for confirmation
Step 5: Verify deployment
```

### 9.2.2 Facilitator Deployment

```
Step 1: Configure environment variables
Step 2: Set up database (PostgreSQL)
Step 3: Deploy facilitator service
Step 4: Configure load balancer
Step 5: Set up monitoring
```

### 9.2.3 Frontend Deployment

```
Step 1: Build React application
Step 2: Configure API endpoints
Step 3: Deploy to CDN
Step 4: Configure domain
Step 5: Enable HTTPS
```

## 9.3 Configuration

### 9.3.1 Environment Variables

| Variable | Description | Required |
|----------|-------------|----------|
| ALEO_PRIVATE_KEY | Deployer private key | Yes |
| ALEO_NETWORK | Network (testnet/mainnet) | Yes |
| FACILITATOR_URL | Facilitator service URL | Yes |
| DATABASE_URL | PostgreSQL connection | Yes |
| IPFS_GATEWAY | IPFS gateway URL | No |

### 9.3.2 Program Configuration

| Parameter | Default | Description |
|-----------|---------|-------------|
| RATING_BURN_COST | 500,000 | Credits burned per rating |
| MIN_PAYMENT | 100,000 | Minimum job value |
| ESCROW_TIMEOUT | 100 | Default timeout blocks |

## 9.4 Monitoring

### 9.4.1 Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Transaction success rate | % of successful txns | < 99% |
| Proof generation time | Average proving time | > 5 seconds |
| Escrow completion rate | % of escrows completed | < 95% |
| API latency | Facilitator response time | > 500ms |

### 9.4.2 Logging

| Log Level | Events |
|-----------|--------|
| ERROR | Transaction failures, proof errors |
| WARN | Timeout approaching, high latency |
| INFO | Successful operations |
| DEBUG | Detailed execution traces |

---

# 10. Testing Strategy

## 10.1 Test Categories

### 10.1.1 Unit Tests

| Component | Test Focus | Coverage Target |
|-----------|------------|-----------------|
| Leo transitions | Input validation, state changes | 100% |
| SDK methods | Parameter handling, error cases | 95% |
| Facilitator handlers | Request/response processing | 90% |

### 10.1.2 Integration Tests

| Test Scenario | Components | Success Criteria |
|---------------|------------|------------------|
| Agent registration | SDK → Contract → Mapping | Record created |
| Service purchase | Client → Agent → Escrow | Payment settled |
| Rating submission | Client → Contract → Reputation | Stats updated |
| Proof generation | Agent → Contract → Proof | Valid proof output |

### 10.1.3 End-to-End Tests

| Flow | Steps | Validation |
|------|-------|------------|
| Full purchase flow | Search → Pay → Receive → Rate | All steps complete |
| Escrow refund | Create → Timeout → Refund | Funds returned |
| Reputation building | Multiple jobs → Tier upgrade | Tier changes correctly |

## 10.2 Test Scenarios

### 10.2.1 Happy Path Tests

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| HP-01 | Agent registers with bond stake | AgentReputation + AgentBond created |
| HP-02 | Client purchases service | Service delivered, payment settled |
| HP-03 | Client submits rating | Reputation updated |
| HP-04 | Agent generates tier proof | Valid proof returned |
| HP-05 | Agent claims escrow with secret | Funds released |

### 10.2.2 Edge Case Tests

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| EC-01 | Double registration attempt | Transaction rejected |
| EC-02 | Double rating attempt | Transaction rejected |
| EC-03 | Claim with wrong secret | Transaction rejected |
| EC-04 | Refund before deadline | Transaction rejected |
| EC-05 | Rating below minimum | Transaction rejected |

### 10.2.3 Security Tests

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| SEC-01 | Sybil attack (multiple wallets) | Economically infeasible |
| SEC-02 | Front-running attempt | No information leaked |
| SEC-03 | Replay attack | Nullifier prevents |
| SEC-04 | Invalid proof verification | Proof rejected |
| SEC-05 | Escrow manipulation | State machine enforced |

## 10.3 Performance Benchmarks

### 10.3.1 Target Metrics

| Operation | Target | Max Acceptable |
|-----------|--------|----------------|
| Proof generation | < 2s | < 5s |
| Transaction confirmation | < 30s | < 60s |
| API response | < 100ms | < 500ms |
| SDK initialization | < 1s | < 3s |

### 10.3.2 Load Testing

| Test | Concurrent Users | Duration | Success Rate Target |
|------|------------------|----------|---------------------|
| Normal load | 100 | 1 hour | > 99% |
| Peak load | 500 | 15 min | > 95% |
| Stress test | 1000 | 5 min | > 90% |

---

# Appendix A: Glossary

| Term | Definition |
|------|------------|
| Agent | AI service provider registered on ShadowAgent |
| Client | Consumer of AI services |
| Escrow | Locked payment pending service delivery |
| Facilitator | Off-chain service bridging HTTP and Aleo |
| HTLC | Hash Time-Locked Contract |
| Nullifier | Unique identifier preventing double-actions |
| Rolling Reputation | Cumulative stats updated per job |
| Tier | Reputation level (New/Bronze/Silver/Gold/Diamond) |
| x402 | HTTP payment protocol using 402 status code |
| Bond Staking | 10-credit economic barrier per agent registration |
| ZK Proof | Zero-knowledge cryptographic proof |

---

# Appendix B: Error Codes

| Code | Description | Resolution |
|------|-------------|------------|
| E001 | Invalid rating range | Use values 1-50 |
| E002 | Payment below minimum | Increase payment amount |
| E003 | Burn amount insufficient | Use ≥ 500,000 microcredits |
| E004 | Nullifier already used | Cannot double-rate |
| E005 | Address already registered | One agent per address (unregister first) |
| E006 | Escrow deadline passed | Cannot claim, only refund |
| E007 | Invalid secret | Secret doesn't match hash |
| E008 | Unauthorized caller | Wrong address for operation |
| E009 | Tier threshold not met | Reputation insufficient |
| E010 | Escrow already settled | Cannot modify settled escrow |

---

# Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | Initial | Basic reputation system |
| 2.0 | Current | Rolling reputation, Sybil resistance, escrow, bond staking |

---

*End of Technical Documentation*