import { CONFIG } from '../../config';
import type { AgentGoalType, SectorType } from '../../types';
import { SECTORS } from '../../types';
import type { RNG } from '../RNG';
import type { AgentContext } from './agentContext';

function getSectorHappinessValue(sector: SectorType): number {
  switch (sector) {
    case 'food': return 0.58;
    case 'goods': return 0.7;
    case 'services': return 1.0;
  }
}

function getSectorSurvivalValue(sector: SectorType): number {
  switch (sector) {
    case 'food': return 1.0;
    case 'goods': return 0.52;
    case 'services': return 0.6;
  }
}

export function estimateSectorUtility(
  ctx: AgentContext,
  sector: SectorType,
  marketPrices: Record<SectorType, number>,
  maxIncomePotential: number,
): number {
  const weights = ctx.goalWeights;
  const incomePotential = marketPrices[sector] * CONFIG.BASE_PRODUCTIVITY[sector] * ctx.effectiveProductivity;
  const incomeScore = incomePotential / Math.max(0.01, maxIncomePotential);

  const survivalScore = getSectorSurvivalValue(sector);
  const happinessScore = getSectorHappinessValue(sector);
  const price = marketPrices[sector];
  const marketMean = (marketPrices.food + marketPrices.goods + marketPrices.services) / 3;
  const stabilityScore = Math.max(0, 1 - Math.abs(price - marketMean) / Math.max(1, marketMean * 1.8));

  return (
    weights.wealth * incomeScore +
    weights.survival * survivalScore +
    weights.happiness * happinessScore +
    weights.stability * stabilityScore
  );
}

export interface JobEvalResult {
  switchTo: SectorType | null;
  newLowIncomeTurns: number;
}

export function evaluateJobSwitch(
  ctx: AgentContext,
  marketPrices: Record<SectorType, number>,
  rng: RNG,
  allowedSectors: SectorType[] = SECTORS,
): JobEvalResult {
  const allowed = allowedSectors.length > 0 ? allowedSectors : SECTORS;
  const isAllowed = (sector: SectorType) => allowed.includes(sector);
  const mustLeaveCurrent = !isAllowed(ctx.sector);
  let lowIncomeTurns = ctx.lowIncomeTurns;

  if (ctx.turnsInSector < 4 && !mustLeaveCurrent) {
    return { switchTo: null, newLowIncomeTurns: lowIncomeTurns };
  }

  if (!mustLeaveCurrent && ctx.money < CONFIG.JOB_SWITCH_COST && lowIncomeTurns === 0) {
    return { switchTo: null, newLowIncomeTurns: lowIncomeTurns };
  }

  const maxIncomePotential = Math.max(
    ...allowed.map(s => marketPrices[s] * CONFIG.BASE_PRODUCTIVITY[s] * ctx.effectiveProductivity),
    0.01,
  );

  let bestSector: SectorType = allowed[0] ?? ctx.sector;
  let bestEstimatedUtility = Number.NEGATIVE_INFINITY;
  let bestBaseUtility = Number.NEGATIVE_INFINITY;
  const currentBaseUtility = isAllowed(ctx.sector)
    ? estimateSectorUtility(ctx, ctx.sector, marketPrices, maxIncomePotential)
    : Number.NEGATIVE_INFINITY;

  for (const sector of allowed) {
    const baseUtility = estimateSectorUtility(ctx, sector, marketPrices, maxIncomePotential);
    const noise = (rng.next() * 2 - 1) * ctx.decisionNoiseAmplitude;
    const estimated = baseUtility + noise;
    if (estimated > bestEstimatedUtility) {
      bestEstimatedUtility = estimated;
      bestBaseUtility = baseUtility;
      bestSector = sector;
    }
  }

  if (mustLeaveCurrent) {
    if (ctx.money >= CONFIG.JOB_SWITCH_COST) {
      return { switchTo: bestSector, newLowIncomeTurns: lowIncomeTurns };
    }
    lowIncomeTurns = Math.min(lowIncomeTurns + 1, 999);
    return { switchTo: null, newLowIncomeTurns: lowIncomeTurns };
  }

  const currentUtility = currentBaseUtility + ctx.goalWeights.stability * 0.06;
  if (bestSector === ctx.sector) {
    lowIncomeTurns = Math.max(0, lowIncomeTurns - 1);
    return { switchTo: null, newLowIncomeTurns: lowIncomeTurns };
  }

  const utilityGain = bestBaseUtility - currentUtility;
  const baseMargin =
    CONFIG.INTELLIGENCE_SWITCH_MARGIN_BASE +
    (1 - ctx.intelligenceDecisionFactor) * 0.16 +
    ctx.totalSwitches * 0.02 -
    ctx.goalWeights.wealth * 0.03;
  const requiredMargin = Math.max(0.02, baseMargin);

  if (utilityGain > requiredMargin) {
    lowIncomeTurns++;
  } else {
    lowIncomeTurns = Math.max(0, lowIncomeTurns - 1);
  }

  const returningToOld = ctx.switchHistory.includes(bestSector);
  const returnPenalty = returningToOld ? CONFIG.JOB_SWITCH_RETURN_PENALTY : 0;
  const thresholdReduction = Math.round(ctx.intelligenceDecisionFactor * CONFIG.INTELLIGENCE_SWITCH_THRESHOLD_BONUS);
  const effectiveThreshold = Math.max(
    2,
    CONFIG.JOB_SWITCH_THRESHOLD_TURNS + returnPenalty + ctx.totalSwitches - thresholdReduction,
  );

  if (lowIncomeTurns >= effectiveThreshold && ctx.money >= CONFIG.JOB_SWITCH_COST) {
    return { switchTo: bestSector, newLowIncomeTurns: lowIncomeTurns };
  }
  return { switchTo: null, newLowIncomeTurns: lowIncomeTurns };
}

export function chooseGoalType(ageTurns: number, rng: RNG): AgentGoalType {
  const r = rng.next();
  const isYouth = ageTurns <= CONFIG.AGE_GROUP_MAX_AGE.youth;
  const isSenior = ageTurns > CONFIG.AGE_GROUP_MAX_AGE.adult;

  if (isSenior) {
    if (r < 0.45) return 'survival';
    if (r < 0.75) return 'happiness';
    if (r < 0.9) return 'balanced';
    return 'wealth';
  }

  if (isYouth) {
    if (r < 0.35) return 'wealth';
    if (r < 0.65) return 'happiness';
    if (r < 0.85) return 'balanced';
    return 'survival';
  }

  if (r < 0.28) return 'wealth';
  if (r < 0.50) return 'survival';
  if (r < 0.72) return 'happiness';
  return 'balanced';
}
