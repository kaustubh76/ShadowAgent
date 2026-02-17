// ShadowAgent Facilitator - Health Route Tests

// Mock the index module (logger) to prevent full app bootstrap
jest.mock('../index', () => ({
  logger: {
    info: jest.fn(),
    debug: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock aleo service to control block height responses
const mockGetBlockHeight = jest.fn();
jest.mock('../services/aleo', () => ({
  aleoService: {
    getBlockHeight: mockGetBlockHeight,
  },
}));

import express from 'express';
import request from 'supertest';
import healthRouter from './health';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/health', healthRouter);
  return app;
}

describe('Health Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // GET /health
  describe('GET /health', () => {
    it('should return ok status with timestamp and version', async () => {
      const app = createApp();
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.version).toBe('0.1.0');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return a valid ISO timestamp', async () => {
      const app = createApp();
      const res = await request(app).get('/health');

      const parsed = new Date(res.body.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });
  });

  // GET /health/ready
  describe('GET /health/ready', () => {
    it('should return ready when Aleo network is reachable', async () => {
      mockGetBlockHeight.mockResolvedValue(12345);

      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ready');
      expect(res.body.blockHeight).toBe(12345);
      expect(res.body.version).toBe('0.1.0');
      expect(res.body).toHaveProperty('network');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return 503 when block height is 0', async () => {
      mockGetBlockHeight.mockResolvedValue(0);

      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not ready');
      expect(res.body.error).toContain('Cannot connect');
    });

    it('should return 503 when Aleo service throws', async () => {
      mockGetBlockHeight.mockRejectedValue(new Error('Network timeout'));

      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not ready');
      expect(res.body.error).toContain('Health check failed');
      expect(res.body.version).toBe('0.1.0');
    });

    it('should return 503 when block height is negative', async () => {
      mockGetBlockHeight.mockResolvedValue(-1);

      const app = createApp();
      const res = await request(app).get('/health/ready');

      expect(res.status).toBe(503);
      expect(res.body.status).toBe('not ready');
    });
  });

  // GET /health/live
  describe('GET /health/live', () => {
    it('should return live status', async () => {
      const app = createApp();
      const res = await request(app).get('/health/live');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('live');
      expect(res.body).toHaveProperty('timestamp');
    });

    it('should return a valid ISO timestamp', async () => {
      const app = createApp();
      const res = await request(app).get('/health/live');

      const parsed = new Date(res.body.timestamp);
      expect(parsed.getTime()).not.toBeNaN();
    });

    it('should not include version or blockHeight', async () => {
      const app = createApp();
      const res = await request(app).get('/health/live');

      expect(res.body).not.toHaveProperty('version');
      expect(res.body).not.toHaveProperty('blockHeight');
    });
  });
});
