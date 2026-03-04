import { CONFIG } from '../config';
import type { SectorType } from '../types';

export type EconomicCalibrationProfileId = 'baseline' | 'academic';

export interface EconomicCalibrationProfile {
  id: EconomicCalibrationProfileId;
  label: string;
  description: string;
  sourceSummary: string;
  productionLaborElasticity: Record<SectorType, number>;
  tatonnementGain: number;
  priceSmoothing: number;
  lesSubsistenceMultiplier: number;
  lesMinDemandWeight: number;
}

export interface EconomicCalibrationReference {
  key: string;
  label: string;
  range: string;
  source: string;
}

export const DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID: EconomicCalibrationProfileId = 'baseline';

const PROFILES: Record<EconomicCalibrationProfileId, EconomicCalibrationProfile> = {
  baseline: {
    id: 'baseline',
    label: '平衡模式 Balanced',
    description: '保留原遊戲節奏，價格和需求反應較直觀，適合一般遊玩。',
    sourceSummary: '以目前遊戲校準為主，保留標準微觀框架但偏重可玩性。',
    productionLaborElasticity: { ...CONFIG.PRODUCTION_LABOR_ELASTICITY },
    tatonnementGain: CONFIG.PRICE_ELASTICITY,
    priceSmoothing: CONFIG.PRICE_SMOOTHING,
    lesSubsistenceMultiplier: 1.0,
    lesMinDemandWeight: 0.2,
  },
  academic: {
    id: 'academic',
    label: '學術模式 Academic',
    description: '參數貼近常見教科書/實證區間，價格與配置調整較保守。',
    sourceSummary: '參考 Cobb-Douglas、Stone-Geary/LES、tatonnement 常見標定範圍。',
    productionLaborElasticity: { food: 0.92, goods: 0.86, services: 0.82 },
    tatonnementGain: 0.035,
    priceSmoothing: 0.78,
    lesSubsistenceMultiplier: 1.03,
    lesMinDemandWeight: 0.16,
  },
};

export const ECONOMIC_CALIBRATION_REFERENCES: EconomicCalibrationReference[] = [
  {
    key: 'alpha_food',
    label: '食物部門勞動彈性 α_food',
    range: '0.85 - 1.00',
    source: 'Cobb-Douglas 部門生產函數常見估計（農業接近常數報酬）。',
  },
  {
    key: 'alpha_goods',
    label: '商品部門勞動彈性 α_goods',
    range: '0.75 - 0.95',
    source: '製造部門常見遞減報酬估計區間。',
  },
  {
    key: 'alpha_services',
    label: '服務部門勞動彈性 α_services',
    range: '0.70 - 0.95',
    source: '服務部門受組織與需求限制，彈性常低於 1。',
  },
  {
    key: 'tatonnement_gain',
    label: '價格調整速度 k',
    range: '0.02 - 0.08 / turn',
    source: '離散時間 tatonnement 常用穩定範圍。',
  },
  {
    key: 'price_smoothing',
    label: '價格平滑係數 λ',
    range: '0.55 - 0.85',
    source: '短期黏著價格設定，避免單期超調。',
  },
  {
    key: 'les_subsistence',
    label: 'LES 最低需求係數',
    range: '0.90 - 1.10',
    source: 'Stone-Geary 最低消費項比例化校準。',
  },
];

export function getEconomicCalibrationProfiles(): EconomicCalibrationProfile[] {
  return [PROFILES.baseline, PROFILES.academic];
}

export function getEconomicCalibrationProfile(
  id: EconomicCalibrationProfileId,
): EconomicCalibrationProfile {
  return PROFILES[id];
}
