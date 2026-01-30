# ShadowAgent - Comprehensive Technical Flow Diagrams

## Executive Summary

This document provides detailed technical flow diagrams for each component of the ShadowAgent privacy-preserving AI marketplace built on Aleo. The system comprises 6 main documentation areas with interconnected flows.

---

## Table of Contents

1. [Smart Contract Flows](#1-smart-contract-flows)
2. [Facilitator Service Flows](#2-facilitator-service-flows)
3. [SDK Flows](#3-sdk-flows)
4. [Frontend Flows](#4-frontend-flows)
5. [Testing Flows](#5-testing-flows)
6. [Future Roadmap Flows](#6-future-roadmap-flows)
7. [Cross-Component Data Flow](#7-cross-component-data-flow)
8. [Session-Based Payment Flow](#8-session-based-payment-flow)

---

## 1. SMART CONTRACT FLOWS

### 1.1 Agent Registration Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         AGENT REGISTRATION FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌──────────┐                          ┌─────────────┐     ┌───────────────┐  │
│   │  Agent   │                          │  Contract   │     │  Aleo Network │  │
│   │  (User)  │                          │             │     │               │  │
│   └────┬─────┘                          └──────┬──────┘     └───────┬───────┘  │
│        │                                       │                     │          │
│        │ 1. Prepare registration bond (10+ credits)                 │          │
│        │      (stake for Sybil resistance)    │                     │          │
│        │                                       │                     │          │
│        │ 2. Call register_agent(              │                     │          │
│        │      service_type: u8,               │                     │          │
│        │      endpoint_hash: field,           │                     │          │
│        │      bond_amount: u64)               │                     │          │
│        │─────────────────────────────────────>│                     │          │
│        │                  │                    │                     │          │
│        │                  │      TRANSITION    │                     │          │
│        │                  │ ┌────────────────┐ │                     │          │
│        │                  │ │ • Hash caller  │ │                     │          │
│        │                  │ │   → agent_id   │ │                     │          │
│        │                  │ │ • Create       │ │                     │          │
│        │                  │ │   AgentRep     │ │                     │          │
│        │                  │ │   record       │ │                     │          │
│        │                  │ │ • Create       │ │                     │          │
│        │                  │ │   PublicListing│ │                     │          │
│        │                  │ └────────────────┘ │                     │          │
│        │                  │                    │                     │          │
│        │                                       │ 3. then finalize()  │          │
│        │                                       │────────────────────>│          │
│        │                                       │                     │          │
│        │                                       │      FINALIZE       │          │
│        │                                       │ ┌──────────────────┐│          │
│        │                                       │ │ • Check address  ││          │
│        │                                       │ │   not registered ││          │
│        │                                       │ │ • Mark address   ││          │
│        │                                       │ │   in registered_ ││          │
│        │                                       │ │   agents mapping ││          │
│        │                                       │ │ • Store listing  ││          │
│        │                                       │ │   in mapping     ││          │
│        │                                       │ └──────────────────┘│          │
│        │                                       │                     │          │
│        │ 4. AgentReputation + AgentBond Records (private)           │          │
│        │<─────────────────────────────────────│                     │          │
│        │                  │                    │                     │          │
│                                                                                   │
│   OUTPUT: AgentReputation {                                                      │
│     owner: caller_address,                                                       │
│     agent_id: BHP256::hash(caller),                                              │
│     total_jobs: 0, total_rating_points: 0, total_revenue: 0,                    │
│     tier: 0 (New), created_at: block.height, last_updated: block.height         │
│   }                                                                              │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.2 Rating Submission Flow (Burn-to-Rate)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         RATING SUBMISSION FLOW                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌──────────┐                    ┌─────────────┐     ┌───────────────────────┐ │
│   │  Client  │                    │  Contract   │     │  Aleo Network         │ │
│   └────┬─────┘                    └──────┬──────┘     └───────────┬───────────┘ │
│        │                                 │                        │             │
│        │ 1. submit_rating(               │                        │             │
│        │      agent_address,             │                        │             │
│        │      job_hash,                  │                        │             │
│        │      rating: 1-50,              │                        │             │
│        │      payment_amount,            │                        │             │
│        │      burn_amount ≥ 500000)      │                        │             │
│        │────────────────────────────────>│                        │             │
│        │                                 │                        │             │
│        │                    VALIDATION   │                        │             │
│        │              ┌────────────────┐ │                        │             │
│        │              │ assert(rating  │ │                        │             │
│        │              │   >= 1 && <=50)│ │                        │             │
│        │              │ assert(payment │ │                        │             │
│        │              │   >= 100000)   │ │                        │             │
│        │              │ assert(burn    │ │                        │             │
│        │              │   >= 500000)   │ │                        │             │
│        │              └────────────────┘ │                        │             │
│        │                                 │                        │             │
│        │              NULLIFIER GEN      │                        │             │
│        │              ┌────────────────┐ │                        │             │
│        │              │ nullifier =    │ │                        │             │
│        │              │  hash(caller)  │ │                        │             │
│        │              │  + hash(job)   │ │                        │             │
│        │              └────────────────┘ │                        │             │
│        │                                 │                        │             │
│        │                                 │ 2. finalize(           │             │
│        │                                 │      nullifier,        │             │
│        │                                 │      burn_amount)      │             │
│        │                                 │───────────────────────>│             │
│        │                                 │                        │             │
│        │                                 │   SYBIL RESISTANCE     │             │
│        │                                 │ ┌────────────────────┐ │             │
│        │                                 │ │ • Check nullifier  │ │             │
│        │                                 │ │   not in mapping   │ │             │
│        │                                 │ │ • Mark used        │ │             │
│        │                                 │ │ • BURN credits     │ │             │
│        │                                 │ │   (economic cost)  │ │             │
│        │                                 │ └────────────────────┘ │             │
│        │                                 │                        │             │
│        │ 3. RatingRecord (owned by AGENT)│                        │             │
│        │<────────────────────────────────│                        │             │
│        │                                 │                        │             │
│                                                                                   │
│   SYBIL ATTACK COST ANALYSIS:                                                    │
│   ┌───────────────────────────────────────────────────────────────────────────┐ │
│   │ To fake Gold Tier (200 jobs):                                              │ │
│   │   • 200 ratings × 0.5 credits burn = 100 credits BURNED                   │ │
│   │   • 200 min payments × $0.10 = $20 self-paid                              │ │
│   │   • Plus: 10+ credit registration bond per agent                           │ │
│   │   → Attack is economically irrational                                      │ │
│   └───────────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.3 Reputation Update Flow (O(1) Rolling Aggregation)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    REPUTATION UPDATE FLOW (O(1) Complexity)                       │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌──────────┐                                    ┌─────────────┐               │
│   │  Agent   │                                    │  Contract   │               │
│   └────┬─────┘                                    └──────┬──────┘               │
│        │                                                 │                       │
│        │ 1. update_reputation(                           │                       │
│        │      current_rep: AgentReputation,              │                       │
│        │      new_rating: RatingRecord)                  │                       │
│        │────────────────────────────────────────────────>│                       │
│        │                                                 │                       │
│        │                              VALIDATION         │                       │
│        │                        ┌───────────────────┐    │                       │
│        │                        │ assert_eq(        │    │                       │
│        │                        │   rating.owner,   │    │                       │
│        │                        │   rep.owner)      │    │                       │
│        │                        └───────────────────┘    │                       │
│        │                                                 │                       │
│        │                           O(1) UPDATE           │                       │
│        │              ┌──────────────────────────────┐   │                       │
│        │              │                              │   │                       │
│        │              │  new_jobs = total_jobs + 1   │   │                       │
│        │              │                              │   │                       │
│        │              │  new_points = total_points   │   │                       │
│        │              │              + rating        │   │                       │
│        │              │                              │   │                       │
│        │              │  new_revenue = total_revenue │   │                       │
│        │              │               + payment      │   │                       │
│        │              │                              │   │                       │
│        │              │  new_tier = calculate_tier(  │   │                       │
│        │              │    new_jobs, new_revenue)    │   │                       │
│        │              │                              │   │                       │
│        │              └──────────────────────────────┘   │                       │
│        │                                                 │                       │
│        │ 2. Updated AgentReputation (old consumed)       │                       │
│        │<────────────────────────────────────────────────│                       │
│        │                                                 │                       │
│                                                                                   │
│   TIER CALCULATION:                                                              │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Tier      │  Name     │  Jobs Required  │  Revenue Required            │   │
│   │────────────│───────────│─────────────────│──────────────────────────────│   │
│   │  4         │  Diamond  │  1000+          │  $100,000+                   │   │
│   │  3         │  Gold     │  200+           │  $10,000+                    │   │
│   │  2         │  Silver   │  50+            │  $1,000+                     │   │
│   │  1         │  Bronze   │  10+            │  $100+                       │   │
│   │  0         │  New      │  0              │  $0                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   KEY INSIGHT: Rolling aggregation means O(1) proof generation                   │
│   • No loops over historical data                                                │
│   • Average = total_points / total_jobs                                          │
│   • Tier checked against cumulative thresholds                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.4 ZK Proof Generation Flows

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         ZK PROOF GENERATION FLOWS                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   PROOF TYPE 1: RATING PROOF                                                     │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │   Private Input          Public Input          Output                   │   │
│   │   ┌────────────────┐     ┌─────────────┐      ┌──────────────────┐     │   │
│   │   │ AgentReputation│     │ min_rating  │      │ ReputationProof  │     │   │
│   │   │ (full data)    │────>│ (threshold) │─────>│ proof_type: 1    │     │   │
│   │   │                │     │             │      │ threshold_met:   │     │   │
│   │   │ jobs: 100      │     │ 40 (4.0★)  │      │   true           │     │   │
│   │   │ points: 470    │     │             │      │ tier_proven: 2   │     │   │
│   │   └────────────────┘     └─────────────┘      └──────────────────┘     │   │
│   │                                                                         │   │
│   │   Circuit Logic:                                                        │   │
│   │   avg = (total_points × 10) / total_jobs                               │   │
│   │   assert(avg >= min_rating)  // Fails if not met                       │   │
│   │                                                                         │   │
│   │   WHAT'S PROVEN: "My average rating is ≥ X stars"                      │   │
│   │   WHAT'S HIDDEN: Exact rating, job count, revenue, all details         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   PROOF TYPE 2: JOBS PROOF                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │   Private: AgentReputation    Public: min_jobs                          │   │
│   │   assert(reputation.total_jobs >= min_jobs)                             │   │
│   │   WHAT'S PROVEN: "I completed ≥ N jobs"                                 │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   PROOF TYPE 3: REVENUE RANGE PROOF                                              │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │   Private: AgentReputation    Public: min_revenue, max_revenue          │   │
│   │   assert(revenue >= min_revenue && revenue <= max_revenue)              │   │
│   │   WHAT'S PROVEN: "My revenue is between $X and $Y"                      │   │
│   │   EXTRA PRIVACY: Range proof hides exact amount                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   PROOF TYPE 4: TIER PROOF                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │   Private: AgentReputation    Public: required_tier                     │   │
│   │   assert(reputation.tier >= required_tier)                              │   │
│   │   WHAT'S PROVEN: "My tier is ≥ Silver/Gold/Diamond"                    │   │
│   │   WHAT'S HIDDEN: Exact tier, all underlying metrics                     │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   PROOF VERIFICATION (O(1) constant time):                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │   Verifier receives: proof, public_inputs                               │   │
│   │   Verifier checks: ZK circuit satisfiability                            │   │
│   │   Result: Boolean (threshold met / not met)                             │   │
│   │   Time: ~1 second regardless of agent's history size                    │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.5 HTLC Escrow State Machine

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      HTLC ESCROW STATE MACHINE                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│                                 ┌────────────────┐                               │
│                                 │    CLIENT      │                               │
│                                 │  create_escrow │                               │
│                                 └───────┬────────┘                               │
│                                         │                                        │
│                                         │ EscrowRecord created                   │
│                                         │ status = 0 (LOCKED)                    │
│                                         │ owner = client                         │
│                                         ▼                                        │
│                           ┌─────────────────────────────┐                        │
│                           │                             │                        │
│                           │          LOCKED             │                        │
│                           │        (status=0)           │                        │
│                           │                             │                        │
│                           │  • Amount held              │                        │
│                           │  • Deadline set             │                        │
│                           │  • Secret hash stored       │                        │
│                           │                             │                        │
│                           └─────────────┬───────────────┘                        │
│                                         │                                        │
│                    ┌────────────────────┼────────────────────┐                   │
│                    │                    │                    │                   │
│                    │  block < deadline  │  block > deadline  │                   │
│                    │  + correct secret  │                    │                   │
│                    │                    │                    │                   │
│                    ▼                    │                    ▼                   │
│      ┌─────────────────────────┐       │       ┌─────────────────────────┐      │
│      │                         │       │       │                         │      │
│      │       RELEASED          │       │       │       REFUNDED          │      │
│      │      (status=1)         │       │       ���      (status=2)         │      │
│      │                         │       │       │                         │      │
│      │  • Agent claims         │       │       │  • Client reclaims      │      │
│      │  • owner = agent        │       │       │  • owner = client       │      │
│      │  • Agent reveals secret │       │       │  • Timeout protection   │      │
│      │                         │       │       │                         │      │
│      └─────────────────────────┘       │       └─────────────────────────┘      │
│               TERMINAL                 │                TERMINAL                 │
│                                        │                                         │
│                                                                                   │
│   TRANSITION: claim_escrow                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  assert(hash(secret) == escrow.secret_hash)  // Correct preimage       │   │
│   │  assert(caller == escrow.agent)              // Only agent can claim   │   │
│   │  assert(block.height <= escrow.deadline)     // Before timeout         │   │
│   │  assert(escrow.status == 0)                  // Still locked           │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   TRANSITION: refund_escrow                                                      │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  assert(caller == escrow.owner)              // Only client            │   │
│   │  assert(block.height > escrow.deadline)      // After timeout          │   │
│   │  assert(escrow.status == 0)                  // Still locked           │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   SECURITY PROPERTIES:                                                           │
│   • Atomicity: Payment and delivery are cryptographically linked                │
│   • Timeout: Funds never locked forever                                          │
│   • Non-custodial: No third party holds funds                                   │
│   • Privacy: Amount hidden in private record                                     │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 1.6 Session-Based Payment Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    SESSION-BASED PAYMENT FLOW                                     │
│              "Sign Once, Spend Within Bounds" Model                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   PROBLEM: 1000 API calls = 1000 wallet signatures (unusable UX)                │
│   SOLUTION: 1 signature → unlimited requests within bounds                       │
│                                                                                   │
│   ┌──────────┐                ┌─────────────┐                ┌─────────────┐    │
│   │  Client  │                │   Agent     │                │  Contract   │    │
│   └────┬─────┘                └──────┬──────┘                └──────┬──────┘    │
│        │                             │                              │           │
│        │ 1. create_session(          │                              │           │
│        │      agent,                 │                              │           │
│        │      max_total: $100,       │                              │           │
│        │      max_per_req: $1,       │                              │           │
│        │      rate_limit: 100/h,     │                              │           │
│        │      duration: 24h)         │                              │           │
│        │ [WALLET SIGNATURE]          │                              │           │
│        │─────────────────────────────────────────────────────────────>          │
│        │                             │                              │           │
│        │ 2. PaymentSession record    │                              │           │
│        │<─────────────────────────────────────────────────────────────          │
│        │                             │                              │           │
│        │                             │                              │           │
│        │ 3. API Request #1           │                              │           │
│        │    + session proof          │                              │           │
│        │    [NO SIGNATURE]           │                              │           │
│        │────────────────────────────>│                              │           │
│        │                             │                              │           │
│        │                   ┌─────────────────────┐                  │           │
│        │                   │ OFF-CHAIN VALIDATE  │                  │           │
│        │                   │ • status == Active  │                  │           │
│        │                   │ • amount ≤ max_per  │                  │           │
│        │                   │ • spent+amt ≤ total │                  │           │
│        │                   │ • not expired       │                  │           │
│        │                   │ • within rate limit │                  │           │
│        │                   └─────────────────────┘                  │           │
│        │                             │                              │           │
│        │ 4. Response + receipt       │                              │           │
│        │<────────────────────────────│                              │           │
│        │                             │                              │           │
│        │ 5. Requests #2, #3, ..., #N │                              │           │
│        │    [NO SIGNATURES]          │                              │           │
│        │────────────────────────────>│                              │           │
│        │<────────────────────────────│                              │           │
│        │         ...                 │                              │           │
│        │                             │                              │           │
│        │                             │ 6. settle_session(           │           │
│        │                             │      batch of receipts)      │           │
│        │                             │ [PERIODIC BATCH]             │           │
│        │                             │─────────────────────────────>│           │
│        │                             │                              │           │
│        │                             │                ONE ON-CHAIN  │           │
│        │                             │                TX PER BATCH  │           │
│        │                             │                              │           │
│        │ 7. close_session()          │                              │           │
│        │    [OPTIONAL SIGNATURE]     │                              │           │
│        │─────────────────────────────────────────────────────────────>          │
│        │                             │                              │           │
│        │ 8. Refund unused: $100 - spent                             │           │
│        │<─────────────────────────────────────────────────────────────          │
│        │                             │                              │           │
│                                                                                   │
│   RESULT:                                                                        │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  Before Sessions    │  After Sessions                                   │   │
│   │─────────────────────│───────────────────────────────────────────────────│   │
│   │  1000 signatures    │  1-2 signatures                                   │   │
│   │  1000 on-chain txs  │  1 settlement tx                                  │   │
│   │  Unusable UX        │  Seamless, like credit card                       │   │
│   │  No autonomous AI   │  AI agents operate within human-set bounds        │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 2. FACILITATOR SERVICE FLOWS

### 2.1 Service Architecture

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      FACILITATOR SERVICE ARCHITECTURE                             │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│                              ┌──────────────────────────────────────────┐        │
│                              │           FACILITATOR SERVICE            │        │
│                              │                                          │        │
│   ┌─────────────┐            │  ┌─────────────────────────────────────┐│        │
│   │   Clients   │───────────>│  │           ROUTES                    ││        │
│   │   & Agents  │            │  │  • GET /agents (discovery)          ││        │
│   └─────────────┘            │  │  • GET /agents/:id                  ││        │
│                              │  │  • POST /verify/escrow              ││        │
│                              │  │  • POST /verify/reputation          ││        │
│                              │  │  • GET /health, /health/ready       ││        │
│                              │  └─────────────────────────────────────┘│        │
│                              │                   │                     │        │
│                              │                   ▼                     │        │
│                              │  ┌─────────────────────────────────────┐│        │
│                              │  │          MIDDLEWARE                 ││        │
│                              │  │  • x402 Payment Handler             ││        │
│                              │  │  • Rate Limiting                    ││        │
│                              │  │  • Authentication                   ││        │
│                              │  │  • CORS, Helmet security            ││        │
│                              │  └─────────────────────────────────────┘│        │
│                              │                   │                     │        │
│                              │                   ▼                     │        │
│                              │  ┌─────────────────────────────────────┐│        │
│                              │  │           SERVICES                  ││        │
│                              │  │  ┌───────────┐  ┌───────────────┐  ││        │
│                              │  │  │ Aleo      │  │   Indexer     │  ││        │
│                              │  │  │ Service   │  │   Service     │  ││        │
│                              │  │  │           │  │               │  ││        │
│                              │  │  │ • SDK wrap│  │ • Cache agents│  ││        │
│                              │  │  │ • Verify  │  │ • Background  │  ││        │
│                              │  │  │   proofs  │  │   indexing    │  ││        │
│                              │  │  │ • Get maps│  │ • Filter/sort │  ││        │
│                              │  │  └─────┬─────┘  └───────┬───────┘  ││        │
│                              │  └────────┼────────────────┼──────────┘│        │
│                              └───────────┼────────────────┼───────────┘        │
│                                          │                │                     │
│                                          ▼                ▼                     │
│                              ┌───────────────────┐  ┌──────────────────┐        │
│                              │   ALEO NETWORK    │  │  CACHE (Redis/   │        │
│                              │                   │  │   In-Memory)     │        │
│                              │  • RPC calls      │  │                  │        │
│                              │  • Proof verify   │  │  • Agent listings│        │
│                              │  • Mapping reads  │  │  • Block height  │        │
│                              └───────────────────┘  └──────────────────┘        │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 2.2 x402 Payment Protocol Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         x402 PAYMENT PROTOCOL FLOW                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌──────────┐          ┌─────────────────┐          ┌─────────────┐            │
│   │  Client  │          │  Agent Service  │          │  Aleo       │            │
│   │          │          │  (with x402     │          │  Network    │            │
│   │          │          │   middleware)   │          │             │            │
│   └────┬─────┘          └───────┬─────────┘          └──────┬──────┘            │
│        │                        │                           │                    │
│        │ 1. GET /api/service    │                           │                    │
│        │    (no payment proof)  │                           │                    │
│        │───────────────────────>│                           │                    │
│        │                        │                           │                    │
│        │ 2. HTTP 402 Payment Required                       │                    │
│        │    Headers:                                        │                    │
│        │    PAYMENT-REQUIRED: base64({                      │                    │
│        │      price: 100000,                                │                    │
│        │      network: "aleo:testnet",                      │                    │
│        │      address: "aleo1agent...",                     │                    │
│        │      escrow_required: true,                        │                    │
│        │      secret_hash: "abc123...",                     │                    │
│        │      deadline_blocks: 100                          │                    │
│        │    })                                              │                    │
│        │<───────────────────────│                           │                    │
│        │                        │                           │                    │
│        │                        │                           │                    │
│        │ 3. create_escrow(                                  │                    │
│        │      agent, amount,                                │                    │
│        │      job_hash, secret_hash,                        │                    │
│        │      deadline)                                     │                    │
│        │────────────────────────────────────────────────────>                    │
│        │                        │                           │                    │
│        │ 4. EscrowRecord (private)                          │                    │
│        │<────────────────────────────────────────────────────                    │
│        │                        │                           │                    │
│        │                        │                           │                    │
│        │ 5. GET /api/service    │                           │                    │
│        │    Headers:            │                           │                    │
│        │    X-ESCROW-PROOF: base64(proof)                   │                    │
│        │    X-JOB-HASH: "hash..."                           │                    │
│        │───────────────────────>│                           │                    │
│        │                        │                           │                    │
│        │              ┌─────────────────────┐               │                    │
│        │              │ MIDDLEWARE VERIFY   │               │                    │
│        │              │ • Parse proof       │               │                    │
│        │              │ • Verify on-chain   │               │                    │
│        │              │   or locally        │               │                    │
│        │              │ • Check amount ≥    │               │                    │
│        │              │   required price    │               │                    │
│        │              └─────────────────────┘               │                    │
│        │                        │                           │                    │
│        │ 6. HTTP 200 OK         │                           │                    │
│        │    Body: {result}      │                           │                    │
│        │    Headers:            │                           │                    │
│        │    X-DELIVERY-SECRET: "secret"                     │                    │
│        │    X-JOB-ID: "job123"  │                           │                    │
│        │<───────────────────────│                           │                    │
│        │                        │                           │                    │
│        │                        │ 7. claim_escrow(secret)   │                    │
│        │                        │───────────────────────────>                    │
│        │                        │                           │                    │
│        │                        │ 8. Funds released         │                    │
│        │                        │<───────────────────────────                    │
│        │                        │                           │                    │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 3. SDK FLOWS

### 3.1 Client SDK Request Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         CLIENT SDK REQUEST FLOW                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   const client = new ShadowAgentClient({ privateKey, network: 'testnet' });     │
│                                                                                   │
│   ┌──────────────────────────────────────────────────────────────────────────┐  │
│   │                                                                          │  │
│   │   // One method call handles entire x402 flow                           │  │
│   │   const response = await client.request(agentUrl, { method: 'POST' });  │  │
│   │                                                                          │  │
│   └──────────────────────────────────────────────────────────────────────────┘  │
│                                         │                                        │
│                                         ▼                                        │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                     INTERNAL SDK FLOW                                    │   │
│   ├─────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                         │   │
│   │   1. Initial Request ──────────────────────────────────────────────────>│   │
│   │                                                                         │   │
│   │   2. Check Response Status                                              │   │
│   │      ├── 200 OK → Return response                                       │   │
│   │      └── 402 → Continue to payment flow                                 │   │
│   │                                                                         │   │
│   │   3. Parse Payment Terms from PAYMENT-REQUIRED header                   │   │
│   │      {                                                                  │   │
│   │        price: 100000,                                                   │   │
│   │        address: "aleo1agent...",                                        │   │
│   │        secret_hash: "...",                                              │   │
│   │        deadline_blocks: 100                                             │   │
│   │      }                                                                  │   │
│   │                                                                         │   │
│   │   4. Generate Job Hash                                                  │   │
│   │      job_hash = SHA256(url + method + timestamp)                        │   │
│   │                                                                         │   │
│   │   5. Create Escrow (on-chain transaction)                               │   │
│   │      ┌──────────────────────────────────────────────────────┐          │   │
│   │      │ await aleo.execute('create_escrow', [                │          │   │
│   │      │   agent, amount, job_hash, secret_hash, deadline     │          │   │
│   │      │ ])                                                    │          │   │
│   │      └──────────────────────────────────────────────────────┘          │   │
│   │                                                                         │   │
│   │   6. Generate Escrow Proof                                              │   │
│   │      proof = generateZKProof(escrowRecord)                             │   │
│   │                                                                         │   │
│   │   7. Retry Request with Proof                                           │   │
│   │      ┌──────────────────────────────────────────────────────┐          │   │
│   │      │ fetch(url, {                                         │          │   │
│   │      │   headers: {                                         │          │   │
│   │      │     'X-ESCROW-PROOF': base64(proof),                │          │   │
│   │      │     'X-JOB-HASH': job_hash                          │          │   │
│   │      │   }                                                  │          │   │
│   │      │ })                                                   │          │   │
│   │      └──────────────────────────────────────────────────────┘          │   │
│   │                                                                         │   │
│   │   8. Return Response to Caller                                          │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 3.2 Agent SDK Middleware Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         AGENT SDK MIDDLEWARE FLOW                                 │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   // Agent setup                                                                 │
│   const agent = new ShadowAgentServer({                                          │
│     privateKey: '...',                                                           │
│     serviceType: ServiceType.NLP,                                                │
│     pricePerRequest: 100000                                                      │
│   });                                                                            │
│   app.use('/api', agent.middleware({ pricePerRequest: 100000 }));               │
│                                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                    MIDDLEWARE PROCESSING FLOW                            │   │
│   ├─────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                         │   │
│   │   Incoming Request                                                      │   │
│   │         │                                                               │   │
│   │         ▼                                                               │   │
│   │   ┌───────────────────────────────────────────┐                        │   │
│   │   │ Check for X-ESCROW-PROOF header           │                        │   │
│   │   └─────────────────┬─────────────────────────┘                        │   │
│   │                     │                                                   │   │
│   │         ┌───────────┴───────────┐                                      │   │
│   │         │                       │                                      │   │
│   │    NO PROOF                HAS PROOF                                   │   │
│   │         │                       │                                      │   │
│   │         ▼                       ▼                                      │   │
│   │   ┌─────────────┐        ┌─────────────────────────────┐              │   │
│   │   │ Generate    │        │ Verify Proof                │              │   │
│   │   │ job_hash +  │        │ • Parse base64             │              │   │
│   │   │ secret      │        │ • Check amount ≥ price     │              │   │
│   │   │             │        │ • Validate signature       │              │   │
│   │   │ Store secret│        │                             │              │   │
│   │   │ for later   │        └─────────────┬───────────────┘              │   │
│   │   │ claim       │                      │                              │   │
│   │   └──────┬──────┘              ┌───────┴───────┐                      │   │
│   │          │                     │               │                      │   │
│   │          ▼                  VALID          INVALID                    │   │
│   │   ┌─────────────┐              │               │                      │   │
│   │   │ Return 402  │              ▼               ▼                      │   │
│   │   │ + Payment   │        ┌─────────────┐  ┌─────────────┐            │   │
│   │   │   Terms     │        │ next()      │  │ Return 402  │            │   │
│   │   │             │        │ (continue   │  │ Invalid     │            │   │
│   │   │ { price,    │        │  to route)  │  │ proof       │            │   │
│   │   │   secret_   │        └──────┬──────┘  └─────────────┘            │   │
│   │   │   hash,     │               │                                     │   │
│   │   │   deadline }│               ▼                                     │   │
│   │   └─────────────┘        Route Handler                                │   │
│   │                                │                                      │   │
│   │                                ▼                                      │   │
│   │                         Response Sent                                 │   │
│   │                                │                                      │   │
│   │                                ▼                                      │   │
│   │                   ┌────────────────────────────┐                      │   │
│   │                   │ res.on('finish', () => {   │                      │   │
│   │                   │   if (success) {           │                      │   │
│   │                   │     setHeader(             │                      │   │
│   │                   │       'X-DELIVERY-SECRET', │                      │   │
│   │                   │       storedSecret         │                      │   │
│   │                   │     );                     │                      │   │
│   │                   │     // Claim escrow async  │                      │   │
│   │                   │   }                        │                      │   │
│   │                   │ })                         │                      │   │
│   │                   └────────────────────────────┘                      │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 4. FRONTEND FLOWS

### 4.1 Application State Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      FRONTEND STATE MANAGEMENT (Zustand)                          │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                          GLOBAL STORES                                   │   │
│   ├─────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                         │   │
│   │   ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐        │   │
│   │   │   walletStore   │  │   agentStore    │  │   clientStore   │        │   │
│   │   ├─────────────────┤  ├─────────────────┤  ├─────────────────┤        │   │
│   │   │ • connected     │  │ • reputation    │  │ • searchResults │        │   │
│   │   │ • address       │  │ • transactions  │  │ • selectedAgent │        │   │
│   │   │ • balance       │  │ • isRegistered  │  │ • transactions  │        │   │
│   │   ├─────────────────┤  ├─────────────────┤  │ • filters       │        │   │
│   │   │ connect()       │  │ setReputation() │  ├─────────────────┤        │   │
│   │   │ disconnect()    │  │ addTransaction()│  │ setSearchResults│        │   │
│   │   │ setBalance()    │  │ updateRep()     │  │ selectAgent()   │        │   │
│   │   └────────┬────────┘  └────────┬────────┘  │ setFilters()    │        │   │
│   │            │                    │           └────────┬────────┘        │   │
│   │            │                    │                    │                 │   │
│   │            └────────────────────┼────────────────────┘                 │   │
│   │                                 │                                      │   │
│   │                                 ▼                                      │   │
│   │                        ┌───────────────────┐                           │   │
│   │                        │   COMPONENTS      │                           │   │
│   │                        └───────────────────┘                           │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   COMPONENT HIERARCHY:                                                           │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │   App                                                                   │   │
│   │    └── Layout                                                          │   │
│   │         ├── Header                                                     │   │
│   │         │    └── ConnectWallet ←──── walletStore                       │   │
│   │         ├── Sidebar                                                    │   │
│   │         └── Main Content                                               │   │
│   │              ├── AgentDashboard (activeView === 'agent')               │   │
│   │              │    ├── ReputationCard ←──── agentStore                  │   │
│   │              │    ├── ProofGenerator ←──── agentStore                  │   │
│   │              │    └── TransactionLog ←──── agentStore.transactions     │   │
│   │              │                                                         │   │
│   │              └── ClientDashboard (activeView === 'client')             │   │
│   │                   ├── AgentSearch ←──── clientStore.filters            │   │
│   │                   ├── AgentCard[] ←──── clientStore.searchResults      │   │
│   │                   └── TransactionLog ←──── clientStore.transactions    │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 4.2 User Interaction Flows

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                         USER INTERACTION FLOWS                                    │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   FLOW 1: AGENT PROOF GENERATION                                                 │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │   User Action              UI Update              State Change          │   │
│   │   ───────────              ─────────              ────────────          │   │
│   │                                                                         │   │
│   │   1. Select proof    ──>   Show threshold   ──>   (local state)        │   │
│   │      type                  input                                        │   │
│   │                                                                         │   │
│   │   2. Enter threshold ──>   Validate input   ──>   (local state)        │   │
│   │                                                                         │   │
│   │   3. Click Generate  ──>   Show loading     ──>   isGenerating=true    │   │
│   │                            spinner                                      │   │
│   │                                                                         │   │
│   │   4. (Aleo SDK call) ──>   (waiting)        ──>   (async)              │   │
│   │                                                                         │   │
│   │   5. Proof returned  ──>   Show success     ──>   generatedProof=...   │   │
│   │                            + proof display        isGenerating=false    │   │
│   │                                                                         │   │
│   │   6. Click Copy      ──>   "Copied!" toast  ──>   (clipboard)          │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   FLOW 2: CLIENT AGENT SEARCH & HIRE                                             │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │   1. Set Filters                                                        │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   clientStore.setFilters({ serviceType: NLP, minTier: Silver })        │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   2. Click Search                                                       │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   API: GET /agents?service_type=1&min_tier=2                           │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   clientStore.setSearchResults(results)                                 │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   3. AgentCard[] rendered                                               │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   4. Click "Hire" on AgentCard                                          │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   clientStore.selectAgent(agent)                                        │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   5. PaymentFlow modal opens                                            │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   6. SDK: client.request(agent.endpoint)                                │   │
│   │      │                                                                  │   │
│   │      ▼                                                                  │   │
│   │   7. Transaction logged                                                 │   │
│   │      clientStore.addTransaction({ type: 'escrow_created', ... })       │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 5. TESTING FLOWS

### 5.1 Test Coverage Matrix

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                            TESTING ARCHITECTURE                                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                         TEST PYRAMID                                     │   │
│   ├─────────────────────────────────────────────────────────────────────────┤   │
│   │                                                                         │   │
│   │                          ┌───────────────┐                              │   │
│   │                          │    E2E        │   5% - Full flow tests      │   │
│   │                          │    Tests      │                              │   │
│   │                        ┌─┴───────────────┴─┐                            │   │
│   │                        │   Integration     │  15% - Component           │   │
│   │                        │   Tests           │       integration          │   │
│   │                      ┌─┴───────────────────┴─┐                          │   │
│   │                      │                       │  80% - Unit tests        │   │
│   │                      │     Unit Tests        │       per component      │   │
│   │                      │                       │                          │   │
│   │                      └───────────────────────┘                          │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   COMPONENT TEST COVERAGE:                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │   Component          │ Unit │ Integration │ E2E │ Target Coverage       │   │
│   │   ─────────────────────────────────────────────────────────────────────│   │
│   │   Smart Contract     │  ✓   │      ✓      │  ✓  │ 100%                  │   │
│   │   ├─ register_agent  │  ✓   │      ✓      │  ✓  │                       │   │
│   │   ├─ submit_rating   │  ✓   │      ✓      │  ✓  │                       │   │
│   │   ├─ update_rep      │  ✓   │      ✓      │  ✓  │                       │   │
│   │   ├─ prove_*         │  ✓   │      ✓      │  ✓  │                       │   │
│   │   └─ escrow_*        │  ✓   │      ✓      │  ✓  │                       │   │
│   │   ─────────────────────────────────────────────────────────────────────│   │
│   │   Facilitator        │  ✓   │      ✓      │  ✓  │ 90%                   │   │
│   │   ├─ /agents routes  │  ✓   │      ✓      │     │                       │   │
│   │   ├─ /verify routes  │  ✓   │      ✓      │     │                       │   │
│   │   └─ x402 middleware │  ✓   │      ✓      │  ✓  │                       │   │
│   │   ─────────────────────────────────────────────────────────────────────│   │
│   │   SDK                │  ✓   │      ✓      │     │ 95%                   │   │
│   │   ├─ Client methods  │  ✓   │      ✓      │     │                       │   │
│   │   ├─ Agent methods   │  ✓   │      ✓      │     │                       │   │
│   │   └─ Crypto utils    │  ✓   │             │     │                       │   │
│   │   ─────────────────────────────────────────────────────────────────────│   │
│   │   Frontend           │  ✓   │      ✓      │     │ 85%                   │   │
│   │   ├─ Components      │  ✓   │             │     │                       │   │
│   │   └─ Stores          │  ✓   │      ✓      │     │                       │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 5.2 E2E Test Scenario Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│              END-TO-END TEST: COMPLETE PURCHASE & RATING FLOW                     │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   TEST SCENARIO: Agent Registration → Service → Rating → Tier Upgrade            │
│                                                                                   │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │   STEP 1: Agent Registration                                            │   │
│   │   ├── Action: leo run register_agent 1u8 123field 456field             │   │
│   │   ├── Assert: AgentReputation record created                            │   │
│   │   ├── Assert: tier == 0 (New)                                           │   │
│   │   └── Assert: agent_listings mapping updated                            │   │
│   │                                                                         │   │
│   │   STEP 2: Agent Appears in Search                                       │   │
│   │   ├── Action: GET /agents?service_type=1                                │   │
│   │   ├── Assert: Response includes new agent                               │   │
│   │   └── Assert: tier badge shows "New"                                    │   │
│   │                                                                         │   │
│   │   STEP 3: Client Creates Escrow                                         │   │
│   │   ├── Action: client.createEscrow({ agent, amount: $100, ... })        │   │
│   │   ├── Assert: EscrowRecord created with status=0                        │   │
│   │   └── Assert: Funds locked                                              │   │
│   │                                                                         │   │
│   │   STEP 4: Client Makes Paid Request                                     │   │
│   │   ├── Action: client.request(agentUrl) with escrow proof               │   │
│   │   ├── Assert: Response 200 OK                                           │   │
│   │   └── Assert: X-DELIVERY-SECRET header present                          │   │
│   │                                                                         │   │
│   │   STEP 5: Agent Claims Escrow                                           │   │
│   │   ├── Action: agent.claimEscrow(escrow, secret)                        │   │
│   │   ├── Assert: Escrow status=1 (Released)                                │   │
│   │   └── Assert: Agent owns funds                                          │   │
│   │                                                                         │   │
│   │   STEP 6: Client Submits Rating                                         │   │
│   │   ├── Action: client.submitRating({ stars: 5, jobHash, ... })          │   │
│   │   ├── Assert: RatingRecord created                                      │   │
│   │   ├── Assert: 0.5 credits burned                                        │   │
│   │   └── Assert: Nullifier stored                                          │   │
│   │                                                                         │   │
│   │   STEP 7: Agent Updates Reputation                                      │   │
│   │   ├── Action: agent.updateReputation(currentRep, ratingRecord)         │   │
│   │   ├── Assert: total_jobs incremented                                    │   │
│   │   ├── Assert: total_rating_points += 50                                 │   │
│   │   └── Assert: total_revenue += $100                                     │   │
│   │                                                                         │   │
│   │   STEP 8: Repeat Steps 3-7 (×10 for Bronze tier)                        │   │
│   │   ├── Assert: After 10 jobs, tier upgrades to 1 (Bronze)               │   │
│   │   └── Assert: Agent listing shows Bronze badge                          │   │
│   │                                                                         │   │
│   │   STEP 9: Agent Generates Tier Proof                                    │   │
│   │   ├── Action: agent.proveReputation(ProofType.Tier, 1)                 │   │
│   │   ├── Assert: ReputationProof created                                   │   │
│   │   └── Assert: threshold_met == true                                     │   │
│   │                                                                         │   │
│   │   STEP 10: Verify Proof                                                 │   │
│   │   ├── Action: POST /verify/reputation { proof, threshold: 1 }          │   │
│   │   └── Assert: { valid: true, tier: 1 }                                 │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
│   SECURITY TEST SCENARIOS:                                                       │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │                                                                         │   │
│   │   • Double-rating attempt → Assert: Nullifier check fails              │   │
│   │   • Wrong escrow secret → Assert: Hash mismatch, claim rejected        │   │
│   │   • Early refund attempt → Assert: Deadline not passed, rejected       │   │
│   │   • Duplicate address → Assert: Address already registered, rejected   │   │
│   │   • Invalid rating (0 or 60) → Assert: Out of range, rejected          │   │
│   │                                                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 6. FUTURE ROADMAP FLOWS

### 6.1 Evolution Roadmap

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                      SHADOWAGENT EVOLUTION ROADMAP                                │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   PHASE 1: Foundation (Months 1-3)                                               │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  NOW (Hackathon MVP)           DELIVERABLES                             │   │
│   │  ─────────────────────         ─────────────                            │   │
│   │  • Basic smart contract   ──>  • Security audit                         │   │
│   │  • Demo UI                ──>  • Production SDK v1.0.0                  │   │
│   │  • x402 flow              ──>  • Agent Hub v1                           │   │
│   │                           ──>  • Client Discovery v1                    │   │
│   │                           ──>  • Testnet launch                         │   │
│   └���────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                        │
│                                         ▼                                        │
│   PHASE 2: Core Platform (Months 4-6)                                            │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  FOCUS: SCALABILITY + PMF                                               │   │
│   │  ───────────────────────────                                            │   │
│   │  • Multi-token support (USDCx, pALEO)                                   │   │
│   │  • SESSION-BASED PAYMENTS ← Critical for UX                             │   │
│   │  • Agent categories & specialization                                    │   │
│   │  • Dispute resolution system                                            │   │
│   │  • Agent analytics dashboard                                            │   │
│   │  • MAINNET LAUNCH                                                       │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                        │
│                                         ▼                                        │
│   PHASE 3: Ecosystem (Months 7-12)                                               │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  FOCUS: NETWORK EFFECTS                                                 │   │
│   │  ─────────────────────────                                              │   │
│   │  • Agent-to-Agent protocol (orchestration)                              │   │
│   │  • Subscription model support                                           │   │
│   │  • Cross-chain reputation bridge (research)                             │   │
│   │  • Enterprise features (private pools, compliance)                      │   │
│   │  • ShadowAgent Verify (B2B verification API)                            │   │
│   │  • ShadowAgent Connect (one-click integration)                          │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                        │
│                                         ▼                                        │
│   PHASE 4: Enterprise & Scale (Year 2)                                           │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  TARGETS: 1000+ agents, $10M+/month volume                              │   │
│   │  ──────────────────────────────────────────                             │   │
│   │  • Layer 2 / rollup integration                                         │   │
│   │  • Global CDN for SDK                                                   │   │
│   │  • Enterprise SLAs                                                      │   │
│   │  • Compliance certifications (SOC2, GDPR)                               │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                         │                                        │
│                                         ▼                                        │
│   PHASE 5: Autonomous Economy (Year 3+)                                          │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  VISION: AI agents transacting autonomously                             │   │
│   │  ────────────────────────────────────────                               │   │
│   │  • Policy-based autonomous spending                                     │   │
│   │  • AI-to-AI marketplaces                                                │   │
│   │  • Decentralized governance (DAO)                                       │   │
│   │  • Multi-chain interoperability                                         │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 6.2 Agent-to-Agent Communication Flow (Future)

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    AGENT-TO-AGENT PROTOCOL (Phase 3)                              │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│   SCENARIO: "Analyze this document, translate it, and summarize"                 │
│                                                                                   │
│   ┌──────────┐                                                                   │
│   │  Client  │                                                                   │
│   └────┬─────┘                                                                   │
│        │ Request: Complex multi-step task                                        │
│        │ Single escrow: $10                                                      │
│        ▼                                                                         │
│   ┌───────────────────────────────────────────────────────────────────────┐     │
│   │                       ORCHESTRATOR AGENT                               │     │
│   │                                                                        │     │
│   │   1. Receive client request                                           │     │
│   │   2. Decompose into sub-tasks                                         │     │
│   │   3. Create NESTED ESCROWS for sub-agents                             │     │
│   │   4. Aggregate results                                                │     │
│   │   5. Return to client                                                  │     │
│   └────────────────────────────┬──────────────────────────────────────────┘     │
│                                │                                                 │
│            ┌───────────────────┼───────────────────┐                            │
│            │                   │                   │                            │
│            ▼                   ▼                   ▼                            │
│   ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐                  │
│   │   OCR Agent     │ │  Translation    │ │  Summarization  │                  │
│   │                 │ │  Agent          │ │  Agent          │                  │
│   │  Nested escrow: │ │                 │ │                 │                  │
│   │  $3             │ │  Nested escrow: │ │  Nested escrow: │                  │
│   │                 │ │  $4             │ │  $2             │                  │
│   │  (doesn't know  │ │                 │ │                 │                  │
│   │   original      │ │  (doesn't know  │ │  (doesn't know  │                  │
│   │   client)       │ │   original      │ │   original      │                  │
│   │                 │ │   client)       │ │   client)       │                  │
│   └─────────────────┘ └─────────────────┘ └─────────────────┘                  │
│                                                                                   │
│   PRIVACY GUARANTEES:                                                            │
│   ┌─────────────────────────────────────────────────────────────────────────┐   │
│   │  • Client ─/─> Sub-agents   (Client identity hidden from sub-agents)   │   │
│   │  • Sub-agents ─/─> Client   (Sub-agent identities hidden from client)  │   │
│   │  • Orchestrator proves combined result without revealing sources       │   │
│   │  • Payment splits happen privately through nested escrows              │   │
│   │  • Only aggregate reputation visible                                    │   │
│   └─────────────────────────────────────────────────────────────────────────┘   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 7. CROSS-COMPONENT DATA FLOW

### 7.1 Complete System Data Flow

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    COMPLETE SYSTEM DATA FLOW                                      │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                   │
│                              ┌─────────────────┐                                 │
│                              │    FRONTEND     │                                 │
│                              │   (React/TS)    │                                 │
│                              └────────┬────────┘                                 │
│                                       │                                          │
│                    ┌──────────────────┼──────────────────┐                      │
│                    │                  │                  │                      │
│                    ▼                  ▼                  ▼                      │
│           ┌───────────────┐  ┌───────────────┐  ┌───────────────┐              │
│           │  Client SDK   │  │  Agent SDK    │  │  Facilitator  │              │
│           │  (TypeScript) │  │  (TypeScript) │  │  (Node.js)    │              │
│           └───────┬───────┘  └───────┬───────┘  └───────┬───────┘              │
│                   │                  │                  │                       │
│                   │    ┌─────────────┴──────────────────┘                       │
│                   │    │                                                        │
│                   ▼    ▼                                                        │
│           ┌──────────────────────────────────────────────────┐                 │
│           │              ALEO NETWORK                         │                 │
│           │  ┌────────────────────────────────────────────┐  │                 │
│           │  │         shadow_agent.aleo                   │  │                 │
│           │  │  ┌─────────────┐  ┌─────────────────────┐  │  │                 │
│           │  │  │  RECORDS    │  │     MAPPINGS        │  │  │                 │
│           │  │  │  (Private)  │  │     (Public)        │  │  │                 │
│           │  │  │             │  │                     │  │  │                 │
│           │  │  │ •AgentRep   │  │ •agent_listings     │  │  │                 │
│           │  │  │ •RatingRec  │  │ •used_nullifiers    │  │  │                 │
│           │  │  │ •EscrowRec  │  │ •verified_ids       │  │  │                 │
│           │  │  │ •RepProof   │  │                     │  │  │                 │
│           │  │  │ •PaymentSes │  │                     │  │  │                 │
│           │  │  └─────────────┘  └─────────────────────┘  │  │                 │
│           │  └────────────────────────────────────────────┘  │                 │
│           └──────────────────────────────────────────────────┘                 │
│                                                                                   │
│   PRIVACY BOUNDARY:                                                              │
│   ═══════════════════════════════════════════════════════════════════════════   │
│   │  PRIVATE (Records)              │  PUBLIC (Mappings)                     │   │
│   │──────────────────────────────────────────────────────────────────────────│   │
│   │  • Payment amounts              │  • Agent exists (agent_id)            │   │
│   │  • Exact job counts             │  • Service type                       │   │
│   │  • Revenue figures              │  • Tier badge (Bronze/Silver/Gold)    │   │
│   │  • Individual ratings           │  • Active status                      │   │
│   │  • Client identities            │  • Nullifier used (bool)              │   │
│   │  • Transaction history          │  • Address registered (bool)          │   │
│   ═══════════════════════════════════════════════════════════════════════════   │
│                                                                                   │
└─────────────────────────────────────────────────────────────────────────────────┘
```

---

## 8. IMPLEMENTATION PRIORITY ORDER

| Priority | Component | Reason |
|----------|-----------|--------|
| 1 | Smart Contract (Phase 1-6) | Foundation for everything else |
| 2 | SDK (Client + Agent) | Enables integrations |
| 3 | Facilitator Service | Bridge for x402 protocol |
| 4 | Frontend | User-facing demo |
| 5 | Session-Based Payments | Critical UX improvement |
| 6 | Testing Suite | Quality assurance |
| 7 | Deployment | Production readiness |

---

## 9. VERIFICATION PLAN

1. **Smart Contract**: `leo build && ./test_contract.sh`
2. **Facilitator**: `npm test -- --coverage` (target 90%+)
3. **SDK**: `npm test -- --coverage` (target 95%+)
4. **Frontend**: `npm test` (Vitest + React Testing Library)
5. **E2E**: Full flow test on testnet
6. **Security**: External audit before mainnet

---

## 10. KEY ARCHITECTURAL INSIGHTS

### 10.1 Privacy Boundary

The system maintains a clear separation between private (Records) and public (Mappings) data:

| Layer | Data Type | Visibility |
|-------|-----------|------------|
| Records | Payment amounts, job counts, ratings, revenue | Private to owner |
| Mappings | Agent existence, tier badges, nullifier status | Public on-chain |

### 10.2 Sybil Resistance

The multi-layer defense makes attacks economically irrational:
- Registration bond: 10+ credits staked per agent
- Each rating requires burning 0.5 credits
- Minimum payment of $0.10 per job
- Address-based identity (one agent per address)
- Attack cost: 10 credit bond + 100+ credits burned for Gold tier

### 10.3 O(1) Proof Generation

Rolling aggregation enables constant-time ZK proofs:
- No iteration over historical data
- Average = `total_points / total_jobs`
- Tier calculated from cumulative thresholds
- Proof generation: ~1 second regardless of history size

### 10.4 Session-Based Payments

Solves the micropayment UX problem:
- Before: 1000 API calls = 1000 wallet signatures
- After: 1 signature = unlimited requests within bounds
- Enables autonomous AI agent economies

---

## 8. SESSION-BASED PAYMENT FLOW

> Corresponds to **Phase 5** in the [10-Phase Master Plan](00_Project_Overview_10_Phase_Plan.md).

### 8.1 Session Lifecycle

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    SESSION-BASED PAYMENT LIFECYCLE                               │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  CLIENT (Human/AI)              SESSION                    AGENT                │
│  ─────────────────              ───────                    ─────                │
│                                                                                 │
│  1. CREATE SESSION                                                              │
│  ┌─────────────────┐                                                            │
│  │ Sign once:      │                                                            │
│  │ max_total: $100 │──── create_session() ──────►  Session ACTIVE              │
│  │ per_req: $1     │     (locks funds)                  │                       │
│  │ rate: 100/hr    │                                    │                       │
│  │ expires: 1 day  │                                    │                       │
│  └─────────────────┘                                    │                       │
│                                                         │                       │
│  2. USE SESSION (no signatures!)                        │                       │
│  ┌─────────────────┐                                    │                       │
│  │ Request 1: $0.05│──── session_request() ────►  Validate bounds             │
│  │ Request 2: $0.05│──── session_request() ────►  amount <= per_req? ✓         │
│  │ Request 3: $0.05│──── session_request() ────►  spent+amt <= max? ✓          │
│  │ ...             │                                rate_limit ok? ✓            │
│  │ Request N: $0.05│──── session_request() ────►  not expired? ✓               │
│  └─────────────────┘                              Returns SessionReceipt       │
│                                                         │                       │
│  3. SETTLE (batch)                                      │                       │
│                                         ┌───────────────┘                       │
│                                         │                                       │
│                                         ▼                                       │
│                              settle_session()                                   │
│                              (batch up to 100 receipts                          │
│                               into 1 on-chain TX)                               │
│                                         │                                       │
│                                         ▼                                       │
│  4. CLOSE                         Funds transferred                             │
│  ┌─────────────────┐             to agent on-chain                              │
│  │ close_session() │                    │                                       │
│  │ Refund unused:  │◄──────────────────┘                                       │
│  │ $100 - spent    │                                                            │
│  └─────────────────┘                                                            │
│                                                                                 │
│  OPTIONAL CONTROLS:                                                             │
│  ├── pause_session()  ──►  Temporarily freeze (no new requests)                │
│  └── resume_session() ──►  Reactivate paused session                           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.2 Session vs x402 Comparison

```
┌─────────────────────────────────────────────────────────────────────────────────┐
│                    x402 (PER-REQUEST)            SESSION-BASED                   │
├─────────────────────────────────────────────────────────────────────────────────┤
│                                                                                 │
│  For 1000 API calls:                                                            │
│                                                                                 │
│  x402 Flow:                          Session Flow:                              │
│  ──────────                          ─────────────                              │
│  Request  1 → Sign → Escrow → Claim  create_session → Sign ONCE               │
│  Request  2 → Sign → Escrow → Claim  Request  1 → No sig → Receipt            │
│  Request  3 → Sign → Escrow → Claim  Request  2 → No sig → Receipt            │
│  ...                                 ...                                        │
│  Request 1000→ Sign → Escrow → Claim Request 1000 → No sig → Receipt           │
│                                      settle_session → 1 TX                      │
│                                      close_session → Refund                     │
│                                                                                 │
│  Signatures:    1000                 Signatures:     1                           │
│  On-chain TXs:  1000                On-chain TXs:   2-3                         │
│  Gas cost:      1000x               Gas cost:       ~3x                         │
│  Latency:       Per-request          Latency:        None (off-chain)           │
│                                                                                 │
└─────────────────────────────────────────────────────────────────────────────────┘
```

### 8.3 Session State Machine

```
                    ┌──────────────┐
                    │              │
    create_session  │   ACTIVE     │  session_request (N times)
    ───────────────►│   (status=0) │◄─────────────────────────
                    │              │
                    └──────┬───────┘
                           │
              ┌────────────┼────────────┐
              │            │            │
              ▼            ▼            ▼
     ┌──────────────┐  ┌────────┐  ┌──────────────┐
     │   PAUSED     │  │ SETTLE │  │   CLOSED     │
     │   (status=1) │  │ (batch)│  │   (status=2) │
     │              │  │        │  │              │
     │ pause_session│  │ settle │  │ close_session│
     └──────┬───────┘  │_session│  │ + refund     │
            │          └────┬───┘  └──────────────┘
            │               │
            ▼               ▼
     resume_session    Funds → Agent
     ──► ACTIVE        on-chain
```

---

*End of Technical Flow Diagrams*
