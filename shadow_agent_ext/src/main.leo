// ShadowAgent Extension: Phase 10a Features
// Companion program for shadow_agent.aleo (immutable @noupgrade)
// Features: Partial Refunds, Dispute Resolution, Reputation Decay, Multi-Sig Escrow

program shadow_agent_ext.aleo {

    // ═══════════════════════════════════════════════════════════════════
    // RECORDS
    // ═══════════════════════════════════════════════════════════════════

    // --- Partial Refund ---

    // Cooperative escrow split agreement between client and agent
    record SplitEscrowRecord {
        owner: address,
        agent: address,
        client: address,
        total_amount: u64,
        agent_amount: u64,
        client_amount: u64,
        job_hash: field,
        status: u8              // 0=Proposed, 1=Accepted, 2=Rejected
    }

    // --- Dispute Resolution ---

    // Dispute between client and agent, resolved by admin
    record DisputeRecord {
        owner: address,         // Admin/resolver initially, then parties after resolution
        client: address,
        agent: address,
        job_hash: field,
        escrow_amount: u64,
        client_evidence_hash: field,
        agent_evidence_hash: field,   // 0field until agent responds
        status: u8,             // 0=Opened, 1=AgentResponded, 2=ResolvedClient, 3=ResolvedAgent, 4=Split
        resolution_agent_pct: u8,     // 0-100 (percentage agent receives)
        opened_at: u64
    }

    // --- Reputation Decay ---

    // Reputation proof with decay applied
    record DecayedReputationProof {
        owner: address,
        agent_id: field,
        effective_rating_points: u64,
        total_jobs: u64,
        decay_periods: u64,
        proof_type: u8,         // 1=Rating, 2=Jobs, 3=Revenue, 4=Tier
        threshold_met: bool,
        generated_at: u64
    }

    // --- Multi-Sig Escrow ---

    // Escrow requiring M-of-3 signatures for release
    record MultiSigEscrowRecord {
        owner: address,
        agent: address,
        amount: u64,
        job_hash: field,
        deadline: u64,
        secret_hash: field,
        signer_1: address,
        signer_2: address,
        signer_3: address,      // Set to signer_1 if only 2 signers needed
        required_sigs: u8,      // 1, 2, or 3
        sig_count: u8,
        sig_1_approved: bool,
        sig_2_approved: bool,
        sig_3_approved: bool,
        status: u8              // 0=Locked, 1=Released, 2=Refunded
    }

    // ═══════════════════════════════════════════════════════════════════
    // MAPPINGS
    // ═══════════════════════════════════════════════════════════════════

    // Tracks active disputes by job_hash
    mapping active_disputes: field => bool;

    // ═══════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    // Tier thresholds (must match shadow_agent.aleo)
    const BRONZE_JOBS: u64 = 10u64;
    const BRONZE_REVENUE: u64 = 10000000u64;
    const SILVER_JOBS: u64 = 50u64;
    const SILVER_REVENUE: u64 = 100000000u64;
    const GOLD_JOBS: u64 = 200u64;
    const GOLD_REVENUE: u64 = 1000000000u64;
    const DIAMOND_JOBS: u64 = 1000u64;
    const DIAMOND_REVENUE: u64 = 10000000000u64;

    // Reputation decay constants
    const DECAY_PERIOD_BLOCKS: u64 = 100800u64;  // ~7 days at 6s/block
    const DECAY_FACTOR_NUM: u64 = 95u64;         // 95% retained per period
    const DECAY_FACTOR_DEN: u64 = 100u64;
    const MAX_DECAY_STEPS: u64 = 10u64;          // Cap at 10 periods (~70 days max decay)

    // Block tolerance for decay proof verification
    const BLOCK_TOLERANCE: u64 = 10u64;

    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUCTOR
    // ═══════════════════════════════════════════════════════════════════

    @noupgrade
    async constructor() {}

    // ═══════════════════════════════════════════════════════════════════
    // HELPER FUNCTIONS
    // ═══════════════════════════════════════════════════════════════════

    // Calculate tier from cumulative stats (mirrors shadow_agent.aleo)
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

    // Apply reputation decay using unrolled steps (Leo has no variable-bound loops)
    // Each step: result = (result * 95) / 100 (5% decay per period)
    // After 10 periods (~70 days): effective = ~59.87% of original
    function apply_decay(
        total_rating_points: u64,
        last_updated: u64,
        current_block: u64
    ) -> (u64, u64) {
        // Guard: if last_updated >= current_block, no decay applies (prevents underflow)
        if (current_block <= last_updated) {
            return (total_rating_points, 0u64);
        }

        // Calculate elapsed periods
        let elapsed: u64 = current_block - last_updated;
        let periods: u64 = elapsed / DECAY_PERIOD_BLOCKS;

        // Cap at maximum decay steps
        let capped: u64 = periods;
        if (capped > MAX_DECAY_STEPS) {
            capped = MAX_DECAY_STEPS;
        }

        // Unrolled decay application (10 steps max)
        let result: u64 = total_rating_points;

        if (capped >= 1u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 2u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 3u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 4u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 5u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 6u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 7u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 8u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 9u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }
        if (capped >= 10u64) {
            result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
        }

        return (result, capped);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TRANSITIONS: PARTIAL REFUNDS
    // ═══════════════════════════════════════════════════════════════════

    // Client proposes a partial refund split on an escrow
    // The record is sent to the agent (owner = agent) for acceptance
    transition propose_partial_refund(
        private agent: address,
        private total_amount: u64,
        private agent_amount: u64,
        private job_hash: field
    ) -> SplitEscrowRecord {
        // Validate split amounts (checks BEFORE subtraction to prevent underflow)
        assert(total_amount > 0u64);
        assert(agent_amount > 0u64);
        assert(agent_amount < total_amount);  // Both parties must receive something
        let client_amount: u64 = total_amount - agent_amount;

        return SplitEscrowRecord {
            owner: agent,           // Agent receives the proposal to review
            agent: agent,
            client: self.caller,
            total_amount: total_amount,
            agent_amount: agent_amount,
            client_amount: client_amount,
            job_hash: job_hash,
            status: 0u8             // Proposed
        };
    }

    // Agent accepts a partial refund proposal
    // Produces two records: one for agent (proof of payment), one for client (proof of refund)
    // Actual fund transfers happen off-chain via credits.aleo, triggered by the SDK
    transition accept_partial_refund(
        private proposal: SplitEscrowRecord
    ) -> (SplitEscrowRecord, SplitEscrowRecord) {
        // Only the agent can accept
        assert_eq(self.caller, proposal.agent);
        // Must be in Proposed state
        assert_eq(proposal.status, 0u8);

        // Agent's record (proof of agreed payment)
        let agent_record: SplitEscrowRecord = SplitEscrowRecord {
            owner: proposal.agent,
            agent: proposal.agent,
            client: proposal.client,
            total_amount: proposal.total_amount,
            agent_amount: proposal.agent_amount,
            client_amount: proposal.client_amount,
            job_hash: proposal.job_hash,
            status: 1u8             // Accepted
        };

        // Client's record (proof of agreed refund)
        let client_record: SplitEscrowRecord = SplitEscrowRecord {
            owner: proposal.client,
            agent: proposal.agent,
            client: proposal.client,
            total_amount: proposal.total_amount,
            agent_amount: proposal.agent_amount,
            client_amount: proposal.client_amount,
            job_hash: proposal.job_hash,
            status: 1u8             // Accepted
        };

        return (agent_record, client_record);
    }

    // Agent rejects a partial refund proposal
    // Returns a rejection record to the client
    transition reject_partial_refund(
        private proposal: SplitEscrowRecord
    ) -> SplitEscrowRecord {
        // Only the agent can reject
        assert_eq(self.caller, proposal.agent);
        // Must be in Proposed state
        assert_eq(proposal.status, 0u8);

        return SplitEscrowRecord {
            owner: proposal.client,   // Return to client
            agent: proposal.agent,
            client: proposal.client,
            total_amount: proposal.total_amount,
            agent_amount: proposal.agent_amount,
            client_amount: proposal.client_amount,
            job_hash: proposal.job_hash,
            status: 2u8             // Rejected
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // TRANSITIONS: DISPUTE RESOLUTION
    // ═══════════════════════════════════════════════════════════════════

    // Client opens a dispute on a job/escrow
    // The dispute record is owned by the admin (resolver) initially
    async transition open_dispute(
        private agent: address,
        private job_hash: field,
        private escrow_amount: u64,
        private evidence_hash: field,
        private admin: address
    ) -> (DisputeRecord, Future) {
        let dispute: DisputeRecord = DisputeRecord {
            owner: admin,           // Admin resolves the dispute
            client: self.caller,
            agent: agent,
            job_hash: job_hash,
            escrow_amount: escrow_amount,
            client_evidence_hash: evidence_hash,
            agent_evidence_hash: 0field,
            status: 0u8,            // Opened
            resolution_agent_pct: 0u8,
            opened_at: 0u64
        };

        return (dispute, finalize_open_dispute(job_hash));
    }

    async function finalize_open_dispute(job_hash: field) {
        // Prevent duplicate disputes on same job
        let already_disputed: bool = Mapping::get_or_use(
            active_disputes,
            job_hash,
            false
        );
        assert(!already_disputed);

        // Mark job as having an active dispute
        Mapping::set(active_disputes, job_hash, true);
    }

    // Agent responds to a dispute with counter-evidence
    transition respond_to_dispute(
        private dispute: DisputeRecord,
        private evidence_hash: field
    ) -> DisputeRecord {
        // Only the agent can respond
        assert_eq(self.caller, dispute.agent);
        // Must be in Opened state
        assert_eq(dispute.status, 0u8);

        return DisputeRecord {
            owner: dispute.owner,    // Still owned by admin
            client: dispute.client,
            agent: dispute.agent,
            job_hash: dispute.job_hash,
            escrow_amount: dispute.escrow_amount,
            client_evidence_hash: dispute.client_evidence_hash,
            agent_evidence_hash: evidence_hash,
            status: 1u8,            // AgentResponded
            resolution_agent_pct: 0u8,
            opened_at: dispute.opened_at
        };
    }

    // Admin resolves a dispute by setting the agent percentage (0-100)
    // Produces two records: one for client, one for agent
    async transition resolve_dispute(
        private dispute: DisputeRecord,
        private agent_percentage: u8
    ) -> (DisputeRecord, DisputeRecord, Future) {
        // Only the admin/resolver can resolve
        assert_eq(self.caller, dispute.owner);
        // Must be in Opened or AgentResponded state
        assert(dispute.status <= 1u8);
        // Percentage must be valid
        assert(agent_percentage <= 100u8);

        // Determine resolution status
        let resolution_status: u8 = 4u8;  // Split (default)
        if (agent_percentage == 0u8) {
            resolution_status = 2u8;       // ResolvedClient (client gets all)
        }
        if (agent_percentage == 100u8) {
            resolution_status = 3u8;       // ResolvedAgent (agent gets all)
        }

        // Client's resolution record
        let client_record: DisputeRecord = DisputeRecord {
            owner: dispute.client,
            client: dispute.client,
            agent: dispute.agent,
            job_hash: dispute.job_hash,
            escrow_amount: dispute.escrow_amount,
            client_evidence_hash: dispute.client_evidence_hash,
            agent_evidence_hash: dispute.agent_evidence_hash,
            status: resolution_status,
            resolution_agent_pct: agent_percentage,
            opened_at: dispute.opened_at
        };

        // Agent's resolution record
        let agent_record: DisputeRecord = DisputeRecord {
            owner: dispute.agent,
            client: dispute.client,
            agent: dispute.agent,
            job_hash: dispute.job_hash,
            escrow_amount: dispute.escrow_amount,
            client_evidence_hash: dispute.client_evidence_hash,
            agent_evidence_hash: dispute.agent_evidence_hash,
            status: resolution_status,
            resolution_agent_pct: agent_percentage,
            opened_at: dispute.opened_at
        };

        return (client_record, agent_record, finalize_resolve_dispute(dispute.job_hash));
    }

    async function finalize_resolve_dispute(job_hash: field) {
        // Clear active dispute flag
        Mapping::set(active_disputes, job_hash, false);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TRANSITIONS: REPUTATION DECAY
    // ═══════════════════════════════════════════════════════════════════

    // Generate a reputation proof with decay applied
    // Since AgentReputation is a record from shadow_agent.aleo and cannot be consumed
    // by this program, we accept individual fields as private inputs.
    // The SDK extracts these from the user's AgentReputation record.
    async transition prove_rating_decay(
        private agent_id: field,
        private total_jobs: u64,
        private total_rating_points: u64,
        private total_revenue: u64,
        private tier: u8,
        private last_updated: u64,
        public min_rating: u8,
        public current_block: u64
    ) -> (DecayedReputationProof, Future) {
        // Must have at least one job
        assert(total_jobs > 0u64);

        // Apply decay
        let decay_result: (u64, u64) = apply_decay(
            total_rating_points,
            last_updated,
            current_block
        );
        let decayed_points: u64 = decay_result.0;
        let decay_periods: u64 = decay_result.1;

        // Calculate decayed average rating (scaled x10)
        let avg_rating: u64 = (decayed_points * 10u64) / total_jobs;

        // Verify threshold met
        assert(avg_rating >= (min_rating as u64));

        let proof: DecayedReputationProof = DecayedReputationProof {
            owner: self.caller,
            agent_id: agent_id,
            effective_rating_points: decayed_points,
            total_jobs: total_jobs,
            decay_periods: decay_periods,
            proof_type: 1u8,         // Rating proof with decay
            threshold_met: true,
            generated_at: 0u64
        };

        return (proof, finalize_prove_rating_decay(current_block));
    }

    async function finalize_prove_rating_decay(claimed_block: u64) {
        // Verify claimed block height is close to actual height
        // Prevents agents from lying about the current time to avoid decay
        let actual_height: u64 = block.height as u64;
        let diff: u64 = claimed_block > actual_height
            ? claimed_block - actual_height
            : actual_height - claimed_block;
        assert(diff <= BLOCK_TOLERANCE);
    }

    // Generate a tier proof with decay applied
    async transition prove_tier_with_decay(
        private agent_id: field,
        private total_jobs: u64,
        private total_rating_points: u64,
        private total_revenue: u64,
        private tier: u8,
        private last_updated: u64,
        public required_tier: u8,
        public current_block: u64
    ) -> (DecayedReputationProof, Future) {
        // Apply decay to rating points
        let decay_result: (u64, u64) = apply_decay(
            total_rating_points,
            last_updated,
            current_block
        );
        let decayed_points: u64 = decay_result.0;
        let decay_periods: u64 = decay_result.1;

        // Recalculate tier with decayed values
        // Note: decay affects rating points, but tier depends on jobs + revenue (not rating)
        // So tier itself doesn't decay, but we still validate the original tier
        assert(tier >= required_tier);

        let proof: DecayedReputationProof = DecayedReputationProof {
            owner: self.caller,
            agent_id: agent_id,
            effective_rating_points: decayed_points,
            total_jobs: total_jobs,
            decay_periods: decay_periods,
            proof_type: 4u8,         // Tier proof with decay
            threshold_met: true,
            generated_at: 0u64
        };

        return (proof, finalize_prove_tier_with_decay(current_block));
    }

    async function finalize_prove_tier_with_decay(claimed_block: u64) {
        let actual_height: u64 = block.height as u64;
        let diff: u64 = claimed_block > actual_height
            ? claimed_block - actual_height
            : actual_height - claimed_block;
        assert(diff <= BLOCK_TOLERANCE);
    }

    // ═══════════════════════════════════════════════════════════════════
    // TRANSITIONS: MULTI-SIG ESCROW
    // ═══════════════════════════════════════════════════════════════════

    // Create a multi-sig escrow requiring M-of-3 approvals
    transition create_multisig_escrow(
        private agent: address,
        private amount: u64,
        private job_hash: field,
        private secret_hash: field,
        private blocks_until_deadline: u64,
        private signer_1: address,
        private signer_2: address,
        private signer_3: address,
        private required_sigs: u8
    ) -> MultiSigEscrowRecord {
        // Validate required signatures (1-3)
        assert(required_sigs >= 1u8);
        assert(required_sigs <= 3u8);

        return MultiSigEscrowRecord {
            owner: self.caller,
            agent: agent,
            amount: amount,
            job_hash: job_hash,
            deadline: blocks_until_deadline,
            secret_hash: secret_hash,
            signer_1: signer_1,
            signer_2: signer_2,
            signer_3: signer_3,
            required_sigs: required_sigs,
            sig_count: 0u8,
            sig_1_approved: false,
            sig_2_approved: false,
            sig_3_approved: false,
            status: 0u8             // Locked
        };
    }

    // Signer approves escrow release by providing the secret
    // Each call consumes old record and produces updated one (UTXO model)
    // When threshold is met, ownership transfers to the agent
    transition approve_escrow_release(
        private escrow: MultiSigEscrowRecord,
        private secret: field
    ) -> MultiSigEscrowRecord {
        // Verify secret matches hash
        let computed_hash: field = BHP256::hash_to_field(secret);
        assert_eq(computed_hash, escrow.secret_hash);

        // Verify still locked
        assert_eq(escrow.status, 0u8);

        // Verify caller is one of the signers
        let is_signer_1: bool = (self.caller == escrow.signer_1);
        let is_signer_2: bool = (self.caller == escrow.signer_2);
        let is_signer_3: bool = (self.caller == escrow.signer_3);
        assert(is_signer_1 || is_signer_2 || is_signer_3);

        // Update approval flags (prevent duplicate approvals)
        let new_sig_1: bool = escrow.sig_1_approved || is_signer_1;
        let new_sig_2: bool = escrow.sig_2_approved || is_signer_2;
        let new_sig_3: bool = escrow.sig_3_approved || is_signer_3;

        // Count total approvals
        let count: u8 = 0u8;
        if (new_sig_1) {
            count = count + 1u8;
        }
        if (new_sig_2) {
            count = count + 1u8;
        }
        if (new_sig_3) {
            count = count + 1u8;
        }

        // Determine new status
        let new_status: u8 = 0u8;       // Still locked
        if (count >= escrow.required_sigs) {
            new_status = 1u8;            // Released
        }

        // Transfer ownership to agent when released, otherwise back to creator
        let new_owner: address = escrow.owner;
        if (new_status == 1u8) {
            new_owner = escrow.agent;
        }

        return MultiSigEscrowRecord {
            owner: new_owner,
            agent: escrow.agent,
            amount: escrow.amount,
            job_hash: escrow.job_hash,
            deadline: escrow.deadline,
            secret_hash: escrow.secret_hash,
            signer_1: escrow.signer_1,
            signer_2: escrow.signer_2,
            signer_3: escrow.signer_3,
            required_sigs: escrow.required_sigs,
            sig_count: count,
            sig_1_approved: new_sig_1,
            sig_2_approved: new_sig_2,
            sig_3_approved: new_sig_3,
            status: new_status
        };
    }

    // Owner refunds multi-sig escrow after deadline
    async transition refund_multisig_escrow(
        private escrow: MultiSigEscrowRecord
    ) -> (MultiSigEscrowRecord, Future) {
        // Verify caller is original owner
        assert_eq(self.caller, escrow.owner);
        // Verify still locked
        assert_eq(escrow.status, 0u8);

        let refunded: MultiSigEscrowRecord = MultiSigEscrowRecord {
            owner: escrow.owner,
            agent: escrow.agent,
            amount: escrow.amount,
            job_hash: escrow.job_hash,
            deadline: escrow.deadline,
            secret_hash: escrow.secret_hash,
            signer_1: escrow.signer_1,
            signer_2: escrow.signer_2,
            signer_3: escrow.signer_3,
            required_sigs: escrow.required_sigs,
            sig_count: escrow.sig_count,
            sig_1_approved: escrow.sig_1_approved,
            sig_2_approved: escrow.sig_2_approved,
            sig_3_approved: escrow.sig_3_approved,
            status: 2u8             // Refunded
        };

        return (refunded, finalize_refund_multisig(escrow.deadline));
    }

    async function finalize_refund_multisig(deadline: u64) {
        // Verify deadline has passed before allowing refund
        let current_block: u64 = block.height as u64;
        assert(current_block >= deadline);
    }
}
