// Real Aleo blockchain service for frontend
// Defines types/enums locally to avoid eager SDK imports that trigger WASM loading

// ============================================
// Types & Enums (mirrored from SDK to avoid WASM import)
// ============================================

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

export enum ProofType {
  Rating = 1,
  Jobs = 2,
  Revenue = 3,
  Tier = 4,
}

export interface AgentListing {
  agent_id: string;
  service_type: ServiceType;
  endpoint_hash: string;
  tier: Tier;
  is_active: boolean;
  registered_at?: number;
}

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

export interface EscrowRecord {
  owner: string;
  agent: string;
  amount: number;
  job_hash: string;
  deadline: number;
  secret_hash: string;
  status: number;
}

export interface EscrowProof {
  proof: string;
  nullifier: string;
  commitment: string;
  amount?: number;
}

export interface SearchParams {
  service_type?: ServiceType;
  min_tier?: Tier;
  is_active?: boolean;
  limit?: number;
  offset?: number;
}

// ============================================
// Lazy SDK function accessors
// ============================================

/** Lazily load and call SDK crypto functions to avoid WASM at import time */
async function getSDK() {
  return await import('@shadowagent/sdk');
}

export async function generateSecret(): Promise<string> {
  const sdk = await getSDK();
  return sdk.generateSecret();
}

export async function hashSecret(secret: string): Promise<string> {
  const sdk = await getSDK();
  return sdk.hashSecret(secret);
}

export async function generateNullifier(callerHash: string, jobHash: string): Promise<string> {
  const sdk = await getSDK();
  return sdk.generateNullifier(callerHash, jobHash);
}

export async function getBalance(address: string): Promise<number> {
  const sdk = await getSDK();
  return sdk.getBalance(address);
}

export async function getBlockHeight(): Promise<number> {
  const sdk = await getSDK();
  return sdk.getBlockHeight();
}

export async function transferPublic(privateKey: string, to: string, amount: number, fee?: number): Promise<string> {
  const sdk = await getSDK();
  return sdk.transferPublic(privateKey, to, amount, fee);
}

export async function transferPrivate(privateKey: string, to: string, amount: number, fee?: number): Promise<string> {
  const sdk = await getSDK();
  return sdk.transferPrivate(privateKey, to, amount, fee);
}

export async function waitForTransaction(txId: string, maxRetries?: number, delay?: number) {
  const sdk = await getSDK();
  return sdk.waitForTransaction(txId, maxRetries, delay);
}

export async function createReputationProof(
  proofType: number,
  threshold: number,
  reputation: { totalJobs: number; totalRatingPoints: number; totalRevenue: number; tier: number },
  privateKey: string
) {
  const sdk = await getSDK();
  return sdk.createReputationProof(proofType, threshold, reputation, privateKey);
}

// Credits formatting helper (inline to avoid SDK import)
export const credits = {
  format: (microcredits: number): string => {
    return (microcredits / 1_000_000).toFixed(2);
  },
};

// ============================================
// Constants
// ============================================

// Program ID for ShadowAgent smart contract
export const SHADOW_AGENT_PROGRAM_ID = 'shadow_agent.aleo';

// Companion program for Phase 10a features (disputes, partial refunds, decay, multi-sig)
export const SHADOW_AGENT_EXT_PROGRAM_ID = 'shadow_agent_ext.aleo';

// Network configuration
export const ALEO_NETWORK = 'testnet' as const;
export const ALEO_RPC_URL = 'https://api.explorer.provable.com/v1';

// Contract constants
export const REGISTRATION_BOND = 10_000_000; // 10 credits in microcredits
export const RATING_BURN_COST = 500_000; // 0.5 credits
export const DEFAULT_TX_AMOUNT = 10_000; // 0.01 credits for testing

// Tier thresholds (must match smart contract)
export const TIER_THRESHOLDS = {
  BRONZE: { jobs: 10, revenue: 10_000_000 },
  SILVER: { jobs: 50, revenue: 100_000_000 },
  GOLD: { jobs: 200, revenue: 1_000_000_000 },
  DIAMOND: { jobs: 1000, revenue: 10_000_000_000 },
};

// ============================================
// Transaction input types for smart contract calls (wallet-specific)
// ============================================

export interface RegisterAgentInput {
  service_type: number;
  endpoint_hash: string;
  bond_amount: number;
}

export interface SubmitRatingInput {
  agent_id: string;
  rating: number;
  payment_amount: number;
  nullifier: string;
}

export interface CreateEscrowInput {
  agent: string;
  amount: number;
  job_hash: string;
  deadline: number;
  secret_hash: string;
}

// ============================================
// On-chain query functions
// ============================================

/**
 * Check if an address is already registered as an agent
 */
export async function isAddressRegistered(address: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${ALEO_RPC_URL}/testnet/program/${SHADOW_AGENT_PROGRAM_ID}/mapping/registered_agents/${address}`
    );
    if (!response.ok) return false;
    const value = await response.text();
    return value.includes('true');
  } catch {
    return false;
  }
}

/**
 * Fetch agent listing from on-chain mapping
 */
export async function getAgentListing(agentId: string): Promise<AgentListing | null> {
  try {
    const response = await fetch(
      `${ALEO_RPC_URL}/testnet/program/${SHADOW_AGENT_PROGRAM_ID}/mapping/agent_listings/${agentId}`
    );
    if (!response.ok) return null;
    const data = await response.text();
    return parseAgentListing(data);
  } catch {
    return null;
  }
}

/**
 * Check if a nullifier has been used (prevents double-rating)
 */
export async function isNullifierUsed(nullifier: string): Promise<boolean> {
  try {
    const response = await fetch(
      `${ALEO_RPC_URL}/testnet/program/${SHADOW_AGENT_PROGRAM_ID}/mapping/used_nullifiers/${nullifier}`
    );
    if (!response.ok) return false;
    const value = await response.text();
    return value.includes('true');
  } catch {
    return false;
  }
}

// ============================================
// Shield Wallet Transaction Builders
// ============================================

/**
 * Build register_agent transaction inputs for Shield Wallet
 */
export async function buildRegisterAgentInputs(
  serviceType: number,
  endpointUrl: string,
  bondAmount: number = REGISTRATION_BOND
): Promise<RegisterAgentInput> {
  const endpointHash = await hashToField(endpointUrl);

  return {
    service_type: serviceType,
    endpoint_hash: endpointHash,
    bond_amount: bondAmount,
  };
}

/**
 * Build submit_rating transaction inputs for Shield Wallet
 */
export async function buildSubmitRatingInputs(
  agentId: string,
  rating: number,
  paymentAmount: number,
  nullifierSeed: string
): Promise<SubmitRatingInput> {
  const nullifier = await hashToField(`nullifier:${nullifierSeed}:${agentId}`);

  return {
    agent_id: agentId,
    rating: Math.min(50, Math.max(1, Math.round(rating * 10))),
    payment_amount: paymentAmount,
    nullifier,
  };
}

/**
 * Build create_escrow transaction inputs for Shield Wallet
 */
export async function buildCreateEscrowInputs(
  agentAddress: string,
  amount: number,
  jobData: string,
  deadlineBlocks: number,
  secret: string
): Promise<CreateEscrowInput> {
  const jobHash = await hashToField(jobData);
  const secretHash = await hashToField(secret);

  return {
    agent: agentAddress,
    amount,
    job_hash: jobHash,
    deadline: deadlineBlocks,
    secret_hash: secretHash,
  };
}

// ============================================
// Input Formatters
// ============================================

export function formatFieldForLeo(value: string): string {
  if (!value.endsWith('field')) {
    return `${value}field`;
  }
  return value;
}

export function formatU64ForLeo(value: number): string {
  return `${value}u64`;
}

export function formatU8ForLeo(value: number): string {
  return `${value}u8`;
}

export function formatU32ForLeo(value: number): string {
  return `${value}u32`;
}

export function formatAddressForLeo(address: string): string {
  return address;
}

// ============================================
// Helper Functions
// ============================================

/**
 * Parse Aleo struct response into AgentListing
 */
function parseAgentListing(data: string): AgentListing | null {
  try {
    const cleanData = data.replace(/\s+/g, ' ').trim();

    const agentIdMatch = cleanData.match(/agent_id:\s*(\d+)field/);
    const serviceTypeMatch = cleanData.match(/service_type:\s*(\d+)u8/);
    const endpointHashMatch = cleanData.match(/endpoint_hash:\s*(\d+)field/);
    const minTierMatch = cleanData.match(/min_tier:\s*(\d+)u8/);
    const isActiveMatch = cleanData.match(/is_active:\s*(true|false)/);

    if (!agentIdMatch || !serviceTypeMatch) return null;

    return {
      agent_id: agentIdMatch[1],
      service_type: parseInt(serviceTypeMatch[1], 10) as ServiceType,
      endpoint_hash: endpointHashMatch?.[1] || '0',
      tier: parseInt(minTierMatch?.[1] || '0', 10) as Tier,
      is_active: isActiveMatch?.[1] === 'true',
    };
  } catch {
    return null;
  }
}

/**
 * SHA-256 based hash for creating field values
 * Produces a 62-bit integer from the first 8 bytes of a SHA-256 digest
 */
async function hashToField(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hashBuffer = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hex = hashArray.slice(0, 8).map(b => b.toString(16).padStart(2, '0')).join('');
  const value = BigInt('0x' + hex) % (2n ** 62n);
  return value.toString();
}
