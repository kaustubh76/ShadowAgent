// Verification Routes Tests

import express from 'express';
import request from 'supertest';

// Mock Aleo service
const mockVerifyEscrowProof = jest.fn();
const mockVerifyReputationProof = jest.fn();
const mockIsNullifierUsed = jest.fn();

jest.mock('../services/aleo', () => ({
  aleoService: {
    verifyEscrowProof: (...args: unknown[]) => mockVerifyEscrowProof(...args),
    verifyReputationProof: (...args: unknown[]) => mockVerifyReputationProof(...args),
    isNullifierUsed: (...args: unknown[]) => mockIsNullifierUsed(...args),
  },
}));

import verifyRouter from './verify';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/verify', verifyRouter);
  return app;
}

describe('Verify Routes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('POST /verify/escrow', () => {
    it('should verify a valid escrow proof', async () => {
      mockVerifyEscrowProof.mockResolvedValue({ valid: true });

      const app = createApp();
      const res = await request(app)
        .post('/verify/escrow')
        .send({
          proof: {
            proof: 'base64encodedproof',
            nullifier: 'nullifier_123',
            commitment: 'commitment_abc',
            amount: 100_000,
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.verified_at).toBeTruthy();
      expect(mockVerifyEscrowProof).toHaveBeenCalledTimes(1);
    });

    it('should return invalid for a failed escrow proof', async () => {
      mockVerifyEscrowProof.mockResolvedValue({ valid: false, error: 'Proof mismatch' });

      const app = createApp();
      const res = await request(app)
        .post('/verify/escrow')
        .send({
          proof: {
            proof: 'invalid_proof',
            nullifier: 'n1',
            commitment: 'c1',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBe('Proof mismatch');
    });

    it('should reject missing proof field', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/verify/escrow')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('Missing required field');
      expect(mockVerifyEscrowProof).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      mockVerifyEscrowProof.mockRejectedValue(new Error('RPC timeout'));

      const app = createApp();
      const res = await request(app)
        .post('/verify/escrow')
        .send({ proof: { proof: 'test', nullifier: 'n', commitment: 'c' } });

      expect(res.status).toBe(500);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toBe('Verification failed');
    });
  });

  describe('POST /verify/reputation', () => {
    it('should verify a valid reputation proof', async () => {
      mockVerifyReputationProof.mockResolvedValue({ valid: true, tier: 3 });

      const app = createApp();
      const res = await request(app)
        .post('/verify/reputation')
        .send({
          proof: 'base64reputationproof',
          proof_type: 1,
          threshold: 50,
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      expect(res.body.tier).toBe(3);
      expect(res.body.proof_type).toBe(1);
      expect(res.body.threshold).toBe(50);
      expect(res.body.verified_at).toBeTruthy();
    });

    it('should accept proof as object with nested fields', async () => {
      mockVerifyReputationProof.mockResolvedValue({ valid: true, tier: 2 });

      const app = createApp();
      const res = await request(app)
        .post('/verify/reputation')
        .send({
          proof: {
            proof_type: 2,
            threshold: 100,
            proof: 'encoded_proof_data',
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(true);
      // Should extract proof_type/threshold from nested object
      expect(mockVerifyReputationProof).toHaveBeenCalledWith(
        expect.objectContaining({
          proof_type: 2,
          threshold: 100,
          proof: 'encoded_proof_data',
        })
      );
    });

    it('should reject missing proof field', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/verify/reputation')
        .send({ proof_type: 1, threshold: 50 });

      expect(res.status).toBe(400);
      expect(res.body.valid).toBe(false);
      expect(res.body.error).toContain('Missing required field');
    });

    it('should return invalid for a failed reputation proof', async () => {
      mockVerifyReputationProof.mockResolvedValue({ valid: false, error: 'Threshold not met' });

      const app = createApp();
      const res = await request(app)
        .post('/verify/reputation')
        .send({ proof: 'test_proof', proof_type: 1, threshold: 1000 });

      expect(res.status).toBe(200);
      expect(res.body.valid).toBe(false);
    });

    it('should handle service errors gracefully', async () => {
      mockVerifyReputationProof.mockRejectedValue(new Error('Service unavailable'));

      const app = createApp();
      const res = await request(app)
        .post('/verify/reputation')
        .send({ proof: 'test', proof_type: 1, threshold: 50 });

      expect(res.status).toBe(500);
      expect(res.body.valid).toBe(false);
    });
  });

  describe('POST /verify/nullifier', () => {
    it('should return used=true for spent nullifier', async () => {
      mockIsNullifierUsed.mockResolvedValue(true);

      const app = createApp();
      const res = await request(app)
        .post('/verify/nullifier')
        .send({ nullifier: 'spent_nullifier_abc' });

      expect(res.status).toBe(200);
      expect(res.body.nullifier).toBe('spent_nullifier_abc');
      expect(res.body.is_used).toBe(true);
      expect(res.body.checked_at).toBeTruthy();
    });

    it('should return used=false for unspent nullifier', async () => {
      mockIsNullifierUsed.mockResolvedValue(false);

      const app = createApp();
      const res = await request(app)
        .post('/verify/nullifier')
        .send({ nullifier: 'fresh_nullifier' });

      expect(res.status).toBe(200);
      expect(res.body.is_used).toBe(false);
    });

    it('should reject missing nullifier field', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/verify/nullifier')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.error).toContain('Missing required field');
      expect(mockIsNullifierUsed).not.toHaveBeenCalled();
    });

    it('should handle service errors gracefully', async () => {
      mockIsNullifierUsed.mockRejectedValue(new Error('Redis connection failed'));

      const app = createApp();
      const res = await request(app)
        .post('/verify/nullifier')
        .send({ nullifier: 'test_null' });

      expect(res.status).toBe(500);
      expect(res.body.error).toBe('Check failed');
    });
  });
});
