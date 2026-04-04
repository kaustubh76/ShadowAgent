// Partial Refund Routes (Phase 10a)

import { Router, Request, Response } from 'express';
import { createAddressRateLimiter } from '../middleware/rateLimiter';
import { config } from '../config';
import { TTLStore } from '../utils/ttlStore';
import { isValidAleoAddress, isPositiveNumber } from '../utils/validation';

function logError(ctx: string, error: unknown) {
  try { require('../index').logger.error(`${ctx}:`, error); } catch { console.error(`${ctx}:`, error); }
}

const router = Router();

// Per-address rate limiting: 5 refund proposals per hour
const refundLimiter = createAddressRateLimiter({
  ...config.rateLimit.perAddress.refund,
  keyExtractor: (req: Request) => req.body?.agent || req.body?.client || req.ip || 'unknown',
  message: 'Too many refund requests, please try again later',
});

// In-memory store (production: Redis/PostgreSQL)
interface RefundProposal {
  agent: string;
  client: string;
  total_amount: number;
  agent_amount: number;
  client_amount: number;
  job_hash: string;
  status: 'proposed' | 'accepted' | 'rejected';
  created_at: string;
  updated_at: string;
}

// Refund proposals expire after 30 days
const refundStore = new TTLStore<RefundProposal>({
  maxSize: 50_000,
  defaultTTLMs: 30 * 86_400_000,
});

// Per-jobHash mutex to prevent TOCTOU race on concurrent refund creation
const refundLocks = new Map<string, { queue: Array<() => void>; active: boolean }>();

setInterval(() => {
  for (const [key, lock] of refundLocks.entries()) {
    if (!lock.active && lock.queue.length === 0) refundLocks.delete(key);
  }
}, 5 * 60_000).unref();

async function withRefundLock<T>(jobHash: string, fn: () => Promise<T>): Promise<T> {
  if (!refundLocks.has(jobHash)) {
    refundLocks.set(jobHash, { queue: [], active: false });
  }
  const lock = refundLocks.get(jobHash)!;
  if (lock.active) {
    await new Promise<void>(resolve => lock.queue.push(resolve));
  }
  lock.active = true;
  try {
    return await fn();
  } finally {
    lock.active = false;
    const next = lock.queue.shift();
    if (next) next(); else refundLocks.delete(jobHash);
  }
}

// POST /refunds - Propose a partial refund
router.post('/', refundLimiter, async (req: Request, res: Response) => {
  try {
    const { agent, total_amount, agent_amount, job_hash } = req.body;

    if (!agent || !total_amount || agent_amount === undefined || !job_hash) {
      res.status(400).json({ error: 'Missing required fields: agent, total_amount, agent_amount, job_hash' });
      return;
    }

    if (!isValidAleoAddress(agent)) {
      res.status(400).json({ error: 'agent must be a valid Aleo address' });
      return;
    }

    if (req.body.client && !isValidAleoAddress(req.body.client)) {
      res.status(400).json({ error: 'client must be a valid Aleo address if provided' });
      return;
    }

    if (!isPositiveNumber(total_amount)) {
      res.status(400).json({ error: 'total_amount must be a positive number' });
      return;
    }

    if (typeof agent_amount !== 'number' || !Number.isFinite(agent_amount) || agent_amount < 0) {
      res.status(400).json({ error: 'agent_amount must be a non-negative number' });
      return;
    }

    if (agent_amount >= total_amount) {
      res.status(400).json({ error: 'agent_amount must be less than total_amount' });
      return;
    }

    await withRefundLock(job_hash, async () => {
      if (refundStore.has(job_hash)) {
        res.status(409).json({ error: 'Refund proposal already exists for this job' });
        return;
      }

      const proposal: RefundProposal = {
        agent,
        client: req.body.client || 'unknown',
        total_amount,
        agent_amount,
        client_amount: total_amount - agent_amount,
        job_hash,
        status: 'proposed',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      };

      refundStore.set(job_hash, proposal);

      res.status(201).json({
        success: true,
        proposal,
      });
    });
  } catch (error) {
    logError('[refunds] Failed to create refund proposal:', error);
    res.status(500).json({ error: 'Failed to create refund proposal' });
  }
});

// GET /refunds/:jobHash - Get refund status
router.get('/:jobHash', async (req: Request, res: Response) => {
  const { jobHash } = req.params;
  const proposal = refundStore.get(jobHash);

  if (!proposal) {
    res.status(404).json({ error: 'Refund proposal not found' });
    return;
  }

  res.json(proposal);
});

// GET /refunds - List refund proposals (filtered by agent_id and status)
router.get('/', async (req: Request, res: Response) => {
  const { agent_id, status } = req.query;

  let proposals = refundStore.values();

  if (agent_id) {
    proposals = proposals.filter(p => p.agent === agent_id);
  }
  if (status) {
    proposals = proposals.filter(p => p.status === status);
  }

  res.json(proposals);
});

// POST /refunds/:jobHash/accept - Agent accepts refund proposal
router.post('/:jobHash/accept', refundLimiter, async (req: Request, res: Response) => {
  const { jobHash } = req.params;
  const { agent_id } = req.body;
  const proposal = refundStore.get(jobHash);

  if (!proposal) {
    res.status(404).json({ error: 'Refund proposal not found' });
    return;
  }

  if (!agent_id || agent_id !== proposal.agent) {
    res.status(403).json({ error: 'Only the assigned agent can accept this refund' });
    return;
  }

  if (proposal.status !== 'proposed') {
    res.status(400).json({ error: `Cannot accept refund in status: ${proposal.status}` });
    return;
  }

  proposal.status = 'accepted';
  proposal.updated_at = new Date().toISOString();

  res.json({
    success: true,
    proposal,
  });
});

// POST /refunds/:jobHash/reject - Agent rejects refund proposal
router.post('/:jobHash/reject', refundLimiter, async (req: Request, res: Response) => {
  const { jobHash } = req.params;
  const { agent_id } = req.body;
  const proposal = refundStore.get(jobHash);

  if (!proposal) {
    res.status(404).json({ error: 'Refund proposal not found' });
    return;
  }

  if (!agent_id || agent_id !== proposal.agent) {
    res.status(403).json({ error: 'Only the assigned agent can reject this refund' });
    return;
  }

  if (proposal.status !== 'proposed') {
    res.status(400).json({ error: `Cannot reject refund in status: ${proposal.status}` });
    return;
  }

  proposal.status = 'rejected';
  proposal.updated_at = new Date().toISOString();

  res.json({
    success: true,
    proposal,
  });
});

export default router;
