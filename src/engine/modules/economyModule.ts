import type { CausalDriver, TurnCausalReplay } from '../../types';
import type { ConsumptionPhaseSummary } from '../phases/consumptionPhase';
import type { DemographyPhaseSummary } from '../phases/demographyPhase';
import { te } from '../engineI18n';

interface GovernmentPhaseSummary {
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

export interface BuildTurnCausalReplayInput {
  startPopulation: number;
  startAvgSatisfaction: number;
  endAvgSatisfaction: number;
  startAvgHealth: number;
  endAvgHealth: number;
  consumptionSummary: ConsumptionPhaseSummary;
  financialSatisfactionDelta: number;
  agingHealthDelta: number;
  governmentSummary: GovernmentPhaseSummary;
  demographics: DemographyPhaseSummary;
}

function roundMetric(value: number): number {
  return Math.round(value * 100) / 100;
}

function perCapitaDelta(totalDelta: number, startPopulation: number): number {
  if (startPopulation <= 0) return 0;
  return totalDelta / startPopulation;
}

function nonZeroDrivers(drivers: CausalDriver[]): CausalDriver[] {
  const visible = drivers.filter(driver => Math.abs(driver.value) >= 0.01);
  if (visible.length > 0) return visible;
  return [{ id: 'flat', label: te('engine.causal.flat'), value: 0 }];
}

export function buildZeroCausalReplay(): TurnCausalReplay {
  return {
    satisfaction: {
      net: 0,
      unit: 'point',
      drivers: [{ id: 'flat', label: te('engine.causal.noChange'), value: 0 }],
    },
    health: {
      net: 0,
      unit: 'point',
      drivers: [{ id: 'flat', label: te('engine.causal.noChange'), value: 0 }],
    },
    departures: {
      net: 0,
      unit: 'count',
      drivers: [{ id: 'flat', label: te('engine.causal.noDeparture'), value: 0 }],
    },
    policy: {
      taxCollected: 0,
      welfarePaid: 0,
      welfareRecipients: 0,
      publicWorksCost: 0,
      liquidityInjected: 0,
      autoStabilizerSpent: 0,
      stockpileBuySpent: 0,
      stockpileSellRevenue: 0,
      stockpileMaintenance: 0,
      policyRate: 0,
      perCapitaCashDelta: 0,
      treasuryDelta: 0,
    },
  };
}

export function buildTurnCausalReplay({
  startPopulation,
  startAvgSatisfaction,
  endAvgSatisfaction,
  startAvgHealth,
  endAvgHealth,
  consumptionSummary,
  financialSatisfactionDelta,
  agingHealthDelta,
  governmentSummary,
  demographics,
}: BuildTurnCausalReplayInput): TurnCausalReplay {
  if (startPopulation <= 0) return buildZeroCausalReplay();

  const satNeeds = perCapitaDelta(consumptionSummary.needsSatisfactionDelta, startPopulation);
  const satEvents = perCapitaDelta(consumptionSummary.eventSatisfactionDelta, startPopulation);
  const satFinance = perCapitaDelta(financialSatisfactionDelta, startPopulation);
  const satNet = endAvgSatisfaction - startAvgSatisfaction;
  const satResidual = satNet - satNeeds - satEvents - satFinance;

  const healthNeeds = perCapitaDelta(consumptionSummary.needsHealthDelta, startPopulation);
  const healthEvents = perCapitaDelta(consumptionSummary.eventHealthDelta, startPopulation);
  const healthAging = agingHealthDelta;
  const healthNet = endAvgHealth - startAvgHealth;
  const healthResidual = healthNet - healthNeeds - healthEvents - healthAging;

  const departuresNet = demographics.deaths - demographics.births;

  return {
    satisfaction: {
      net: roundMetric(satNet),
      unit: 'point',
      drivers: nonZeroDrivers([
        {
          id: 'needs',
          label: te('engine.causal.sat.needs', { count: consumptionSummary.unmetNeedCount }),
          value: roundMetric(satNeeds),
        },
        {
          id: 'events',
          label: te('engine.causal.sat.events'),
          value: roundMetric(satEvents),
        },
        {
          id: 'finance',
          label: te('engine.causal.sat.finance'),
          value: roundMetric(satFinance),
        },
        {
          id: 'residual',
          label: te('engine.causal.sat.residual'),
          value: roundMetric(satResidual),
        },
      ]),
    },
    health: {
      net: roundMetric(healthNet),
      unit: 'point',
      drivers: nonZeroDrivers([
        {
          id: 'needs',
          label: te('engine.causal.health.needs', { count: consumptionSummary.unmetNeedCount }),
          value: roundMetric(healthNeeds),
        },
        {
          id: 'events',
          label: te('engine.causal.health.events'),
          value: roundMetric(healthEvents),
        },
        {
          id: 'aging',
          label: te('engine.causal.health.aging'),
          value: roundMetric(healthAging),
        },
        {
          id: 'residual',
          label: te('engine.causal.health.residual'),
          value: roundMetric(healthResidual),
        },
      ]),
    },
    departures: {
      net: departuresNet,
      unit: 'count',
      drivers: nonZeroDrivers([
        {
          id: 'left',
          label: te('engine.causal.dep.left'),
          value: demographics.deathByCause.left,
        },
        {
          id: 'health',
          label: te('engine.causal.dep.health'),
          value: demographics.deathByCause.health,
        },
        {
          id: 'age',
          label: te('engine.causal.dep.age'),
          value: demographics.deathByCause.age,
        },
        {
          id: 'births',
          label: te('engine.causal.dep.births'),
          value: -demographics.births,
        },
      ]),
    },
    policy: {
      taxCollected: roundMetric(governmentSummary.taxCollected),
      welfarePaid: roundMetric(governmentSummary.welfareSpent),
      welfareRecipients: governmentSummary.welfareRecipients,
      publicWorksCost: roundMetric(governmentSummary.publicWorksSpent),
      liquidityInjected: roundMetric(governmentSummary.liquidityInjected),
      autoStabilizerSpent: roundMetric(governmentSummary.autoStabilizerSpent),
      stockpileBuySpent: roundMetric(governmentSummary.stockpileBuySpent),
      stockpileSellRevenue: roundMetric(governmentSummary.stockpileSellRevenue),
      stockpileMaintenance: roundMetric(governmentSummary.stockpileMaintenance),
      policyRate: roundMetric(governmentSummary.policyRate * 100) / 100,
      perCapitaCashDelta: roundMetric(governmentSummary.perCapitaCashDelta),
      treasuryDelta: roundMetric(governmentSummary.treasuryDelta),
    },
  };
}
