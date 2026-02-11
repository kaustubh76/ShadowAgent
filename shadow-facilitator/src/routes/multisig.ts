// Multi-Sig Escrow Routes (Phase 10a)

import { Router, Request, Response } from 'express';

const router = Router();

// In-memory store (production: Redis/PostgreSQL)
interface MultiSigEscrowRecord {
  owner: string;
  agent: string;
  amount: number;
  job_hash: string;
  deadline: number;
  secret_hash: string;
  signers: [string, string, string];
  required_sigs: number;
  sig_count: number;
  approvals: [boolean, boolean, boolean];
  status: 'locked' | 'released' | 'refunded';
  created_at: string;
  updated_at: string;
}

const multisigStore = new Map<string, MultiSigEscrowRecord>();

// Per-job mutex to prevent race conditions on concurrent approvals
const approvalLocks = new Map<string, Promise<void>>();

async function withJobLock<T>(jobHash: string, fn: () => Promise<T>): Promise<T> {
  // Wait for any existing lock on this job
  const existing = approvalLocks.get(jobHash);
  if (existing) await existing;

  let release: () => void;
  const lock = new Promise<void>(resolve => { release = resolve; });
  approvalLocks.set(jobHash, lock);

  try {
    return await fn();
  } finally {
    release!();
    approvalLocks.delete(jobHash);
  }
}

// POST /escrows/multisig - Create a multi-sig escrow
router.post('/', async (req: Request, res: Response) => {
  try {
    const {
      agent,
      amount,
      job_hash,
      secret_hash,
      deadline,
      signers,
      required_signatures,
      owner,
    } = req.body;

    if (!agent || !amount || !job_hash || !secret_hash || !signers || !required_signatures) {
      res.status(400).json({
        error: 'Missing required fields: agent, amount, job_hash, secret_hash, signers, required_signatures',
      });
      return;
    }

    if (!Array.isArray(signers) || signers.length !== 3) {
      res.status(400).json({ error: 'signers must be an array of exactly 3 addresses' });
      return;
    }

    if (required_signatures < 1 || required_signatures > 3) {
      res.status(400).json({ error: 'required_signatures must be 1, 2, or 3' });
      return;
    }

    if (multisigStore.has(job_hash)) {
      res.status(409).json({ error: 'Multi-sig escrow already exists for this job' });
      return;
    }

    const escrow: MultiSigEscrowRecord = {
      owner: owner || 'unknown',
      agent,
      amount,
      job_hash,
      deadline: deadline || 0,
      secret_hash,
      signers: signers as [string, string, string],
      required_sigs: required_signatures,
      sig_count: 0,
      approvals: [false, false, false],
      status: 'locked',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    };

    multisigStore.set(job_hash, escrow);

    res.status(201).json({
      success: true,
      escrow,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create multi-sig escrow' });
  }
});

// GET /escrows/multisig/:jobHash - Get multi-sig escrow status
router.get('/:jobHash', async (req: Request, res: Response) => {
  const { jobHash } = req.params;
  const escrow = multisigStore.get(jobHash);

  if (!escrow) {
    res.status(404).json({ error: 'Multi-sig escrow not found' });
    return;
  }

  res.json(escrow);
});

// POST /escrows/multisig/:jobHash/approve - Submit an approval
router.post('/:jobHash/approve', async (req: Request, res: Response) => {
  const { jobHash } = req.params;
  const { signer_address, secret } = req.body;

  // Use per-job mutex to prevent race conditions on concurrent approvals
  await withJobLock(jobHash, async () => {
    const escrow = multisigStore.get(jobHash);

    if (!escrow) {
      res.status(404).json({ error: 'Multi-sig escrow not found' });
      return;
    }

    if (escrow.status !== 'locked') {
      res.status(400).json({ error: `Cannot approve escrow in status: ${escrow.status}` });
      return;
    }

    if (!signer_address) {
      res.status(400).json({ error: 'Missing required field: signer_address' });
      return;
    }

    // Find which signer this is
    const signerIndex = escrow.signers.indexOf(signer_address);
    if (signerIndex === -1) {
      res.status(403).json({ error: 'Address is not an authorized signer for this escrow' });
      return;
    }

    if (escrow.approvals[signerIndex]) {
      res.status(400).json({ error: 'This signer has already approved' });
      return;
    }

    // Update approval
    escrow.approvals[signerIndex] = true;
    escrow.sig_count = escrow.approvals.filter(Boolean).length;
    escrow.updated_at = new Date().toISOString();

    // Check if threshold met
    if (escrow.sig_count >= escrow.required_sigs) {
      escrow.status = 'released';
    }

    res.json({
      success: true,
      escrow,
      threshold_met: escrow.sig_count >= escrow.required_sigs,
    });
  });
});

// GET /escrows/pending/:address - Get escrows awaiting this address's signature
router.get('/pending/:address', async (req: Request, res: Response) => {
  const { address } = req.params;

  const pending = Array.from(multisigStore.values()).filter(escrow => {
    if (escrow.status !== 'locked') return false;
    const signerIndex = escrow.signers.indexOf(address);
    return signerIndex !== -1 && !escrow.approvals[signerIndex];
  });

  res.json(pending);
});

export default router;
