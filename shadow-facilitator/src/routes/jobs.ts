// Job Routes - Escrow-Backed Job Listings

import { Router, Request, Response } from 'express';
import { createAddressRateLimiter } from '../middleware/rateLimiter';
import { TTLStore } from '../utils/ttlStore';

const router = Router();

// Rate limiting: 10 job operations per minute per address
const jobLimiter = createAddressRateLimiter({
  windowMs: 60_000,
  maxRequests: 10,
  keyExtractor: (req: Request) => req.body?.agent || (req.query?.agent as string) || req.ip || 'unknown',
  message: 'Too many job requests, please try again later',
});

// Jobs expire after 30 days
const JOB_TTL_MS = 30 * 86_400_000;

export interface JobRecord {
  job_id: string;
  job_hash: string;
  agent: string;
  client: string;
  title: string;
  description: string;
  service_type: number;
  pricing: number;
  escrow_amount: number;
  secret_hash: string;
  multisig_enabled: boolean;
  signers?: [string, string, string];
  required_signatures?: number;
  escrow_status: 'pending' | 'locked' | 'released' | 'refunded';
  status: 'draft' | 'open' | 'in_progress' | 'completed' | 'cancelled';
  created_at: string;
  updated_at: string;
}

const jobStore = new TTLStore<JobRecord>({
  maxSize: 50_000,
  defaultTTLMs: JOB_TTL_MS,
});

// POST /jobs - Create a new job
router.post('/', jobLimiter, async (req: Request, res: Response) => {
  try {
    const {
      agent, client, title, description, service_type,
      pricing, escrow_amount, secret_hash,
      multisig_enabled, signers, required_signatures,
    } = req.body;

    if (!agent || !client || !title || !description || !service_type || !pricing || !escrow_amount || !secret_hash) {
      res.status(400).json({
        error: 'Missing required fields: agent, client, title, description, service_type, pricing, escrow_amount, secret_hash',
      });
      return;
    }

    if (service_type < 1 || service_type > 7) {
      res.status(400).json({ error: 'service_type must be between 1 and 7' });
      return;
    }

    if (pricing <= 0 || escrow_amount <= 0) {
      res.status(400).json({ error: 'pricing and escrow_amount must be positive' });
      return;
    }

    if (multisig_enabled) {
      if (!Array.isArray(signers) || signers.length !== 3) {
        res.status(400).json({ error: 'When multisig_enabled, signers must be array of 3 addresses' });
        return;
      }
      if (!required_signatures || required_signatures < 1 || required_signatures > 3) {
        res.status(400).json({ error: 'required_signatures must be 1, 2, or 3' });
        return;
      }
    }

    const job_id = `job_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const job_hash = `hash_${Date.now()}_${Math.random().toString(36).slice(2, 12)}`;

    const job: JobRecord = {
      job_id,
      job_hash,
      agent,
      client,
      title: title.slice(0, 200),
      description: description.slice(0, 2000),
      service_type,
      pricing,
      escrow_amount,
      secret_hash,
      multisig_enabled: !!multisig_enabled,
      signers: multisig_enabled ? signers : undefined,
      required_signatures: multisig_enabled ? required_signatures : undefined,
      escrow_status: 'pending',
      status: 'open',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    jobStore.set(job_id, job);

    res.status(201).json({ success: true, job });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create job' });
  }
});

// GET /jobs - List jobs with optional filters
router.get('/', async (req: Request, res: Response) => {
  const { agent, client, status, service_type } = req.query;

  let jobs = jobStore.values();

  if (agent) jobs = jobs.filter(j => j.agent === agent);
  if (client) jobs = jobs.filter(j => j.client === client);
  if (status) jobs = jobs.filter(j => j.status === status);
  if (service_type) jobs = jobs.filter(j => j.service_type === Number(service_type));

  jobs.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  res.json(jobs);
});

// GET /jobs/:jobId - Get a specific job
router.get('/:jobId', async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  res.json(job);
});

// PATCH /jobs/:jobId - Update job status
router.patch('/:jobId', jobLimiter, async (req: Request, res: Response) => {
  const { jobId } = req.params;
  const job = jobStore.get(jobId);

  if (!job) {
    res.status(404).json({ error: 'Job not found' });
    return;
  }

  const { status, escrow_status, caller } = req.body;

  // Verify caller is either the job's client or agent
  if (!caller || (caller !== job.client && caller !== job.agent)) {
    res.status(403).json({ error: 'Caller must be the job client or agent' });
    return;
  }

  const validStatusTransitions: Record<string, string[]> = {
    'draft': ['open', 'cancelled'],
    'open': ['in_progress', 'cancelled'],
    'in_progress': ['completed', 'cancelled'],
    'completed': [],
    'cancelled': [],
  };

  if (status) {
    const allowed = validStatusTransitions[job.status];
    if (!allowed || !allowed.includes(status)) {
      res.status(400).json({ error: `Cannot transition from ${job.status} to ${status}` });
      return;
    }
    job.status = status;
  }

  if (escrow_status) {
    job.escrow_status = escrow_status;
  }

  job.updated_at = new Date().toISOString();

  res.json({ success: true, job });
});

// Seed jobs directly into the store (called from index.ts on startup)
export function seedJobs(
  jobs: Partial<JobRecord>[]
): number {
  let seeded = 0;
  for (const jobData of jobs) {
    const job_id = `job_seed_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const job_hash = `hash_seed_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    const now = new Date().toISOString();
    const job: JobRecord = {
      job_id,
      job_hash,
      agent: jobData.agent || '',
      client: jobData.client || '',
      title: jobData.title || 'Untitled Job',
      description: jobData.description || '',
      service_type: jobData.service_type || 1,
      pricing: jobData.pricing || 1000000,
      escrow_amount: jobData.escrow_amount || 1000000,
      secret_hash: jobData.secret_hash || `seed_${Math.random().toString(36).slice(2, 10)}`,
      multisig_enabled: jobData.multisig_enabled || false,
      signers: jobData.signers,
      required_signatures: jobData.required_signatures,
      escrow_status: jobData.escrow_status || 'pending',
      status: jobData.status || 'open',
      created_at: now,
      updated_at: now,
    };
    jobStore.set(job_id, job);
    seeded++;
  }
  return seeded;
}

export default router;
