// ShadowAgent SDK - Phase 10a Decay Utility Tests

import {
  calculateDecayedRating,
  estimateDecayPeriods,
  calculateEffectiveTier,
} from './crypto';
import { DECAY_CONSTANTS, Tier } from './types';

describe('Phase 10a: Decay Utilities', () => {
  const PERIOD = DECAY_CONSTANTS.PERIOD_BLOCKS; // 100_800

  describe('calculateDecayedRating', () => {
    it('should return original points when no time has elapsed', () => {
      const result = calculateDecayedRating(1000, 500_000, 500_000);
      expect(result.effectivePoints).toBe(1000);
      expect(result.decayPeriods).toBe(0);
      expect(result.decayFactor).toBe(1);
    });

    it('should return original points when less than one period has elapsed', () => {
      const result = calculateDecayedRating(1000, 500_000, 500_000 + PERIOD - 1);
      expect(result.effectivePoints).toBe(1000);
      expect(result.decayPeriods).toBe(0);
    });

    it('should apply one decay step after exactly one period', () => {
      const result = calculateDecayedRating(1000, 500_000, 500_000 + PERIOD);
      // floor(1000 * 95 / 100) = 950
      expect(result.effectivePoints).toBe(950);
      expect(result.decayPeriods).toBe(1);
    });

    it('should apply two decay steps after two periods', () => {
      const result = calculateDecayedRating(1000, 500_000, 500_000 + PERIOD * 2);
      // Step 1: floor(1000 * 95 / 100) = 950
      // Step 2: floor(950 * 95 / 100) = 902
      expect(result.effectivePoints).toBe(902);
      expect(result.decayPeriods).toBe(2);
    });

    it('should cap decay at 10 periods', () => {
      const result = calculateDecayedRating(1000, 500_000, 500_000 + PERIOD * 20);
      expect(result.decayPeriods).toBe(10);

      // Verify max decay is applied
      const maxDecay = calculateDecayedRating(1000, 500_000, 500_000 + PERIOD * 10);
      expect(result.effectivePoints).toBe(maxDecay.effectivePoints);
    });

    it('should correctly apply 10 steps of integer decay', () => {
      let expected = 1000;
      for (let i = 0; i < 10; i++) {
        expected = Math.floor((expected * 95) / 100);
      }

      const result = calculateDecayedRating(1000, 0, PERIOD * 10);
      expect(result.effectivePoints).toBe(expected);
    });

    it('should handle zero rating points', () => {
      const result = calculateDecayedRating(0, 0, PERIOD * 5);
      expect(result.effectivePoints).toBe(0);
      expect(result.decayPeriods).toBe(5);
    });

    it('should handle large rating values without overflow', () => {
      const largeRating = 1_000_000_000;
      const result = calculateDecayedRating(largeRating, 0, PERIOD * 5);
      expect(result.effectivePoints).toBeGreaterThan(0);
      expect(result.effectivePoints).toBeLessThan(largeRating);
    });

    it('should return correct decayFactor', () => {
      const result = calculateDecayedRating(1000, 0, PERIOD * 3);
      expect(result.decayFactor).toBeCloseTo(Math.pow(0.95, 3), 10);
    });
  });

  describe('estimateDecayPeriods', () => {
    it('should return 0 for same block', () => {
      expect(estimateDecayPeriods(1000, 1000)).toBe(0);
    });

    it('should return 0 for less than one period', () => {
      expect(estimateDecayPeriods(1000, 1000 + PERIOD - 1)).toBe(0);
    });

    it('should return 1 for exactly one period', () => {
      expect(estimateDecayPeriods(1000, 1000 + PERIOD)).toBe(1);
    });

    it('should return correct periods for multiple periods', () => {
      expect(estimateDecayPeriods(0, PERIOD * 7)).toBe(7);
    });

    it('should cap at 10', () => {
      expect(estimateDecayPeriods(0, PERIOD * 50)).toBe(10);
    });

    it('should floor partial periods', () => {
      expect(estimateDecayPeriods(0, PERIOD * 3 + 50000)).toBe(3);
    });
  });

  describe('calculateEffectiveTier', () => {
    it('should return New (0) for zero stats', () => {
      expect(calculateEffectiveTier(0, 0)).toBe(Tier.New);
    });

    it('should return Bronze (1) at threshold', () => {
      expect(calculateEffectiveTier(10, 10_000_000)).toBe(Tier.Bronze);
    });

    it('should return New (0) when jobs below Bronze threshold', () => {
      expect(calculateEffectiveTier(9, 10_000_000)).toBe(Tier.New);
    });

    it('should return New (0) when revenue below Bronze threshold', () => {
      expect(calculateEffectiveTier(10, 9_999_999)).toBe(Tier.New);
    });

    it('should return Silver (2) at threshold', () => {
      expect(calculateEffectiveTier(50, 100_000_000)).toBe(Tier.Silver);
    });

    it('should return Gold (3) at threshold', () => {
      expect(calculateEffectiveTier(200, 1_000_000_000)).toBe(Tier.Gold);
    });

    it('should return Diamond (4) at threshold', () => {
      expect(calculateEffectiveTier(1000, 10_000_000_000)).toBe(Tier.Diamond);
    });

    it('should return highest tier when both thresholds exceeded', () => {
      expect(calculateEffectiveTier(5000, 50_000_000_000)).toBe(Tier.Diamond);
    });

    it('should require both jobs AND revenue for tier upgrade', () => {
      // High jobs but low revenue
      expect(calculateEffectiveTier(1000, 0)).toBe(Tier.New);
      // Low jobs but high revenue
      expect(calculateEffectiveTier(0, 10_000_000_000)).toBe(Tier.New);
    });
  });
});
