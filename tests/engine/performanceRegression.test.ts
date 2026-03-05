import { describe, it, expect } from 'vitest';

import { GameEngine } from '../../src/engine/GameEngine';
import { CONFIG } from '../../src/config';

function nowMs(): number {
  return Number(process.hrtime.bigint()) / 1_000_000;
}

describe('performanceRegression', () => {
  it('fast-forward 300 turns under budget', () => {
    const mutableConfig = CONFIG as unknown as {
      VICTORY_GDP_THRESHOLD: number;
      VICTORY_TREASURY_THRESHOLD: number;
    };
    const backup = {
      gdp: mutableConfig.VICTORY_GDP_THRESHOLD,
      treasury: mutableConfig.VICTORY_TREASURY_THRESHOLD,
    };

    try {
      mutableConfig.VICTORY_GDP_THRESHOLD = Number.MAX_SAFE_INTEGER;
      mutableConfig.VICTORY_TREASURY_THRESHOLD = Number.MAX_SAFE_INTEGER;

      const engine = new GameEngine(20260322, 'baseline');
      const start = nowMs();

      let steps = 0;
      while (steps < 300) {
        if (engine.gameOver) {
          engine.reset(20260322 + steps, 'baseline');
        }
        if (engine.pendingDecision) {
          const firstChoice = engine.pendingDecision.choices[0];
          engine.resolveDecision(firstChoice.id);
        }
        engine.advanceTurn();
        steps++;
      }

      const elapsed = nowMs() - start;
      const maxMs = Number(process.env.ECON_PERF_MAX_MS ?? 2500);

      expect(steps).toBe(300);
      expect(engine.statistics.history.length).toBeGreaterThan(0);
      expect(elapsed).toBeLessThanOrEqual(maxMs);
    } finally {
      mutableConfig.VICTORY_GDP_THRESHOLD = backup.gdp;
      mutableConfig.VICTORY_TREASURY_THRESHOLD = backup.treasury;
    }
  });
});
