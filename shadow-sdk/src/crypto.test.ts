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

// Additional crypto tests: generateNullifier, generateCommitment, generateSessionId

describe('Additional Crypto Utilities', () => {
  describe('generateNullifier', () => {
    it('should produce consistent nullifiers for same inputs', async () => {
      const { generateNullifier } = await import('./crypto');
      const n1 = await generateNullifier('callerHash1', 'jobHash1');
      const n2 = await generateNullifier('callerHash1', 'jobHash1');
      expect(n1).toBe(n2);
    });

    it('should produce different nullifiers for different inputs', async () => {
      const { generateNullifier } = await import('./crypto');
      const n1 = await generateNullifier('callerA', 'job1');
      const n2 = await generateNullifier('callerB', 'job1');
      const n3 = await generateNullifier('callerA', 'job2');
      expect(n1).not.toBe(n2);
      expect(n1).not.toBe(n3);
      expect(n2).not.toBe(n3);
    });

    it('should produce a 64-character hex string', async () => {
      const { generateNullifier } = await import('./crypto');
      const n = await generateNullifier('caller', 'job');
      expect(n).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(n)).toBe(true);
    });
  });

  describe('generateCommitment', () => {
    it('should produce consistent commitments for same inputs', async () => {
      const { generateCommitment } = await import('./crypto');
      const c1 = await generateCommitment(100000, 'aleo1recipient', 'secret123');
      const c2 = await generateCommitment(100000, 'aleo1recipient', 'secret123');
      expect(c1).toBe(c2);
    });

    it('should produce different commitments for different amounts', async () => {
      const { generateCommitment } = await import('./crypto');
      const c1 = await generateCommitment(100000, 'aleo1r', 'secret');
      const c2 = await generateCommitment(200000, 'aleo1r', 'secret');
      expect(c1).not.toBe(c2);
    });

    it('should produce different commitments for different recipients', async () => {
      const { generateCommitment } = await import('./crypto');
      const c1 = await generateCommitment(100000, 'aleo1a', 'secret');
      const c2 = await generateCommitment(100000, 'aleo1b', 'secret');
      expect(c1).not.toBe(c2);
    });

    it('should produce different commitments for different secrets', async () => {
      const { generateCommitment } = await import('./crypto');
      const c1 = await generateCommitment(100000, 'aleo1r', 'secretA');
      const c2 = await generateCommitment(100000, 'aleo1r', 'secretB');
      expect(c1).not.toBe(c2);
    });

    it('should produce a 64-character hex string', async () => {
      const { generateCommitment } = await import('./crypto');
      const c = await generateCommitment(42, 'recipient', 'mysecret');
      expect(c).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(c)).toBe(true);
    });
  });

  describe('generateNullifier - edge cases', () => {
    it('should handle empty string inputs without throwing', async () => {
      const { generateNullifier } = await import('./crypto');
      const n = await generateNullifier('', '');
      expect(n).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(n)).toBe(true);
    });

    it('should be sensitive to argument order', async () => {
      const { generateNullifier } = await import('./crypto');
      const n1 = await generateNullifier('alpha', 'beta');
      const n2 = await generateNullifier('beta', 'alpha');
      expect(n1).not.toBe(n2);
    });

    it('should produce deterministic output with long inputs', async () => {
      const { generateNullifier } = await import('./crypto');
      const longCaller = 'aleo1' + 'a'.repeat(60);
      const longJob = 'job_' + 'z'.repeat(100);
      const n1 = await generateNullifier(longCaller, longJob);
      const n2 = await generateNullifier(longCaller, longJob);
      expect(n1).toBe(n2);
      expect(n1).toHaveLength(64);
    });
  });

  describe('generateCommitment - edge cases', () => {
    it('should handle zero amount', async () => {
      const { generateCommitment } = await import('./crypto');
      const c = await generateCommitment(0, 'aleo1r', 'secret');
      expect(c).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(c)).toBe(true);
    });

    it('should produce different commitments for zero vs non-zero amount', async () => {
      const { generateCommitment } = await import('./crypto');
      const c1 = await generateCommitment(0, 'aleo1r', 'secret');
      const c2 = await generateCommitment(1, 'aleo1r', 'secret');
      expect(c1).not.toBe(c2);
    });

    it('should match the hash of amount:recipient:secret format', async () => {
      const { generateCommitment, hashSecret } = await import('./crypto');
      const commitment = await generateCommitment(500, 'addr', 'sec');
      const manual = await hashSecret('500:addr:sec');
      expect(commitment).toBe(manual);
    });

    it('should handle very large amounts', async () => {
      const { generateCommitment } = await import('./crypto');
      const c = await generateCommitment(Number.MAX_SAFE_INTEGER, 'aleo1r', 'secret');
      expect(c).toHaveLength(64);
      expect(/^[a-f0-9]+$/.test(c)).toBe(true);
    });
  });

  describe('generateSessionId', () => {
    it('should produce a 32-character hex string', () => {
      const { generateSessionId } = require('./crypto');
      const id = generateSessionId();
      expect(id).toHaveLength(32);
      expect(/^[a-f0-9]+$/.test(id)).toBe(true);
    });

    it('should produce unique IDs each call', () => {
      const { generateSessionId } = require('./crypto');
      const ids = new Set<string>();
      for (let i = 0; i < 100; i++) {
        ids.add(generateSessionId());
      }
      expect(ids.size).toBe(100);
    });

    it('should return a string type', () => {
      const { generateSessionId } = require('./crypto');
      const id = generateSessionId();
      expect(typeof id).toBe('string');
    });

    it('should produce IDs of exactly 16 bytes (32 hex chars)', () => {
      const { generateSessionId } = require('./crypto');
      const id = generateSessionId();
      expect(id.length).toBe(32);
      for (let i = 0; i < id.length; i += 2) {
        const byte = parseInt(id.substring(i, i + 2), 16);
        expect(byte).toBeGreaterThanOrEqual(0);
        expect(byte).toBeLessThanOrEqual(255);
      }
    });

    it('should never produce the same ID in rapid succession', () => {
      const { generateSessionId } = require('./crypto');
      const id1 = generateSessionId();
      const id2 = generateSessionId();
      const id3 = generateSessionId();
      expect(id1).not.toBe(id2);
      expect(id2).not.toBe(id3);
      expect(id1).not.toBe(id3);
    });
  });
});
