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
}

interface MarketPostingPhaseInput {
  agents: Agent[];
  activeRandomEvents: ActiveRandomEvent[];
  market: Market;
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

  for (const agent of agents) {
    const terrainMult = terrain.sectorSuitability[agent.sector];
    const subsidyMult = government.getSubsidyMultiplier(agent.sector) * productivityMods[agent.sector] * terrainMult;
    const publicWorksBoost = government.getPublicWorksBoost();
    agent.produce(subsidyMult, publicWorksBoost);
  }
}

export function runMarketPostingPhase({
  agents,
  activeRandomEvents,
  market,
}: MarketPostingPhaseInput): void {
  const demandModifiers: Partial<Record<SectorType, number>> = {};
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
