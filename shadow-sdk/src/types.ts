// ShadowAgent SDK - Type Definitions

/**
 * Service types offered by AI agents
 */
export enum ServiceType {
  NLP = 1,
  Vision = 2,
  Code = 3,
  Data = 4,
  Audio = 5,
  Multi = 6,
  Custom = 7,
}

/**
 * Reputation tiers
 */
export enum Tier {
  New = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Diamond = 4,
}

/**
 * Proof types for reputation attestation
 */
export enum ProofType {
  Rating = 1,
  Jobs = 2,
  Revenue = 3,
  Tier = 4,
}

/**
 * Escrow status
 */
export enum EscrowStatus {
  Locked = 0,
  Released = 1,
  Refunded = 2,
}

/**
 * Dispute status (matches shadow_agent_ext.aleo)
 */
export enum DisputeStatus {
  Opened = 0,
  AgentResponded = 1,
  ResolvedClient = 2,
  ResolvedAgent = 3,
  ResolvedSplit = 4,
}

/**
 * Partial refund status (matches shadow_agent_ext.aleo)
 */
export enum RefundStatus {
  Proposed = 0,
  Accepted = 1,
  Rejected = 2,
}

/**
 * Agent listing information
 */
export interface AgentListing {
  agent_id: string;
  service_type: ServiceType;
  endpoint_hash: string;
  tier: Tier;
  is_active: boolean;
  registered_at?: number;
}

/**
 * Agent reputation data (private record)
 */
export interface AgentReputation {
  owner: string;
  agent_id: string;
  total_jobs: number;
  total_rating_points: number;
  total_revenue: number;
  tier: Tier;
  created_at: number;
  last_updated: number;
}

/**
 * Rating record (private record)
 */
export interface RatingRecord {
  owner: string;
  client_nullifier: string;
  job_hash: string;
  rating: number; // 1-50 (scaled: 5 stars = 50)
  payment_amount: number;
  burn_proof: string;
  timestamp: number;
}

/**
 * Reputation proof (shareable record)
 */
export interface ReputationProof {
  owner: string;
  proof_type: ProofType;
  threshold_met: boolean;
  tier_proven: Tier;
  generated_at: number;
}

/**
 * Escrow record (private record)
 */
export interface EscrowRecord {
  owner: string;
  agent: string;
  amount: number;
  job_hash: string;
  deadline: number;
  secret_hash: string;
  status: EscrowStatus;
}

/**
 * Session status (numeric values match Leo contract constants)
 */
export enum SessionStatus {
  Active = 0,
  Paused = 1,
  Closed = 2,
}

/** String-based session status used in the SDK and frontend */
export type SessionStatusStr = 'active' | 'paused' | 'closed' | 'expired';

/**
 * Payment session (for session-based payments)
 * Matches PaymentSession record in shadow_agent_session.aleo
 */
export interface PaymentSession {
  owner: string;
  session_id: string;
  client: string;
  agent: string;
  max_total: number;
  max_per_request: number;
  rate_limit: number;
  spent: number;
  request_count: number;
  window_start: number;
  valid_until: number;
  status: SessionStatusStr;
}

/**
 * Session receipt for per-request tracking
 * Matches SessionReceipt record in shadow_agent_session.aleo
 */
export interface SessionReceipt {
  owner: string;
  session_id: string;
  request_hash: string;
  amount: number;
  timestamp: number;
}

/**
 * Reusable spending policy
 * Matches SpendingPolicy record in shadow_agent_session.aleo
 */
export interface SpendingPolicy {
  owner: string;
  policy_id: string;
  max_session_value: number;
  max_single_request: number;
  allowed_tiers: number;
  allowed_categories: number;
  require_proofs: boolean;
  created_at: number;
}

/**
 * Payment terms returned by x402 protocol
 */
export interface PaymentTerms {
  price: number;
  network: string;
  address: string;
  escrow_required: boolean;
  secret_hash: string;
  deadline_blocks: number;
}

/**
 * Search parameters for agent discovery
 */
export interface SearchParams {
  service_type?: ServiceType;
  min_tier?: Tier;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

/**
 * Search results
 */
export interface SearchResult {
  agents: AgentListing[];
  total: number;
  limit: number;
  offset: number;
}

/**
 * Escrow proof for payment verification
 */
export interface EscrowProof {
  proof: string;
  nullifier: string;
  commitment: string;
  amount?: number;
}

/**
 * Verification result
 */
export interface VerificationResult {
  valid: boolean;
  tier?: Tier;
  error?: string;
}

/**
 * Client SDK configuration
 */
export interface ClientConfig {
  privateKey?: string;
  network?: 'testnet' | 'mainnet';
  facilitatorUrl?: string;
  timeout?: number;
  adminAddress?: string;
}

/**
 * Agent SDK configuration
 */
export interface AgentConfig {
  privateKey: string;
  network?: 'testnet' | 'mainnet';
  serviceType: ServiceType;
  pricePerRequest?: number;
  facilitatorUrl?: string;
}

/**
 * Request options for client
 */
export interface RequestOptions {
  method?: 'GET' | 'POST' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  timeout?: number;
  maxRetries?: number;
}

/**
 * Request result
 */
export interface RequestResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  jobHash?: string;
  paymentProof?: EscrowProof;
  retryAfter?: number;
}

/**
 * Transaction receipt
 */
export interface TransactionReceipt {
  transaction_id: string;
  block_height: number;
  status: 'pending' | 'confirmed' | 'failed';
  fee?: number;
}

/**
 * Health status
 */
export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  blockHeight?: number;
}

/**
 * Tier thresholds (matching smart contract)
 */
export const TIER_THRESHOLDS = {
  [Tier.Bronze]: { jobs: 10, revenue: 10_000_000 }, // $100
  [Tier.Silver]: { jobs: 50, revenue: 100_000_000 }, // $1,000
  [Tier.Gold]: { jobs: 200, revenue: 1_000_000_000 }, // $10,000
  [Tier.Diamond]: { jobs: 1000, revenue: 10_000_000_000 }, // $100,000
} as const;

/**
 * Rating constants (matching smart contract)
 */
export const RATING_CONSTANTS = {
  BURN_COST: 500_000, // 0.5 credits
  MIN_PAYMENT: 100_000, // $0.10
  MAX_RATING: 50, // 5.0 stars (scaled x10)
  MIN_RATING: 1, // 0.1 stars
} as const;

// ═══════════════════════════════════════════════════════════════════
// Phase 10a: Extension Types (shadow_agent_ext.aleo)
// ═══════════════════════════════════════════════════════════════════

/**
 * Partial refund proposal between client and agent
 */
export interface PartialRefundProposal {
  agent: string;
  client: string;
  total_amount: number;
  agent_amount: number;
  client_amount: number;
  job_hash: string;
  status: RefundStatus;
}

/**
 * Dispute record between client and agent
 */
export interface Dispute {
  client: string;
  agent: string;
  job_hash: string;
  escrow_amount: number;
  client_evidence_hash: string;
  agent_evidence_hash: string;
  status: DisputeStatus;
  resolution_agent_pct: number;
  opened_at: number;
}

/**
 * Decayed reputation data (after time-based decay applied)
 */
export interface DecayedReputation {
  effective_rating_points: number;
  decay_periods: number;
  decay_factor: number; // 0.95^periods
  effective_average_rating: number;
  effective_tier: Tier;
}

/**
 * Reputation decay constants (matching shadow_agent_ext.aleo)
 */
export const DECAY_CONSTANTS = {
  PERIOD_BLOCKS: 100_800, // ~7 days at 6s/block
  FACTOR_NUMERATOR: 95,
  FACTOR_DENOMINATOR: 100,
  MAX_STEPS: 10, // Cap at ~70 days
} as const;

/**
 * Multi-sig escrow configuration
 */
export interface MultiSigEscrowConfig {
  signers: [string, string, string]; // Fixed 3 addresses
  required_signatures: 1 | 2 | 3;
}

/**
 * Multi-sig escrow record
 */
export interface MultiSigEscrow {
  owner: string;
  agent: string;
  amount: number;
  job_hash: string;
  deadline: number;
  secret_hash: string;
  signers: [string, string, string];
  required_sigs: number;
  sig_count: number;
  approvals: [boolean, boolean, boolean];
  status: EscrowStatus;
}
