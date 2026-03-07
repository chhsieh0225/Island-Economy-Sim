import { CONFIG } from '../config';
import type { SectorType } from '../types';
import { te } from './engineI18n';

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

const PROFILES: Record<EconomicCalibrationProfileId, Omit<EconomicCalibrationProfile, 'label' | 'description' | 'sourceSummary'> & { _labelKey: string; _descKey: string; _sourceKey: string }> = {
  baseline: {
    id: 'baseline',
    _labelKey: 'calibration.profile.balanced.label',
    _descKey: 'calibration.profile.balanced.description',
    _sourceKey: 'calibration.profile.balanced.source',
    productionLaborElasticity: { ...CONFIG.PRODUCTION_LABOR_ELASTICITY },
    tatonnementGain: CONFIG.PRICE_ELASTICITY,
    priceSmoothing: CONFIG.PRICE_SMOOTHING,
    lesSubsistenceMultiplier: 1.0,
    lesMinDemandWeight: 0.2,
  },
  academic: {
    id: 'academic',
    _labelKey: 'calibration.profile.academic.label',
    _descKey: 'calibration.profile.academic.description',
    _sourceKey: 'calibration.profile.academic.source',
    productionLaborElasticity: { food: 0.92, goods: 0.86, services: 0.82 },
    tatonnementGain: 0.035,
    priceSmoothing: 0.78,
    lesSubsistenceMultiplier: 1.03,
    lesMinDemandWeight: 0.16,
  },
};

const REFERENCE_KEYS = [
  'alpha_food',
  'alpha_goods',
  'alpha_services',
  'tatonnement_gain',
  'price_smoothing',
  'les_subsistence',
] as const;

const REFERENCE_RANGES: Record<string, string> = {
  alpha_food: '0.85 - 1.00',
  alpha_goods: '0.75 - 0.95',
  alpha_services: '0.70 - 0.95',
  tatonnement_gain: '0.02 - 0.08 / turn',
  price_smoothing: '0.55 - 0.85',
  les_subsistence: '0.90 - 1.10',
};

export function getEconomicCalibrationReferences(): EconomicCalibrationReference[] {
  return REFERENCE_KEYS.map(key => ({
    key,
    label: te(`calibration.ref.${key}.label`),
    range: REFERENCE_RANGES[key],
    source: te(`calibration.ref.${key}.source`),
  }));
}

function resolveProfile(raw: (typeof PROFILES)[EconomicCalibrationProfileId]): EconomicCalibrationProfile {
  const { _labelKey, _descKey, _sourceKey, ...rest } = raw;
  return {
    ...rest,
    label: te(_labelKey),
    description: te(_descKey),
    sourceSummary: te(_sourceKey),
  };
}

export function getEconomicCalibrationProfiles(): EconomicCalibrationProfile[] {
  return [resolveProfile(PROFILES.baseline), resolveProfile(PROFILES.academic)];
}

export function getEconomicCalibrationProfile(
  id: EconomicCalibrationProfileId,
): EconomicCalibrationProfile {
  return resolveProfile(PROFILES[id]);
}
