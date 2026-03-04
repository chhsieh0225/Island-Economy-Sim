import { CONFIG } from '../../config';
import type { GovernmentState, SectorType } from '../../types';
import type { PolicyExperimentCard } from './policyExperimentModule';

export type PolicyRecommendationAction =
  | { type: 'setTaxRate'; value: number }
  | { type: 'setSubsidy'; sector: SectorType; value: number }
  | { type: 'setWelfare'; value: boolean }
  | { type: 'setPublicWorks'; value: boolean };

export interface PolicyRecommendation {
  reason: string;
  action: PolicyRecommendationAction;
  impactHint: string;
}

function clampRate(rate: number): number {
  return Math.max(0, Math.min(CONFIG.MAX_TAX_RATE, rate));
}

interface ImpactEstimate {
  satisfaction: number;
  treasury: number;
  growth: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function sign(value: number): -1 | 0 | 1 {
  if (value > 1e-6) return 1;
  if (value < -1e-6) return -1;
  return 0;
}

function withRecentAdjustment(base: ImpactEstimate, card: PolicyExperimentCard): ImpactEstimate {
  if (!card.metrics) return base;

  const satAdj = Math.min(0.9, Math.abs(card.metrics.satisfactionDelta) * 0.25);
  const treasuryAdj = Math.min(12, Math.abs(card.metrics.treasuryDelta) * 0.15);
  const growthAdj = Math.min(1.2, Math.abs(card.metrics.gdpDeltaPercent) * 0.25);

  const satSign = sign(base.satisfaction);
  const treasurySign = sign(base.treasury);
  const growthSign = sign(base.growth);

  return {
    satisfaction: clamp(base.satisfaction + satSign * satAdj, -3.5, 3.5),
    treasury: clamp(base.treasury + treasurySign * treasuryAdj, -80, 80),
    growth: clamp(base.growth + growthSign * growthAdj, -4, 4),
  };
}

function formatSignedRange(value: number, digits: number, suffix = ''): string {
  const abs = Math.abs(value);
  if (abs < 1e-6) return `≈0${suffix}`;
  const lowAbs = abs * 0.65;
  const highAbs = abs * 1.35;
  const fmt = (raw: number) => `${raw >= 0 ? '+' : ''}${raw.toFixed(digits)}${suffix}`;
  if (value > 0) {
    return `${fmt(lowAbs)}~${fmt(highAbs)}`;
  }
  return `${fmt(-highAbs)}~${fmt(-lowAbs)}`;
}

function formatImpactHint(estimate: ImpactEstimate): string {
  return `預估(延遲 ${CONFIG.POLICY_DELAY_TURNS} 回合後，生效 1-3 回合)：民心 ${formatSignedRange(estimate.satisfaction, 1)} / 國庫 ${formatSignedRange(estimate.treasury, 0)} / 成長 ${formatSignedRange(estimate.growth, 2, '%')}`;
}

function estimateImpactHint(
  action: PolicyRecommendationAction,
  government: GovernmentState,
  card: PolicyExperimentCard,
): string {
  let base: ImpactEstimate = { satisfaction: 0, treasury: 0, growth: 0 };

  switch (action.type) {
    case 'setTaxRate': {
      const delta = action.value - government.taxRate;
      const magnitude = Math.abs(delta) / 0.02;
      if (delta < -1e-6) {
        base = {
          satisfaction: 0.7 * magnitude,
          treasury: -16 * magnitude,
          growth: 0.55 * magnitude,
        };
      } else if (delta > 1e-6) {
        base = {
          satisfaction: -0.7 * magnitude,
          treasury: 16 * magnitude,
          growth: -0.55 * magnitude,
        };
      }
      break;
    }
    case 'setSubsidy': {
      const prev = government.subsidies[action.sector];
      const delta = action.value - prev;
      const magnitude = Math.abs(delta) / 5;
      if (delta > 1e-6) {
        base = {
          satisfaction: 0.5 * magnitude,
          treasury: -11 * magnitude,
          growth: 0.45 * magnitude,
        };
      } else if (delta < -1e-6) {
        base = {
          satisfaction: -0.5 * magnitude,
          treasury: 11 * magnitude,
          growth: -0.45 * magnitude,
        };
      }
      break;
    }
    case 'setWelfare': {
      if (action.value !== government.welfareEnabled) {
        base = action.value
          ? { satisfaction: 0.9, treasury: -18, growth: 0.12 }
          : { satisfaction: -0.9, treasury: 18, growth: -0.12 };
      }
      break;
    }
    case 'setPublicWorks': {
      if (action.value !== government.publicWorksActive) {
        base = action.value
          ? { satisfaction: 0.35, treasury: -22, growth: 0.8 }
          : { satisfaction: -0.35, treasury: 22, growth: -0.8 };
      }
      break;
    }
  }

  return formatImpactHint(withRecentAdjustment(base, card));
}

export function buildPolicyRecommendation(
  card: PolicyExperimentCard,
  government: GovernmentState,
): PolicyRecommendation | null {
  if (card.status === 'pending' || !card.metrics) {
    return null;
  }

  const satDrop = card.metrics.satisfactionDelta <= -0.8;
  const popDrop = card.metrics.populationDelta < 0;
  const treasuryStress = card.metrics.treasuryDelta <= -60 && card.metrics.satisfactionDelta <= 0;
  const gdpDrop = card.metrics.gdpDeltaPercent <= -2;

  if (satDrop || popDrop) {
    if (card.type === 'tax') {
      const target = clampRate(government.taxRate - 0.02);
      if (target < government.taxRate - 1e-6) {
        return {
          reason: '觀察窗內民心或人口轉弱，先小幅降稅舒緩需求壓力。',
          action: { type: 'setTaxRate', value: target },
          impactHint: estimateImpactHint({ type: 'setTaxRate', value: target }, government, card),
        };
      }
    }

    if (card.type === 'subsidy') {
      const sector: SectorType = card.sector ?? 'food';
      const target = Math.min(100, government.subsidies[sector] + 5);
      if (target > government.subsidies[sector] + 1e-6) {
        return {
          reason: '觀察窗內民生變差，先提高該產業補貼，補供給缺口。',
          action: { type: 'setSubsidy', sector, value: target },
          impactHint: estimateImpactHint({ type: 'setSubsidy', sector, value: target }, government, card),
        };
      }
    }

    if (!government.welfareEnabled) {
      return {
        reason: '民生壓力偏高，建議先開啟福利緩和底層購買力。',
        action: { type: 'setWelfare', value: true },
        impactHint: estimateImpactHint({ type: 'setWelfare', value: true }, government, card),
      };
    }
  }

  if (treasuryStress) {
    const target = clampRate(government.taxRate + 0.02);
    if (target > government.taxRate + 1e-6) {
      return {
        reason: '觀察窗內國庫惡化明顯，建議小幅升稅回補財政。',
        action: { type: 'setTaxRate', value: target },
        impactHint: estimateImpactHint({ type: 'setTaxRate', value: target }, government, card),
      };
    }
  }

  if (gdpDrop) {
    if (!government.publicWorksActive) {
      return {
        reason: '觀察窗內成長放緩，先啟用公共建設拉動總體生產力。',
        action: { type: 'setPublicWorks', value: true },
        impactHint: estimateImpactHint({ type: 'setPublicWorks', value: true }, government, card),
      };
    }
    const target = Math.min(100, government.subsidies.goods + 5);
    if (target > government.subsidies.goods + 1e-6) {
      return {
        reason: '成長仍偏弱，建議提高商品補貼擴大中間財供應。',
        action: { type: 'setSubsidy', sector: 'goods', value: target },
        impactHint: estimateImpactHint({ type: 'setSubsidy', sector: 'goods', value: target }, government, card),
      };
    }
  }

  return null;
}
