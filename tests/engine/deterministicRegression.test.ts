import { describe, it, expect } from 'vitest';

import { CONFIG } from '../../src/config';
import { GameEngine } from '../../src/engine/GameEngine';
import type { EconomyStage, SectorType } from '../../src/types';

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

describe('deterministicRegression', () => {
  it('baseline seed regression snapshot remains deterministic at turn 18', () => {
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

    expect(signature).toBe('18|industrial|101|91.4|96.8|0.037|2.47|1|0');
  });

  it('progressive economy unlocks industrial stage under baseline seed', () => {
    const engine = new GameEngine(20260311, 'baseline');
    advanceToTurn(engine, 20);
    expect(engine.economyStage === 'industrial' || engine.economyStage === 'service').toBe(true);
  });

  it('policy replay cashflow is internally consistent', () => {
    const engine = new GameEngine(20260311, 'baseline');
    advanceToTurn(engine, 24);

    const history = engine.statistics.history;
    expect(history.length >= 24).toBe(true);

    for (const snap of history) {
      const replay = snap.causalReplay.policy;
      const expectedTreasuryDelta = replay.taxCollected
        - replay.welfarePaid
        - replay.publicWorksCost
        - replay.liquidityInjected;
      expect(Math.abs(replay.treasuryDelta - expectedTreasuryDelta) < 0.02).toBe(true);
    }
  });

  it('stage need multipliers ramp gradually after unlock', () => {
    const engine = new GameEngine(20260311, 'baseline');
    const internals = engine as unknown as {
      turn: number;
      economyStage: EconomyStage;
      stageTransitionFrom: EconomyStage | null;
      stageTransitionStartTurn: number | null;
      getCurrentNeedMultipliers: () => Record<SectorType, number>;
    };

    internals.turn = 30;
    internals.economyStage = 'industrial';
    internals.stageTransitionFrom = 'agriculture';
    internals.stageTransitionStartTurn = 31;

    const start = internals.getCurrentNeedMultipliers();
    expect(Math.abs(start.goods - CONFIG.STAGE_NEED_MULTIPLIERS.agriculture.goods) < 1e-9).toBe(true);
    expect(Math.abs(start.services - CONFIG.STAGE_NEED_MULTIPLIERS.agriculture.services) < 1e-9).toBe(true);

    internals.turn = 31 + Math.floor(CONFIG.STAGE_TRANSITION_RAMP_TURNS.industrial / 2);
    const mid = internals.getCurrentNeedMultipliers();
    expect(mid.goods > start.goods && mid.goods < CONFIG.STAGE_NEED_MULTIPLIERS.industrial.goods).toBe(true);
    expect(mid.services > start.services && mid.services < CONFIG.STAGE_NEED_MULTIPLIERS.industrial.services).toBe(true);

    internals.turn = 31 + CONFIG.STAGE_TRANSITION_RAMP_TURNS.industrial;
    const end = internals.getCurrentNeedMultipliers();
    expect(Math.abs(end.goods - CONFIG.STAGE_NEED_MULTIPLIERS.industrial.goods) < 1e-9).toBe(true);
    expect(Math.abs(end.services - CONFIG.STAGE_NEED_MULTIPLIERS.industrial.services) < 1e-9).toBe(true);
  });
});
