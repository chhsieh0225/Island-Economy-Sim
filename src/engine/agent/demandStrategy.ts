import { CONFIG } from '../../config';
import type { SectorType, BuyOrder } from '../../types';
import { SECTORS } from '../../types';
import type { AgentContext } from './agentContext';

export function computeNeedForSector(ctx: AgentContext, sector: SectorType, demandMultiplier: number = 1): number {
  const base = CONFIG.CONSUMPTION[sector];
  const ageMult = CONFIG.CONSUMPTION_AGE_MULTIPLIERS[ctx.ageGroup][sector];
  return base * ageMult * demandMultiplier;
}

export function computeTargetBufferTurns(ctx: AgentContext, sector: SectorType): number {
  const weights = ctx.goalWeights;
  let turns =
    CONFIG.GOAL_BUFFER_BASE_TURNS +
    weights.survival * CONFIG.GOAL_BUFFER_SURVIVAL_WEIGHT +
    weights.happiness * CONFIG.GOAL_BUFFER_HAPPINESS_WEIGHT +
    ctx.intelligenceDecisionFactor * CONFIG.GOAL_BUFFER_IQ_WEIGHT;

  if (sector === 'food') turns += 0.45 * weights.survival;
  if (sector === 'services') turns += 0.35 * weights.happiness;
  if (ctx.health < 45) turns += 0.6;

  return Math.max(1, Math.min(4.2, turns));
}

export function computeCashReserveTarget(ctx: AgentContext): number {
  const weights = ctx.goalWeights;
  return (
    CONFIG.GOAL_EMERGENCY_CASH +
    weights.survival * CONFIG.GOAL_RESERVE_SURVIVAL_WEIGHT +
    weights.wealth * CONFIG.GOAL_RESERVE_WEALTH_WEIGHT
  );
}

export function computeSectorPriority(ctx: AgentContext, sector: SectorType): number {
  const weights = ctx.goalWeights;
  const healthPressure = ctx.health < 50 ? 0.45 : 0;
  const satPressure = ctx.satisfaction < 45 ? 0.35 : 0;

  switch (sector) {
    case 'food':
      return 1 + weights.survival * 1.0 + healthPressure;
    case 'goods':
      return 0.85 + weights.wealth * 0.7;
    case 'services':
      return 0.8 + weights.happiness * 0.95 + satPressure;
  }
}

function computeMarshallianBudgetShares(
  ctx: AgentContext,
  demandModifiers?: Partial<Record<SectorType, number>>,
  allowedSectors: SectorType[] = SECTORS,
): Record<SectorType, number> {
  const allowed = new Set<SectorType>(allowedSectors.length > 0 ? allowedSectors : SECTORS);
  const raw: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
  for (const sector of SECTORS) {
    if (!allowed.has(sector)) {
      raw[sector] = 0;
      continue;
    }
    const priority = computeSectorPriority(ctx, sector);
    const demandWeight = Math.max(ctx.calibration.lesMinDemandWeight, demandModifiers?.[sector] ?? 1);
    raw[sector] = Math.max(0.05, priority * demandWeight);
  }

  const sum = raw.food + raw.goods + raw.services;
  if (sum <= 0) return { food: 1 / 3, goods: 1 / 3, services: 1 / 3 };

  return {
    food: raw.food / sum,
    goods: raw.goods / sum,
    services: raw.services / sum,
  };
}

export function computeBuyOrders(
  ctx: AgentContext,
  agentId: number,
  marketPrices: Record<SectorType, number>,
  demandModifiers?: Partial<Record<SectorType, number>>,
  allowedSectors: SectorType[] = SECTORS,
): BuyOrder[] {
  const allowed = allowedSectors.length > 0 ? allowedSectors : SECTORS;
  const allowedSet = new Set<SectorType>(allowed);

  const reserve = computeCashReserveTarget(ctx);
  let availableMoney = ctx.money;
  if (availableMoney < reserve && ctx.savings > 0) {
    availableMoney += Math.min(ctx.savings, reserve - availableMoney);
  }
  let budgetPool = Math.max(0, availableMoney - reserve);
  if (budgetPool <= 0.01) return [];

  const budgetShares = computeMarshallianBudgetShares(ctx, demandModifiers, allowed);
  const requiredNow: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
  const targetGap: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };

  for (const sector of SECTORS) {
    if (!allowedSet.has(sector)) {
      requiredNow[sector] = 0;
      targetGap[sector] = 0;
      continue;
    }
    const demandMult = demandModifiers?.[sector] ?? 1;
    const need = computeNeedForSector(ctx, sector, demandMult);
    const targetStock = need * computeTargetBufferTurns(ctx, sector);
    requiredNow[sector] = Math.max(0, need * ctx.calibration.lesSubsistenceMultiplier - ctx.inventory[sector]);
    targetGap[sector] = Math.max(0, targetStock - ctx.inventory[sector]);
  }

  const subsistenceCost = allowed.reduce(
    (sum, sector) => sum + requiredNow[sector] * Math.max(0.01, marketPrices[sector]),
    0,
  );
  const supernumeraryBudget = Math.max(0, budgetPool - subsistenceCost);

  const orders: BuyOrder[] = [];
  const candidateSectors = [...allowed].sort((a, b) => computeSectorPriority(ctx, b) - computeSectorPriority(ctx, a));

  for (const sector of candidateSectors) {
    const maxDesired = targetGap[sector];
    if (maxDesired <= 0.01) continue;

    const price = Math.max(0.01, marketPrices[sector]);
    const desiredQty = requiredNow[sector] + budgetShares[sector] * (supernumeraryBudget / price);
    let quantity = Math.min(maxDesired, desiredQty);
    if (quantity <= 0.01) continue;

    const priority = computeSectorPriority(ctx, sector);
    const premiumMultiplier =
      CONFIG.BUY_PRICE_PREMIUM +
      ctx.desperation * (CONFIG.MAX_DESPERATION_PREMIUM - CONFIG.BUY_PRICE_PREMIUM) +
      (priority - 1) * 0.22;
    const maxPrice = price * Math.max(1.02, premiumMultiplier);
    const affordableQty = budgetPool / Math.max(0.01, maxPrice);
    quantity = Math.min(quantity, affordableQty);

    if (quantity > 0.01) {
      orders.push({ agentId, sector, quantity, maxPrice });
      budgetPool = Math.max(0, budgetPool - quantity * maxPrice);
    }
  }

  return orders;
}

export interface ConsumptionResult {
  unmetNeeds: SectorType[];
  healthDelta: number;
  satisfactionDelta: number;
  newHealth: number;
  newSatisfaction: number;
  inventoryConsumed: Record<SectorType, number>;
}

export function computeConsumption(
  ctx: AgentContext,
  demandMultipliers?: Partial<Record<SectorType, number>>,
  allowedSectors: SectorType[] = SECTORS,
): ConsumptionResult {
  const unmetNeeds: SectorType[] = [];
  const allowed = new Set<SectorType>(allowedSectors.length > 0 ? allowedSectors : SECTORS);
  const inventoryConsumed: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };

  for (const sector of SECTORS) {
    if (!allowed.has(sector)) continue;
    const required = computeNeedForSector(ctx, sector, demandMultipliers?.[sector] ?? 1);
    if (ctx.inventory[sector] >= required) {
      inventoryConsumed[sector] = required;
    } else {
      inventoryConsumed[sector] = ctx.inventory[sector];
      unmetNeeds.push(sector);
    }
  }

  let newHealth = ctx.health;
  let newSatisfaction = ctx.satisfaction;

  if (unmetNeeds.length === 0) {
    newHealth = Math.min(100, newHealth + CONFIG.HEALTH_RECOVERY_ALL_MET);
    newSatisfaction = Math.min(100, newSatisfaction + CONFIG.SATISFACTION_RECOVERY_ALL_MET);
  } else if (unmetNeeds.length < 3) {
    newHealth = Math.min(100, newHealth + CONFIG.HEALTH_RECOVERY_PARTIAL - CONFIG.HEALTH_DECAY_PER_UNMET_NEED * unmetNeeds.length);
    newSatisfaction -= CONFIG.SATISFACTION_DECAY_PER_UNMET_NEED * unmetNeeds.length;
  } else {
    newHealth -= CONFIG.HEALTH_DECAY_PER_UNMET_NEED * unmetNeeds.length;
    newSatisfaction -= CONFIG.SATISFACTION_DECAY_PER_UNMET_NEED * unmetNeeds.length;
  }

  newHealth = Math.max(0, Math.min(100, newHealth));
  newSatisfaction = Math.max(0, Math.min(100, newSatisfaction));

  return {
    unmetNeeds,
    healthDelta: newHealth - ctx.health,
    satisfactionDelta: newSatisfaction - ctx.satisfaction,
    newHealth,
    newSatisfaction,
    inventoryConsumed,
  };
}
