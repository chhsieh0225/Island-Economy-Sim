import { CONFIG } from '../config';
import type {
  AgeGroup,
  AgentGoalType,
  AgentLifeEvent,
  SectorType,
  AgentState,
  Gender,
  SellOrder,
  BuyOrder,
} from '../types';
import { SECTORS } from '../types';
import type { Market } from './Market';
import type { RNG } from './RNG';

export interface AgentOptions {
  age?: number;
  maxAge?: number;
  intelligence?: number;
  baseLuck?: number;
  gender?: Gender;
  familyId?: number;
  goalType?: AgentGoalType;
}

interface GoalWeights {
  survival: number;
  wealth: number;
  happiness: number;
  stability: number;
}

function chooseGoalType(ageTurns: number, rng: RNG): AgentGoalType {
  // Age-biased aspiration distribution keeps the simulation diverse but plausible.
  const r = rng.next();
  const isYouth = ageTurns <= CONFIG.AGE_GROUP_MAX_AGE.youth;
  const isSenior = ageTurns > CONFIG.AGE_GROUP_MAX_AGE.adult;

  if (isSenior) {
    if (r < 0.45) return 'survival';
    if (r < 0.75) return 'happiness';
    if (r < 0.9) return 'balanced';
    return 'wealth';
  }

  if (isYouth) {
    if (r < 0.35) return 'wealth';
    if (r < 0.65) return 'happiness';
    if (r < 0.85) return 'balanced';
    return 'survival';
  }

  if (r < 0.28) return 'wealth';
  if (r < 0.50) return 'survival';
  if (r < 0.72) return 'happiness';
  return 'balanced';
}

export class Agent {
  id: number;
  name: string;
  sector: SectorType;
  money: number;
  inventory: Record<SectorType, number>;
  health: number;
  satisfaction: number;
  productivity: number;
  alive: boolean;
  lowIncomeTurns: number;
  incomeHistory: number[];
  turnsInSector: number;

  age: number;
  maxAge: number;
  intelligence: number;
  baseLuck: number;
  gender: Gender;
  causeOfDeath?: 'health' | 'age' | 'left';

  totalSwitches: number;
  switchHistory: SectorType[];
  familyId: number;
  goalType: AgentGoalType;
  lifeEvents: AgentLifeEvent[];

  private _incomeThisTurn: number = 0;
  private _spentThisTurn: number = 0;
  private _currentLuck: number = 0;

  constructor(id: number, name: string, sector: SectorType, rng: RNG, options?: AgentOptions) {
    this.id = id;
    this.name = name;
    this.sector = sector;
    this.money = CONFIG.INITIAL_MONEY;
    this.inventory = { food: 2, goods: 1, services: 1 };
    this.health = 100;
    this.satisfaction = 100;
    this.alive = true;
    this.lowIncomeTurns = 0;
    this.incomeHistory = [];
    this.turnsInSector = 0;

    this.totalSwitches = 0;
    this.switchHistory = [sector];
    this.familyId = options?.familyId ?? id;
    this.lifeEvents = [];

    this.gender = options?.gender ?? (rng.next() < 0.5 ? 'M' : 'F');
    this.age = options?.age ?? rng.nextInt(CONFIG.MIN_STARTING_AGE, CONFIG.MAX_STARTING_AGE);
    const rawMaxAge = options?.maxAge ?? rng.nextInt(CONFIG.MIN_LIFESPAN, CONFIG.MAX_LIFESPAN);
    this.maxAge = Math.max(rawMaxAge, this.age + 120); // at least 10 years remaining
    this.goalType = options?.goalType ?? chooseGoalType(this.age, rng);
    this.intelligence = options?.intelligence ?? Math.max(
      CONFIG.INTELLIGENCE_MIN,
      Math.min(CONFIG.INTELLIGENCE_MAX, Math.round(rng.nextGaussian(CONFIG.INTELLIGENCE_MEAN, CONFIG.INTELLIGENCE_STDDEV)))
    );
    this.baseLuck = options?.baseLuck ?? (rng.next() * (CONFIG.LUCK_BASE_MAX - CONFIG.LUCK_BASE_MIN) + CONFIG.LUCK_BASE_MIN);

    const baseProductivity = Math.max(0.5, Math.min(1.5, rng.nextGaussian(1.0, 0.2)));
    this.productivity = baseProductivity * (1 + (this.intelligence / CONFIG.INTELLIGENCE_MEAN - 1) * CONFIG.INTELLIGENCE_PRODUCTIVITY_WEIGHT);
  }

  get effectiveProductivity(): number {
    if (this.turnsInSector < 2) {
      return this.productivity * CONFIG.JOB_SWITCH_PRODUCTIVITY_PENALTY;
    }
    return this.productivity;
  }

  get desperation(): number {
    return Math.max(0, 1 - this.health / 50);
  }

  get luckFactor(): number {
    return 1 + this._currentLuck * CONFIG.LUCK_PRODUCTION_WEIGHT;
  }

  get ageGroup(): AgeGroup {
    if (this.age <= CONFIG.AGE_GROUP_MAX_AGE.youth) return 'youth';
    if (this.age <= CONFIG.AGE_GROUP_MAX_AGE.adult) return 'adult';
    return 'senior';
  }

  get goalWeights(): GoalWeights {
    switch (this.goalType) {
      case 'survival':
        return { survival: 0.56, wealth: 0.2, happiness: 0.1, stability: 0.14 };
      case 'wealth':
        return { survival: 0.2, wealth: 0.56, happiness: 0.1, stability: 0.14 };
      case 'happiness':
        return { survival: 0.2, wealth: 0.1, happiness: 0.56, stability: 0.14 };
      case 'balanced':
      default:
        return { survival: 0.31, wealth: 0.31, happiness: 0.24, stability: 0.14 };
    }
  }

  get intelligenceDecisionFactor(): number {
    const ratio = (this.intelligence - CONFIG.INTELLIGENCE_MIN) / (CONFIG.INTELLIGENCE_MAX - CONFIG.INTELLIGENCE_MIN);
    return Math.max(0, Math.min(1, ratio));
  }

  get decisionNoiseAmplitude(): number {
    // Higher IQ reduces evaluation noise and random mistakes.
    const reduction = 0.08 + this.intelligenceDecisionFactor * 0.84;
    return Math.max(0.04, CONFIG.INTELLIGENCE_DECISION_NOISE_BASE * (1 - reduction));
  }

  private getNeedForSector(sector: SectorType, demandMultiplier: number = 1): number {
    const base = CONFIG.CONSUMPTION[sector];
    const ageMult = CONFIG.CONSUMPTION_AGE_MULTIPLIERS[this.ageGroup][sector];
    return base * ageMult * demandMultiplier;
  }

  private getTargetBufferTurns(sector: SectorType): number {
    const weights = this.goalWeights;
    let turns =
      CONFIG.GOAL_BUFFER_BASE_TURNS +
      weights.survival * CONFIG.GOAL_BUFFER_SURVIVAL_WEIGHT +
      weights.happiness * CONFIG.GOAL_BUFFER_HAPPINESS_WEIGHT +
      this.intelligenceDecisionFactor * CONFIG.GOAL_BUFFER_IQ_WEIGHT;

    if (sector === 'food') turns += 0.45 * weights.survival;
    if (sector === 'services') turns += 0.35 * weights.happiness;
    if (this.health < 45) turns += 0.6;

    return Math.max(1, Math.min(4.2, turns));
  }

  private getSectorPriority(sector: SectorType): number {
    const weights = this.goalWeights;
    const healthPressure = this.health < 50 ? 0.45 : 0;
    const satPressure = this.satisfaction < 45 ? 0.35 : 0;

    switch (sector) {
      case 'food':
        return 1 + weights.survival * 1.0 + healthPressure;
      case 'goods':
        return 0.85 + weights.wealth * 0.7;
      case 'services':
        return 0.8 + weights.happiness * 0.95 + satPressure;
    }
  }

  private getSectorHappinessValue(sector: SectorType): number {
    switch (sector) {
      case 'food': return 0.58;
      case 'goods': return 0.7;
      case 'services': return 1.0;
    }
  }

  private getSectorSurvivalValue(sector: SectorType): number {
    switch (sector) {
      case 'food': return 1.0;
      case 'goods': return 0.52;
      case 'services': return 0.6;
    }
  }

  rollTurnLuck(rng: RNG): void {
    this._currentLuck = this.baseLuck + (rng.next() * 2 - 1) * CONFIG.LUCK_TURN_RANGE;
  }

  produce(subsidyMultiplier: number, publicWorksBoost: number): void {
    const baseOutput = CONFIG.BASE_PRODUCTIVITY[this.sector];
    const output = baseOutput * this.effectiveProductivity * subsidyMultiplier * (1 + publicWorksBoost) * this.luckFactor;
    this.inventory[this.sector] += Math.max(0, output);
  }

  postSellOrders(market: Market): void {
    const sector = this.sector;
    const available = this.inventory[sector];
    if (available <= 0) return;

    const keepQty = this.getNeedForSector(sector) * this.getTargetBufferTurns(sector);
    const sellQty = Math.max(0, available - keepQty);
    if (sellQty <= 0) return;

    const minPrice = market.getPrice(sector) * (CONFIG.SELL_PRICE_DISCOUNT + this.goalWeights.wealth * 0.05);
    const order: SellOrder = { agentId: this.id, sector, quantity: sellQty, minPrice };
    market.addSellOrder(order);
  }

  postBuyOrders(market: Market, demandModifiers?: Partial<Record<SectorType, number>>): void {
    this._incomeThisTurn = 0;
    this._spentThisTurn = 0;

    const weights = this.goalWeights;
    const reserve =
      CONFIG.GOAL_EMERGENCY_CASH +
      weights.survival * CONFIG.GOAL_RESERVE_SURVIVAL_WEIGHT +
      weights.wealth * CONFIG.GOAL_RESERVE_WEALTH_WEIGHT;
    let budgetPool = Math.max(0, this.money - reserve);

    const candidateSectors = SECTORS
      .filter(sector => sector !== this.sector)
      .sort((a, b) => this.getSectorPriority(b) - this.getSectorPriority(a));

    for (const sector of candidateSectors) {
      const demandMult = demandModifiers?.[sector] ?? 1;
      const targetStock = this.getNeedForSector(sector, demandMult) * this.getTargetBufferTurns(sector);
      const needed = targetStock - this.inventory[sector];
      if (needed <= 0) continue;

      const price = market.getPrice(sector);
      const priority = this.getSectorPriority(sector);
      const premiumMultiplier =
        CONFIG.BUY_PRICE_PREMIUM +
        this.desperation * (CONFIG.MAX_DESPERATION_PREMIUM - CONFIG.BUY_PRICE_PREMIUM) +
        (priority - 1) * 0.22;
      const maxPrice = price * Math.max(1.02, premiumMultiplier);

      // Goal-driven budgeting: happiness/survival spend more aggressively, wealth hoards cash.
      const spendingPropensity =
        CONFIG.GOAL_SPENDING_PROPENSITY_BASE +
        weights.happiness * 0.18 +
        weights.survival * 0.14 -
        weights.wealth * 0.14 +
        this.desperation * 0.22 +
        this.intelligenceDecisionFactor * 0.05;
      const sectorBudget = budgetPool * Math.max(0.25, Math.min(1, spendingPropensity)) * Math.min(1.2, priority);
      const canAfford = sectorBudget / Math.max(0.01, maxPrice);
      const quantity = Math.min(needed, canAfford);

      if (quantity > 0.01) {
        const order: BuyOrder = { agentId: this.id, sector, quantity, maxPrice };
        market.addBuyOrder(order);
        budgetPool = Math.max(0, budgetPool - quantity * maxPrice);
      }
    }
  }

  receiveMoney(amount: number): void {
    this.money += amount;
    this._incomeThisTurn += amount;
  }

  spendMoney(amount: number): void {
    this.money -= amount;
    this._spentThisTurn += amount;
  }

  receiveGoods(sector: SectorType, quantity: number): void {
    this.inventory[sector] += quantity;
  }

  removeGoods(sector: SectorType, quantity: number): void {
    this.inventory[sector] = Math.max(0, this.inventory[sector] - quantity);
  }

  consumeNeeds(): { unmetNeeds: SectorType[] } {
    const unmetNeeds: SectorType[] = [];

    for (const sector of SECTORS) {
      const required = this.getNeedForSector(sector);
      if (this.inventory[sector] >= required) {
        this.inventory[sector] -= required;
      } else {
        this.inventory[sector] = 0;
        unmetNeeds.push(sector);
      }
    }

    if (unmetNeeds.length === 0) {
      this.health = Math.min(100, this.health + CONFIG.HEALTH_RECOVERY_ALL_MET);
      this.satisfaction = Math.min(100, this.satisfaction + CONFIG.SATISFACTION_RECOVERY_ALL_MET);
    } else if (unmetNeeds.length < 3) {
      this.health = Math.min(100, this.health + CONFIG.HEALTH_RECOVERY_PARTIAL - CONFIG.HEALTH_DECAY_PER_UNMET_NEED * unmetNeeds.length);
      this.satisfaction -= CONFIG.SATISFACTION_DECAY_PER_UNMET_NEED * unmetNeeds.length;
    } else {
      this.health -= CONFIG.HEALTH_DECAY_PER_UNMET_NEED * unmetNeeds.length;
      this.satisfaction -= CONFIG.SATISFACTION_DECAY_PER_UNMET_NEED * unmetNeeds.length;
    }

    this.health = Math.max(0, Math.min(100, this.health));
    this.satisfaction = Math.max(0, Math.min(100, this.satisfaction));
    return { unmetNeeds };
  }

  recordIncome(): void {
    this.incomeHistory.push(this._incomeThisTurn);
    if (this.incomeHistory.length > 10) {
      this.incomeHistory.shift();
    }
  }

  private estimateSectorUtility(
    sector: SectorType,
    marketPrices: Record<SectorType, number>,
    maxIncomePotential: number,
  ): number {
    const weights = this.goalWeights;
    const incomePotential = marketPrices[sector] * CONFIG.BASE_PRODUCTIVITY[sector] * this.effectiveProductivity;
    const incomeScore = incomePotential / Math.max(0.01, maxIncomePotential);

    const survivalScore = this.getSectorSurvivalValue(sector);
    const happinessScore = this.getSectorHappinessValue(sector);
    const price = marketPrices[sector];
    const marketMean = (marketPrices.food + marketPrices.goods + marketPrices.services) / 3;
    const stabilityScore = Math.max(0, 1 - Math.abs(price - marketMean) / Math.max(1, marketMean * 1.8));

    return (
      weights.wealth * incomeScore +
      weights.survival * survivalScore +
      weights.happiness * happinessScore +
      weights.stability * stabilityScore
    );
  }

  evaluateJob(marketPrices: Record<SectorType, number>, rng: RNG): SectorType | null {
    this.turnsInSector++;
    if (this.turnsInSector < 4) return null;

    const maxIncomePotential = Math.max(
      ...SECTORS.map(s => marketPrices[s] * CONFIG.BASE_PRODUCTIVITY[s] * this.effectiveProductivity),
      0.01,
    );

    let bestSector: SectorType = this.sector;
    let bestEstimatedUtility = Number.NEGATIVE_INFINITY;
    let bestBaseUtility = Number.NEGATIVE_INFINITY;
    const utilities: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };

    for (const sector of SECTORS) {
      const baseUtility = this.estimateSectorUtility(sector, marketPrices, maxIncomePotential);
      utilities[sector] = baseUtility;

      const noise = (rng.next() * 2 - 1) * this.decisionNoiseAmplitude;
      const estimated = baseUtility + noise;
      if (estimated > bestEstimatedUtility) {
        bestEstimatedUtility = estimated;
        bestBaseUtility = baseUtility;
        bestSector = sector;
      }
    }

    const currentUtility = utilities[this.sector] + this.goalWeights.stability * 0.06;
    if (bestSector === this.sector) {
      this.lowIncomeTurns = Math.max(0, this.lowIncomeTurns - 1);
      return null;
    }

    const utilityGain = bestBaseUtility - currentUtility;
    const baseMargin =
      CONFIG.INTELLIGENCE_SWITCH_MARGIN_BASE +
      (1 - this.intelligenceDecisionFactor) * 0.16 +
      this.totalSwitches * 0.02 -
      this.goalWeights.wealth * 0.03;
    const requiredMargin = Math.max(0.02, baseMargin);

    if (utilityGain > requiredMargin) {
      this.lowIncomeTurns++;
    } else {
      this.lowIncomeTurns = Math.max(0, this.lowIncomeTurns - 1);
    }

    // Hysteresis: returning to a previously-held sector requires extra patience
    const returningToOld = this.switchHistory.includes(bestSector);
    const returnPenalty = returningToOld ? CONFIG.JOB_SWITCH_RETURN_PENALTY : 0;
    const thresholdReduction = Math.round(this.intelligenceDecisionFactor * CONFIG.INTELLIGENCE_SWITCH_THRESHOLD_BONUS);
    // Fatigue: each past switch makes future switches harder, IQ offsets part of it.
    const effectiveThreshold = Math.max(
      2,
      CONFIG.JOB_SWITCH_THRESHOLD_TURNS + returnPenalty + this.totalSwitches - thresholdReduction,
    );

    if (
      this.lowIncomeTurns >= effectiveThreshold &&
      this.money >= CONFIG.JOB_SWITCH_COST
    ) {
      return bestSector;
    }
    return null;
  }

  switchJob(newSector: SectorType): void {
    this.money -= CONFIG.JOB_SWITCH_COST;
    this.sector = newSector;
    this.turnsInSector = 0;
    this.lowIncomeTurns = 0;
    this.totalSwitches++;
    if (!this.switchHistory.includes(newSector)) {
      this.switchHistory.push(newSector);
    }
  }

  payTax(rate: number): number {
    const taxable = this._incomeThisTurn;
    const tax = Math.max(0, taxable * rate);
    this.money -= tax;
    return tax;
  }

  receiveWelfare(amount: number): void {
    this.money += amount;
  }

  ageOneTurn(): void {
    this.age++;
    if (this.age > CONFIG.AGE_HEALTH_DECAY_START) {
      const agePenalty = (this.age - CONFIG.AGE_HEALTH_DECAY_START) / (this.maxAge - CONFIG.AGE_HEALTH_DECAY_START);
      this.health -= CONFIG.AGE_HEALTH_DECAY_RATE * (1 + agePenalty);
      this.health = Math.max(0, this.health);
    }
  }

  shiftAge(turns: number): void {
    this.age = Math.max(CONFIG.MIN_STARTING_AGE, this.age + turns);
    this.maxAge = Math.max(this.maxAge, this.age + 120);
  }

  addLifeEvent(
    turn: number,
    category: AgentLifeEvent['category'],
    message: string,
    severity: AgentLifeEvent['severity'] = 'info',
  ): void {
    this.lifeEvents.push({ turn, category, message, severity });
    if (this.lifeEvents.length > 40) {
      this.lifeEvents.shift();
    }
  }

  get isOld(): boolean {
    return this.age >= this.maxAge;
  }

  get isDead(): boolean {
    return this.health <= CONFIG.DEATH_HEALTH_THRESHOLD;
  }

  get shouldLeave(): boolean {
    return this.satisfaction <= CONFIG.LEAVE_SATISFACTION_THRESHOLD && this.turnsInSector > 5;
  }

  toState(): AgentState {
    return {
      id: this.id,
      name: this.name,
      sector: this.sector,
      money: Math.round(this.money * 100) / 100,
      inventory: { ...this.inventory },
      health: Math.round(this.health * 10) / 10,
      satisfaction: Math.round(this.satisfaction * 10) / 10,
      productivity: Math.round(this.productivity * 100) / 100,
      alive: this.alive,
      lowIncomeTurns: this.lowIncomeTurns,
      incomeHistory: [...this.incomeHistory],
      turnsInSector: this.turnsInSector,
      age: this.age,
      maxAge: this.maxAge,
      intelligence: Math.round(this.intelligence),
      baseLuck: Math.round(this.baseLuck * 100) / 100,
      gender: this.gender,
      causeOfDeath: this.causeOfDeath,
      totalSwitches: this.totalSwitches,
      switchHistory: [...this.switchHistory],
      familyId: this.familyId,
      ageGroup: this.ageGroup,
      goalType: this.goalType,
      lifeEvents: [...this.lifeEvents],
    };
  }
}
