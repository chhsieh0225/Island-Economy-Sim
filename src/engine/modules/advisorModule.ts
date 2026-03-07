import { CONFIG } from '../../config';
import { getUnlockedSectorsForStage } from './progressionModule';
import type { GameState, SectorType } from '../../types';

/* ────────────────────────────────────────────────────────────────────────────
 * Policy Advisor — proactive suggestions surfaced on the main game screen.
 *
 * Each evaluator inspects current GameState and returns 0-1 suggestion.
 * generateAdvisorSuggestions() collects, deduplicates, and returns the top 2.
 * ──────────────────────────────────────────────────────────────────────────── */

export type AdvisorPriority = 'critical' | 'warning' | 'info';

export interface AdvisorAction {
  labelKey: string;
  labelParams?: Record<string, string | number>;
  /** Describes the mutation — resolved into a closure by the UI layer. */
  mutation:
    | { type: 'setTaxRate'; value: number }
    | { type: 'setSubsidy'; sector: SectorType; value: number }
    | { type: 'setWelfare'; value: boolean }
    | { type: 'setPublicWorks'; value: boolean }
    | { type: 'setLiquiditySupport'; value: boolean }
    | { type: 'setStockpile'; value: boolean }
    | { type: 'setTaxMode'; value: 'flat' | 'progressive' }
    | { type: 'setPolicyRate'; value: number };
}

export interface AdvisorSuggestion {
  id: string;
  category: string;
  priority: AdvisorPriority;
  messageKey: string;
  hintKey: string;
  messageParams?: Record<string, string | number>;
  actions: AdvisorAction[];
}

/* ── Helpers ─────────────────────────────────────────────────────────────── */

const PRIORITY_ORDER: Record<AdvisorPriority, number> = { critical: 0, warning: 1, info: 2 };

function clampRate(rate: number): number {
  return Math.max(0, Math.min(CONFIG.MAX_TAX_RATE, rate));
}

/* ── Evaluators ──────────────────────────────────────────────────────────── */

function checkShortages(state: GameState): AdvisorSuggestion | null {
  const sectors = getUnlockedSectorsForStage(state.economyStage);
  const shortages = sectors.filter(s => {
    const demand = state.market.demand[s];
    const supply = state.market.supply[s];
    return demand > 0.01 && supply < demand * 0.80;
  });
  if (shortages.length === 0) return null;

  const worst = shortages[0];
  const actions: AdvisorAction[] = [];

  // Suggest stockpile release if enabled
  if (state.government.stockpileEnabled && state.government.stockpile[worst] > 0) {
    // Stockpile is already active and will auto-sell — just inform
  } else if (!state.government.stockpileEnabled) {
    actions.push({
      labelKey: 'advisor.action.enableStockpile',
      mutation: { type: 'setStockpile', value: true },
    });
  }

  // Suggest raising subsidy
  const currentSub = state.government.subsidies[worst];
  if (currentSub < 95) {
    const target = Math.min(100, currentSub + 5);
    actions.push({
      labelKey: 'advisor.action.raiseSubsidy',
      labelParams: { sector: worst, amount: target.toFixed(0) },
      mutation: { type: 'setSubsidy', sector: worst, value: target },
    });
  }

  return {
    id: `shortage-${worst}`,
    category: 'shortage',
    priority: 'critical',
    messageKey: 'advisor.shortage',
    hintKey: 'advisor.shortage.hint',
    messageParams: { sector: worst },
    actions: actions.slice(0, 2),
  };
}

function checkLowSatisfaction(state: GameState): AdvisorSuggestion | null {
  const alive = state.agents.filter(a => a.alive);
  if (alive.length === 0) return null;
  const avgSat = alive.reduce((s, a) => s + a.satisfaction, 0) / alive.length;
  if (avgSat >= 40) return null;

  const actions: AdvisorAction[] = [];

  // Suggest lower tax
  const target = clampRate(state.government.taxRate - 0.02);
  if (target < state.government.taxRate - 1e-6) {
    actions.push({
      labelKey: 'advisor.action.lowerTax',
      labelParams: { rate: (target * 100).toFixed(0) },
      mutation: { type: 'setTaxRate', value: target },
    });
  }

  // Suggest enable welfare
  if (!state.government.welfareEnabled) {
    actions.push({
      labelKey: 'advisor.action.enableWelfare',
      mutation: { type: 'setWelfare', value: true },
    });
  }

  return {
    id: 'low-satisfaction',
    category: 'satisfaction',
    priority: 'critical',
    messageKey: 'advisor.lowSat',
    hintKey: 'advisor.lowSat.hint',
    messageParams: { sat: avgSat.toFixed(1) },
    actions: actions.slice(0, 2),
  };
}

function checkTreasuryDepletion(state: GameState): AdvisorSuggestion | null {
  const treasury = state.government.treasury;
  if (treasury >= 50) return null;

  // Check if declining
  const stats = state.statistics;
  if (stats.length < 2) return null;
  const prev = stats[stats.length - 2];
  if (prev.government.treasury <= treasury) return null; // not declining

  const actions: AdvisorAction[] = [];

  // Suggest raise tax
  const target = clampRate(state.government.taxRate + 0.02);
  if (target > state.government.taxRate + 1e-6) {
    actions.push({
      labelKey: 'advisor.action.raiseTax',
      labelParams: { rate: (target * 100).toFixed(0) },
      mutation: { type: 'setTaxRate', value: target },
    });
  }

  // Suggest disable public works
  if (state.government.publicWorksActive) {
    actions.push({
      labelKey: 'advisor.action.disablePublicWorks',
      mutation: { type: 'setPublicWorks', value: false },
    });
  }

  return {
    id: 'treasury-low',
    category: 'treasury',
    priority: 'critical',
    messageKey: 'advisor.treasuryLow',
    hintKey: 'advisor.treasuryLow.hint',
    messageParams: { treasury: treasury.toFixed(0) },
    actions: actions.slice(0, 2),
  };
}

function checkHighInequality(state: GameState): AdvisorSuggestion | null {
  const stats = state.statistics;
  if (stats.length === 0) return null;
  const gini = stats[stats.length - 1].giniCoefficient;
  if (gini <= 0.55) return null;

  const actions: AdvisorAction[] = [];

  if (!state.government.welfareEnabled) {
    actions.push({
      labelKey: 'advisor.action.enableWelfare',
      mutation: { type: 'setWelfare', value: true },
    });
  }

  if (state.government.taxMode !== 'progressive') {
    actions.push({
      labelKey: 'advisor.action.progressiveTax',
      mutation: { type: 'setTaxMode', value: 'progressive' },
    });
  }

  if (actions.length === 0) return null;

  return {
    id: 'high-inequality',
    category: 'inequality',
    priority: 'warning',
    messageKey: 'advisor.inequality',
    hintKey: 'advisor.inequality.hint',
    messageParams: { gini: (gini * 100).toFixed(1) },
    actions: actions.slice(0, 2),
  };
}

function checkPriceVolatility(state: GameState): AdvisorSuggestion | null {
  const stats = state.statistics;
  if (stats.length < 4) return null;

  const sectors = getUnlockedSectorsForStage(state.economyStage);
  for (const sector of sectors) {
    const recent = stats[stats.length - 1].market.prices[sector];
    const past = stats[stats.length - 3].market.prices[sector];
    if (past <= 0.01) continue;
    const changeRate = Math.abs(recent - past) / past;
    if (changeRate > 0.40) {
      const actions: AdvisorAction[] = [];

      if (!state.government.stockpileEnabled) {
        actions.push({
          labelKey: 'advisor.action.enableStockpile',
          mutation: { type: 'setStockpile', value: true },
        });
      }

      const currentSub = state.government.subsidies[sector];
      if (currentSub < 95) {
        const target = Math.min(100, currentSub + 5);
        actions.push({
          labelKey: 'advisor.action.raiseSubsidy',
          labelParams: { sector, amount: target.toFixed(0) },
          mutation: { type: 'setSubsidy', sector, value: target },
        });
      }

      if (actions.length === 0) continue;

      return {
        id: `volatile-${sector}`,
        category: 'volatility',
        priority: 'warning',
        messageKey: 'advisor.priceVolatile',
        hintKey: 'advisor.priceVolatile.hint',
        messageParams: { sector, change: (changeRate * 100).toFixed(0) },
        actions: actions.slice(0, 2),
      };
    }
  }
  return null;
}

function checkGrowthStagnation(state: GameState): AdvisorSuggestion | null {
  const stats = state.statistics;
  if (stats.length < 4) return null;

  // GDP declining or flat for 3+ turns
  let decliningTurns = 0;
  for (let i = stats.length - 1; i >= Math.max(1, stats.length - 3); i--) {
    if (stats[i].gdp <= stats[i - 1].gdp * 1.001) {
      decliningTurns++;
    }
  }
  if (decliningTurns < 2) return null;

  const actions: AdvisorAction[] = [];

  if (!state.government.publicWorksActive) {
    actions.push({
      labelKey: 'advisor.action.enablePublicWorks',
      mutation: { type: 'setPublicWorks', value: true },
    });
  }

  const target = clampRate(state.government.taxRate - 0.02);
  if (target < state.government.taxRate - 1e-6) {
    actions.push({
      labelKey: 'advisor.action.lowerTax',
      labelParams: { rate: (target * 100).toFixed(0) },
      mutation: { type: 'setTaxRate', value: target },
    });
  }

  if (actions.length === 0) return null;

  return {
    id: 'growth-stagnation',
    category: 'growth',
    priority: 'warning',
    messageKey: 'advisor.stagnation',
    hintKey: 'advisor.stagnation.hint',
    actions: actions.slice(0, 2),
  };
}

function checkLiquidityCrisis(state: GameState): AdvisorSuggestion | null {
  if (state.government.liquiditySupportActive) return null;

  const alive = state.agents.filter(a => a.alive);
  if (alive.length === 0) return null;
  const broke = alive.filter(a => a.money < 5).length;
  const brokeRate = broke / alive.length;
  if (brokeRate <= 0.30) return null;

  return {
    id: 'liquidity-crisis',
    category: 'liquidity',
    priority: 'warning',
    messageKey: 'advisor.liquidityCrisis',
    hintKey: 'advisor.liquidityCrisis.hint',
    messageParams: { percent: (brokeRate * 100).toFixed(0) },
    actions: [{
      labelKey: 'advisor.action.enableLiquidity',
      mutation: { type: 'setLiquiditySupport', value: true },
    }],
  };
}

function checkTreasurySurplus(state: GameState): AdvisorSuggestion | null {
  const treasury = state.government.treasury;
  if (treasury <= 800) return null;

  // Check if growing
  const stats = state.statistics;
  if (stats.length < 2) return null;
  const prev = stats[stats.length - 2];
  if (prev.government.treasury >= treasury) return null;

  const actions: AdvisorAction[] = [];

  const target = clampRate(state.government.taxRate - 0.02);
  if (target < state.government.taxRate - 1e-6) {
    actions.push({
      labelKey: 'advisor.action.lowerTax',
      labelParams: { rate: (target * 100).toFixed(0) },
      mutation: { type: 'setTaxRate', value: target },
    });
  }

  if (!state.government.publicWorksActive) {
    actions.push({
      labelKey: 'advisor.action.enablePublicWorks',
      mutation: { type: 'setPublicWorks', value: true },
    });
  }

  if (actions.length === 0) return null;

  return {
    id: 'treasury-surplus',
    category: 'surplus',
    priority: 'info',
    messageKey: 'advisor.treasurySurplus',
    hintKey: 'advisor.treasurySurplus.hint',
    messageParams: { treasury: treasury.toFixed(0) },
    actions: actions.slice(0, 2),
  };
}

function checkStageTransition(state: GameState): AdvisorSuggestion | null {
  const stats = state.statistics;
  if (stats.length < 2) return null;

  // Detect if economyStage just changed (compare embedded stage in snapshots isn't available,
  // so we check if current stage differs from what the agent distribution implies)
  // Simpler: the progression module fires events, but we can just check turn count thresholds
  // Actually we'll just skip auto-detection here; the other evaluators cover the practical advice.
  return null;
}

/* ── Main Generator ──────────────────────────────────────────────────────── */

const EVALUATORS = [
  checkShortages,
  checkLowSatisfaction,
  checkTreasuryDepletion,
  checkHighInequality,
  checkPriceVolatility,
  checkGrowthStagnation,
  checkLiquidityCrisis,
  checkTreasurySurplus,
  checkStageTransition,
];

/**
 * Generate at most 2 ranked policy advisor suggestions for the current state.
 * Returns [] if no advice is warranted.
 */
export function generateAdvisorSuggestions(state: GameState): AdvisorSuggestion[] {
  if (state.gameOver) return [];
  if (state.turn < 2) return []; // too early for meaningful advice

  const all: AdvisorSuggestion[] = [];
  const seenCategories = new Set<string>();

  for (const evaluator of EVALUATORS) {
    const suggestion = evaluator(state);
    if (suggestion && !seenCategories.has(suggestion.category)) {
      all.push(suggestion);
      seenCategories.add(suggestion.category);
    }
  }

  // Sort by priority, take top 2
  all.sort((a, b) => PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]);
  return all.slice(0, 2);
}
