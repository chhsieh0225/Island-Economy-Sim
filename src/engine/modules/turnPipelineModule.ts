import type { Agent } from '../Agent';
import type { ConsumptionPhaseSummary } from '../phases/consumptionPhase';
import type { DemographyPhaseSummary } from '../phases/demographyPhase';

export interface TurnGovernmentSummary {
  fiscalInjection: number;
  taxCollected: number;
  welfareSpent: number;
  welfareRecipients: number;
  publicWorksSpent: number;
  liquidityInjected: number;
  liquidityRecipients: number;
  autoStabilizerSpent: number;
  stockpileBuySpent: number;
  stockpileSellRevenue: number;
  stockpileMaintenance: number;
  policyRate: number;
  treasuryDelta: number;
  perCapitaCashDelta: number;
}

interface RunTurnPipelineInput {
  aliveAgents: Agent[];
  getAliveAgents: () => Agent[];
  averageMetric: (agents: Agent[], accessor: (agent: Agent) => number) => number;
  phaseRollLuck: (agents: Agent[]) => void;
  phaseProduction: (agents: Agent[]) => void;
  phaseMarketPosting: (agents: Agent[]) => void;
  clearMarket: () => void;
  phaseSpoilage: (agents: Agent[]) => void;
  phaseConsumption: (agents: Agent[]) => ConsumptionPhaseSummary;
  phaseFamilySupport: (agents: Agent[]) => void;
  phaseGovernment: (agents: Agent[]) => TurnGovernmentSummary;
  phaseHouseholdFinance: (agents: Agent[]) => number;
  phaseAgentDecisions: (agents: Agent[]) => void;
  phaseAging: (agents: Agent[]) => void;
  phaseLifeDeath: (agents: Agent[]) => DemographyPhaseSummary;
  phaseRandomEvents: () => void;
  phaseEconomyProgression: (agents: Agent[]) => void;
}

export interface TurnPipelineResult {
  startPopulation: number;
  startAvgSatisfaction: number;
  startAvgHealth: number;
  endAvgSatisfaction: number;
  endAvgHealth: number;
  agingHealthDelta: number;
  consumptionSummary: ConsumptionPhaseSummary;
  financialSatisfactionDelta: number;
  governmentSummary: TurnGovernmentSummary;
  demographics: DemographyPhaseSummary;
  endAliveAgents: Agent[];
}

export function runTurnPipeline({
  aliveAgents,
  getAliveAgents,
  averageMetric,
  phaseRollLuck,
  phaseProduction,
  phaseMarketPosting,
  clearMarket,
  phaseSpoilage,
  phaseConsumption,
  phaseFamilySupport,
  phaseGovernment,
  phaseHouseholdFinance,
  phaseAgentDecisions,
  phaseAging,
  phaseLifeDeath,
  phaseRandomEvents,
  phaseEconomyProgression,
}: RunTurnPipelineInput): TurnPipelineResult {
  const startPopulation = aliveAgents.length;
  const startAvgSatisfaction = averageMetric(aliveAgents, agent => agent.satisfaction);
  const startAvgHealth = averageMetric(aliveAgents, agent => agent.health);

  phaseRollLuck(aliveAgents);
  phaseProduction(aliveAgents);
  phaseMarketPosting(aliveAgents);
  clearMarket();
  phaseSpoilage(aliveAgents);

  const consumptionSummary = phaseConsumption(aliveAgents);
  phaseFamilySupport(aliveAgents);
  const governmentSummary = phaseGovernment(aliveAgents);
  const financialSatisfactionDelta = phaseHouseholdFinance(aliveAgents);
  phaseAgentDecisions(aliveAgents);

  const healthBeforeAging = averageMetric(aliveAgents, agent => agent.health);
  phaseAging(aliveAgents);
  const healthAfterAging = averageMetric(aliveAgents, agent => agent.health);
  const agingHealthDelta = healthAfterAging - healthBeforeAging;

  const demographics = phaseLifeDeath(aliveAgents);
  phaseRandomEvents();

  const aliveAfterEvents = getAliveAgents();
  phaseEconomyProgression(aliveAfterEvents);
  const endAliveAgents = getAliveAgents();
  const endAvgSatisfaction = averageMetric(endAliveAgents, agent => agent.satisfaction);
  const endAvgHealth = averageMetric(endAliveAgents, agent => agent.health);

  return {
    startPopulation,
    startAvgSatisfaction,
    startAvgHealth,
    endAvgSatisfaction,
    endAvgHealth,
    agingHealthDelta,
    consumptionSummary,
    financialSatisfactionDelta,
    governmentSummary,
    demographics,
    endAliveAgents,
  };
}
