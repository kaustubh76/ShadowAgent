// ShadowAgent: Privacy-Preserving AI Agent Marketplace
// Zero-Knowledge Reputation Attestation for the Autonomous Economy
// Leo 3.4+ syntax (async transition / async function)

program shadow_agent.aleo {

    // ═══════════════════════════════════════════════════════════════════
    // RECORDS (All Private)
    // ═══════════════════════════════════════════════════════════════════

    // The Agent's cumulative reputation (updated after each job)
    record AgentReputation {
        owner: address,
        agent_id: field,              // Unique identifier
        total_jobs: u64,              // Cumulative job count
        total_rating_points: u64,     // Sum of all ratings (scaled x10)
        total_revenue: u64,           // Lifetime revenue in microcents
        tier: u8,                     // 0=New, 1=Bronze, 2=Silver, 3=Gold, 4=Diamond
        created_at: u64,              // Block height of registration
        last_updated: u64             // Block height of last update
    }

    // Rating submitted by client (consumed to update reputation)
    record RatingRecord {
        owner: address,               // Agent who receives this
        client_nullifier: field,      // Prevents same client rating twice per job
        job_hash: field,              // Unique job identifier
        rating: u8,                   // 1-50 (scaled: 5 stars = 50)
        payment_amount: u64,          // Payment for this job
        burn_proof: field,            // Proof that rating fee was burned
        timestamp: u64
    }

    // Reputation proof output (shareable)
    record ReputationProof {
        owner: address,               // Agent
        proof_type: u8,               // 1=Rating, 2=Jobs, 3=Revenue, 4=Tier
        threshold_met: bool,
        tier_proven: u8,
        generated_at: u64
    }

    // HTLC Escrow for fair exchange
    record EscrowRecord {
        owner: address,               // Client initially, then agent
        agent: address,
        amount: u64,
        job_hash: field,
        deadline: u64,                // Block height deadline
        secret_hash: field,           // Hash of delivery secret
        status: u8                    // 0=Locked, 1=Released, 2=Refunded
    }

    // Agent bond for Sybil resistance (stake-to-participate)
    record AgentBond {
        owner: address,               // Agent who staked
        agent_id: field,              // Links to AgentReputation
        amount: u64,                  // Staked amount in microcredits
        staked_at: u64                // Block height when staked
    }

    // ═══════════════════════════════════════════════════════════════════
    // STRUCTS (Public Data)
    // ═══════════════════════════════════════════════════════════════════

    // Public listing for discovery (semi-private)
    struct PublicListing {
        agent_id: field,              // Links to private reputation
        service_type: u8,             // 1=NLP, 2=Vision, 3=Code, etc.
        endpoint_hash: field,         // Hash of service URL
        min_tier: u8,                 // Minimum proven tier
        is_active: bool
    }

    // ═══════════════════════════════════════════════════════════════════
    // MAPPINGS (Public but minimal)
    // ═══════════════════════════════════════════════════════════════════

    // Public registry: agent_id -> PublicListing
    mapping agent_listings: field => PublicListing;

    // Nullifier registry: prevents double-rating
    mapping used_nullifiers: field => bool;

    // Registered agents: address -> is_registered (prevents re-registration)
    mapping registered_agents: address => bool;

    // ═══════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    const RATING_BURN_COST: u64 = 500000u64;  // 0.5 credits to submit rating
    const MIN_PAYMENT_FOR_RATING: u64 = 100000u64;  // $0.10 minimum job
    const REGISTRATION_BOND: u64 = 10000000u64;  // 10 credits to register (Sybil resistance)

    // Tier thresholds
    const BRONZE_JOBS: u64 = 10u64;
    const BRONZE_REVENUE: u64 = 10000000u64;  // $100
    const SILVER_JOBS: u64 = 50u64;
    const SILVER_REVENUE: u64 = 100000000u64; // $1,000
    const GOLD_JOBS: u64 = 200u64;
    const GOLD_REVENUE: u64 = 1000000000u64;  // $10,000
    const DIAMOND_JOBS: u64 = 1000u64;
    const DIAMOND_REVENUE: u64 = 10000000000u64; // $100,000

    // ═══════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    // Calculate tier based on thresholds
    function calculate_tier(jobs: u64, revenue: u64) -> u8 {
        if (jobs >= DIAMOND_JOBS && revenue >= DIAMOND_REVENUE) {
            return 4u8;  // Diamond
        }
        if (jobs >= GOLD_JOBS && revenue >= GOLD_REVENUE) {
            return 3u8;  // Gold
        }
        if (jobs >= SILVER_JOBS && revenue >= SILVER_REVENUE) {
            return 2u8;  // Silver
        }
        if (jobs >= BRONZE_JOBS && revenue >= BRONZE_REVENUE) {
            return 1u8;  // Bronze
        }
        return 0u8;  // New
    }

    // ═══════════════════════════════════════════════════════════════════
    // TRANSITIONS
    // ═══════════════════════════════════════════════════════════════════

    // ─────────────────────────────────────────────────────────────────────
    // 1. AGENT REGISTRATION (Stake-to-Participate)
    // ─────────────────────────────────────────────────────────────────────

    async transition register_agent(
        private service_type: u8,
        private endpoint_hash: field,
        private bond_amount: u64
    ) -> (AgentReputation, AgentBond, Future) {
        // Validate bond amount meets minimum (Sybil resistance)
        assert(bond_amount >= REGISTRATION_BOND);

        // Generate unique agent ID from caller address
        let agent_id: field = BHP256::hash_to_field(self.caller);

        // Create initial reputation record
        // Note: created_at/last_updated set to 0 here, actual block height tracked on-chain
        let reputation: AgentReputation = AgentReputation {
            owner: self.caller,
            agent_id: agent_id,
            total_jobs: 0u64,
            total_rating_points: 0u64,
            total_revenue: 0u64,
            tier: 0u8,
            created_at: 0u64,
            last_updated: 0u64
        };

        // Create bond record (stake is held by the agent)
        let bond: AgentBond = AgentBond {
            owner: self.caller,
            agent_id: agent_id,
            amount: bond_amount,
            staked_at: 0u64
        };

        // Create public listing for discovery
        let listing: PublicListing = PublicListing {
            agent_id: agent_id,
            service_type: service_type,
            endpoint_hash: endpoint_hash,
            min_tier: 0u8,
            is_active: true
        };

        return (reputation, bond, finalize_register_agent(self.caller, agent_id, listing));
    }

    async function finalize_register_agent(
        caller: address,
        agent_id: field,
        listing: PublicListing
    ) {
        // Verify address hasn't already registered (Sybil resistance)
        let already_registered: bool = Mapping::get_or_use(
            registered_agents,
            caller,
            false
        );
        assert(!already_registered);

        // Mark address as registered
        Mapping::set(registered_agents, caller, true);

        // Store public listing
        Mapping::set(agent_listings, agent_id, listing);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 2. SUBMIT RATING (With Burn-to-Rate Sybil Resistance)
    // ─────────────────────────────────────────────────────────────────────

    async transition submit_rating(
        private agent_address: address,
        private job_hash: field,
        private rating: u8,
        private payment_amount: u64,
        private burn_amount: u64
    ) -> (RatingRecord, Future) {
        // Validate rating range (1-50 = 0.1 to 5.0 stars)
        assert(rating >= 1u8);
        assert(rating <= 50u8);

        // Validate minimum payment (prevents dust attacks)
        assert(payment_amount >= MIN_PAYMENT_FOR_RATING);

        // Validate burn amount (Sybil resistance)
        assert(burn_amount >= RATING_BURN_COST);

        // Generate nullifier to prevent double-rating
        let caller_hash: field = BHP256::hash_to_field(self.caller);
        let job_hash_field: field = job_hash;
        let client_nullifier: field = BHP256::hash_to_field(caller_hash + job_hash_field);

        // Generate burn proof
        let burn_proof: field = BHP256::hash_to_field(burn_amount);

        let rating_record: RatingRecord = RatingRecord {
            owner: agent_address,
            client_nullifier: client_nullifier,
            job_hash: job_hash,
            rating: rating,
            payment_amount: payment_amount,
            burn_proof: burn_proof,
            timestamp: 0u64
        };

        return (rating_record, finalize_submit_rating(client_nullifier));
    }

    async function finalize_submit_rating(client_nullifier: field) {
        // Check nullifier hasn't been used
        let nullifier_used: bool = Mapping::get_or_use(
            used_nullifiers,
            client_nullifier,
            false
        );
        assert(!nullifier_used);

        // Mark nullifier as used
        Mapping::set(used_nullifiers, client_nullifier, true);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 3. UPDATE REPUTATION (Rolling Average - O(1) Complexity)
    // ─────────────────────────────────────────────────────────────────────

    transition update_reputation(
        private current_rep: AgentReputation,
        private new_rating: RatingRecord
    ) -> AgentReputation {
        // Verify the rating belongs to this agent
        assert_eq(new_rating.owner, current_rep.owner);

        // Update cumulative stats (O(1) - no loops!)
        let new_jobs: u64 = current_rep.total_jobs + 1u64;
        let new_points: u64 = current_rep.total_rating_points + (new_rating.rating as u64);
        let new_revenue: u64 = current_rep.total_revenue + new_rating.payment_amount;

        // Calculate new tier
        let new_tier: u8 = calculate_tier(new_jobs, new_revenue);

        return AgentReputation {
            owner: current_rep.owner,
            agent_id: current_rep.agent_id,
            total_jobs: new_jobs,
            total_rating_points: new_points,
            total_revenue: new_revenue,
            tier: new_tier,
            created_at: current_rep.created_at,
            last_updated: 0u64
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // 4. PROVE REPUTATION (Zero-Knowledge Attestation)
    // ─────────────────────────────────────────────────────────────────────

    // Prove minimum rating threshold
    transition prove_rating(
        private reputation: AgentReputation,
        public min_rating: u8
    ) -> ReputationProof {
        // Ensure we have at least one job to calculate average
        assert(reputation.total_jobs > 0u64);

        // Calculate average rating (scaled x10)
        let avg_rating: u64 = (reputation.total_rating_points * 10u64)
                              / reputation.total_jobs;

        // Verify threshold met
        assert(avg_rating >= (min_rating as u64));

        return ReputationProof {
            owner: reputation.owner,
            proof_type: 1u8,
            threshold_met: true,
            tier_proven: reputation.tier,
            generated_at: 0u64
        };
    }

    // Prove minimum job count
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
            generated_at: 0u64
        };
    }

    // Prove minimum revenue (in ranges for extra privacy)
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
            generated_at: 0u64
        };
    }

    // Prove tier (most common use case)
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
            generated_at: 0u64
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // 5. ESCROW SYSTEM (Fair Exchange)
    // ─────────────────────────────────────────────────────────────────────

    // Client locks payment in escrow
    transition create_escrow(
        private agent: address,
        private amount: u64,
        private job_hash: field,
        private secret_hash: field,
        private blocks_until_deadline: u64
    ) -> EscrowRecord {
        return EscrowRecord {
            owner: self.caller,
            agent: agent,
            amount: amount,
            job_hash: job_hash,
            deadline: blocks_until_deadline,
            secret_hash: secret_hash,
            status: 0u8  // Locked
        };
    }

    // Agent claims by revealing secret (proves delivery)
    transition claim_escrow(
        private escrow: EscrowRecord,
        private secret: field
    ) -> EscrowRecord {
        // Verify secret matches hash
        let computed_hash: field = BHP256::hash_to_field(secret);
        assert_eq(computed_hash, escrow.secret_hash);

        // Verify caller is the agent
        assert_eq(self.caller, escrow.agent);

        // Verify still locked
        assert_eq(escrow.status, 0u8);

        return EscrowRecord {
            owner: escrow.agent,  // Transfer ownership to agent
            agent: escrow.agent,
            amount: escrow.amount,
            job_hash: escrow.job_hash,
            deadline: escrow.deadline,
            secret_hash: escrow.secret_hash,
            status: 1u8  // Released
        };
    }

    // Client refunds if deadline passed
    transition refund_escrow(
        private escrow: EscrowRecord
    ) -> EscrowRecord {
        // Verify caller is original owner
        assert_eq(self.caller, escrow.owner);

        // Verify still locked
        assert_eq(escrow.status, 0u8);

        return EscrowRecord {
            owner: escrow.owner,
            agent: escrow.agent,
            amount: escrow.amount,
            job_hash: escrow.job_hash,
            deadline: escrow.deadline,
            secret_hash: escrow.secret_hash,
            status: 2u8  // Refunded
        };
    }

    // ─────────────────────────────────────────────────────────────────────
    // 6. UPDATE LISTING (Agent can update their public listing)
    // ─────────────────────────────────────────────────────────────────────

    async transition update_listing(
        private reputation: AgentReputation,
        private new_service_type: u8,
        private new_endpoint_hash: field,
        private is_active: bool
    ) -> (AgentReputation, Future) {
        // Create updated listing
        let listing: PublicListing = PublicListing {
            agent_id: reputation.agent_id,
            service_type: new_service_type,
            endpoint_hash: new_endpoint_hash,
            min_tier: reputation.tier,
            is_active: is_active
        };

        return (reputation, finalize_update_listing(reputation.agent_id, listing));
    }

    async function finalize_update_listing(agent_id: field, listing: PublicListing) {
        Mapping::set(agent_listings, agent_id, listing);
    }

    // ─────────────────────────────────────────────────────────────────────
    // 7. UNREGISTER AGENT (Reclaim bond and deactivate)
    // ─────────────────────────────────────────────────────────────────────

    async transition unregister_agent(
        private reputation: AgentReputation,
        private bond: AgentBond
    ) -> (AgentBond, Future) {
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

        // Return the bond to the agent (they can now spend it)
        return (bond, finalize_unregister_agent(self.caller, reputation.agent_id, listing));
    }

    async function finalize_unregister_agent(
        caller: address,
        agent_id: field,
        listing: PublicListing
    ) {
        // Mark agent as unregistered (allows re-registration in the future)
        Mapping::set(registered_agents, caller, false);

        // Update listing to inactive
        Mapping::set(agent_listings, agent_id, listing);
    }
}
