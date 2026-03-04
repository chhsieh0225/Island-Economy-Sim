import assert from 'node:assert/strict';
import test from 'node:test';

import { GameEngine } from '../../src/engine/GameEngine';
import { computeScore } from '../../src/engine/Scoring';
import { DECISION_EVENTS, RANDOM_EVENTS } from '../../src/data/events';
import { CONFIG } from '../../src/config';
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
    workingAgePopulation: 78,
    laborForce: 70,
    employed: 66,
    unemployed: 4,
    employmentRate: 94.3,
    unemploymentRate: 5.7,
    laborParticipationRate: 89.7,
    crudeBirthRate: 12.0,
    fertilityRate: 1.45,
    laborProductivity: 75.76,
    dependencyRatio: 0.38,
    causalReplay: {
      satisfaction: {
        net: 0,
        unit: 'point',
        drivers: [{ id: 'flat', label: '本回合無顯著變化', value: 0 }],
      },
      health: {
        net: 0,
        unit: 'point',
        drivers: [{ id: 'flat', label: '本回合無顯著變化', value: 0 }],
      },
      departures: {
        net: 0,
        unit: 'count',
        drivers: [{ id: 'flat', label: '本回合無人口流出', value: 0 }],
      },
      policy: {
        taxCollected: 0,
        welfarePaid: 0,
        welfareRecipients: 0,
        publicWorksCost: 0,
        perCapitaCashDelta: 0,
        treasuryDelta: 0,
      },
    },
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

test('mass emigration is capped per turn to avoid instant collapse', () => {
  const engine = new GameEngine(20260305, 'baseline');
  const alive = engine.agents.filter(agent => agent.alive);
  for (const agent of alive) {
    agent.age = Math.max(agent.age, CONFIG.WORKING_AGE + 12);
    agent.health = 100;
    agent.satisfaction = 0;
    agent.turnsInSector = 12;
    agent.lowIncomeTurns = 12;
    agent.inventory.food = 10;
    agent.inventory.goods = 10;
    agent.inventory.services = 10;
  }

  engine.advanceTurn();

  const leftThisTurn = engine.events.filter(
    event => event.turn === engine.turn && event.message.includes('因不滿離開了小島'),
  ).length;
  const cap = Math.ceil(alive.length * CONFIG.LEAVE_MAX_SHARE_PER_TURN);

  assert.equal(leftThisTurn <= cap, true);
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

test('turn snapshot includes causal replay breakdown', () => {
  const engine = new GameEngine(20260306, 'baseline');
  const snapshot = engine.advanceTurn();

  assert.equal(typeof snapshot.causalReplay.satisfaction.net, 'number');
  assert.equal(typeof snapshot.causalReplay.health.net, 'number');
  assert.equal(typeof snapshot.causalReplay.departures.net, 'number');
  assert.equal(typeof snapshot.causalReplay.policy.taxCollected, 'number');
  assert.equal(typeof snapshot.causalReplay.policy.welfarePaid, 'number');
  assert.equal(typeof snapshot.causalReplay.policy.treasuryDelta, 'number');
  assert.equal(snapshot.causalReplay.satisfaction.drivers.length > 0, true);
  assert.equal(snapshot.causalReplay.health.drivers.length > 0, true);
  assert.equal(snapshot.causalReplay.departures.drivers.length > 0, true);
});
