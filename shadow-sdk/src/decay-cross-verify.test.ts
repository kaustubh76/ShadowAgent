// ShadowAgent SDK - Cross-Verification: Leo vs SDK Decay Math
// Proves that the SDK's calculateDecayedRating() produces identical results
// to the Leo smart contract's integer arithmetic after the multiply-first fix.

import { calculateDecayedRating } from './crypto';
import { DECAY_CONSTANTS } from './types';

const PERIOD = DECAY_CONSTANTS.PERIOD_BLOCKS; // 100_800

/**
 * Mirrors the FIXED Leo integer arithmetic exactly:
 *   result = (result * DECAY_FACTOR_NUM) / DECAY_FACTOR_DEN;
 * Using JavaScript's Math.floor to match Leo's u64 integer division.
 */
function leoApplyDecay(totalRatingPoints: number, periods: number): number {
  const capped = Math.min(periods, DECAY_CONSTANTS.MAX_STEPS);
  let result = totalRatingPoints;
  for (let i = 0; i < capped; i++) {
    result = Math.floor((result * DECAY_CONSTANTS.FACTOR_NUMERATOR) / DECAY_CONSTANTS.FACTOR_DENOMINATOR);
  }
  return result;
}

/**
 * Mirrors the OLD BUGGY Leo formula (divide-first):
 *   result = (result / DECAY_FACTOR_DEN) * DECAY_FACTOR_NUM;
 */
function buggyLeoApplyDecay(totalRatingPoints: number, periods: number): number {
  const capped = Math.min(periods, DECAY_CONSTANTS.MAX_STEPS);
  let result = totalRatingPoints;
  for (let i = 0; i < capped; i++) {
    result = Math.floor(result / DECAY_CONSTANTS.FACTOR_DENOMINATOR) * DECAY_CONSTANTS.FACTOR_NUMERATOR;
  }
  return result;
}

describe('Cross-Verification: Leo vs SDK Decay Math', () => {
  it('should match SDK for rating=99, 1 period (the known divergence case)', () => {
    const sdk = calculateDecayedRating(99, 0, PERIOD);
    const leo = leoApplyDecay(99, 1);
    expect(sdk.effectivePoints).toBe(leo);
    expect(sdk.effectivePoints).toBe(94); // floor(99 * 95 / 100)
  });

  it('should match SDK for rating=1, 1 period (edge: both give 0)', () => {
    const sdk = calculateDecayedRating(1, 0, PERIOD);
    const leo = leoApplyDecay(1, 1);
    expect(sdk.effectivePoints).toBe(leo);
    expect(sdk.effectivePoints).toBe(0); // floor(1 * 95 / 100) = 0
  });

  it('should match SDK for rating=1000, 10 periods (max decay)', () => {
    const sdk = calculateDecayedRating(1000, 0, PERIOD * 10);
    const leo = leoApplyDecay(1000, 10);
    expect(sdk.effectivePoints).toBe(leo);
  });

  it('should match SDK for rating=50000, 5 periods (high rating)', () => {
    const sdk = calculateDecayedRating(50000, 0, PERIOD * 5);
    const leo = leoApplyDecay(50000, 5);
    expect(sdk.effectivePoints).toBe(leo);
  });

  it('should match SDK for rating=100, all 10 decay steps', () => {
    for (let steps = 1; steps <= 10; steps++) {
      const sdk = calculateDecayedRating(100, 0, PERIOD * steps);
      const leo = leoApplyDecay(100, steps);
      expect(sdk.effectivePoints).toBe(leo);
    }
  });

  it('should match SDK exhaustively for ratings 0-1000 (step 50) at all 10 decay steps', () => {
    for (let rating = 0; rating <= 1000; rating += 50) {
      for (let steps = 1; steps <= 10; steps++) {
        const sdk = calculateDecayedRating(rating, 0, PERIOD * steps);
        const leo = leoApplyDecay(rating, steps);
        expect(sdk.effectivePoints).toBe(leo);
      }
    }
  });

  describe('Regression: old buggy divide-first formula', () => {
    it('should produce WRONG result for rating=99 (0 instead of 94)', () => {
      const buggy = buggyLeoApplyDecay(99, 1);
      const correct = leoApplyDecay(99, 1);
      expect(buggy).toBe(0);     // (99 / 100) * 95 = 0 * 95 = 0
      expect(correct).toBe(94);  // (99 * 95) / 100 = 9405 / 100 = 94
      expect(buggy).not.toBe(correct);
    });

    it('should diverge for any rating < 100', () => {
      // For ratings < 100, divide-first truncates to 0 on first step
      for (let rating = 1; rating < 100; rating++) {
        const buggy = buggyLeoApplyDecay(rating, 1);
        const correct = leoApplyDecay(rating, 1);
        expect(buggy).toBe(0); // All < 100 get zeroed by divide-first
        if (rating >= 2) {
          // rating >= 2: floor(rating * 95 / 100) >= 1
          expect(correct).toBeGreaterThan(0);
        }
      }
    });

    it('should match for rating=100 (no precision loss at exact boundary)', () => {
      // 100 / 100 = 1, then * 95 = 95. Also: 100 * 95 / 100 = 95. Same!
      const buggy = buggyLeoApplyDecay(100, 1);
      const correct = leoApplyDecay(100, 1);
      expect(buggy).toBe(95);
      expect(correct).toBe(95);
    });
  });
});
