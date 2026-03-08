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
  getAddress,
  waitForTransaction,
  getTransactionRecordOutputs,
  calculateDecayedRating,
  SHADOW_AGENT_PROGRAM,
  SHADOW_AGENT_EXT_PROGRAM,
} from './crypto';
import { RecordStore } from './recordStore';

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
  private recordStore: RecordStore;

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

    // Record store for tracking on-chain record ciphertexts (UTXO model)
    this.recordStore = new RecordStore();

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
  ): Promise<{ success: boolean; agentId?: string; bondRecord?: string; txId?: string; error?: string }> {
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

    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for on-chain registration' };
    }

    try {
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_PROGRAM,
        'register_agent',
        [
          `${this.config.serviceType}u8`,
          `${endpointHash}field`,
          `${bondAmount}u64`,
        ],
      );

      // Wait for confirmation
      const confirmation = await waitForTransaction(txId, 12, 5000);

      if (!confirmation.confirmed) {
        return { success: false, error: confirmation.error || 'Transaction not confirmed' };
      }

      // Extract and store output records (AgentReputation, AgentBond)
      const recordOutputs = await getTransactionRecordOutputs(txId);
      const address = await getAddress(this.config.privateKey);

      if (recordOutputs.length >= 2) {
        this.recordStore.store({
          key: `${txId}:0`,
          programId: SHADOW_AGENT_PROGRAM,
          recordType: 'AgentReputation',
          ciphertext: recordOutputs[0],
          owner: address,
          createdAt: Date.now(),
          consumed: false,
        });
        this.recordStore.store({
          key: `${txId}:1`,
          programId: SHADOW_AGENT_PROGRAM,
          recordType: 'AgentBond',
          ciphertext: recordOutputs[1],
          owner: address,
          createdAt: Date.now(),
          consumed: false,
        });
      }

      // Notify facilitator for indexing (non-blocking)
      this.notifyFacilitatorRegistration(endpointHash, bondAmount, txId).catch(() => {});

      return { success: true, agentId: this.agentId, txId };
    } catch (onChainError) {
      try {
        const address = await getAddress(this.config.privateKey!);
        const res = await fetch(`${this.config.facilitatorUrl}/agents/register`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            address, service_type: this.config.serviceType,
            endpoint_hash: endpointHash, bond_amount: bondAmount,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        const result = await res.json() as { tx_id?: string; agent_id?: string };
        return { success: true, agentId: result.agent_id || this.agentId, txId: result.tx_id };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain registration failed' };
      }
    }
  }

  /**
   * Notify facilitator of on-chain registration for indexing
   */
  private async notifyFacilitatorRegistration(
    endpointHash: string,
    bondAmount: number,
    txId: string,
  ): Promise<void> {
    try {
      const address = await getAddress(this.config.privateKey);
      await fetch(`${this.config.facilitatorUrl}/agents/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          address,
          service_type: this.config.serviceType,
          endpoint_hash: endpointHash,
          bond_amount: bondAmount,
          tx_id: txId,
        }),
      });
    } catch (error) {
      console.warn('Failed to notify facilitator of registration:', error instanceof Error ? error.message : error);
    }
  }

  /**
   * Unregister and reclaim bond
   *
   * @returns Unregistration result with bond amount returned
   */
  async unregister(): Promise<{ success: boolean; bondReturned?: number; txId?: string; error?: string }> {
    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for on-chain unregistration' };
    }

    const address = await getAddress(this.config.privateKey);
    const repRecord = this.recordStore.getLatest(SHADOW_AGENT_PROGRAM, 'AgentReputation', address);
    const bondRecord = this.recordStore.getLatest(SHADOW_AGENT_PROGRAM, 'AgentBond', address);

    if (!repRecord || !bondRecord) {
      return { success: false, error: 'Missing AgentReputation or AgentBond records. Register first or import records.' };
    }

    try {
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_PROGRAM,
        'unregister_agent',
        [repRecord.ciphertext, bondRecord.ciphertext],
      );

      // Mark old records as consumed
      this.recordStore.markConsumed(repRecord.key);
      this.recordStore.markConsumed(bondRecord.key);

      // Wait for confirmation and extract returned bond record
      const confirmation = await waitForTransaction(txId, 12, 5000);
      if (confirmation.confirmed) {
        const outputs = await getTransactionRecordOutputs(txId);
        if (outputs.length >= 1) {
          this.recordStore.store({
            key: `${txId}:0`,
            programId: SHADOW_AGENT_PROGRAM,
            recordType: 'AgentBond',
            ciphertext: outputs[0],
            owner: address,
            createdAt: Date.now(),
            consumed: false,
            metadata: { returned: true },
          });
        }
      }

      return { success: true, txId };
    } catch (onChainError) {
      try {
        const res = await fetch(`${this.config.facilitatorUrl}/agents/unregister`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ agent_id: this.agentId, address }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        const result = await res.json() as { tx_id?: string };
        return { success: true, txId: result.tx_id };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain unregistration failed' };
      }
    }
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
        address: await getAddress(this.config.privateKey),
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

      // Store the client's proof for later claim
      const pendingJob = this.pendingJobs.get(jobHash);
      if (pendingJob) {
        pendingJob.clientProof = proof;
      }

      // On-chain verification required when transaction ID is provided
      if (proof.transactionId) {
        const response = await fetch(
          `https://api.explorer.provable.com/v1/testnet/transaction/${proof.transactionId}`
        );

        if (!response.ok) {
          return {
            valid: false,
            error: `Failed to verify transaction on-chain: ${response.statusText}`,
          };
        }

        const tx = await response.json() as {
          status?: string;
          execution?: {
            transitions?: Array<{
              program: string;
              function: string;
            }>;
          };
        };

        // Verify transaction is accepted
        if (tx.status && tx.status !== 'accepted') {
          return {
            valid: false,
            error: `Transaction status: ${tx.status}, expected accepted`,
          };
        }

        // Verify it's from the correct program
        const transition = tx.execution?.transitions?.[0];
        if (transition) {
          const validPrograms = [SHADOW_AGENT_PROGRAM, 'credits.aleo'];
          if (!validPrograms.includes(transition.program)) {
            return {
              valid: false,
              error: `Unexpected program: ${transition.program}`,
            };
          }
        }

        return { valid: true, amount: proof.amount || requiredAmount };
      }

      // No transaction ID — require on-chain proof
      return {
        valid: false,
        error: 'Missing transactionId — on-chain payment proof required',
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
  async claimEscrow(jobHash: string): Promise<{ success: boolean; txId?: string; error?: string }> {
    const pendingJob = this.pendingJobs.get(jobHash);

    if (!pendingJob) {
      return { success: false, error: 'Job not found' };
    }

    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for on-chain escrow claim' };
    }

    if (!pendingJob.clientProof?.escrowCiphertext) {
      return { success: false, error: 'Missing escrow ciphertext — on-chain escrow record required' };
    }

    // Convert hex secret to a field value for Leo's BHP256 hash check
    // Note: On-chain claim only works for escrows created on-chain where
    // secret_hash was computed with BHP256::hash_to_field (not SHA-256)
    const secretField = `${BigInt('0x' + pendingJob.secret.slice(0, 16))}field`;

    try {
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_PROGRAM,
        'claim_escrow',
        [
          pendingJob.clientProof.escrowCiphertext,
          secretField,
        ],
      );

      this.pendingJobs.delete(jobHash);
      return { success: true, txId };
    } catch (onChainError) {
      return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain escrow claim failed' };
    }
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
      ratingRecordCiphertext: string;
    }
  ): Promise<{ success: boolean; newTier?: Tier; txId?: string; error?: string }> {
    if (!this.reputation) {
      return { success: false, error: 'No reputation data available. Register first.' };
    }

    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for on-chain reputation update' };
    }

    const address = await getAddress(this.config.privateKey);
    const repRecord = this.recordStore.getLatest(SHADOW_AGENT_PROGRAM, 'AgentReputation', address);

    if (!repRecord) {
      return { success: false, error: 'Missing AgentReputation record. Register first or import records.' };
    }

    try {
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_PROGRAM,
        'update_reputation',
        [repRecord.ciphertext, ratingRecord.ratingRecordCiphertext],
      );

      // Mark old reputation record consumed
      this.recordStore.markConsumed(repRecord.key);

      // Wait for confirmation and store new reputation record
      const confirmation = await waitForTransaction(txId, 12, 5000);
      if (confirmation.confirmed) {
        const outputs = await getTransactionRecordOutputs(txId);
        if (outputs.length >= 1) {
          this.recordStore.store({
            key: `${txId}:0`,
            programId: SHADOW_AGENT_PROGRAM,
            recordType: 'AgentReputation',
            ciphertext: outputs[0],
            owner: address,
            createdAt: Date.now(),
            consumed: false,
          });
        }
      }

      // Update local cache
      this.reputation.total_jobs += 1;
      this.reputation.total_rating_points += ratingRecord.rating;
      this.reputation.total_revenue += ratingRecord.payment_amount;
      this.reputation.tier = this.calculateTier(
        this.reputation.total_jobs,
        this.reputation.total_revenue
      );
      this.reputation.last_updated = Date.now();

      return { success: true, newTier: this.reputation.tier, txId };
    } catch (onChainError) {
      try {
        const res = await fetch(`${this.config.facilitatorUrl}/agents/${address}/rating`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            rating: ratingRecord.rating,
            payment_amount: ratingRecord.payment_amount,
          }),
        });
        if (!res.ok) {
          const err = await res.json().catch(() => ({})) as { error?: string };
          return { success: false, error: err.error || 'Facilitator fallback failed' };
        }
        // Update local cache even on facilitator fallback
        this.reputation.total_jobs += 1;
        this.reputation.total_rating_points += ratingRecord.rating;
        this.reputation.total_revenue += ratingRecord.payment_amount;
        this.reputation.tier = this.calculateTier(
          this.reputation.total_jobs,
          this.reputation.total_revenue
        );
        this.reputation.last_updated = Date.now();
        const result = await res.json() as { tx_id?: string };
        return { success: true, newTier: this.reputation.tier, txId: result.tx_id };
      } catch {
        return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain reputation update failed' };
      }
    }
  }

  /**
   * Update public listing
   */
  async updateListing(
    newServiceType?: ServiceType,
    newEndpointUrl?: string,
    isActive?: boolean
  ): Promise<{ success: boolean; txId?: string; error?: string }> {
    if (!this.config.privateKey) {
      return { success: false, error: 'Private key required for on-chain listing update' };
    }

    const serviceType = newServiceType ?? this.config.serviceType;
    const active = isActive ?? true;

    const address = await getAddress(this.config.privateKey);
    const repRecord = this.recordStore.getLatest(SHADOW_AGENT_PROGRAM, 'AgentReputation', address);

    if (!repRecord) {
      return { success: false, error: 'Missing AgentReputation record. Register first or import records.' };
    }

    const endpointHash = newEndpointUrl
      ? await generateAgentId(newEndpointUrl)
      : '0';

    try {
      const txId = await executeProgram(
        this.config.privateKey,
        SHADOW_AGENT_PROGRAM,
        'update_listing',
        [
          repRecord.ciphertext,
          `${serviceType}u8`,
          `${endpointHash}field`,
          active.toString(),
        ],
      );

      // Mark old record consumed, store new one
      this.recordStore.markConsumed(repRecord.key);

      const confirmation = await waitForTransaction(txId, 12, 5000);
      if (confirmation.confirmed) {
        const outputs = await getTransactionRecordOutputs(txId);
        if (outputs.length >= 1) {
          this.recordStore.store({
            key: `${txId}:0`,
            programId: SHADOW_AGENT_PROGRAM,
            recordType: 'AgentReputation',
            ciphertext: outputs[0],
            owner: address,
            createdAt: Date.now(),
            consumed: false,
          });
        }
      }

      if (newServiceType !== undefined) {
        this.config.serviceType = newServiceType;
      }

      return { success: true, txId };
    } catch (onChainError) {
      return { success: false, error: onChainError instanceof Error ? onChainError.message : 'On-chain listing update failed' };
    }
  }

  /**
   * Get current reputation (from cache or chain)
   */
  async getReputation(): Promise<AgentReputation | null> {
    if (this.reputation) {
      return this.reputation;
    }

    // Fetch from facilitator index (which reads from on-chain data)
    await this.ensureAgentId();
    const address = this.config.privateKey
      ? await getAddress(this.config.privateKey)
      : this.agentId;

    const url = `${this.config.facilitatorUrl}/agents/by-address/${address}`;
    const response = await fetch(url);

    if (!response.ok) {
      return null;
    }

    const data = await response.json() as {
      agent_id: string;
      tier?: number;
      total_jobs?: number;
      total_rating_points?: number;
      total_revenue?: number;
    };

    if (data.agent_id) {
      this.reputation = {
        owner: address,
        agent_id: data.agent_id,
        total_jobs: data.total_jobs || 0,
        total_rating_points: data.total_rating_points || 0,
        total_revenue: data.total_revenue || 0,
        tier: (data.tier || 0) as Tier,
        created_at: 0,
        last_updated: Date.now(),
      };
      return this.reputation;
    }

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

  /**
   * Get the record store (for persistence/export)
   */
  getRecordStore(): RecordStore {
    return this.recordStore;
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
