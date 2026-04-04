// Agent Discovery Routes

import { Router, Request, Response } from 'express';
import { indexerService } from '../services/indexer';
import { aleoService } from '../services/aleo';
import { SearchParams, ServiceType, Tier } from '../types';
import { createAddressRateLimiter } from '../middleware/rateLimiter';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';
import { isValidAleoAddress } from '../utils/validation';

// Lazy logger — avoids circular dependency with index.ts
function logError(context: string, error: unknown) {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { logger } = require('../index');
    logger.error(`${context}:`, error);
  } catch {
    console.error(`${context}:`, error);
  }
}

const router = Router();

// Per-address rate limiters (Fixed Window Counter)
const registrationLimiter = createAddressRateLimiter({
  maxRequests: config.rateLimit.perAddress.registration.maxRequests,
  windowMs: config.rateLimit.perAddress.registration.windowMs,
  keyExtractor: (req) => req.body?.address || req.ip || 'unknown',
  message: 'Too many registration attempts, please try again later',
});

const ratingLimiter = createAddressRateLimiter({
  maxRequests: config.rateLimit.perAddress.rating.maxRequests,
  windowMs: config.rateLimit.perAddress.rating.windowMs,
  keyExtractor: (req) => req.ip || 'unknown',
  message: 'Too many rating submissions, please try again later',
});

// GET /agents - Search agents with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const parsedServiceType = parseInt(req.query.service_type as string);
    const parsedMinTier = parseInt(req.query.min_tier as string);
    const parsedLimit = parseInt(req.query.limit as string);
    const parsedOffset = parseInt(req.query.offset as string);

    const params: SearchParams = {
      service_type: Number.isFinite(parsedServiceType)
        ? parsedServiceType as ServiceType
        : undefined,
      min_tier: Number.isFinite(parsedMinTier)
        ? parsedMinTier as Tier
        : undefined,
      is_active: req.query.is_active !== 'false',
      limit: Math.min(Math.max(Number.isFinite(parsedLimit) ? parsedLimit : 20, 1), 100),
      offset: Number.isFinite(parsedOffset) ? Math.max(parsedOffset, 0) : 0,
    };

    const result = await indexerService.searchAgents(params);

    res.json({
      agents: result.agents,
      total: result.total,
      limit: params.limit,
      offset: params.offset,
    });
  } catch (error) {
    logError('[agents] Failed to search agents', error);
    res.status(500).json({ error: 'Failed to search agents' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Phase 10a: Registration, Unregistration, Address Lookup, Ratings
// ═══════════════════════════════════════════════════════════════════

// In-memory rating store (production: PostgreSQL/Redis)
interface RatingRecord {
  job_hash: string;
  rating: number;
  payment_amount: number;
  nullifier?: string;
  tx_id?: string;
  on_chain: boolean;
  created_at: string;
}

// Ratings stored for 1 year; nullifiers are permanent (use TTL as upper bound)
const ratingStore = new TTLStore<RatingRecord[]>({
  maxSize: 100_000,
  defaultTTLMs: 365 * 86_400_000,
});
const nullifierStore = new TTLStore<boolean>({
  maxSize: 500_000,
  defaultTTLMs: 365 * 86_400_000,
});

// Per-nullifier mutex to prevent TOCTOU race on concurrent rating submissions
const ratingLocks = new Map<string, { queue: Array<() => void>; active: boolean }>();

// Periodic cleanup of idle lock entries to prevent unbounded memory growth
setInterval(() => {
  for (const [key, lock] of ratingLocks.entries()) {
    if (!lock.active && lock.queue.length === 0) ratingLocks.delete(key);
  }
}, 5 * 60_000).unref();

async function withRatingLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  if (!ratingLocks.has(key)) {
    ratingLocks.set(key, { queue: [], active: false });
  }
  const lock = ratingLocks.get(key)!;
  if (lock.active) {
    await new Promise<void>(resolve => lock.queue.push(resolve));
  }
  lock.active = true;
  try {
    return await fn();
  } finally {
    lock.active = false;
    const next = lock.queue.shift();
    if (next) next(); else ratingLocks.delete(key);
  }
}

// POST /agents/register - Notify facilitator of on-chain agent registration
router.post('/register', registrationLimiter, async (req: Request, res: Response) => {
  try {
    const { service_type, address, tx_id } = req.body;

    if (!service_type && !address) {
      res.status(400).json({ error: 'Missing required fields: service_type or address' });
      return;
    }

    if (address && !isValidAleoAddress(address)) {
      res.status(400).json({ error: 'Invalid address format: must start with aleo1' });
      return;
    }

    const parsedType = Number(service_type);
    if (service_type !== undefined && (!Number.isFinite(parsedType) || parsedType < 0 || parsedType > 7)) {
      res.status(400).json({ error: 'Invalid service_type: must be 0-7' });
      return;
    }

    const agentId = address || `agent_${Date.now()}`;

    // Verify tx_id on-chain if provided
    let onChainVerified = false;
    if (tx_id) {
      try {
        const tx = await aleoService.getTransaction(tx_id) as Record<string, unknown> | null;
        if (tx) {
          const execution = tx.execution as {
            transitions?: Array<{ program: string; function: string }>;
          } | undefined;
          const transition = execution?.transitions?.[0];

          if (transition?.program === 'shadow_agent.aleo' &&
              transition?.function === 'register_agent') {
            onChainVerified = true;

            const status = tx.status as string | undefined;
            if (status && status !== 'accepted') {
              res.status(400).json({
                error: `Transaction ${tx_id} has status "${status}", not accepted`,
              });
              return;
            }
          } else if (transition) {
            res.status(400).json({
              error: `Transaction is not a register_agent call (found ${transition.program}/${transition.function})`,
            });
            return;
          }
        }
      } catch {
        // Non-blocking: if RPC is down, still accept the registration
      }
    }

    // Cache the listing directly from request data (on-chain agent_listings mapping
    // uses BHP256 hash as key, which we can't derive here, so construct from body)
    indexerService.cacheAgent({
      agent_id: agentId,
      service_type: parsedType || ServiceType.NLP,
      endpoint_hash: req.body.endpoint_url || '',
      tier: Tier.New,
      is_active: true,
      registered_at: Date.now(),
    });

    // Also attempt on-chain fetch in background (may enrich data if key matches)
    indexerService.onAgentRegistered(agentId).catch(() => {});

    res.status(201).json({
      success: true,
      agent_id: agentId,
      bond_record: tx_id || undefined,
      on_chain_verified: onChainVerified,
    });
  } catch (error) {
    logError('[agents] Failed to register agent', error);
    res.status(500).json({ error: 'Failed to register agent' });
  }
});

// POST /agents/unregister - Notify facilitator of agent unregistration
router.post('/unregister', async (req: Request, res: Response) => {
  try {
    const { agent_id, address } = req.body;
    const id = agent_id || address;

    if (!id) {
      res.status(400).json({ error: 'Missing required field: agent_id or address' });
      return;
    }

    if (typeof id !== 'string' || id.length > 100) {
      res.status(400).json({ error: 'Invalid agent_id format' });
      return;
    }

    indexerService.untrackAgent(id);

    res.json({ success: true, agent_id: id });
  } catch (error) {
    logError('[agents] Failed to unregister agent', error);
    res.status(500).json({ error: 'Failed to unregister agent' });
  }
});

// GET /agents/by-address/:publicKey - Look up agent by wallet address
router.get('/by-address/:publicKey', async (req: Request, res: Response) => {
  try {
    const { publicKey } = req.params;

    // Search cached agents first
    const allAgents = indexerService.getAllCachedAgents();
    const cached = allAgents.find(a => a.agent_id === publicKey);

    if (cached) {
      // Enrich with reputation fields expected by frontend
      const ratings = ratingStore.get(publicKey) || [];
      const totalJobs = ratings.length;
      const totalRatingPoints = ratings.reduce((sum, r) => sum + r.rating, 0);
      const totalRevenue = ratings.reduce((sum, r) => sum + r.payment_amount, 0);
      res.json({
        ...cached,
        total_jobs: totalJobs,
        total_rating_points: totalRatingPoints,
        total_revenue: totalRevenue,
      });
      return;
    }

    // Try fetching directly from chain
    const fetched = await indexerService.getAgent(publicKey);
    if (!fetched) {
      res.status(404).json({ error: 'Agent not found for this address' });
      return;
    }

    // Enrich with reputation fields for consistent response shape
    const ratings = ratingStore.get(publicKey) || [];
    res.json({
      ...fetched,
      total_jobs: ratings.length,
      total_rating_points: ratings.reduce((sum: number, r: RatingRecord) => sum + r.rating, 0),
      total_revenue: ratings.reduce((sum: number, r: RatingRecord) => sum + r.payment_amount, 0),
    });
  } catch (error) {
    logError('[agents] Failed to look up agent by address', error);
    res.status(500).json({ error: 'Failed to look up agent by address' });
  }
});

// POST /agents/:agentId/rating - Submit a rating for an agent
router.post('/:agentId/rating', ratingLimiter, async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { job_hash, rating, payment_amount, nullifier, tx_id, on_chain } = req.body;

    if (!job_hash || rating === undefined) {
      res.status(400).json({ error: 'Missing required fields: job_hash, rating' });
      return;
    }

    const parsedRating = Number(rating);
    if (!Number.isFinite(parsedRating) || !Number.isInteger(parsedRating) || parsedRating < 1 || parsedRating > 50) {
      res.status(400).json({ error: 'Rating must be an integer between 1 and 50 (scaled)' });
      return;
    }

    if (payment_amount !== undefined) {
      const parsedAmount = Number(payment_amount);
      if (!Number.isFinite(parsedAmount) || parsedAmount < 0) {
        res.status(400).json({ error: 'payment_amount must be a non-negative number' });
        return;
      }
    }

    // Wrap nullifier check-and-set in a lock to prevent TOCTOU race
    const lockKey = nullifier || job_hash;
    await withRatingLock(lockKey, async () => {
      // Prevent double-rating via nullifier
      if (nullifier && nullifierStore.has(nullifier)) {
        res.status(409).json({ error: 'Rating already submitted for this job' });
        return;
      }

      const record: RatingRecord = {
        job_hash,
        rating,
        payment_amount: payment_amount || 0,
        nullifier,
        tx_id,
        on_chain: !!on_chain,
        created_at: new Date().toISOString(),
      };

      if (!ratingStore.has(agentId)) {
        ratingStore.set(agentId, []);
      }
      ratingStore.get(agentId)!.push(record);

      if (nullifier) {
        nullifierStore.set(nullifier, true);
      }

      // Exclude nullifier from response — it's a sensitive cryptographic commitment
      const { nullifier: _nullifier, ...safeRecord } = record;
      res.status(201).json({ success: true, rating: safeRecord });
    });
  } catch (error) {
    logError('[agents] Failed to submit rating', error);
    res.status(500).json({ error: 'Failed to submit rating' });
  }
});

// GET /agents/:agentId - Get specific agent details
router.get('/:agentId', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const agent = await indexerService.getAgent(agentId);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    res.json(agent);
  } catch (error) {
    logError('[agents] Failed to get agent', error);
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// GET /agents/:agentId/proof - Get agent's tier proof with real verification
router.get('/:agentId/proof', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const agent = await indexerService.getAgent(agentId);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // If a proof is provided, verify it using the real Aleo service
    const proofParam = req.query.proof as string;
    const transactionId = req.query.tx_id as string;

    if (proofParam) {
      const reputationProof = {
        owner: agentId,
        proof_type: parseInt(req.query.proof_type as string) || 4,
        threshold: parseInt(req.query.threshold as string) || 0,
        threshold_met: true,
        tier_proven: agent.tier,
        generated_at: 0,
        proof: proofParam,
        tier: agent.tier,
        transactionId,
      };

      const result = await aleoService.verifyReputationProof(reputationProof);

      res.json({
        agent_id: agentId,
        tier: agent.tier,
        tier_name: Tier[agent.tier],
        proof_type: reputationProof.proof_type,
        threshold_met: result.valid,
        verified_on_chain: !!transactionId,
        message: result.valid
          ? (transactionId ? 'Tier verified via on-chain ZK proof' : 'Tier verified via proof validation')
          : (result.error || 'Proof verification failed'),
      });
      return;
    }

    // No proof provided — return tier from cache with verification caveat
    res.json({
      agent_id: agentId,
      tier: agent.tier,
      tier_name: Tier[agent.tier],
      proof_type: 4,
      threshold_met: agent.tier > 0,
      verified_on_chain: false,
      message: agent.tier > 0
        ? 'Tier from cached listing (provide proof and tx_id for on-chain verification)'
        : 'Agent is New tier',
    });
  } catch (error) {
    logError('[agents] Failed to get proof', error);
    res.status(500).json({ error: 'Failed to get proof' });
  }
});

export default router;
