// ShadowAgent Facilitator - x402 Payment Middleware
// Implements HTTP 402 Payment Required protocol for Aleo
// Now with Redis support for persistent storage

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { aleoService } from '../services/aleo';
import { getRedisService, PendingJob } from '../services/redis';
import { EscrowProof, PaymentTerms } from '../types';

// Configuration
const DEFAULT_PRICE = parseInt(process.env.DEFAULT_PRICE || '100000', 10); // 0.1 credits
const DEFAULT_DEADLINE_BLOCKS = parseInt(process.env.DEFAULT_DEADLINE_BLOCKS || '100', 10);
const ALEO_NETWORK = process.env.ALEO_NETWORK || 'aleo:testnet';

// In-memory fallback when Redis is not available
const memoryJobs: Map<string, {
  secret: string;
  secretHash: string;
  price: number;
  agentId: string;
  createdAt: number;
}> = new Map();

// Clean up old pending jobs periodically
setInterval(() => {
  const now = Date.now();
  const maxAge = 3600000; // 1 hour

  for (const [jobHash, job] of memoryJobs.entries()) {
    if (now - job.createdAt > maxAge) {
      memoryJobs.delete(jobHash);
    }
  }
}, 60000); // Every minute

export interface X402Options {
  pricePerRequest?: number;
  agentAddress?: string;
  agentId?: string;
  deadlineBlocks?: number;
  escrowRequired?: boolean;
}

/**
 * Generate a random secret for HTLC
 */
function generateSecret(): string {
  return crypto.randomBytes(32).toString('hex');
}

/**
 * Hash a secret for HTLC
 */
function hashSecret(secret: string): string {
  return crypto.createHash('sha256').update(secret).digest('hex');
}

/**
 * Generate a job hash from request details
 */
function generateJobHash(req: Request): string {
  const data = `${req.method}:${req.originalUrl}:${Date.now()}:${crypto.randomBytes(8).toString('hex')}`;
  return crypto.createHash('sha256').update(data).digest('hex');
}

/**
 * Parse escrow proof from request headers
 */
function parseEscrowProof(req: Request): EscrowProof | null {
  const proofHeader = req.headers['x-escrow-proof'] as string;
  const jobHash = req.headers['x-job-hash'] as string;

  if (!proofHeader) {
    return null;
  }

  try {
    // Decode base64 proof
    const decoded = Buffer.from(proofHeader, 'base64').toString('utf-8');
    const proof = JSON.parse(decoded) as EscrowProof;

    return {
      ...proof,
      // Use job hash from header if not in proof
      nullifier: proof.nullifier || jobHash,
    };
  } catch (error) {
    console.error('Error parsing escrow proof:', error);
    return null;
  }
}

/**
 * Create payment required response
 */
function createPaymentResponse(
  res: Response,
  terms: PaymentTerms,
  jobHash: string
): void {
  // Encode payment terms as base64
  const encoded = Buffer.from(JSON.stringify(terms)).toString('base64');

  res.status(402);
  res.setHeader('X-Payment-Required', encoded);
  res.setHeader('X-Job-Hash', jobHash);
  res.setHeader('X-Payment-Network', terms.network);

  res.json({
    error: 'Payment Required',
    message: 'This endpoint requires payment. Create an escrow and retry with proof.',
    payment_terms: terms,
    job_hash: jobHash,
  });
}

/**
 * Store pending job (Redis with memory fallback)
 */
async function storePendingJob(
  jobHash: string,
  data: {
    secret: string;
    secretHash: string;
    price: number;
    agentId: string;
  }
): Promise<void> {
  const redis = getRedisService();
  const createdAt = Date.now();

  // Try Redis first
  if (redis.isConnected()) {
    const job: PendingJob = {
      jobHash,
      agentId: data.agentId,
      amount: data.price,
      secretHash: data.secretHash,
      createdAt,
      deadline: createdAt + 3600000, // 1 hour
      status: 'pending',
    };

    const stored = await redis.setPendingJob(job);
    if (stored) {
      // Also store secret separately (not in the job object for security)
      // In production, secrets should be encrypted at rest
      return;
    }
  }

  // Fallback to memory
  memoryJobs.set(jobHash, {
    ...data,
    createdAt,
  });
}

/**
 * Get pending job (Redis with memory fallback)
 */
async function getPendingJobData(
  jobHash: string
): Promise<{ secret: string; secretHash: string; price: number } | null> {
  // Check memory first (secrets are stored here)
  const memJob = memoryJobs.get(jobHash);
  if (memJob) {
    return {
      secret: memJob.secret,
      secretHash: memJob.secretHash,
      price: memJob.price,
    };
  }

  // Check Redis
  const redis = getRedisService();
  if (redis.isConnected()) {
    const job = await redis.getPendingJob(jobHash);
    if (job) {
      // Note: Secret is not stored in Redis for security
      // This would need to be retrieved from a secure secret store
      return {
        secret: '', // Would come from secure storage
        secretHash: job.secretHash,
        price: job.amount,
      };
    }
  }

  return null;
}

/**
 * Delete pending job (Redis with memory fallback)
 */
async function deletePendingJobData(jobHash: string): Promise<void> {
  memoryJobs.delete(jobHash);

  const redis = getRedisService();
  if (redis.isConnected()) {
    await redis.deletePendingJob(jobHash);
  }
}

/**
 * x402 Payment Middleware Factory
 *
 * Usage:
 *   app.use('/api', x402Middleware({ pricePerRequest: 100000, agentAddress: 'aleo1...' }));
 */
export function x402Middleware(options: X402Options = {}) {
  const {
    pricePerRequest = DEFAULT_PRICE,
    agentAddress = process.env.AGENT_ADDRESS || '',
    agentId = process.env.AGENT_ID || '',
    deadlineBlocks = DEFAULT_DEADLINE_BLOCKS,
    escrowRequired = true,
  } = options;

  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    // Skip payment for OPTIONS requests (CORS preflight)
    if (req.method === 'OPTIONS') {
      next();
      return;
    }

    // Check for existing escrow proof
    const escrowProof = parseEscrowProof(req);
    const jobHash = req.headers['x-job-hash'] as string;

    if (escrowProof && jobHash) {
      // Verify the escrow proof
      try {
        const verification = await aleoService.verifyEscrowProof(escrowProof);

        if (!verification.valid) {
          res.status(402).json({
            error: 'Invalid Payment Proof',
            message: verification.error || 'The provided escrow proof is invalid',
          });
          return;
        }

        // Check if payment amount is sufficient
        if (escrowProof.amount !== undefined && escrowProof.amount < pricePerRequest) {
          res.status(402).json({
            error: 'Insufficient Payment',
            message: `Payment of ${escrowProof.amount} is less than required ${pricePerRequest}`,
          });
          return;
        }

        // Get the pending job to retrieve the secret
        const pendingJob = await getPendingJobData(jobHash);

        // Attach payment info to request for downstream handlers
        (req as Request & { payment?: { proof: EscrowProof; jobHash: string; secret?: string } }).payment = {
          proof: escrowProof,
          jobHash,
          secret: pendingJob?.secret,
        };

        // Set up response hook to include delivery secret on success
        const originalSend = res.send.bind(res);
        res.send = function (body: unknown): Response {
          // Only include secret on successful responses
          if (res.statusCode >= 200 && res.statusCode < 300 && pendingJob) {
            res.setHeader('X-Delivery-Secret', pendingJob.secret);
            res.setHeader('X-Job-Hash', jobHash);

            // Remove from pending (agent can now claim)
            deletePendingJobData(jobHash);
          }
          return originalSend(body);
        };

        // Payment verified, continue to handler
        next();
        return;
      } catch (error) {
        console.error('Error verifying payment:', error);
        res.status(500).json({
          error: 'Payment Verification Failed',
          message: 'An error occurred while verifying the payment proof',
        });
        return;
      }
    }

    // No valid payment - return 402 with payment terms
    if (!agentAddress) {
      // Agent address not configured - skip payment requirement
      console.warn('x402 middleware: AGENT_ADDRESS not configured, skipping payment');
      next();
      return;
    }

    // Generate new job details
    const newJobHash = generateJobHash(req);
    const secret = generateSecret();
    const secretHash = hashSecret(secret);

    // Store for later verification
    await storePendingJob(newJobHash, {
      secret,
      secretHash,
      price: pricePerRequest,
      agentId,
    });

    // Create payment terms
    const paymentTerms: PaymentTerms = {
      price: pricePerRequest,
      network: ALEO_NETWORK,
      address: agentAddress,
      escrow_required: escrowRequired,
      secret_hash: secretHash,
      deadline_blocks: deadlineBlocks,
    };

    createPaymentResponse(res, paymentTerms, newJobHash);
  };
}

/**
 * Get pending job info (for agent to claim)
 */
export async function getPendingJob(jobHash: string): Promise<{ secret: string; secretHash: string; price: number } | null> {
  return getPendingJobData(jobHash);
}

/**
 * Manually mark a job as completed (for testing)
 */
export async function completeJob(jobHash: string): Promise<boolean> {
  await deletePendingJobData(jobHash);
  return true;
}

/**
 * Get all pending jobs (for debugging)
 */
export function getAllPendingJobs(): Map<string, { secretHash: string; price: number; createdAt: number }> {
  const result = new Map();
  for (const [hash, job] of memoryJobs.entries()) {
    result.set(hash, {
      secretHash: job.secretHash,
      price: job.price,
      createdAt: job.createdAt,
    });
  }
  return result;
}

export default x402Middleware;
