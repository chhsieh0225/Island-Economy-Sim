import { GameEngine } from '../GameEngine';
import type { TurnSnapshot, ScenarioId, SectorType } from '../../types';
import type { EconomicCalibrationProfileId } from '../economicCalibration';
import type { PolicyLogEntry, PolicyAction } from './saveLoadModule';

/* ────────────────────────────────────────────────────────────────────────────
 * Counterfactual Module
 *
 * Runs two deterministic simulations — one "actual" (all policies) and one
 * "baseline" (all policies minus a specific action) — then computes the
 * divergence between them.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface CounterfactualRequest {
  seed: number;
  scenarioId: ScenarioId;
  calibrationProfileId: EconomicCalibrationProfileId;
  policyLog: PolicyLogEntry[];
  /** The turn when the policy under test was applied */
  policyTurn: number;
  /** The action to omit in the baseline simulation */
  omittedAction: PolicyAction;
  /** How many turns after policyTurn to simulate (default 5) */
  forecastTurns?: number;
}

export interface DivergencePoint {
  turn: number;
  gdpDelta: number;
  populationDelta: number;
  satisfactionDelta: number;
  giniDelta: number;
  treasuryDelta: number;
}

export interface CounterfactualResult {
  /** Snapshots from policyTurn to policyTurn + forecastTurns (actual) */
  actual: TurnSnapshot[];
  /** Snapshots from policyTurn to policyTurn + forecastTurns (baseline without policy) */
  baseline: TurnSnapshot[];
  /** Per-turn divergence between actual and baseline */
  divergence: DivergencePoint[];
}

function applyPolicyAction(eng: GameEngine, action: PolicyAction): void {
  switch (action.type) {
    case 'taxRate': eng.setTaxRate(action.value); break;
    case 'subsidy': eng.setSubsidy(action.sector as SectorType, action.value); break;
    case 'welfare': eng.setWelfare(action.enabled); break;
    case 'publicWorks': eng.setPublicWorks(action.active); break;
    case 'policyRate': eng.setPolicyRate(action.value); break;
    case 'liquiditySupport': eng.setLiquiditySupport(action.active); break;
    case 'decision': eng.resolveDecision(action.choiceId); break;
  }
}

function actionsMatch(a: PolicyAction, b: PolicyAction): boolean {
  if (a.type !== b.type) return false;
  switch (a.type) {
    case 'taxRate': return a.value === (b as typeof a).value;
    case 'subsidy': return a.sector === (b as typeof a).sector && a.value === (b as typeof a).value;
    case 'welfare': return a.enabled === (b as typeof a).enabled;
    case 'publicWorks': return a.active === (b as typeof a).active;
    case 'policyRate': return a.value === (b as typeof a).value;
    case 'liquiditySupport': return a.active === (b as typeof a).active;
    case 'decision': return a.choiceId === (b as typeof a).choiceId;
    default: return false;
  }
}

function replayEngine(
  seed: number,
  scenarioId: ScenarioId,
  calibrationProfileId: EconomicCalibrationProfileId,
  policyLog: PolicyLogEntry[],
  targetTurn: number,
): GameEngine {
  const eng = new GameEngine(seed, scenarioId, calibrationProfileId);
  for (let t = 1; t <= targetTurn; t++) {
    // Apply policies for this turn before advancing
    const turnPolicies = policyLog.filter(e => e.turn === t);
    for (const entry of turnPolicies) {
      applyPolicyAction(eng, entry.action);
    }
    eng.advanceTurn();
  }
  return eng;
}

export function runCounterfactual(request: CounterfactualRequest): CounterfactualResult {
  const {
    seed,
    scenarioId,
    calibrationProfileId,
    policyLog,
    policyTurn,
    omittedAction,
    forecastTurns = 5,
  } = request;

  const endTurn = policyTurn + forecastTurns;

  // Build baseline policy log (without the omitted action at policyTurn)
  let omitted = false;
  const baselinePolicyLog = policyLog.filter(entry => {
    if (!omitted && entry.turn === policyTurn && actionsMatch(entry.action, omittedAction)) {
      omitted = true;
      return false;
    }
    return true;
  });

  // Run both simulations
  const actualEngine = replayEngine(seed, scenarioId, calibrationProfileId, policyLog, endTurn);
  const baselineEngine = replayEngine(seed, scenarioId, calibrationProfileId, baselinePolicyLog, endTurn);

  // Extract snapshots from policyTurn to endTurn
  const actualSnaps = actualEngine.statistics.history.filter(s => s.turn >= policyTurn && s.turn <= endTurn);
  const baselineSnaps = baselineEngine.statistics.history.filter(s => s.turn >= policyTurn && s.turn <= endTurn);

  // Compute divergence
  const divergence: DivergencePoint[] = [];
  for (let i = 0; i < actualSnaps.length; i++) {
    const a = actualSnaps[i];
    const b = baselineSnaps[i];
    if (!a || !b) continue;
    divergence.push({
      turn: a.turn,
      gdpDelta: a.gdp - b.gdp,
      populationDelta: a.population - b.population,
      satisfactionDelta: a.avgSatisfaction - b.avgSatisfaction,
      giniDelta: a.giniCoefficient - b.giniCoefficient,
      treasuryDelta: a.government.treasury - b.government.treasury,
    });
  }

  return { actual: actualSnaps, baseline: baselineSnaps, divergence };
}
