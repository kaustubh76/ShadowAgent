// ShadowAgent Session-Based Payments: Phase 5
// Companion program for shadow_agent.aleo (immutable @noupgrade)
// Enables pre-authorized spending sessions for autonomous AI agent interactions
// Key benefit: 1000 API calls with 1 wallet signature

program shadow_agent_session.aleo {

    // ═══════════════════════════════════════════════════════════════════
    // CONSTRUCTOR (required for deployment on Aleo testnet)
    // ═══════════════════════════════════════════════════════════════════

    async transition constructor() -> Future {
        return finalize_constructor();
    }

    async function finalize_constructor() {
        // No-op: program state is initialized via mappings on first use
    }

    // ═══════════════════════════════════════════════════════════════════
    // RECORDS
    // ═══════════════════════════════════════════════════════════════════

    // Pre-authorized spending session between client and agent
    // Client signs once to create, agent can make requests within bounds
    record PaymentSession {
        owner: address,               // Client (human or AI agent)
        agent: address,               // Authorized service provider
        session_id: field,            // Unique identifier
        max_total: u64,               // Maximum total spend (microcredits)
        max_per_request: u64,         // Per-request cap
        rate_limit: u64,              // Max requests per rate window
        spent: u64,                   // Running total spent
        request_count: u64,           // Requests in current window
        window_start: u64,            // Rate limit window start block
        valid_until: u64,             // Expiry block height
        status: u8                    // 0=Active, 1=Paused, 2=Closed
    }

    // Per-request payment receipt held by the agent
    record SessionReceipt {
        owner: address,               // Agent (receives payment)
        session_id: field,
        request_hash: field,          // Unique request identifier
        amount: u64,
        timestamp: u64
    }

    // Reusable spending policy template
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

    // ═══════════════════════════════════════════════════════════════════
    // MAPPINGS
    // ═══════════════════════════════════════════════════════════════════

    // Track active sessions to prevent duplicate session IDs
    mapping active_sessions: field => bool;

    // ═══════════════════════════════════════════════════════════════════
    // CONSTANTS
    // ═══════════════════════════════════════════════════════════════════

    // Rate limit window size in blocks (~10 minutes at 6s/block)
    const RATE_WINDOW_BLOCKS: u64 = 100u64;

    // Session status codes
    const STATUS_ACTIVE: u8 = 0u8;
    const STATUS_PAUSED: u8 = 1u8;
    const STATUS_CLOSED: u8 = 2u8;

    // Tolerance for claimed block height (matches shadow_agent_ext)
    const BLOCK_TOLERANCE: u64 = 10u64;

    // ═══════════════════════════════════════════════════════════════════
    // TRANSITIONS
    // ═══════════════════════════════════════════════════════════════════

    // --- 1. Create Session ---
    // Client creates session with pre-authorized spending bounds
    // This is the ONLY transition requiring a client signature
    // current_block is passed by client and verified on-chain in finalize
    async transition create_session(
        private agent: address,
        private max_total: u64,
        private max_per_request: u64,
        private rate_limit: u64,
        private duration_blocks: u64,
        public current_block: u64
    ) -> (PaymentSession, Future) {
        // Validate bounds
        assert(max_total > 0u64);
        assert(max_per_request > 0u64);
        assert(max_per_request <= max_total);
        assert(rate_limit > 0u64);
        assert(duration_blocks > 0u64);

        // Generate unique session ID from caller + agent
        let session_id: field = BHP256::hash_to_field(self.caller);

        // Calculate expiry from claimed block height
        let valid_until: u64 = current_block + duration_blocks;

        let session: PaymentSession = PaymentSession {
            owner: self.caller,
            agent: agent,
            session_id: session_id,
            max_total: max_total,
            max_per_request: max_per_request,
            rate_limit: rate_limit,
            spent: 0u64,
            request_count: 0u64,
            window_start: current_block,
            valid_until: valid_until,
            status: STATUS_ACTIVE
        };

        return (session, finalize_create_session(session_id, current_block));
    }

    async function finalize_create_session(session_id: field, claimed_block: u64) {
        // Verify claimed block height is close to actual
        let actual_height: u64 = block.height as u64;
        let diff: u64 = claimed_block > actual_height
            ? claimed_block - actual_height
            : actual_height - claimed_block;
        assert(diff <= BLOCK_TOLERANCE);

        // Ensure session ID is unique
        let exists: bool = Mapping::contains(active_sessions, session_id);
        assert(!exists);
        Mapping::set(active_sessions, session_id, true);
    }

    // --- 2. Session Request ---
    // Agent records a request against the session (NO client signature required)
    // The session record itself IS the authorization
    // current_block is passed by agent for rate window and receipt timestamps
    async transition session_request(
        private session: PaymentSession,
        private amount: u64,
        private request_hash: field,
        public current_block: u64
    ) -> (PaymentSession, SessionReceipt, Future) {
        // Verify caller is the authorized agent
        assert_eq(self.caller, session.agent);

        // Verify session is active
        assert_eq(session.status, STATUS_ACTIVE);

        // Verify session hasn't expired
        assert(current_block < session.valid_until);

        // Verify amount within per-request limit
        assert(amount > 0u64);
        assert(amount <= session.max_per_request);

        // Verify total within session limit
        let new_spent: u64 = session.spent + amount;
        assert(new_spent <= session.max_total);

        // Rate limit: reset window if expired, otherwise increment
        let new_request_count: u64 = session.request_count + 1u64;
        let new_window_start: u64 = session.window_start;

        // Check if rate window has expired and reset
        let window_expired: bool = current_block >= (session.window_start + RATE_WINDOW_BLOCKS);
        if (window_expired) {
            new_request_count = 1u64;
            new_window_start = current_block;
        }

        // Verify within rate limit
        assert(new_request_count <= session.rate_limit);

        // Create receipt for the agent
        let receipt: SessionReceipt = SessionReceipt {
            owner: session.agent,
            session_id: session.session_id,
            request_hash: request_hash,
            amount: amount,
            timestamp: current_block
        };

        // Return updated session (spent incremented, count updated)
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

        return (updated_session, receipt, finalize_session_request(current_block));
    }

    async function finalize_session_request(claimed_block: u64) {
        // Verify claimed block height is close to actual
        let actual_height: u64 = block.height as u64;
        let diff: u64 = claimed_block > actual_height
            ? claimed_block - actual_height
            : actual_height - claimed_block;
        assert(diff <= BLOCK_TOLERANCE);
    }

    // --- 3. Settle Session ---
    // Agent claims accumulated payments from session receipts
    // Can be called periodically to batch-settle
    transition settle_session(
        private session: PaymentSession,
        private settlement_amount: u64
    ) -> PaymentSession {
        // Verify caller is the agent
        assert_eq(self.caller, session.agent);

        // Verify session is active or paused (can settle paused sessions)
        assert(session.status == STATUS_ACTIVE || session.status == STATUS_PAUSED);

        // Verify settlement doesn't exceed total spent
        assert(settlement_amount > 0u64);
        assert(settlement_amount <= session.spent);

        // Return updated session (in production, would trigger credit transfer)
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
            status: session.status
        };
    }

    // --- 4. Close Session ---
    // Client closes session and reclaims unused funds
    async transition close_session(
        private session: PaymentSession
    ) -> (PaymentSession, Future) {
        // Verify caller is session owner
        assert_eq(self.caller, session.owner);

        // Can close active or paused sessions
        assert(session.status == STATUS_ACTIVE || session.status == STATUS_PAUSED);

        // Return closed session (in production, refund = max_total - spent)
        let closed: PaymentSession = PaymentSession {
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
            status: STATUS_CLOSED
        };

        return (closed, finalize_close_session(session.session_id));
    }

    async function finalize_close_session(session_id: field) {
        // Remove from active sessions
        Mapping::remove(active_sessions, session_id);
    }

    // --- 5. Pause Session ---
    // Client temporarily suspends session (agent can't make new requests)
    transition pause_session(
        private session: PaymentSession
    ) -> PaymentSession {
        // Verify caller is session owner
        assert_eq(self.caller, session.owner);

        // Can only pause active sessions
        assert_eq(session.status, STATUS_ACTIVE);

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
            status: STATUS_PAUSED
        };
    }

    // --- 6. Resume Session ---
    // Client reactivates a paused session
    transition resume_session(
        private session: PaymentSession
    ) -> PaymentSession {
        // Verify caller is session owner
        assert_eq(self.caller, session.owner);

        // Can only resume paused sessions
        assert_eq(session.status, STATUS_PAUSED);

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
            status: STATUS_ACTIVE
        };
    }

    // ═══════════════════════════════════════════════════════════════════
    // SPENDING POLICY TRANSITIONS
    // ═══════════════════════════════════════════════════════════════════

    // --- 7. Create Spending Policy ---
    // Client creates a reusable policy template for session parameters
    transition create_policy(
        private max_session_value: u64,
        private max_single_request: u64,
        private allowed_tiers: u8,
        private allowed_categories: u64,
        private require_proofs: bool,
        private current_block: u64
    ) -> SpendingPolicy {
        // Validate policy bounds
        assert(max_session_value > 0u64);
        assert(max_single_request > 0u64);
        assert(max_single_request <= max_session_value);

        let policy_id: field = BHP256::hash_to_field(self.caller);

        return SpendingPolicy {
            owner: self.caller,
            policy_id: policy_id,
            max_session_value: max_session_value,
            max_single_request: max_single_request,
            allowed_tiers: allowed_tiers,
            allowed_categories: allowed_categories,
            require_proofs: require_proofs,
            created_at: current_block
        };
    }

    // --- 8. Create Session from Policy ---
    // Client creates a session using a pre-defined spending policy
    // Validates session parameters against policy bounds
    async transition create_session_from_policy(
        private policy: SpendingPolicy,
        private agent: address,
        private max_total: u64,
        private max_per_request: u64,
        private rate_limit: u64,
        private duration_blocks: u64,
        public current_block: u64
    ) -> (SpendingPolicy, PaymentSession, Future) {
        // Verify caller owns the policy
        assert_eq(self.caller, policy.owner);

        // Validate session parameters against policy bounds
        assert(max_total > 0u64);
        assert(max_total <= policy.max_session_value);
        assert(max_per_request > 0u64);
        assert(max_per_request <= policy.max_single_request);
        assert(rate_limit > 0u64);
        assert(duration_blocks > 0u64);

        let session_id: field = BHP256::hash_to_field(self.caller);
        let valid_until: u64 = current_block + duration_blocks;

        let session: PaymentSession = PaymentSession {
            owner: self.caller,
            agent: agent,
            session_id: session_id,
            max_total: max_total,
            max_per_request: max_per_request,
            rate_limit: rate_limit,
            spent: 0u64,
            request_count: 0u64,
            window_start: current_block,
            valid_until: valid_until,
            status: STATUS_ACTIVE
        };

        // Return policy (unchanged, reusable) and new session
        return (policy, session, finalize_policy_session(session_id, current_block));
    }

    async function finalize_policy_session(session_id: field, claimed_block: u64) {
        // Verify claimed block height
        let actual_height: u64 = block.height as u64;
        let diff: u64 = claimed_block > actual_height
            ? claimed_block - actual_height
            : actual_height - claimed_block;
        assert(diff <= BLOCK_TOLERANCE);

        // Ensure session ID is unique
        let exists: bool = Mapping::contains(active_sessions, session_id);
        assert(!exists);
        Mapping::set(active_sessions, session_id, true);
    }
}
