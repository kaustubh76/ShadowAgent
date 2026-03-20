# ShadowAgent Technical Documentation

## Version 2.3 | Aleo Buildathon

---

# Table of Contents

1. [System Overview](#1-system-overview)
2. [Architecture Design](#2-architecture-design)
   - 2.2.1 Agent Registration Flow | 2.2.2 Service Purchase Flow | 2.2.3 Reputation Proof Flow
   - 2.2.4 Dispute Resolution Flow | 2.2.5 Session Payment Flow | 2.2.6 Multi-Sig Escrow Flow
3. [Data Models & Records](#3-data-models--records)
   - 3.1-3.5 Core Records (AgentReputation, RatingRecord, EscrowRecord, ReputationProof)
   - 3.6-3.7 AgentBond, PublicListing | 3.8-3.11 Ext Records (SplitEscrow, Dispute, Decay, MultiSig)
   - 3.12-3.14 Session Records (PaymentSession, SessionReceipt, SpendingPolicy) | 3.15 Mappings
4. [Smart Contract Specifications](#4-smart-contract-specifications)
   - 4.3 shadow_agent.aleo (12 transitions) | 4.4 shadow_agent_ext.aleo (11 transitions)
   - 4.5 shadow_agent_session.aleo (8 transitions)
5. [API Specifications](#5-api-specifications)
   - 5.1 x402 HTTP Protocol | 5.2 Facilitator API (40+ endpoints) | 5.3 SDK Interfaces
6. [Security Model](#6-security-model)
   - 6.1 Threat Model | 6.2 Sybil Resistance | 6.3 Privacy | 6.4 Escrow
   - 6.5 Dispute Security | 6.6 Session Security | 6.7 Multi-Sig | 6.8 Circuit Breaker
7. [Cryptographic Primitives](#7-cryptographic-primitives)
   - 7.1 Hash Functions (BHP256, SHA-256) | 7.2 Aleo SDK Integration | 7.3 ZK Circuits
   - 7.4 Record Encryption | 7.5 Unit Conversion Utilities
8. [Integration Specifications](#8-integration-specifications)
   - 8.1 Bond Staking | 8.2 x402 Protocol + Sessions | 8.3 Token | 8.4 AI Platforms
   - 8.5 Frontend Architecture
9. [Deployment Guide](#9-deployment-guide)
   - 9.1 Prerequisites | 9.2 Deployment Steps | 9.3 Configuration | 9.4 Monitoring
10. [Testing Strategy](#10-testing-strategy)
    - 10.1 Test Suites (510 tests) | 10.2 Scenarios (HP/EC/SEC) | 10.3 Benchmarks
- [Appendix A: Glossary](#appendix-a-glossary) | [B: Error Codes](#appendix-b-error-codes) | [C: Version History](#appendix-c-version-history) | [D: Constants](#appendix-d-constants-reference)

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

1. **Rolling Reputation Model**: O(1) complexity for reputation proofs — no loops, constant-time verification
2. **Burn-to-Rate Sybil Resistance**: Economic cost (0.5 credits) per rating submission
3. **Bond-Based Identity Gating**: 10-credit stake per agent registration, reclaimable on unregister
4. **Private Escrow with HTLC**: Trustless fair exchange — secret-hash locked, deadline-protected
5. **Semi-Private Discovery**: Public listings with private backing data
6. **Session-Based Micropayments**: Sign once, spend within bounds — enables 1000+ requests per wallet signature
7. **Time-Decaying Reputation**: Rating weight decays 5% per ~7-day period (unrolled 10-step computation in Leo)
8. **Dispute Resolution with Split Payouts**: Admin-arbitrated disputes with 0-100% split allocation
9. **M-of-3 Multi-Sig Escrow**: Configurable threshold escrow for high-value transactions
10. **Spending Policies for Autonomous Agents**: Human-defined constraints that AI agents operate within autonomously

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

### 2.2.4 Dispute Resolution Flow

```
┌────────┐     ┌────────┐     ┌────────┐     ┌────────────┐
│ Client │     │  Agent │     │  Admin │     │ Aleo Network│
└───┬────┘     └───┬────┘     └───┬────┘     └──────┬──────┘
    │              │              │                  │
    │ 1. open_dispute             │                  │
    │  (evidence_hash)            │                  │
    │ ─────────────────────────────────────────────>│
    │              │              │                  │
    │              │              │  2. DisputeRecord│
    │              │              │  (owner=admin)   │
    │              │              │ <────────────────│
    │              │              │                  │
    │              │ 3. respond_to_dispute           │
    │              │  (agent_evidence_hash)          │
    │              │ ──────────────────────────────>│
    │              │              │                  │
    │              │              │ 4. resolve_dispute│
    │              │              │  (agent_pct=60%)  │
    │              │              │ ────────────────>│
    │              │              │                  │
    │ 5. Client DisputeRecord     │                  │
    │  (40% of escrow)            │                  │
    │ <─────────────────────────────────────────────│
    │              │              │                  │
    │              │ 6. Agent DisputeRecord          │
    │              │  (60% of escrow)                │
    │              │ <──────────────────────────────│
    │              │              │                  │
```

### 2.2.5 Session-Based Payment Flow

```
┌────────┐     ┌────────┐     ┌─────────────┐
│ Client │     │  Agent │     │ Aleo Network│
└───┬────┘     └───┬────┘     └──────┬──────┘
    │              │                  │
    │ 1. create_session              │
    │  (ONE signature)               │
    │ ──────────────────────────────>│
    │              │                  │
    │              │  2. PaymentSession record
    │ <──────────────────────────────│
    │              │                  │
    │ 3. API request (no signature)  │
    │ ─────────────>                 │
    │              │                  │
    │              │ 4. session_request
    │              │ ────────────────>
    │              │                  │
    │              │ 5. Updated session + receipt
    │              │ <────────────────
    │              │                  │
    │ 6. API response                │
    │ <─────────────                 │
    │              │                  │
    │  ... repeat 3-6 N times ...    │
    │              │                  │
    │              │ 7. settle_session│
    │              │ ────────────────>│
    │              │                  │
    │ 8. close_session               │
    │  (refund unused)               │
    │ ──────────────────────────────>│
    │              │                  │
```

### 2.2.6 Multi-Sig Escrow Flow

```
┌────────┐   ┌──────────┐   ┌──────────┐   ┌──────────┐   ┌─────────────┐
│ Client │   │ Signer 1 │   │ Signer 2 │   │ Signer 3 │   │ Aleo Network│
└───┬────┘   └────┬─────┘   └────┬─────┘   └────┬─────┘   └──────┬──────┘
    │             │              │              │                  │
    │ 1. create_multisig_escrow  │              │                  │
    │  (required_sigs=2)         │              │                  │
    │ ─────────────────────────────────────────────────────────>  │
    │             │              │              │                  │
    │ 2. MultiSigEscrowRecord    │              │                  │
    │ <─────────────────────────────────────────────────────────  │
    │             │              │              │                  │
    │             │ 3. approve_escrow_release   │                  │
    │             │  (secret)    │              │                  │
    │             │ ───────────────────────────────────────────>  │
    │             │              │              │                  │
    │             │              │ 4. approve_escrow_release       │
    │             │              │  (secret)    │                  │
    │             │              │ ────────────────────────────>  │
    │             │              │              │                  │
    │             │              │              │   5. Threshold   │
    │             │              │              │   met (2/3)      │
    │             │              │              │   → Released     │
    │             │              │              │   → owner=agent  │
    │             │              │              │                  │
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

### shadow_agent.aleo Records

| Record Type | Visibility | Purpose | Owner |
|-------------|------------|---------|-------|
| AgentReputation | Private | Cumulative reputation data | Agent |
| RatingRecord | Private | Individual job rating | Agent (transferred from Client) |
| EscrowRecord | Private | Locked payment for fair exchange | Client → Agent |
| ReputationProof | Private | ZK attestation output | Agent |
| AgentBond | Private | Staked bond for Sybil resistance | Agent |

### shadow_agent_ext.aleo Records

| Record Type | Visibility | Purpose | Owner |
|-------------|------------|---------|-------|
| SplitEscrowRecord | Private | Cooperative partial refund split | Agent → Client |
| DisputeRecord | Private | Dispute with evidence from both parties | Admin → parties |
| DecayedReputationProof | Private | Reputation proof with time-decay applied | Agent |
| MultiSigEscrowRecord | Private | M-of-3 signature escrow | Signer → Agent |

### shadow_agent_session.aleo Records

| Record Type | Visibility | Purpose | Owner |
|-------------|------------|---------|-------|
| PaymentSession | Private | Pre-authorized spending session | Client |
| SessionReceipt | Private | Per-request payment proof | Agent |
| SpendingPolicy | Private | Reusable spending policy template | Client |

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

## 3.6 AgentBond Record

### Purpose
Represents the agent's staked bond for Sybil resistance. Returned to the agent on unregistration.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Agent's Aleo address | Must match registration caller |
| agent_id | field | Unique identifier | Hash of owner address |
| amount | u64 | Bond amount in microcredits | Min: 10,000,000 (10 credits) |
| staked_at | u64 | Block height of staking | Immutable after creation |

## 3.7 PublicListing Struct

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

## 3.8 SplitEscrowRecord (shadow_agent_ext.aleo)

### Purpose
Represents a cooperative partial refund proposal between client and agent. The client proposes a split, and the agent can accept or reject.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Current holder (agent on propose, client on reject) | Transfers during lifecycle |
| agent | address | Agent party | Immutable |
| client | address | Client party | Immutable |
| total_amount | u64 | Original escrow amount | Must be > 0 |
| agent_amount | u64 | Proposed amount for agent | Must be < total_amount |
| client_amount | u64 | Proposed amount for client | total_amount - agent_amount |
| job_hash | field | Links to original job | Immutable |
| status | u8 | Proposal state | 0=Proposed, 1=Accepted, 2=Rejected |

## 3.9 DisputeRecord (shadow_agent_ext.aleo)

### Purpose
Tracks a dispute between client and agent with evidence hashes from both parties. Owned by admin for resolution.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Current holder (admin initially, then parties) | Transfers on resolution |
| client | address | Disputing client | Immutable |
| agent | address | Disputed agent | Immutable |
| job_hash | field | Job being disputed | Unique per dispute |
| escrow_amount | u64 | Amount in dispute | From original escrow |
| client_evidence_hash | field | Hash of client's evidence | Set on open |
| agent_evidence_hash | field | Hash of agent's counter-evidence | Set on respond |
| status | u8 | Dispute state | 0=Opened, 1=AgentResponded, 2=ResolvedClient, 3=ResolvedAgent, 4=ResolvedSplit |
| resolution_agent_pct | u8 | Percentage awarded to agent | 0-100, set on resolution |
| opened_at | u64 | Block height of dispute opening | Immutable |

### Status Transitions

```
                    ┌──────────────┐
                    │    OPENED    │
                    │  (status=0)  │
                    └──────┬───────┘
                           │ Agent submits evidence
                           ▼
                    ┌──────────────┐
                    │   RESPONDED  │
                    │  (status=1)  │
                    └──────┬───────┘
                           │ Admin resolves
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐
  │  RESOLVED    │ │  RESOLVED    │ │  RESOLVED    │
  │  CLIENT (2)  │ │  AGENT (3)   │ │  SPLIT (4)   │
  │ 0% to agent  │ │ 100% to agent│ │ X% to agent  │
  └──────────────┘ └──────────────┘ └──────────────┘
```

## 3.10 DecayedReputationProof (shadow_agent_ext.aleo)

### Purpose
Reputation proof that accounts for time-based decay of rating points. Older ratings carry less weight.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Agent who generated proof | Must be proof generator |
| agent_id | field | Unique agent identifier | Hash of agent address |
| effective_rating_points | u64 | Rating points after decay applied | ≤ original total_rating_points |
| total_jobs | u64 | Total job count (no decay) | Jobs do not decay |
| decay_periods | u64 | Number of decay periods elapsed | 0-10 (capped at MAX_DECAY_STEPS) |
| proof_type | u8 | Type of attestation | 1=Rating, 4=Tier |
| threshold_met | bool | Whether threshold satisfied after decay | Always true (assert fails otherwise) |
| generated_at | u64 | Block height of proof generation | Set on creation |

### Decay Mechanics

```
Decay Formula (per period of ~7 days / 100,800 blocks):
  effective_points = total_rating_points × (95/100)^periods

Unrolled 10-step computation (no loops in Leo):
  Step 1: result = total_rating_points × 95 / 100
  Step 2: result = result × 95 / 100
  ...
  Step N: (only applied if period has elapsed)

After 10 periods (~70 days of inactivity):
  59.87% of original rating points remain
```

## 3.11 MultiSigEscrowRecord (shadow_agent_ext.aleo)

### Purpose
Escrow requiring M-of-3 signer approvals before release. Enables multi-party oversight of high-value transactions.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Current holder | Transfers to agent on release |
| agent | address | Service provider | Immutable |
| amount | u64 | Locked payment amount | Must be > 0 |
| job_hash | field | Unique job identifier | Immutable |
| deadline | u64 | Block height for timeout | Must be future block |
| secret_hash | field | Hash of delivery secret | For HTLC verification |
| signer_1 | address | First authorized signer | Immutable |
| signer_2 | address | Second authorized signer | Immutable |
| signer_3 | address | Third authorized signer | Immutable |
| required_sigs | u8 | Signatures needed for release | Range: 1-3 |
| sig_count | u8 | Current approval count | Increments on approval |
| sig_1_approved | bool | Signer 1 has approved | One-way: false → true |
| sig_2_approved | bool | Signer 2 has approved | One-way: false → true |
| sig_3_approved | bool | Signer 3 has approved | One-way: false → true |
| status | u8 | Escrow state | 0=Locked, 1=Released, 2=Refunded |

### State Transitions

```
                    ┌──────────────────┐
                    │      LOCKED      │
                    │    (status=0)    │
                    └────────┬─────────┘
                             │
              ┌──────────────┴──────────────┐
              │ approve_escrow_release       │ refund_multisig_escrow
              │ (each signer approves)       │ (after deadline)
              ▼                              ▼
    ┌─────────────────┐           ┌─────────────────┐
    │    RELEASED     │           │    REFUNDED     │
    │   (status=1)    │           │   (status=2)    │
    │                 │           │                 │
    │ M-of-3 reached  │           │ Owner reclaims  │
    │ → owner=agent   │           │ after deadline  │
    └─────────────────┘           └─────────────────┘
```

## 3.12 PaymentSession Record (shadow_agent_session.aleo)

### Purpose
Enables session-based payments for scalable micropayments. Sign once, transact unlimited times within bounds.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Client (record owner) | Must match session creator |
| agent | address | Authorized agent | Immutable after creation |
| session_id | field | Unique identifier | BHP256 hash of (caller, agent) |
| max_total | u64 | Maximum total spend | Must be > 0 |
| max_per_request | u64 | Maximum per request | Must be ≤ max_total |
| rate_limit | u64 | Max requests per 100 blocks | Must be > 0 |
| spent | u64 | Running total spent | Updated per request |
| request_count | u64 | Number of requests | Updated per request |
| window_start | u64 | Start of current rate-limit window | Resets every 100 blocks |
| valid_until | u64 | Expiry block height | Future block required |
| status | u8 | Session state | 0=Active, 1=Paused, 2=Closed |

### Session State Transitions

```
                    ┌──────────────┐
                    │    ACTIVE    │◄────────────┐
                    │  (status=0)  │             │
                    └──────┬───────┘             │ resume_session
                           │                     │
            ┌──────────────┼──────────────┐     │
            ▼              ▼              ▼     │
     ┌────────────┐ ┌────────────┐ ┌────────────┐
     │  REQUEST   │ │   SETTLE   │ │   PAUSED   │
     │ PROCESSED  │ │  (partial) │ │ (status=1) │──┘
     │ (updated)  │ │            │ │            │
     └─────┬──────┘ └─────┬──────┘ └────────────┘
           │              │
           ▼              ▼
     ┌─────────────────────────────────────────┐
     │              CLOSED                      │
     │  (status=2)                             │
     │  Budget depleted OR expired OR closed   │
     │  Unused funds refunded to client        │
     └─────────────────────────────────────────┘
```

## 3.13 SessionReceipt Record (shadow_agent_session.aleo)

### Purpose
Per-request payment proof held by the agent. Created for each `session_request` call.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Agent (receipt holder) | Set to session.agent |
| session_id | field | Links to parent session | Must match active session |
| request_hash | field | Unique request identifier | Hash of request params |
| amount | u64 | Amount charged for this request | ≤ session.max_per_request |
| timestamp | u64 | Block height of request | Set on creation |

## 3.14 SpendingPolicy Record (shadow_agent_session.aleo)

### Purpose
Reusable policy template that constrains session creation. Allows humans to delegate spending authority to AI agents within defined bounds.

### Fields

| Field | Type | Description | Constraints |
|-------|------|-------------|-------------|
| owner | address | Policy creator | Must match caller |
| policy_id | field | Unique identifier | BHP256 hash of (caller, block_height) |
| max_session_value | u64 | Maximum total spend per session | Must be > 0 |
| max_single_request | u64 | Maximum per single request | Must be ≤ max_session_value |
| allowed_tiers | u8 | Bitmask of allowed vendor tiers | Default: 0xff (all tiers) |
| allowed_categories | u64 | Bitmask of allowed ServiceTypes | Default: 0xffffffff (all) |
| require_proofs | bool | Whether vendor must provide reputation proof | Policy enforcement |
| created_at | u64 | Block height of creation | Immutable |

### Policy-Session Relationship

When creating a session from a policy (`create_session_from_policy`), the session parameters are validated against the policy bounds:
- `max_total` must be ≤ `policy.max_session_value`
- `max_per_request` must be ≤ `policy.max_single_request`
- Policy is returned unchanged (reusable for multiple sessions)

## 3.15 On-Chain Mappings

### shadow_agent.aleo Mappings

#### agent_listings
```
mapping agent_listings: field => PublicListing
```
- Key: agent_id (field)
- Value: PublicListing struct
- Purpose: Public agent discovery

#### used_nullifiers
```
mapping used_nullifiers: field => bool
```
- Key: client_nullifier (field)
- Value: boolean (true if used)
- Purpose: Prevent double-rating attacks

#### registered_agents
```
mapping registered_agents: address => bool
```
- Key: Agent's Aleo address
- Value: boolean (true if registered)
- Purpose: One agent per address (Sybil resistance via bond staking)

### shadow_agent_ext.aleo Mappings

#### active_disputes
```
mapping active_disputes: field => bool
```
- Key: job_hash (field)
- Value: boolean (true if dispute active)
- Purpose: Prevent duplicate disputes for the same job

### shadow_agent_session.aleo Mappings

#### active_sessions
```
mapping active_sessions: field => bool
```
- Key: session_id (field)
- Value: boolean (true if session active)
- Purpose: Prevent duplicate session IDs and track active sessions

---

# 4. Smart Contract Specifications

## 4.1 Program Overview

| Program | Purpose | Dependencies | Status |
|---------|---------|--------------|--------|
| shadow_agent.aleo | Core reputation, escrow, registration | credits.aleo | Deployed (@noupgrade) |
| shadow_agent_ext.aleo | Disputes, refunds, decay proofs, multi-sig | credits.aleo | Deployed (@noupgrade) |
| shadow_agent_session.aleo | Session payments, spending policies | credits.aleo | Deployed (@noupgrade) |

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

### 4.3.11 update_listing

**Purpose**: Agent updates their public listing information.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| reputation | AgentReputation | Private | Agent's current reputation record |
| new_service_type | u8 | Private | Updated service category |
| new_endpoint_hash | field | Private | Updated endpoint URL hash |
| is_active | bool | Private | Whether agent is accepting jobs |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| AgentReputation | Record | Updated reputation record (returned) |

**Finalize Effects**:
- Updates PublicListing in `agent_listings` mapping

### 4.3.12 unregister_agent

**Purpose**: Agent unregisters and reclaims their staked bond.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| reputation | AgentReputation | Private | Agent's reputation record |
| bond | AgentBond | Private | Agent's bond record |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| AgentBond | Record | Bond returned to agent |

**Finalize Effects**:
- Marks address as unregistered in `registered_agents` mapping
- Deactivates listing in `agent_listings` mapping (is_active = false)

## 4.4 shadow_agent_ext.aleo Transitions

### 4.4.1 propose_partial_refund

**Purpose**: Client proposes a cooperative split of escrowed funds.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| agent | address | Private | Agent to split with |
| total_amount | u64 | Private | Original escrow amount |
| agent_amount | u64 | Private | Proposed amount for agent |
| job_hash | field | Private | Job identifier |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| SplitEscrowRecord | Record | Proposal owned by agent for review |

**Failure Conditions**:
- agent_amount ≥ total_amount

### 4.4.2 accept_partial_refund

**Purpose**: Agent accepts the proposed split.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| proposal | SplitEscrowRecord | Private | Proposal to accept |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| SplitEscrowRecord | Record | Agent's portion (owner=agent) |
| SplitEscrowRecord | Record | Client's portion (owner=client) |

**Failure Conditions**:
- Caller is not the agent
- Status is not Proposed (0)

### 4.4.3 reject_partial_refund

**Purpose**: Agent rejects the proposed split.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| proposal | SplitEscrowRecord | Private | Proposal to reject |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| SplitEscrowRecord | Record | Returned to client (owner=client) |

**Failure Conditions**:
- Caller is not the agent
- Status is not Proposed (0)

### 4.4.4 open_dispute

**Purpose**: Client opens a dispute against an agent with evidence.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| agent | address | Private | Agent being disputed |
| job_hash | field | Private | Job identifier |
| escrow_amount | u64 | Private | Amount in dispute |
| evidence_hash | field | Private | Hash of client's evidence |
| admin | address | Private | Admin address for resolution |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| DisputeRecord | Record | Dispute owned by admin |

**Finalize Effects**:
- Verifies job_hash not already in `active_disputes` mapping
- Marks dispute as active

**Failure Conditions**:
- Duplicate dispute for same job_hash

### 4.4.5 respond_to_dispute

**Purpose**: Agent submits counter-evidence to an open dispute.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| dispute | DisputeRecord | Private | Active dispute |
| evidence_hash | field | Private | Hash of agent's counter-evidence |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| DisputeRecord | Record | Updated dispute (status=AgentResponded) |

**Failure Conditions**:
- Caller is not the agent
- Status is not Opened (0)

### 4.4.6 resolve_dispute

**Purpose**: Admin resolves dispute by setting percentage allocation.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| dispute | DisputeRecord | Private | Dispute to resolve |
| agent_percentage | u8 | Private | Percentage awarded to agent (0-100) |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| DisputeRecord | Record | Client's resolution record |
| DisputeRecord | Record | Agent's resolution record |

**Finalize Effects**:
- Clears `active_disputes` flag for this job_hash

**Resolution Status**:
- 0% to agent → status = ResolvedClient (2)
- 100% to agent → status = ResolvedAgent (3)
- 1-99% → status = ResolvedSplit (4)

### 4.4.7 prove_rating_decay

**Purpose**: Generate a reputation proof with time-based decay applied to rating points.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| agent_id | field | Private | Agent identifier |
| total_jobs | u64 | Private | Total job count |
| total_rating_points | u64 | Private | Raw rating points |
| total_revenue | u64 | Private | Total revenue |
| tier | u8 | Private | Current tier |
| last_updated | u64 | Private | Block of last update |
| min_rating | u64 | Private | Minimum average rating threshold |
| current_block | u64 | Private | Claimed current block height |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| DecayedReputationProof | Record | Proof with decay metadata |

**Finalize Effects**:
- Verifies `current_block` within BLOCK_TOLERANCE (±10) of actual block height

**Decay Computation**:
- Unrolled 10-step loop: each step applies `× 95 / 100` if period has elapsed
- Period = 100,800 blocks (~7 days)

### 4.4.8 prove_tier_with_decay

**Purpose**: Validate tier ≥ required_tier with decay context.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| agent_id | field | Private | Agent identifier |
| total_jobs | u64 | Private | Total job count |
| total_rating_points | u64 | Private | Raw rating points |
| total_revenue | u64 | Private | Total revenue |
| tier | u8 | Private | Current tier |
| last_updated | u64 | Private | Block of last update |
| required_tier | u8 | Private | Minimum tier threshold |
| current_block | u64 | Private | Claimed current block height |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| DecayedReputationProof | Record | Tier proof with decay metadata |

**Finalize Effects**:
- Verifies `current_block` within BLOCK_TOLERANCE of actual block height

**Note**: Tier itself does not decay (it's based on jobs/revenue which are cumulative). Only rating points decay.

### 4.4.9 create_multisig_escrow

**Purpose**: Create an escrow requiring M-of-3 signer approvals before release.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| agent | address | Private | Service provider |
| amount | u64 | Private | Payment amount |
| job_hash | field | Private | Job identifier |
| secret_hash | field | Private | Hash for HTLC |
| blocks_until_deadline | u64 | Private | Timeout in blocks |
| signer_1 | address | Private | First authorized signer |
| signer_2 | address | Private | Second authorized signer |
| signer_3 | address | Private | Third authorized signer |
| required_sigs | u8 | Private | Signatures needed (1-3) |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| MultiSigEscrowRecord | Record | Locked multi-sig escrow |

**Failure Conditions**:
- required_sigs not in range 1-3

### 4.4.10 approve_escrow_release

**Purpose**: Authorized signer approves escrow release by providing the secret.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| escrow | MultiSigEscrowRecord | Private | Escrow to approve |
| secret | field | Private | Preimage of secret_hash |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| MultiSigEscrowRecord | Record | Updated escrow (ownership transfers to agent when threshold met) |

**Behavior**:
- Validates caller is one of signer_1/2/3
- Validates secret matches secret_hash
- Prevents duplicate approval from same signer
- When sig_count reaches required_sigs: status → Released (1), owner → agent

### 4.4.11 refund_multisig_escrow

**Purpose**: Owner refunds multi-sig escrow after deadline passes.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| escrow | MultiSigEscrowRecord | Private | Escrow to refund |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| MultiSigEscrowRecord | Record | Refunded escrow (status=2) |

**Finalize Effects**:
- Validates block height ≥ escrow deadline

**Failure Conditions**:
- Caller is not the owner
- Deadline has not passed

## 4.5 shadow_agent_session.aleo Transitions

### 4.5.1 create_session

**Purpose**: Client creates a pre-authorized spending session with an agent. One signature enables unlimited requests within bounds.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| agent | address | Private | Agent to authorize |
| max_total | u64 | Private | Maximum total spend |
| max_per_request | u64 | Private | Maximum per request |
| rate_limit | u64 | Private | Max requests per 100 blocks |
| duration_blocks | u64 | Private | Session duration in blocks |
| current_block | u64 | Private | Claimed current block height |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| PaymentSession | Record | Active session record |

**Finalize Effects**:
- Validates `current_block` within BLOCK_TOLERANCE
- Verifies session_id not already in `active_sessions` mapping
- Marks session as active

**Session ID Generation**:
```
session_id = BHP256::hash_to_field(SessionIdInput { caller, agent })
```

### 4.5.2 session_request

**Purpose**: Agent makes a request against an active session. No client signature required.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| session | PaymentSession | Private | Active session |
| amount | u64 | Private | Amount to charge |
| request_hash | field | Private | Unique request identifier |
| current_block | u64 | Private | Claimed current block height |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| PaymentSession | Record | Updated session (spent, request_count incremented) |
| SessionReceipt | Record | Receipt owned by agent |

**Finalize Effects**:
- Validates `current_block` within BLOCK_TOLERANCE

**Validation**:
- Caller must be session.agent
- Session status must be Active (0)
- Session must not be expired (current_block < valid_until)
- amount ≤ max_per_request
- (spent + amount) ≤ max_total
- Rate limiting: sliding window resets when current_block ≥ window_start + 100

### 4.5.3 settle_session

**Purpose**: Agent claims accumulated payments from a session.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| session | PaymentSession | Private | Session to settle |
| settlement_amount | u64 | Private | Amount to claim |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| PaymentSession | Record | Session (unchanged — can settle multiple times) |

**Failure Conditions**:
- settlement_amount > session.spent

**Note**: Off-chain credit transfer triggered by SDK. The session record is not consumed.

### 4.5.4 close_session

**Purpose**: Client closes session and reclaims unused funds.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| session | PaymentSession | Private | Session to close |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| PaymentSession | Record | Closed session (status=2) |

**Finalize Effects**:
- Removes session from `active_sessions` mapping

**Failure Conditions**:
- Caller is not session.owner

**Refund**: Client receives (max_total - spent) back off-chain.

### 4.5.5 pause_session

**Purpose**: Client temporarily suspends a session. Agent cannot make requests while paused.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| session | PaymentSession | Private | Session to pause |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| PaymentSession | Record | Paused session (status=1) |

**Failure Conditions**:
- Caller is not session.owner
- Session not Active

### 4.5.6 resume_session

**Purpose**: Client reactivates a paused session.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| session | PaymentSession | Private | Session to resume |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| PaymentSession | Record | Active session (status=0) |

**Failure Conditions**:
- Caller is not session.owner
- Session not Paused

### 4.5.7 create_policy

**Purpose**: Client creates a reusable spending policy template for constraining future sessions.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| max_session_value | u64 | Private | Maximum total per session |
| max_single_request | u64 | Private | Maximum per single request |
| allowed_tiers | u8 | Private | Bitmask of allowed vendor tiers |
| allowed_categories | u64 | Private | Bitmask of allowed service types |
| require_proofs | bool | Private | Whether vendor must provide proof |
| current_block | u64 | Private | Claimed current block height |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| SpendingPolicy | Record | Reusable policy template |

**Policy ID Generation**:
```
policy_id = BHP256::hash_to_field(PolicyIdInput { caller, height })
```

### 4.5.8 create_session_from_policy

**Purpose**: Create a session constrained by an existing spending policy.

**Inputs**:
| Parameter | Type | Visibility | Description |
|-----------|------|------------|-------------|
| policy | SpendingPolicy | Private | Policy to enforce |
| agent | address | Private | Agent to authorize |
| max_total | u64 | Private | Session max total |
| max_per_request | u64 | Private | Session max per request |
| rate_limit | u64 | Private | Max requests per window |
| duration_blocks | u64 | Private | Session duration |
| current_block | u64 | Private | Claimed current block height |

**Outputs**:
| Output | Type | Description |
|--------|------|-------------|
| SpendingPolicy | Record | Policy returned unchanged (reusable) |
| PaymentSession | Record | New session within policy bounds |

**Finalize Effects**:
- Validates `current_block` within BLOCK_TOLERANCE
- Verifies session_id not already active

**Policy Validation**:
- max_total ≤ policy.max_session_value
- max_per_request ≤ policy.max_single_request

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

### 5.2.1 Health Endpoints

#### GET /health
Basic health check.

**Response**: `{ "status": "ok", "timestamp": string, "version": string }`

#### GET /health/ready
Readiness probe with block height verification.

**Response**: `{ "status": "ready"|"not ready", "timestamp": string, "version": string, "blockHeight": number, "network": string }`
Returns 503 if Aleo RPC unreachable.

#### GET /health/live
Liveness probe.

**Response**: `{ "status": "live", "timestamp": string }`

#### GET /health/detailed
Detailed system status including subsystem health.

**Response**:
```
{
  "status": "ok",
  "timestamp": string,
  "version": string,
  "startedAt": string,
  "subsystems": {
    "aleo_rpc": { "circuit_breaker": string, "failure_count": number, "last_failure": string },
    "indexer": { "cached_agents": number, "tracked_agents": number, "cache_hit_rate": number, "total_fetches": number, "last_index_time": string },
    "redis": { "connected": boolean },
    "hash_ring": { "node_count": number, "distribution": object }
  }
}
```

### 5.2.2 Agent Discovery Endpoints

#### GET /agents
Search for agents by criteria.

**Query Parameters**:
| Parameter | Type | Required | Default | Description |
|-----------|------|----------|---------|-------------|
| service_type | number | No | — | Filter by service type (1-7) |
| min_tier | number | No | — | Minimum tier (0-4) |
| is_active | boolean | No | true | Only active agents |
| limit | number | No | 20 | Max results (1-100) |
| offset | number | No | 0 | Pagination offset |

**Response**: `{ "agents": AgentListing[], "total": number, "limit": number, "offset": number }`

#### GET /agents/:agentId
Get agent details by ID.

**Response**: AgentListing object or 404

#### GET /agents/by-address/:publicKey
Lookup agent by wallet address.

**Response**:
```
{
  "agent_id": string,
  "service_type": number,
  "endpoint_hash": string,
  "tier": number,
  "is_active": boolean,
  "registered_at": string,
  "total_jobs": number,
  "total_rating_points": number,
  "total_revenue": number
}
```

#### POST /agents/register
Notify facilitator of on-chain agent registration.

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| service_type | number | No | Service type (0-7) |
| address | string | No | Aleo address (aleo1... format) |
| endpoint_url | string | No | Service endpoint URL |
| tx_id | string | No | On-chain transaction ID for verification |

**Response**: `{ "success": true, "agent_id": string, "bond_record?": string, "on_chain_verified": boolean }`

#### POST /agents/unregister
Unregister agent from facilitator index.

**Request Body**: `{ "agent_id?": string, "address?": string }`

**Response**: `{ "success": true, "agent_id": string }`

#### GET /agents/:agentId/proof
Get or verify agent reputation proof.

**Query Parameters**:
| Parameter | Type | Description |
|-----------|------|-------------|
| proof | string | Proof string to verify |
| proof_type | number | Proof type (1-4) |
| threshold | number | Threshold value |
| tx_id | string | On-chain transaction ID |

**Response**: `{ "agent_id": string, "tier": number, "tier_name": string, "proof_type": number, "threshold_met": boolean, "verified_on_chain": boolean, "message": string }`

### 5.2.3 Rating Endpoints

#### POST /agents/:agentId/rating
Submit a rating for a completed job.

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| job_hash | string | Yes | Job identifier |
| rating | number | Yes | Rating value (1-50 integer) |
| payment_amount | number | No | Job payment amount |
| nullifier | string | No | Client nullifier |
| tx_id | string | No | On-chain transaction ID |
| on_chain | boolean | No | Whether to verify on-chain |

**Response**: `{ "success": true, "rating": RatingRecord }`

**Rate Limiting**: Configurable per-address window

### 5.2.4 Verification Endpoints

#### POST /verify/reputation
Verify a reputation proof.

**Request Body**: `{ "proof_type": number, "threshold": number, "proof": string, "required_threshold?": number }`

**Response**: `{ "valid": boolean, "tier?": number, "error?": string }`

### 5.2.5 Job Management Endpoints

#### POST /jobs
Create a new job listing.

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| agent | string | Yes | Agent address |
| client | string | Yes | Client address |
| title | string | Yes | Job title (max 200 chars) |
| description | string | Yes | Job description (max 2000 chars) |
| service_type | number | Yes | Service type (1-7) |
| pricing | number | Yes | Job price |
| escrow_amount | number | Yes | Escrow amount |
| secret_hash | string | Yes | HTLC secret hash |
| multisig_enabled | boolean | No | Enable multi-sig escrow |
| signers | [string, string, string] | No | Multi-sig signers (if enabled) |
| required_signatures | number | No | Required sigs 1-3 (if enabled) |

**Response**: `{ "success": true, "job": JobRecord }`

**Rate Limiting**: 10/min per address

#### GET /jobs
List jobs with optional filters.

**Query Parameters**: `agent?`, `client?`, `status?` (draft|open|in_progress|completed|cancelled), `service_type?`

**Response**: JobRecord[] sorted by created_at DESC

#### GET /jobs/:jobId
Get job details.

#### PATCH /jobs/:jobId
Update job status.

**Request Body**: `{ "status?": string, "escrow_status?": string, "caller": string }`

**Status Transitions**: draft→open→in_progress→completed|cancelled

#### GET /jobs/:jobId/status
Get job escrow status.

### 5.2.6 Partial Refund Endpoints

#### POST /refunds
Propose a partial refund split.

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| agent | string | Yes | Agent address |
| total_amount | number | Yes | Original escrow amount |
| agent_amount | number | Yes | Proposed agent share |
| job_hash | string | Yes | Job identifier |
| client | string | No | Client address |

**Response**: `{ "success": true, "proposal": RefundProposal }`

#### GET /refunds
List refund proposals. **Query**: `agent_id?`, `status?` (proposed|accepted|rejected)

#### GET /refunds/:jobHash
Get refund proposal status.

#### POST /refunds/:jobHash/accept
Agent accepts partial refund. **Body**: `{ "agent_id": string }`

#### POST /refunds/:jobHash/reject
Agent rejects partial refund. **Body**: `{ "agent_id": string }`

### 5.2.7 Dispute Resolution Endpoints

#### POST /disputes
Open a dispute.

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| agent | string | Yes | Agent address |
| job_hash | string | Yes | Job identifier |
| escrow_amount | number | Yes | Amount in dispute |
| evidence_hash | string | Yes | Hash of client evidence |
| client | string | No | Client address |

**Response**: `{ "success": true, "dispute": DisputeRecord }`

**Rate Limiting**: 3/hour per address

#### GET /disputes
List disputes. **Query**: `agent_id?`, `client?`, `status?` (open|resolved)

#### GET /disputes/:jobHash
Get dispute details.

#### POST /disputes/:jobHash/respond
Agent responds with counter-evidence.

**Request Body**: `{ "evidence_hash": string, "agent_id": string }`

#### POST /disputes/:jobHash/resolve
Admin resolves dispute.

**Request Body**: `{ "agent_percentage": number (0-100), "admin_address": string }`

**Response**: `{ "success": true, "dispute": DisputeRecord, "settlement": { "agent_amount": number, "client_amount": number } }`

### 5.2.8 Multi-Sig Escrow Endpoints

#### POST /escrows/multisig
Create a multi-sig escrow.

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| agent | string | Yes | Agent address |
| amount | number | Yes | Escrow amount |
| job_hash | string | Yes | Job identifier |
| secret_hash | string | Yes | HTLC secret hash |
| signers | [string, string, string] | Yes | Three authorized signers |
| required_signatures | number | Yes | Threshold (1-3) |
| owner | string | No | Escrow owner |
| deadline | number | No | Deadline in blocks |

**Response**: `{ "success": true, "escrow": MultiSigEscrowRecord }`

#### GET /escrows/multisig/:jobHash
Get multi-sig escrow status.

#### GET /escrows/pending/:address
Get multi-sig escrows pending approval for a specific signer.

#### POST /escrows/multisig/:jobHash/approve
Signer approves escrow release.

**Request Body**: `{ "signer_address": string, "secret?": string }`

**Response**: `{ "success": true, "escrow": MultiSigEscrowRecord, "threshold_met": boolean }`

### 5.2.9 Session Management Endpoints

#### POST /sessions
Create a pre-authorized spending session.

**Request Body**:
| Field | Type | Required | Description |
|-------|------|----------|-------------|
| agent | string | Yes | Agent to authorize |
| max_total | number | Yes | Maximum total spend |
| max_per_request | number | Yes | Maximum per request |
| rate_limit | number | Yes | Max requests per window |
| duration_blocks | number | Yes | Session duration |
| client | string | No | Client address |
| session_id | string | No | Custom session ID |

**Response**: `{ "success": true, "session": SessionRecord }`

#### GET /sessions
List sessions. **Query**: `client?`, `agent?`, `status?` (active|paused|closed)

#### GET /sessions/:sessionId
Get session details.

#### POST /sessions/:sessionId/request
Agent makes a request against a session.

**Request Body**: `{ "amount": number, "request_hash?": string }`

**Response**: `{ "success": true, "session": SessionRecord, "receipt": SessionReceiptRecord }`

**Rate Limiting**: Enforced per session's rate_limit setting (sliding window)

#### POST /sessions/:sessionId/settle
Agent settles accumulated payments.

**Request Body**: `{ "settlement_amount": number, "agent": string }`

**Response**: `{ "success": true, "session": SessionRecord, "settlement": { "amount": number, "settled_at": string } }`

#### POST /sessions/:sessionId/close
Client closes session and reclaims unused funds.

**Request Body**: `{ "client?": string, "agent?": string }`

**Response**: `{ "success": true, "session": SessionRecord, "refund_amount": number }`

#### POST /sessions/:sessionId/pause
Client pauses session.

#### POST /sessions/:sessionId/resume
Client resumes paused session.

### 5.2.10 Spending Policy Endpoints

#### POST /sessions/policies
Create a reusable spending policy.

**Request Body**:
| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| owner | string | Yes | — | Policy creator address |
| max_session_value | number | Yes | — | Max total per session |
| max_single_request | number | Yes | — | Max per request |
| allowed_tiers | number | No | 0xff | Bitmask of allowed tiers |
| allowed_categories | number | No | 0xffffffff | Bitmask of service types |
| require_proofs | boolean | No | false | Require reputation proofs |

**Response**: `{ "success": true, "policy": PolicyRecord }`

#### GET /sessions/policies
List policies. **Query**: `owner?`

#### GET /sessions/policies/:policyId
Get policy details.

#### POST /sessions/policies/:policyId/create-session
Create a session constrained by policy bounds.

**Request Body**: `{ "agent": string, "client?": string, "max_total": number, "max_per_request": number, "rate_limit": number, "duration_blocks": number }`

**Response**: `{ "success": true, "session": SessionRecord, "policy_id": string }`

### 5.2.11 Escrow Fallback Endpoints

#### POST /escrows
Create escrow (facilitator fallback when on-chain fails).

**Request Body**: `{ "agent": string, "amount": number, "job_hash": string, "secret_hash": string }`

#### GET /escrows/:jobHash
Get escrow status.

### 5.2.12 TTL and Rate Limit Summary

| Resource | TTL | Rate Limit |
|----------|-----|------------|
| Jobs | 30 days | 10/min per address |
| Disputes | 90 days | 3/hour per address |
| Sessions | 7 days | Per-session rate_limit |
| Policies | 30 days | — |
| Ratings | 365 days | Configurable per-address |
| Refunds | — | 5/hour per address |
| Multi-sig | — | 10/min per address |

## 5.3 SDK Interface Specifications

### 5.3.1 Client SDK (ShadowAgentClient)

#### Discovery & Health

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| searchAgents | params?: SearchParams | Promise\<SearchResult\> | Search agents by criteria |
| getAgent | agentId: string | Promise\<AgentListing \| null\> | Get specific agent details |
| getHealth | — | Promise\<{status, blockHeight?}\> | Get facilitator health |
| getConfig | — | Readonly\<ClientConfig\> | Get current config (masked key) |
| setConfig | updates: Partial\<ClientConfig\> | void | Update configuration |

#### Payment & Escrow

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| request\<T\> | agentUrl, options?: RequestOptions | Promise\<RequestResult\<T\>\> | Make x402 paid request |
| createEscrow | paymentTerms, jobHash | Promise\<EscrowProof\> | Create HTLC escrow |
| getEscrowSecret | jobHash: string | string \| undefined | Retrieve stored secret |
| submitRating | agentAddress, jobHash, rating, paymentAmount | Promise\<{success, txId?, error?}\> | Submit rating with burn |

#### Partial Refunds & Disputes

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| proposePartialRefund | agent, totalAmount, agentAmount, jobHash | Promise\<{success, txId?, error?}\> | Propose refund split |
| getPartialRefundStatus | jobHash: string | Promise\<PartialRefundProposal \| null\> | Get refund status |
| openDispute | agent, jobHash, escrowAmount, evidenceHash | Promise\<{success, txId?, error?}\> | Open dispute |
| getDisputeStatus | jobHash: string | Promise\<Dispute \| null\> | Get dispute status |

#### Multi-Sig Escrow

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| createMultiSigEscrow | agent, amount, jobHash, deadline, config | Promise\<{success, txId?, secretHash?, error?}\> | Create M-of-3 escrow |
| getMultiSigEscrowStatus | jobHash: string | Promise\<MultiSigEscrow \| null\> | Get multi-sig status |

#### Session Management

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| createSession | agent, maxTotal, maxPerRequest, rateLimit, durationBlocks | Promise\<{success, sessionId?, txId?, error?}\> | Create spending session |
| sessionRequest | sessionId, amount, requestHash | Promise\<{success, txId?, error?}\> | Make session request |
| settleSession | sessionId, settlementAmount | Promise\<{success, txId?, error?}\> | Settle accumulated payments |
| closeSession | sessionId: string | Promise\<{success, refundAmount?, txId?, error?}\> | Close and refund |
| pauseSession | sessionId: string | Promise\<{success, error?}\> | Pause session |
| resumeSession | sessionId: string | Promise\<{success, error?}\> | Resume paused session |
| getSessionStatus | sessionId: string | Promise\<PaymentSession \| null\> | Get session details |

#### Spending Policies

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| createPolicy | maxSessionValue, maxSingleRequest, allowedTiers?, allowedCategories?, requireProofs? | Promise\<{success, policyId?, txId?, error?}\> | Create policy template |
| createSessionFromPolicy | policyId, agent, maxTotal, maxPerRequest, rateLimit, durationBlocks | Promise\<{success, sessionId?, txId?, error?}\> | Session from policy |
| listPolicies | — | Promise\<SpendingPolicy[]\> | List user's policies |
| getPolicy | policyId: string | Promise\<SpendingPolicy \| null\> | Get policy details |

#### Reputation Verification

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| verifyReputationProof | proof: {proof_type, threshold, proof, tier?}, requiredThreshold? | Promise\<VerificationResult\> | Verify reputation proof |

### 5.3.2 Agent SDK (ShadowAgentServer)

#### Registration & Identity

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| register | endpointUrl: string, bondAmount?: number | Promise\<{success, agentId?, bondRecord?, txId?, error?}\> | Register with bond stake |
| unregister | — | Promise\<{success, bondReturned?, txId?, error?}\> | Unregister, reclaim bond |
| getAgentId | — | string | Get agent identifier |
| getConfig | — | Readonly\<Omit\<AgentConfig, 'privateKey'\>\> | Get config (masked key) |

#### Payment Handling

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| middleware | options?: {pricePerRequest?} | Express middleware | x402 payment middleware |
| verifyPayment | proofHeader, jobHash, requiredAmount | Promise\<{valid, amount?, error?}\> | Verify payment proof |
| claimEscrow | jobHash: string | Promise\<{success, txId?, error?}\> | Claim escrow with secret |

#### Reputation Management

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| getReputation | — | Promise\<AgentReputation \| null\> | Get current reputation |
| setReputation | reputation: AgentReputation | void | Set reputation (init/testing) |
| updateReputation | ratingRecord: {rating, payment_amount, ratingRecordCiphertext} | Promise\<{success, newTier?, txId?, error?}\> | Update with new rating |
| proveReputation | proofType, threshold | Promise\<ReputationProof \| null\> | Generate ZK proof |
| getReputationWithDecay | — | Promise\<DecayedReputation \| null\> | Reputation with decay applied |
| proveReputationWithDecay | proofType, threshold | Promise\<{success, txId?, error?}\> | On-chain decayed proof |
| updateListing | newServiceType?, newEndpointUrl?, isActive? | Promise\<{success, txId?, error?}\> | Update public listing |

#### Partial Refunds & Disputes

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| acceptPartialRefund | jobHash: string | Promise\<{success, txId?, error?}\> | Accept refund proposal |
| rejectPartialRefund | jobHash: string | Promise\<{success, error?}\> | Reject refund proposal |
| getPendingRefundProposals | — | Promise\<PartialRefundProposal[]\> | List pending proposals |
| respondToDispute | jobHash, evidenceHash | Promise\<{success, txId?, error?}\> | Submit counter-evidence |
| getOpenDisputes | — | Promise\<Dispute[]\> | List open disputes |

#### Multi-Sig Escrow

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| approveMultiSigEscrow | jobHash, secret | Promise\<{success, txId?, error?}\> | Approve release |

#### Record Store

| Method | Parameters | Returns | Description |
|--------|------------|---------|-------------|
| getRecordStore | — | RecordStore | Access UTXO record store |

---

# 6. Security Model

## 6.1 Threat Model

### 6.1.1 Attacker Capabilities

| Attacker Type | Capabilities | Mitigations |
|---------------|--------------|-------------|
| Malicious Agent | Create fake ratings, inflate reputation | Burn-to-rate, bond staking |
| Malicious Client | Double-spend, refuse payment | Escrow HTLC, nullifier tracking |
| Network Observer | Transaction correlation | Private records, session batching |
| Sybil Attacker | Create multiple identities | Bond staking (10 credits/agent) |
| Front-runner | Observe and exploit transactions | Private records hide amounts |
| Dispute Abuser | Open frivolous disputes | Rate limiting (3/hour), economic disincentive |
| Session Drainer | Exhaust session budget | Per-request max, rate limiting, sliding window |
| Decay Gamer | Manipulate block height claims | BLOCK_TOLERANCE (±10) finalize verification |

### 6.1.2 Security Properties

| Property | Implementation | Verification |
|----------|----------------|--------------|
| Payment Privacy | Aleo private records | Transaction analysis |
| Reputation Integrity | Rolling hash chain | ZK verification |
| Sybil Resistance | Bond staking + burn mechanism | Economic analysis |
| Fair Exchange | HTLC escrow | Game-theoretic proof |
| Non-repudiation | Nullifier tracking | Double-spend impossible |
| Temporal Freshness | Block height verification in finalize | BLOCK_TOLERANCE = ±10 blocks |
| Session Isolation | Per-session spending caps + rate limits | On-chain enforcement |
| Multi-party Oversight | M-of-3 signer threshold | All approvals verified on-chain |

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
| prove_rating_decay | min_rating, current_block | AgentReputation | "decayed avg rating ≥ threshold" |
| prove_tier_with_decay | required_tier, current_block | AgentReputation | "tier ≥ required (with decay context)" |

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

## 6.5 Dispute Resolution Security

### 6.5.1 Dispute Integrity

| Property | Mechanism |
|----------|-----------|
| No duplicate disputes | `active_disputes` mapping prevents second dispute for same job_hash |
| Evidence immutability | Evidence stored as hashes — original data off-chain |
| Impartial resolution | Admin-only resolve (configurable admin address) |
| Atomic settlement | Resolution produces two records (one per party) in single transition |
| Rate limiting | Facilitator enforces 3 disputes/hour per address |

### 6.5.2 Partial Refund Security

| Property | Mechanism |
|----------|-----------|
| Cooperative only | Agent must explicitly accept — no forced splits |
| Agent can reject | Rejection returns full ownership to client |
| Amount validation | agent_amount < total_amount enforced on-chain |

## 6.6 Session Security

### 6.6.1 Session Spending Controls

| Control | Enforcement | Description |
|---------|-------------|-------------|
| Total budget | On-chain (spent + amount ≤ max_total) | Cannot exceed authorized total |
| Per-request cap | On-chain (amount ≤ max_per_request) | Prevents single large drain |
| Rate limiting | On-chain (sliding window per 100 blocks) | Window resets when current_block ≥ window_start + RATE_WINDOW_BLOCKS |
| Expiry | On-chain (current_block < valid_until) | Sessions auto-expire |
| Pause/resume | On-chain (status check) | Client can instantly freeze spending |

### 6.6.2 Session Trust Model

```
┌─────────────────────────────────────────────────────────────────────┐
│                    SESSION TRUST BOUNDARIES                          │
├─────────────────────────────────────────────────────────────────────┤
│                                                                      │
│  CLIENT TRUSTS:                                                     │
│  ├── On-chain enforcement of max_total, max_per_request             │
│  ├── On-chain rate limiting per window                              │
│  └── Ability to pause/close at any time                             │
│                                                                      │
│  AGENT TRUSTS:                                                      │
│  ├── Session record authenticity (Aleo record model)                │
│  └── Settlement will be honored (on-chain state)                    │
│                                                                      │
│  NEITHER PARTY TRUSTS:                                              │
│  ├── Facilitator (fallback only, not authoritative)                 │
│  └── Network observers (all session data is private)                │
│                                                                      │
└─────────────────────────────────────────────────────────────────────┘
```

## 6.7 Multi-Sig Escrow Security

### 6.7.1 Multi-Sig Properties

| Property | Mechanism |
|----------|-----------|
| Threshold enforcement | sig_count tracked on-chain, release only when required_sigs met |
| No double-approval | sig_X_approved flags prevent same signer approving twice |
| Secret required | Each approval validates BHP256::hash_to_field(secret) == secret_hash |
| Timeout protection | refund_multisig_escrow requires block.height ≥ deadline (verified in finalize) |
| Configurable M-of-N | required_sigs 1-3, validated in create_multisig_escrow |

## 6.8 Facilitator Resilience

### 6.8.1 Circuit Breaker Pattern

The facilitator protects against cascading Aleo RPC failures:

```
┌──────────┐     failures ≥ threshold      ┌──────────┐
│  CLOSED  │ ───────────────────────────►   │   OPEN   │
│ (normal) │                                │ (reject) │
└──────────┘                                └────┬─────┘
      ▲                                          │ reset timeout
      │        ┌──────────┐                      │
      └────────│HALF-OPEN │ ◄────────────────────┘
   success     │  (test)  │
               └──────────┘
```

| Parameter | Default | Env Variable |
|-----------|---------|--------------|
| Failure threshold | 5 failures | ALEO_CB_FAILURE_THRESHOLD |
| Reset timeout | 60 seconds | ALEO_CB_RESET_TIMEOUT_MS |
| Retry strategy | Exponential backoff + jitter | ALEO_RETRY_BASE_DELAY_MS |
| Max retries | 3 | ALEO_MAX_RETRIES |

---

# 7. Cryptographic Primitives

## 7.1 Hash Functions

### 7.1.1 BHP256 (On-Chain)

**Usage**: Primary hash function for Aleo smart contracts

**Constraint**: `BHP256::hash_to_field()` does NOT accept tuples — must use a named `struct` as input.

**Applications in ShadowAgent**:

| Usage | Input Struct | Hash Expression |
|-------|-------------|-----------------|
| Agent ID | CallerInput { caller } | `BHP256::hash_to_field(input)` |
| Client nullifier | NullifierInput { caller_hash, job_hash } | `BHP256::hash_to_field(input)` |
| Secret hash | SecretInput { secret } | `BHP256::hash_to_field(input)` |
| Burn proof | BurnInput { amount, height } | `BHP256::hash_to_field(input)` |
| Session ID | SessionIdInput { caller, agent } | `BHP256::hash_to_field(input)` |
| Policy ID | PolicyIdInput { caller, height } | `BHP256::hash_to_field(input)` |

### 7.1.2 SHA-256 (Off-Chain SDK)

**Usage**: SDK-side hash function for x402 protocol operations

**SDK Crypto Functions** (all in `shadow-sdk/src/crypto.ts`):

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `hashSecret(secret)` | string | SHA-256 hex | HTLC secret hashing |
| `generateJobHash(method, url, timestamp)` | request details + nonce | SHA-256 hex | Unique job identification |
| `generateNullifier(callerHash, jobHash)` | two hashes | SHA-256 hex | Double-action prevention |
| `generateAgentId(address)` | Aleo address | SHA-256 hex | Agent ID (mirrors BHP256) |
| `generateCommitment(amount, recipient, secret)` | escrow params | SHA-256 hex | Escrow commitment |
| `generateBondCommitment(agentId, amount, ts)` | bond params | SHA-256 hex | Bond tracking |
| `generateSessionId()` | — | 16-byte random hex | Session identification |
| `generateSecret()` | — | 32-byte random hex | HTLC secret generation |

### 7.1.3 Poseidon

**Usage**: ZK-friendly hash function (reserved for future Merkle tree features)

## 7.2 Aleo SDK Integration

### 7.2.1 Lazy WASM Loading Pattern

The `@provablehq/sdk` uses WebAssembly which causes `RuntimeError: memory access out of bounds` if statically imported at bundle parse time. ShadowAgent uses lazy loading:

```
// BAD - causes WASM crash at bundle parse time:
import { Account, ProgramManager } from '@provablehq/sdk';

// GOOD - defers WASM initialization to runtime:
async function getSDK() {
  return await import('@provablehq/sdk');
}
```

**Thread Pool**: WASM operations require thread pool initialization via `initThreadPool()`. The SDK ensures this is called once before any signing or proof generation.

### 7.2.2 Transaction Execution

| Function | Program | Purpose |
|----------|---------|---------|
| `executeTransaction(programId, fn, inputs, key, fee)` | Any | General program execution |
| `executeCreditsProgram(fn, inputs, key, fee)` | credits.aleo | Credit transfers |
| `transferPublic(key, recipient, amount, fee)` | credits.aleo | Public transfer (manual auth to bypass SDK fee floor) |
| `transferPrivate(key, recipient, amount, fee)` | credits.aleo | Private transfer |

### 7.2.3 Signing and Verification

| Function | Input | Output | Purpose |
|----------|-------|--------|---------|
| `signData(data, privateKey)` | UTF-8 bytes | Aleo signature string | Sign proofs, commitments |
| `verifySignature(data, sig, publicKey)` | UTF-8 bytes + sig | boolean | Verify Aleo signatures |
| `createEscrowProof(escrowData, key)` | amount/recipient/hash | {proof, nullifier, commitment} | x402 escrow proof |
| `createReputationProof(type, threshold, data, key)` | reputation data | {proof_type, threshold, proof, tier} | ZK reputation proof |

### 7.2.4 Blockchain Queries

| Function | Returns | Purpose |
|----------|---------|---------|
| `getBalance(address)` | number (microcredits) | Account balance from credits.aleo mapping |
| `getBlockHeight()` | number | Current testnet block height |
| `getAddress(privateKey)` | string | Extract address from private key |
| `generatePrivateKey()` | string | Generate new Aleo private key |
| `decryptRecord(ciphertext, viewKey)` | RecordPlaintext \| null | Decrypt on-chain record |
| `createAccount(privateKey)` | Account | Aleo Account instance |

## 7.3 Zero-Knowledge Circuits

### 7.3.1 Proof Generation

| Proof | Program | Circuit Complexity | Proving Time (Est.) |
|-------|---------|-------------------|---------------------|
| prove_rating | shadow_agent.aleo | O(1) | ~1-2 seconds |
| prove_jobs | shadow_agent.aleo | O(1) | ~1 second |
| prove_revenue_range | shadow_agent.aleo | O(1) | ~1-2 seconds |
| prove_tier | shadow_agent.aleo | O(1) | ~1 second |
| prove_rating_decay | shadow_agent_ext.aleo | O(10) unrolled | ~2-3 seconds |
| prove_tier_with_decay | shadow_agent_ext.aleo | O(10) unrolled | ~2-3 seconds |
| escrow verification | shadow_agent.aleo | O(1) | ~1 second |
| multi-sig approval | shadow_agent_ext.aleo | O(1) | ~1 second |

### 7.3.2 Verification

All proofs are verified on-chain with constant-time verification (~O(1)). The facilitator can also verify proofs off-chain by checking:
1. Proof structure and base64 format validity
2. Transaction existence on-chain via `getTransaction(txId)`
3. Correct program and function execution
4. Cross-checking output record fields against claimed values

## 7.4 Record Encryption

### 7.4.1 Aleo Record Model

- Records encrypted with owner's view key
- Only owner can decrypt and view contents
- Network sees encrypted ciphertext only
- Proofs generated without revealing record contents
- SDK tracks records locally via `RecordStore` (UTXO model)

### 7.4.2 Key Hierarchy

```
┌─────────────────────────────────────────────────────────────────┐
│                      ALEO KEY HIERARCHY                          │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Private Key (seed)                                             │
│       │                                                          │
│       ├──► View Key (decrypt records, read on-chain state)      │
│       │                                                          │
│       ├──► Proving Key (generate ZK proofs, sign transactions)  │
│       │                                                          │
│       └──► Address (public identifier, record ownership)        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

## 7.5 Unit Conversion Utilities

The SDK provides type-safe conversion helpers:

| Utility | Functions | Example |
|---------|-----------|---------|
| `currency` | `toMicrocents(dollars)`, `toDollars(mc)`, `format(mc)` | `currency.toMicrocents(10)` → `10000000` |
| `rating` | `toScaled(stars)`, `toStars(scaled)`, `format(scaled)` | `rating.toScaled(4.5)` → `45` |
| `credits` | `toMicrocredits(cr)`, `toCredits(mcr)`, `format(mcr)` | `credits.format(10000000)` → `"10.00 credits"` |

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

| Transition | Purpose | Caller | Signature Required |
|------------|---------|--------|--------------------|
| create_session | Authorize spending bounds | Client | Yes (one-time) |
| session_request | Charge against session | Agent | No |
| settle_session | Claim accumulated spend | Agent | No |
| pause_session | Temporarily freeze | Client | No |
| resume_session | Reactivate paused session | Client | No |
| close_session | Terminate, refund unused | Client | No |

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

## 8.5 Frontend Architecture

### 8.5.1 Technology Stack

| Technology | Purpose |
|------------|---------|
| React 18 | UI framework |
| Vite | Build tool and dev server |
| TailwindCSS | Utility-first styling |
| Zustand | State management (4 stores) |
| React Router v6 | Client-side routing |
| Lucide React | Icon library |
| @provablehq/sdk | Aleo wallet integration (lazy-loaded) |

### 8.5.2 Route Map

| Path | Page Component | Description |
|------|----------------|-------------|
| `/` | HomePage | Landing page with project overview |
| `/client` | ClientDashboard | Search agents, manage sessions/escrows |
| `/agent` | AgentDashboard | Registration, reputation, jobs panel |
| `/agents/:agentId` | AgentDetails | Agent profile, job selector, escrow secrets |
| `/jobs` | JobMarketplace | Browse/create jobs with escrow backing |
| `/disputes` | DisputeCenter | Open/manage disputes, multi-sig, refunds |
| `/activity` | TransactionHistory | All on-chain transactions and ratings |
| `/diagnostics` | TestnetDiagnostics | Block height, balance, network health |

### 8.5.3 State Management (Zustand Stores)

| Store | Key State | Purpose |
|-------|-----------|---------|
| walletStore | address, balance, privateKey, isConnected | Wallet connection and identity |
| sdkStore | client (ShadowAgentClient), agent (ShadowAgentServer) | SDK instances |
| agentStore | agents[], selectedAgent, searchAgents() | Agent discovery and caching |
| sessionStore | sessions[], createSession(), closeSession() | Session lifecycle |
| disputeStore | disputes[], openDispute(), resolveDispute() | Dispute management |

### 8.5.4 Architecture Patterns

- **Lazy loading**: All page components loaded via `React.lazy()` for route-level code splitting
- **Error boundary**: Top-level `ErrorBoundary` catches rendering failures with reload option
- **WASM isolation**: `@provablehq/sdk` loaded via lazy `import()` in `WalletProvider`, never statically imported
- **Type mirroring**: Frontend mirrors SDK types locally to avoid WASM import chain at parse time
- **Auto-refresh**: Agent search on ClientDashboard refreshes every 60 seconds
- **Health polling**: SDK health check runs every 30 seconds
- **Hydration**: On wallet connect, frontend hydrates activity data from facilitator

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

All three programs are deployed with `@noupgrade` (immutable on-chain):

```
Step 1: Compile Leo programs (shadow_agent, shadow_agent_ext, shadow_agent_session)
Step 2: Generate deployment transaction with ALEO_PRIVATE_KEY
Step 3: Broadcast to Aleo testnet/mainnet
Step 4: Wait for confirmation (~30s on testnet)
Step 5: Verify deployment via RPC: GET /program/{program_id}
```

### 9.2.2 Facilitator Deployment

```
Step 1: Configure environment variables (see 9.3.1)
Step 2: npm install && npm run build
Step 3: Deploy (Render, Docker, or directly: node dist/index.js)
Step 4: Verify health: GET /health/ready
Step 5: Seed agents via SEED_AGENTS env var (optional)
```

### 9.2.3 Frontend Deployment

```
Step 1: Configure VITE_FACILITATOR_URL in .env
Step 2: npm run build (Vite production build)
Step 3: Deploy to Vercel, CDN, or static host
Step 4: Verify facilitator connectivity via /diagnostics page
```

### 9.2.4 Middleware Stack (Facilitator)

Requests pass through this middleware chain in order:

```
1. helmet()                    — Security headers (XSS, CSP, etc.)
2. cors()                      — CORS with configurable origin
3. express.json({limit:'100kb'}) — Body parsing with size limit
4. X-Request-ID               — Attach unique trace ID to every request
5. Request timeout (30s)       — Prevents hanging connections
6. Health routes (exempt from rate limiting)
7. Global rate limiter         — Token bucket across all routes
8. Request logging (Winston)   — Method, path, IP, user-agent
9. Route handlers              — /agents, /verify, /refunds, /disputes, etc.
10. Error handler              — 500 with request_id
11. 404 handler                — Catch-all
```

## 9.3 Configuration

### 9.3.1 Facilitator Environment Variables

| Variable | Default | Required | Description |
|----------|---------|----------|-------------|
| PORT | 3001 | No | Server port |
| ALEO_RPC_URL | https://api.explorer.aleo.org/v1 | No | Aleo RPC endpoint |
| ALEO_NETWORK | testnet | No | Network (testnet/mainnet) |
| PROGRAM_ID | shadow_agent.aleo | No | Core program ID |
| CORS_ORIGIN | * | No | Allowed origins (comma-separated or *) |
| LOG_LEVEL | info | No | Winston log level |
| NODE_ENV | development | No | Environment mode |
| REQUEST_TIMEOUT_MS | 30000 | No | Request timeout (ms) |
| ALEO_MAX_RETRIES | 3 | No | RPC retry count |
| ALEO_RETRY_BASE_DELAY_MS | 1000 | No | Retry base delay |
| ALEO_RETRY_MAX_DELAY_MS | 30000 | No | Retry max delay |
| ALEO_CB_FAILURE_THRESHOLD | 5 | No | Circuit breaker failure threshold |
| ALEO_CB_RESET_TIMEOUT_MS | 60000 | No | Circuit breaker reset timeout |
| SEED_AGENTS | — | No | Pre-seed agents (format: `address:type:tier,...`) |
| SEED_JOBS | — | No | Pre-seed jobs (JSON array) |
| INITIAL_AGENT_IDS | — | No | Agent IDs to import from chain on startup |
| REDIS_URL | — | No | Redis connection (optional, graceful degradation) |

### 9.3.2 Frontend Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| VITE_FACILITATOR_URL | /api | Facilitator service URL |
| VITE_API_URL | — | Fallback API URL |
| VITE_ADMIN_ADDRESS | aleo1qqq...3ljyzc | Admin address for disputes |

### 9.3.3 CORS Configuration

The facilitator exposes these headers for x402 payment flow:

| Allowed Headers (Request) | Exposed Headers (Response) |
|---------------------------|---------------------------|
| Content-Type | X-Delivery-Secret |
| Authorization | X-Job-Id, X-Job-Hash |
| X-Escrow-Proof | X-Payment-Required |
| X-Job-Hash | X-RateLimit-Limit/Remaining/Reset |
| | X-Request-ID, Retry-After |

### 9.3.4 Program Constants (On-Chain, Immutable)

| Parameter | Value | Description |
|-----------|-------|-------------|
| RATING_BURN_COST | 500,000 microcredits | Credits burned per rating |
| MIN_PAYMENT_FOR_RATING | 100,000 microcents | Minimum job payment |
| REGISTRATION_BOND | 10,000,000 microcredits | Bond per agent registration |
| BLOCK_TOLERANCE | 10 blocks | Block height verification window |
| RATE_WINDOW_BLOCKS | 100 blocks | Session rate-limit window |
| DECAY_PERIOD_BLOCKS | 100,800 blocks | ~7 days per decay period |

## 9.4 Monitoring

### 9.4.1 Key Metrics

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| Transaction success rate | % of successful txns | < 99% |
| Proof generation time | Average proving time | > 5 seconds |
| Escrow completion rate | % of escrows completed | < 95% |
| API latency | Facilitator response time | > 500ms |
| Circuit breaker state | Aleo RPC health | State = OPEN |
| Indexer cache hit rate | Agent listing cache efficiency | < 80% |
| Redis connectivity | Cache layer health | Disconnected |

### 9.4.2 Health Endpoints

| Endpoint | Purpose | Used By |
|----------|---------|---------|
| GET /health | Basic health | Quick checks |
| GET /health/live | Liveness probe | Kubernetes/Docker |
| GET /health/ready | Readiness probe (checks block height) | Load balancers |
| GET /health/detailed | Full subsystem status | Monitoring dashboards |

### 9.4.3 Logging (Winston)

| Log Level | Events |
|-----------|--------|
| ERROR | Transaction failures, proof errors, unhandled exceptions |
| WARN | Rate limits hit, circuit breaker state changes, Redis unavailable |
| INFO | Successful operations, request logging, startup configuration |
| DEBUG | Detailed execution traces, proof data |

### 9.4.4 Graceful Shutdown

The facilitator handles SIGTERM/SIGINT with ordered cleanup (LIFO):
1. Close HTTP server (stop accepting new requests)
2. Stop background indexer
3. Disconnect Redis

---

# 10. Testing Strategy

## 10.1 Test Categories

### 10.1.1 Test Suite Summary

| Component | Test File(s) | Test Count | Status |
|-----------|-------------|------------|--------|
| SDK Crypto | crypto.test.ts | ~80 | All passing |
| SDK Decay | decay.test.ts, decay-cross-verify.test.ts | ~40 | All passing |
| SDK Testnet | testnet.test.ts | ~48 | All passing |
| **SDK Total** | | **168** | **All passing** |
| Facilitator Agents | routes/agents.test.ts | ~60 | All passing |
| Facilitator Sessions | routes/sessions.test.ts | ~50 | All passing |
| Facilitator Disputes | routes/disputes.test.ts | ~40 | All passing |
| Facilitator Multi-Sig | routes/multisig.test.ts | ~35 | All passing |
| Facilitator Jobs | routes/jobs.test.ts | ~40 | All passing |
| Facilitator Refunds | routes/refunds.test.ts | ~30 | All passing |
| Facilitator Services | services/*.test.ts | ~87 | All passing |
| **Facilitator Total** | | **342** | **All passing** |
| Frontend Components | *.test.tsx | ~15 | All passing |

### 10.1.2 Unit Tests

| Component | Test Focus | Coverage Target |
|-----------|------------|-----------------|
| Leo transitions | Input validation, state changes, assert failures | 100% |
| SDK crypto | Hash generation, signing, verification, encoding | 95% |
| SDK decay | Cross-verification of TypeScript decay against Leo decay | 95% |
| Facilitator handlers | Request/response processing, validation, error paths | 90% |
| Frontend components | Rendering, user interaction, state updates | 80% |

### 10.1.3 Integration Tests

| Test Scenario | Components | Success Criteria |
|---------------|------------|------------------|
| Agent registration | SDK → Contract → Mapping | Record created, bond staked |
| Service purchase | Client → Agent → Escrow | Payment settled via HTLC |
| Rating submission | Client → Contract → Reputation | Stats updated, nullifier consumed |
| Proof generation | Agent → Contract → Proof | Valid proof output |
| Session lifecycle | Client → Session → Requests → Settle | Budget tracked, rate limited |
| Dispute lifecycle | Client → Dispute → Agent Response → Admin Resolution | Funds split correctly |
| Multi-sig approval | Signers → Escrow → Threshold Release | M-of-3 enforced |
| Partial refund | Client Propose → Agent Accept/Reject | Split amounts correct |

### 10.1.4 End-to-End Tests

| Flow | Steps | Validation |
|------|-------|------------|
| Full purchase flow | Search → Pay → Receive → Rate | All steps complete |
| Escrow refund | Create → Timeout → Refund | Funds returned |
| Reputation building | Multiple jobs → Tier upgrade | Tier changes correctly |
| Session micropayments | Create → 100 requests → Settle → Close | Budget tracked, refund correct |
| Dispute resolution | Open → Respond → Resolve → Settlement | Split amounts match |
| Decayed proof | Wait N blocks → Prove rating with decay | Effective points reduced |

## 10.2 Test Scenarios

### 10.2.1 Happy Path Tests

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| HP-01 | Agent registers with bond stake | AgentReputation + AgentBond created |
| HP-02 | Client purchases service | Service delivered, payment settled |
| HP-03 | Client submits rating | Reputation updated, nullifier consumed |
| HP-04 | Agent generates tier proof | Valid proof returned |
| HP-05 | Agent claims escrow with secret | Funds released |
| HP-06 | Client creates spending session | Session active, budget set |
| HP-07 | Agent makes session requests | Receipts generated, spent tracked |
| HP-08 | Agent settles session | Payment claimed |
| HP-09 | Client proposes partial refund | Proposal created, agent can accept |
| HP-10 | Client opens dispute | DisputeRecord created, admin notified |
| HP-11 | Multi-sig escrow approved by M signers | Funds released to agent |
| HP-12 | Agent proves reputation with decay | Decayed proof validates |
| HP-13 | Client creates spending policy | Policy stored, reusable |
| HP-14 | Session created from policy | Policy constraints enforced |

### 10.2.2 Edge Case Tests

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| EC-01 | Double registration attempt | Transaction rejected (E005) |
| EC-02 | Double rating attempt | Transaction rejected (E004) |
| EC-03 | Claim with wrong secret | Transaction rejected (E007) |
| EC-04 | Refund before deadline | Transaction rejected |
| EC-05 | Rating below minimum | Transaction rejected (E001) |
| EC-06 | Session request exceeds per-request max | Rejected (E014) |
| EC-07 | Session request exceeds total budget | Rejected (E013) |
| EC-08 | Session request on paused session | Rejected (E016) |
| EC-09 | Session request on expired session | Rejected (E012) |
| EC-10 | Same signer approves multi-sig twice | Rejected (E022) |
| EC-11 | Duplicate dispute for same job | Rejected (E020) |
| EC-12 | Block height outside tolerance | Rejected (E018) |
| EC-13 | Policy bounds violated on session creation | Rejected (E017) |
| EC-14 | Agent amount ≥ total in partial refund | Rejected (E023) |

### 10.2.3 Security Tests

| ID | Scenario | Expected Result |
|----|----------|-----------------|
| SEC-01 | Sybil attack (multiple wallets) | Economically infeasible (110+ credits) |
| SEC-02 | Front-running attempt | No information leaked (private records) |
| SEC-03 | Replay attack | Nullifier prevents |
| SEC-04 | Invalid proof verification | Proof rejected |
| SEC-05 | Escrow manipulation | State machine enforced |
| SEC-06 | Session drain attack | Per-request + rate limit caps |
| SEC-07 | Forged block height in decay proof | BLOCK_TOLERANCE rejects |
| SEC-08 | Unauthorized dispute resolution | Only admin can call resolve_dispute |
| SEC-09 | Unauthorized session operations | Owner-only for pause/close |
| SEC-10 | Circuit breaker under RPC failure | Graceful degradation, no cascade |

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
| Decay | Time-based reduction of reputation weight (95% per 7-day period) |
| Dispute | Formal disagreement over service delivery, resolved by admin |
| Escrow | Locked payment pending service delivery |
| Facilitator | Off-chain service bridging HTTP and Aleo |
| HTLC | Hash Time-Locked Contract |
| Multi-Sig | Escrow requiring M-of-3 signer approvals |
| Nullifier | Unique identifier preventing double-actions |
| Partial Refund | Cooperative split of escrowed funds between client and agent |
| PaymentSession | Pre-authorized spending envelope (sign once, spend many) |
| Rolling Reputation | Cumulative stats updated per job in O(1) |
| SpendingPolicy | Reusable template constraining session parameters |
| Tier | Reputation level (New/Bronze/Silver/Gold/Diamond) |
| x402 | HTTP payment protocol using 402 status code |
| Bond Staking | 10-credit economic barrier per agent registration |
| ZK Proof | Zero-knowledge cryptographic proof |
| Circuit Breaker | Resilience pattern protecting facilitator from Aleo RPC failures |
| TTL Store | In-memory cache with time-based expiry for facilitator state |

---

# Appendix B: Error Codes

### On-Chain Errors (Leo assert failures)

| Code | Description | Resolution |
|------|-------------|------------|
| E001 | Invalid rating range | Use values 1-50 |
| E002 | Payment below minimum | Increase payment ≥ 100,000 microcents |
| E003 | Burn amount insufficient | Use ≥ 500,000 microcredits |
| E004 | Nullifier already used | Cannot double-rate same job |
| E005 | Address already registered | One agent per address (unregister first) |
| E006 | Escrow deadline passed | Cannot claim, only refund |
| E007 | Invalid secret | Secret doesn't match hash |
| E008 | Unauthorized caller | Wrong address for operation |
| E009 | Tier threshold not met | Reputation insufficient |
| E010 | Escrow already settled | Cannot modify settled escrow |
| E011 | Bond below minimum | Stake ≥ 10,000,000 microcredits (10 credits) |
| E012 | Session expired | Create a new session |
| E013 | Session budget exceeded | (spent + amount) > max_total |
| E014 | Per-request limit exceeded | amount > max_per_request |
| E015 | Rate limit exceeded | Too many requests in current window |
| E016 | Session not active | Session is paused or closed |
| E017 | Policy bounds violated | Session params exceed policy limits |
| E018 | Block height mismatch | Claimed block outside BLOCK_TOLERANCE (±10) |
| E019 | Duplicate session ID | Session already exists in active_sessions |
| E020 | Duplicate dispute | Dispute already open for this job_hash |
| E021 | Required signatures invalid | Must be 1-3 |
| E022 | Duplicate signer approval | Signer already approved this escrow |
| E023 | Agent amount exceeds total | agent_amount must be < total_amount for refund |

### Facilitator HTTP Errors

| Status | Description | Common Cause |
|--------|-------------|--------------|
| 400 | Bad Request | Missing required fields, invalid parameters |
| 403 | Forbidden | Caller not authorized for operation |
| 404 | Not Found | Resource doesn't exist |
| 409 | Conflict | Duplicate creation attempt |
| 429 | Too Many Requests | Rate limit exceeded |
| 500 | Internal Server Error | Aleo RPC failure, unexpected error |
| 503 | Service Unavailable | Circuit breaker open, Aleo RPC unreachable |

---

# Appendix C: Version History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | — | Basic reputation system |
| 2.0 | — | Rolling reputation, Sybil resistance, escrow, bond staking |
| 2.1 | — | Partial refunds, dispute resolution, reputation decay, multi-sig escrow (shadow_agent_ext.aleo) |
| 2.2 | — | Session-based payments, spending policies, autonomous agent support (shadow_agent_session.aleo) |
| 2.3 | Current | Job marketplace, facilitator indexer, circuit breaker, frontend dashboard, faucet widget |

---

# Appendix D: Constants Reference

### Reputation System

| Constant | Value | Unit | Program |
|----------|-------|------|---------|
| RATING_BURN_COST | 500,000 | microcredits | shadow_agent.aleo |
| MIN_PAYMENT_FOR_RATING | 100,000 | microcents | shadow_agent.aleo |
| REGISTRATION_BOND | 10,000,000 | microcredits | shadow_agent.aleo |
| BLOCK_TOLERANCE | 10 | blocks | shadow_agent_ext.aleo, shadow_agent_session.aleo |

### Tier Thresholds

| Tier | Name | Min Jobs | Min Revenue (microcents) | Min Revenue ($) |
|------|------|----------|--------------------------|-----------------|
| 0 | New | 0 | 0 | $0 |
| 1 | Bronze | 10 | 10,000,000 | $100 |
| 2 | Silver | 50 | 100,000,000 | $1,000 |
| 3 | Gold | 200 | 1,000,000,000 | $10,000 |
| 4 | Diamond | 1,000 | 10,000,000,000 | $100,000 |

### Decay Parameters

| Constant | Value | Description |
|----------|-------|-------------|
| DECAY_PERIOD_BLOCKS | 100,800 | ~7 days per period |
| DECAY_FACTOR | 95/100 | 5% decay per period |
| MAX_DECAY_STEPS | 10 | ~70 days max decay |
| Remaining after 10 periods | 59.87% | Minimum retention |

### Session Parameters

| Constant | Value | Description |
|----------|-------|-------------|
| RATE_WINDOW_BLOCKS | 100 | ~10 minute rate-limit window |
| SESSION_STATUS_ACTIVE | 0 | Session accepting requests |
| SESSION_STATUS_PAUSED | 1 | Session temporarily suspended |
| SESSION_STATUS_CLOSED | 2 | Session terminated |

---

*End of Technical Documentation*