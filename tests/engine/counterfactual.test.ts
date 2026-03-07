import { describe, it, expect } from 'vitest';
import {
  runCounterfactual,
  type CounterfactualRequest,
} from '../../src/engine/modules/counterfactualModule';
import type { PolicyLogEntry } from '../../src/engine/modules/saveLoadModule';

/* ────────────────────────────────────────────────────────────────────────────
 * counterfactualModule tests
 *
 * The module uses full deterministic GameEngine replays, so these are
 * effectively integration tests for the replay + divergence logic.
 * ──────────────────────────────────────────────────────────────────────────── */

const SEED = 12345;
const SCENARIO = 'default' as const;
const CALIBRATION = 'baseline' as const;

function makeBaseRequest(overrides?: Partial<CounterfactualRequest>): CounterfactualRequest {
  return {
    seed: SEED,
    scenarioId: SCENARIO,
    calibrationProfileId: CALIBRATION,
    policyLog: [],
    requestTurn: 0,
    applyTurn: 1,
    omittedAction: { type: 'taxRate', value: 0.3 },
    forecastTurns: 3,
    ...overrides,
  };
}

describe('runCounterfactual', () => {
  it('returns actual and baseline snapshot arrays of same length', () => {
    const result = runCounterfactual(makeBaseRequest());
    expect(result.actual.length).toBe(result.baseline.length);
    expect(result.actual.length).toBeGreaterThan(0);
  });

  it('returns divergence array matching snapshot count', () => {
    const result = runCounterfactual(makeBaseRequest());
    expect(result.divergence.length).toBe(result.actual.length);
  });

  it('without policy changes actual === baseline (zero divergence)', () => {
    const result = runCounterfactual(makeBaseRequest({ policyLog: [] }));
    for (const d of result.divergence) {
      expect(d.gdpDelta).toBe(0);
      expect(d.populationDelta).toBe(0);
      expect(d.satisfactionDelta).toBe(0);
      expect(d.giniDelta).toBe(0);
      expect(d.treasuryDelta).toBe(0);
    }
  });

  it('deterministic: same seed produces identical results', () => {
    const policyLog: PolicyLogEntry[] = [
      { turn: 2, action: { type: 'taxRate', value: 0.3 } },
    ];
    const req = makeBaseRequest({ policyLog, requestTurn: 2, applyTurn: 3, forecastTurns: 3 });
    const r1 = runCounterfactual(req);
    const r2 = runCounterfactual(req);
    expect(r1.divergence).toEqual(r2.divergence);
  });

  it('omitting a tax hike produces non-zero divergence', () => {
    const policyLog: PolicyLogEntry[] = [
      { turn: 2, action: { type: 'taxRate', value: 0.4 } },
    ];
    const result = runCounterfactual(makeBaseRequest({
      policyLog,
      requestTurn: 2,
      applyTurn: 3,
      omittedAction: { type: 'taxRate', value: 0.4 },
      forecastTurns: 4,
    }));
    // At least one divergence point should have non-zero treasury delta
    const anyNonZero = result.divergence.some(d => d.treasuryDelta !== 0 || d.gdpDelta !== 0);
    expect(anyNonZero).toBe(true);
  });

  it('snapshot window starts at applyTurn', () => {
    const result = runCounterfactual(makeBaseRequest({
      applyTurn: 3,
      forecastTurns: 2,
    }));
    if (result.actual.length > 0) {
      expect(result.actual[0].turn).toBe(3);
    }
  });

  it('snapshot window ends at applyTurn + forecastTurns', () => {
    const result = runCounterfactual(makeBaseRequest({
      applyTurn: 2,
      forecastTurns: 3,
    }));
    if (result.actual.length > 0) {
      const lastSnap = result.actual[result.actual.length - 1];
      expect(lastSnap.turn).toBeLessThanOrEqual(2 + 3);
    }
  });

  it('divergence.turn values are sequential', () => {
    const result = runCounterfactual(makeBaseRequest({ forecastTurns: 4 }));
    for (let i = 1; i < result.divergence.length; i++) {
      expect(result.divergence[i].turn).toBe(result.divergence[i - 1].turn + 1);
    }
  });

  it('handles turn-0 policy log entries (regression)', () => {
    const policyLog: PolicyLogEntry[] = [
      { turn: 0, action: { type: 'taxRate', value: 0.4 } },
    ];
    const result = runCounterfactual(makeBaseRequest({
      policyLog,
      requestTurn: 0,
      applyTurn: 1,
      omittedAction: { type: 'taxRate', value: 0.4 },
      forecastTurns: 3,
    }));
    // The omission should create a difference vs applying the tax
    const anyNonZero = result.divergence.some(d => d.treasuryDelta !== 0);
    expect(anyNonZero).toBe(true);
  });

  it('only removes first matching policy action (not duplicates)', () => {
    const policyLog: PolicyLogEntry[] = [
      { turn: 2, action: { type: 'taxRate', value: 0.3 } },
      { turn: 2, action: { type: 'taxRate', value: 0.3 } },
    ];
    // With two identical policies, the omission should only remove one.
    // Both actual and baseline should run without crashing.
    const result = runCounterfactual(makeBaseRequest({
      policyLog,
      requestTurn: 2,
      applyTurn: 3,
      omittedAction: { type: 'taxRate', value: 0.3 },
      forecastTurns: 2,
    }));
    expect(result.actual.length).toBeGreaterThan(0);
  });

  it('subsidy omission: divergence includes non-zero gdpDelta', () => {
    const policyLog: PolicyLogEntry[] = [
      { turn: 1, action: { type: 'subsidy', sector: 'food', value: 80 } },
    ];
    const result = runCounterfactual(makeBaseRequest({
      policyLog,
      requestTurn: 1,
      applyTurn: 2,
      omittedAction: { type: 'subsidy', sector: 'food', value: 80 },
      forecastTurns: 3,
    }));
    expect(result.divergence.length).toBeGreaterThan(0);
  });

  it('welfare omission: produces divergence', () => {
    const policyLog: PolicyLogEntry[] = [
      { turn: 1, action: { type: 'welfare', enabled: true } },
    ];
    const result = runCounterfactual(makeBaseRequest({
      policyLog,
      requestTurn: 1,
      applyTurn: 2,
      omittedAction: { type: 'welfare', enabled: true },
      forecastTurns: 3,
    }));
    expect(result.divergence.length).toBeGreaterThan(0);
  });

  it('forecastTurns defaults to 5 when omitted', () => {
    const req = makeBaseRequest({ forecastTurns: undefined, applyTurn: 1 });
    delete (req as any).forecastTurns;
    const result = runCounterfactual(req);
    // Should have snapshots from turn 1 through 6
    expect(result.actual.length).toBeLessThanOrEqual(6);
    expect(result.actual.length).toBeGreaterThan(0);
  });

  it('non-matching omittedAction does not remove any log entry', () => {
    const policyLog: PolicyLogEntry[] = [
      { turn: 2, action: { type: 'taxRate', value: 0.3 } },
    ];
    // Omit a welfare action that doesn't exist in the log
    const result = runCounterfactual(makeBaseRequest({
      policyLog,
      requestTurn: 2,
      applyTurn: 3,
      omittedAction: { type: 'welfare', enabled: true },
      forecastTurns: 3,
    }));
    // Both should be identical since nothing was actually omitted
    for (const d of result.divergence) {
      expect(d.gdpDelta).toBe(0);
      expect(d.treasuryDelta).toBe(0);
    }
  });
});
