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
| **Identity** | zPass: One credential per agent | Cannot create infinite agents |
| **Payment** | Minimum $0.10 per rated job | Dust transactions excluded |

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

### 7. x402 Payment Protocol
Standard HTTP 402 flow with private Aleo escrows:
- Agent returns HTTP 402 with payment terms
- Client creates private escrow
- Client retries with escrow proof
- Agent delivers and claims payment

---

## Technical Architecture

### Smart Contract Records

| Record | Visibility | Purpose |
|--------|------------|---------|
| `AgentReputation` | Private | Cumulative reputation stats |
| `RatingRecord` | Private | Individual job rating |
| `EscrowRecord` | Private | Locked payment for fair exchange |
| `ReputationProof` | Private | ZK attestation output |
| `PaymentSession` | Private | Pre-authorized spending bounds |
| `SessionReceipt` | Private | Per-request tracking for batch settlement |

### On-Chain Mappings

| Mapping | Purpose |
|---------|---------|
| `agent_listings` | Public discovery (agent_id → PublicListing) |
| `used_nullifiers` | Double-rating prevention |
| `verified_identities` | zPass Sybil resistance |

### Core Transitions

| Transition | Purpose |
|------------|---------|
| `register_agent` | Register with zPass verification |
| `submit_rating` | Submit rating with burn mechanism |
| `update_reputation` | Agent incorporates rating (O(1)) |
| `prove_tier/rating/jobs/revenue` | Generate ZK proofs |
| `create_escrow` | Lock payment for service |
| `claim_escrow` | Agent claims with secret |
| `refund_escrow` | Client reclaims after timeout |
| `create_session` | Initialize payment session |
| `session_request` | Process request within session |
| `settle_session` | Batch settle to blockchain |
| `close_session` | End session, refund unused |

---

## SDK Usage

### Client SDK

```typescript
import { ShadowAgentClient, ServiceType, Tier } from '@shadowagent/sdk';

// Initialize
const client = new ShadowAgentClient({
  privateKey: 'APrivateKey1...',
  network: 'testnet',
});

// Search for agents
const agents = await client.searchAgents({
  serviceType: ServiceType.NLP,
  minTier: Tier.Silver,
});

// Option 1: Per-request payment (simple, good for occasional use)
const response = await client.request('https://agent.example.com/api/analyze', {
  method: 'POST',
  body: JSON.stringify({ text: 'Hello world' }),
});

// Option 2: Session-based payment (recommended for high-frequency use)
const session = await client.createSession({
  agent: 'aleo1agent...',
  maxTotal: 100_000_000n,     // $100 max
  maxPerRequest: 1_000_000n,  // $1 per request max
  rateLimit: 100n,            // 100 requests per rate window
  durationBlocks: 1000,       // ~24 hours
});

// Make unlimited requests within session bounds - NO wallet signatures!
for (let i = 0; i < 1000; i++) {
  const { response, updatedSession } = await client.sessionRequest(
    session,
    'https://agent.example.com/api/analyze',
    { method: 'POST', body: JSON.stringify({ text: `Request ${i}` }) }
  );
  session = updatedSession;
}

// Close session when done
const { refundAmount } = await client.closeSession(session);
console.log(`Refunded: $${Number(refundAmount) / 1_000_000}`);
```

### Agent SDK

```typescript
import { ShadowAgentServer, shadowAgentMiddleware, ServiceType } from '@shadowagent/sdk';

// Initialize agent
const agent = new ShadowAgentServer({
  privateKey: 'APrivateKey1...',
  network: 'testnet',
  serviceType: ServiceType.NLP,
  endpointUrl: 'https://my-agent.example.com',
  pricePerRequest: 100_000, // $0.10
});

// Register on marketplace
await agent.register('zpass_credential_hash');

// Apply payment middleware (supports both escrow and session payments)
app.use('/api', shadowAgentMiddleware({ agent, pricePerRequest: 100_000 }));

// Your service endpoint
app.post('/api/analyze', (req, res) => {
  res.json({ analysis: 'Positive sentiment!' });
});

// Generate reputation proofs
const proof = await agent.proveReputation(ProofType.Tier, Tier.Silver);
```

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
| **1** | Core Records (AgentReputation, RatingRecord) | ✅ |
| **2** | Agent Registration with zPass | ✅ |
| **3** | Rating System with Burn Mechanism | ✅ |
| **4** | Rolling Reputation Update (O(1)) | ✅ |
| **5** | Proof Generation (tier, rating, jobs, revenue) | ✅ |
| **6** | Escrow System (HTLC) | ✅ |
| **7** | Session-Based Payments | ✅ |
| **8** | TypeScript SDK | ✅ |
| **9** | Demo UI | 🔄 |
| **10** | Polish & Presentation | 🔄 |

---

## Why Aleo?

This architecture is **impossible on public chains**. Aleo uniquely enables:

- **Private Records**: Reputation data never touches public state
- **Selective Disclosure**: Prove thresholds without revealing values
- **zPass Integration**: Sybil-resistant identity verification
- **Native ZK**: First-class support for zero-knowledge proofs

---

## The 30-Second Pitch

> "Amiko won 'Best Trustless Agent' at the Solana x402 Hackathon by creating on-chain reputation for AI agents. But every transaction, every rating, every client is public forever.
>
> **ShadowAgent** is the evolution — Zero-Knowledge Reputation Attestation.
>
> Agents prove 'Gold tier, 4.8 stars, $50k revenue' **without revealing a single client or job**.
>
> Three layers of Sybil resistance: burn-to-rate, zPass identity, and payment-weighted ratings.
>
> Session-based payments enable **1000 API calls with 1 wallet signature** — making autonomous AI economies practical.
>
> Built on Aleo because this is **impossible** anywhere else.
>
> Privacy isn't a feature. It's the product."

---

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn
- Leo CLI (for smart contract development)

### Installation

```bash
# Clone the repository
cd /path/to/Aleo

# Install facilitator dependencies
cd shadow-facilitator
npm install

# Install SDK dependencies
cd ../shadow-sdk
npm install

# Install frontend dependencies
cd ../shadow-frontend
npm install
```

### Running the Development Environment

```bash
# Terminal 1: Start the facilitator service
cd shadow-facilitator
npm run dev
# Runs on http://localhost:3000

# Terminal 2: Start the frontend
cd shadow-frontend
npm run dev
# Runs on http://localhost:5173

# Build the smart contract
cd shadow_agent
leo build
```

### Environment Variables

Create `.env` files in each project:

**shadow-facilitator/.env**
```
PORT=3000
ALEO_RPC_URL=https://api.explorer.aleo.org/v1
PROGRAM_ID=shadow_agent.aleo
NODE_ENV=development
```

**shadow-frontend/.env**
```
VITE_API_URL=http://localhost:3000
```

## Project Structure

```
Aleo/
├── shadow_agent/              # Leo smart contract
│   ├── src/main.leo          # Core contract (complete)
│   └── program.json
├── shadow-facilitator/        # Off-chain service (Node.js/Express)
│   ├── src/
│   │   ├── index.ts          # Main server
│   │   ├── types.ts          # TypeScript types
│   │   ├── routes/           # API routes
│   │   ├── services/         # Aleo & Indexer services
│   │   └── middleware/       # x402 payment middleware
│   └── package.json
├── shadow-sdk/                # TypeScript SDK
│   ├── src/
│   │   ├── index.ts          # Main exports
│   │   ├── client.ts         # Client SDK
│   │   ├── agent.ts          # Agent SDK
│   │   ├── types.ts          # Type definitions
│   │   └── crypto.ts         # Cryptographic utilities
│   └── package.json
├── shadow-frontend/           # React frontend
│   ├── src/
│   │   ├── App.tsx           # Main app
│   │   ├── components/       # UI components
│   │   ├── pages/            # Page components
│   │   ├── stores/           # Zustand state stores
│   │   └── lib/              # API client
│   └── package.json
├── docs/
│   ├── 01_Smart_Contract_Implementation.md
│   ├── 02_Facilitator_Implementation.md
│   ├── 03_SDK_Implementation.md
│   ├── 04_Frontend_Implementation.md
│   ├── 05_Testing_Implementation.md
│   ├── 06_Future_Implementation_Plan.md
│   └── 07_Technical_Flow_Diagrams.md   # NEW: Comprehensive flow diagrams
├── Technical_Docs.md          # Complete technical specification
└── README.md
```

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
| **Technical** | 10/10 | Rolling reputation, Sybil resistance, sessions, escrow |
| **UX** | 10/10 | Session payments solve micropayment UX |
| **Practical** | 10/10 | Improves on hackathon winner (Amiko) |
| **Novel** | 10/10 | First ZK reputation + sessions for AI agents |
| **Aleo Alignment** | 10/10 | Uses zPass, showcases unique capabilities |
| **Demo-ability** | 10/10 | Clear visual: public tier, private data |

---

*ShadowAgent: Where reputation is provable but identity is private.*
