// ShadowAgent Frontend — Real Facilitator Integration Tests
// Tests API functions against a live facilitator instance.
// Skips gracefully when VITE_FACILITATOR_URL is not set.

const FACILITATOR_URL = import.meta.env.VITE_FACILITATOR_URL || '';
const hasFacilitator = Boolean(FACILITATOR_URL);

const describeFacilitator = hasFacilitator ? describe : describe.skip;

// ═══════════════════════════════════════════════════════════════════
// Direct fetch tests against real facilitator
// (avoids SDK/WASM import chain — tests the actual HTTP API)
// ═══════════════════════════════════════════════════════════════════

describeFacilitator('Frontend API — Real facilitator', () => {
  test('GET /health returns ok', async () => {
    const res = await fetch(`${FACILITATOR_URL}/health`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.status).toBe('ok');
  });

  test('GET /agents returns search results', async () => {
    const res = await fetch(`${FACILITATOR_URL}/agents?limit=5`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body).toHaveProperty('agents');
    expect(body).toHaveProperty('total');
    expect(Array.isArray(body.agents)).toBe(true);
  });

  test('GET /agents with filters', async () => {
    const res = await fetch(`${FACILITATOR_URL}/agents?service_type=1&limit=3`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(Array.isArray(body.agents)).toBe(true);
  });

  test('GET /agents/:id returns 404 for non-existent', async () => {
    const res = await fetch(`${FACILITATOR_URL}/agents/nonexistent-id-12345`);
    expect(res.status).toBe(404);
  });
});

describeFacilitator('Session API — Real facilitator', () => {
  let sessionId: string;
  const client = 'aleo1frontendclient' + Date.now().toString(36);
  const agent = 'aleo1frontendagent' + Date.now().toString(36);

  test('create session', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client,
        agent,
        max_total: 500_000,
        max_per_request: 100_000,
        rate_limit: 10,
        duration_blocks: 1000,
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    sessionId = body.session.session_id;
    expect(sessionId).toBeTruthy();
  });

  test('list sessions', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions?client=${client}`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });

  test('close session', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/${sessionId}/close`, {
      method: 'POST',
    });
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(body.session.status).toBe('closed');
  });
});

describeFacilitator('Dispute API — Real facilitator', () => {
  test('submit and fetch dispute', async () => {
    const jobHash = 'fe-dispute-' + Date.now();
    const createRes = await fetch(`${FACILITATOR_URL}/disputes`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'aleo1feagent',
        client: 'aleo1feclient',
        job_hash: jobHash,
        escrow_amount: 50_000,
        evidence_hash: 'fe-evidence-' + Date.now(),
      }),
    });
    expect(createRes.status).toBe(201);

    const fetchRes = await fetch(`${FACILITATOR_URL}/disputes?client=aleo1feclient`);
    const disputes = await fetchRes.json();
    expect(Array.isArray(disputes)).toBe(true);
    expect(disputes.length).toBeGreaterThan(0);
  });
});

describeFacilitator('Refund API — Real facilitator', () => {
  test('submit and fetch refund', async () => {
    const jobHash = 'fe-refund-' + Date.now();
    const createRes = await fetch(`${FACILITATOR_URL}/refunds`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agent: 'aleo1ferefundagent',
        client: 'aleo1ferefundclient',
        total_amount: 80_000,
        agent_amount: 50_000,
        job_hash: jobHash,
      }),
    });
    expect(createRes.status).toBe(201);

    const fetchRes = await fetch(`${FACILITATOR_URL}/refunds/${jobHash}`);
    const body = await fetchRes.json();
    expect(body.job_hash).toBe(jobHash);
    expect(body.status).toBe('proposed');
  });
});

describeFacilitator('Rating API — Real facilitator', () => {
  test('submit rating to registered agent', async () => {
    // First register an agent
    const regRes = await fetch(`${FACILITATOR_URL}/agents/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        address: 'aleo1ratingtestagent' + Date.now().toString(36),
        service_type: 1,
      }),
    });
    const regBody = await regRes.json();
    const agentId = regBody.agent_id;

    if (agentId) {
      const ratingRes = await fetch(`${FACILITATOR_URL}/agents/${agentId}/rating`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          job_hash: 'rating-job-' + Date.now(),
          rating: 40, // 4.0 stars
          payment_amount: 100_000,
        }),
      });
      expect(ratingRes.status).toBeLessThanOrEqual(201);
    }
  });
});

describeFacilitator('Policy API — Real facilitator', () => {
  let policyId: string;
  const owner = 'aleo1fepolicyowner' + Date.now().toString(36);

  test('create policy', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/policies`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        owner,
        max_session_value: 1_000_000,
        max_single_request: 100_000,
      }),
    });
    const body = await res.json();
    expect(res.status).toBe(201);
    policyId = body.policy.policy_id;
  });

  test('list policies', async () => {
    const res = await fetch(`${FACILITATOR_URL}/sessions/policies?owner=${owner}`);
    const body = await res.json();
    expect(res.ok).toBe(true);
    expect(Array.isArray(body)).toBe(true);
    expect(body.length).toBeGreaterThan(0);
  });
});
