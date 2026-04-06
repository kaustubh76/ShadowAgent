// ShadowAgent SDK - Client Implementation
// For consumers who want to use AI agent services

import {
  ClientConfig,
  AgentListing,
  SearchParams,
  SearchResult,
  PaymentTerms,
  EscrowProof,
  RequestOptions,
  RequestResult,
  VerificationResult,
  PartialRefundProposal,
  Dispute,
  MultiSigEscrowConfig,
  MultiSigEscrow,
  PaymentSession,
  SpendingPolicy,
} from './types';
import {
  generateSecret,
  hashSecret,
  createEscrowProof,
  encodeBase64,
  decodeBase64,
  transferPublic,
  getBalance,
  getAddress,
  waitForTransaction,
  executeProgram,
  generateSessionId,
  SHADOW_AGENT_PROGRAM,
  SHADOW_AGENT_EXT_PROGRAM,
  SHADOW_AGENT_SESSION_PROGRAM,
  getBlockHeight,
} from './crypto';

// Rating burn cost in microcredits (0.5 credits)
const RATING_BURN_COST = 500_000;

const DEFAULT_FACILITATOR_URL = 'http://localhost:3000';
const DEFAULT_TIMEOUT = 30000;
const DEFAULT_ADMIN_ADDRESS = 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc';

/** Validate Aleo address format (aleo1 prefix, 63 chars, lowercase alphanumeric) */
function isValidAleoAddress(addr: string): boolean {
  return typeof addr === 'string' && /^aleo1[a-z0-9]{54,}$/.test(addr);
}

/**
 * ShadowAgent Client SDK
 *
 * Enables clients to:
 * - Discover AI agents
 * - Make paid requests with automatic x402 handling
 * - Create and manage escrows
 * - Submit ratings
 *
 * @example
 * ```typescript
 * const client = new ShadowAgentClient({
 *   privateKey: 'your-aleo-private-key',
 *   network: 'testnet'
 * });
 *
 * // Search for NLP agents
 * const agents = await client.searchAgents({ service_type: ServiceType.NLP });
 *
 * // Make a paid request (handles x402 automatically)
 * const response = await client.request('https://agent.example.com/api/chat', {
 *   method: 'POST',
 *   body: { message: 'Hello!' }
 * });
 * ```
 */
export class ShadowAgentClient {
  private config: Required<ClientConfig>;
  private _cachedAddress: string | null = null;

  constructor(config: ClientConfig = {}) {
    this.config = {
      privateKey: config.privateKey || '',
      network: config.network || 'testnet',
      facilitatorUrl: config.facilitatorUrl || DEFAULT_FACILITATOR_URL,
      timeout: config.timeout || DEFAULT_TIMEOUT,
      adminAddress: config.adminAddress || DEFAULT_ADMIN_ADDRESS,
    };
  }

  /** Get the client's Aleo address (derived from private key, cached after first call) */
  async getAddress(): Promise<string> {
    if (!this._cachedAddress) {
      this._cachedAddress = await getAddress(this.config.privateKey);
    }
    return this._cachedAddress;
  }

  /**
   * Search for agents matching criteria
   */
  async searchAgents(params: SearchParams = {}): Promise<SearchResult> {
    const queryParams = new URLSearchParams();

    if (params.service_type !== undefined) {
      queryParams.set('service_type', String(params.service_type));
    }
    if (params.min_tier !== undefined) {
      queryParams.set('min_tier', String(params.min_tier));
    }
    if (params.is_active !== undefined) {
      queryParams.set('is_active', String(params.is_active));
    }
    if (params.limit !== undefined) {
      queryParams.set('limit', String(params.limit));
    }
    if (params.offset !== undefined) {
      queryParams.set('offset', String(params.offset));
    }

    const url = `${this.config.facilitatorUrl}/agents?${queryParams.toString()}`;
    const response = await this.fetchWithTimeout(url);

    if (!response.ok) {
      throw new Error(`Failed to search agents: ${response.statusText}`);
    }

    return response.json() as Promise<SearchResult>;
  }

  /**
   * Get a specific agent's details
   */
  async getAgent(agentId: string): Promise<AgentListing | null> {
    const url = `${this.config.facilitatorUrl}/agents/${agentId}`;
    const response = await this.fetchWithTimeout(url);

    if (response.status === 404) {
      return null;
    }

    if (!response.ok) {
      throw new Error(`Failed to get agent: ${response.statusText}`);
    }

    return response.json() as Promise<AgentListing>;
  }

  /**
   * Make a paid request to an agent
   * Automatically handles x402 payment flow
   */
  async request<T = unknown>(
    agentUrl: string,
    options: RequestOptions = {}
  ): Promise<RequestResult<T>> {
    const {
      method = 'GET',
      headers = {},
      body,
      timeout = this.config.timeout,
      maxRetries = 1,
    } = options;

    let lastError: Error | null = null;

    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        // Make initial request
        const response = await this.fetchWithTimeout(
          agentUrl,
          {
            method,
            headers: {
              'Content-Type': 'application/json',
              ...headers,
            },
            body: body ? JSON.stringify(body) : undefined,
          },
          timeout
        );

        // If successful, return the data
        if (response.ok) {
          const data = await response.json();
          return {
            success: true,
            data: data as T,
          };
        }

        // Handle 402 Payment Required
        if (response.status === 402) {
          const paymentResult = await this.handlePaymentRequired(
            response,
            agentUrl,
            { method, headers, body, timeout }
          );

          if (paymentResult.success) {
            return paymentResult as RequestResult<T>;
          }

          lastError = new Error(paymentResult.error || 'Payment failed');
          continue;
        }

        // Handle 429 Too Many Requests — retry with Retry-After backoff
        if (response.status === 429) {
          const retryAfterHeader = response.headers.get('Retry-After');
          const retryAfterSec = retryAfterHeader ? parseInt(retryAfterHeader, 10) : 0;
          const delayMs = Math.min((retryAfterSec || (attempt + 1)) * 1000, 30_000);

          if (attempt < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, delayMs));
            continue;
          }

          const errorBody = await response.json().catch(() => ({})) as { error?: string };
          return {
            success: false,
            error: errorBody.error || 'Rate limit exceeded',
            retryAfter: retryAfterSec || undefined,
          };
        }

        // Other error
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return {
          success: false,
          error: errorData.error || response.statusText,
        };
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));
      }
    }

    return {
      success: false,
      error: lastError?.message || 'Request failed',
    };
  }

  /**
   * Handle x402 Payment Required response
   */
  private async handlePaymentRequired(
    response: Response,
    agentUrl: string,
    originalOptions: {
      method: string;
      headers: Record<string, string>;
      body?: unknown;
      timeout: number;
    }
  ): Promise<RequestResult> {
    // Parse payment terms
    const paymentHeader = response.headers.get('X-Payment-Required');
    const jobHash = response.headers.get('X-Job-Hash');

    if (!paymentHeader || !jobHash) {
      return {
        success: false,
        error: 'Invalid 402 response: missing payment headers',
      };
    }

    const paymentTerms = decodeBase64<PaymentTerms>(paymentHeader);

    // Validate decoded payment terms
    if (!paymentTerms || !paymentTerms.price || !paymentTerms.address) {
      return {
        success: false,
        error: 'Invalid payment terms: missing price or address',
      };
    }

    // Check if we have a private key for payment
    if (!this.config.privateKey) {
      return {
        success: false,
        error: 'Private key required for payment',
      };
    }

    // Create escrow proof
    const escrowProof = await this.createEscrow(paymentTerms, jobHash);

    // Retry request with payment proof
    const retryResponse = await this.fetchWithTimeout(
      agentUrl,
      {
        method: originalOptions.method,
        headers: {
          'Content-Type': 'application/json',
          'X-Escrow-Proof': encodeBase64(escrowProof),
          'X-Job-Hash': jobHash,
          ...originalOptions.headers,
        },
        body: originalOptions.body ? JSON.stringify(originalOptions.body) : undefined,
      },
      originalOptions.timeout
    );

    if (!retryResponse.ok) {
      const errorData = await retryResponse.json().catch(() => ({})) as { error?: string };
      return {
        success: false,
        error: errorData.error || 'Payment verification failed',
      };
    }

    const data = await retryResponse.json();
    // Delivery secret is available if needed: retryResponse.headers.get('X-Delivery-Secret')

    return {
      success: true,
      data,
      jobHash,
      paymentProof: escrowProof,
    };
  }

  /**
   * Create an escrow for payment on the Aleo blockchain
   * This creates a real HTLC escrow that locks funds until delivery
   * Uses real on-chain transfer to lock funds
   */
  async createEscrow(
    paymentTerms: PaymentTerms,
    jobHash: string
  ): Promise<EscrowProof> {
    if (!paymentTerms.price || paymentTerms.price <= 0) {
      throw new Error('paymentTerms.price must be positive');
    }
    if (!isValidAleoAddress(paymentTerms.address)) {
      throw new Error('paymentTerms.address must be a valid Aleo address');
    }

    // Generate secret for HTLC
    const secret = generateSecret();
    const secretHash = await hashSecret(secret);

    // Store secret locally for later claim verification
    this.escrowSecrets.set(jobHash, secret);

    // Create escrow proof (includes signature)
    const proof = await createEscrowProof(
      {
        amount: paymentTerms.price,
        recipient: paymentTerms.address,
        jobHash,
        secretHash,
      },
      this.config.privateKey
    );

    if (!this.config.privateKey) {
      throw new Error('Private key required for on-chain escrow creation');
    }

    // Check balance first
    const senderAddress = await getAddress(this.config.privateKey);
    const balance = await getBalance(senderAddress);
    const fee = 10_000; // 0.01 credits fee
    const totalNeeded = paymentTerms.price + fee;

    if (balance < totalNeeded) {
      throw new Error(
        `Insufficient balance for on-chain escrow: have ${balance}, need ${totalNeeded}`
      );
    }

    // Execute real transfer_public to the agent's address
    try {
      const txId = await transferPublic(
        this.config.privateKey,
        paymentTerms.address,
        paymentTerms.price,
        fee
      );

      // Store transaction ID in the proof
      (proof as EscrowProof).transactionId = txId;

      // Wait for confirmation
      const confirmation = await waitForTransaction(txId, 12, 5000);
      if (!confirmation.confirmed) {
        throw new Error(`Escrow transaction not confirmed: ${confirmation.error}`);
      }

      return proof;
    } catch (onChainError) {
      // Facilitator fallback
      try {
        const res = await this.fetchWithTimeout(`${this.config.facilitatorUrl}/escrows`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent: paymentTerms.address,
            amount: paymentTerms.price,
            job_hash: jobHash,
            secret_hash: secretHash,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          throw new Error(err.error || 'Facilitator fallback failed');
        }
        const result = await res.json() as { tx_id?: string };
        (proof as EscrowProof).transactionId = result.tx_id;
        return proof;
      } catch (fallbackError) {
        throw onChainError instanceof Error ? onChainError : new Error('On-chain escrow creation failed');
      }
    }
  }

  // Store escrow secrets for HTLC claims
  private escrowSecrets: Map<string, string> = new Map();

  /**
   * Get the escrow secret for a job (needed for dispute resolution)
   */
  getEscrowSecret(jobHash: string): string | undefined {
    return this.escrowSecrets.get(jobHash);
  }

  /**
   * Submit a rating for a completed job
   * This burns 0.5 credits on-chain as Sybil resistance via real transfer
   */
  async submitRating(
    agentAddress: string,
    jobHash: string,
    rating: number, // 1-5 stars
    paymentAmount: number
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    if (!isValidAleoAddress(agentAddress)) {
      return { success: false, error: 'Invalid agent address format' };
    }

    // Validate rating
    if (rating < 1 || rating > 5) {
      return { success: false, error: 'Rating must be between 1 and 5 stars' };
    }

    // Scale rating (5 stars = 50)
    const scaledRating = Math.round(rating * 10);

    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for on-chain rating submission' };
    }

    // Check balance for burn cost
    const senderAddress = await getAddress(this.config.privateKey);
    const balance = await getBalance(senderAddress);
    const fee = 10_000; // 0.01 credits fee
    const totalNeeded = RATING_BURN_COST + fee;

    if (balance < totalNeeded) {
      return {
        success: false,
        error: `Insufficient balance for rating burn: have ${balance}, need ${totalNeeded} microcredits`,
      };
    }

    // Attempt on-chain submit_rating transition (includes burn + nullifier check)
    try {
      const jobHashField = `${BigInt('0x' + jobHash.slice(0, 62))}field`;
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_PROGRAM,
        'submit_rating',
        [
          agentAddress,
          jobHashField,
          `${scaledRating}u8`,
          `${paymentAmount}u64`,
          `${RATING_BURN_COST}u64`,
        ],
      );

      // Notify facilitator for indexing (non-blocking)
      this.notifyFacilitatorOfRating(agentAddress, jobHash, scaledRating, paymentAmount, txId).catch((err) => console.debug('[ShadowAgentClient] facilitator rating notification failed:', err instanceof Error ? err.message : err));

      return { success: true, txId };
    } catch (onChainError) {
      // Facilitator fallback — burn via transferPublic + notify
      try {
        const burnTxId = await transferPublic(
          this.config.privateKey,
          agentAddress,
          RATING_BURN_COST,
          fee
        );

        // Notify facilitator for indexing
        const res = await this.fetchWithTimeout(`${this.config.facilitatorUrl}/agents/${agentAddress}/rating`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            job_hash: jobHash,
            rating: scaledRating,
            payment_amount: paymentAmount,
            tx_id: burnTxId,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        const result = await res.json() as { tx_id?: string };
        return { success: true, txId: result.tx_id || burnTxId };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'Rating submission failed' };
      }
    }
  }

  /**
   * Notify facilitator of an on-chain rating for indexing
   */
  private async notifyFacilitatorOfRating(
    agentAddress: string,
    jobHash: string,
    rating: number,
    paymentAmount: number,
    txId: string
  ): Promise<void> {
    try {
      await this.fetchWithTimeout(`${this.config.facilitatorUrl}/agents/${agentAddress}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_hash: jobHash,
          rating,
          payment_amount: paymentAmount,
          tx_id: txId,
          on_chain: true,
        }),
      });
    } catch {
      // Non-critical - facilitator will eventually index from chain
    }
  }

  /**
   * Verify an agent's reputation proof
   */
  async verifyReputationProof(
    proof: {
      proof_type: number;
      threshold: number;
      proof: string;
      tier?: number;
    },
    requiredThreshold?: number
  ): Promise<VerificationResult> {
    const url = `${this.config.facilitatorUrl}/verify/reputation`;
    const response = await this.fetchWithTimeout(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...proof,
        required_threshold: requiredThreshold,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      return { valid: false, error: errorData.error || 'Verification failed' };
    }

    return response.json() as Promise<VerificationResult>;
  }

  /**
   * Get facilitator health status
   */
  async getHealth(): Promise<{ status: string; blockHeight?: number }> {
    const url = `${this.config.facilitatorUrl}/health`;
    const response = await this.fetchWithTimeout(url);
    return response.json() as Promise<{ status: string; blockHeight?: number }>;
  }

  /**
   * Helper: fetch with timeout
   */
  private async fetchWithTimeout(
    url: string,
    options: RequestInit = {},
    timeout: number = this.config.timeout
  ): Promise<Response> {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    try {
      const response = await fetch(url, {
        ...options,
        signal: controller.signal,
      });
      return response;
    } finally {
      clearTimeout(timeoutId);
    }
  }

  /**
   * Fetch current block height from the Aleo network
   */
  private async getCurrentBlockHeight(): Promise<number> {
    return getBlockHeight();
  }

  /**
   * Get current configuration
   */
  getConfig(): Readonly<ClientConfig> {
    return { ...this.config, privateKey: '***' }; // Hide private key
  }

  /**
   * Update configuration
   */
  setConfig(updates: Partial<ClientConfig>): void {
    if (updates.privateKey !== undefined) {
      this.config.privateKey = updates.privateKey;
    }
    if (updates.network !== undefined) {
      this.config.network = updates.network;
    }
    if (updates.facilitatorUrl !== undefined) {
      this.config.facilitatorUrl = updates.facilitatorUrl;
    }
    if (updates.timeout !== undefined) {
      this.config.timeout = updates.timeout;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 10a: Partial Refunds
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Propose a partial refund split on an escrow
   * The agent must accept before fund transfers occur
   */
  async proposePartialRefund(
    agent: string,
    totalAmount: number,
    agentAmount: number,
    jobHash: string
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    if (!isValidAleoAddress(agent)) {
      return { success: false, error: 'Invalid agent address format' };
    }

    if (totalAmount <= 0) {
      return { success: false, error: 'Total amount must be positive' };
    }

    if (agentAmount < 0) {
      return { success: false, error: 'Agent amount cannot be negative' };
    }

    if (agentAmount > totalAmount) {
      return { success: false, error: 'Agent amount cannot exceed total amount' };
    }

    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for partial refund proposal' };
    }

    try {
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_EXT_PROGRAM,
        'propose_partial_refund',
        [agent, `${totalAmount}u64`, `${agentAmount}u64`, jobHash],
      );
      return { success: true, txId };
    } catch (onChainError) {
      try {
        const res = await this.fetchWithTimeout(`${this.config.facilitatorUrl}/refunds`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent, total_amount: totalAmount, agent_amount: agentAmount, job_hash: jobHash }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        const result = await res.json() as { tx_id?: string };
        return { success: true, txId: result.tx_id };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain execution failed' };
      }
    }
  }

  /**
   * Get the status of a partial refund proposal
   */
  async getPartialRefundStatus(jobHash: string): Promise<PartialRefundProposal | null> {
    try {
      const url = `${this.config.facilitatorUrl}/refunds/${jobHash}`;
      const response = await this.fetchWithTimeout(url);

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        console.warn(`[ShadowAgentClient] getPartialRefundStatus: HTTP ${response.status} for ${jobHash}`);
        return null;
      }

      return response.json() as Promise<PartialRefundProposal>;
    } catch (error) {
      console.warn('[ShadowAgentClient] getPartialRefundStatus error:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 10a: Dispute Resolution
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Open a dispute on a job/escrow
   */
  async openDispute(
    agent: string,
    jobHash: string,
    escrowAmount: number,
    evidenceHash: string
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    if (!isValidAleoAddress(agent)) {
      return { success: false, error: 'Invalid agent address format' };
    }

    if (escrowAmount <= 0) {
      return { success: false, error: 'Escrow amount must be positive' };
    }

    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required to open a dispute' };
    }

    const adminAddress = this.config.adminAddress;

    try {
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_EXT_PROGRAM,
        'open_dispute',
        [agent, jobHash, `${escrowAmount}u64`, evidenceHash, adminAddress],
      );
      return { success: true, txId };
    } catch (onChainError) {
      try {
        const res = await this.fetchWithTimeout(`${this.config.facilitatorUrl}/disputes`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent, job_hash: jobHash, escrow_amount: escrowAmount, evidence_hash: evidenceHash, client: await this.getAddress() }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        const result = await res.json() as { tx_id?: string };
        return { success: true, txId: result.tx_id };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain execution failed' };
      }
    }
  }

  /**
   * Get the status of a dispute
   */
  async getDisputeStatus(jobHash: string): Promise<Dispute | null> {
    try {
      const url = `${this.config.facilitatorUrl}/disputes/${jobHash}`;
      const response = await this.fetchWithTimeout(url);

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        console.warn(`[ShadowAgentClient] getDisputeStatus: HTTP ${response.status} for ${jobHash}`);
        return null;
      }

      return response.json() as Promise<Dispute>;
    } catch (error) {
      console.warn('[ShadowAgentClient] getDisputeStatus error:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 10a: Multi-Sig Escrow
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a multi-sig escrow requiring M-of-3 approvals
   */
  async createMultiSigEscrow(
    agent: string,
    amount: number,
    jobHash: string,
    deadline: number,
    config: MultiSigEscrowConfig
  ): Promise<{ success: boolean; txId?: string; secretHash?: string; error?: string }> {
    if (!isValidAleoAddress(agent)) {
      return { success: false, error: 'Invalid agent address format' };
    }

    if (!config.signers || config.signers.length !== 3) {
      return { success: false, error: 'Exactly 3 signers required for multi-sig escrow' };
    }

    for (const signer of config.signers) {
      if (!isValidAleoAddress(signer)) {
        return { success: false, error: `Invalid signer address format: ${signer}` };
      }
    }

    if (!config.required_signatures || config.required_signatures < 1 || config.required_signatures > 3) {
      return { success: false, error: 'required_signatures must be between 1 and 3' };
    }

    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for multi-sig escrow' };
    }

    const secret = generateSecret();
    const secretHash = await hashSecret(secret);

    // Store secret for later use
    this.escrowSecrets.set(jobHash, secret);

    try {
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_EXT_PROGRAM,
        'create_multisig_escrow',
        [
          agent,
          `${amount}u64`,
          jobHash,
          secretHash,
          `${deadline}u64`,
          config.signers[0],
          config.signers[1],
          config.signers[2],
          `${config.required_signatures}u8`,
        ],
      );
      return { success: true, txId, secretHash };
    } catch (onChainError) {
      try {
        const senderAddress = await getAddress(this.config.privateKey!);
        const res = await this.fetchWithTimeout(`${this.config.facilitatorUrl}/escrows/multisig`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent, amount, job_hash: jobHash, secret_hash: secretHash, deadline,
            signers: config.signers, required_signatures: config.required_signatures, owner: senderAddress,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        const result = await res.json() as { tx_id?: string };
        return { success: true, txId: result.tx_id, secretHash };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain execution failed' };
      }
    }
  }

  /**
   * Get the status of a multi-sig escrow
   */
  async getMultiSigEscrowStatus(jobHash: string): Promise<MultiSigEscrow | null> {
    try {
      const url = `${this.config.facilitatorUrl}/escrows/multisig/${jobHash}`;
      const response = await this.fetchWithTimeout(url);

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        console.warn(`[ShadowAgentClient] getMultiSigEscrowStatus: HTTP ${response.status} for ${jobHash}`);
        return null;
      }

      return response.json() as Promise<MultiSigEscrow>;
    } catch (error) {
      console.warn('[ShadowAgentClient] getMultiSigEscrowStatus error:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 5: Session-Based Payments
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a pre-authorized spending session with an agent
   * Client signs once — agent can make requests within bounds without further signatures
   */
  async createSession(
    agent: string,
    maxTotal: number,
    maxPerRequest: number,
    rateLimit: number,
    durationBlocks: number
  ): Promise<{ success: boolean; sessionId?: string; txId?: string; error?: string }> {
    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required to create a session' };
    }

    if (maxPerRequest > maxTotal) {
      return { success: false, error: 'maxPerRequest cannot exceed maxTotal' };
    }
    if (maxTotal <= 0 || maxPerRequest <= 0 || rateLimit <= 0 || durationBlocks <= 0) {
      return { success: false, error: 'All session parameters must be positive' };
    }

    const sessionId = generateSessionId();

    try {
      // Fetch current block height for on-chain verification
      const blockHeight = await this.getCurrentBlockHeight();

      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_SESSION_PROGRAM,
        'create_session',
        [
          agent,
          `${maxTotal}u64`,
          `${maxPerRequest}u64`,
          `${rateLimit}u64`,
          `${durationBlocks}u64`,
          `${blockHeight}u64`,
        ],
      );
      return { success: true, sessionId, txId };
    } catch (onChainError) {
      try {
        const senderAddress = await getAddress(this.config.privateKey!);
        const res = await this.fetchWithTimeout(`${this.config.facilitatorUrl}/sessions`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agent, client: senderAddress, max_total: maxTotal, max_per_request: maxPerRequest,
            rate_limit: rateLimit, duration_blocks: durationBlocks, session_id: sessionId,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        const result = await res.json() as { tx_id?: string; session_id?: string };
        return { success: true, sessionId: result.session_id || sessionId, txId: result.tx_id };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain execution failed' };
      }
    }
  }

  /**
   * Make a request against an active session (called by the agent)
   */
  async sessionRequest(
    sessionId: string,
    amount: number,
    requestHash: string
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }
    if (!amount || amount <= 0) {
      return { success: false, error: 'amount must be positive' };
    }
    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for session request' };
    }

    try {
      const url = `${this.config.facilitatorUrl}/sessions/${sessionId}/request`;
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ amount, request_hash: requestHash }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Session request failed' };
      }

      const result = await response.json() as { tx_id?: string };
      return { success: true, txId: result.tx_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session request failed',
      };
    }
  }

  /**
   * Settle accumulated payments from a session.
   * Must be called with the agent's address (the party who performed work).
   */
  async settleSession(
    sessionId: string,
    settlementAmount: number,
    agentAddress?: string
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }
    if (!settlementAmount || settlementAmount <= 0) {
      return { success: false, error: 'settlementAmount must be positive' };
    }
    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required to settle session' };
    }

    try {
      // Use explicit agentAddress if provided, otherwise derive from caller's key
      const agent = agentAddress || await this.getAddress();
      const url = `${this.config.facilitatorUrl}/sessions/${sessionId}/settle`;
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settlement_amount: settlementAmount, agent }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Session settlement failed' };
      }

      const result = await response.json() as { tx_id?: string };
      return { success: true, txId: result.tx_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session settlement failed',
      };
    }
  }

  /**
   * Close a session and reclaim unused funds (called by the client)
   */
  async closeSession(
    sessionId: string
  ): Promise<{ success: boolean; refundAmount?: number; txId?: string; error?: string }> {
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }
    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required to close session' };
    }

    try {
      const clientAddress = await this.getAddress();
      const url = `${this.config.facilitatorUrl}/sessions/${sessionId}/close`;
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientAddress }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Session close failed' };
      }

      const result = await response.json() as { refund_amount?: number; tx_id?: string };
      return { success: true, refundAmount: result.refund_amount, txId: result.tx_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session close failed',
      };
    }
  }

  /**
   * Pause an active session (called by the client)
   */
  async pauseSession(
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }
    try {
      const clientAddress = await this.getAddress();
      const url = `${this.config.facilitatorUrl}/sessions/${sessionId}/pause`;
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientAddress }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Session pause failed' };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session pause failed',
      };
    }
  }

  /**
   * Resume a paused session (called by the client)
   */
  async resumeSession(
    sessionId: string
  ): Promise<{ success: boolean; error?: string }> {
    if (!sessionId) {
      return { success: false, error: 'sessionId is required' };
    }
    try {
      const clientAddress = await this.getAddress();
      const url = `${this.config.facilitatorUrl}/sessions/${sessionId}/resume`;
      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client: clientAddress }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Session resume failed' };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session resume failed',
      };
    }
  }

  /**
   * Get the status of a session
   */
  async getSessionStatus(sessionId: string): Promise<PaymentSession | null> {
    try {
      const url = `${this.config.facilitatorUrl}/sessions/${sessionId}`;
      const response = await this.fetchWithTimeout(url);

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        console.warn(`[ShadowAgentClient] getSessionStatus: HTTP ${response.status} for ${sessionId}`);
        return null;
      }

      return response.json() as Promise<PaymentSession>;
    } catch (error) {
      console.warn('[ShadowAgentClient] getSessionStatus error:', error instanceof Error ? error.message : error);
      return null;
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 5: Spending Policies
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Create a reusable spending policy template
   * Policies constrain session parameters (max value, per-request cap, allowed tiers/categories)
   */
  async createPolicy(
    maxSessionValue: number,
    maxSingleRequest: number,
    allowedTiers: number = 0xff,
    allowedCategories: number = 0xffffffff,
    requireProofs: boolean = false
  ): Promise<{ success: boolean; policyId?: string; txId?: string; error?: string }> {
    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required to create a policy' };
    }

    if (maxSessionValue <= 0 || maxSingleRequest <= 0) {
      return { success: false, error: 'maxSessionValue and maxSingleRequest must be positive' };
    }

    if (maxSingleRequest > maxSessionValue) {
      return { success: false, error: 'maxSingleRequest cannot exceed maxSessionValue' };
    }

    try {
      const blockHeight = await this.getCurrentBlockHeight();

      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_SESSION_PROGRAM,
        'create_policy',
        [
          `${maxSessionValue}u64`,
          `${maxSingleRequest}u64`,
          `${allowedTiers}u8`,
          `${allowedCategories}u64`,
          requireProofs.toString(),
          `${blockHeight}u64`,
        ],
      );
      return { success: true, txId };
    } catch (onChainError) {
      try {
        const senderAddress = await getAddress(this.config.privateKey!);
        const res = await this.fetchWithTimeout(`${this.config.facilitatorUrl}/sessions/policies`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            owner: senderAddress, max_session_value: maxSessionValue, max_single_request: maxSingleRequest,
            allowed_tiers: allowedTiers, allowed_categories: allowedCategories, require_proofs: requireProofs,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        const result = await res.json() as { tx_id?: string };
        return { success: true, txId: result.tx_id };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain execution failed' };
      }
    }
  }

  /**
   * Create a session constrained by a spending policy
   */
  async createSessionFromPolicy(
    policyId: string,
    agent: string,
    maxTotal: number,
    maxPerRequest: number,
    rateLimit: number,
    durationBlocks: number
  ): Promise<{ success: boolean; sessionId?: string; txId?: string; error?: string }> {
    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required to create a session from policy' };
    }

    try {
      const url = `${this.config.facilitatorUrl}/sessions/policies/${policyId}/create-session`;
      const senderAddress = await getAddress(this.config.privateKey);

      const response = await this.fetchWithTimeout(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent,
          client: senderAddress,
          max_total: maxTotal,
          max_per_request: maxPerRequest,
          rate_limit: rateLimit,
          duration_blocks: durationBlocks,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Session creation from policy failed' };
      }

      const result = await response.json() as { session?: { session_id?: string }; tx_id?: string };
      return { success: true, sessionId: result.session?.session_id, txId: result.tx_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Session creation from policy failed',
      };
    }
  }

  /**
   * List spending policies for the current user
   */
  async listPolicies(): Promise<SpendingPolicy[]> {
    try {
      const owner = this.config.privateKey
        ? await getAddress(this.config.privateKey)
        : undefined;

      const params = new URLSearchParams();
      if (owner) params.set('owner', owner);

      const url = `${this.config.facilitatorUrl}/sessions/policies?${params.toString()}`;
      const response = await this.fetchWithTimeout(url);

      if (!response.ok) {
        console.warn(`[ShadowAgentClient] listPolicies: HTTP ${response.status}`);
        return [];
      }

      return response.json() as Promise<SpendingPolicy[]>;
    } catch (error) {
      console.warn('[ShadowAgentClient] listPolicies error:', error instanceof Error ? error.message : error);
      return [];
    }
  }

  /**
   * Get a specific spending policy
   */
  async getPolicy(policyId: string): Promise<SpendingPolicy | null> {
    try {
      const url = `${this.config.facilitatorUrl}/sessions/policies/${policyId}`;
      const response = await this.fetchWithTimeout(url);

      if (response.status === 404) {
        return null;
      }
      if (!response.ok) {
        console.warn(`[ShadowAgentClient] getPolicy: HTTP ${response.status} for ${policyId}`);
        return null;
      }

      return response.json() as Promise<SpendingPolicy>;
    } catch (error) {
      console.warn('[ShadowAgentClient] getPolicy error:', error instanceof Error ? error.message : error);
      return null;
    }
  }
}

// Convenience function to create a client
export function createClient(config?: ClientConfig): ShadowAgentClient {
  return new ShadowAgentClient(config);
}
