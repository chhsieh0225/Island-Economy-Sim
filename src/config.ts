import type { SectorType, AgeGroup, EconomyStage } from './types';

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

  // Production price-response (supply elasticity)
  PRODUCTION_BREAK_EVEN_RATIO: 0.6,       // fraction of initial price = "cost of production"
  PRODUCTION_MIN_PRICE_RESPONSE: 0.3,     // minimum production factor when price collapses

  // Cobb-Douglas labor elasticity by sector (Y_s ~ L_s^alpha_s, alpha_s < 1 => diminishing returns)
  PRODUCTION_LABOR_ELASTICITY: {
    food: 0.95,
    goods: 0.9,
    services: 0.9,
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
  PRICE_DOWNWARD_STICKINESS: 0.5,  // downward max step = base step × this ratio (prices drop slower than they rise)

  // Agent trading behavior
  SELL_PRICE_DISCOUNT: 0.9,   // willing to sell at 90% of market price
  BUY_PRICE_PREMIUM: 1.2,     // willing to pay up to 120% of market price
  MAX_DESPERATION_PREMIUM: 2.0, // when health is critically low
  DEMAND_LOW_PRICE_BOOST_MAX: 1.5, // max demand multiplier when sector price is below market average

  // Job switching
  JOB_SWITCH_INCOME_RATIO: 0.6,   // switch if earning < 60% of best alternative
  JOB_SWITCH_THRESHOLD_TURNS: 3,  // must be underperforming for 3 turns
  JOB_SWITCH_COST: 20,            // money cost to retrain
  JOB_SWITCH_PRODUCTIVITY_PENALTY: 0.5, // productivity halved for first 2 turns
  JOB_SWITCH_RETURN_PENALTY: 2,   // extra turns required to return to a previous sector

  // Health & satisfaction
  HEALTH_DECAY_PER_UNMET_NEED: 3,
  SATISFACTION_DECAY_PER_UNMET_NEED: 3,
  HEALTH_RECOVERY_ALL_MET: 8,
  SATISFACTION_RECOVERY_ALL_MET: 4,
  HEALTH_RECOVERY_PARTIAL: 2,
  DEATH_HEALTH_THRESHOLD: 0,
  LEAVE_SATISFACTION_THRESHOLD: 10,
  LEAVE_BASE_PROBABILITY: 0.04,
  LEAVE_MAX_PROBABILITY: 0.45,
  LEAVE_MAX_SHARE_PER_TURN: 0.12,

  // Government
  DEFAULT_TAX_RATE: 0.10,
  MAX_TAX_RATE: 0.50,
  POLICY_DELAY_TURNS: 1,
  MONETARY_POLICY_RATE_DEFAULT: 0.018, // annualized policy rate
  MONETARY_POLICY_RATE_MIN: 0,
  MONETARY_POLICY_RATE_MAX: 0.08,
  MONETARY_POLICY_NEUTRAL_RATE: 0.025,
  MONETARY_RATE_TATONNEMENT_SENSITIVITY: 5.2,
  MONETARY_LIQUIDITY_TATONNEMENT_BONUS: 0.1,
  MONETARY_MAX_PRICE_STEP_BASE: 0.24,
  MONETARY_MAX_PRICE_STEP_LIQUIDITY: 0.18,
  MONETARY_MAX_PRICE_STEP_RATE_SENSITIVITY: 1.4,
  MONETARY_LIQUIDITY_TARGET_PERCENTILE: 0.35,
  MONETARY_LIQUIDITY_TRANSFER_PER_AGENT: 2.5,
  MONETARY_LIQUIDITY_SAT_BOOST: 0.35,
  WELFARE_THRESHOLD_PERCENTILE: 0.25, // bottom 25% get welfare
  WELFARE_AMOUNT: 5,
  PUBLIC_WORKS_COST_PER_TURN: 50,
  PUBLIC_WORKS_PRODUCTIVITY_BOOST: 0.1,
  // Automatic fiscal stabilizers (emergency welfare when economy is in distress)
  AUTO_STABILIZER_SAT_THRESHOLD: 35,     // avg satisfaction below which auto-welfare triggers
  AUTO_STABILIZER_MAX_AMOUNT: 10,        // max welfare per eligible agent per turn
  AUTO_STABILIZER_PERCENTILE: 0.50,      // bottom 50% of population by money receive support

  // Government strategic stockpile (buffer stock)
  STOCKPILE_BUY_THRESHOLD: 0.8,         // buy when price < initial_price × this
  STOCKPILE_SELL_THRESHOLD: 1.3,        // sell when price > initial_price × this
  STOCKPILE_MAX_BUY_PER_TURN: 5,       // max qty to buy per sector per turn
  STOCKPILE_MAX_SELL_PER_TURN: 5,      // max qty to sell per sector per turn
  STOCKPILE_MAX_CAPACITY: 50,          // max stockpile per sector
  STOCKPILE_BUY_PRICE_PREMIUM: 1.1,    // willing to pay 10% above market
  STOCKPILE_SELL_PRICE_DISCOUNT: 0.9,   // willing to sell 10% below market
  STOCKPILE_MAINTENANCE_COST: 3,        // treasury cost per turn when enabled
  STOCKPILE_SPOILAGE_RATE: 0.05,       // 5% stockpile decays per turn

  // History
  MAX_HISTORY_LENGTH: 200,

  // Event pacing
  RANDOM_EVENT_PROBABILITY_MULTIPLIER: 0.5,
  RANDOM_EVENT_COOLDOWN_TURNS: 2,
  DECISION_EVENT_COOLDOWN_TURNS: 4,
  EVENT_CHAIN_SIGNAL_TURNS: 5,
  EVENT_CHAIN_MAX_RANDOM_BONUS: 0.07,
  EVENT_CHAIN_MAX_DECISION_BONUS: 0.05,

  // Auto-play speeds (ms per turn)
  AUTO_PLAY_SPEEDS: {
    slow: 2000,
    medium: 1000,
    fast: 300,
  } as Record<string, number>,

  // Demographics
  BIRTH_BASE_PROBABILITY: 0.08,
  BIRTH_CAPACITY_FACTOR: 200,
  /** Average satisfaction that gives a 1× fertility multiplier; below → penalty, above → bonus */
  BIRTH_SATISFACTION_NEUTRAL: 50,
  /** Max fertility multiplier from high satisfaction (e.g. 1.3 = +30%) */
  BIRTH_SATISFACTION_MAX_MULT: 1.3,
  /** Min fertility multiplier from very low satisfaction (e.g. 0.4 = −60%) */
  BIRTH_SATISFACTION_MIN_MULT: 0.4,
  BIRTH_MIN_REPRO_AGE: 216,  // 18 years — minimum reproductive age
  BIRTH_MAX_REPRO_AGE: 528,  // 44 years — maximum reproductive age
  BIRTH_MAX_PER_TURN: 5,
  NEWBORN_STARTING_AGE: 12,  // 1 year old
  WORKING_AGE: 216,          // 18 years old
  MIN_STARTING_AGE: 216,     // 18 years in turns (months)
  MAX_STARTING_AGE: 480,     // 40 years
  MIN_LIFESPAN: 600,         // 50 years
  MAX_LIFESPAN: 960,         // 80 years
  AGE_HEALTH_DECAY_START: 540,  // 45 years
  AGE_HEALTH_DECAY_RATE: 0.2,
  CAREGIVER_PRODUCTIVITY_PENALTY_PER_CHILD: 0.06,
  CAREGIVER_PRODUCTIVITY_PENALTY_MAX: 0.3,
  SENIOR_DEPENDENCY_AGE: 720, // 60 years
  LABOR_FORCE_HEALTH_THRESHOLD: 25,

  // Progressive economy stages
  PROGRESSIVE_ECONOMY_ENABLED: true,
  STAGE_INDUSTRIAL_MIN_TURN: 12,
  STAGE_INDUSTRIAL_MIN_FOOD_COVERAGE: 1.05,
  STAGE_SERVICE_MIN_TURN: 24,
  STAGE_SERVICE_MIN_GOODS_WORKER_SHARE: 0.12,
  STAGE_SERVICE_MIN_AVG_SATISFACTION: 55,
  STAGE_NEED_MULTIPLIERS: {
    agriculture: { food: 1.0, goods: 0.18, services: 0.12 },
    industrial: { food: 1.0, goods: 0.72, services: 0.38 },
    service: { food: 1.0, goods: 1.0, services: 1.0 },
  } as Record<EconomyStage, Record<SectorType, number>>,
  STAGE_TRANSITION_RAMP_TURNS: {
    industrial: 8,
    service: 10,
  } as Record<Exclude<EconomyStage, 'agriculture'>, number>,

  // Intelligence
  INTELLIGENCE_MEAN: 100,
  INTELLIGENCE_STDDEV: 15,
  INTELLIGENCE_MIN: 55,
  INTELLIGENCE_MAX: 145,
  INTELLIGENCE_PRODUCTIVITY_WEIGHT: 0.3,
  INTELLIGENCE_JOB_EVAL_WEIGHT: 0.5,
  INTELLIGENCE_DECISION_NOISE_BASE: 0.45,
  INTELLIGENCE_SWITCH_MARGIN_BASE: 0.12,
  INTELLIGENCE_SWITCH_THRESHOLD_BONUS: 1,

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

  // Goal-oriented agent behavior
  GOAL_BUFFER_BASE_TURNS: 1.1,
  GOAL_BUFFER_SURVIVAL_WEIGHT: 1.4,
  GOAL_BUFFER_HAPPINESS_WEIGHT: 0.5,
  GOAL_BUFFER_IQ_WEIGHT: 0.6,
  GOAL_EMERGENCY_CASH: 30,
  GOAL_RESERVE_SURVIVAL_WEIGHT: 55,
  GOAL_RESERVE_WEALTH_WEIGHT: 45,
  GOAL_SPENDING_PROPENSITY_BASE: 0.7,

  // Family support
  FAMILY_SUPPORT_POOR_LINE: 40,
  FAMILY_SUPPORT_DONOR_LINE: 180,
  FAMILY_SUPPORT_TRANSFER_MAX: 6,

  // Household banking & financial sentiment
  BANK_DEPOSIT_RATE: 0.22, // share of excess cash moved into savings each turn
  BANK_INTEREST_RATE_PER_TURN: 0.0012, // floor monthly interest
  BANK_INTEREST_SPREAD_PER_TURN: 0.0002, // commercial spread above policy-rate passthrough
  BANK_WITHDRAW_TRIGGER_RATIO: 0.55, // auto-withdraw when cash falls below reserve * ratio
  BANK_SAT_INCOME_NORMALIZER: 30, // net income scale for satisfaction gain
  BANK_SAT_INCOME_MAX: 0.8,
  BANK_SAT_SECURITY_MAX: 0.6,

  // Victory / End Conditions
  VICTORY_GDP_THRESHOLD: 50000,       // cumulative GDP milestone
  VICTORY_TREASURY_THRESHOLD: 10000,  // treasury milestone
  MAX_TURNS: 600,                     // 50 years = 600 months
} as const;
