import { CONFIG } from '../../config';
import type { ActiveRandomEvent, IslandTerrainState, SectorType } from '../../types';
import { SECTORS } from '../../types';
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
}

interface MarketPostingPhaseInput {
  agents: Agent[];
  activeRandomEvents: ActiveRandomEvent[];
  market: Market;
  demandMultipliers?: Partial<Record<SectorType, number>>;
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
    const alpha = CONFIG.PRODUCTION_LABOR_ELASTICITY[sector];
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
      subsidyMult * caregiverMultiplier,
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
    agent.postBuyOrders(market, Object.keys(demandModifiers).length > 0 ? demandModifiers : undefined);
  }
}
