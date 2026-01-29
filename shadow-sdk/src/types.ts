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
 * Payment session (for session-based payments)
 */
export interface PaymentSession {
  session_id: string;
  client: string;
  agent: string;
  max_total: number;
  max_per_request: number;
  rate_limit: number;
  expires_at: number;
  total_spent: number;
  request_count: number;
  status: 'active' | 'closed' | 'expired';
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
