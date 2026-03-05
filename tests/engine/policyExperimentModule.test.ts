import { describe, it, expect } from 'vitest';

import type { PolicyTimelineEntry, TurnSnapshot } from '../../src/types';
import { buildPolicyExperimentCards } from '../../src/engine/modules/policyExperimentModule';

function snapshot(turn: number, overrides?: Partial<TurnSnapshot>): TurnSnapshot {
  return {
    turn,
    population: 100,
    gdp: 1000,
    giniCoefficient: 0.3,
    avgSatisfaction: 60,
    avgHealth: 90,
    jobDistribution: { food: 40, goods: 30, services: 30 },
    market: {
      prices: { food: 10, goods: 12, services: 11 },
      priceHistory: { food: [10], goods: [12], services: [11] },
      supply: { food: 100, goods: 80, services: 70 },
      demand: { food: 98, goods: 82, services: 72 },
      volume: { food: 90, goods: 70, services: 60 },
    },
    government: {
      treasury: 100,
      taxRate: 0.1,
      subsidies: { food: 0, goods: 0, services: 0 },
      welfareEnabled: false,
      publicWorksActive: false,
      policyRate: 0.018,
      liquiditySupportActive: false,
    },
    births: 0,
    deaths: 0,
    avgAge: 32,
    workingAgePopulation: 70,
    laborForce: 68,
    employed: 65,
    unemployed: 3,
    employmentRate: 0.96,
    unemploymentRate: 0.04,
    laborParticipationRate: 0.97,
    crudeBirthRate: 0,
    fertilityRate: 0,
    laborProductivity: 15,
    dependencyRatio: 0.4,
    causalReplay: {
      satisfaction: { net: 0, unit: 'point', drivers: [{ id: 'flat', label: 'flat', value: 0 }] },
      health: { net: 0, unit: 'point', drivers: [{ id: 'flat', label: 'flat', value: 0 }] },
      departures: { net: 0, unit: 'count', drivers: [{ id: 'flat', label: 'flat', value: 0 }] },
      policy: {
        taxCollected: 0,
        welfarePaid: 0,
        welfareRecipients: 0,
        publicWorksCost: 0,
        liquidityInjected: 0,
        policyRate: 0.018,
        perCapitaCashDelta: 0,
        treasuryDelta: 0,
      },
    },
    ...overrides,
  };
}

function timelineEntry(overrides?: Partial<PolicyTimelineEntry>): PolicyTimelineEntry {
  return {
    id: 'policy_1',
    type: 'tax',
    requestedTurn: 4,
    applyTurn: 5,
    status: 'applied',
    value: 0.2,
    summary: '稅率調整至 20%',
    sideEffects: ['國庫收入增加', '消費與需求可能放緩'],
    ...overrides,
  };
}

describe('policyExperimentModule', () => {
  it('returns complete card after full observation window', () => {
    const history: TurnSnapshot[] = [
      snapshot(4, { avgSatisfaction: 55, gdp: 1000, population: 100, government: { ...snapshot(0).government, treasury: 100 } }),
      snapshot(5, { avgSatisfaction: 57, gdp: 1070, population: 101, government: { ...snapshot(0).government, treasury: 106 } }),
      snapshot(6, { avgSatisfaction: 60, gdp: 1140, population: 102, government: { ...snapshot(0).government, treasury: 112 } }),
      snapshot(7, { avgSatisfaction: 62, gdp: 1200, population: 103, government: { ...snapshot(0).government, treasury: 118 } }),
    ];
    const cards = buildPolicyExperimentCards([timelineEntry()], history, { observationTurns: 3 });

    expect(cards.length).toBe(1);
    expect(cards[0].status).toBe('complete');
    expect(cards[0].observedTurn).toBe(7);
    expect(cards[0].metrics).not.toBeNull();
    if (!cards[0].metrics) return;
    expect(cards[0].metrics.satisfactionDelta).toBe(7);
    expect(cards[0].metrics.treasuryDelta).toBe(18);
    expect(cards[0].metrics.gdpDeltaPercent).toBe(20);
    expect(cards[0].metrics.populationDelta).toBe(3);
  });

  it('pending policy stays pending before apply turn', () => {
    const history: TurnSnapshot[] = [snapshot(3), snapshot(4)];
    const cards = buildPolicyExperimentCards(
      [timelineEntry({ status: 'pending', requestedTurn: 4, applyTurn: 5 })],
      history,
      { observationTurns: 3 },
    );

    expect(cards[0].status).toBe('pending');
    expect(cards[0].metrics).toBeNull();
  });

  it('applied policy is collecting when window not complete', () => {
    const history: TurnSnapshot[] = [
      snapshot(4, { avgSatisfaction: 55, gdp: 1000, government: { ...snapshot(0).government, treasury: 100 } }),
      snapshot(5, { avgSatisfaction: 58, gdp: 1070, government: { ...snapshot(0).government, treasury: 106 } }),
      snapshot(6, { avgSatisfaction: 59, gdp: 1100, government: { ...snapshot(0).government, treasury: 110 } }),
    ];
    const cards = buildPolicyExperimentCards([timelineEntry()], history, { observationTurns: 3 });

    expect(cards[0].status).toBe('collecting');
    expect(cards[0].observedTurn).toBe(6);
    expect(cards[0].metrics).not.toBeNull();
  });
});
