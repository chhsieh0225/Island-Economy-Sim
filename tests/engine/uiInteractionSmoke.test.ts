import assert from 'node:assert/strict';
import test from 'node:test';

import { GameEngine } from '../../src/engine/GameEngine';
import { DECISION_EVENTS, RANDOM_EVENTS } from '../../src/data/events';

test('ui smoke: policy controls queue/apply and preserve unchanged state slices', () => {
  const engine = new GameEngine(20260320, 'baseline');
  const initial = engine.getState();

  engine.setTaxRate(0.22);
  engine.setSubsidy('food', 18);
  engine.setWelfare(true);
  engine.setPublicWorks(true);

  const queued = engine.getState(initial);
  assert.equal(queued.pendingPolicies.length, 4);
  assert.equal(queued.policyTimeline.length >= 4, true);
  assert.equal(queued.agents === initial.agents, true);
  assert.equal(queued.statistics === initial.statistics, true);
  assert.equal(queued.terrain === initial.terrain, true);

  engine.advanceTurn();
  const applied = engine.getState(queued);

  assert.equal(applied.pendingPolicies.length, 0);
  assert.equal(Math.abs(applied.government.taxRate - 0.22) < 1e-9, true);
  assert.equal(applied.government.subsidies.food, 18);
  assert.equal(typeof applied.government.welfareEnabled, 'boolean');
  assert.equal(typeof applied.government.publicWorksActive, 'boolean');

  engine.advanceTurn();
  const next = engine.getState(applied);
  assert.equal(next.statistics.length, applied.statistics.length + 1);
  assert.equal(next.statistics[0] === applied.statistics[0], true);
});

test('ui smoke: decision can be chosen and cleared', () => {
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

    assert.notEqual(engine.pendingDecision, null);
    if (!engine.pendingDecision) return;

    const choiceId = engine.pendingDecision.choices[0].id;
    const resolved = engine.resolveDecision(choiceId);
    assert.equal(resolved, true);

    const state = engine.getState();
    assert.equal(state.pendingDecision, null);
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
