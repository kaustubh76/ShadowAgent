// ShadowAgent Facilitator - Multi-Sig Escrow Route Tests

jest.setTimeout(30000);

import { Router } from 'express';

// Helper to create a minimal Express app for testing
import express from 'express';
import request from 'supertest';
import multisigRouter from './multisig';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/escrows/multisig', multisigRouter);
  return app;
}

// Each test gets unique signers/owner to avoid rate limiter collisions
let escrowCounter = 0;
function makeEscrow(overrides?: Record<string, unknown>) {
  escrowCounter++;
  const ts = Date.now();
  return {
    agent: `aleo1agent_ms_${ts}_${escrowCounter}`,
    amount: 1_000_000,
    job_hash: `ms-job-${ts}-${escrowCounter}`,
    secret_hash: 'secret-hash-abc',
    signers: [
      `aleo1signer1_${ts}_${escrowCounter}`,
      `aleo1signer2_${ts}_${escrowCounter}`,
      `aleo1signer3_${ts}_${escrowCounter}`,
    ],
    required_signatures: 2,
    owner: `aleo1owner_ms_${ts}_${escrowCounter}`,
    deadline: 100000,
    ...overrides,
  };
}

describe('Multi-Sig Escrow Routes', () => {
  describe('POST /escrows/multisig', () => {
    it('should create a multi-sig escrow', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send(makeEscrow());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.escrow.status).toBe('locked');
      expect(res.body.escrow.sig_count).toBe(0);
      expect(res.body.escrow.approvals).toEqual([false, false, false]);
      expect(res.body.escrow.required_sigs).toBe(2);
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send({ agent: 'aleo1test_' + Date.now(), owner: 'aleo1owner_miss_' + Date.now() });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('should reject non-array signers', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send(makeEscrow({ signers: 'not-an-array' }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('array of exactly 3');
    });

    it('should reject signers array with wrong length', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send(makeEscrow({ signers: ['aleo1a', 'aleo1b'] }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('array of exactly 3');
    });

    it('should reject invalid required_signatures', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send(makeEscrow({ required_signatures: 4 }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('must be 1, 2, or 3');
    });

    it('should reject duplicate job_hash', async () => {
      const app = createApp();
      const escrow = makeEscrow();

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      const res = await request(app)
        .post('/escrows/multisig')
        .send(makeEscrow({ job_hash: escrow.job_hash, owner: escrow.owner }));

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });
  });

  describe('GET /escrows/multisig/:jobHash', () => {
    it('should return escrow status', async () => {
      const app = createApp();
      const escrow = makeEscrow();

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      const res = await request(app).get(`/escrows/multisig/${escrow.job_hash}`);

      expect(res.status).toBe(200);
      expect(res.body.job_hash).toBe(escrow.job_hash);
      expect(res.body.status).toBe('locked');
    });

    it('should return 404 for non-existent escrow', async () => {
      const app = createApp();
      const res = await request(app).get('/escrows/multisig/non-existent');

      expect(res.status).toBe(404);
    });
  });

  describe('POST /escrows/multisig/:jobHash/approve', () => {
    it('should approve from authorized signer', async () => {
      const app = createApp();
      const escrow = makeEscrow();

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      const res = await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: escrow.signers[0] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.escrow.sig_count).toBe(1);
      expect(res.body.escrow.approvals[0]).toBe(true);
      expect(res.body.threshold_met).toBe(false);
    });

    it('should release escrow when threshold is met (2-of-3)', async () => {
      const app = createApp();
      const escrow = makeEscrow({ required_signatures: 2 });

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: escrow.signers[0] });

      const res = await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: escrow.signers[1] });

      expect(res.status).toBe(200);
      expect(res.body.threshold_met).toBe(true);
      expect(res.body.escrow.status).toBe('released');
      expect(res.body.escrow.sig_count).toBe(2);
    });

    it('should reject duplicate approval from same signer', async () => {
      const app = createApp();
      const escrow = makeEscrow();

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: escrow.signers[0] });

      const res = await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: escrow.signers[0] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already approved');
    });

    it('should reject unauthorized signer', async () => {
      const app = createApp();
      const escrow = makeEscrow();

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      const res = await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: 'aleo1unauthorized_' + Date.now() });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not an authorized signer');
    });

    it('should reject approval after release', async () => {
      const app = createApp();
      const escrow = makeEscrow({ required_signatures: 1 });

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      // First approval meets threshold and releases
      await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: escrow.signers[0] });

      const res = await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: escrow.signers[1] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot approve escrow in status');
    });

    it('should return 404 for non-existent escrow', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig/non-existent/approve')
        .send({ signer_address: 'aleo1signer_' + Date.now() });

      expect(res.status).toBe(404);
    });

    it('should reject missing signer_address', async () => {
      const app = createApp();
      const escrow = makeEscrow();

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      const res = await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('signer_address');
    });
  });

  describe('GET /escrows/multisig/pending/:address (via /escrows/pending/:address)', () => {
    it('should return escrows pending for a signer', async () => {
      const app = createApp();
      const escrow = makeEscrow();

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      const res = await request(app).get(`/escrows/multisig/pending/${escrow.signers[0]}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((e: { job_hash: string }) => e.job_hash === escrow.job_hash);
      expect(found).toBeDefined();
    });

    it('should not return escrows already approved by this signer', async () => {
      const app = createApp();
      const escrow = makeEscrow();

      await request(app)
        .post('/escrows/multisig')
        .send(escrow);

      // Approve as signer[0]
      await request(app)
        .post(`/escrows/multisig/${escrow.job_hash}/approve`)
        .send({ signer_address: escrow.signers[0] });

      const res = await request(app).get(`/escrows/multisig/pending/${escrow.signers[0]}`);

      const found = res.body.find((e: { job_hash: string }) => e.job_hash === escrow.job_hash);
      expect(found).toBeUndefined();
    });

    it('should return empty array for unknown address', async () => {
      const app = createApp();
      const res = await request(app).get('/escrows/multisig/pending/aleo1unknown');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });

  describe('Per-address rate limiting', () => {
    it('should rate limit escrow creation from same owner', async () => {
      const app = createApp();
      const ownerAddr = 'aleo1owner_rate_ms_' + Date.now();

      // Default config allows 10 multisig ops per minute per address
      let hitLimit = false;
      for (let i = 0; i < 15; i++) {
        const res = await request(app)
          .post('/escrows/multisig')
          .send(makeEscrow({ owner: ownerAddr }));

        if (res.status === 429) {
          expect(res.body.error).toContain('Too many');
          hitLimit = true;
          break;
        }
        expect(res.status).toBe(201);
      }

      expect(hitLimit).toBe(true);
    });

    it('should include rate limit headers in responses', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send(makeEscrow());

      expect(res.headers).toHaveProperty('x-ratelimit-limit');
      expect(res.headers).toHaveProperty('x-ratelimit-remaining');
      expect(res.headers).toHaveProperty('x-ratelimit-reset');
    });
  });
});
