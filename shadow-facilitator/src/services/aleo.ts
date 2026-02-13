// ShadowAgent Facilitator - Aleo Service
// Real implementation for Aleo network interaction

import { AgentListing, EscrowProof, ReputationProof, VerificationResult, Tier } from '../types';

// Optional logger - avoid circular dependency with index.ts during tests
let logger: { warn: (msg: string, ...args: unknown[]) => void; error: (msg: string, ...args: unknown[]) => void; debug: (msg: string, ...args: unknown[]) => void } | null = null;
try {
  // Only import if not in test environment
  if (process.env.NODE_ENV !== 'test') {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const index = require('../index');
    logger = index.logger;
  }
} catch {
  // Logger not available
}

// Configuration from environment
const ALEO_RPC_URL = process.env.ALEO_RPC_URL || 'https://api.explorer.aleo.org/v1';
const ALEO_NETWORK = process.env.ALEO_NETWORK || 'testnet';
const PROGRAM_ID = process.env.PROGRAM_ID || 'shadow_agent.aleo';

// Retry configuration
const MAX_RETRIES = 3;
const RETRY_DELAY_MS = 1000;

export class AleoService {
  private rpcUrl: string;
  private programId: string;
  private network: string;

  constructor(rpcUrl?: string, programId?: string) {
    this.rpcUrl = rpcUrl || ALEO_RPC_URL;
    this.programId = programId || PROGRAM_ID;
    this.network = ALEO_NETWORK;
  }

  /**
   * Make a request to the Aleo RPC with retries
   */
  private async fetchWithRetry(
    url: string,
    options: RequestInit = {},
    retries: number = MAX_RETRIES
  ): Promise<Response> {
    let lastError: Error | null = null;

    for (let attempt = 0; attempt < retries; attempt++) {
      try {
        const response = await fetch(url, {
          ...options,
          headers: {
            'Content-Type': 'application/json',
            ...options.headers,
          },
        });
        return response;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
        logger?.warn(`Aleo RPC request failed (attempt ${attempt + 1}/${retries}): ${lastError.message}`);

        if (attempt < retries - 1) {
          await new Promise(resolve => setTimeout(resolve, RETRY_DELAY_MS * (attempt + 1)));
        }
      }
    }

    throw lastError || new Error('Failed to connect to Aleo RPC');
  }

  /**
   * Get current block height from Aleo network
   */
  async getBlockHeight(): Promise<number> {
    const response = await this.fetchWithRetry(
      `${this.rpcUrl}/${this.network}/latest/height`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch block height: ${response.statusText}`);
    }

    const height = await response.json() as number | string;
    return typeof height === 'number' ? height : parseInt(String(height), 10);
  }

  /**
   * Get latest block info
   */
  async getLatestBlock(): Promise<{
    height: number;
    hash: string;
    timestamp: number;
  }> {
    const response = await this.fetchWithRetry(
      `${this.rpcUrl}/${this.network}/latest/block`
    );

    if (!response.ok) {
      throw new Error(`Failed to fetch latest block: ${response.statusText}`);
    }

    const block = await response.json() as {
      header: {
        metadata: {
          height: string;
          timestamp: number;
        };
      };
      block_hash: string;
    };

    return {
      height: parseInt(block.header.metadata.height, 10),
      hash: block.block_hash,
      timestamp: block.header.metadata.timestamp,
    };
  }

  /**
   * Get agent listing from on-chain mapping
   */
  async getAgentListing(agentId: string): Promise<AgentListing | null> {
    try {
      // Format the agent ID for Aleo field type
      const formattedId = this.formatFieldValue(agentId);

      const response = await this.fetchWithRetry(
        `${this.rpcUrl}/${this.network}/program/${this.programId}/mapping/agent_listings/${formattedId}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return null;
        }
        throw new Error(`Failed to fetch agent listing: ${response.statusText}`);
      }

      const data = await response.json();

      if (!data || data === 'null') {
        return null;
      }

      return this.parseAgentListing(agentId, data);
    } catch (error) {
      if ((error as Error).message?.includes('404')) {
        return null;
      }
      logger?.error(`Error fetching agent listing: ${error}`);
      throw error;
    }
  }

  /**
   * Get all agent listings (paginated)
   * Note: Aleo doesn't support listing all mapping keys directly,
   * so this requires indexing transactions or using an indexer
   */
  async getAllAgentListings(
    agentIds: string[]
  ): Promise<AgentListing[]> {
    const listings: AgentListing[] = [];

    // Fetch in parallel with concurrency limit
    const BATCH_SIZE = 10;
    for (let i = 0; i < agentIds.length; i += BATCH_SIZE) {
      const batch = agentIds.slice(i, i + BATCH_SIZE);
      const results = await Promise.all(
        batch.map(id => this.getAgentListing(id).catch(() => null))
      );

      for (const listing of results) {
        if (listing) {
          listings.push(listing);
        }
      }
    }

    return listings;
  }

  /**
   * Check if a nullifier has been used (prevents double-rating)
   */
  async isNullifierUsed(nullifier: string): Promise<boolean> {
    try {
      const formattedNullifier = this.formatFieldValue(nullifier);

      const response = await this.fetchWithRetry(
        `${this.rpcUrl}/${this.network}/program/${this.programId}/mapping/used_nullifiers/${formattedNullifier}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return false;
        }
        throw new Error(`Failed to check nullifier: ${response.statusText}`);
      }

      const data = await response.json();
      return data === true || data === 'true';
    } catch (error) {
      if ((error as Error).message?.includes('404')) {
        return false;
      }
      logger?.error(`Error checking nullifier: ${error}`);
      throw error;
    }
  }

  /**
   * Check if an address is already registered as an agent
   */
  async isAddressRegistered(address: string): Promise<boolean> {
    try {
      const response = await this.fetchWithRetry(
        `${this.rpcUrl}/${this.network}/program/${this.programId}/mapping/registered_agents/${address}`
      );

      if (!response.ok) {
        if (response.status === 404) {
          return false;
        }
        throw new Error(`Failed to check registration: ${response.statusText}`);
      }

      const data = await response.json();
      return data === true || data === 'true';
    } catch (error) {
      if ((error as Error).message?.includes('404')) {
        return false;
      }
      logger?.error(`Error checking registration: ${error}`);
      throw error;
    }
  }

  /**
   * Get the minimum registration bond required
   */
  getRegistrationBond(): number {
    return 10_000_000; // 10 credits in microcredits
  }

  /**
   * Get transaction details by ID
   */
  async getTransaction(transactionId: string): Promise<unknown> {
    const response = await this.fetchWithRetry(
      `${this.rpcUrl}/${this.network}/transaction/${transactionId}`
    );

    if (!response.ok) {
      if (response.status === 404) {
        return null;
      }
      throw new Error(`Failed to fetch transaction: ${response.statusText}`);
    }

    return response.json();
  }

  /**
   * Verify an escrow proof against on-chain state
   * Validates:
   * 1. Proof structure and format
   * 2. Nullifier hasn't been used (prevents double-spend)
   * 3. Transaction exists on-chain and was executed by the correct program
   * 4. On-chain escrow record matches claimed amount
   */
  async verifyEscrowProof(proof: EscrowProof): Promise<VerificationResult> {
    try {
      // Validate proof structure
      if (!proof.proof || !proof.nullifier || !proof.commitment) {
        return {
          valid: false,
          error: 'Invalid proof structure: missing required fields',
        };
      }

      // Check if nullifier has been used
      const nullifierUsed = await this.isNullifierUsed(proof.nullifier);
      if (nullifierUsed) {
        return {
          valid: false,
          error: 'Nullifier already used',
        };
      }

      // Validate proof format
      const isValidFormat = this.validateProofFormat(proof.proof);
      if (!isValidFormat) {
        return {
          valid: false,
          error: 'Invalid proof format',
        };
      }

      // If transaction ID is provided, verify on-chain with full validation
      if (proof.transactionId) {
        const txVerification = await this.verifyTransactionOnChain(
          proof.transactionId,
          this.programId,
          'create_escrow'
        );

        if (!txVerification.valid) {
          return txVerification;
        }

        // Cross-check claimed amount against on-chain record
        if (proof.amount !== undefined && txVerification.outputs?.length) {
          const outputData = this.parseLeoStruct(txVerification.outputs[0]);
          const onChainAmount = this.parseU64(outputData.amount);
          if (onChainAmount !== proof.amount) {
            return {
              valid: false,
              error: `Claimed amount ${proof.amount} does not match on-chain amount ${onChainAmount}`,
            };
          }
        }
      }

      return {
        valid: true,
      };
    } catch (error) {
      logger?.error(`Error verifying escrow proof: ${error}`);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify a reputation proof against on-chain state
   * Validates:
   * 1. Proof structure and type (1=Rating, 2=Jobs, 3=Revenue, 4=Tier)
   * 2. Threshold meets requirements
   * 3. Transaction exists on-chain and was generated by the correct prove_* transition
   * 4. On-chain proof record matches claimed proof_type and threshold
   */
  async verifyReputationProof(
    proof: ReputationProof,
    requiredThreshold?: number
  ): Promise<VerificationResult> {
    try {
      // Validate proof structure
      if (!proof.proof || proof.proof_type === undefined || proof.threshold === undefined) {
        return {
          valid: false,
          error: 'Invalid proof structure: missing required fields',
        };
      }

      // Validate proof type (1=Rating, 2=Jobs, 3=Revenue, 4=Tier)
      if (proof.proof_type < 1 || proof.proof_type > 4) {
        return {
          valid: false,
          error: 'Invalid proof type',
        };
      }

      // Check threshold if provided
      if (requiredThreshold !== undefined && proof.threshold < requiredThreshold) {
        return {
          valid: false,
          error: `Threshold ${proof.threshold} does not meet required ${requiredThreshold}`,
        };
      }

      // Validate proof format
      const isValidFormat = this.validateProofFormat(proof.proof);
      if (!isValidFormat) {
        return {
          valid: false,
          error: 'Invalid proof format',
        };
      }

      // Map proof_type to the expected transition function name
      const proofFunctions: Record<number, string> = {
        1: 'prove_rating',
        2: 'prove_jobs',
        3: 'prove_revenue_range',
        4: 'prove_tier',
      };
      const expectedFunction = proofFunctions[proof.proof_type];

      // If transaction ID is provided, verify on-chain with full validation
      if (proof.transactionId) {
        const txVerification = await this.verifyTransactionOnChain(
          proof.transactionId,
          this.programId,
          expectedFunction
        );

        if (!txVerification.valid) {
          return txVerification;
        }

        // Cross-check proof_type and threshold from on-chain record
        if (txVerification.outputs?.length) {
          const outputData = this.parseLeoStruct(txVerification.outputs[0]);
          const onChainProofType = this.parseU8(outputData.proof_type);
          const onChainThresholdMet = outputData.threshold_met === 'true' || outputData.threshold_met === true;

          if (onChainProofType !== proof.proof_type) {
            return {
              valid: false,
              error: `Claimed proof_type ${proof.proof_type} does not match on-chain type ${onChainProofType}`,
            };
          }

          if (!onChainThresholdMet) {
            return {
              valid: false,
              error: 'On-chain proof indicates threshold was NOT met',
            };
          }
        }
      }

      return {
        valid: true,
        tier: proof.tier,
      };
    } catch (error) {
      logger?.error(`Error verifying reputation proof: ${error}`);
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Verify a transaction exists on-chain and was executed by the expected program/function
   * Returns the transition outputs for further cross-checking
   */
  private async verifyTransactionOnChain(
    transactionId: string,
    expectedProgram: string,
    expectedFunction?: string
  ): Promise<VerificationResult & { outputs?: string[] }> {
    const tx = await this.getTransaction(transactionId) as Record<string, unknown> | null;
    if (!tx) {
      return { valid: false, error: 'Transaction not found on-chain' };
    }

    // Check transaction status
    const status = tx.status as string | undefined;
    if (status && status !== 'accepted') {
      return { valid: false, error: `Transaction status is "${status}", expected "accepted"` };
    }

    // Verify the execution contains transitions from the correct program
    const execution = tx.execution as {
      transitions?: Array<{
        program: string;
        function: string;
        outputs?: Array<{ type: string; value: string }>;
      }>;
    } | undefined;

    if (!execution?.transitions?.length) {
      return { valid: false, error: 'Transaction does not contain program execution' };
    }

    const transition = execution.transitions[0];

    if (transition.program !== expectedProgram) {
      return {
        valid: false,
        error: `Transaction executed on wrong program: ${transition.program}, expected ${expectedProgram}`,
      };
    }

    if (expectedFunction && transition.function !== expectedFunction) {
      return {
        valid: false,
        error: `Transaction function "${transition.function}" does not match expected "${expectedFunction}"`,
      };
    }

    // Extract output values for cross-checking
    const outputs = transition.outputs
      ?.filter(o => o.type === 'record' || o.type === 'private')
      .map(o => o.value) || [];

    return { valid: true, outputs };
  }

  /**
   * Parse raw on-chain data into AgentListing
   */
  private parseAgentListing(agentId: string, data: unknown): AgentListing {
    // Handle Leo struct format from Aleo RPC
    // Format: "{ agent_id: 123field, service_type: 1u8, ... }"
    let parsed: Record<string, unknown>;

    if (typeof data === 'string') {
      // Parse Leo struct format
      parsed = this.parseLeoStruct(data);
    } else {
      parsed = data as Record<string, unknown>;
    }

    return {
      agent_id: agentId,
      service_type: this.parseU8(parsed.service_type),
      endpoint_hash: this.parseField(parsed.endpoint_hash),
      tier: this.parseU8(parsed.min_tier) as Tier,
      is_active: parsed.is_active === true || parsed.is_active === 'true',
      registered_at: parsed.registered_at ? Number(parsed.registered_at) : undefined,
    };
  }

  /**
   * Parse Leo struct string format
   */
  private parseLeoStruct(leoString: string): Record<string, unknown> {
    const result: Record<string, unknown> = {};

    // Remove outer braces and whitespace
    const content = leoString.replace(/^\s*{\s*|\s*}\s*$/g, '');

    // Split by comma, handling nested structures
    const pairs = content.split(',').map(s => s.trim());

    for (const pair of pairs) {
      const colonIndex = pair.indexOf(':');
      if (colonIndex > 0) {
        const key = pair.slice(0, colonIndex).trim();
        const value = pair.slice(colonIndex + 1).trim();
        result[key] = value;
      }
    }

    return result;
  }

  /**
   * Parse Leo u8 value
   */
  private parseU8(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Leo format: "1u8" -> 1
      return parseInt(value.replace('u8', ''), 10);
    }
    return 0;
  }

  /**
   * Parse Leo u64 value
   */
  private parseU64(value: unknown): number {
    if (typeof value === 'number') return value;
    if (typeof value === 'string') {
      // Leo format: "100000u64" -> 100000
      return parseInt(value.replace('u64', ''), 10);
    }
    return 0;
  }

  /**
   * Parse Leo field value
   */
  private parseField(value: unknown): string {
    if (typeof value === 'string') {
      // Leo format: "123field" -> "123"
      return value.replace('field', '');
    }
    return String(value || '');
  }

  /**
   * Format a value as Leo field type
   */
  private formatFieldValue(value: string): string {
    // If already has 'field' suffix, return as-is
    if (value.endsWith('field')) {
      return value;
    }
    // Otherwise, add 'field' suffix
    return `${value}field`;
  }

  /**
   * Validate proof format
   * Aleo proofs are base64 encoded with specific structure
   */
  private validateProofFormat(proof: string): boolean {
    if (!proof || proof.length < 10) {
      return false;
    }

    // Check if it looks like a valid base64-encoded proof
    const base64Regex = /^[A-Za-z0-9+/=]+$/;
    return base64Regex.test(proof);
  }

  /**
   * Get program ID
   */
  getProgramId(): string {
    return this.programId;
  }

  /**
   * Get RPC URL
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Get network
   */
  getNetwork(): string {
    return this.network;
  }

  /**
   * Check if the service is connected and healthy
   */
  async healthCheck(): Promise<{
    healthy: boolean;
    blockHeight?: number;
    error?: string;
  }> {
    try {
      const height = await this.getBlockHeight();
      return {
        healthy: true,
        blockHeight: height,
      };
    } catch (error) {
      return {
        healthy: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }
}

// Export singleton instance
export const aleoService = new AleoService();
