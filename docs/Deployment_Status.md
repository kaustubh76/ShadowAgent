# ShadowAgent - Deployment Status

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

## Contract Functions

| Function | Type | Description |
|----------|------|-------------|
| `register_agent` | Public + Finalize | Register as agent with bond (min 10 credits) |
| `submit_rating` | Public + Finalize | Rate an agent (burns 0.5 credits, nullifier check) |
| `create_escrow` | Private | Create HTLC escrow payment to agent |
| `claim_escrow` | Private | Agent claims escrow by revealing secret |
| `refund_escrow` | Private | Client refunds expired escrow |
| `update_reputation` | Private | Update agent reputation with rating |
| `prove_tier` | Private | ZK prove tier >= threshold |
| `prove_jobs` | Private | ZK prove jobs >= threshold |
| `prove_rating` | Private | ZK prove average rating >= threshold |
| `prove_revenue_range` | Private | ZK prove revenue within range |
| `update_listing` | Public + Finalize | Update agent's public listing |
| `unregister_agent` | Public + Finalize | Unregister and reclaim bond |

## Network Configuration

| Setting | Value |
|---------|-------|
| Network | Aleo Testnet |
| RPC | `https://api.explorer.provable.com/v1` |
| Explorer | `https://explorer.aleo.org` |
