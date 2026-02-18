// Dispute Resolution Routes (Phase 10a)

import { Router, Request, Response } from 'express';
import { createAddressRateLimiter } from '../middleware/rateLimiter';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';

const router = Router();

// Per-address rate limiting: 3 disputes per hour
const disputeLimiter = createAddressRateLimiter({
  ...config.rateLimit.perAddress.dispute,
  keyExtractor: (req: Request) => req.body?.client || req.body?.agent || req.ip || 'unknown',
  message: 'Too many dispute requests, please try again later',
});

// Rate limiter for dispute responses/resolutions (reuse dispute config with 2x allowance)
const disputeActionLimiter = createAddressRateLimiter({
  windowMs: config.rateLimit.perAddress.dispute.windowMs,
  maxRequests: config.rateLimit.perAddress.dispute.maxRequests * 2,
  keyExtractor: (req: Request) =>
    req.body?.agent_id || req.body?.admin_address || req.ip || 'unknown',
  message: 'Too many dispute action requests, please try again later',
});

// In-memory store (production: Redis/PostgreSQL)
interface DisputeRecord {
  client: string;
  agent: string;
  job_hash: string;
  escrow_amount: number;
  client_evidence_hash: string;
  agent_evidence_hash: string;
  status: 'opened' | 'agent_responded' | 'resolved_client' | 'resolved_agent' | 'resolved_split';
  resolution_agent_pct: number;
  opened_at: string;
  responded_at?: string;
  resolved_at?: string;
}

// Disputes expire after 90 days
const disputeStore = new TTLStore<DisputeRecord>({
  maxSize: 50_000,
  defaultTTLMs: 90 * 86_400_000,
});

// POST /disputes - Open a dispute
router.post('/', disputeLimiter, async (req: Request, res: Response) => {
  try {
    const { agent, job_hash, escrow_amount, evidence_hash, client } = req.body;

    if (!agent || !job_hash || !escrow_amount || !evidence_hash) {
      res.status(400).json({
        error: 'Missing required fields: agent, job_hash, escrow_amount, evidence_hash',
      });
      return;
    }

    if (disputeStore.has(job_hash)) {
      res.status(409).json({ error: 'Dispute already exists for this job' });
      return;
    }

    const dispute: DisputeRecord = {
      client: client || 'unknown',
      agent,
      job_hash,
      escrow_amount,
      client_evidence_hash: evidence_hash,
      agent_evidence_hash: '',
      status: 'opened',
      resolution_agent_pct: 0,
      opened_at: new Date().toISOString(),
    };

    disputeStore.set(job_hash, dispute);

    res.status(201).json({
      success: true,
      dispute,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to open dispute' });
  }
});

// GET /disputes/:jobHash - Get dispute status
router.get('/:jobHash', async (req: Request, res: Response) => {
  const { jobHash } = req.params;
  const dispute = disputeStore.get(jobHash);

  if (!dispute) {
    res.status(404).json({ error: 'Dispute not found' });
    return;
  }

  res.json(dispute);
});

// GET /disputes - List disputes (filtered by agent_id, client, status)
router.get('/', async (req: Request, res: Response) => {
  const { agent_id, client, status } = req.query;

  let disputes = disputeStore.values();

  if (agent_id) {
    disputes = disputes.filter(d => d.agent === agent_id);
  }
  if (client) {
    disputes = disputes.filter(d => d.client === client);
  }
  if (status === 'open') {
    disputes = disputes.filter(d => d.status === 'opened' || d.status === 'agent_responded');
  } else if (status === 'resolved') {
    disputes = disputes.filter(d =>
      d.status === 'resolved_client' || d.status === 'resolved_agent' || d.status === 'resolved_split'
    );
  }

  res.json(disputes);
});

// POST /disputes/:jobHash/respond - Agent responds with counter-evidence
router.post('/:jobHash/respond', disputeActionLimiter, async (req: Request, res: Response) => {
  const { jobHash } = req.params;
  const { evidence_hash } = req.body;
  const dispute = disputeStore.get(jobHash);

  if (!dispute) {
    res.status(404).json({ error: 'Dispute not found' });
    return;
  }

  if (dispute.status !== 'opened') {
    res.status(400).json({ error: `Cannot respond to dispute in status: ${dispute.status}` });
    return;
  }

  if (!evidence_hash) {
    res.status(400).json({ error: 'Missing required field: evidence_hash' });
    return;
  }

  dispute.agent_evidence_hash = evidence_hash;
  dispute.status = 'agent_responded';
  dispute.responded_at = new Date().toISOString();

  res.json({
    success: true,
    dispute,
  });
});

// POST /disputes/:jobHash/resolve - Admin resolves dispute
router.post('/:jobHash/resolve', disputeActionLimiter, async (req: Request, res: Response) => {
  const { jobHash } = req.params;
  const { agent_percentage } = req.body;
  const dispute = disputeStore.get(jobHash);

  if (!dispute) {
    res.status(404).json({ error: 'Dispute not found' });
    return;
  }

  if (dispute.status !== 'opened' && dispute.status !== 'agent_responded') {
    res.status(400).json({ error: `Cannot resolve dispute in status: ${dispute.status}` });
    return;
  }

  if (agent_percentage === undefined || agent_percentage < 0 || agent_percentage > 100) {
    res.status(400).json({ error: 'agent_percentage must be between 0 and 100' });
    return;
  }

  dispute.resolution_agent_pct = agent_percentage;
  dispute.resolved_at = new Date().toISOString();

  if (agent_percentage === 0) {
    dispute.status = 'resolved_client';
  } else if (agent_percentage === 100) {
    dispute.status = 'resolved_agent';
  } else {
    dispute.status = 'resolved_split';
  }

  // Calculate fund split
  const agentAmount = Math.floor((dispute.escrow_amount * agent_percentage) / 100);
  const clientAmount = dispute.escrow_amount - agentAmount;

  res.json({
    success: true,
    dispute,
    settlement: {
      agent_amount: agentAmount,
      client_amount: clientAmount,
    },
  });
});

export default router;
