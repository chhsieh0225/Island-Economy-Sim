import assert from 'node:assert/strict';
import test from 'node:test';

import { RANDOM_EVENTS, DECISION_EVENTS } from '../../src/data/events';
import { Market } from '../../src/engine/Market';
import { runRandomEventsPhase } from '../../src/engine/phases/eventsPhase';
import type { RNG } from '../../src/engine/RNG';

interface MockRng {
  next: () => number;
  nextInt: (min: number, max: number) => number;
}

function makeFixedRng(nextValue: number, nextIntValue: number = 0): MockRng {
  return {
    next: () => nextValue,
    nextInt: () => nextIntValue,
  };
}

function backupRandomProbabilities(): Array<{ id: string; probability: number }> {
  return RANDOM_EVENTS.map(event => ({ id: event.id, probability: event.probability }));
}

function backupDecisionProbabilities(): Array<{ id: string; probability: number }> {
  return DECISION_EVENTS.map(event => ({ id: event.id, probability: event.probability }));
}

function restoreRandomProbabilities(backup: Array<{ id: string; probability: number }>): void {
  for (const event of RANDOM_EVENTS) {
    const original = backup.find(item => item.id === event.id);
    if (original) event.probability = original.probability;
  }
}

function restoreDecisionProbabilities(backup: Array<{ id: string; probability: number }>): void {
  for (const event of DECISION_EVENTS) {
    const original = backup.find(item => item.id === event.id);
    if (original) event.probability = original.probability;
  }
}

test('growth chain signal boosts trade ship trigger probability', () => {
  const randomBackup = backupRandomProbabilities();
  const decisionBackup = backupDecisionProbabilities();

  try {
    for (const event of RANDOM_EVENTS) {
      event.probability = event.id === 'trade_ship' ? 0.08 : 0;
    }
    for (const event of DECISION_EVENTS) {
      event.probability = 0;
    }

    const market = new Market();
    const rng = makeFixedRng(0.05, 0);
    const noSignal = runRandomEventsPhase({
      turn: 1,
      rng: rng as unknown as RNG,
      market,
      activeRandomEvents: [],
      pendingDecision: null,
      lastRandomEventTurn: -999,
      lastDecisionTurn: -999,
      eventChainSignals: {},
      addEvent: () => {},
    });

    const withGrowthSignal = runRandomEventsPhase({
      turn: 1,
      rng: rng as unknown as RNG,
      market,
      activeRandomEvents: [],
      pendingDecision: null,
      lastRandomEventTurn: -999,
      lastDecisionTurn: -999,
      eventChainSignals: { chain_growth_s1: 4 },
      addEvent: () => {},
    });

    assert.equal(noSignal.activeRandomEvents.some(event => event.def.id === 'trade_ship'), false);
    assert.equal(withGrowthSignal.activeRandomEvents.some(event => event.def.id === 'trade_ship'), true);
  } finally {
    restoreRandomProbabilities(randomBackup);
    restoreDecisionProbabilities(decisionBackup);
  }
});

test('supply chain stage 2 boosts cost-of-living decision probability', () => {
  const randomBackup = backupRandomProbabilities();
  const decisionBackup = backupDecisionProbabilities();

  try {
    for (const event of RANDOM_EVENTS) {
      event.probability = 0;
    }
    for (const event of DECISION_EVENTS) {
      event.probability = event.id === 'cost_of_living' ? 0.035 : 0;
    }

    const market = new Market();
    const rng = makeFixedRng(0.06, 0);

    const noSignal = runRandomEventsPhase({
      turn: 1,
      rng: rng as unknown as RNG,
      market,
      activeRandomEvents: [],
      pendingDecision: null,
      lastRandomEventTurn: -999,
      lastDecisionTurn: -999,
      eventChainSignals: {},
      addEvent: () => {},
    });

    const withSupplySignal = runRandomEventsPhase({
      turn: 1,
      rng: rng as unknown as RNG,
      market,
      activeRandomEvents: [],
      pendingDecision: null,
      lastRandomEventTurn: -999,
      lastDecisionTurn: -999,
      eventChainSignals: { chain_supply_s2: 4 },
      addEvent: () => {},
    });

    assert.equal(noSignal.pendingDecision?.id ?? null, null);
    assert.equal(withSupplySignal.pendingDecision?.id, 'cost_of_living');
  } finally {
    restoreRandomProbabilities(randomBackup);
    restoreDecisionProbabilities(decisionBackup);
  }
});
