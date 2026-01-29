// ShadowAgent Facilitator - Type Definitions

export enum ServiceType {
  NLP = 1,
  Vision = 2,
  Code = 3,
  Data = 4,
  Audio = 5,
  Multi = 6,
  Custom = 7,
}

export enum Tier {
  New = 0,
  Bronze = 1,
  Silver = 2,
  Gold = 3,
  Diamond = 4,
}

export interface AgentListing {
  agent_id: string;
  service_type: ServiceType;
  endpoint_hash: string;
  tier: Tier;
  is_active: boolean;
  registered_at?: number;
}

export interface SearchParams {
  service_type?: ServiceType;
  min_tier?: Tier;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

export interface SearchResult {
  agents: AgentListing[];
  total: number;
  limit: number;
  offset: number;
}

export interface EscrowProof {
  proof: string;
  nullifier: string;
  commitment: string;
  amount?: number;
  transactionId?: string; // On-chain transaction ID for verification
}

export interface ReputationProof {
  proof_type: number;
  threshold: number;
  proof: string;
  tier?: Tier;
  transactionId?: string; // On-chain transaction ID for verification
}

export interface VerificationResult {
  valid: boolean;
  tier?: Tier;
  error?: string;
}

export interface PaymentTerms {
  price: number;
  network: string;
  address: string;
  escrow_required: boolean;
  secret_hash: string;
  deadline_blocks: number;
}

export interface HealthStatus {
  status: 'ok' | 'degraded' | 'down';
  timestamp: string;
  version: string;
  blockHeight?: number;
}
