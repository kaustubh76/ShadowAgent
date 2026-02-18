// ShadowAgent Facilitator - x402 Payment Middleware
// Implements HTTP 402 Payment Required protocol for Aleo
// Now with Redis support for persistent storage

import { Request, Response, NextFunction } from 'express';
import crypto from 'crypto';
import { aleoService } from '../services/aleo';
import { getRedisService, PendingJob } from '../services/redis';
import { EscrowProof, PaymentTerms } from '../types';
import { TokenBucketLimiter } from './rateLimiter';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';

// Configuration
const DEFAULT_PRICE = parseInt(process.env.DEFAULT_PRICE || '100000', 10); // 0.1 credits
const DEFAULT_DEADLINE_BLOCKS = parseInt(process.env.DEFAULT_DEADLINE_BLOCKS || '100', 10);
const ALEO_NETWORK = process.env.ALEO_NETWORK || 'aleo:testnet';

// In-memory fallback when Redis is not available (1 hour TTL, 10K max entries)
interface MemoryJob {
  secret: string;
  secretHash: string;
  price: number;
  agentId: string;
}
const memoryJobs = new TTLStore<MemoryJob>({
  maxSize: 10_000,
  defaultTTLMs: 3_600_000,
});

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
      // Store secret in a separate Redis key (isolated from job metadata)
      const secretStored = await redis.setJobSecret(jobHash, data.secret);
      if (secretStored) {
        return;
      }
      // Secret storage failed — clean up the job and fall through to memory
      await redis.deletePendingJob(jobHash);
    }
  }

  // Fallback to memory
  memoryJobs.set(jobHash, {
    secret: data.secret,
    secretHash: data.secretHash,
    price: data.price,
    agentId: data.agentId,
  });
}

/**
 * Get pending job (Redis with memory fallback)
 */
async function getPendingJobData(
  jobHash: string
): Promise<{ secret: string; secretHash: string; price: number } | null> {
  // Check memory first
  const memJob = memoryJobs.get(jobHash);
  if (memJob) {
    return {
      secret: memJob.secret,
      secretHash: memJob.secretHash,
      price: memJob.price,
    };
  }

  // Check Redis — retrieve both job metadata and secret
  const redis = getRedisService();
  if (redis.isConnected()) {
    const job = await redis.getPendingJob(jobHash);
    if (job) {
      const secret = await redis.getJobSecret(jobHash);
      return {
        secret: secret || '',
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
    await Promise.all([
      redis.deletePendingJob(jobHash),
      redis.deleteJobSecret(jobHash),
    ]);
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

  // Token bucket rate limiter for payment generation (per IP)
  const paymentGenLimiter = new TokenBucketLimiter({
    maxRequests: config.rateLimit.x402.maxRequests,
    windowMs: config.rateLimit.x402.windowMs,
  });

  // Cleanup stale limiter entries every 60 seconds
  const limiterCleanup = setInterval(() => paymentGenLimiter.cleanup(), 60_000);
  if (limiterCleanup.unref) limiterCleanup.unref();

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

    // Rate limit payment term generation (prevents abuse of 402 responses)
    const clientKey = req.ip || req.socket?.remoteAddress || 'unknown';
    const limitResult = paymentGenLimiter.check(`x402:${clientKey}`);
    if (!limitResult.allowed) {
      res.status(429).json({
        error: 'Too many payment requests',
        retryAfter: limitResult.retryAfter,
      });
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
 * Get all pending jobs (for debugging — memory-only)
 */
export function getAllPendingJobs(): Map<string, { secretHash: string; price: number }> {
  const result = new Map<string, { secretHash: string; price: number }>();
  for (const [hash, job] of memoryJobs.entries()) {
    result.set(hash, {
      secretHash: job.secretHash,
      price: job.price,
    });
  }
  return result;
}

export default x402Middleware;
