import type { SectorType, AgeGroup } from './types';

export const CONFIG = {
  INITIAL_POPULATION: 100,
  INITIAL_MONEY: 100,

  // How much each person consumes per turn
  CONSUMPTION: {
    food: 1.0,
    goods: 0.5,
    services: 0.3,
  } as Record<SectorType, number>,

  // Base units produced per worker per turn
  // Balanced so ~33 workers per sector can satisfy 100 people's consumption
  BASE_PRODUCTIVITY: {
    food: 3.2,
    goods: 1.7,
    services: 1.2,
  } as Record<SectorType, number>,

  // Fraction of unsold inventory that spoils each turn
  INVENTORY_SPOILAGE_RATE: 0.5,

  // Starting market prices
  INITIAL_PRICES: {
    food: 10,
    goods: 15,
    services: 12,
  } as Record<SectorType, number>,

  // Market dynamics
  PRICE_ELASTICITY: 0.05,
  PRICE_SMOOTHING: 0.7,  // weight of new price vs old
  MIN_PRICE: 1,
  MAX_PRICE: 200,

  // Agent trading behavior
  SELL_PRICE_DISCOUNT: 0.9,   // willing to sell at 90% of market price
  BUY_PRICE_PREMIUM: 1.2,     // willing to pay up to 120% of market price
  MAX_DESPERATION_PREMIUM: 2.0, // when health is critically low

  // Job switching
  JOB_SWITCH_INCOME_RATIO: 0.6,   // switch if earning < 60% of best alternative
  JOB_SWITCH_THRESHOLD_TURNS: 3,  // must be underperforming for 3 turns
  JOB_SWITCH_COST: 20,            // money cost to retrain
  JOB_SWITCH_PRODUCTIVITY_PENALTY: 0.5, // productivity halved for first 2 turns
  JOB_SWITCH_RETURN_PENALTY: 2,   // extra turns required to return to a previous sector

  // Health & satisfaction
  HEALTH_DECAY_PER_UNMET_NEED: 4,
  SATISFACTION_DECAY_PER_UNMET_NEED: 3,
  HEALTH_RECOVERY_ALL_MET: 6,
  SATISFACTION_RECOVERY_ALL_MET: 4,
  HEALTH_RECOVERY_PARTIAL: 2,
  DEATH_HEALTH_THRESHOLD: 0,
  LEAVE_SATISFACTION_THRESHOLD: 10,

  // Government
  DEFAULT_TAX_RATE: 0.10,
  MAX_TAX_RATE: 0.50,
  POLICY_DELAY_TURNS: 1,
  WELFARE_THRESHOLD_PERCENTILE: 0.25, // bottom 25% get welfare
  WELFARE_AMOUNT: 5,
  PUBLIC_WORKS_COST_PER_TURN: 50,
  PUBLIC_WORKS_PRODUCTIVITY_BOOST: 0.1,

  // History
  MAX_HISTORY_LENGTH: 200,

  // Auto-play speeds (ms per turn)
  AUTO_PLAY_SPEEDS: {
    slow: 2000,
    medium: 1000,
    fast: 300,
  } as Record<string, number>,

  // Demographics
  BIRTH_BASE_PROBABILITY: 0.03,
  BIRTH_CAPACITY_FACTOR: 150,
  BIRTH_MIN_REPRO_AGE: 216,  // 18 years — minimum reproductive age
  BIRTH_MAX_REPRO_AGE: 528,  // 44 years — maximum reproductive age
  BIRTH_MAX_PER_TURN: 3,
  MIN_STARTING_AGE: 216,     // 18 years in turns (months)
  MAX_STARTING_AGE: 660,     // 55 years
  MIN_LIFESPAN: 600,         // 50 years
  MAX_LIFESPAN: 960,         // 80 years
  AGE_HEALTH_DECAY_START: 540,  // 45 years
  AGE_HEALTH_DECAY_RATE: 0.5,

  // Intelligence
  INTELLIGENCE_MEAN: 100,
  INTELLIGENCE_STDDEV: 15,
  INTELLIGENCE_MIN: 55,
  INTELLIGENCE_MAX: 145,
  INTELLIGENCE_PRODUCTIVITY_WEIGHT: 0.3,
  INTELLIGENCE_JOB_EVAL_WEIGHT: 0.5,

  // Luck
  LUCK_BASE_MIN: -0.1,
  LUCK_BASE_MAX: 0.1,
  LUCK_TURN_RANGE: 0.2,
  LUCK_PRODUCTION_WEIGHT: 0.15,

  // Age-layered demand profile
  AGE_GROUP_MAX_AGE: {
    youth: 359,    // < 30 years
    adult: 719,    // < 60 years
  } as const,
  CONSUMPTION_AGE_MULTIPLIERS: {
    youth: { food: 1.0, goods: 1.05, services: 1.2 },
    adult: { food: 1.0, goods: 1.0, services: 1.0 },
    senior: { food: 1.1, goods: 0.9, services: 1.25 },
  } as Record<AgeGroup, Record<SectorType, number>>,

  // Family support
  FAMILY_SUPPORT_POOR_LINE: 40,
  FAMILY_SUPPORT_DONOR_LINE: 180,
  FAMILY_SUPPORT_TRANSFER_MAX: 6,

  // Victory / End Conditions
  VICTORY_GDP_THRESHOLD: 50000,       // cumulative GDP milestone
  VICTORY_TREASURY_THRESHOLD: 10000,  // treasury milestone
  MAX_TURNS: 600,                     // 50 years = 600 months
} as const;
