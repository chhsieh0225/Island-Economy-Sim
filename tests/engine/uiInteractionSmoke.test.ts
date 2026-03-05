import { describe, it, expect } from 'vitest';

import { GameEngine } from '../../src/engine/GameEngine';
import { DECISION_EVENTS, RANDOM_EVENTS } from '../../src/data/events';

describe('uiInteractionSmoke', () => {
  it('policy controls queue/apply and preserve unchanged state slices', () => {
    const engine = new GameEngine(20260320, 'baseline');
    const initial = engine.getState();

    engine.setTaxRate(0.22);
    engine.setSubsidy('food', 18);
    engine.setWelfare(true);
    engine.setPublicWorks(true);

    const queued = engine.getState(initial);
    expect(queued.pendingPolicies.length).toBe(4);
    expect(queued.policyTimeline.length >= 4).toBe(true);
    expect(queued.agents === initial.agents).toBe(true);
    expect(queued.statistics === initial.statistics).toBe(true);
    expect(queued.terrain === initial.terrain).toBe(true);

    engine.advanceTurn();
    const applied = engine.getState(queued);

    expect(applied.pendingPolicies.length).toBe(0);
    expect(Math.abs(applied.government.taxRate - 0.22) < 1e-9).toBe(true);
    expect(applied.government.subsidies.food).toBe(18);
    expect(typeof applied.government.welfareEnabled).toBe('boolean');
    expect(typeof applied.government.publicWorksActive).toBe('boolean');

    if (engine.pendingDecision) {
      engine.resolveDecision(engine.pendingDecision.choices[0].id);
    }
    engine.advanceTurn();
    const next = engine.getState(applied);
    expect(next.statistics.length).toBe(applied.statistics.length + 1);
    expect(next.statistics[0] === applied.statistics[0]).toBe(true);
  });

  it('decision can be chosen and cleared', () => {
    const randomBackup = RANDOM_EVENTS.map(event => ({ id: event.id, probability: event.probability }));
    const decisionBackup = DECISION_EVENTS.map(event => ({ id: event.id, probability: event.probability }));

    try {
      for (const event of RANDOM_EVENTS) {
        event.probability = 0;
      }
      for (const event of DECISION_EVENTS) {
        event.probability = event.id === 'cost_of_living' ? 2 : 0;
      }

      const engine = new GameEngine(20260321, 'baseline');

      let guard = 0;
      while (!engine.pendingDecision && guard < 5) {
        engine.advanceTurn();
        guard++;
      }

      expect(engine.pendingDecision).not.toBeNull();
      if (!engine.pendingDecision) return;

      const choiceId = engine.pendingDecision.choices[0].id;
      const resolved = engine.resolveDecision(choiceId);
      expect(resolved).toBe(true);

      const state = engine.getState();
      expect(state.pendingDecision).toBeNull();
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
});
