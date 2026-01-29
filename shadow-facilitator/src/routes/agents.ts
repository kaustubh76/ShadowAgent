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
