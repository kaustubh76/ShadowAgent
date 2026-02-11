// ShadowAgent Facilitator - Multi-Sig Escrow Route Tests

import { Router } from 'express';

// We test the route logic directly by importing the router and using supertest-like approach
// Since the facilitator uses in-memory stores, we can test by making direct HTTP-like calls

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

const VALID_SIGNERS = [
  'aleo1signer1xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'aleo1signer2xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  'aleo1signer3xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
];

const VALID_ESCROW_BODY = {
  agent: 'aleo1agentxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  amount: 1_000_000,
  job_hash: 'test-job-hash-001',
  secret_hash: 'secret-hash-abc',
  signers: VALID_SIGNERS,
  required_signatures: 2,
  owner: 'aleo1ownerxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
  deadline: 100000,
};

describe('Multi-Sig Escrow Routes', () => {
  describe('POST /escrows/multisig', () => {
    it('should create a multi-sig escrow', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send(VALID_ESCROW_BODY);

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
        .send({ agent: 'aleo1test' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('should reject non-array signers', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: 'unique-1', signers: 'not-an-array' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('array of exactly 3');
    });

    it('should reject signers array with wrong length', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: 'unique-2', signers: ['aleo1a', 'aleo1b'] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('array of exactly 3');
    });

    it('should reject invalid required_signatures', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: 'unique-3', required_signatures: 4 });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('must be 1, 2, or 3');
    });

    it('should reject duplicate job_hash', async () => {
      const app = createApp();
      const jobHash = 'duplicate-test-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      const res = await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      expect(res.status).toBe(409);
      expect(res.body.error).toContain('already exists');
    });
  });

  describe('GET /escrows/multisig/:jobHash', () => {
    it('should return escrow status', async () => {
      const app = createApp();
      const jobHash = 'get-test-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      const res = await request(app).get(`/escrows/multisig/${jobHash}`);

      expect(res.status).toBe(200);
      expect(res.body.job_hash).toBe(jobHash);
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
      const jobHash = 'approve-test-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      const res = await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: VALID_SIGNERS[0] });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.escrow.sig_count).toBe(1);
      expect(res.body.escrow.approvals[0]).toBe(true);
      expect(res.body.threshold_met).toBe(false);
    });

    it('should release escrow when threshold is met (2-of-3)', async () => {
      const app = createApp();
      const jobHash = 'threshold-test-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash, required_signatures: 2 });

      await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: VALID_SIGNERS[0] });

      const res = await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: VALID_SIGNERS[1] });

      expect(res.status).toBe(200);
      expect(res.body.threshold_met).toBe(true);
      expect(res.body.escrow.status).toBe('released');
      expect(res.body.escrow.sig_count).toBe(2);
    });

    it('should reject duplicate approval from same signer', async () => {
      const app = createApp();
      const jobHash = 'dup-approve-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: VALID_SIGNERS[0] });

      const res = await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: VALID_SIGNERS[0] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('already approved');
    });

    it('should reject unauthorized signer', async () => {
      const app = createApp();
      const jobHash = 'unauth-test-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      const res = await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: 'aleo1unauthorized' });

      expect(res.status).toBe(403);
      expect(res.body.error).toContain('not an authorized signer');
    });

    it('should reject approval after release', async () => {
      const app = createApp();
      const jobHash = 'post-release-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash, required_signatures: 1 });

      // First approval meets threshold and releases
      await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: VALID_SIGNERS[0] });

      const res = await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: VALID_SIGNERS[1] });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot approve escrow in status');
    });

    it('should return 404 for non-existent escrow', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/escrows/multisig/non-existent/approve')
        .send({ signer_address: VALID_SIGNERS[0] });

      expect(res.status).toBe(404);
    });

    it('should reject missing signer_address', async () => {
      const app = createApp();
      const jobHash = 'no-signer-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      const res = await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('signer_address');
    });
  });

  describe('GET /escrows/multisig/pending/:address (via /escrows/pending/:address)', () => {
    it('should return escrows pending for a signer', async () => {
      const app = createApp();
      const jobHash = 'pending-test-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      // The pending route is mounted at /pending/:address relative to the router
      const res = await request(app).get(`/escrows/multisig/pending/${VALID_SIGNERS[0]}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      const found = res.body.find((e: { job_hash: string }) => e.job_hash === jobHash);
      expect(found).toBeDefined();
    });

    it('should not return escrows already approved by this signer', async () => {
      const app = createApp();
      const jobHash = 'approved-pending-' + Date.now();

      await request(app)
        .post('/escrows/multisig')
        .send({ ...VALID_ESCROW_BODY, job_hash: jobHash });

      // Approve as signer[0]
      await request(app)
        .post(`/escrows/multisig/${jobHash}/approve`)
        .send({ signer_address: VALID_SIGNERS[0] });

      const res = await request(app).get(`/escrows/multisig/pending/${VALID_SIGNERS[0]}`);

      const found = res.body.find((e: { job_hash: string }) => e.job_hash === jobHash);
      expect(found).toBeUndefined();
    });

    it('should return empty array for unknown address', async () => {
      const app = createApp();
      const res = await request(app).get('/escrows/multisig/pending/aleo1unknown');

      expect(res.status).toBe(200);
      expect(res.body).toEqual([]);
    });
  });
});
