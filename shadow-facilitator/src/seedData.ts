// Seed realistic data on startup for demo/development
// Makes API calls to localhost to populate ratings, disputes, sessions, refunds, policies

const BASE = 'http://localhost';

export async function seedDemoData(port: number): Promise<void> {
  const API = `${BASE}:${port}`;

  const agents = [
    'aleo15utjfg7hh0pclqmzydd5zvwk3363k64arltw0gt9ss9x0l79yc8qwvvae6', // NLP, Silver
    'aleo1g3mvsplztyp54t4wgxrzl5tr0hqluc6ewn8u45udu2ylwv758yqs9xwtfv', // Vision, Gold
    'aleo1acynswp9u6ecv5365gzx2z5uaasm7yekhrzlyy7gufztyyhqgqxql2ml3l', // Code, Bronze
    'aleo1d0m2qjs9rtesq2kspcfppxug6g82m4eac6qjtpm9wpajflmekvxqalg5wf', // Data, Silver
    'aleo1ed6qhaj90mjuv0ya62qq4h7fgwfqx6kxpga859x37aa6vcrmayqszmrmax', // Multi, Diamond
    'aleo1c58597vg3tkultpsff4dk72tkgkpny52e746t30l6m4y8ww6xqzq8yat0p', // NLP, Gold
  ];
  const client = 'aleo1wvecej5xgfvjyuh5qv3ncwkxd5kkg089aphyvewuyer57mvu5yxqqeu7tc';
  const client2 = 'aleo123spcdzv0us7q8wyf909ratx5xp2epzs60jpfga7ah8r36tmcu9qu5s7g5';

  const post = async (path: string, body: unknown) => {
    try {
      await fetch(`${API}${path}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
    } catch { /* ignore errors — best effort seeding */ }
  };

  // --- Ratings (30 total across 6 agents) ---
  const ratingData: Array<{ agent: number; ratings: number[]; amounts: number[] }> = [
    { agent: 0, ratings: [42, 45, 38, 44, 41], amounts: [5e6, 3e6, 7.5e6, 4e6, 6e6] },
    { agent: 1, ratings: [46, 44, 48, 42], amounts: [8e6, 6e6, 12e6, 9e6] },
    { agent: 2, ratings: [40, 35, 39], amounts: [12e6, 8e6, 15e6] },
    { agent: 3, ratings: [40, 42, 38, 44, 36, 40], amounts: [6e6, 4e6, 5.5e6, 7e6, 3e6, 8e6] },
    { agent: 4, ratings: [48, 46, 50, 44, 47, 49, 46, 48], amounts: [10e6, 15e6, 20e6, 8e6, 12e6, 18e6, 11e6, 16e6] },
    { agent: 5, ratings: [43, 47, 41, 45], amounts: [4e6, 5.5e6, 3.5e6, 6e6] },
  ];
  let ratingCount = 0;
  for (const { agent, ratings, amounts } of ratingData) {
    for (let i = 0; i < ratings.length; i++) {
      await post(`/agents/${agents[agent]}/rating`, {
        job_hash: `seed_rating_${agent}_${i}`, rating: ratings[i], payment_amount: amounts[i],
      });
      ratingCount++;
    }
  }

  // --- Sessions (4: 2 active, 1 closed, 1 paused) ---
  const s1 = await fetch(`${API}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: agents[0], client, max_total: 50e6, max_per_request: 5e6, rate_limit: 20, duration_blocks: 10000 }) }).then(r => r.json() as Promise<Record<string, unknown>>).catch(() => null);
  const sid1 = (s1?.session as Record<string, unknown>)?.session_id as string | undefined;
  if (sid1) { for (let i = 0; i < 3; i++) await post(`/sessions/${sid1}/request`, { amount: 2e6, request_hash: `nlp_req_${i}` }); }

  const s2 = await fetch(`${API}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: agents[1], client, max_total: 100e6, max_per_request: 10e6, rate_limit: 50, duration_blocks: 50000 }) }).then(r => r.json() as Promise<Record<string, unknown>>).catch(() => null);
  const sid2 = (s2?.session as Record<string, unknown>)?.session_id as string | undefined;
  if (sid2) { for (let i = 0; i < 5; i++) await post(`/sessions/${sid2}/request`, { amount: 8e6, request_hash: `vision_req_${i}` }); }

  const s3 = await fetch(`${API}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: agents[2], client: client2, max_total: 30e6, max_per_request: 3e6, rate_limit: 10, duration_blocks: 5000 }) }).then(r => r.json() as Promise<Record<string, unknown>>).catch(() => null);
  const sid3 = (s3?.session as Record<string, unknown>)?.session_id as string | undefined;
  if (sid3) {
    await post(`/sessions/${sid3}/request`, { amount: 2.5e6, request_hash: 'code_req_1' });
    await post(`/sessions/${sid3}/request`, { amount: 1.5e6, request_hash: 'code_req_2' });
    await post(`/sessions/${sid3}/settle`, { settlement_amount: 4e6, agent: agents[2] });
    await post(`/sessions/${sid3}/close`, { client: client2 });
  }

  const s4 = await fetch(`${API}/sessions`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ agent: agents[3], client, max_total: 20e6, max_per_request: 2e6, rate_limit: 15, duration_blocks: 8000 }) }).then(r => r.json() as Promise<Record<string, unknown>>).catch(() => null);
  const sid4 = (s4?.session as Record<string, unknown>)?.session_id as string | undefined;
  if (sid4) {
    await post(`/sessions/${sid4}/request`, { amount: 1e6, request_hash: 'data_req_1' });
    await post(`/sessions/${sid4}/pause`, { client });
  }

  // --- Disputes (3: opened, agent_responded, resolved) ---
  await post('/disputes', { agent: agents[0], client, job_hash: 'dispute_late_delivery', escrow_amount: 5e6, evidence_hash: 'ev_late_proof' });
  await post('/disputes', { agent: agents[1], client, job_hash: 'dispute_quality', escrow_amount: 8e6, evidence_hash: 'ev_quality_samples' });
  await post('/disputes/dispute_quality/respond', { agent_id: agents[1], evidence_hash: 'ev_quality_rebuttal' });
  await post('/disputes', { agent: agents[2], client: client2, job_hash: 'dispute_incomplete', escrow_amount: 12e6, evidence_hash: 'ev_incomplete_work' });
  await post('/disputes/dispute_incomplete/respond', { agent_id: agents[2], evidence_hash: 'ev_partial_delivery' });
  await post('/disputes/dispute_incomplete/resolve', { admin_address: 'aleo1qqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqqq3ljyzc', agent_percentage: 30 });

  // --- Refunds (2: proposed, accepted) ---
  await post('/refunds', { agent: agents[3], client, total_amount: 6e6, agent_amount: 3e6, job_hash: 'refund_overcharge' });
  await post('/refunds', { agent: agents[4], client, total_amount: 10e6, agent_amount: 7e6, job_hash: 'refund_partial' });
  await post('/refunds/refund_partial/accept', { agent_id: agents[4] });

  // --- Policies (2) ---
  await post('/sessions/policies', { owner: client, max_session_value: 10e6, max_single_request: 1e6, allowed_tiers: 255, allowed_categories: 0xffffffff, require_proofs: false });
  await post('/sessions/policies', { owner: client, max_session_value: 100e6, max_single_request: 10e6, allowed_tiers: 252, allowed_categories: 0xffffffff, require_proofs: true });

  // --- Multi-sig Escrow (1 with 1 approval) ---
  await post('/escrows/multisig', { agent: agents[4], owner: client, amount: 25e6, job_hash: 'multisig_highvalue', secret_hash: 'msig_hash', deadline: 999999, signers: [client, client2, agents[4]], required_signatures: 2 });
  await post('/escrows/multisig/multisig_highvalue/approve', { signer_address: client });

  return;
}
