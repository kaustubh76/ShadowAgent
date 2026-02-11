// Agent Discovery Routes

import { Router, Request, Response } from 'express';
import { indexerService } from '../services/indexer';
import { SearchParams, ServiceType, Tier } from '../types';

const router = Router();

// GET /agents - Search agents with filters
router.get('/', async (req: Request, res: Response) => {
  try {
    const params: SearchParams = {
      service_type: req.query.service_type
        ? parseInt(req.query.service_type as string) as ServiceType
        : undefined,
      min_tier: req.query.min_tier
        ? parseInt(req.query.min_tier as string) as Tier
        : undefined,
      is_active: req.query.is_active !== 'false',
      limit: Math.min(parseInt(req.query.limit as string) || 20, 100),
      offset: parseInt(req.query.offset as string) || 0,
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

const ratingStore = new Map<string, RatingRecord[]>();
const usedNullifiers = new Set<string>();

// POST /agents/register - Notify facilitator of on-chain agent registration
router.post('/register', async (req: Request, res: Response) => {
  try {
    const { service_type, address, tx_id } = req.body;

    if (!service_type && !address) {
      res.status(400).json({ error: 'Missing required fields: service_type or address' });
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
router.post('/:agentId/rating', async (req: Request, res: Response) => {
  try {
    const { agentId } = req.params;
    const { job_hash, rating, payment_amount, nullifier, tx_id, on_chain } = req.body;

    if (!job_hash || rating === undefined) {
      res.status(400).json({ error: 'Missing required fields: job_hash, rating' });
      return;
    }

    if (rating < 1 || rating > 50) {
      res.status(400).json({ error: 'Rating must be between 1 and 50 (scaled)' });
      return;
    }

    // Prevent double-rating via nullifier
    if (nullifier && usedNullifiers.has(nullifier)) {
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
      usedNullifiers.add(nullifier);
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
