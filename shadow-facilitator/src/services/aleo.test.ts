// ShadowAgent Facilitator - Aleo Service Tests

import { AleoService } from './aleo';
import { Tier } from '../types';

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

describe('AleoService', () => {
  let aleoService: AleoService;

  beforeEach(() => {
    mockFetch.mockClear();
    aleoService = new AleoService('https://api.test.aleo.org', 'shadow_agent.aleo');
  });

  describe('getBlockHeight', () => {
    it('should return block height as number', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(12345),
      });

      const height = await aleoService.getBlockHeight();
      expect(height).toBe(12345);
    });

    it('should parse string block height', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve('67890'),
      });

      const height = await aleoService.getBlockHeight();
      expect(height).toBe(67890);
    });

    it('should throw on fetch failure', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        statusText: 'Service Unavailable',
      });

      await expect(aleoService.getBlockHeight()).rejects.toThrow('Failed to fetch block height');
    });
  });

  describe('getAgentListing', () => {
    it('should return agent listing', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () =>
          Promise.resolve({
            service_type: '1u8',
            endpoint_hash: 'hash123',
            min_tier: '2u8',
            is_active: true,
          }),
      });

      const listing = await aleoService.getAgentListing('agent123');
      expect(listing).not.toBeNull();
      expect(listing?.agent_id).toBe('agent123');
      expect(listing?.service_type).toBe(1);
      expect(listing?.tier).toBe(2);
    });

    it('should return null for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const listing = await aleoService.getAgentListing('nonexistent');
      expect(listing).toBeNull();
    });
  });

  describe('isNullifierUsed', () => {
    it('should return true if nullifier is used', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(true),
      });

      const isUsed = await aleoService.isNullifierUsed('nullifier123');
      expect(isUsed).toBe(true);
    });

    it('should return false for 404', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const isUsed = await aleoService.isNullifierUsed('new-nullifier');
      expect(isUsed).toBe(false);
    });
  });

  describe('isAddressRegistered', () => {
    it('should return true if address is registered', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve('true'),
      });

      const isRegistered = await aleoService.isAddressRegistered('aleo1address123');
      expect(isRegistered).toBe(true);
    });

    it('should return false for unregistered address', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const isRegistered = await aleoService.isAddressRegistered('aleo1newaddress');
      expect(isRegistered).toBe(false);
    });
  });

  describe('getRegistrationBond', () => {
    it('should return the registration bond constant', () => {
      const bond = aleoService.getRegistrationBond();
      expect(bond).toBe(10_000_000);
    });
  });

  describe('verifyEscrowProof', () => {
    it('should validate proof structure - missing proof', async () => {
      // No mock needed - validation fails before network call
      const result = await aleoService.verifyEscrowProof({
        proof: '',
        nullifier: 'null123',
        commitment: 'commit123',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    it('should validate proof structure - missing nullifier', async () => {
      const result = await aleoService.verifyEscrowProof({
        proof: 'validproof123',
        nullifier: '',
        commitment: 'commit123',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    it('should reject used nullifier', async () => {
      // Mock isNullifierUsed to return true (nullifier used)
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: () => Promise.resolve(true),
      });

      const result = await aleoService.verifyEscrowProof({
        proof: 'YWJjZGVmZ2hpamtsbW5vcA==', // valid base64
        nullifier: 'used-nullifier',
        commitment: 'commit123',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Nullifier already used');
    });

    it('should accept valid proof when nullifier not used', async () => {
      // Mock isNullifierUsed to return false (nullifier not used - 404)
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await aleoService.verifyEscrowProof({
        proof: 'YWJjZGVmZ2hpamtsbW5vcA==', // valid base64, >= 10 chars
        nullifier: 'fresh-nullifier',
        commitment: 'commit123',
      });

      expect(result.valid).toBe(true);
    });

    it('should reject proof with invalid format (too short)', async () => {
      // Mock isNullifierUsed to return false
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404,
      });

      const result = await aleoService.verifyEscrowProof({
        proof: 'short', // Too short, < 10 chars
        nullifier: 'nullifier',
        commitment: 'commit',
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid proof format');
    });
  });

  describe('verifyReputationProof', () => {
    it('should validate proof structure', async () => {
      const result = await aleoService.verifyReputationProof({
        proof: 'validproof',
        proof_type: undefined as unknown as number,
        threshold: 10,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toContain('missing required fields');
    });

    it('should validate proof type range', async () => {
      const result = await aleoService.verifyReputationProof({
        proof: 'dGVzdA==',
        proof_type: 5, // Invalid type
        threshold: 10,
      });

      expect(result.valid).toBe(false);
      expect(result.error).toBe('Invalid proof type');
    });

    it('should check threshold requirement', async () => {
      const result = await aleoService.verifyReputationProof(
        {
          proof: 'dGVzdA==',
          proof_type: 1,
          threshold: 30,
        },
        40 // Required threshold higher than proven
      );

      expect(result.valid).toBe(false);
      expect(result.error).toContain('does not meet required');
    });

    it('should accept valid proof', async () => {
      const result = await aleoService.verifyReputationProof({
        proof: 'dGVzdHByb29m',
        proof_type: 4, // Tier proof
        threshold: Tier.Silver,
        tier: Tier.Gold,
      });

      expect(result.valid).toBe(true);
      expect(result.tier).toBe(Tier.Gold);
    });
  });

  describe('getProgramId', () => {
    it('should return program ID', () => {
      expect(aleoService.getProgramId()).toBe('shadow_agent.aleo');
    });
  });

  describe('getRpcUrl', () => {
    it('should return RPC URL', () => {
      expect(aleoService.getRpcUrl()).toBe('https://api.test.aleo.org');
    });
  });
});
