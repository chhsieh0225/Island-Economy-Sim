import { CONFIG } from '../config';
import type { SectorType, AgentState, Gender, SellOrder, BuyOrder } from '../types';
import { SECTORS } from '../types';
import type { Market } from './Market';
import type { RNG } from './RNG';

export interface AgentOptions {
  age?: number;
  maxAge?: number;
  intelligence?: number;
  baseLuck?: number;
  gender?: Gender;
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

    this.gender = options?.gender ?? (rng.next() < 0.5 ? 'M' : 'F');
    this.age = options?.age ?? rng.nextInt(CONFIG.MIN_STARTING_AGE, CONFIG.MAX_STARTING_AGE);
    const rawMaxAge = options?.maxAge ?? rng.nextInt(CONFIG.MIN_LIFESPAN, CONFIG.MAX_LIFESPAN);
    this.maxAge = Math.max(rawMaxAge, this.age + 120); // at least 10 years remaining
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

    const ownNeed = CONFIG.CONSUMPTION[sector];
    const sellQty = Math.max(0, available - ownNeed);
    if (sellQty <= 0) return;

    const minPrice = market.getPrice(sector) * CONFIG.SELL_PRICE_DISCOUNT;
    const order: SellOrder = { agentId: this.id, sector, quantity: sellQty, minPrice };
    market.addSellOrder(order);
  }

  postBuyOrders(market: Market, demandModifiers?: Partial<Record<SectorType, number>>): void {
    this._incomeThisTurn = 0;
    this._spentThisTurn = 0;

    for (const sector of SECTORS) {
      if (sector === this.sector) continue;
      const demandMult = demandModifiers?.[sector] ?? 1;
      const needed = CONFIG.CONSUMPTION[sector] * demandMult - this.inventory[sector];
      if (needed <= 0) continue;

      const price = market.getPrice(sector);
      const premiumMultiplier = CONFIG.BUY_PRICE_PREMIUM + this.desperation * (CONFIG.MAX_DESPERATION_PREMIUM - CONFIG.BUY_PRICE_PREMIUM);
      const maxPrice = price * premiumMultiplier;
      const canAfford = this.money / maxPrice;
      const quantity = Math.min(needed, canAfford);

      if (quantity > 0.01) {
        const order: BuyOrder = { agentId: this.id, sector, quantity, maxPrice };
        market.addBuyOrder(order);
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
      const required = CONFIG.CONSUMPTION[sector];
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

  evaluateJob(marketPrices: Record<SectorType, number>, rng: RNG): SectorType | null {
    this.turnsInSector++;
    if (this.turnsInSector < 4) return null;

    const myPrice = marketPrices[this.sector];
    const alternatives = SECTORS.filter(s => s !== this.sector);

    // Intelligence affects accuracy of identifying best alternative
    const intelligenceRatio = this.intelligence / CONFIG.INTELLIGENCE_MEAN;
    let bestAlt: SectorType;
    if (rng.next() < intelligenceRatio * CONFIG.INTELLIGENCE_JOB_EVAL_WEIGHT + 0.25) {
      bestAlt = alternatives.reduce((best, s) =>
        marketPrices[s] > marketPrices[best] ? s : best
      );
    } else {
      bestAlt = alternatives[rng.nextInt(0, alternatives.length - 1)];
    }

    const bestAltPrice = marketPrices[bestAlt];
    const incomeRatio = myPrice / Math.max(bestAltPrice, 0.01);

    if (incomeRatio < CONFIG.JOB_SWITCH_INCOME_RATIO) {
      this.lowIncomeTurns++;
    } else {
      this.lowIncomeTurns = Math.max(0, this.lowIncomeTurns - 1);
    }

    // Hysteresis: returning to a previously-held sector requires extra patience
    const returningToOld = this.switchHistory.includes(bestAlt);
    const returnPenalty = returningToOld ? CONFIG.JOB_SWITCH_RETURN_PENALTY : 0;
    // Fatigue: each past switch makes future switches harder
    const effectiveThreshold = CONFIG.JOB_SWITCH_THRESHOLD_TURNS + returnPenalty + this.totalSwitches;

    if (
      this.lowIncomeTurns >= effectiveThreshold &&
      this.money >= CONFIG.JOB_SWITCH_COST
    ) {
      return bestAlt;
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
    };
  }
}
