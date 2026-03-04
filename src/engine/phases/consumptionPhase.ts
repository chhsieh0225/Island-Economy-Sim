import type { ActiveRandomEvent, SectorType } from '../../types';
import type { Agent } from '../Agent';

export interface ConsumptionPhaseSummary {
  needsSatisfactionDelta: number;
  needsHealthDelta: number;
  eventSatisfactionDelta: number;
  eventHealthDelta: number;
  unmetNeedCount: number;
}

export function runConsumptionPhase(
  agents: Agent[],
  activeRandomEvents: ActiveRandomEvent[],
  demandMultipliers?: Partial<Record<SectorType, number>>,
  allowedSectors: SectorType[] = ['food', 'goods', 'services'],
): ConsumptionPhaseSummary {
  let eventHealthDamage = 0;
  for (const event of activeRandomEvents) {
    if (event.def.effects.healthDamage) {
      eventHealthDamage += event.def.effects.healthDamage;
    }
  }

  let eventSatBoost = 0;
  for (const event of activeRandomEvents) {
    if (event.def.effects.satisfactionBoost) {
      eventSatBoost += event.def.effects.satisfactionBoost;
    }
  }

  const summary: ConsumptionPhaseSummary = {
    needsSatisfactionDelta: 0,
    needsHealthDelta: 0,
    eventSatisfactionDelta: 0,
    eventHealthDelta: 0,
    unmetNeedCount: 0,
  };

  for (const agent of agents) {
    const outcome = agent.consumeNeeds(demandMultipliers, allowedSectors);
    summary.needsSatisfactionDelta += outcome.satisfactionDelta;
    summary.needsHealthDelta += outcome.healthDelta;
    summary.unmetNeedCount += outcome.unmetNeeds.length;
    if (eventHealthDamage > 0) {
      agent.health = Math.max(0, agent.health - eventHealthDamage);
      summary.eventHealthDelta -= eventHealthDamage;
    }
    if (eventSatBoost > 0) {
      agent.satisfaction = Math.min(100, agent.satisfaction + eventSatBoost);
      summary.eventSatisfactionDelta += eventSatBoost;
    }
  }

  return summary;
}
