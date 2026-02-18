// x402 Payment Middleware Tests — Redis secret round-trip & TTLStore fallback

import express from 'express';
import request from 'supertest';

// Mock Redis service
const mockRedis = {
  isConnected: jest.fn().mockReturnValue(false),
  setPendingJob: jest.fn().mockResolvedValue(true),
  getPendingJob: jest.fn().mockResolvedValue(null),
  deletePendingJob: jest.fn().mockResolvedValue(true),
  setJobSecret: jest.fn().mockResolvedValue(true),
  getJobSecret: jest.fn().mockResolvedValue(null),
  deleteJobSecret: jest.fn().mockResolvedValue(true),
};

jest.mock('../services/redis', () => ({
  getRedisService: () => mockRedis,
  PendingJob: {},
}));

// Mock Aleo service
jest.mock('../services/aleo', () => ({
  aleoService: {
    verifyEscrowProof: jest.fn().mockResolvedValue({ valid: true }),
    getBlockHeight: jest.fn().mockResolvedValue(1000),
  },
}));

// Mock config
jest.mock('../config', () => ({
  config: {
    rateLimit: {
      x402: { maxRequests: 100, windowMs: 60_000 },
      global: { maxRequests: 1000, windowMs: 60_000 },
      session: { windowMs: 600_000 },
    },
  },
}));

import { x402Middleware, getPendingJob, completeJob, getAllPendingJobs } from './x402';

function createApp(opts = {}) {
  const app = express();
  app.use(express.json());
  app.use('/api', x402Middleware({
    pricePerRequest: 100_000,
    agentAddress: 'aleo1testagent',
    agentId: 'agent_123',
    ...opts,
  }));
  app.get('/api/test', (req, res) => {
    res.json({ message: 'success' });
  });
  return app;
}

describe('x402 Middleware', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockRedis.isConnected.mockReturnValue(false);
  });

  describe('402 Payment Required flow', () => {
    it('should return 402 with payment terms when no proof is provided', async () => {
      const app = createApp();
      const res = await request(app).get('/api/test');

      expect(res.status).toBe(402);
      expect(res.body.error).toBe('Payment Required');
      expect(res.body.payment_terms.price).toBe(100_000);
      expect(res.body.payment_terms.network).toBeTruthy();
      expect(res.body.job_hash).toBeTruthy();
      expect(res.headers['x-payment-required']).toBeTruthy();
      expect(res.headers['x-job-hash']).toBeTruthy();
    });

    it('should skip payment for OPTIONS requests', async () => {
      const app = createApp();
      const res = await request(app).options('/api/test');

      expect(res.status).not.toBe(402);
    });

    it('should skip payment when agentAddress is not set', async () => {
      const app = createApp({ agentAddress: '' });
      const res = await request(app).get('/api/test');

      expect(res.status).toBe(200);
      expect(res.body.message).toBe('success');
    });
  });

  describe('Memory-only storage (Redis disconnected)', () => {
    it('should store and retrieve pending job in memory', async () => {
      const app = createApp();

      // Trigger a 402 to store a job
      const res402 = await request(app).get('/api/test');
      expect(res402.status).toBe(402);

      const jobHash = res402.body.job_hash;
      const job = await getPendingJob(jobHash);

      expect(job).not.toBeNull();
      expect(job!.secret).toBeTruthy();
      expect(job!.secretHash).toBeTruthy();
      expect(job!.price).toBe(100_000);
    });

    it('should delete pending job from memory', async () => {
      const app = createApp();

      const res402 = await request(app).get('/api/test');
      const jobHash = res402.body.job_hash;

      await completeJob(jobHash);
      const job = await getPendingJob(jobHash);
      expect(job).toBeNull();
    });

    it('should list pending jobs from memory (getAllPendingJobs)', async () => {
      const app = createApp();

      const res = await request(app).get('/api/test');
      const jobHash = res.body.job_hash;

      const allJobs = getAllPendingJobs();
      expect(allJobs.size).toBeGreaterThanOrEqual(1);
      expect(allJobs.has(jobHash)).toBe(true);
      const stored = allJobs.get(jobHash)!;
      expect(stored.price).toBe(100_000);
      expect(stored.secretHash).toBeTruthy();
    });
  });

  describe('Redis storage with secret isolation', () => {
    beforeEach(() => {
      mockRedis.isConnected.mockReturnValue(true);
      mockRedis.setPendingJob.mockResolvedValue(true);
      mockRedis.setJobSecret.mockResolvedValue(true);
    });

    it('should store job and secret in Redis when connected', async () => {
      const app = createApp();
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(402);

      // Verify both setPendingJob and setJobSecret were called
      expect(mockRedis.setPendingJob).toHaveBeenCalledTimes(1);
      expect(mockRedis.setJobSecret).toHaveBeenCalledTimes(1);

      const jobCall = mockRedis.setPendingJob.mock.calls[0][0];
      expect(jobCall.agentId).toBe('agent_123');
      expect(jobCall.amount).toBe(100_000);
      expect(jobCall.status).toBe('pending');

      // Secret is stored separately
      const secretCall = mockRedis.setJobSecret.mock.calls[0];
      expect(secretCall[0]).toBe(jobCall.jobHash); // same jobHash
      expect(typeof secretCall[1]).toBe('string'); // the secret
      expect(secretCall[1].length).toBe(64); // 32 bytes hex
    });

    it('should retrieve secret from Redis when reading job', async () => {
      const testSecret = 'a'.repeat(64);
      mockRedis.getPendingJob.mockResolvedValue({
        jobHash: 'test_hash',
        agentId: 'agent_123',
        amount: 100_000,
        secretHash: 'hash_abc',
        createdAt: Date.now(),
        deadline: Date.now() + 3600000,
        status: 'pending',
      });
      mockRedis.getJobSecret.mockResolvedValue(testSecret);

      const job = await getPendingJob('test_hash');
      expect(job).not.toBeNull();
      expect(job!.secret).toBe(testSecret);
      expect(job!.secretHash).toBe('hash_abc');
      expect(job!.price).toBe(100_000);

      expect(mockRedis.getJobSecret).toHaveBeenCalledWith('test_hash');
    });

    it('should return empty secret when Redis has job but secret is missing', async () => {
      mockRedis.getPendingJob.mockResolvedValue({
        jobHash: 'test_hash',
        agentId: 'agent_123',
        amount: 100_000,
        secretHash: 'hash_abc',
        createdAt: Date.now(),
        deadline: Date.now() + 3600000,
        status: 'pending',
      });
      mockRedis.getJobSecret.mockResolvedValue(null);

      const job = await getPendingJob('test_hash');
      expect(job).not.toBeNull();
      expect(job!.secret).toBe('');
    });

    it('should delete both job and secret from Redis on completion', async () => {
      await completeJob('test_hash');

      expect(mockRedis.deletePendingJob).toHaveBeenCalledWith('test_hash');
      expect(mockRedis.deleteJobSecret).toHaveBeenCalledWith('test_hash');
    });
  });

  describe('Redis fallback when secret storage fails', () => {
    it('should fall back to memory when setJobSecret fails', async () => {
      mockRedis.isConnected.mockReturnValue(true);
      mockRedis.setPendingJob.mockResolvedValue(true);
      mockRedis.setJobSecret.mockResolvedValue(false); // secret storage fails
      mockRedis.deletePendingJob.mockResolvedValue(true);

      const app = createApp();
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(402);

      // Job was cleaned up from Redis
      expect(mockRedis.deletePendingJob).toHaveBeenCalled();

      // Job should be retrievable from memory
      const jobHash = res.body.job_hash;
      mockRedis.isConnected.mockReturnValue(false); // force memory path
      const job = await getPendingJob(jobHash);
      expect(job).not.toBeNull();
      expect(job!.secret).toBeTruthy();
    });

    it('should fall back to memory when setPendingJob fails', async () => {
      mockRedis.isConnected.mockReturnValue(true);
      mockRedis.setPendingJob.mockResolvedValue(false);

      const app = createApp();
      const res = await request(app).get('/api/test');
      expect(res.status).toBe(402);

      // setJobSecret should not be called if setPendingJob failed
      expect(mockRedis.setJobSecret).not.toHaveBeenCalled();

      const jobHash = res.body.job_hash;
      mockRedis.isConnected.mockReturnValue(false);
      const job = await getPendingJob(jobHash);
      expect(job).not.toBeNull();
    });
  });

  describe('Rate limiting', () => {
    it('should return 429 when payment generation rate limit exceeded', async () => {
      const app = createApp();

      // Exhaust rate limit (100 requests per window)
      const promises = [];
      for (let i = 0; i < 101; i++) {
        promises.push(request(app).get('/api/test'));
      }
      const responses = await Promise.all(promises);

      const rateLimited = responses.filter(r => r.status === 429);
      expect(rateLimited.length).toBeGreaterThanOrEqual(1);
      expect(rateLimited[0].body.error).toContain('Too many payment requests');
    });
  });
});
