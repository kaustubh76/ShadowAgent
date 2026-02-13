# ShadowAgent - Deployment Status

> For the complete 10-phase project overview, see [00_Project_Overview_10_Phase_Plan.md](00_Project_Overview_10_Phase_Plan.md).

## Deployed Contracts (Aleo Testnet)

| Contract | Program ID |
|----------|------------|
| ShadowAgent Core | `shadow_agent.aleo` |
| ShadowAgent Extension (Phase 10a) | `shadow_agent_ext.aleo` |

## Core Contract Deployment

| Field | Value |
|-------|-------|
| Program ID | `shadow_agent.aleo` |
| Deploy TX | `at105knrkmfhsc8mlzd3sz5nmk2vy4jnsjdktdwq4fr236jcssasvpqp2sv9p` |
| Constructor | `@noupgrade` (immutable) |
| Network | Aleo Testnet |
| Deployment Date | January 2025 (Hackathon MVP) |

## Extension Contract Deployment

| Field | Value |
|-------|-------|
| Program ID | `shadow_agent_ext.aleo` |
| Deploy TX | `at1fpwhdvs77vn37ngxrnty40qxsnwwuccu660e73f409nssjk3vyqqxpx647` |
| Constructor | `@noupgrade` (immutable) |
| Network | Aleo Testnet |
| Deployment Date | Phase 10a (Foundation Hardening) |

## Verified Transitions (Core)

| Transition | Transaction ID | Status |
|------------|---------------|--------|
| `register_agent` | `at1hr25c...qzgp` | Confirmed |
| `create_escrow` | `at197amq...efpp` | Confirmed |
| `submit_rating` | `at1qv5p2...agqv` | Confirmed |

## On-Chain Mappings

| Contract | Mapping | Key Type | Value Type | Purpose |
|----------|---------|----------|------------|---------|
| Core | `registered_agents` | `address` | `boolean` | Agent registration check (1 per address) |
| Core | `agent_listings` | `field` | `PublicListing` | Public agent listing data |
| Core | `used_nullifiers` | `field` | `boolean` | Sybil resistance (prevents double-rating) |
| Extension | `active_disputes` | `field` | `boolean` | Track open disputes by job hash |

## Records (Private State)

### Core Contract Records (5)

| Record | Fields | Purpose |
|--------|--------|---------|
| `AgentReputation` | `agent_id`, `total_jobs`, `total_rating_points`, `total_revenue`, `tier` | Agent's private reputation data |
| `AgentBond` | `agent_id`, `amount`, `staked_at` | Registration bond (returned on unregister) |
| `RatingRecord` | `client_nullifier`, `job_hash`, `rating`, `payment_amount`, `burn_proof` | Rating submission receipt |
| `ReputationProof` | `proof_type`, `threshold_met`, `tier_proven` | ZK proof of reputation |
| `EscrowRecord` | `agent`, `amount`, `job_hash`, `deadline`, `secret_hash`, `status` | HTLC escrow payment |

### Extension Contract Records (4)

| Record | Fields | Purpose |
|--------|--------|---------|
| `SplitEscrowRecord` | `agent`, `client`, `total_amount`, `agent_amount`, `client_amount`, `job_hash`, `status` | Partial refund split tracking |
| `DisputeRecord` | `client`, `agent`, `job_hash`, `escrow_amount`, `client_evidence_hash`, `agent_evidence_hash`, `status`, `resolution_agent_pct`, `opened_at` | Dispute lifecycle state |
| `DecayedReputationProof` | `agent_id`, `effective_rating_points`, `total_jobs`, `decay_periods`, `proof_type`, `threshold_met`, `generated_at` | Decay-adjusted reputation ZK proof |
| `MultiSigEscrowRecord` | `agent`, `amount`, `job_hash`, `deadline`, `secret_hash`, `signer_1/2/3`, `required_sigs`, `sig_count`, `sig_1/2/3_approved`, `status` | Multi-signature escrow payment |

## Contract Functions

### Core Contract Functions (12)

| Function | Type | Description |
|----------|------|-------------|
| `register_agent` | Public + Finalize | Register as agent with bond (min 10 credits) |
| `unregister_agent` | Public + Finalize | Unregister and reclaim bond |
| `submit_rating` | Public + Finalize | Rate an agent (burns 0.5 credits, nullifier check) |
| `update_listing` | Public + Finalize | Update agent's public listing |
| `update_reputation` | Private | Update agent reputation with rating |
| `create_escrow` | Private | Create HTLC escrow payment to agent |
| `claim_escrow` | Private | Agent claims escrow by revealing secret |
| `refund_escrow` | Private | Client refunds expired escrow |
| `prove_tier` | Private | ZK prove tier >= threshold |
| `prove_jobs` | Private | ZK prove jobs >= threshold |
| `prove_rating` | Private | ZK prove average rating >= threshold |
| `prove_revenue_range` | Private | ZK prove revenue within range |

### Extension Contract Functions (11) — Phase 10a

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

**Total:** 23 contract transitions (12 core + 11 extension), 4 mappings, 9 records

## Network Configuration

| Setting | Value |
|---------|-------|
| Network | Aleo Testnet |
| RPC | `https://api.explorer.provable.com/v1` |
| Explorer | `https://explorer.aleo.org` |

> **Note:** The `@provablehq/sdk` internally appends the network path (e.g., `/testnet`) to the base RPC URL when making API calls. Application code should use the base URL as shown above.
