import type { SectorType, ScenarioId } from '../../types';
import type { Agent } from '../Agent';
import type { Government } from '../Government';
import type { Market } from '../Market';
import { getScenarioById } from '../../data/scenarios';

export function applyScenarioSetup(params: {
  scenarioId: ScenarioId;
  government: Government;
  agents: Agent[];
  market: Market;
}): void {
  const { scenarioId, government, agents, market } = params;
  const scenario = getScenarioById(scenarioId);

  if (scenario.initialTreasury !== undefined) {
    government.treasury = scenario.initialTreasury;
  }
  if (scenario.initialTaxRate !== undefined) {
    government.setTaxRate(scenario.initialTaxRate);
  }
  if (scenario.initialPolicyRate !== undefined) {
    government.setPolicyRate(scenario.initialPolicyRate);
  }
  if (scenario.initialSubsidies) {
    for (const [sector, amount] of Object.entries(scenario.initialSubsidies)) {
      government.setSubsidy(sector as SectorType, amount ?? 0);
    }
  }
  if (scenario.enableWelfare !== undefined) {
    government.setWelfare(scenario.enableWelfare);
  }
  if (scenario.enablePublicWorks !== undefined) {
    government.setPublicWorks(scenario.enablePublicWorks);
  }
  if (scenario.enableLiquiditySupport !== undefined) {
    government.setLiquiditySupport(scenario.enableLiquiditySupport);
  }

  if (scenario.priceMultiplier) {
    for (const [sector, mult] of Object.entries(scenario.priceMultiplier)) {
      const key = sector as SectorType;
      market.prices[key] *= mult ?? 1;
      market.priceHistory[key][0] = Math.round(market.prices[key] * 100) / 100;
    }
  }

  if (scenario.ageShiftTurns) {
    for (const agent of agents) {
      agent.shiftAge(scenario.ageShiftTurns);
    }
  }

  if (scenario.wealthSkew) {
    const sorted = [...agents].sort((a, b) => b.productivity - a.productivity);
    const topCount = Math.max(1, Math.floor(sorted.length * scenario.wealthSkew.topPercent));
    for (let idx = 0; idx < sorted.length; idx++) {
      const agent = sorted[idx];
      if (idx < topCount) {
        agent.money *= scenario.wealthSkew.topMultiplier;
      } else {
        agent.money *= scenario.wealthSkew.bottomMultiplier;
      }
    }
  }

  market.setMonetaryStance(government.policyRate, government.liquiditySupportActive);
}
