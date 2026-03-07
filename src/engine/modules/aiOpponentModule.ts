// ── AI Opponent Module ──────────────────────────────────────────────
// Simplified AI simulation for competition mode.

import { te } from '../engineI18n';

export type AIStrategy = 'balanced' | 'growth' | 'welfare';

export interface AISnapshot {
  turn: number;
  population: number;
  gdp: number;
  satisfaction: number;
  gini: number;
  treasury: number;
}

export interface AIOpponent {
  strategy: AIStrategy;
  name: string;
  history: AISnapshot[];
}

function getStrategyName(strategy: AIStrategy): string {
  return te(`ai.strategy.${strategy}`);
}

// Strategy parameters affect simulation dynamics
const STRATEGY_PARAMS: Record<AIStrategy, {
  taxRate: number;
  growthBias: number;     // GDP growth tendency
  welfareBias: number;    // satisfaction boost
  giniTendency: number;   // inequality tendency (lower = more equal)
  treasuryRate: number;   // treasury growth rate
  popGrowthRate: number;  // population growth rate
}> = {
  balanced: {
    taxRate: 0.12,
    growthBias: 0.03,
    welfareBias: 0.01,
    giniTendency: 0.32,
    treasuryRate: 0.02,
    popGrowthRate: 0.005,
  },
  growth: {
    taxRate: 0.08,
    growthBias: 0.06,
    welfareBias: -0.005,
    giniTendency: 0.42,
    treasuryRate: 0.04,
    popGrowthRate: 0.008,
  },
  welfare: {
    taxRate: 0.18,
    growthBias: 0.015,
    welfareBias: 0.025,
    giniTendency: 0.25,
    treasuryRate: -0.005,
    popGrowthRate: 0.003,
  },
};

export function createAIOpponent(strategy: AIStrategy): AIOpponent {
  return {
    strategy,
    name: getStrategyName(strategy),
    history: [{
      turn: 0,
      population: 100,
      gdp: 0,
      satisfaction: 75,
      gini: 0.3,
      treasury: 200,
    }],
  };
}

/**
 * Advance the AI opponent by one turn.
 * Uses simplified economic dynamics with some randomness.
 */
export function advanceAIOpponent(opponent: AIOpponent): void {
  const prev = opponent.history[opponent.history.length - 1];
  const params = STRATEGY_PARAMS[opponent.strategy];
  const turn = prev.turn + 1;

  // Add some noise for realism
  const noise = () => (Math.random() - 0.5) * 0.02;

  // Population: grows based on satisfaction and strategy
  const popGrowth = params.popGrowthRate * (prev.satisfaction / 75) + noise() * 0.003;
  const population = Math.max(50, Math.round(prev.population * (1 + popGrowth)));

  // GDP: grows based on population and strategy
  const gdpLevel = turn * 15 * (1 + params.growthBias) * (population / 100) + noise() * 20;
  const gdp = Math.max(0, gdpLevel);

  // Satisfaction: trends toward strategy's target with noise
  const satTarget = 65 + params.welfareBias * 500;
  const satisfaction = Math.max(20, Math.min(95,
    prev.satisfaction + (satTarget - prev.satisfaction) * 0.1 + noise() * 3,
  ));

  // Gini: trends toward strategy's natural level
  const gini = Math.max(0.15, Math.min(0.6,
    prev.gini + (params.giniTendency - prev.gini) * 0.05 + noise() * 0.01,
  ));

  // Treasury: affected by tax and spending
  const taxIncome = gdp * params.taxRate;
  const spending = population * 0.15;
  const treasury = Math.max(-500, prev.treasury + taxIncome - spending + params.treasuryRate * 100);

  opponent.history.push({ turn, population, gdp, satisfaction, gini, treasury });
}

/**
 * Get the latest snapshot for an AI opponent.
 */
export function getAILatest(opponent: AIOpponent): AISnapshot {
  return opponent.history[opponent.history.length - 1];
}
