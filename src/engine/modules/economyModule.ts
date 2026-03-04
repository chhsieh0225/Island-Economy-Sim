import type { CausalDriver, TurnCausalReplay } from '../../types';
import type { ConsumptionPhaseSummary } from '../phases/consumptionPhase';
import type { DemographyPhaseSummary } from '../phases/demographyPhase';

interface GovernmentPhaseSummary {
  taxCollected: number;
  welfareSpent: number;
  welfareRecipients: number;
  publicWorksSpent: number;
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
  return [{ id: 'flat', label: '本回合變化很小', value: 0 }];
}

export function buildZeroCausalReplay(): TurnCausalReplay {
  return {
    satisfaction: {
      net: 0,
      unit: 'point',
      drivers: [{ id: 'flat', label: '本回合無顯著變化', value: 0 }],
    },
    health: {
      net: 0,
      unit: 'point',
      drivers: [{ id: 'flat', label: '本回合無顯著變化', value: 0 }],
    },
    departures: {
      net: 0,
      unit: 'count',
      drivers: [{ id: 'flat', label: '本回合無人口流出', value: 0 }],
    },
    policy: {
      taxCollected: 0,
      welfarePaid: 0,
      welfareRecipients: 0,
      publicWorksCost: 0,
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
  agingHealthDelta,
  governmentSummary,
  demographics,
}: BuildTurnCausalReplayInput): TurnCausalReplay {
  if (startPopulation <= 0) return buildZeroCausalReplay();

  const satNeeds = perCapitaDelta(consumptionSummary.needsSatisfactionDelta, startPopulation);
  const satEvents = perCapitaDelta(consumptionSummary.eventSatisfactionDelta, startPopulation);
  const satNet = endAvgSatisfaction - startAvgSatisfaction;
  const satResidual = satNet - satNeeds - satEvents;

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
          label: `需求狀態（缺口 ${consumptionSummary.unmetNeedCount}）`,
          value: roundMetric(satNeeds),
        },
        {
          id: 'events',
          label: '事件衝擊',
          value: roundMetric(satEvents),
        },
        {
          id: 'residual',
          label: '其他與人口組成',
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
          label: `需求與照護（缺口 ${consumptionSummary.unmetNeedCount}）`,
          value: roundMetric(healthNeeds),
        },
        {
          id: 'events',
          label: '事件衝擊',
          value: roundMetric(healthEvents),
        },
        {
          id: 'aging',
          label: '老化效應',
          value: roundMetric(healthAging),
        },
        {
          id: 'residual',
          label: '其他與人口組成',
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
          label: '不滿離島',
          value: demographics.deathByCause.left,
        },
        {
          id: 'health',
          label: '健康死亡',
          value: demographics.deathByCause.health,
        },
        {
          id: 'age',
          label: '老化死亡',
          value: demographics.deathByCause.age,
        },
        {
          id: 'births',
          label: '新生加入',
          value: -demographics.births,
        },
      ]),
    },
    policy: {
      taxCollected: roundMetric(governmentSummary.taxCollected),
      welfarePaid: roundMetric(governmentSummary.welfareSpent),
      welfareRecipients: governmentSummary.welfareRecipients,
      publicWorksCost: roundMetric(governmentSummary.publicWorksSpent),
      perCapitaCashDelta: roundMetric(governmentSummary.perCapitaCashDelta),
      treasuryDelta: roundMetric(governmentSummary.treasuryDelta),
    },
  };
}
