import { describe, it, expect } from 'vitest';

import type { Agent } from '../../src/engine/Agent';
import { runTurnPipeline } from '../../src/engine/modules/turnPipelineModule';

function makeAgent(satisfaction: number, health: number): Agent {
  return {
    satisfaction,
    health,
    alive: true,
  } as Agent;
}

describe('turnPipelineModule', () => {
  it('runs phases in order and returns phase summaries', () => {
    const agents = [makeAgent(60, 80), makeAgent(40, 70)];
    const calls: string[] = [];

    const result = runTurnPipeline({
      aliveAgents: agents,
      getAliveAgents: () => agents.filter(agent => agent.alive),
      averageMetric: (items, accessor) => {
        if (items.length === 0) return 0;
        return items.reduce((sum, agent) => sum + accessor(agent), 0) / items.length;
      },
      phaseRollLuck: () => calls.push('roll'),
      phaseProduction: () => calls.push('production'),
      phaseMarketPosting: () => calls.push('posting'),
      clearMarket: () => calls.push('clear'),
      phaseSpoilage: () => calls.push('spoilage'),
      phaseConsumption: current => {
        calls.push('consumption');
        for (const agent of current) {
          agent.satisfaction += 2;
        }
        return {
          needsSatisfactionDelta: 4,
          needsHealthDelta: 0,
          eventSatisfactionDelta: 0,
          eventHealthDelta: 0,
          unmetNeedCount: 0,
        };
      },
      phaseFamilySupport: () => calls.push('family'),
      phaseGovernment: () => {
        calls.push('government');
        return {
          taxCollected: 10,
          welfareSpent: 2,
          welfareRecipients: 1,
          publicWorksSpent: 0,
          liquidityInjected: 0,
          liquidityRecipients: 0,
          policyRate: 0.02,
          treasuryDelta: 8,
          perCapitaCashDelta: -4,
        };
      },
      phaseHouseholdFinance: current => {
        calls.push('finance');
        current[0].satisfaction += 1;
        return 1;
      },
      phaseAgentDecisions: current => {
        calls.push('decisions');
        current[0].satisfaction += 1;
      },
      phaseAging: current => {
        calls.push('aging');
        for (const agent of current) {
          agent.health -= 1;
        }
      },
      phaseLifeDeath: current => {
        calls.push('lifeDeath');
        current[1].alive = false;
        return {
          births: 0,
          deaths: 1,
          deathByCause: { age: 0, health: 1, left: 0 },
        };
      },
      phaseRandomEvents: () => {
        calls.push('events');
        agents[0].satisfaction += 3;
      },
      phaseEconomyProgression: () => calls.push('progression'),
    });

    expect(calls).toEqual([
      'roll',
      'production',
      'posting',
      'clear',
      'spoilage',
      'consumption',
      'family',
      'government',
      'finance',
      'decisions',
      'aging',
      'lifeDeath',
      'events',
      'progression',
    ]);

    expect(result.startPopulation).toBe(2);
    expect(result.startAvgSatisfaction).toBe(50);
    expect(result.startAvgHealth).toBe(75);
    expect(result.agingHealthDelta).toBe(-1);
    expect(result.financialSatisfactionDelta).toBe(1);
    expect(result.endAliveAgents.length).toBe(1);
    expect(result.endAvgSatisfaction).toBe(67);
    expect(result.endAvgHealth).toBe(79);
    expect(result.demographics.deaths).toBe(1);
    expect(result.governmentSummary.taxCollected).toBe(10);
  });
});
