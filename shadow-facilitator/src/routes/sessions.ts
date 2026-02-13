// Session-Based Payments Routes (Phase 5)

import { Router, Request, Response } from 'express';

const router = Router();

// In-memory store (production: Redis/PostgreSQL)
interface SessionRecord {
  session_id: string;
  client: string;
  agent: string;
  max_total: number;
  max_per_request: number;
  rate_limit: number;
  spent: number;
  request_count: number;
  window_start: number;
  valid_until: number;
  duration_blocks: number;
  status: 'active' | 'paused' | 'closed';
  created_at: string;
  updated_at: string;
  receipts: SessionReceiptRecord[];
}

interface SessionReceiptRecord {
  request_hash: string;
  amount: number;
  timestamp: string;
}

// Rate limit window size in blocks (~10 minutes at 6s/block)
const RATE_WINDOW_BLOCKS = 100;

const sessionStore = new Map<string, SessionRecord>();

// ═══════════════════════════════════════════════════════════════════
// Spending Policies (must be registered BEFORE /:sessionId routes)
// ═══════════════════════════════════════════════════════════════════

interface PolicyRecord {
  policy_id: string;
  owner: string;
  max_session_value: number;
  max_single_request: number;
  allowed_tiers: number;       // Bitfield: which agent tiers
  allowed_categories: number;  // Bitfield: service types
  require_proofs: boolean;
  created_at: string;
}

const policyStore = new Map<string, PolicyRecord>();

// POST /sessions/policies - Create a spending policy
router.post('/policies', async (req: Request, res: Response) => {
  try {
    const { owner, max_session_value, max_single_request, allowed_tiers, allowed_categories, require_proofs } = req.body;

    if (!owner || !max_session_value || !max_single_request) {
      res.status(400).json({
        error: 'Missing required fields: owner, max_session_value, max_single_request',
      });
      return;
    }

    if (max_single_request > max_session_value) {
      res.status(400).json({ error: 'max_single_request cannot exceed max_session_value' });
      return;
    }

    const policy_id = `policy_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const policy: PolicyRecord = {
      policy_id,
      owner,
      max_session_value,
      max_single_request,
      allowed_tiers: allowed_tiers ?? 0xff,
      allowed_categories: allowed_categories ?? 0xffffffff,
      require_proofs: require_proofs ?? false,
      created_at: new Date().toISOString(),
    };

    policyStore.set(policy_id, policy);

    res.status(201).json({ success: true, policy });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create policy' });
  }
});

// GET /sessions/policies - List policies (filtered by owner)
router.get('/policies', async (req: Request, res: Response) => {
  const { owner } = req.query;

  let policies = Array.from(policyStore.values());

  if (owner) {
    policies = policies.filter(p => p.owner === owner);
  }

  res.json(policies);
});

// GET /sessions/policies/:policyId - Get policy by ID
router.get('/policies/:policyId', async (req: Request, res: Response) => {
  const { policyId } = req.params;
  const policy = policyStore.get(policyId);

  if (!policy) {
    res.status(404).json({ error: 'Policy not found' });
    return;
  }

  res.json(policy);
});

// POST /sessions/policies/:policyId/create-session - Create session from policy
router.post('/policies/:policyId/create-session', async (req: Request, res: Response) => {
  try {
    const { policyId } = req.params;
    const policy = policyStore.get(policyId);

    if (!policy) {
      res.status(404).json({ error: 'Policy not found' });
      return;
    }

    const { agent, client, max_total, max_per_request, rate_limit, duration_blocks } = req.body;

    if (!agent || !max_total || !max_per_request || !rate_limit || !duration_blocks) {
      res.status(400).json({
        error: 'Missing required fields: agent, max_total, max_per_request, rate_limit, duration_blocks',
      });
      return;
    }

    // Validate against policy bounds
    if (max_total > policy.max_session_value) {
      res.status(400).json({
        error: `max_total ${max_total} exceeds policy limit ${policy.max_session_value}`,
      });
      return;
    }

    if (max_per_request > policy.max_single_request) {
      res.status(400).json({
        error: `max_per_request ${max_per_request} exceeds policy limit ${policy.max_single_request}`,
      });
      return;
    }

    if (max_per_request > max_total) {
      res.status(400).json({ error: 'max_per_request cannot exceed max_total' });
      return;
    }

    const session_id = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    const session: SessionRecord = {
      session_id,
      client: client || policy.owner,
      agent,
      max_total,
      max_per_request,
      rate_limit,
      spent: 0,
      request_count: 0,
      window_start: 0,
      valid_until: duration_blocks,
      duration_blocks,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      receipts: [],
    };

    sessionStore.set(session_id, session);

    res.status(201).json({
      success: true,
      session,
      policy_id: policyId,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session from policy' });
  }
});

// ═══════════════════════════════════════════════════════════════════
// Session Routes
// ═══════════════════════════════════════════════════════════════════

// POST /sessions - Create a new payment session
router.post('/', async (req: Request, res: Response) => {
  try {
    const { agent, client, max_total, max_per_request, rate_limit, duration_blocks, session_id } = req.body;

    if (!agent || !max_total || !max_per_request || !rate_limit || !duration_blocks) {
      res.status(400).json({
        error: 'Missing required fields: agent, max_total, max_per_request, rate_limit, duration_blocks',
      });
      return;
    }

    if (max_per_request > max_total) {
      res.status(400).json({ error: 'max_per_request cannot exceed max_total' });
      return;
    }

    const id = session_id || `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;

    if (sessionStore.has(id)) {
      res.status(409).json({ error: 'Session ID already exists' });
      return;
    }

    const session: SessionRecord = {
      session_id: id,
      client: client || 'unknown',
      agent,
      max_total,
      max_per_request,
      rate_limit,
      spent: 0,
      request_count: 0,
      window_start: 0,
      valid_until: duration_blocks, // Relative duration stored
      duration_blocks,
      status: 'active',
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      receipts: [],
    };

    sessionStore.set(id, session);

    res.status(201).json({
      success: true,
      session,
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to create session' });
  }
});

// GET /sessions - List sessions (filtered by client, agent, status)
router.get('/', async (req: Request, res: Response) => {
  const { client, agent, status } = req.query;

  let sessions = Array.from(sessionStore.values());

  if (client) {
    sessions = sessions.filter(s => s.client === client);
  }
  if (agent) {
    sessions = sessions.filter(s => s.agent === agent);
  }
  if (status === 'active') {
    sessions = sessions.filter(s => s.status === 'active');
  } else if (status === 'paused') {
    sessions = sessions.filter(s => s.status === 'paused');
  } else if (status === 'closed') {
    sessions = sessions.filter(s => s.status === 'closed');
  }

  res.json(sessions);
});

// GET /sessions/:sessionId - Get session status
router.get('/:sessionId', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessionStore.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  res.json(session);
});

// POST /sessions/:sessionId/request - Record a session request
router.post('/:sessionId/request', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { amount, request_hash } = req.body;
  const session = sessionStore.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status !== 'active') {
    res.status(400).json({ error: `Session is ${session.status}, not active` });
    return;
  }

  if (!amount || amount <= 0) {
    res.status(400).json({ error: 'Amount must be positive' });
    return;
  }

  if (amount > session.max_per_request) {
    res.status(400).json({
      error: `Amount ${amount} exceeds per-request limit ${session.max_per_request}`,
    });
    return;
  }

  const newSpent = session.spent + amount;
  if (newSpent > session.max_total) {
    res.status(400).json({
      error: `Total spent ${newSpent} would exceed session limit ${session.max_total}`,
    });
    return;
  }

  // Rate limit check (simplified: based on receipt count in current window)
  session.request_count += 1;
  if (session.request_count > session.rate_limit) {
    session.request_count -= 1;
    res.status(429).json({ error: 'Rate limit exceeded for this session' });
    return;
  }

  session.spent = newSpent;
  session.updated_at = new Date().toISOString();

  const receipt: SessionReceiptRecord = {
    request_hash: request_hash || `req_${Date.now()}`,
    amount,
    timestamp: new Date().toISOString(),
  };
  session.receipts.push(receipt);

  res.json({
    success: true,
    session,
    receipt,
  });
});

// POST /sessions/:sessionId/settle - Settle accumulated payments
router.post('/:sessionId/settle', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const { settlement_amount } = req.body;
  const session = sessionStore.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status === 'closed') {
    res.status(400).json({ error: 'Cannot settle a closed session' });
    return;
  }

  if (!settlement_amount || settlement_amount <= 0) {
    res.status(400).json({ error: 'Settlement amount must be positive' });
    return;
  }

  if (settlement_amount > session.spent) {
    res.status(400).json({
      error: `Settlement amount ${settlement_amount} exceeds total spent ${session.spent}`,
    });
    return;
  }

  session.updated_at = new Date().toISOString();

  res.json({
    success: true,
    session,
    settlement: {
      amount: settlement_amount,
      settled_at: new Date().toISOString(),
    },
  });
});

// POST /sessions/:sessionId/close - Close session
router.post('/:sessionId/close', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessionStore.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status === 'closed') {
    res.status(400).json({ error: 'Session is already closed' });
    return;
  }

  const refundAmount = session.max_total - session.spent;

  session.status = 'closed';
  session.updated_at = new Date().toISOString();

  res.json({
    success: true,
    session,
    refund_amount: refundAmount,
  });
});

// POST /sessions/:sessionId/pause - Pause session
router.post('/:sessionId/pause', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessionStore.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status !== 'active') {
    res.status(400).json({ error: `Cannot pause session in status: ${session.status}` });
    return;
  }

  session.status = 'paused';
  session.updated_at = new Date().toISOString();

  res.json({
    success: true,
    session,
  });
});

// POST /sessions/:sessionId/resume - Resume paused session
router.post('/:sessionId/resume', async (req: Request, res: Response) => {
  const { sessionId } = req.params;
  const session = sessionStore.get(sessionId);

  if (!session) {
    res.status(404).json({ error: 'Session not found' });
    return;
  }

  if (session.status !== 'paused') {
    res.status(400).json({ error: `Cannot resume session in status: ${session.status}` });
    return;
  }

  session.status = 'active';
  session.updated_at = new Date().toISOString();

  res.json({
    success: true,
    session,
  });
});

export default router;
