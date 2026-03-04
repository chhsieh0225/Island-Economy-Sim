import assert from 'node:assert/strict';
import test from 'node:test';

import { GameEngine } from '../../src/engine/GameEngine';
import { computeScore } from '../../src/engine/Scoring';
import { DECISION_EVENTS, RANDOM_EVENTS } from '../../src/data/events';
import { CONFIG } from '../../src/config';
import type { IslandTerrainState, SectorType, TurnSnapshot } from '../../src/types';
import { Agent } from '../../src/engine/Agent';
import { Government } from '../../src/engine/Government';
import { Market } from '../../src/engine/Market';
import { RNG } from '../../src/engine/RNG';
import { runProductionPhase } from '../../src/engine/phases/productionPhase';
import {
  getActiveEconomicCalibrationProfileId,
  setEconomicCalibrationProfile,
} from '../../src/engine/economicCalibration';

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

test('LES demand allocation lowers quantity demanded when relative price rises', () => {
  const rng = new RNG(20260307);
  const buyer = new Agent(1, 'Demand Tester', 'food', rng, {
    age: 300,
    maxAge: 900,
    intelligence: 100,
    baseLuck: 0,
    gender: 'F',
    familyId: 1,
    goalType: 'balanced',
  });
  buyer.money = 130;
  buyer.inventory.food = 0;
  buyer.inventory.goods = 0;
  buyer.inventory.services = 0;

  const getFoodDemand = (foodPrice: number): number => {
    const market = new Market();
    market.setAgents([buyer]);
    market.prices.food = foodPrice;
    market.prices.goods = 20;
    market.prices.services = 20;
    market.clearOrders();
    buyer.postBuyOrders(market, { food: 1, goods: 1, services: 1 });

    const internal = market as unknown as {
      buyOrders: Map<SectorType, Array<{ quantity: number }>>;
    };
    const orders = internal.buyOrders.get('food') ?? [];
    return orders.reduce((sum, order) => sum + order.quantity, 0);
  };

  const lowPriceDemand = getFoodDemand(10);
  const highPriceDemand = getFoodDemand(20);
  assert.equal(lowPriceDemand > highPriceDemand, true);
});

test('sector output follows diminishing labor returns under Cobb-Douglas scaling', () => {
  const terrain: IslandTerrainState = {
    seed: 1,
    coastlineOffsets: [],
    islandScaleX: 1,
    islandScaleY: 1,
    islandRotation: 0,
    zoneOffsets: {
      food: { x: 0, y: 0 },
      goods: { x: 0, y: 0 },
      services: { x: 0, y: 0 },
    },
    sectorSuitability: { food: 1, goods: 1, services: 1 },
    sectorFeatures: { food: 'plain', goods: 'plain', services: 'plain' },
  };
  const government = new Government();
  const rng = new RNG(20260308);

  const makeWorkers = (count: number, idOffset: number): Agent[] => {
    const workers: Agent[] = [];
    for (let i = 0; i < count; i++) {
      const worker = new Agent(idOffset + i, `Worker-${idOffset + i}`, 'food', rng, {
        age: 300,
        maxAge: 900,
        intelligence: 100,
        baseLuck: 0,
        gender: 'M',
        familyId: idOffset + i,
        goalType: 'balanced',
      });
      worker.productivity = 1;
      worker.turnsInSector = 8;
      worker.inventory.food = 0;
      workers.push(worker);
    }
    return workers;
  };

  const workers10 = makeWorkers(10, 1000);
  const workers20 = makeWorkers(20, 2000);

  runProductionPhase({
    agents: workers10,
    activeRandomEvents: [],
    terrain,
    government,
    workingAge: CONFIG.WORKING_AGE,
    allowedSectors: ['food', 'goods', 'services'],
    caregiverPenaltyPerChild: CONFIG.CAREGIVER_PRODUCTIVITY_PENALTY_PER_CHILD,
    caregiverPenaltyMax: CONFIG.CAREGIVER_PRODUCTIVITY_PENALTY_MAX,
  });
  runProductionPhase({
    agents: workers20,
    activeRandomEvents: [],
    terrain,
    government,
    workingAge: CONFIG.WORKING_AGE,
    allowedSectors: ['food', 'goods', 'services'],
    caregiverPenaltyPerChild: CONFIG.CAREGIVER_PRODUCTIVITY_PENALTY_PER_CHILD,
    caregiverPenaltyMax: CONFIG.CAREGIVER_PRODUCTIVITY_PENALTY_MAX,
  });

  const output10 = workers10.reduce((sum, worker) => sum + worker.outputThisTurn, 0);
  const output20 = workers20.reduce((sum, worker) => sum + worker.outputThisTurn, 0);

  assert.equal(output20 > output10, true);
  assert.equal(output20 < output10 * 2, true);
});

test('academic calibration mode uses gentler price adjustment than baseline mode', () => {
  const previousMode = getActiveEconomicCalibrationProfileId();

  const simulateOnePriceUpdate = (mode: 'baseline' | 'academic'): number => {
    setEconomicCalibrationProfile(mode);
    const market = new Market();
    const internals = market as unknown as {
      supply: Record<SectorType, number>;
      demand: Record<SectorType, number>;
      adjustPrices: () => void;
    };

    internals.supply = { food: 100, goods: 0, services: 0 };
    internals.demand = { food: 200, goods: 0, services: 0 };
    internals.adjustPrices();
    return market.prices.food;
  };

  try {
    const baselinePrice = simulateOnePriceUpdate('baseline');
    const academicPrice = simulateOnePriceUpdate('academic');
    const baselineDelta = Math.abs(baselinePrice - CONFIG.INITIAL_PRICES.food);
    const academicDelta = Math.abs(academicPrice - CONFIG.INITIAL_PRICES.food);
    assert.equal(baselineDelta > academicDelta, true);
  } finally {
    setEconomicCalibrationProfile(previousMode);
  }
});
