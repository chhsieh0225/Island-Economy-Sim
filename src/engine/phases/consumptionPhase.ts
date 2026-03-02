import type { ActiveRandomEvent } from '../../types';
import type { Agent } from '../Agent';

export function runConsumptionPhase(agents: Agent[], activeRandomEvents: ActiveRandomEvent[]): void {
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

  for (const agent of agents) {
    agent.consumeNeeds();
    if (eventHealthDamage > 0) {
      agent.health = Math.max(0, agent.health - eventHealthDamage);
    }
    if (eventSatBoost > 0) {
      agent.satisfaction = Math.min(100, agent.satisfaction + eventSatBoost);
    }
  }
}
