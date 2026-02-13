// ShadowAgent SDK - Crypto Utility Tests

import {
  generateSecret,
  hashSecret,
  verifyHash,
  generateAgentId,
  generateJobHash,
  createEscrowProof,
  createReputationProof,
  encodeBase64,
  decodeBase64,
} from './crypto';
import { ProofType, Tier } from './types';

describe('Crypto Utilities', () => {
  describe('generateSecret', () => {
    it('should generate a 64-character hex string', () => {
      const secret = generateSecret();
      expect(secret).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(secret)).toBe(true);
    });

    it('should generate unique secrets', () => {
      const secrets = new Set<string>();
      for (let i = 0; i < 100; i++) {
        secrets.add(generateSecret());
      }
      expect(secrets.size).toBe(100);
    });
  });

  describe('hashSecret', () => {
    it('should produce consistent hashes for same input', async () => {
      const secret = 'test-secret-12345';
      const hash1 = await hashSecret(secret);
      const hash2 = await hashSecret(secret);
      expect(hash1).toBe(hash2);
    });

    it('should produce different hashes for different inputs', async () => {
      const hash1 = await hashSecret('secret1');
      const hash2 = await hashSecret('secret2');
      expect(hash1).not.toBe(hash2);
    });

    it('should produce a 64-character hex string', async () => {
      const hash = await hashSecret('any-secret');
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });
  });

  describe('verifyHash', () => {
    it('should verify correct secret-hash pairs', async () => {
      const secret = generateSecret();
      const hash = await hashSecret(secret);
      expect(await verifyHash(secret, hash)).toBe(true);
    });

    it('should reject incorrect secret-hash pairs', async () => {
      const secret = generateSecret();
      const wrongHash = await hashSecret('different-secret');
      expect(await verifyHash(secret, wrongHash)).toBe(false);
    });
  });

  describe('generateAgentId', () => {
    it('should produce consistent IDs for same input', async () => {
      const privateKey = 'APrivateKey1test123';
      const id1 = await generateAgentId(privateKey);
      const id2 = await generateAgentId(privateKey);
      expect(id1).toBe(id2);
    });

    it('should produce different IDs for different inputs', async () => {
      const id1 = await generateAgentId('key1');
      const id2 = await generateAgentId('key2');
      expect(id1).not.toBe(id2);
    });
  });

  describe('generateJobHash', () => {
    it('should produce unique hashes each call (includes nonce)', async () => {
      const hash1 = await generateJobHash('POST', '/api/complete');
      const hash2 = await generateJobHash('POST', '/api/complete');
      // Each call includes a random nonce, so hashes should be different
      expect(hash1).not.toBe(hash2);
    });

    it('should produce a 64-character hex string', async () => {
      const hash = await generateJobHash('POST', '/api/complete');
      expect(hash).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(hash)).toBe(true);
    });

    it('should accept optional timestamp parameter', async () => {
      const timestamp = 1704067200000;
      const hash = await generateJobHash('POST', '/api/complete', timestamp);
      expect(hash).toHaveLength(64);
    });
  });

  describe('createEscrowProof', () => {
    it('should create a valid escrow proof structure', async () => {
      const proof = await createEscrowProof(
        {
          amount: 100000,
          recipient: 'aleo1agent123',
          jobHash: 'job-hash-abc',
          secretHash: 'secret-hash-xyz',
        },
        'test-private-key'
      );

      expect(proof).toHaveProperty('proof');
      expect(proof).toHaveProperty('nullifier');
      expect(proof).toHaveProperty('commitment');
      expect(proof).toHaveProperty('amount', 100000);
    });

    it('should create unique nullifiers for different escrows', async () => {
      const proof1 = await createEscrowProof(
        { amount: 100, recipient: 'agent1', jobHash: 'job1', secretHash: 'hash1' },
        'key1'
      );
      const proof2 = await createEscrowProof(
        { amount: 200, recipient: 'agent2', jobHash: 'job2', secretHash: 'hash2' },
        'key2'
      );
      expect(proof1.nullifier).not.toBe(proof2.nullifier);
    });
  });

  describe('createReputationProof', () => {
    it('should create a valid reputation proof structure', async () => {
      const proof = await createReputationProof(
        ProofType.Rating,
        40, // 4.0 stars threshold
        {
          totalJobs: 100,
          totalRatingPoints: 450,
          totalRevenue: 5000000,
          tier: Tier.Silver,
        },
        'test-private-key'
      );

      expect(proof).toHaveProperty('proof');
      expect(proof).toHaveProperty('proof_type', ProofType.Rating);
      expect(proof).toHaveProperty('threshold', 40);
      expect(proof).toHaveProperty('tier', Tier.Silver);
    });

    it('should create proofs for different proof types', async () => {
      const reputationData = {
        totalJobs: 50,
        totalRatingPoints: 240,
        totalRevenue: 1000000,
        tier: Tier.Bronze,
      };

      const ratingProof = await createReputationProof(ProofType.Rating, 40, reputationData, 'key');
      const jobsProof = await createReputationProof(ProofType.Jobs, 25, reputationData, 'key');
      const tierProof = await createReputationProof(ProofType.Tier, Tier.Bronze, reputationData, 'key');

      expect(ratingProof.proof_type).toBe(ProofType.Rating);
      expect(jobsProof.proof_type).toBe(ProofType.Jobs);
      expect(tierProof.proof_type).toBe(ProofType.Tier);
    });
  });

  describe('encodeBase64 / decodeBase64', () => {
    it('should encode and decode objects correctly', () => {
      const original = { foo: 'bar', num: 42, nested: { a: 1 } };
      const encoded = encodeBase64(original);
      const decoded = decodeBase64<typeof original>(encoded);
      expect(decoded).toEqual(original);
    });

    it('should handle special characters', () => {
      const original = { text: 'Hello, 世界! 🌍' };
      const encoded = encodeBase64(original);
      const decoded = decodeBase64<typeof original>(encoded);
      expect(decoded).toEqual(original);
    });

    it('should produce URL-safe base64', () => {
      const data = { test: 'some data with special chars: +/=' };
      const encoded = encodeBase64(data);
      // URL-safe base64 shouldn't have + or /
      expect(encoded).not.toMatch(/[+/]/);
    });
  });
});
