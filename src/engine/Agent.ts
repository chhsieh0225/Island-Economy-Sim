import { CONFIG } from '../config';
import type { SectorType, AgentState, SellOrder, BuyOrder } from '../types';
import { SECTORS } from '../types';
import type { Market } from './Market';

function gaussianRandom(mean: number, stddev: number): number {
  const u1 = Math.random();
  const u2 = Math.random();
  const z = Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
  return mean + z * stddev;
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

  private _incomeThisTurn: number = 0;
  private _spentThisTurn: number = 0;

  constructor(id: number, name: string, sector: SectorType) {
    this.id = id;
    this.name = name;
    this.sector = sector;
    this.money = CONFIG.INITIAL_MONEY;
    // Start with 2 turns of basic supplies so economy can bootstrap
    this.inventory = { food: 2, goods: 1, services: 1 };
    this.health = 100;
    this.satisfaction = 100;
    this.productivity = Math.max(0.5, Math.min(1.5, gaussianRandom(1.0, 0.2)));
    this.alive = true;
    this.lowIncomeTurns = 0;
    this.incomeHistory = [];
    this.turnsInSector = 0;
  }

  get effectiveProductivity(): number {
    // Reduced productivity in first 2 turns after switching
    if (this.turnsInSector < 2) {
      return this.productivity * CONFIG.JOB_SWITCH_PRODUCTIVITY_PENALTY;
    }
    return this.productivity;
  }

  get desperation(): number {
    // 0 = comfortable, 1 = desperate
    return Math.max(0, 1 - this.health / 50);
  }

  produce(subsidyMultiplier: number, publicWorksBoost: number): void {
    const baseOutput = CONFIG.BASE_PRODUCTIVITY[this.sector];
    const output = baseOutput * this.effectiveProductivity * subsidyMultiplier * (1 + publicWorksBoost);
    this.inventory[this.sector] += output;
  }

  postSellOrders(market: Market): void {
    const sector = this.sector;
    const available = this.inventory[sector];
    if (available <= 0) return;

    // Keep a small buffer for own consumption if needed
    const ownNeed = CONFIG.CONSUMPTION[sector];
    const sellQty = Math.max(0, available - ownNeed);
    if (sellQty <= 0) return;

    const minPrice = market.getPrice(sector) * CONFIG.SELL_PRICE_DISCOUNT;
    const order: SellOrder = {
      agentId: this.id,
      sector,
      quantity: sellQty,
      minPrice,
    };
    market.addSellOrder(order);
  }

  postBuyOrders(market: Market): void {
    this._incomeThisTurn = 0;
    this._spentThisTurn = 0;

    for (const sector of SECTORS) {
      if (sector === this.sector) continue; // produce our own

      const needed = CONFIG.CONSUMPTION[sector] - this.inventory[sector];
      if (needed <= 0) continue;

      const price = market.getPrice(sector);
      const premiumMultiplier = CONFIG.BUY_PRICE_PREMIUM + this.desperation * (CONFIG.MAX_DESPERATION_PREMIUM - CONFIG.BUY_PRICE_PREMIUM);
      const maxPrice = price * premiumMultiplier;
      const canAfford = this.money / maxPrice;
      const quantity = Math.min(needed, canAfford);

      if (quantity > 0.01) {
        const order: BuyOrder = {
          agentId: this.id,
          sector,
          quantity,
          maxPrice,
        };
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
        // Consume what's available
        this.inventory[sector] = 0;
        unmetNeeds.push(sector);
      }
    }

    if (unmetNeeds.length === 0) {
      // All needs met — recover
      this.health = Math.min(100, this.health + CONFIG.HEALTH_RECOVERY_ALL_MET);
      this.satisfaction = Math.min(100, this.satisfaction + CONFIG.SATISFACTION_RECOVERY_ALL_MET);
    } else if (unmetNeeds.length < 3) {
      // Partial — slight recovery offset by decay
      this.health = Math.min(100, this.health + CONFIG.HEALTH_RECOVERY_PARTIAL - CONFIG.HEALTH_DECAY_PER_UNMET_NEED * unmetNeeds.length);
      this.satisfaction -= CONFIG.SATISFACTION_DECAY_PER_UNMET_NEED * unmetNeeds.length;
    } else {
      // All unmet — severe decay
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

  evaluateJob(marketPrices: Record<SectorType, number>): SectorType | null {
    this.turnsInSector++;

    // Don't evaluate if just switched
    if (this.turnsInSector < 4) return null;

    const myPrice = marketPrices[this.sector];
    const alternatives = SECTORS.filter(s => s !== this.sector);
    const bestAlt = alternatives.reduce((best, s) =>
      marketPrices[s] > marketPrices[best] ? s : best
    );
    const bestAltPrice = marketPrices[bestAlt];

    const incomeRatio = myPrice / Math.max(bestAltPrice, 0.01);

    if (incomeRatio < CONFIG.JOB_SWITCH_INCOME_RATIO) {
      this.lowIncomeTurns++;
    } else {
      this.lowIncomeTurns = Math.max(0, this.lowIncomeTurns - 1);
    }

    if (
      this.lowIncomeTurns >= CONFIG.JOB_SWITCH_THRESHOLD_TURNS &&
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
    };
  }
}
