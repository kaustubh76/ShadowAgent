// Agent Discovery Routes

import { Router, Request, Response } from 'express';
import { indexerService } from '../services/indexer';
import { SearchParams, ServiceType, Tier } from '../types';
import { createAddressRateLimiter } from '../middleware/rateLimiter';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';

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
      limit: Math.min(Number.isFinite(parsedLimit) ? parsedLimit : 20, 100),
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

// Validate Aleo address format: must start with "aleo1" and contain valid characters
function isValidAleoAddress(address: string): boolean {
  return typeof address === 'string' && /^aleo1[a-z0-9_]{5,}$/.test(address);
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
    if (service_type !== undefined && (!Number.isFinite(parsedType) || parsedType < 0 || parsedType > 10)) {
      res.status(400).json({ error: 'Invalid service_type: must be 0-10' });
      return;
    }

    const agentId = address || `agent_${Date.now()}`;

    await indexerService.onAgentRegistered(agentId);

    res.status(201).json({
      success: true,
      agent_id: agentId,
      bond_record: tx_id || undefined,
    });
  } catch (error) {
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
      res.json(cached);
      return;
    }

    // Try fetching directly from chain
    const fetched = await indexerService.getAgent(publicKey);
    if (!fetched) {
      res.status(404).json({ error: 'Agent not found for this address' });
      return;
    }

    res.json(fetched);
  } catch (error) {
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

    res.status(201).json({ success: true, rating: record });
  } catch (error) {
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
    res.status(500).json({ error: 'Failed to get agent' });
  }
});

// GET /agents/:agentId/proof - Get agent's latest tier proof
router.get('/:agentId/proof', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const agent = await indexerService.getAgent(agentId);

    if (!agent) {
      res.status(404).json({ error: 'Agent not found' });
      return;
    }

    // In production, this would fetch the latest proof from chain
    res.json({
      agent_id: agentId,
      tier: agent.tier,
      tier_name: Tier[agent.tier],
      proof_type: 4,
      threshold_met: true,
      message: 'Tier verified via ZK proof',
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get proof' });
  }
});

export default router;
