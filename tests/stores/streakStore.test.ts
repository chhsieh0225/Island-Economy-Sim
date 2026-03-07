import { describe, it, expect, beforeEach } from 'vitest';
import { useStreakStore } from '../../src/stores/streakStore';
import type { TurnDeltas } from '../../src/stores/turnDiffStore';

/* ────────────────────────────────────────────────────────────────────────────
 * Streak Store tests
 * ──────────────────────────────────────────────────────────────────────────── */

function makeDelta(overrides?: Partial<TurnDeltas>): TurnDeltas {
  return {
    gdp: 0,
    population: 0,
    avgSatisfaction: 0,
    avgHealth: 0,
    treasury: 0,
    giniCoefficient: 0,
    ...overrides,
  };
}

// Positive: gdp >= 0, population >= 0, avgSatisfaction >= -0.5
const POSITIVE_DELTA = makeDelta({ gdp: 10, population: 1, avgSatisfaction: 1 });
// Negative: gdp < 0, population <= 0, avgSatisfaction < -0.5
const NEGATIVE_DELTA = makeDelta({ gdp: -5, population: -1, avgSatisfaction: -2 });
// Mixed: resets streak (gdp positive but satisfaction negative)
const MIXED_DELTA = makeDelta({ gdp: 10, population: 1, avgSatisfaction: -5 });

describe('streakStore', () => {
  beforeEach(() => {
    useStreakStore.getState().clear();
  });

  it('starts with null type and count 0', () => {
    const s = useStreakStore.getState();
    expect(s.type).toBe(null);
    expect(s.count).toBe(0);
    expect(s.bestPositiveStreak).toBe(0);
  });

  it('first positive turn sets type=positive, count=1', () => {
    useStreakStore.getState().recordTurnDeltas(POSITIVE_DELTA);
    const s = useStreakStore.getState();
    expect(s.type).toBe('positive');
    expect(s.count).toBe(1);
  });

  it('consecutive positive turns increment count', () => {
    const { recordTurnDeltas } = useStreakStore.getState();
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA);
    const s = useStreakStore.getState();
    expect(s.type).toBe('positive');
    expect(s.count).toBe(3);
  });

  it('first negative turn sets type=negative, count=1', () => {
    useStreakStore.getState().recordTurnDeltas(NEGATIVE_DELTA);
    const s = useStreakStore.getState();
    expect(s.type).toBe('negative');
    expect(s.count).toBe(1);
  });

  it('consecutive negative turns increment count', () => {
    const { recordTurnDeltas } = useStreakStore.getState();
    recordTurnDeltas(NEGATIVE_DELTA);
    recordTurnDeltas(NEGATIVE_DELTA);
    const s = useStreakStore.getState();
    expect(s.type).toBe('negative');
    expect(s.count).toBe(2);
  });

  it('mixed turn resets streak to null/0', () => {
    const { recordTurnDeltas } = useStreakStore.getState();
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(MIXED_DELTA);
    const s = useStreakStore.getState();
    expect(s.type).toBe(null);
    expect(s.count).toBe(0);
  });

  it('switching from positive to negative resets count to 1', () => {
    const { recordTurnDeltas } = useStreakStore.getState();
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(NEGATIVE_DELTA);
    const s = useStreakStore.getState();
    expect(s.type).toBe('negative');
    expect(s.count).toBe(1);
  });

  it('switching from negative to positive resets count to 1', () => {
    const { recordTurnDeltas } = useStreakStore.getState();
    recordTurnDeltas(NEGATIVE_DELTA);
    recordTurnDeltas(NEGATIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA);
    const s = useStreakStore.getState();
    expect(s.type).toBe('positive');
    expect(s.count).toBe(1);
  });

  it('bestPositiveStreak tracks maximum positive run', () => {
    const { recordTurnDeltas } = useStreakStore.getState();
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA); // streak 3
    recordTurnDeltas(NEGATIVE_DELTA); // resets
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA); // streak 2
    expect(useStreakStore.getState().bestPositiveStreak).toBe(3);
  });

  it('negative streaks do not update bestPositiveStreak', () => {
    const { recordTurnDeltas } = useStreakStore.getState();
    recordTurnDeltas(NEGATIVE_DELTA);
    recordTurnDeltas(NEGATIVE_DELTA);
    recordTurnDeltas(NEGATIVE_DELTA);
    expect(useStreakStore.getState().bestPositiveStreak).toBe(0);
  });

  it('clear resets everything including bestPositiveStreak', () => {
    const { recordTurnDeltas, clear } = useStreakStore.getState();
    recordTurnDeltas(POSITIVE_DELTA);
    recordTurnDeltas(POSITIVE_DELTA);
    clear();
    const s = useStreakStore.getState();
    expect(s.type).toBe(null);
    expect(s.count).toBe(0);
    expect(s.bestPositiveStreak).toBe(0);
  });

  it('boundary: avgSatisfaction exactly -0.5 is positive', () => {
    useStreakStore.getState().recordTurnDeltas(makeDelta({ avgSatisfaction: -0.5 }));
    expect(useStreakStore.getState().type).toBe('positive');
  });

  it('boundary: population 0 is both positive AND negative eligible — positive wins', () => {
    // gdp=0 >= 0 ✓, pop=0 >= 0 ✓ for positive; pop=0 <= 0 ✓ for negative
    // isPositive evaluated first → "positive"
    useStreakStore.getState().recordTurnDeltas(makeDelta({ gdp: 0, population: 0, avgSatisfaction: 0 }));
    expect(useStreakStore.getState().type).toBe('positive');
  });
});
