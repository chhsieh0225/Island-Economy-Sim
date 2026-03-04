import assert from 'node:assert/strict';
import test from 'node:test';

import { GameEngine } from '../../src/engine/GameEngine';

function advanceToTurn(engine: GameEngine, targetTurn: number): void {
  let guard = 0;
  while (engine.turn < targetTurn && guard < targetTurn * 8) {
    if (engine.pendingDecision) {
      const firstChoice = engine.pendingDecision.choices[0];
      engine.resolveDecision(firstChoice.id);
    }
    engine.advanceTurn();
    guard++;
  }
}

function totalBirthsAndDeaths(engine: GameEngine): { births: number; deaths: number } {
  return engine.statistics.history.reduce(
    (acc, snap) => {
      acc.births += snap.births;
      acc.deaths += snap.deaths;
      return acc;
    },
    { births: 0, deaths: 0 },
  );
}

test('baseline seed regression snapshot remains deterministic at turn 18', () => {
  const engine = new GameEngine(20260311, 'baseline');
  advanceToTurn(engine, 18);

  const state = engine.getState();
  const latest = state.statistics[state.statistics.length - 1];
  const totals = totalBirthsAndDeaths(engine);

  const signature = [
    state.turn,
    state.economyStage,
    latest.population,
    latest.avgSatisfaction.toFixed(1),
    latest.avgHealth.toFixed(1),
    latest.giniCoefficient.toFixed(3),
    latest.government.treasury.toFixed(2),
    totals.births,
    totals.deaths,
  ].join('|');

  assert.equal(signature, '18|industrial|101|45.6|67.5|0.179|179.63|1|0');
});

test('progressive economy unlocks industrial stage under baseline seed', () => {
  const engine = new GameEngine(20260311, 'baseline');
  advanceToTurn(engine, 20);
  assert.equal(engine.economyStage === 'industrial' || engine.economyStage === 'service', true);
});

test('policy replay cashflow is internally consistent', () => {
  const engine = new GameEngine(20260311, 'baseline');
  advanceToTurn(engine, 24);

  const history = engine.statistics.history;
  assert.equal(history.length >= 24, true);

  for (const snap of history) {
    const replay = snap.causalReplay.policy;
    const expectedTreasuryDelta = replay.taxCollected - replay.welfarePaid - replay.publicWorksCost;
    assert.equal(Math.abs(replay.treasuryDelta - expectedTreasuryDelta) < 0.02, true);
  }
});

