import { CONFIG } from '../config';
import type {
  AgeGroup,
  AgentGoalType,
  AgentLifeEvent,
  SectorType,
  AgentState,
  Gender,
} from '../types';
import { SECTORS } from '../types';
import {
  DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID,
  getEconomicCalibrationProfile,
  type EconomicCalibrationProfile,
} from './economicCalibration';
import type { Market } from './Market';
import type { RNG } from './RNG';
import type { AgentContext, GoalWeights } from './agent/agentContext';
import { computeProductionOutput, computeSellOrder } from './agent/productionStrategy';
import { computeBuyOrders, computeConsumption, computeCashReserveTarget } from './agent/demandStrategy';
import { chooseGoalType, evaluateJobSwitch } from './agent/decisionStrategy';
import { computeHouseholdBanking } from './agent/bankingStrategy';

export interface AgentOptions {
  age?: number;
  maxAge?: number;
  intelligence?: number;
  baseLuck?: number;
  gender?: Gender;
  familyId?: number;
  goalType?: AgentGoalType;
  getEconomicCalibration?: () => EconomicCalibrationProfile;
}

export class Agent {
  id: number;
  name: string;
  sector: SectorType;
  money: number;
  savings: number;
  inventory: Record<SectorType, number>;
  health: number;
  satisfaction: number;
  productivity: number;
  alive: boolean;
  lowIncomeTurns: number;
  incomeHistory: number[];
  lastNetIncome: number;
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
  private _outputThisTurn: number = 0;
  private readonly getEconomicCalibration: () => EconomicCalibrationProfile;

  constructor(id: number, name: string, sector: SectorType, rng: RNG, options?: AgentOptions) {
    this.id = id;
    this.name = name;
    this.sector = sector;
    this.money = CONFIG.INITIAL_MONEY;
    this.savings = 0;
    this.inventory = { food: 2, goods: 1, services: 1 };
    this.health = 100;
    this.satisfaction = 100;
    this.alive = true;
    this.lowIncomeTurns = 0;
    this.incomeHistory = [];
    this.lastNetIncome = 0;
    this.turnsInSector = 0;

    this.totalSwitches = 0;
    this.switchHistory = [sector];
    this.familyId = options?.familyId ?? id;
    this.lifeEvents = [];
    this.getEconomicCalibration = options?.getEconomicCalibration ?? (
      () => getEconomicCalibrationProfile(DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID)
    );

    this.gender = options?.gender ?? (rng.next() < 0.5 ? 'M' : 'F');
    this.age = options?.age ?? rng.nextInt(CONFIG.MIN_STARTING_AGE, CONFIG.MAX_STARTING_AGE);
    const rawMaxAge = options?.maxAge ?? rng.nextInt(CONFIG.MIN_LIFESPAN, CONFIG.MAX_LIFESPAN);
    this.maxAge = Math.max(rawMaxAge, this.age + 120);
    this.goalType = options?.goalType ?? chooseGoalType(this.age, rng);
    this.intelligence = options?.intelligence ?? Math.max(
      CONFIG.INTELLIGENCE_MIN,
      Math.min(CONFIG.INTELLIGENCE_MAX, Math.round(rng.nextGaussian(CONFIG.INTELLIGENCE_MEAN, CONFIG.INTELLIGENCE_STDDEV)))
    );
    this.baseLuck = options?.baseLuck ?? (rng.next() * (CONFIG.LUCK_BASE_MAX - CONFIG.LUCK_BASE_MIN) + CONFIG.LUCK_BASE_MIN);

    const baseProductivity = Math.max(0.5, Math.min(1.5, rng.nextGaussian(1.0, 0.2)));
    this.productivity = baseProductivity * (1 + (this.intelligence / CONFIG.INTELLIGENCE_MEAN - 1) * CONFIG.INTELLIGENCE_PRODUCTIVITY_WEIGHT);
  }

  // --- Read-only computed properties ---

  get effectiveProductivity(): number {
    if (this.turnsInSector < 2) return this.productivity * CONFIG.JOB_SWITCH_PRODUCTIVITY_PENALTY;
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
    const reduction = 0.08 + this.intelligenceDecisionFactor * 0.84;
    return Math.max(0.04, CONFIG.INTELLIGENCE_DECISION_NOISE_BASE * (1 - reduction));
  }

  get isOld(): boolean { return this.age >= this.maxAge; }
  get isDead(): boolean { return this.health <= CONFIG.DEATH_HEALTH_THRESHOLD; }

  get shouldLeave(): boolean {
    return this.satisfaction <= CONFIG.LEAVE_SATISFACTION_THRESHOLD && this.turnsInSector > 5;
  }

  get leaveProbability(): number {
    const satGap = Math.max(0, CONFIG.LEAVE_SATISFACTION_THRESHOLD - this.satisfaction);
    const satStress = Math.min(1, satGap / Math.max(1, CONFIG.LEAVE_SATISFACTION_THRESHOLD));
    const tenureStress = Math.min(1, Math.max(0, (this.turnsInSector - 5) / 8));
    const incomeStress = Math.min(1, this.lowIncomeTurns / 8);
    const healthStress = this.health < 35 ? (35 - this.health) / 35 : 0;

    const p = CONFIG.LEAVE_BASE_PROBABILITY
      + satStress * 0.26
      + tenureStress * 0.08
      + incomeStress * 0.05
      + healthStress * 0.04;

    return Math.max(0, Math.min(CONFIG.LEAVE_MAX_PROBABILITY, p));
  }

  get outputThisTurn(): number { return this._outputThisTurn; }

  // --- Context builder ---

  private buildContext(): AgentContext {
    return {
      sector: this.sector,
      money: this.money,
      savings: this.savings,
      inventory: { ...this.inventory },
      health: this.health,
      satisfaction: this.satisfaction,
      effectiveProductivity: this.effectiveProductivity,
      productivity: this.productivity,
      alive: this.alive,
      lowIncomeTurns: this.lowIncomeTurns,
      turnsInSector: this.turnsInSector,
      age: this.age,
      ageGroup: this.ageGroup,
      goalType: this.goalType,
      intelligence: this.intelligence,
      totalSwitches: this.totalSwitches,
      switchHistory: [...this.switchHistory],
      desperation: this.desperation,
      luckFactor: this.luckFactor,
      incomeThisTurn: this._incomeThisTurn,
      spentThisTurn: this._spentThisTurn,
      intelligenceDecisionFactor: this.intelligenceDecisionFactor,
      decisionNoiseAmplitude: this.decisionNoiseAmplitude,
      goalWeights: this.goalWeights,
      calibration: this.getEconomicCalibration(),
    };
  }

  // --- Delegating methods ---

  rollTurnLuck(rng: RNG): void {
    this._outputThisTurn = 0;
    this._currentLuck = this.baseLuck + (rng.next() * 2 - 1) * CONFIG.LUCK_TURN_RANGE;
  }

  produce(subsidyMultiplier: number, publicWorksBoost: number, laborScale: number = 1): void {
    const output = computeProductionOutput(
      this.sector, this.effectiveProductivity, subsidyMultiplier, publicWorksBoost, this.luckFactor, laborScale,
    );
    this._outputThisTurn += output;
    this.inventory[this.sector] += output;
  }

  postSellOrders(market: Market): void {
    const ctx = this.buildContext();
    const order = computeSellOrder(ctx, this.id, market.getPrice(this.sector));
    if (order) market.addSellOrder(order);
  }

  postBuyOrders(
    market: Market,
    demandModifiers?: Partial<Record<SectorType, number>>,
    allowedSectors: SectorType[] = SECTORS,
  ): void {
    this._incomeThisTurn = 0;
    this._spentThisTurn = 0;

    const reserve = computeCashReserveTarget(this.buildContext());
    if (this.money < reserve && this.savings > 0) {
      const withdrawal = Math.max(0, Math.min(this.savings, reserve - this.money));
      this.savings -= withdrawal;
      this.money += withdrawal;
    }

    const ctx = this.buildContext();
    const marketPrices: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
    for (const sector of SECTORS) {
      marketPrices[sector] = market.getPrice(sector);
    }

    const orders = computeBuyOrders(ctx, this.id, marketPrices, demandModifiers, allowedSectors);
    for (const order of orders) {
      market.addBuyOrder(order);
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

  consumeNeeds(
    demandMultipliers?: Partial<Record<SectorType, number>>,
    allowedSectors: SectorType[] = SECTORS,
  ): { unmetNeeds: SectorType[]; healthDelta: number; satisfactionDelta: number } {
    const ctx = this.buildContext();
    const result = computeConsumption(ctx, demandMultipliers, allowedSectors);

    for (const sector of SECTORS) {
      if (result.inventoryConsumed[sector] > 0) {
        if (ctx.inventory[sector] >= result.inventoryConsumed[sector]) {
          this.inventory[sector] -= result.inventoryConsumed[sector];
        } else {
          this.inventory[sector] = 0;
        }
      }
    }

    this.health = result.newHealth;
    this.satisfaction = result.newSatisfaction;
    return {
      unmetNeeds: result.unmetNeeds,
      healthDelta: result.healthDelta,
      satisfactionDelta: result.satisfactionDelta,
    };
  }

  recordIncome(): void {
    this.lastNetIncome = this._incomeThisTurn - this._spentThisTurn;
    this.incomeHistory.push(this._incomeThisTurn);
    if (this.incomeHistory.length > 10) {
      this.incomeHistory.shift();
    }
  }

  evaluateJob(
    marketPrices: Record<SectorType, number>,
    rng: RNG,
    allowedSectors: SectorType[] = SECTORS,
  ): SectorType | null {
    this.turnsInSector++;
    const ctx = this.buildContext();
    const result = evaluateJobSwitch(ctx, marketPrices, rng, allowedSectors);
    this.lowIncomeTurns = result.newLowIncomeTurns;
    return result.switchTo;
  }

  switchJob(newSector: SectorType): void {
    this.money -= CONFIG.JOB_SWITCH_COST;
    this._spentThisTurn += CONFIG.JOB_SWITCH_COST;
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
    this._spentThisTurn += tax;
    return tax;
  }

  receiveWelfare(amount: number): void {
    this.money += amount;
    this._incomeThisTurn += amount;
  }

  runHouseholdBanking(policyRateAnnual: number = CONFIG.MONETARY_POLICY_RATE_DEFAULT): number {
    const prevSatisfaction = this.satisfaction;
    const ctx = this.buildContext();
    const result = computeHouseholdBanking(ctx, policyRateAnnual);

    if (result.withdrawal > 0) {
      this.savings -= result.withdrawal;
      this.money += result.withdrawal;
    }
    if (result.deposit > 0) {
      this.money -= result.deposit;
      this.savings += result.deposit;
    }
    if (result.interest > 0) {
      this.savings += result.interest;
      this.money += result.interest;
      this._incomeThisTurn += result.interest;
    }

    this.lastNetIncome = this._incomeThisTurn - this._spentThisTurn;

    if (result.satisfactionDelta > 0) {
      this.satisfaction = Math.min(100, this.satisfaction + result.satisfactionDelta);
    }

    return this.satisfaction - prevSatisfaction;
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

  toState(): AgentState {
    return {
      id: this.id,
      name: this.name,
      sector: this.sector,
      money: Math.round(this.money * 100) / 100,
      savings: Math.round(this.savings * 100) / 100,
      inventory: { ...this.inventory },
      health: Math.round(this.health * 10) / 10,
      satisfaction: Math.round(this.satisfaction * 10) / 10,
      productivity: Math.round(this.productivity * 100) / 100,
      alive: this.alive,
      lowIncomeTurns: this.lowIncomeTurns,
      incomeHistory: [...this.incomeHistory],
      lastNetIncome: Math.round(this.lastNetIncome * 100) / 100,
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
