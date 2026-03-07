import { describe, it, expect, beforeEach } from 'vitest';
import { useTurnDiffStore } from '../../src/stores/turnDiffStore';
import type { GameState, TurnSnapshot, GovernmentState, MarketState, IslandTerrainState } from '../../src/types';

/* ────────────────────────────────────────────────────────────────────────────
 * Turn Diff Store tests — focuses on dramatic detection logic
 * ──────────────────────────────────────────────────────────────────────────── */

/** Minimal snapshot stub */
function makeSnapshot(overrides?: Partial<TurnSnapshot>): TurnSnapshot {
  return {
    turn: 1,
    population: 50,
    births: 0,
    deaths: 0,
    gdp: 100,
    avgSatisfaction: 60,
    avgHealth: 70,
    giniCoefficient: 0.3,
    government: {
      treasury: 500,
      taxRate: 0.1,
      subsidies: { food: 0, goods: 0, services: 0 },
      welfareEnabled: false,
      publicWorksActive: false,
      policyRate: 0.02,
      liquiditySupportActive: false,
    } as GovernmentState,
    sectorBreakdown: {
      food: { workers: 20, output: 50, avgSatisfaction: 60 },
      goods: { workers: 15, output: 30, avgSatisfaction: 55 },
      services: { workers: 15, output: 20, avgSatisfaction: 50 },
    },
    market: { supply: { food: 0, goods: 0, services: 0 }, demand: { food: 0, goods: 0, services: 0 }, prices: { food: 1, goods: 1, services: 1 }, volume: { food: 0, goods: 0, services: 0 } } as any,
    averageMoney: 10,
    medianMoney: 8,
    unemployedCount: 0,
    laborForceParticipationRate: 100,
    causalReplay: {
      satisfaction: { net: 0, drivers: [] },
      policy: {
        taxCollected: 0, welfarePaid: 0, welfareRecipients: 0,
        publicWorksCost: 0, perCapitaCashDelta: 0, policyRate: 0.02,
        liquidityInjected: 0,
      },
    },
    ...overrides,
  } as TurnSnapshot;
}

/** Minimal GameState stub with one snapshot */
function makeGameState(snapshot: TurnSnapshot): GameState {
  return {
    turn: snapshot.turn,
    agents: [],
    terrain: {} as IslandTerrainState,
    economyStage: 1,
    market: {} as MarketState,
    government: snapshot.government,
    statistics: [snapshot],
    events: [],
    milestones: [],
    activeRandomEvents: [],
    pendingDecision: null,
    pendingPolicies: [],
    policyTimeline: [],
    infrastructure: [],
    rngState: 0,
    seed: 42,
    scenarioId: 'default',
    gameOver: null,
  } as GameState;
}

describe('turnDiffStore — dramatic detection', () => {
  beforeEach(() => {
    useTurnDiffStore.getState().clear();
  });

  it('no dramatic on normal small changes', () => {
    const prev = makeSnapshot({ turn: 1, gdp: 100, population: 50, avgSatisfaction: 60, avgHealth: 70, giniCoefficient: 0.3 });
    const curr = makeSnapshot({ turn: 2, gdp: 102, population: 50, avgSatisfaction: 61, avgHealth: 71, giniCoefficient: 0.3 });

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff;
    expect(diff).not.toBeNull();
    expect(diff!.isDramatic).toBe(false);
    expect(diff!.dramaticMetrics).toEqual([]);
  });

  it('GDP ±15% triggers dramatic', () => {
    const prev = makeSnapshot({ turn: 1, gdp: 100 });
    const curr = makeSnapshot({ turn: 2, gdp: 120 }); // +20% > 15% threshold

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    expect(diff.isDramatic).toBe(true);
    expect(diff.dramaticMetrics).toContain('gdp');
  });

  it('population ±5 triggers dramatic', () => {
    const prev = makeSnapshot({ turn: 1, population: 50 });
    const curr = makeSnapshot({ turn: 2, population: 44 }); // -6

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    expect(diff.isDramatic).toBe(true);
    expect(diff.dramaticMetrics).toContain('population');
  });

  it('satisfaction ±10 triggers dramatic', () => {
    const prev = makeSnapshot({ turn: 1, avgSatisfaction: 60 });
    const curr = makeSnapshot({ turn: 2, avgSatisfaction: 48 }); // -12

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    expect(diff.isDramatic).toBe(true);
    expect(diff.dramaticMetrics).toContain('avgSatisfaction');
  });

  it('health ±10 triggers dramatic', () => {
    const prev = makeSnapshot({ turn: 1, avgHealth: 70 });
    const curr = makeSnapshot({ turn: 2, avgHealth: 59 }); // -11

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    expect(diff.isDramatic).toBe(true);
    expect(diff.dramaticMetrics).toContain('avgHealth');
  });

  it('gini ±0.05 triggers dramatic', () => {
    const prev = makeSnapshot({ turn: 1, giniCoefficient: 0.3 });
    const curr = makeSnapshot({ turn: 2, giniCoefficient: 0.36 }); // +0.06

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    expect(diff.isDramatic).toBe(true);
    expect(diff.dramaticMetrics).toContain('giniCoefficient');
  });

  it('multiple metrics can all be dramatic simultaneously', () => {
    const prev = makeSnapshot({ turn: 1, gdp: 100, population: 50, avgSatisfaction: 60 });
    const curr = makeSnapshot({ turn: 2, gdp: 130, population: 40, avgSatisfaction: 45 });

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    expect(diff.isDramatic).toBe(true);
    expect(diff.dramaticMetrics).toContain('gdp');
    expect(diff.dramaticMetrics).toContain('population');
    expect(diff.dramaticMetrics).toContain('avgSatisfaction');
  });

  it('GDP dramatic uses ratio, not absolute (gdp=0 is safe)', () => {
    const prev = makeSnapshot({ turn: 1, gdp: 0 });
    const curr = makeSnapshot({ turn: 2, gdp: 50 });

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    // prev.gdp is 0, so the ratio guard `prev.gdp > 0` prevents division
    expect(diff.dramaticMetrics).not.toContain('gdp');
  });

  it('auto-expands on dramatic turn even during autoplay', () => {
    const prev = makeSnapshot({ turn: 1, population: 50 });
    const curr = makeSnapshot({ turn: 2, population: 40 });

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), true); // isAutoPlay=true

    expect(useTurnDiffStore.getState().expanded).toBe(true);
  });

  it('does NOT auto-expand on non-dramatic autoplay turn', () => {
    const prev = makeSnapshot({ turn: 1, population: 50 });
    const curr = makeSnapshot({ turn: 2, population: 50 });

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), true);

    expect(useTurnDiffStore.getState().expanded).toBe(false);
  });

  it('boundary: exactly 15% GDP change IS dramatic', () => {
    const prev = makeSnapshot({ turn: 1, gdp: 100 });
    const curr = makeSnapshot({ turn: 2, gdp: 115 }); // exactly +15%

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    expect(diff.dramaticMetrics).toContain('gdp');
  });

  it('boundary: exactly 5 population change IS dramatic', () => {
    const prev = makeSnapshot({ turn: 1, population: 50 });
    const curr = makeSnapshot({ turn: 2, population: 55 }); // exactly +5

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const diff = useTurnDiffStore.getState().currentDiff!;
    expect(diff.dramaticMetrics).toContain('population');
  });

  it('clear resets everything', () => {
    const prev = makeSnapshot({ turn: 1, population: 50 });
    const curr = makeSnapshot({ turn: 2, population: 40 });

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);
    useTurnDiffStore.getState().clear();

    const s = useTurnDiffStore.getState();
    expect(s.currentDiff).toBeNull();
    expect(s.prevSnapshot).toBeNull();
    expect(s.expanded).toBe(false);
  });

  it('deltas are computed correctly', () => {
    const prev = makeSnapshot({
      turn: 1, gdp: 100, population: 50, avgSatisfaction: 60,
      avgHealth: 70, giniCoefficient: 0.3,
      government: { treasury: 500 } as GovernmentState,
    });
    const curr = makeSnapshot({
      turn: 2, gdp: 110, population: 52, avgSatisfaction: 62,
      avgHealth: 72, giniCoefficient: 0.32,
      government: { treasury: 520 } as GovernmentState,
    });

    useTurnDiffStore.getState().captureBefore(makeGameState(prev));
    useTurnDiffStore.getState().captureAfter(makeGameState(curr), false);

    const d = useTurnDiffStore.getState().currentDiff!.deltas;
    expect(d.gdp).toBeCloseTo(10);
    expect(d.population).toBe(2);
    expect(d.avgSatisfaction).toBeCloseTo(2);
    expect(d.avgHealth).toBeCloseTo(2);
    expect(d.treasury).toBeCloseTo(20);
    expect(d.giniCoefficient).toBeCloseTo(0.02);
  });
});
