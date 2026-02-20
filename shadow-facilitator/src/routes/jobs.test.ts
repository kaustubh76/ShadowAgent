// ShadowAgent Facilitator - Job Route Tests

jest.setTimeout(30000);

import express from 'express';
import request from 'supertest';
import jobsRouter from './jobs';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/jobs', jobsRouter);
  return app;
}

// Each test gets a unique job to avoid rate limiter collisions
let jobCounter = 0;
function makeJob(overrides?: Record<string, unknown>) {
  jobCounter++;
  const ts = Date.now();
  return {
    agent: `aleo1agent_${ts}_${jobCounter}`,
    client: `aleo1client_${ts}_${jobCounter}`,
    title: `Test Job ${jobCounter}`,
    description: `Description for test job ${jobCounter}`,
    service_type: 1,
    pricing: 5_000_000,
    escrow_amount: 5_000_000,
    secret_hash: `secret_${ts}_${jobCounter}`,
    ...overrides,
  };
}

describe('Job Routes', () => {
  describe('POST /jobs', () => {
    it('should create a new job', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send(makeJob());

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.job.status).toBe('open');
      expect(res.body.job.escrow_status).toBe('pending');
      expect(res.body.job.job_id).toBeDefined();
      expect(res.body.job.job_hash).toBeDefined();
    });

    it('should reject missing required fields', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send({ agent: 'aleo1test_missing_' + Date.now() });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required fields');
    });

    it('should reject invalid service_type', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send(makeJob({ service_type: 99 }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('service_type');
    });

    it('should reject non-positive pricing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send(makeJob({ pricing: -100 }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('positive');
    });

    it('should reject non-positive escrow_amount', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send(makeJob({ escrow_amount: -100 }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('positive');
    });

    it('should create a job with multisig config', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send(makeJob({
          multisig_enabled: true,
          signers: ['aleo1signer1xxxxxxxxx', 'aleo1signer2xxxxxxxxx', 'aleo1signer3xxxxxxxxx'],
          required_signatures: 2,
        }));

      expect(res.status).toBe(201);
      expect(res.body.job.multisig_enabled).toBe(true);
      expect(res.body.job.signers).toHaveLength(3);
      expect(res.body.job.required_signatures).toBe(2);
    });

    it('should reject invalid multisig config - wrong signer count', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send(makeJob({
          multisig_enabled: true,
          signers: ['aleo1signer1xxxxxxxxx', 'aleo1signer2xxxxxxxxx'],
          required_signatures: 2,
        }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('signers');
    });

    it('should reject invalid multisig config - bad required_signatures', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send(makeJob({
          multisig_enabled: true,
          signers: ['aleo1signer1xxxxxxxxx', 'aleo1signer2xxxxxxxxx', 'aleo1signer3xxxxxxxxx'],
          required_signatures: 5,
        }));

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('required_signatures');
    });

    it('should truncate long titles and descriptions', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/jobs')
        .send(makeJob({
          title: 'A'.repeat(500),
          description: 'B'.repeat(5000),
        }));

      expect(res.status).toBe(201);
      expect(res.body.job.title.length).toBe(200);
      expect(res.body.job.description.length).toBe(2000);
    });
  });

  describe('GET /jobs', () => {
    it('should list all jobs', async () => {
      const app = createApp();
      const agent = `aleo1listagent_${Date.now()}`;

      await request(app).post('/jobs').send(makeJob({ agent }));
      await request(app).post('/jobs').send(makeJob({ agent }));

      const res = await request(app).get(`/jobs?agent=${agent}`);

      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body.length).toBe(2);
    });

    it('should filter by agent', async () => {
      const app = createApp();
      const agent1 = `aleo1filteragent1_${Date.now()}`;
      const agent2 = `aleo1filteragent2_${Date.now()}`;

      await request(app).post('/jobs').send(makeJob({ agent: agent1 }));
      await request(app).post('/jobs').send(makeJob({ agent: agent2 }));

      const res = await request(app).get(`/jobs?agent=${agent1}`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].agent).toBe(agent1);
    });

    it('should filter by status', async () => {
      const app = createApp();
      const agent = `aleo1statusagent_${Date.now()}`;

      const createRes = await request(app).post('/jobs').send(makeJob({ agent }));
      await request(app).post('/jobs').send(makeJob({ agent }));

      // Update one job to in_progress
      await request(app)
        .patch(`/jobs/${createRes.body.job.job_id}`)
        .send({ status: 'in_progress' });

      const res = await request(app).get(`/jobs?agent=${agent}&status=open`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].status).toBe('open');
    });

    it('should filter by service_type', async () => {
      const app = createApp();
      const agent = `aleo1svcagent_${Date.now()}`;

      await request(app).post('/jobs').send(makeJob({ agent, service_type: 1 }));
      await request(app).post('/jobs').send(makeJob({ agent, service_type: 3 }));

      const res = await request(app).get(`/jobs?agent=${agent}&service_type=3`);

      expect(res.status).toBe(200);
      expect(res.body.length).toBe(1);
      expect(res.body[0].service_type).toBe(3);
    });

    it('should return jobs sorted by created_at descending', async () => {
      const app = createApp();
      const agent = `aleo1sortagent_${Date.now()}`;

      await request(app).post('/jobs').send(makeJob({ agent, title: 'First' }));
      // Small delay to ensure different timestamps
      await new Promise(r => setTimeout(r, 10));
      await request(app).post('/jobs').send(makeJob({ agent, title: 'Second' }));

      const res = await request(app).get(`/jobs?agent=${agent}`);

      expect(res.status).toBe(200);
      expect(res.body[0].title).toBe('Second');
      expect(res.body[1].title).toBe('First');
    });
  });

  describe('GET /jobs/:jobId', () => {
    it('should return a specific job', async () => {
      const app = createApp();
      const createRes = await request(app).post('/jobs').send(makeJob());

      const res = await request(app).get(`/jobs/${createRes.body.job.job_id}`);

      expect(res.status).toBe(200);
      expect(res.body.job_id).toBe(createRes.body.job.job_id);
    });

    it('should return 404 for unknown job', async () => {
      const app = createApp();
      const res = await request(app).get('/jobs/job_nonexistent_12345');

      expect(res.status).toBe(404);
      expect(res.body.error).toContain('not found');
    });
  });

  describe('PATCH /jobs/:jobId', () => {
    it('should update job status from open to in_progress', async () => {
      const app = createApp();
      const createRes = await request(app).post('/jobs').send(makeJob());

      const res = await request(app)
        .patch(`/jobs/${createRes.body.job.job_id}`)
        .send({ status: 'in_progress' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.job.status).toBe('in_progress');
    });

    it('should update job status from in_progress to completed', async () => {
      const app = createApp();
      const createRes = await request(app).post('/jobs').send(makeJob());

      await request(app)
        .patch(`/jobs/${createRes.body.job.job_id}`)
        .send({ status: 'in_progress' });

      const res = await request(app)
        .patch(`/jobs/${createRes.body.job.job_id}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(200);
      expect(res.body.job.status).toBe('completed');
    });

    it('should allow cancellation from open', async () => {
      const app = createApp();
      const createRes = await request(app).post('/jobs').send(makeJob());

      const res = await request(app)
        .patch(`/jobs/${createRes.body.job.job_id}`)
        .send({ status: 'cancelled' });

      expect(res.status).toBe(200);
      expect(res.body.job.status).toBe('cancelled');
    });

    it('should reject invalid status transitions', async () => {
      const app = createApp();
      const createRes = await request(app).post('/jobs').send(makeJob());

      const res = await request(app)
        .patch(`/jobs/${createRes.body.job.job_id}`)
        .send({ status: 'completed' });

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Cannot transition');
    });

    it('should update escrow_status', async () => {
      const app = createApp();
      const createRes = await request(app).post('/jobs').send(makeJob());

      const res = await request(app)
        .patch(`/jobs/${createRes.body.job.job_id}`)
        .send({ escrow_status: 'locked' });

      expect(res.status).toBe(200);
      expect(res.body.job.escrow_status).toBe('locked');
    });

    it('should return 404 for unknown job', async () => {
      const app = createApp();
      const res = await request(app)
        .patch('/jobs/job_nonexistent_12345')
        .send({ status: 'in_progress' });

      expect(res.status).toBe(404);
    });
  });
});
