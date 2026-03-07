import { CONFIG } from '../../config';
import type { ActiveRandomEvent, IslandTerrainState, SectorType } from '../../types';
import { SECTORS } from '../../types';
import type { EconomicCalibrationProfile } from '../economicCalibration';
import type { Agent } from '../Agent';
import type { Government } from '../Government';
import type { Market } from '../Market';

interface ProductionPhaseInput {
  agents: Agent[];
  activeRandomEvents: ActiveRandomEvent[];
  terrain: IslandTerrainState;
  government: Government;
  workingAge: number;
  allowedSectors: SectorType[];
  caregiverPenaltyPerChild: number;
  caregiverPenaltyMax: number;
  calibration: EconomicCalibrationProfile;
  /** Per-sector infrastructure productivity boosts (additive ratio, e.g. 0.1 = +10%) */
  infrastructureSectorBoost?: Partial<Record<SectorType, number>>;
  /** Overall infrastructure productivity boost (additive ratio) */
  infrastructureOverallBoost?: number;
  /** Current market prices — used for supply-side price elasticity (agents reduce output when price < break-even) */
  marketPrices?: Record<SectorType, number>;
}

interface MarketPostingPhaseInput {
  agents: Agent[];
  activeRandomEvents: ActiveRandomEvent[];
  market: Market;
  demandMultipliers?: Partial<Record<SectorType, number>>;
  allowedSectors?: SectorType[];
}

export function runSpoilagePhase(agents: Agent[]): void {
  const rate = CONFIG.INVENTORY_SPOILAGE_RATE;
  for (const agent of agents) {
    for (const sector of SECTORS) {
      const keep = CONFIG.CONSUMPTION[sector];
      const excess = agent.inventory[sector] - keep;
      if (excess > 0) {
        agent.inventory[sector] -= excess * rate;
      }
    }
  }
}

export function runProductionPhase({
  agents,
  activeRandomEvents,
  terrain,
  government,
  workingAge,
  allowedSectors,
  caregiverPenaltyPerChild,
  caregiverPenaltyMax,
  calibration,
  infrastructureSectorBoost,
  infrastructureOverallBoost,
  marketPrices,
}: ProductionPhaseInput): void {
  const productivityMods: Record<SectorType, number> = { food: 1, goods: 1, services: 1 };
  for (const event of activeRandomEvents) {
    if (event.def.effects.sectorProductivity) {
      for (const [sector, mult] of Object.entries(event.def.effects.sectorProductivity)) {
        productivityMods[sector as SectorType] *= mult;
      }
    }
    if (event.def.effects.productivityPenalty) {
      for (const s of SECTORS) {
        productivityMods[s] *= event.def.effects.productivityPenalty;
      }
    }
  }

  // Apply infrastructure productivity boosts
  const overallBoost = infrastructureOverallBoost ?? 0;
  if (overallBoost > 0 || infrastructureSectorBoost) {
    for (const s of SECTORS) {
      const sectorBoost = infrastructureSectorBoost?.[s] ?? 0;
      productivityMods[s] *= (1 + overallBoost + sectorBoost);
    }
  }

  // Supply-side price elasticity: agents reduce output when price falls below break-even cost
  const priceResponseBySector: Record<SectorType, number> = { food: 1, goods: 1, services: 1 };
  if (marketPrices) {
    for (const s of SECTORS) {
      const breakEven = CONFIG.INITIAL_PRICES[s] * CONFIG.PRODUCTION_BREAK_EVEN_RATIO;
      priceResponseBySector[s] = Math.max(
        CONFIG.PRODUCTION_MIN_PRICE_RESPONSE,
        Math.min(1, marketPrices[s] / breakEven),
      );
    }
  }

  const allowed = new Set<SectorType>(allowedSectors);
  const sectorLaborCount: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
  for (const agent of agents) {
    if (agent.age < workingAge) continue;
    if (!allowed.has(agent.sector)) continue;
    sectorLaborCount[agent.sector]++;
  }

  const laborScaleBySector: Record<SectorType, number> = { food: 1, goods: 1, services: 1 };
  for (const sector of SECTORS) {
    const labor = sectorLaborCount[sector];
    if (labor <= 0) {
      laborScaleBySector[sector] = 0;
      continue;
    }
    const alpha = calibration.productionLaborElasticity[sector];
    laborScaleBySector[sector] = Math.pow(labor, alpha - 1);
  }

  const childCountByFamily = new Map<number, number>();
  for (const agent of agents) {
    if (agent.age >= workingAge) continue;
    childCountByFamily.set(agent.familyId, (childCountByFamily.get(agent.familyId) ?? 0) + 1);
  }

  for (const agent of agents) {
    if (agent.age < workingAge) continue;
    if (!allowed.has(agent.sector)) continue;

    const terrainMult = terrain.sectorSuitability[agent.sector];
    const children = childCountByFamily.get(agent.familyId) ?? 0;
    const caregiverPenalty = Math.min(caregiverPenaltyMax, children * caregiverPenaltyPerChild);
    const caregiverMultiplier = Math.max(0.55, 1 - caregiverPenalty);
    const subsidyMult = government.getSubsidyMultiplier(agent.sector) * productivityMods[agent.sector] * terrainMult;
    const publicWorksBoost = government.getPublicWorksBoost();
    agent.produce(
      subsidyMult * caregiverMultiplier * priceResponseBySector[agent.sector],
      publicWorksBoost,
      laborScaleBySector[agent.sector],
    );
  }
}

export function runMarketPostingPhase({
  agents,
  activeRandomEvents,
  market,
  demandMultipliers,
  allowedSectors,
}: MarketPostingPhaseInput): void {
  const demandModifiers: Partial<Record<SectorType, number>> = { ...(demandMultipliers ?? {}) };
  for (const event of activeRandomEvents) {
    if (event.def.effects.servicesDemandBoost) {
      demandModifiers.services = (demandModifiers.services ?? 1) * event.def.effects.servicesDemandBoost;
    }
  }

  for (const agent of agents) {
    agent.postSellOrders(market);
  }
  for (const agent of agents) {
    agent.postBuyOrders(
      market,
      Object.keys(demandModifiers).length > 0 ? demandModifiers : undefined,
      allowedSectors,
    );
  }
}
