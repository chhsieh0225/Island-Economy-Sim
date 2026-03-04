import type { PendingPolicyType, PolicyTimelineEntry, SectorType, TurnSnapshot } from '../../types';

export type PolicyExperimentStatus = 'pending' | 'collecting' | 'complete';

export interface PolicyExperimentMetrics {
  satisfactionDelta: number;
  treasuryDelta: number;
  gdpDeltaPercent: number;
  populationDelta: number;
}

export interface PolicyExperimentCard {
  id: string;
  type: PendingPolicyType;
  summary: string;
  value: number | boolean;
  sector?: SectorType;
  requestedTurn: number;
  applyTurn: number;
  windowEndTurn: number;
  observedTurn: number | null;
  status: PolicyExperimentStatus;
  predictions: string[];
  metrics: PolicyExperimentMetrics | null;
}

function round2(value: number): number {
  return Math.round(value * 100) / 100;
}

function findSnapshotAtOrBefore(stats: TurnSnapshot[], turn: number): TurnSnapshot | null {
  for (let idx = stats.length - 1; idx >= 0; idx--) {
    if (stats[idx].turn <= turn) return stats[idx];
  }
  return null;
}

export function buildPolicyExperimentCards(
  policyTimeline: PolicyTimelineEntry[],
  statistics: TurnSnapshot[],
  options?: {
    maxCards?: number;
    observationTurns?: number;
  },
): PolicyExperimentCard[] {
  const maxCards = options?.maxCards ?? 4;
  const observationTurns = Math.max(1, options?.observationTurns ?? 3);
  const latest = statistics[statistics.length - 1];

  return policyTimeline
    .slice(0, maxCards)
    .map(item => {
      const windowEndTurn = item.applyTurn + observationTurns - 1;
      const latestTurn = latest?.turn ?? 0;
      const observedTurn = latestTurn > 0 ? Math.min(latestTurn, windowEndTurn) : null;
      const predictions = item.sideEffects.length > 0 ? item.sideEffects : ['此政策尚未提供明確預測。'];

      if (item.status === 'pending' || latestTurn < item.applyTurn) {
        return {
          id: item.id,
          type: item.type,
          summary: item.summary,
          value: item.value,
          sector: item.sector,
          requestedTurn: item.requestedTurn,
          applyTurn: item.applyTurn,
          windowEndTurn,
          observedTurn,
          status: 'pending' as const,
          predictions,
          metrics: null,
        };
      }

      const baselineTurn = Math.max(0, item.applyTurn - 1);
      const baseline = findSnapshotAtOrBefore(statistics, baselineTurn) ?? findSnapshotAtOrBefore(statistics, item.applyTurn);
      const observed = observedTurn !== null ? findSnapshotAtOrBefore(statistics, observedTurn) : null;

      if (!baseline || !observed || observed.turn <= baseline.turn) {
        return {
          id: item.id,
          type: item.type,
          summary: item.summary,
          value: item.value,
          sector: item.sector,
          requestedTurn: item.requestedTurn,
          applyTurn: item.applyTurn,
          windowEndTurn,
          observedTurn,
          status: 'collecting' as const,
          predictions,
          metrics: null,
        };
      }

      const metrics: PolicyExperimentMetrics = {
        satisfactionDelta: round2(observed.avgSatisfaction - baseline.avgSatisfaction),
        treasuryDelta: round2(observed.government.treasury - baseline.government.treasury),
        gdpDeltaPercent: round2(((observed.gdp - baseline.gdp) / Math.max(1, baseline.gdp)) * 100),
        populationDelta: observed.population - baseline.population,
      };

      const status: PolicyExperimentStatus = observedTurn !== null && observedTurn >= windowEndTurn
        ? 'complete'
        : 'collecting';

      return {
        id: item.id,
        type: item.type,
        summary: item.summary,
        value: item.value,
        sector: item.sector,
        requestedTurn: item.requestedTurn,
        applyTurn: item.applyTurn,
        windowEndTurn,
        observedTurn,
        status,
        predictions,
        metrics,
      };
    });
}
