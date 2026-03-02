import assert from 'node:assert/strict';
import test from 'node:test';

import { GameEngine } from '../../src/engine/GameEngine';
import { computeScore } from '../../src/engine/Scoring';
import { DECISION_EVENTS, RANDOM_EVENTS } from '../../src/data/events';
import type { TurnSnapshot } from '../../src/types';

function makeSnapshot(overrides: Partial<TurnSnapshot>): TurnSnapshot {
  const base: TurnSnapshot = {
    turn: 1,
    population: 100,
    gdp: 5000,
    giniCoefficient: 0.3,
    avgSatisfaction: 70,
    avgHealth: 80,
    jobDistribution: { food: 34, goods: 33, services: 33 },
    market: {
      prices: { food: 10, goods: 15, services: 12 },
      priceHistory: { food: [10], goods: [15], services: [12] },
      supply: { food: 100, goods: 80, services: 70 },
      demand: { food: 95, goods: 78, services: 68 },
      volume: { food: 80, goods: 60, services: 55 },
    },
    government: {
      treasury: 1000,
      taxRate: 0.1,
      subsidies: { food: 0, goods: 0, services: 0 },
      welfareEnabled: false,
      publicWorksActive: false,
    },
    births: 0,
    deaths: 0,
    avgAge: 33,
  };
  return { ...base, ...overrides };
}

test('policy delay applies on next turn and writes timeline', () => {
  const engine = new GameEngine(20260302, 'baseline');
  const originalTax = engine.government.taxRate;
  const nextTax = 0.2;

  engine.setTaxRate(nextTax);
  assert.equal(engine.pendingPolicies.length, 1);
  assert.equal(engine.government.taxRate, originalTax);
  assert.equal(engine.policyTimeline.length > 0, true);
  assert.equal(engine.policyTimeline[0].status, 'pending');

  engine.advanceTurn();

  assert.equal(engine.pendingPolicies.length, 0);
  assert.equal(Math.abs(engine.government.taxRate - nextTax) < 1e-9, true);
  const taxTimeline = engine.policyTimeline.find(entry => entry.type === 'tax');
  assert.equal(Boolean(taxTimeline), true);
  assert.equal(taxTimeline?.status, 'applied');
  assert.equal(taxTimeline?.resolvedTurn, 1);
});

test('demography phase marks old-age death deterministically', () => {
  const engine = new GameEngine(20260303, 'baseline');
  const target = engine.agents.find(agent => agent.alive);
  assert.notEqual(target, undefined);
  if (!target) return;

  target.age = target.maxAge - 1;
  target.health = 100;
  target.satisfaction = 100;
  target.turnsInSector = 20;

  engine.advanceTurn();

  assert.equal(target.alive, false);
  assert.equal(target.causeOfDeath, 'age');
});

test('random event trigger is deterministic when probabilities are controlled', () => {
  const randomBackup = RANDOM_EVENTS.map(event => ({ id: event.id, probability: event.probability }));
  const decisionBackup = DECISION_EVENTS.map(event => ({ id: event.id, probability: event.probability }));

  try {
    for (const event of RANDOM_EVENTS) {
      event.probability = event.id === 'drought' ? 2 : 0;
    }
    for (const event of DECISION_EVENTS) {
      event.probability = 0;
    }

    const engine = new GameEngine(20260304, 'baseline');
    engine.advanceTurn();

    const activeIds = engine.activeRandomEvents.map(event => event.def.id);
    assert.equal(activeIds.includes('drought'), true);
  } finally {
    for (const event of RANDOM_EVENTS) {
      const original = randomBackup.find(item => item.id === event.id);
      if (original) event.probability = original.probability;
    }
    for (const event of DECISION_EVENTS) {
      const original = decisionBackup.find(item => item.id === event.id);
      if (original) event.probability = original.probability;
    }
  }
});

test('scoring favors stronger economic and social outcomes', () => {
  const weakHistory: TurnSnapshot[] = [
    makeSnapshot({
      turn: 1,
      population: 45,
      gdp: 650,
      giniCoefficient: 0.68,
      avgSatisfaction: 38,
      avgHealth: 45,
    }),
    makeSnapshot({
      turn: 2,
      population: 42,
      gdp: 500,
      giniCoefficient: 0.7,
      avgSatisfaction: 35,
      avgHealth: 43,
    }),
  ];
  const strongHistory: TurnSnapshot[] = [
    makeSnapshot({
      turn: 1,
      population: 110,
      gdp: 7200,
      giniCoefficient: 0.24,
      avgSatisfaction: 82,
      avgHealth: 90,
    }),
    makeSnapshot({
      turn: 2,
      population: 112,
      gdp: 7350,
      giniCoefficient: 0.22,
      avgSatisfaction: 84,
      avgHealth: 91,
    }),
  ];

  const weak = computeScore(weakHistory);
  const strong = computeScore(strongHistory);

  assert.equal(strong.totalScore > weak.totalScore, true);
  assert.equal(strong.wellbeingScore > weak.wellbeingScore, true);
  assert.equal(strong.equalityScore > weak.equalityScore, true);
});
