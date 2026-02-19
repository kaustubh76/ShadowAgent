# ShadowAgent Smart Contract Implementation Guide

## Overview

This document provides step-by-step implementation instructions for the ShadowAgent Leo smart contract. The existing documentation describes WHAT to build; this guide explains HOW to build it.

---

## 1. Project Setup

### 1.1 Initialize Leo Project

```bash
# Install Leo (if not already installed)
curl -sSf https://install.leo-lang.org | sh

# Create new project
leo new shadow_agent
cd shadow_agent

# Verify installation
leo --version  # Should be >= 1.12.0
```

### 1.2 Project Structure

```
shadow_agent/
├── src/
│   └── main.leo          # Main contract
├── build/                # Compiled artifacts (generated)
├── inputs/               # Test inputs
│   └── shadow_agent.in
├── outputs/              # Test outputs (generated)
├── program.json          # Program manifest
└── README.md
```

### 1.3 Configure program.json

```json
{
  "program": "shadow_agent.aleo",
  "version": "0.1.0",
  "description": "Privacy-preserving AI agent marketplace",
  "license": "MIT"
}
```

---

## 2. Implementation Order

The contract must be implemented in a specific order due to dependencies:

```
Phase 1: Data Structures (Records + Structs)
    ↓
Phase 2: Constants
    ↓
Phase 3: Helper Functions
    ↓
Phase 4: Core Transitions (register, rating, reputation)
    ↓
Phase 5: Proof Transitions
    ↓
Phase 6: Escrow System
```

---

## 3. Phase 1: Data Structures

### 3.1 AgentReputation Record

**Implementation Notes:**
- This is the core record that agents own
- Uses u64 for counters to prevent overflow in production
- `tier` is computed, not stored directly from input

```leo
// src/main.leo

program shadow_agent.aleo {

    // Agent's cumulative reputation (private to agent)
    record AgentReputation {
        owner: address,
        agent_id: field,              // Derived from owner address
        total_jobs: u64,              // Counter, increments only
        total_rating_points: u64,     // Sum of ratings (scaled x10)
        total_revenue: u64,           // Lifetime earnings (microcents)
        tier: u8,                     // 0-4, computed from thresholds
        created_at: u64,              // Block of registration
        last_updated: u64             // Block of last job
    }
```

**Known Issues to Handle:**
- `block.height` returns u32 in Leo, but we store as u64 for future compatibility
- Cast required: `block.height as u64`

### 3.2 RatingRecord

**Implementation Notes:**
- Owned by agent (transferred from client on creation)
- `client_nullifier` prevents same client rating same job twice
- `rating` is 1-50 (multiply by 10 for 0.1-5.0 stars)

```leo
    // Rating from client (consumed to update reputation)
    record RatingRecord {
        owner: address,               // Agent address
        client_nullifier: field,      // Hash(caller + job_hash)
        job_hash: field,              // Unique job ID
        rating: u8,                   // 1-50 scaled
        payment_amount: u64,          // Job payment
        burn_proof: field,            // Proof of burn
        timestamp: u64
    }
```

### 3.3 EscrowRecord

```leo
    // HTLC escrow for fair exchange
    record EscrowRecord {
        owner: address,               // Current owner (client -> agent)
        agent: address,               // Service provider
        amount: u64,                  // Locked amount
        job_hash: field,              // Links to rating
        deadline: u64,                // Timeout block
        secret_hash: field,           // Hash of secret
        status: u8                    // 0=Locked, 1=Released, 2=Refunded
    }
```

### 3.4 ReputationProof Record

```leo
    // Shareable ZK proof output
    record ReputationProof {
        owner: address,
        proof_type: u8,               // 1=Rating, 2=Jobs, 3=Revenue, 4=Tier
        threshold_met: bool,
        tier_proven: u8,
        generated_at: u64
    }
```

### 3.5 PublicListing Struct

**Implementation Notes:**
- `struct` (not `record`) because it's stored in public mapping
- Contains only data safe to expose publicly

```leo
    // Public discovery data (stored in mapping)
    struct PublicListing {
        agent_id: field,
        service_type: u8,             // 1=NLP, 2=Vision, etc.
        endpoint_hash: field,         // Hash of service URL
        min_tier: u8,                 // Proven tier
        is_active: bool
    }
```

---

## 4. Phase 2: Mappings and Constants

### 4.1 Mappings

```leo
    // Public registry for discovery
    mapping agent_listings: field => PublicListing;

    // Nullifier registry (double-rating prevention)
    mapping used_nullifiers: field => bool;

    // Registered agents tracking (Sybil resistance)
    mapping registered_agents: address => bool;
```

### 4.2 Constants

**Implementation Notes:**
- All monetary values in microcents (1 cent = 10,000 microcents)
- Burn cost in microcredits (1 credit = 1,000,000 microcredits)

```leo
    // Economic parameters
    const RATING_BURN_COST: u64 = 500000u64;      // 0.5 credits
    const MIN_PAYMENT_FOR_RATING: u64 = 100000u64; // $0.10
    const REGISTRATION_BOND: u64 = 10000000u64;   // 10 credits (Sybil resistance)

    // Tier thresholds
    const BRONZE_JOBS: u64 = 10u64;
    const BRONZE_REVENUE: u64 = 10000000u64;       // $100

    const SILVER_JOBS: u64 = 50u64;
    const SILVER_REVENUE: u64 = 100000000u64;      // $1,000

    const GOLD_JOBS: u64 = 200u64;
    const GOLD_REVENUE: u64 = 1000000000u64;       // $10,000

    const DIAMOND_JOBS: u64 = 1000u64;
    const DIAMOND_REVENUE: u64 = 10000000000u64;   // $100,000
```

---

## 5. Phase 3: Helper Functions

### 5.1 Tier Calculation

**Implementation Notes:**
- Use nested if-else (Leo doesn't support switch)
- Check from highest tier down
- Both jobs AND revenue must meet threshold

```leo
    // Calculate tier from cumulative stats
    function calculate_tier(jobs: u64, revenue: u64) -> u8 {
        // Diamond: 1000+ jobs AND $100k+ revenue
        if (jobs >= DIAMOND_JOBS && revenue >= DIAMOND_REVENUE) {
            return 4u8;
        }
        // Gold: 200+ jobs AND $10k+ revenue
        if (jobs >= GOLD_JOBS && revenue >= GOLD_REVENUE) {
            return 3u8;
        }
        // Silver: 50+ jobs AND $1k+ revenue
        if (jobs >= SILVER_JOBS && revenue >= SILVER_REVENUE) {
            return 2u8;
        }
        // Bronze: 10+ jobs AND $100+ revenue
        if (jobs >= BRONZE_JOBS && revenue >= BRONZE_REVENUE) {
            return 1u8;
        }
        // New: Default tier
        return 0u8;
    }
```

---

## 6. Phase 4: Core Transitions

### 6.1 Agent Registration (Stake-to-Participate)

**Implementation Notes:**
- Requires registration bond (10 credits minimum) for Sybil resistance
- Creates both private AgentReputation AND AgentBond records, plus public listing
- Each address can only register once (prevents multiple agents per wallet)
- Bond is returned when agent unregisters
- Uses `then finalize` pattern for mapping writes

```leo
    // Agent bond record for stake tracking
    record AgentBond {
        owner: address,
        agent_id: field,
        amount: u64,
        staked_at: u64
    }

    transition register_agent(
        private service_type: u8,
        private endpoint_hash: field,
        private bond_amount: u64
    ) -> (AgentReputation, AgentBond) {
        // Validate bond meets minimum (Sybil resistance)
        assert(bond_amount >= REGISTRATION_BOND);

        // Generate deterministic agent_id from caller
        let agent_id: field = BHP256::hash_to_field(self.caller);

        // Create initial reputation (all zeros)
        let reputation: AgentReputation = AgentReputation {
            owner: self.caller,
            agent_id: agent_id,
            total_jobs: 0u64,
            total_rating_points: 0u64,
            total_revenue: 0u64,
            tier: 0u8,
            created_at: block.height as u64,
            last_updated: block.height as u64
        };

        // Create bond record
        let bond: AgentBond = AgentBond {
            owner: self.caller,
            agent_id: agent_id,
            amount: bond_amount,
            staked_at: block.height as u64
        };

        // Create public listing
        let listing: PublicListing = PublicListing {
            agent_id: agent_id,
            service_type: service_type,
            endpoint_hash: endpoint_hash,
            min_tier: 0u8,
            is_active: true
        };

        // Return records, execute finalize
        return (reputation, bond) then finalize(
            self.caller,
            agent_id,
            listing
        );
    }

    finalize register_agent(
        caller: address,
        agent_id: field,
        listing: PublicListing
    ) {
        // Check address not already registered
        let already_registered: bool = Mapping::get_or_use(
            registered_agents,
            caller,
            false
        );
        assert(!already_registered);

        // Mark address as registered (Sybil resistance)
        Mapping::set(registered_agents, caller, true);

        // Store public listing
        Mapping::set(agent_listings, agent_id, listing);
    }
```

**Testing This Transition:**

```bash
# Create test input in inputs/shadow_agent.in
echo "[register_agent]
service_type: 1u8
endpoint_hash: 123field
bond_amount: 10000000u64" > inputs/shadow_agent.in

# Run test (10 credits = 10000000 microcredits)
leo run register_agent 1u8 123field 10000000u64
```

### 6.1.1 Unregister Agent (Reclaim Bond)

**Implementation Notes:**
- Agent calls to unregister and reclaim staked bond
- Both reputation and bond records must be owned by caller
- Listing is marked inactive, address can re-register later

```leo
    transition unregister_agent(
        private reputation: AgentReputation,
        private bond: AgentBond
    ) -> AgentBond {
        // Verify caller owns both records
        assert_eq(self.caller, reputation.owner);
        assert_eq(self.caller, bond.owner);
        assert_eq(reputation.agent_id, bond.agent_id);

        // Create inactive listing
        let listing: PublicListing = PublicListing {
            agent_id: reputation.agent_id,
            service_type: 0u8,
            endpoint_hash: 0field,
            min_tier: 0u8,
            is_active: false
        };

        // Return the bond (agent can now spend it)
        return bond then finalize(self.caller, reputation.agent_id, listing);
    }

    finalize unregister_agent(
        caller: address,
        agent_id: field,
        listing: PublicListing
    ) {
        // Mark as unregistered (allows re-registration)
        Mapping::set(registered_agents, caller, false);

        // Update listing to inactive
        Mapping::set(agent_listings, agent_id, listing);
    }
```

### 6.2 Submit Rating

**Implementation Notes:**
- Client calls this to rate an agent
- Burns credits for Sybil resistance
- Creates RatingRecord owned by agent

```leo
    transition submit_rating(
        private agent_address: address,
        private job_hash: field,
        private rating: u8,
        private payment_amount: u64,
        private burn_amount: u64
    ) -> RatingRecord {
        // Validate rating range (1-50 = 0.1 to 5.0 stars)
        assert(rating >= 1u8);
        assert(rating <= 50u8);

        // Validate minimum payment
        assert(payment_amount >= MIN_PAYMENT_FOR_RATING);

        // Validate burn amount
        assert(burn_amount >= RATING_BURN_COST);

        // Generate nullifier to prevent double-rating
        // Note: In Leo, address + field concatenation for hash
        let client_nullifier: field = BHP256::hash_to_field(
            self.caller
        ) + BHP256::hash_to_field(job_hash);

        // Generate burn proof (simplified)
        let burn_proof: field = BHP256::hash_to_field(burn_amount);

        // Create rating record owned by agent
        return RatingRecord {
            owner: agent_address,
            client_nullifier: client_nullifier,
            job_hash: job_hash,
            rating: rating,
            payment_amount: payment_amount,
            burn_proof: burn_proof,
            timestamp: block.height as u64
        } then finalize(client_nullifier, burn_amount);
    }

    finalize submit_rating(
        client_nullifier: field,
        burn_amount: u64
    ) {
        // Check nullifier not used
        let nullifier_used: bool = Mapping::get_or_use(
            used_nullifiers,
            client_nullifier,
            false
        );
        assert(!nullifier_used);

        // Mark nullifier as used
        Mapping::set(used_nullifiers, client_nullifier, true);

        // Note: Actual credit burn would integrate with credits.aleo
        // For hackathon, burn_amount validation in transition suffices
    }
```

### 6.3 Update Reputation

**Implementation Notes:**
- Agent calls this to incorporate a rating
- Consumes RatingRecord (cannot be reused)
- O(1) complexity - just adds to cumulative totals

```leo
    transition update_reputation(
        private current_rep: AgentReputation,
        private new_rating: RatingRecord
    ) -> AgentReputation {
        // Verify rating belongs to this agent
        assert_eq(new_rating.owner, current_rep.owner);

        // Update cumulative stats (O(1) - no loops!)
        let new_jobs: u64 = current_rep.total_jobs + 1u64;
        let new_points: u64 = current_rep.total_rating_points
                             + (new_rating.rating as u64);
        let new_revenue: u64 = current_rep.total_revenue
                              + new_rating.payment_amount;

        // Calculate new tier
        let new_tier: u8 = calculate_tier(new_jobs, new_revenue);

        // Return updated record (old record is consumed)
        return AgentReputation {
            owner: current_rep.owner,
            agent_id: current_rep.agent_id,
            total_jobs: new_jobs,
            total_rating_points: new_points,
            total_revenue: new_revenue,
            tier: new_tier,
            created_at: current_rep.created_at,
            last_updated: block.height as u64
        };
    }
```

---

## 7. Phase 5: Proof Transitions

### 7.1 Prove Rating

**Implementation Notes:**
- Public input: minimum rating threshold
- Private input: actual reputation record
- Output: proof that threshold is met

```leo
    transition prove_rating(
        private reputation: AgentReputation,
        public min_rating: u8
    ) -> ReputationProof {
        // Calculate average (scaled x10 for precision)
        // Example: 470 points / 100 jobs = 4.7 stars
        let avg_rating: u64 = (reputation.total_rating_points * 10u64)
                              / reputation.total_jobs;

        // Assert threshold met (fails if not)
        assert(avg_rating >= (min_rating as u64));

        return ReputationProof {
            owner: reputation.owner,
            proof_type: 1u8,
            threshold_met: true,
            tier_proven: reputation.tier,
            generated_at: block.height as u64
        };
    }
```

### 7.2 Prove Jobs

```leo
    transition prove_jobs(
        private reputation: AgentReputation,
        public min_jobs: u64
    ) -> ReputationProof {
        assert(reputation.total_jobs >= min_jobs);

        return ReputationProof {
            owner: reputation.owner,
            proof_type: 2u8,
            threshold_met: true,
            tier_proven: reputation.tier,
            generated_at: block.height as u64
        };
    }
```

### 7.3 Prove Revenue Range

**Implementation Notes:**
- Range proof provides extra privacy
- Agent proves revenue is between min and max
- Client learns "revenue is $10k-$50k" not exact amount

```leo
    transition prove_revenue_range(
        private reputation: AgentReputation,
        public min_revenue: u64,
        public max_revenue: u64
    ) -> ReputationProof {
        assert(reputation.total_revenue >= min_revenue);
        assert(reputation.total_revenue <= max_revenue);

        return ReputationProof {
            owner: reputation.owner,
            proof_type: 3u8,
            threshold_met: true,
            tier_proven: reputation.tier,
            generated_at: block.height as u64
        };
    }
```

### 7.4 Prove Tier

```leo
    transition prove_tier(
        private reputation: AgentReputation,
        public required_tier: u8
    ) -> ReputationProof {
        assert(reputation.tier >= required_tier);

        return ReputationProof {
            owner: reputation.owner,
            proof_type: 4u8,
            threshold_met: true,
            tier_proven: reputation.tier,
            generated_at: block.height as u64
        };
    }
```

---

## 8. Phase 6: Escrow System

### 8.1 Create Escrow

**Implementation Notes:**
- Client creates escrow BEFORE requesting service
- secret_hash provided by agent in HTTP 402 response
- deadline calculated as current block + timeout

```leo
    transition create_escrow(
        private agent: address,
        private amount: u64,
        private job_hash: field,
        private secret_hash: field,
        private blocks_until_deadline: u64
    ) -> EscrowRecord {
        // Calculate absolute deadline
        let deadline: u64 = (block.height as u64) + blocks_until_deadline;

        return EscrowRecord {
            owner: self.caller,       // Client owns initially
            agent: agent,
            amount: amount,
            job_hash: job_hash,
            deadline: deadline,
            secret_hash: secret_hash,
            status: 0u8               // Locked
        };
    }
```

### 8.2 Claim Escrow

**Implementation Notes:**
- Agent reveals secret to claim payment
- Secret must hash to secret_hash
- Must be before deadline

```leo
    transition claim_escrow(
        private escrow: EscrowRecord,
        private secret: field
    ) -> EscrowRecord {
        // Verify secret matches hash
        let computed_hash: field = BHP256::hash_to_field(secret);
        assert_eq(computed_hash, escrow.secret_hash);

        // Verify caller is the agent
        assert_eq(self.caller, escrow.agent);

        // Verify not expired
        assert((block.height as u64) <= escrow.deadline);

        // Verify still locked
        assert_eq(escrow.status, 0u8);

        // Transfer ownership to agent
        return EscrowRecord {
            owner: escrow.agent,      // Agent now owns
            agent: escrow.agent,
            amount: escrow.amount,
            job_hash: escrow.job_hash,
            deadline: escrow.deadline,
            secret_hash: escrow.secret_hash,
            status: 1u8               // Released
        };
    }
```

### 8.3 Refund Escrow

```leo
    transition refund_escrow(
        private escrow: EscrowRecord
    ) -> EscrowRecord {
        // Verify caller is original owner
        assert_eq(self.caller, escrow.owner);

        // Verify deadline passed
        assert((block.height as u64) > escrow.deadline);

        // Verify still locked
        assert_eq(escrow.status, 0u8);

        return EscrowRecord {
            owner: escrow.owner,
            agent: escrow.agent,
            amount: escrow.amount,
            job_hash: escrow.job_hash,
            deadline: escrow.deadline,
            secret_hash: escrow.secret_hash,
            status: 2u8               // Refunded
        };
    }
}
```

---

## 9. Phase 7: Session-Based Payments

> **10-Phase Plan Mapping:** This section corresponds to **Phase 5 (Session-Based Payments)** in the [10-Phase Master Plan](00_Project_Overview_10_Phase_Plan.md). The "Phase 7" label here refers to the internal smart contract implementation order, not the project-level phase numbering.

> **Separate Contract:** Session-based payments are implemented as a **separate companion contract** `shadow_agent_session.aleo` (in the `shadow_agent_session/` directory), NOT as part of the core `shadow_agent.aleo`. The session contract has 8 transitions, 1 mapping, and 3 records.

Session-based payments solve the micropayment UX problem: "1000 API calls = 1000 wallet signatures" becomes "1 signature, unlimited requests within bounds."

### 9.0 Session Contract Constants and Mapping

```leo
program shadow_agent_session.aleo {
    // Constants
    const RATE_WINDOW_BLOCKS: u64 = 100u64;    // ~10 minutes at 6s/block
    const STATUS_ACTIVE: u8 = 0u8;
    const STATUS_PAUSED: u8 = 1u8;
    const STATUS_CLOSED: u8 = 2u8;
    const BLOCK_TOLERANCE: u64 = 10u64;        // Allowed delta for claimed block height

    // Hash input structs (BHP256 does NOT accept tuples)
    struct SessionIdInput {
        caller: address,
        agent: address,
        current_blk: u64,
    }

    struct PolicyIdInput {
        caller: address,
        current_blk: u64,
    }

    // Mapping
    mapping active_sessions: field => bool;     // Track active session IDs
}
```

### 9.1 Session Records

```leo
    // Payment session for autonomous spending
    record PaymentSession {
        owner: address,               // Client (human or AI agent)
        agent: address,               // Authorized service provider
        session_id: field,            // Unique identifier
        max_total: u64,               // Maximum total spend (microcents)
        max_per_request: u64,         // Per-request cap
        rate_limit: u64,              // Max requests per rate window
        spent: u64,                   // Running total spent
        request_count: u64,           // Requests in current window
        window_start: u64,            // Rate limit window start block
        valid_until: u64,             // Expiry block height
        status: u8                    // 0=Active, 1=Paused, 2=Closed
    }

    // Session receipt for off-chain tracking
    record SessionReceipt {
        owner: address,               // Agent (receives payment)
        session_id: field,
        request_hash: field,          // Unique request identifier
        amount: u64,
        timestamp: u64
    }

    // Reusable spending policy
    record SpendingPolicy {
        owner: address,
        policy_id: field,
        max_session_value: u64,
        max_single_request: u64,
        allowed_tiers: u8,            // Bitfield: which agent tiers
        allowed_categories: u64,      // Bitfield: service types
        require_proofs: bool,
        created_at: u64
    }
```

### 9.2 Create Session

**Implementation Notes:**
- Client creates session with pre-authorized spending bounds
- Funds are locked but not transferred yet
- Returns session record that can be used for unlimited requests within bounds

```leo
    transition create_session(
        private agent: address,
        private max_total: u64,
        private max_per_request: u64,
        private rate_limit: u64,
        private duration_blocks: u64
    ) -> PaymentSession {
        // Validate bounds
        assert(max_total > 0u64);
        assert(max_per_request > 0u64);
        assert(max_per_request <= max_total);

        // Generate unique session ID
        let session_id: field = BHP256::hash_to_field(self.caller)
            + BHP256::hash_to_field(agent)
            + BHP256::hash_to_field(block.height as u64);

        // Calculate expiry
        let valid_until: u64 = (block.height as u64) + duration_blocks;

        return PaymentSession {
            owner: self.caller,
            agent: agent,
            session_id: session_id,
            max_total: max_total,
            max_per_request: max_per_request,
            rate_limit: rate_limit,
            spent: 0u64,
            request_count: 0u64,
            window_start: block.height as u64,
            valid_until: valid_until,
            status: 0u8  // Active
        };
    }
```

### 9.3 Session Request (Off-Chain Validation)

**Implementation Notes:**
- This transition is called by the AGENT after validating the session off-chain
- Agent verifies session bounds locally, then records the request
- No client signature required - the session record IS the authorization
- Returns updated session and receipt for batch settlement

```leo
    transition session_request(
        private session: PaymentSession,
        private amount: u64,
        private request_hash: field
    ) -> (PaymentSession, SessionReceipt) {
        // Verify caller is the authorized agent
        assert_eq(self.caller, session.agent);

        // Verify session is active
        assert_eq(session.status, 0u8);

        // Verify not expired
        assert((block.height as u64) < session.valid_until);

        // Verify amount within per-request limit
        assert(amount <= session.max_per_request);

        // Verify total within session limit
        let new_spent: u64 = session.spent + amount;
        assert(new_spent <= session.max_total);

        // Check rate limit (simplified - resets if window passed)
        let current_block: u64 = block.height as u64;
        let window_size: u64 = 100u64;  // 100 blocks per window

        let new_request_count: u64 = session.request_count + 1u64;
        let new_window_start: u64 = session.window_start;

        // Reset window if expired
        if (current_block >= session.window_start + window_size) {
            new_request_count = 1u64;
            new_window_start = current_block;
        }

        // Verify within rate limit
        assert(new_request_count <= session.rate_limit);

        // Create receipt for agent
        let receipt: SessionReceipt = SessionReceipt {
            owner: session.agent,
            session_id: session.session_id,
            request_hash: request_hash,
            amount: amount,
            timestamp: current_block
        };

        // Return updated session
        let updated_session: PaymentSession = PaymentSession {
            owner: session.owner,
            agent: session.agent,
            session_id: session.session_id,
            max_total: session.max_total,
            max_per_request: session.max_per_request,
            rate_limit: session.rate_limit,
            spent: new_spent,
            request_count: new_request_count,
            window_start: new_window_start,
            valid_until: session.valid_until,
            status: session.status
        };

        return (updated_session, receipt);
    }
```

### 9.4 Settle Session (Batch)

**Implementation Notes:**
- Agent calls this periodically to claim accumulated payments
- Can batch multiple receipts into single settlement
- Transfers funds from session to agent

```leo
    transition settle_session(
        private session: PaymentSession,
        private settlement_amount: u64
    ) -> PaymentSession {
        // Verify caller is the agent
        assert_eq(self.caller, session.agent);

        // Verify settlement doesn't exceed spent
        assert(settlement_amount <= session.spent);

        // In production, this would transfer actual credits
        // For hackathon, just return updated session

        return PaymentSession {
            owner: session.owner,
            agent: session.agent,
            session_id: session.session_id,
            max_total: session.max_total,
            max_per_request: session.max_per_request,
            rate_limit: session.rate_limit,
            spent: session.spent,  // Spent stays same (already paid)
            request_count: session.request_count,
            window_start: session.window_start,
            valid_until: session.valid_until,
            status: session.status
        };
    }
```

### 9.5 Close Session

**Implementation Notes:**
- Client closes session to reclaim unused funds
- Returns refund record for the difference between max and spent

```leo
    transition close_session(
        private session: PaymentSession
    ) -> PaymentSession {
        // Verify caller is session owner
        assert_eq(self.caller, session.owner);

        // Can close active or paused sessions
        assert(session.status == 0u8 || session.status == 1u8);

        // Calculate refund (in production, transfer back to owner)
        let refund: u64 = session.max_total - session.spent;

        // Return closed session
        return PaymentSession {
            owner: session.owner,
            agent: session.agent,
            session_id: session.session_id,
            max_total: session.max_total,
            max_per_request: session.max_per_request,
            rate_limit: session.rate_limit,
            spent: session.spent,
            request_count: session.request_count,
            window_start: session.window_start,
            valid_until: session.valid_until,
            status: 2u8  // Closed
        };
    }
```

### 9.6 Pause/Resume Session

```leo
    transition pause_session(
        private session: PaymentSession
    ) -> PaymentSession {
        // Verify caller is session owner
        assert_eq(self.caller, session.owner);

        // Can only pause active sessions
        assert_eq(session.status, 0u8);

        return PaymentSession {
            owner: session.owner,
            agent: session.agent,
            session_id: session.session_id,
            max_total: session.max_total,
            max_per_request: session.max_per_request,
            rate_limit: session.rate_limit,
            spent: session.spent,
            request_count: session.request_count,
            window_start: session.window_start,
            valid_until: session.valid_until,
            status: 1u8  // Paused
        };
    }

    transition resume_session(
        private session: PaymentSession
    ) -> PaymentSession {
        // Verify caller is session owner
        assert_eq(self.caller, session.owner);

        // Can only resume paused sessions
        assert_eq(session.status, 1u8);

        // Verify not expired
        assert((block.height as u64) < session.valid_until);

        return PaymentSession {
            owner: session.owner,
            agent: session.agent,
            session_id: session.session_id,
            max_total: session.max_total,
            max_per_request: session.max_per_request,
            rate_limit: session.rate_limit,
            spent: session.spent,
            request_count: session.request_count,
            window_start: session.window_start,
            valid_until: session.valid_until,
            status: 0u8  // Active
        };
    }
```

### 9.7 Session Usage Summary

| Transition | Called By | Purpose | Signature Required |
|------------|-----------|---------|-------------------|
| `create_session` | Client | Initialize session with bounds | Yes (once) |
| `session_request` | Agent | Record request within session | No |
| `settle_session` | Agent | Claim accumulated payments | No (agent-initiated) |
| `close_session` | Client | End session, get refund | Yes |
| `pause_session` | Client | Temporarily disable | Yes |
| `resume_session` | Client | Re-enable paused session | Yes |
| `create_policy` | Client | Create reusable spending policy template | Yes |
| `create_session_from_policy` | Client | Create session bounded by existing policy | Yes |

**Key Insight:** The `session_request` transition requires no client signature because the session record itself IS the authorization. The agent validates bounds locally, then submits the transition. This enables:
- 1000 API calls with 1 signature (create_session)
- Off-chain validation for instant responses
- Batch settlement for gas efficiency

### 9.8 Policy Management

```leo
    // Create reusable spending policy
    transition create_policy(
        private max_session_value: u64,
        private max_single_request: u64,
        private allowed_tiers: u8,
        private allowed_categories: u64,
        private require_proofs: bool,
        private current_block: u64,
    ) -> SpendingPolicy {
        let input: PolicyIdInput = PolicyIdInput {
            caller: self.caller,
            current_blk: current_block,
        };
        let policy_id: field = BHP256::hash_to_field(input);

        return SpendingPolicy {
            owner: self.caller,
            policy_id: policy_id,
            max_session_value: max_session_value,
            max_single_request: max_single_request,
            allowed_tiers: allowed_tiers,
            allowed_categories: allowed_categories,
            require_proofs: require_proofs,
            created_at: current_block,
        };
    }

    // Create session bounded by policy constraints
    transition create_session_from_policy(
        private policy: SpendingPolicy,
        private agent: address,
        private max_total: u64,
        private max_per_request: u64,
        private rate_limit: u64,
        private duration_blocks: u64,
        private current_block: u64,
    ) -> (PaymentSession, SpendingPolicy) then finalize(/* session_id, current_block */) {
        // Validate session params against policy bounds
        assert(max_total <= policy.max_session_value);
        assert(max_per_request <= policy.max_single_request);
        // ... creates session + returns policy for reuse
    }
```

---

## 10. Complete Contract

The complete contract should be assembled in this order:
1. Program declaration
2. Records
3. Structs
4. Mappings
5. Constants
6. Functions
7. Transitions (Registration, Rating, Reputation, Proofs, Escrow, Sessions)

---

## 10. Build and Deploy

### 10.1 Local Testing

```bash
# Compile
leo build

# Run specific transition
leo run register_agent 1u8 123field 456field

# Run with custom inputs
leo run --input inputs/test_register.in
```

### 10.2 Deploy to Testnet

```bash
# Set environment
export PRIVATE_KEY="your_private_key"
export NETWORK="testnet"

# Deploy
snarkos developer deploy shadow_agent.aleo \
  --private-key $PRIVATE_KEY \
  --query "https://api.explorer.aleo.org/v1" \
  --broadcast "https://api.explorer.aleo.org/v1/testnet/transaction/broadcast" \
  --fee 1000000
```

### 10.3 Verify Deployment

```bash
# Check program exists
curl https://api.explorer.aleo.org/v1/testnet/program/shadow_agent.aleo
```

---

## 11. Common Implementation Issues

### 11.1 Type Casting

```leo
// Wrong: block.height is u32
let timestamp: u64 = block.height;

// Correct: explicit cast
let timestamp: u64 = block.height as u64;
```

### 11.2 Address Hashing

```leo
// Wrong: cannot directly hash address
let hash: field = BHP256::hash_to_field(self.caller + job_hash);

// Correct: hash separately then combine
let caller_hash: field = BHP256::hash_to_field(self.caller);
let job_hash_hash: field = BHP256::hash_to_field(job_hash);
let combined: field = caller_hash + job_hash_hash;
```

### 11.3 Division Safety

```leo
// Wrong: division by zero if no jobs
let avg: u64 = points / jobs;

// Correct: check for zero
assert(jobs > 0u64);
let avg: u64 = points / jobs;
```

### 11.4 Mapping Access in Finalize

```leo
// Wrong: cannot use Mapping::get in transition
let value = Mapping::get(my_mapping, key);

// Correct: Mapping access only in finalize
finalize my_function(key: field) {
    let value: bool = Mapping::get_or_use(my_mapping, key, false);
}
```

---

## 12. Next Steps

After implementing the smart contract:

1. **Write Unit Tests** - See [05_Testing_Implementation.md](05_Testing_Implementation.md)
2. **Build Facilitator** - See [02_Facilitator_Implementation.md](02_Facilitator_Implementation.md)
3. **Create SDK** - See [03_SDK_Implementation.md](03_SDK_Implementation.md) (includes session-based payment support)
4. **Build Frontend** - See [04_Frontend_Implementation.md](04_Frontend_Implementation.md)
5. **Review Future Roadmap** - See [06_Future_Implementation_Plan.md](06_Future_Implementation_Plan.md) for session-based payments as Phase 2 priority

### Session-Based Payments Priority

The session-based payment system (Phase 7) solves the critical UX problem of micropayments at scale. This should be prioritized for production:

| Before Sessions | After Sessions |
|-----------------|----------------|
| 1000 API calls = 1000 signatures | 1000 API calls = 1 signature |
| Poor UX, high friction | "Sign once, spend within bounds" |
| Gas-inefficient | Batch settlement |
| Manual approval per request | Autonomous agent operation |

---

*End of Smart Contract Implementation Guide*
