// ShadowAgent SDK - Agent Implementation
// For AI service providers who want to monetize their services

import { Request, Response, NextFunction } from 'express';
import {
  AgentConfig,
  AgentReputation,
  ReputationProof,
  ServiceType,
  ProofType,
  Tier,
  PaymentTerms,
  EscrowProof,
  PartialRefundProposal,
  Dispute,
  DecayedReputation,
} from './types';
import {
  generateAgentId,
  generateSecret,
  hashSecret,
  generateJobHash,
  createReputationProof,
  encodeBase64,
  decodeBase64,
  executeProgram,
  getBlockHeight,
  calculateDecayedRating,
  SHADOW_AGENT_EXT_PROGRAM,
} from './crypto';

const DEFAULT_FACILITATOR_URL = 'http://localhost:3000';
const DEFAULT_PRICE = 100000; // 0.1 credits in microcents
const DEFAULT_DEADLINE_BLOCKS = 100;

// Store pending jobs and their secrets
interface PendingJob {
  secret: string;
  secretHash: string;
  price: number;
  createdAt: number;
  clientProof?: EscrowProof;
}

/**
 * ShadowAgent Server SDK
 *
 * Enables AI service providers to:
 * - Register as agents on the network
 * - Accept x402 payments
 * - Manage reputation proofs
 * - Claim escrow payments
 *
 * @example
 * ```typescript
 * const agent = new ShadowAgentServer({
 *   privateKey: 'your-aleo-private-key',
 *   serviceType: ServiceType.NLP,
 *   pricePerRequest: 100000 // 0.1 credits
 * });
 *
 * // Use as Express middleware
 * app.use('/api', agent.middleware());
 *
 * // Or manually verify payments
 * const isValid = await agent.verifyPayment(req.headers['x-escrow-proof']);
 * ```
 */
export class ShadowAgentServer {
  private config: Required<AgentConfig>;
  private agentId: string = '';
  private _agentIdReady: Promise<void>;
  private pendingJobs: Map<string, PendingJob> = new Map();
  private reputation: AgentReputation | null = null;

  constructor(config: AgentConfig) {
    this.config = {
      privateKey: config.privateKey,
      network: config.network || 'testnet',
      serviceType: config.serviceType,
      pricePerRequest: config.pricePerRequest || DEFAULT_PRICE,
      facilitatorUrl: config.facilitatorUrl || DEFAULT_FACILITATOR_URL,
    };

    // Generate agent ID asynchronously (Web Crypto SHA-256)
    this._agentIdReady = generateAgentId(config.privateKey).then(id => {
      this.agentId = id;
    });

    // Clean up old pending jobs periodically
    setInterval(() => this.cleanupPendingJobs(), 60000);
  }

  /** Ensure agent ID is resolved before use */
  private async ensureAgentId(): Promise<string> {
    await this._agentIdReady;
    return this.agentId;
  }

  /**
   * Register as an agent on the network
   *
   * @param endpointUrl - The URL where your agent service is hosted
   * @param bondAmount - Amount to stake as registration bond (default: 10 credits = 10_000_000 microcredits)
   * @returns Registration result with agentId on success
   */
  async register(
    endpointUrl: string,
    bondAmount: number = 10_000_000
  ): Promise<{ success: boolean; agentId?: string; bondRecord?: string; error?: string }> {
    await this.ensureAgentId();

    // Validate bond amount meets minimum requirement
    const REGISTRATION_BOND = 10_000_000; // 10 credits
    if (bondAmount < REGISTRATION_BOND) {
      return {
        success: false,
        error: `Bond amount ${bondAmount} is below minimum ${REGISTRATION_BOND} (10 credits)`
      };
    }

    // Hash the endpoint URL for privacy
    const endpointHash = await generateAgentId(endpointUrl);

    // In production, this would submit register_agent transaction to Aleo
    // which stakes the bond and creates the AgentReputation + AgentBond records

    const url = `${this.config.facilitatorUrl}/agents/register`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        service_type: this.config.serviceType,
        endpoint_hash: endpointHash,
        bond_amount: bondAmount,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      return { success: false, error: errorData.error || 'Registration failed' };
    }

    const result = await response.json() as { agent_id: string; bond_record?: string };
    this.agentId = result.agent_id;

    return {
      success: true,
      agentId: this.agentId,
      bondRecord: result.bond_record,
    };
  }

  /**
   * Unregister and reclaim bond
   *
   * @returns Unregistration result with bond amount returned
   */
  async unregister(): Promise<{ success: boolean; bondReturned?: number; error?: string }> {
    // In production, this would submit unregister_agent transaction to Aleo
    // which returns the bond and deactivates the agent listing

    const url = `${this.config.facilitatorUrl}/agents/unregister`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent_id: this.agentId,
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({})) as { error?: string };
      return { success: false, error: errorData.error || 'Unregistration failed' };
    }

    const result = await response.json() as { bond_returned: number };
    return {
      success: true,
      bondReturned: result.bond_returned,
    };
  }

  /**
   * Express middleware for x402 payment handling
   */
  middleware(options: { pricePerRequest?: number } = {}) {
    const price = options.pricePerRequest || this.config.pricePerRequest;

    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Skip for OPTIONS (CORS preflight)
      if (req.method === 'OPTIONS') {
        next();
        return;
      }

      // Check for escrow proof
      const proofHeader = req.headers['x-escrow-proof'] as string;
      const jobHash = req.headers['x-job-hash'] as string;

      if (proofHeader && jobHash) {
        // Verify the payment
        const verification = await this.verifyPayment(proofHeader, jobHash, price);

        if (!verification.valid) {
          res.status(402).json({
            error: 'Invalid Payment',
            message: verification.error,
          });
          return;
        }

        // Attach payment info to request
        (req as Request & { payment?: { jobHash: string; amount: number } }).payment = {
          jobHash,
          amount: verification.amount || price,
        };

        // Set up response hook to return delivery secret
        const originalSend = res.send.bind(res);
        res.send = (body: unknown): Response => {
          if (res.statusCode >= 200 && res.statusCode < 300) {
            const pendingJob = this.pendingJobs.get(jobHash);
            if (pendingJob) {
              res.setHeader('X-Delivery-Secret', pendingJob.secret);
              // Agent can now claim the escrow with this secret
            }
          }
          return originalSend(body);
        };

        next();
        return;
      }

      // No payment - return 402 with payment terms
      const newJobHash = await generateJobHash(req.method, req.originalUrl);
      const secret = generateSecret();
      const secretHash = await hashSecret(secret);

      // Store for later verification
      this.pendingJobs.set(newJobHash, {
        secret,
        secretHash,
        price,
        createdAt: Date.now(),
      });

      const paymentTerms: PaymentTerms = {
        price,
        network: `aleo:${this.config.network}`,
        address: this.agentId, // In production, this would be the actual Aleo address
        escrow_required: true,
        secret_hash: secretHash,
        deadline_blocks: DEFAULT_DEADLINE_BLOCKS,
      };

      res.status(402);
      res.setHeader('X-Payment-Required', encodeBase64(paymentTerms));
      res.setHeader('X-Job-Hash', newJobHash);

      res.json({
        error: 'Payment Required',
        message: 'Create an escrow and retry with proof',
        payment_terms: paymentTerms,
        job_hash: newJobHash,
      });
    };
  }

  /**
   * Verify a payment proof
   */
  async verifyPayment(
    proofHeader: string,
    jobHash: string,
    requiredAmount: number
  ): Promise<{ valid: boolean; amount?: number; error?: string }> {
    try {
      const proof = decodeBase64<EscrowProof>(proofHeader);

      // Check amount
      if (proof.amount !== undefined && proof.amount < requiredAmount) {
        return {
          valid: false,
          error: `Insufficient payment: ${proof.amount} < ${requiredAmount}`,
        };
      }

      // Check if job hash matches
      const pendingJob = this.pendingJobs.get(jobHash);
      if (!pendingJob) {
        // Job might have been created by client directly
        // In production, would verify on-chain
      } else {
        // Store the client's proof
        pendingJob.clientProof = proof;
      }

      // In production, would verify:
      // 1. ZK proof is valid
      // 2. Escrow exists on-chain
      // 3. Escrow amount >= required
      // 4. Escrow hasn't been claimed/refunded

      return {
        valid: true,
        amount: proof.amount || requiredAmount,
      };
    } catch (error) {
      return {
        valid: false,
        error: error instanceof Error ? error.message : 'Invalid proof format',
      };
    }
  }

  /**
   * Claim an escrow by revealing the secret
   */
  async claimEscrow(jobHash: string): Promise<{ success: boolean; error?: string }> {
    const pendingJob = this.pendingJobs.get(jobHash);

    if (!pendingJob) {
      return { success: false, error: 'Job not found' };
    }

    // In production, this would submit claim_escrow transaction to Aleo
    // with the secret as proof of delivery

    // For now, remove from pending
    this.pendingJobs.delete(jobHash);

    return { success: true };
  }

  /**
   * Generate a reputation proof
   */
  async proveReputation(
    proofType: ProofType,
    threshold: number
  ): Promise<ReputationProof | null> {
    if (!this.reputation) {
      // Would need to fetch from chain
      return null;
    }

    // Create the proof (used internally for ZK generation)
    const proofResult = await createReputationProof(
      proofType,
      threshold,
      {
        totalJobs: this.reputation.total_jobs,
        totalRatingPoints: this.reputation.total_rating_points,
        totalRevenue: this.reputation.total_revenue,
        tier: this.reputation.tier,
      },
      this.config.privateKey
    );

    return {
      owner: this.agentId,
      proof_type: proofResult.proof_type,
      threshold_met: proofResult.tier >= threshold,
      tier_proven: proofResult.tier,
      generated_at: Date.now(),
    };
  }

  /**
   * Update reputation with a new rating
   */
  async updateReputation(
    ratingRecord: {
      rating: number;
      payment_amount: number;
    }
  ): Promise<{ success: boolean; newTier?: Tier }> {
    if (!this.reputation) {
      return { success: false };
    }

    // In production, this would submit update_reputation transaction to Aleo

    // Update local state (for caching)
    this.reputation.total_jobs += 1;
    this.reputation.total_rating_points += ratingRecord.rating;
    this.reputation.total_revenue += ratingRecord.payment_amount;
    this.reputation.tier = this.calculateTier(
      this.reputation.total_jobs,
      this.reputation.total_revenue
    );
    this.reputation.last_updated = Date.now();

    return {
      success: true,
      newTier: this.reputation.tier,
    };
  }

  /**
   * Update public listing
   */
  async updateListing(
    newServiceType?: ServiceType,
    _newEndpointUrl?: string,
    _isActive?: boolean
  ): Promise<{ success: boolean; error?: string }> {
    // In production, this would submit update_listing transaction to Aleo
    // _newEndpointUrl and _isActive would be used in the on-chain update

    if (newServiceType !== undefined) {
      this.config.serviceType = newServiceType;
    }

    return { success: true };
  }

  /**
   * Get current reputation (from cache or chain)
   */
  async getReputation(): Promise<AgentReputation | null> {
    if (this.reputation) {
      return this.reputation;
    }

    // In production, would fetch from chain via facilitator
    return null;
  }

  /**
   * Get agent ID
   */
  getAgentId(): string {
    return this.agentId;
  }

  /**
   * Get configuration
   */
  getConfig(): Readonly<Omit<AgentConfig, 'privateKey'>> {
    const { privateKey, ...rest } = this.config;
    return rest;
  }

  /**
   * Calculate tier based on jobs and revenue
   */
  private calculateTier(jobs: number, revenue: number): Tier {
    if (jobs >= 1000 && revenue >= 10_000_000_000) return Tier.Diamond;
    if (jobs >= 200 && revenue >= 1_000_000_000) return Tier.Gold;
    if (jobs >= 50 && revenue >= 100_000_000) return Tier.Silver;
    if (jobs >= 10 && revenue >= 10_000_000) return Tier.Bronze;
    return Tier.New;
  }

  /**
   * Clean up old pending jobs
   */
  private cleanupPendingJobs(): void {
    const maxAge = 3600000; // 1 hour
    const now = Date.now();

    for (const [hash, job] of this.pendingJobs.entries()) {
      if (now - job.createdAt > maxAge) {
        this.pendingJobs.delete(hash);
      }
    }
  }

  /**
   * Set reputation (for testing/initialization)
   */
  setReputation(reputation: AgentReputation): void {
    this.reputation = reputation;
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 10a: Partial Refunds
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Accept a partial refund proposal from a client
   */
  async acceptPartialRefund(
    jobHash: string
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    try {
      const url = `${this.config.facilitatorUrl}/refunds/${jobHash}/accept`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: this.agentId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Failed to accept refund' };
      }

      const result = await response.json() as { tx_id?: string };
      return { success: true, txId: result.tx_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to accept refund',
      };
    }
  }

  /**
   * Get pending partial refund proposals
   */
  async getPendingRefundProposals(): Promise<PartialRefundProposal[]> {
    try {
      await this.ensureAgentId();
      const url = `${this.config.facilitatorUrl}/refunds?agent_id=${this.agentId}&status=proposed`;
      const response = await fetch(url);

      if (!response.ok) return [];
      return response.json() as Promise<PartialRefundProposal[]>;
    } catch {
      return [];
    }
  }

  /**
   * Reject a partial refund proposal
   */
  async rejectPartialRefund(
    jobHash: string
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const url = `${this.config.facilitatorUrl}/refunds/${jobHash}/reject`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agent_id: this.agentId }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Failed to reject refund' };
      }

      return { success: true };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to reject refund',
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 10a: Dispute Resolution
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Respond to a dispute with counter-evidence
   */
  async respondToDispute(
    jobHash: string,
    evidenceHash: string
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    try {
      const url = `${this.config.facilitatorUrl}/disputes/${jobHash}/respond`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: this.agentId,
          evidence_hash: evidenceHash,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Failed to respond to dispute' };
      }

      const result = await response.json() as { tx_id?: string };
      return { success: true, txId: result.tx_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to respond to dispute',
      };
    }
  }

  /**
   * Get all open disputes against this agent
   */
  async getOpenDisputes(): Promise<Dispute[]> {
    try {
      await this.ensureAgentId();
      const url = `${this.config.facilitatorUrl}/disputes?agent_id=${this.agentId}&status=open`;
      const response = await fetch(url);

      if (!response.ok) return [];
      return response.json() as Promise<Dispute[]>;
    } catch {
      return [];
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 10a: Reputation Decay
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Get reputation with decay applied (client-side calculation)
   */
  async getReputationWithDecay(): Promise<DecayedReputation | null> {
    if (!this.reputation) return null;

    try {
      const currentBlock = await getBlockHeight();
      const { effectivePoints, decayPeriods, decayFactor } = calculateDecayedRating(
        this.reputation.total_rating_points,
        this.reputation.last_updated,
        currentBlock
      );

      const effectiveAvgRating = this.reputation.total_jobs > 0
        ? (effectivePoints * 10) / this.reputation.total_jobs
        : 0;

      const effectiveTier = this.calculateTier(
        this.reputation.total_jobs,
        this.reputation.total_revenue
      );

      return {
        effective_rating_points: effectivePoints,
        decay_periods: decayPeriods,
        decay_factor: decayFactor,
        effective_average_rating: effectiveAvgRating,
        effective_tier: effectiveTier,
      };
    } catch {
      return null;
    }
  }

  /**
   * Generate a reputation proof with decay applied (on-chain)
   */
  async proveReputationWithDecay(
    proofType: ProofType,
    threshold: number
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    if (!this.reputation) {
      return { success: false, error: 'No reputation data available' };
    }

    try {
      const currentBlock = await getBlockHeight();
      const functionName = proofType === ProofType.Tier
        ? 'prove_tier_with_decay'
        : 'prove_rating_decay';

      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_EXT_PROGRAM,
        functionName,
        [
          `${this.reputation.agent_id}field`,
          `${this.reputation.total_jobs}u64`,
          `${this.reputation.total_rating_points}u64`,
          `${this.reputation.total_revenue}u64`,
          `${this.reputation.tier}u8`,
          `${this.reputation.last_updated}u64`,
          `${threshold}u8`,
          `${currentBlock}u64`,
        ],
      );

      return { success: true, txId };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to generate decayed proof',
      };
    }
  }

  // ═══════════════════════════════════════════════════════════════════
  // Phase 10a: Multi-Sig Escrow
  // ═══════════════════════════════════════════════════════════════════

  /**
   * Approve a multi-sig escrow release
   */
  async approveMultiSigEscrow(
    jobHash: string,
    secret: string
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    try {
      const url = `${this.config.facilitatorUrl}/escrows/multisig/${jobHash}/approve`;
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agent_id: this.agentId,
          secret,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({})) as { error?: string };
        return { success: false, error: errorData.error || 'Failed to approve escrow' };
      }

      const result = await response.json() as { tx_id?: string };
      return { success: true, txId: result.tx_id };
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to approve escrow',
      };
    }
  }
}

// Convenience function to create an agent server
export function createAgent(config: AgentConfig): ShadowAgentServer {
  return new ShadowAgentServer(config);
}
