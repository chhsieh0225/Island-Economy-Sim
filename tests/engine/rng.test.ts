import { describe, it, expect } from 'vitest';
import { RNG } from '../../src/engine/RNG';

describe('RNG', () => {
  describe('determinism', () => {
    it('same seed produces identical sequence', () => {
      const a = new RNG(42);
      const b = new RNG(42);
      for (let i = 0; i < 100; i++) {
        expect(a.next()).toBe(b.next());
      }
    });

    it('different seeds produce different sequences', () => {
      const a = new RNG(42);
      const b = new RNG(99);
      // At least one value differs in first 10
      const diffs = Array.from({ length: 10 }, () => a.next() !== b.next());
      expect(diffs.some(d => d)).toBe(true);
    });
  });

  describe('next()', () => {
    it('returns values in [0, 1)', () => {
      const rng = new RNG(12345);
      for (let i = 0; i < 1000; i++) {
        const v = rng.next();
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThan(1);
      }
    });
  });

  describe('nextInt()', () => {
    it('returns values within [min, max] inclusive', () => {
      const rng = new RNG(777);
      for (let i = 0; i < 500; i++) {
        const v = rng.nextInt(3, 7);
        expect(v).toBeGreaterThanOrEqual(3);
        expect(v).toBeLessThanOrEqual(7);
        expect(Number.isInteger(v)).toBe(true);
      }
    });

    it('returns exact value when min === max', () => {
      const rng = new RNG(1);
      for (let i = 0; i < 20; i++) {
        expect(rng.nextInt(5, 5)).toBe(5);
      }
    });

    it('covers full range over many calls', () => {
      const rng = new RNG(42);
      const seen = new Set<number>();
      for (let i = 0; i < 500; i++) {
        seen.add(rng.nextInt(0, 4));
      }
      expect(seen.size).toBe(5); // 0,1,2,3,4
    });
  });

  describe('nextGaussian()', () => {
    it('mean approximately matches target over large sample', () => {
      const rng = new RNG(42);
      const mean = 100;
      const stddev = 15;
      const N = 10000;
      let sum = 0;
      for (let i = 0; i < N; i++) {
        sum += rng.nextGaussian(mean, stddev);
      }
      const observedMean = sum / N;
      // Within 2 standard errors: stddev / sqrt(N) * 2 ≈ 0.3
      expect(observedMean).toBeCloseTo(mean, 0);
    });

    it('produces spread around the mean', () => {
      const rng = new RNG(42);
      const values = Array.from({ length: 200 }, () => rng.nextGaussian(50, 10));
      const min = Math.min(...values);
      const max = Math.max(...values);
      // With stddev=10, range should be at least 30
      expect(max - min).toBeGreaterThan(20);
    });
  });

  describe('pick()', () => {
    it('returns elements from the array', () => {
      const rng = new RNG(42);
      const arr = ['a', 'b', 'c'];
      for (let i = 0; i < 50; i++) {
        expect(arr).toContain(rng.pick(arr));
      }
    });

    it('covers all elements given enough calls', () => {
      const rng = new RNG(42);
      const arr = [10, 20, 30];
      const seen = new Set<number>();
      for (let i = 0; i < 100; i++) {
        seen.add(rng.pick(arr));
      }
      expect(seen.size).toBe(3);
    });
  });

  describe('state serialization', () => {
    it('getState/setState round-trip preserves subsequent sequence', () => {
      const rng = new RNG(42);
      // Advance a few steps
      for (let i = 0; i < 10; i++) rng.next();

      const savedState = rng.getState();
      const expected = [rng.next(), rng.next(), rng.next()];

      // Restore and re-generate
      rng.setState(savedState);
      const actual = [rng.next(), rng.next(), rng.next()];

      expect(actual).toEqual(expected);
    });

    it('cloned state produces identical output', () => {
      const rng1 = new RNG(42);
      for (let i = 0; i < 5; i++) rng1.next();

      const rng2 = new RNG(0);
      rng2.setState(rng1.getState());

      for (let i = 0; i < 20; i++) {
        expect(rng1.next()).toBe(rng2.next());
      }
    });
  });
});
