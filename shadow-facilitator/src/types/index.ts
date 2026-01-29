// ═══════════════════════════════════════════════════════════════════
// ENUMS
// ═══════════════════════════════════════════════════════════════════

export enum Tier {
  New = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Diamond = 4,
}

export enum ServiceType {
  NLP = 1,
  Vision = 2,
  Code = 3,
  Data = 4,
  Audio = 5,
  Multi = 6,
  Custom = 7,
}

export enum ProofType {
  Rating = 1,
  Jobs = 2,
  Revenue = 3,
  Tier = 4,
}

export enum EscrowStatus {
  Locked = 0,
  Released = 1,
  Refunded = 2,
}

// ═══════════════════════════════════════════════════════════════════
// PUBLIC DATA TYPES
// ═══════════════════════════════════════════════════════════════════

export interface PublicListing {
  agent_id: string;
  service_type: number;
  endpoint_hash: string;
  min_tier: number;
  is_active: boolean;
}

export interface AgentListing extends PublicListing {
  endpoint?: string;
}

// ═══════════════════════════════════════════════════════════════════
// x402 PROTOCOL TYPES
// ═══════════════════════════════════════════════════════════════════

export interface PaymentTerms {
  price: number;
  network: string;
  address: string;
  escrow_required: boolean;
  secret_hash?: string;
  deadline_blocks?: number;
  description?: string;
}

export interface EscrowProof {
  proof: string;
  nullifier: string;
  commitment: string;
}

export interface ReputationProof {
  proof_type: number;
  threshold: number;
  proof: string;
  tier_proven: number;
  generated_at: number;
}

// ═══════════════════════════════════════════════════════════════════
// API TYPES
// ═══════════════════════════════════════════════════════════════════

export interface AgentSearchParams {
  service_type?: number;
  min_tier?: number;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface AgentSearchResponse {
  agents: AgentListing[];
  total: number;
  limit: number;
  offset: number;
}

export interface VerifyResponse {
  valid: boolean;
  error?: string;
  tier?: number;
}
