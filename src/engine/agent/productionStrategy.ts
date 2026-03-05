import { CONFIG } from '../../config';
import type { SectorType, SellOrder } from '../../types';
import type { AgentContext } from './agentContext';
import { computeNeedForSector, computeTargetBufferTurns } from './demandStrategy';

export function computeProductionOutput(
  sector: SectorType,
  effectiveProductivity: number,
  subsidyMultiplier: number,
  publicWorksBoost: number,
  luckFactor: number,
  laborScale: number = 1,
): number {
  const baseOutput = CONFIG.BASE_PRODUCTIVITY[sector];
  return Math.max(
    0,
    baseOutput * effectiveProductivity * subsidyMultiplier * (1 + publicWorksBoost) * luckFactor * laborScale,
  );
}

export function computeSellOrder(
  ctx: AgentContext,
  agentId: number,
  marketPrice: number,
): SellOrder | null {
  const sector = ctx.sector;
  const available = ctx.inventory[sector];
  if (available <= 0) return null;

  const keepQty = computeNeedForSector(ctx, sector) * computeTargetBufferTurns(ctx, sector);
  const sellQty = Math.max(0, available - keepQty);
  if (sellQty <= 0) return null;

  const minPrice = marketPrice * (CONFIG.SELL_PRICE_DISCOUNT + ctx.goalWeights.wealth * 0.05);
  return { agentId, sector, quantity: sellQty, minPrice };
}
