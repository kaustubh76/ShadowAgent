# ShadowAgent - Deployment Status

> For the complete 10-phase project overview, see [00_Project_Overview_10_Phase_Plan.md](00_Project_Overview_10_Phase_Plan.md).

## Deployed Contracts (Aleo Testnet)

| Contract | Program ID |
|----------|------------|
| ShadowAgent Core | `shadow_agent.aleo` |

## Deployment Transaction

| Field | Value |
|-------|-------|
| Program ID | `shadow_agent.aleo` |
| Deploy TX | `at105knrkmfhsc8mlzd3sz5nmk2vy4jnsjdktdwq4fr236jcssasvpqp2sv9p` |
| Constructor | `@noupgrade` (immutable) |
| Network | Aleo Testnet |
| Deployment Date | January 2025 (Hackathon MVP) |

## Verified Transitions

| Transition | Transaction ID | Status |
|------------|---------------|--------|
| `register_agent` | `at1hr25c...qzgp` | Confirmed |
| `create_escrow` | `at197amq...efpp` | Confirmed |
| `submit_rating` | `at1qv5p2...agqv` | Confirmed |

## On-Chain Mappings

| Mapping | Key Type | Value Type | Purpose |
|---------|----------|------------|---------|
| `registered_agents` | `address` | `boolean` | Agent registration check (1 per address) |
| `agent_listings` | `field` | `PublicListing` | Public agent listing data |
| `used_nullifiers` | `field` | `boolean` | Sybil resistance (prevents double-rating) |

## Records (Private State)

| Record | Fields | Purpose |
|--------|--------|---------|
| `AgentReputation` | `agent_id`, `total_jobs`, `total_rating_points`, `total_revenue`, `tier` | Agent's private reputation data |
| `AgentBond` | `agent_id`, `amount`, `staked_at` | Registration bond (returned on unregister) |
| `RatingRecord` | `client_nullifier`, `job_hash`, `rating`, `payment_amount`, `burn_proof` | Rating submission receipt |
| `ReputationProof` | `proof_type`, `threshold_met`, `tier_proven` | ZK proof of reputation |
| `EscrowRecord` | `agent`, `amount`, `job_hash`, `deadline`, `secret_hash`, `status` | HTLC escrow payment |
| `PaymentSession` | `agent`, `session_id`, `max_total`, `max_per_request`, `rate_limit`, `spent`, `valid_until`, `status` | Pre-authorized spending session |
| `SpendingPolicy` | `policy_id`, `max_session_value`, `allowed_tiers`, `allowed_categories`, `require_proofs` | Reusable session authorization |
| `SessionReceipt` | `session_id`, `request_hash`, `amount` | Per-request settlement receipt |

## Contract Functions

### Core Functions (12)

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

### Session Functions (6)

| Function | Type | Description |
|----------|------|-------------|
| `create_session` | Private | Create pre-authorized spending session with bounds |
| `session_request` | Private | Agent claims within session bounds (no client signature) |
| `settle_session` | Private | Batch settle up to 100 session receipts |
| `close_session` | Private | Close session and refund unused funds |
| `pause_session` | Private | Temporarily suspend an active session |
| `resume_session` | Private | Reactivate a paused session |

**Total:** 18 contract functions (12 core + 6 session)

## Network Configuration

| Setting | Value |
|---------|-------|
| Network | Aleo Testnet |
| RPC | `https://api.explorer.provable.com/v1` |
| Explorer | `https://explorer.aleo.org` |

> **Note:** The `@provablehq/sdk` internally appends the network path (e.g., `/testnet`) to the base RPC URL when making API calls. Application code should use the base URL as shown above.
