import { describe, it, expect } from 'vitest';

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

describe('eventChains', () => {
  it('growth chain signal boosts trade ship trigger probability', () => {
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

      expect(noSignal.activeRandomEvents.some(event => event.def.id === 'trade_ship')).toBe(false);
      expect(withGrowthSignal.activeRandomEvents.some(event => event.def.id === 'trade_ship')).toBe(true);
    } finally {
      restoreRandomProbabilities(randomBackup);
      restoreDecisionProbabilities(decisionBackup);
    }
  });

  it('supply chain stage 2 boosts cost-of-living decision probability', () => {
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

      expect(noSignal.pendingDecision?.id ?? null).toBeNull();
      expect(withSupplySignal.pendingDecision?.id).toBe('cost_of_living');
    } finally {
      restoreRandomProbabilities(randomBackup);
      restoreDecisionProbabilities(decisionBackup);
    }
  });
});
