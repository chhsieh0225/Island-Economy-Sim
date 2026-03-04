import assert from 'node:assert/strict';
import test from 'node:test';

import type { Agent } from '../../src/engine/Agent';
import { runTurnPipeline } from '../../src/engine/modules/turnPipelineModule';

function makeAgent(satisfaction: number, health: number): Agent {
  return {
    satisfaction,
    health,
    alive: true,
  } as Agent;
}

test('turn pipeline module: runs phases in order and returns phase summaries', () => {
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
        treasuryDelta: 8,
        perCapitaCashDelta: -4,
      };
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

  assert.deepEqual(calls, [
    'roll',
    'production',
    'posting',
    'clear',
    'spoilage',
    'consumption',
    'family',
    'government',
    'decisions',
    'aging',
    'lifeDeath',
    'events',
    'progression',
  ]);

  assert.equal(result.startPopulation, 2);
  assert.equal(result.startAvgSatisfaction, 50);
  assert.equal(result.startAvgHealth, 75);
  assert.equal(result.agingHealthDelta, -1);
  assert.equal(result.endAliveAgents.length, 1);
  assert.equal(result.endAvgSatisfaction, 66);
  assert.equal(result.endAvgHealth, 79);
  assert.equal(result.demographics.deaths, 1);
  assert.equal(result.governmentSummary.taxCollected, 10);
});

