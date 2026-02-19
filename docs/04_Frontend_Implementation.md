# ShadowAgent Frontend Implementation Guide

## Overview

The ShadowAgent frontend is a React single-page application providing views for **Agent Dashboard** (register, manage, prove), **Client Discovery** (search, hire, pay), and **Dispute Center** (disputes, refunds). It integrates directly with the `shadow_agent.aleo`, `shadow_agent_ext.aleo`, and `shadow_agent_session.aleo` smart contracts on Aleo testnet via the `@provablehq/sdk` and the `@shadowagent/sdk`.

**Live Contracts:** `shadow_agent.aleo` + `shadow_agent_ext.aleo` on Aleo testnet | `shadow_agent_session.aleo` (pending deployment)
**Core Deploy TX:** `at105knrkmfhsc8mlzd3sz5nmk2vy4jnsjdktdwq4fr236jcssasvpqp2sv9p`
**Extension Deploy TX:** `at1fpwhdvs77vn37ngxrnty40qxsnwwuccu660e73f409nssjk3vyqqxpx647`

---

## 1. Project Setup

### 1.1 Technology Stack

| Package | Version | Purpose |
|---------|---------|---------|
| React | 18.2 | UI framework |
| TypeScript | 5.3.3 | Type safety |
| Vite | 5.0.10 | Build tool (ESNext target for WASM) |
| Tailwind CSS | 3.4.0 | Utility-first styling |
| Zustand | 4.4.7 | State management |
| React Router DOM | 6.21.1 | Client-side routing |
| @provablehq/sdk | 0.9.15+ | Aleo blockchain SDK (WASM) |
| @shadowagent/sdk | local | Project SDK for crypto/API helpers |
| Lucide React | 0.303 | Icon library |
| clsx | 2.0 | Conditional classnames |

### 1.2 Installation

```bash
cd shadow-frontend

# Install dependencies (SDK is linked locally)
npm install

# Start development server
npm run dev

# Type check
npm run typecheck

# Production build
npm run build
```

### 1.3 Project Structure

```
shadow-frontend/
├── src/
│   ├── main.tsx                    # Entry point (BrowserRouter + WalletProvider)
│   ├── App.tsx                     # Routes, ErrorBoundary, NotFound page
│   ├── config.ts                   # Centralized config (FACILITATOR_URL, API_BASE, FACILITATOR_ENABLED)
│   ├── index.css                   # Global styles, design system, animations
│   ├── components/
│   │   ├── Layout.tsx              # Shell: ambient background, header, footer
│   │   ├── Header.tsx              # Glassmorphism nav with scroll awareness
│   │   ├── AgentCard.tsx           # Agent listing card with shine effects
│   │   ├── TierBadge.tsx           # Tier indicator (New/Bronze/Silver/Gold/Diamond)
│   │   ├── ConnectWallet.tsx       # Shield Wallet connect/balance/disconnect
│   │   ├── DisputeForm.tsx         # Dispute submission with evidence hashing
│   │   ├── PartialRefundModal.tsx  # Refund proposal with agent/client split slider
│   │   ├── RatingForm.tsx          # Star rating submission (Phase 10a)
│   │   ├── MultiSigEscrowForm.tsx  # Multi-sig escrow creation (Phase 10a)
│   │   ├── MultiSigApprovalPanel.tsx # Multi-sig escrow approval UI (Phase 10a)
│   │   ├── SessionManager.tsx      # Session payment management modal (Phase 5)
│   │   ├── session/
│   │   │   ├── CreateSessionForm.tsx # Session creation form
│   │   │   ├── SessionList.tsx     # Active/paused session list
│   │   │   └── PolicyManager.tsx   # Session policy management
│   │   └── agent/
│   │       ├── RegistrationForm.tsx  # Agent registration form
│   │       ├── ReputationPanel.tsx   # ZK proof generation panel
│   │       ├── ActiveSessionsPanel.tsx # Agent's active sessions
│   │       └── SkeletonStats.tsx     # Loading skeleton for stats
│   ├── pages/
│   │   ├── HomePage.tsx            # Landing: hero, features, roadmap
│   │   ├── AgentDashboard.tsx      # Register agent, view stats, generate proofs
│   │   ├── ClientDashboard.tsx     # Search agents with filters + multi-sig
│   │   ├── DisputeCenter.tsx       # Disputes + partial refunds (Phase 10a)
│   │   ├── AgentDetails.tsx        # Agent detail + hire modal + proof modal
│   │   └── TransactionHistory.tsx  # Activity feed with filtered transaction log
│   ├── providers/
│   │   └── WalletProvider.tsx      # Shield Wallet context (manual tx building)
│   ├── contexts/
│   │   └── ToastContext.tsx        # Toast notification system
│   ├── stores/
│   │   ├── agentStore.ts           # Agent/client state (Zustand, persisted)
│   │   ├── walletStore.ts          # Wallet connection state
│   │   └── sdkStore.ts             # SDK client state + health checks
│   ├── hooks/
│   │   ├── useTransactions.ts      # Escrow creation, balance checks, ZK proofs
│   │   └── useCopyToClipboard.ts   # Clipboard utility hook
│   ├── services/
│   │   └── aleo.ts                 # On-chain queries, tx builders, formatters
│   ├── lib/
│   │   └── api.ts                  # Facilitator API client (search, verify)
│   ├── utils/
│   │   └── timeAgo.ts              # Relative timestamp formatting
│   └── constants/
│       └── ui.ts                   # Timing, validation, external URLs
├── tailwind.config.js              # Design tokens, animations, color system
├── vite.config.ts                  # ESNext target, WASM config, API proxy
├── postcss.config.js
├── tsconfig.json
└── package.json
```

### 1.4 Vite Configuration

Key configuration for Aleo WASM compatibility:

```typescript
// vite.config.ts
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: { '@': path.resolve(__dirname, './src') },
  },
  server: {
    port: 5173,
    proxy: {
      '/api': {
        target: 'http://localhost:3001',  // Facilitator backend
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
    },
    fs: {
      allow: ['.', '../shadow-sdk', '../shadow-sdk/node_modules'],
    },
  },
  build: {
    target: 'esnext',         // Required for top-level await (WASM)
    sourcemap: true,
  },
  optimizeDeps: {
    exclude: ['@provablehq/wasm'],  // Don't pre-bundle WASM
  },
});
```

### 1.5 Environment Variables

```bash
# .env
VITE_API_URL=/api                          # Facilitator API (proxied in dev)
VITE_ALEO_NETWORK=testnet
VITE_SHIELD_WALLET_PRIVATE_KEY=APrivateKey1...  # Shield Wallet signing key
VITE_SHIELD_WALLET_VIEW_KEY=AViewKey1...        # Record decryption key
```

---

## 2. Routing

The app uses React Router v6 with a shared layout:

```
/           → HomePage            (landing page)
/agent      → AgentDashboard      (register, manage, prove)
/client     → ClientDashboard     (search agents, multi-sig escrow)
/disputes   → DisputeCenter       (disputes + refunds)
/activity   → TransactionHistory  (transaction activity feed)
/agents/:id → AgentDetails        (detail view + hire)
*           → NotFound            (404)
```

```tsx
// App.tsx - Route configuration
<Routes>
  <Route path="/" element={<Layout />}>
    <Route index element={<HomePage />} />
    <Route path="agent" element={<AgentDashboard />} />
    <Route path="client" element={<ClientDashboard />} />
    <Route path="disputes" element={<DisputeCenter />} />
    <Route path="activity" element={<TransactionHistory />} />
    <Route path="agents/:agentId" element={<AgentDetails />} />
    <Route path="*" element={<NotFound />} />
  </Route>
</Routes>
```

---

## 3. State Management (Zustand)

### 3.1 Wallet Store

Manages wallet connection, balance, and network state.

```typescript
// stores/walletStore.ts
interface WalletState {
  connected: boolean;
  address: string | null;
  balance: number;
  network: 'testnet' | 'mainnet';
  connect: (address: string) => void;
  disconnect: () => void;
  setBalance: (balance: number) => void;
}
```

### 3.2 Agent Store

Unified store for both agent and client views. Types defined locally to avoid eager WASM loading from SDK imports.

```typescript
// stores/agentStore.ts
enum ServiceType { NLP=1, Vision=2, Code=3, Data=4, Audio=5, Multi=6, Custom=7 }
enum Tier { New=0, Bronze=1, Silver=2, Gold=3, Diamond=4 }

interface AgentListing {
  agent_id: string;
  service_type: ServiceType;
  endpoint_hash: string;
  tier: Tier;
  is_active: boolean;
}

interface AgentState {
  // Agent mode
  isRegistered: boolean;
  agentId: string | null;
  reputation: { totalJobs; totalRatingPoints; totalRevenue; tier } | null;

  // Client mode
  searchResults: AgentListing[];
  selectedAgent: AgentListing | null;
  filters: SearchFilters;
  isSearching: boolean;

  // Transaction history (last 50, persisted to localStorage)
  transactions: Array<{
    id: string;
    type: 'escrow_created' | 'escrow_claimed' | 'rating_submitted'
        | 'dispute_opened' | 'dispute_resolved'
        | 'partial_refund_proposed' | 'partial_refund_accepted'
        | 'session_created' | 'session_closed';
    agentId: string;
    amount?: number;      // microcredits
    timestamp: number;    // Date.now()
  }>;
}
```

### 3.3 SDK Store

Manages the `@shadowagent/sdk` client lifecycle and periodic health checks.

```typescript
// stores/sdkStore.ts
interface SDKState {
  client: ShadowAgentClient | null;
  isHealthy: boolean;
  initializeClient: () => void;
  checkHealth: () => Promise<void>;
}
```

---

## 4. Wallet Integration (Shield Wallet)

The `WalletProvider` wraps the app and provides transaction signing via `@provablehq/sdk`.

### 4.1 Architecture

```
main.tsx
  └─ WalletProvider (context: connect, disconnect, signTransaction, getRecords)
       └─ BrowserRouter
            └─ App (routes)
```

### 4.2 Key Implementation Details

**RPC URL:** The `@provablehq/sdk` classes (`AleoNetworkClient`, `ProgramManager`) internally append `/testnet` to the base URL. Pass only `https://api.explorer.provable.com/v1` — NOT `v1/testnet`.

**Transaction Signing:** Uses manual authorization building to bypass the SDK's broken base fee floor (~10,000 ALEO on testnet). The 5-step approach estimates the real fee (~0.003 ALEO):

```typescript
// Step 1: Build authorization for the program execution
const authorization = await programManager.buildAuthorization({
  programName: programId, functionName, privateKey: privKey, inputs,
});

// Step 2: Estimate the actual base fee (returns microcredits)
const executionId = authorization.toExecutionId().toString();
const baseFeeMicrocredits = await programManager.estimateFeeForAuthorization({
  authorization, programName: programId,
});
const baseFeeCredits = Number(baseFeeMicrocredits) / 1_000_000;

// Step 3: Build fee authorization with the real estimated fee
const feeAuthorization = await programManager.buildFeeAuthorization({
  deploymentOrExecutionId: executionId,
  baseFeeCredits,
  priorityFeeCredits: fee / 1_000_000,
  privateKey: privKey,
});

// Step 4: Build and submit the transaction
const tx = await programManager.buildTransactionFromAuthorization({
  programName: programId, authorization, feeAuthorization,
});
const txId = await networkClient.submitTransaction(tx.toString());
```

> **Note:** Do NOT use `programManager.execute()` or `programManager.transfer()` — they enforce a broken base fee floor of ~10,000 ALEO on testnet despite `estimateExecutionFee` returning only ~2,725 microcredits.

**Balance Fetching:** Uses direct RPC fetch (not SDK) since it's a simple mapping lookup:

```typescript
const response = await fetch(
  `https://api.explorer.provable.com/v1/testnet/program/credits.aleo/mapping/account/${publicKey}`
);
const match = balanceText.match(/(\d+)u64/);
```

---

## 5. On-Chain Integration

### 5.1 Contract Constants

```typescript
// services/aleo.ts
export const SHADOW_AGENT_PROGRAM_ID = 'shadow_agent.aleo';
export const SHADOW_AGENT_EXT_PROGRAM_ID = 'shadow_agent_ext.aleo';
export const ALEO_RPC_URL = 'https://api.explorer.provable.com/v1';
export const REGISTRATION_BOND = 10_000_000;   // 10 credits
export const RATING_BURN_COST = 500_000;       // 0.5 credits
```

### 5.2 On-Chain Queries

Three mapping queries against the deployed contract:

```typescript
// Check if address is registered
GET /v1/testnet/program/shadow_agent.aleo/mapping/registered_agents/{address}
→ "true" | 404

// Get agent listing
GET /v1/testnet/program/shadow_agent.aleo/mapping/agent_listings/{agent_id}field
→ PublicListing struct

// Check nullifier (Sybil resistance)
GET /v1/testnet/program/shadow_agent.aleo/mapping/used_nullifiers/{nullifier}field
→ "true" | 404
```

### 5.3 Transaction Builders

Leo-formatted inputs for each transition:

```typescript
// register_agent(service_type: u8, endpoint_hash: field, bond_amount: u64)
buildRegisterAgentInputs(serviceType, endpointUrl, bondAmount)
→ { service_type, endpoint_hash, bond_amount }

// submit_rating(agent: address, job_hash: field, rating: u8, payment: u64, burn: u64)
buildSubmitRatingInputs(agentId, rating, paymentAmount, nullifierSeed)

// create_escrow(agent: address, amount: u64, job_hash: field, secret_hash: field, deadline: u64)
buildCreateEscrowInputs(agentAddress, amount, jobData, deadlineBlocks, secret)
```

### 5.4 Input Formatters

```typescript
formatU8ForLeo(1)       → "1u8"
formatU64ForLeo(10000)  → "10000u64"
formatFieldForLeo("42") → "42field"
```

---

## 6. Design System

### 6.1 Color Tokens

```javascript
// tailwind.config.js
colors: {
  shadow: { 50..950 },      // Brand purple palette
  surface: {
    0: '#0a0a0f',            // Deepest background
    1: '#12121a',            // Card backgrounds
    2: '#1a1a25',            // Elevated surfaces
    3: '#222230',            // Interactive surfaces
    4: '#2a2a3a',            // Highlighted surfaces
  },
}
```

### 6.2 Key CSS Classes

| Class | Description |
|-------|-------------|
| `.card` | Surface-1 background, border, rounded-xl, padding |
| `.card-shine` | Hover sweep gradient effect |
| `.glass` | Backdrop-blur glassmorphism |
| `.btn-primary` | Shadow-600 gradient button |
| `.btn-outline` | Ghost button with border |
| `.input` | Dark input with inset shadow |
| `.mesh-bg` | Ambient radial gradient background |
| `.grid-pattern` | Subtle grid overlay |
| `.noise-overlay` | Film grain texture |
| `.tier-*` | Tier-specific badge colors |
| `.service-*` | Service type icon backgrounds |

### 6.3 Animations

20+ custom animations defined in Tailwind config:

- `fade-in`, `fade-in-up`, `fade-in-down` — Entry transitions
- `scale-in` — Scale from 0.95 to 1
- `slide-in-right` — Toast notifications
- `float` — Gentle floating (hero orbs)
- `pulse-soft` — Status indicators
- `glow-pulse` — Diamond tier badge
- `shine` — Card hover sweep
- `gradient-shift` — Background animation

---

## 7. Component Architecture

### 7.1 Layout Shell

```
Layout.tsx
├── mesh-bg (ambient background layer)
├── grid-pattern (subtle grid overlay)
├── noise-overlay (film grain texture)
├── divider-glow (gradient line below header)
├── Header.tsx
│   ├── Logo (glow on hover)
│   ├── Navigation pills (Home, Find Agents, Agent Dashboard, Disputes, Activity)
│   ├── Active route indicator (underline bar)
│   ├── ConnectWallet.tsx
│   └── Mobile menu (hamburger + staggered items)
├── <Outlet /> (page content with route-key animation)
└── Footer (mini logo + tagline)
```

### 7.2 Page Components

**HomePage** — Hero with floating gradient orbs, stats bar (ZK Proofs, Privacy, Protocol, Network), feature grid with card-shine, tier system table, how-it-works steps, roadmap with status badges, CTA section.

**ClientDashboard** — Filter panel (service type, minimum tier, status), search button, result grid with staggered entry animations, skeleton loading cards, empty state with clear-filters action.

**AgentDashboard** — Two modes:
- *Not connected:* Connect wallet prompt with gradient icon
- *Connected:* Registration form OR dashboard stats (4 gradient stat cards), ZK proof generation section, unregister option

**DisputeCenter** (Phase 10a) — Tabbed interface (Disputes / Refunds), role toggle (client/agent view):
- *Disputes tab:* List of disputes with status badges, client can open disputes with evidence hash, agent can respond with counter-evidence via inline form
- *Refunds tab:* List of partial refund proposals with accept/reject buttons for agents
- Uses `fetchDisputes`, `fetchRefunds`, `respondToDispute`, `acceptRefund`, `rejectRefund` from API client

**AgentDetails** — Back link, header card (name + tier + status), details grid (service info + privacy checks), hire action card with numbered steps. Action modals: ReputationProofModal (verify ZK proof), RequestServiceModal (create escrow payment), DisputeForm, PartialRefundModal, MultiSigEscrowForm, MultiSigApprovalPanel, RatingForm, SessionManager.

**TransactionHistory** — Activity feed displaying the last 50 transactions from `agentStore`. Filter tabs (All / Escrows / Sessions / Disputes / Ratings) with 9 color-coded event type badges. Each row shows type icon+label, clickable agent ID link, amount in credits, and relative timestamp. Persisted to localStorage via Zustand. "Clear History" button to reset.

### 7.3 Shared Components

**AgentCard** — Gradient hover overlay, card-shine sweep, service icon with scale transition, tier badge, active/offline status with ping animation, arrow micro-interaction.

**TierBadge** — Icon per tier (Star, Award, Trophy, Gem), tier-specific CSS classes with gradient backgrounds, Gold glow shadow, Diamond pulse animation, three sizes (sm/md/lg).

**ConnectWallet** — Two states:
- *Disconnected:* Primary button with Wallet icon
- *Connected:* Balance display (ALEO), glass address chip with emerald pulse dot, copy button, explorer link, disconnect button

**RatingForm** (Phase 10a) — Star rating submission component with 1-5 star selector, job hash input, optional payment amount. Submits rating via `submitRating` API. Shows toast feedback on success/error.

**MultiSigApprovalPanel** (Phase 10a) — Multi-signature escrow management panel used in ClientDashboard. Fetches pending multi-sig escrows for the connected wallet, displays signer status and approval progress, provides "Approve" action button. Uses `fetchMultiSigEscrow` and `approveMultiSigEscrow` API calls.

**ToastContext** — 4 types (success/error/info/warning), icon container with type-specific background, backdrop-blur-xl, auto-dismiss after 5 seconds, slide-in-right animation.

---

## 8. API Integration

### 8.1 Facilitator API Client

```typescript
// lib/api.ts - Uses SDK client when available, falls back to direct fetch

// Core
searchAgents(filters, limit, offset) → { agents, total, limit, offset }
getAgent(agentId)                    → AgentListing | null
verifyReputationProof(proof)         → { valid, tier?, error? }

// Phase 10a: Disputes & Refunds
fetchDisputes(params?)               → DisputeInfo[]
submitDispute(data)                  → { success, dispute?, error? }
respondToDispute(jobHash, evidence)  → { success, dispute?, error? }
fetchRefunds(params?)                → RefundInfo[]
submitRefund(data)                   → { success, proposal?, error? }
acceptRefund(jobHash)                → { success, proposal?, error? }
rejectRefund(jobHash)                → { success, proposal?, error? }

// Phase 10a: Multi-Sig Escrow
fetchMultiSigEscrow(jobHash)         → MultiSigEscrowData | null
createMultiSigEscrow(data)           → { success, escrow?, error? }
approveMultiSigEscrow(jobHash, addr) → { success, escrow?, threshold_met?, error? }

// Phase 10a: Ratings
submitRating(agentId, data)          → { success, rating?, error? }
```

### 8.2 Centralized Configuration (`config.ts`)

```typescript
// src/config.ts — Single source of truth for runtime configuration
export const FACILITATOR_URL = import.meta.env.VITE_FACILITATOR_URL
  || import.meta.env.VITE_API_URL || '/api';
export const API_BASE = import.meta.env.VITE_API_URL || '/api';
export const FACILITATOR_ENABLED = !!import.meta.env.VITE_FACILITATOR_URL;
```

The `FACILITATOR_ENABLED` guard prevents API calls when no facilitator URL is configured — all API functions in `lib/api.ts` return empty results instead of failing.

### 8.3 WASM Avoidance Patterns

The frontend avoids importing `@provablehq/sdk` at module parse time to prevent WASM initialization issues:

1. **Mirrored types:** Enums and interfaces (`ServiceType`, `Tier`, `AgentListing`, etc.) are re-declared locally in `stores/agentStore.ts` rather than imported from the SDK.
2. **Lazy loading:** `@provablehq/wasm` is excluded from Vite's `optimizeDeps.exclude`. The SDK client is created on-demand via `sdkStore.initializeClient()`, not at import time.
3. **Dynamic imports:** `WalletProvider.tsx` uses `await import('@provablehq/sdk')` inside async functions rather than top-level imports.

### 8.4 SDK Store Health Checks

On app load, `sdkStore.initializeClient()` creates the SDK client. A 30-second interval runs `checkHealth()` to monitor facilitator availability.

---

## 9. Transaction Flows

### 9.1 Agent Registration

```
User fills form (service type, endpoint URL, bond amount)
  → buildRegisterAgentInputs() formats Leo inputs
  → signTransaction('shadow_agent.aleo', 'register_agent', inputs, fee)
  → ProgramManager.execute() builds & broadcasts tx
  → Poll for confirmation (up to 60 seconds)
  → Update agentStore.setRegistered(true, agentId)
```

### 9.2 Escrow Payment (x402 Flow)

```
Client clicks "Request Service" on AgentDetails
  → Enters payment amount
  → createEscrow(agent_id, microcredits, description)
  → signTransaction('shadow_agent.aleo', 'create_escrow', inputs, fee)
  → EscrowRecord created (status: Locked)
  → Agent delivers service, reveals secret
  → claim_escrow releases payment
```

### 9.3 Rating Submission

```
Client submits rating (1-5 stars)
  → Burns 0.5 credits (RATING_BURN_COST)
  → Nullifier generated from client hash + job hash
  → signTransaction('shadow_agent.aleo', 'submit_rating', inputs, fee)
  → RatingRecord created, nullifier stored (prevents double-rating)
```

---

## 10. Deployment Status

### 10.1 Smart Contract

| Field | Value |
|-------|-------|
| Program | `shadow_agent.aleo` |
| Network | Aleo Testnet |
| Deploy TX | `at105knrkmfhsc8mlzd3sz5nmk2vy4jnsjdktdwq4fr236jcssasvpqp2sv9p` |
| Constructor | `@noupgrade` (immutable) |

### 10.2 Verified Transitions

| Transition | TX ID | Status |
|-----------|-------|--------|
| `register_agent` | `at1hr25c...qzgp` | Confirmed |
| `create_escrow` | `at197amq...efpp` | Confirmed |
| `submit_rating` | `at1qv5p2...agqv` | Confirmed |
| `transfer_public` (manual tx) | `at1yatm4...d9a6l` | Confirmed |
| `transfer_public` (SDK fix) | `at1wepwc...g30ke` | Confirmed |
| `transfer_public` (E2E test) | `at1f9exl...s6ukw` | Confirmed |
| `transfer_public` (full suite) | `at1ds7vz...dy3pj6` | Confirmed |

### 10.3 On-Chain State

| Mapping | Verified |
|---------|----------|
| `registered_agents` | Agent registration check |
| `agent_listings` | Public listing query |
| `used_nullifiers` | Sybil resistance (double-rating prevention) |

---

## 11. Build and Run

```bash
# Development (with hot reload)
npm run dev

# Type check
npm run typecheck

# Production build
npm run build

# Preview production build
npm run preview

# Lint
npm run lint
npm run lint:fix
```

### Production Build Output

```
dist/index.html                    0.87 kB
dist/assets/aleo_wasm-*.wasm      19,084 kB  (Aleo WASM module)
dist/assets/index-*.css               43 kB  (gzip: 8 kB)
dist/assets/index-*.js               265 kB  (gzip: 78 kB)
dist/assets/browser-*.js             194 kB  (gzip: 37 kB)
```

---

*End of Frontend Implementation Guide*
