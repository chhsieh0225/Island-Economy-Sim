import { CONFIG } from '../config';
import type { SectorType, SellOrder, BuyOrder, MarketState } from '../types';
import { SECTORS } from '../types';
import {
  DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID,
  getEconomicCalibrationProfile,
  type EconomicCalibrationProfile,
} from './economicCalibration';
import type { Agent } from './Agent';

/** Minimal interface for anything that can participate in market trades. */
export interface MarketTrader {
  spendMoney(amount: number): void;
  receiveMoney(amount: number): void;
  receiveGoods(sector: SectorType, qty: number): void;
  removeGoods(sector: SectorType, qty: number): void;
}

interface MarketOptions {
  getEconomicCalibration?: () => EconomicCalibrationProfile;
}

export class Market {
  static readonly GOVERNMENT_TRADER_ID = -1;

  prices: Record<SectorType, number>;
  priceHistory: Record<SectorType, number[]>;
  supply: Record<SectorType, number>;
  demand: Record<SectorType, number>;
  volume: Record<SectorType, number>;

  private sellOrders: Map<SectorType, SellOrder[]>;
  private buyOrders: Map<SectorType, BuyOrder[]>;
  private agents: Map<number, Agent>;
  private governmentTrader: MarketTrader | null = null;
  private policyRate: number;
  private liquiditySupportActive: boolean;
  private readonly getEconomicCalibration: () => EconomicCalibrationProfile;

  constructor(options?: MarketOptions) {
    this.prices = { ...CONFIG.INITIAL_PRICES };
    this.priceHistory = {
      food: [CONFIG.INITIAL_PRICES.food],
      goods: [CONFIG.INITIAL_PRICES.goods],
      services: [CONFIG.INITIAL_PRICES.services],
    };
    this.supply = { food: 0, goods: 0, services: 0 };
    this.demand = { food: 0, goods: 0, services: 0 };
    this.volume = { food: 0, goods: 0, services: 0 };
    this.sellOrders = new Map();
    this.buyOrders = new Map();
    this.agents = new Map();
    this.policyRate = CONFIG.MONETARY_POLICY_RATE_DEFAULT;
    this.liquiditySupportActive = false;
    this.getEconomicCalibration = options?.getEconomicCalibration ?? (
      () => getEconomicCalibrationProfile(DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID)
    );

    for (const sector of SECTORS) {
      this.sellOrders.set(sector, []);
      this.buyOrders.set(sector, []);
    }
  }

  setAgents(agents: Agent[]): void {
    this.agents.clear();
    for (const agent of agents) {
      this.agents.set(agent.id, agent);
    }
  }

  setGovernmentTrader(trader: MarketTrader | null): void {
    this.governmentTrader = trader;
  }

  private getTrader(agentId: number): MarketTrader | undefined {
    if (agentId === Market.GOVERNMENT_TRADER_ID && this.governmentTrader) {
      return this.governmentTrader;
    }
    return this.agents.get(agentId);
  }

  getPrice(sector: SectorType): number {
    return this.prices[sector];
  }

  addSellOrder(order: SellOrder): void {
    this.sellOrders.get(order.sector)!.push(order);
  }

  addBuyOrder(order: BuyOrder): void {
    this.buyOrders.get(order.sector)!.push(order);
  }

  setMonetaryStance(policyRate: number, liquiditySupportActive: boolean): void {
    this.policyRate = Math.max(
      CONFIG.MONETARY_POLICY_RATE_MIN,
      Math.min(CONFIG.MONETARY_POLICY_RATE_MAX, policyRate),
    );
    this.liquiditySupportActive = liquiditySupportActive;
  }

  clearOrders(): void {
    for (const sector of SECTORS) {
      this.sellOrders.set(sector, []);
      this.buyOrders.set(sector, []);
    }
  }

  clearMarket(): void {
    for (const sector of SECTORS) {
      this.clearSector(sector);
    }
    this.adjustPrices();
  }

  private clearSector(sector: SectorType): void {
    const sells = this.sellOrders.get(sector)!;
    const buys = this.buyOrders.get(sector)!;

    // Sort: sellers by price ascending (cheapest first), buyers by price descending (highest bidder first)
    sells.sort((a, b) => a.minPrice - b.minPrice);
    buys.sort((a, b) => b.maxPrice - a.maxPrice);

    // Record total supply and demand
    this.supply[sector] = sells.reduce((sum, o) => sum + o.quantity, 0);
    this.demand[sector] = buys.reduce((sum, o) => sum + o.quantity, 0);
    this.volume[sector] = 0;

    let sellIdx = 0;
    let buyIdx = 0;
    const sellRemaining = sells.map(s => s.quantity);
    const buyRemaining = buys.map(b => b.quantity);

    while (sellIdx < sells.length && buyIdx < buys.length) {
      const sell = sells[sellIdx];
      const buy = buys[buyIdx];

      if (buy.maxPrice < sell.minPrice) break; // No more matchable orders

      const tradePrice = (buy.maxPrice + sell.minPrice) / 2;
      const tradeQty = Math.min(sellRemaining[sellIdx], buyRemaining[buyIdx]);

      if (tradeQty <= 0.001) {
        if (sellRemaining[sellIdx] <= 0.001) sellIdx++;
        if (buyRemaining[buyIdx] <= 0.001) buyIdx++;
        continue;
      }

      // Execute trade
      const seller = this.getTrader(sell.agentId);
      const buyer = this.getTrader(buy.agentId);

      if (seller && buyer) {
        const totalCost = tradePrice * tradeQty;
        buyer.spendMoney(totalCost);
        buyer.receiveGoods(sector, tradeQty);
        seller.receiveMoney(totalCost);
        seller.removeGoods(sector, tradeQty);
        this.volume[sector] += tradeQty;
      }

      sellRemaining[sellIdx] -= tradeQty;
      buyRemaining[buyIdx] -= tradeQty;

      if (sellRemaining[sellIdx] <= 0.001) sellIdx++;
      if (buyRemaining[buyIdx] <= 0.001) buyIdx++;
    }
  }

  private adjustPrices(): void {
    const calibration = this.getEconomicCalibration();
    for (const sector of SECTORS) {
      const supplyTotal = this.supply[sector];
      const demandTotal = this.demand[sector];
      // Walrasian tatonnement on log prices:
      // ln p_{t+1} = ln p_t + k * (D - S) / (D + S + eps)
      const excessDemandRatio = (demandTotal - supplyTotal) / Math.max(1, demandTotal + supplyTotal);
      const policyDelta = this.policyRate - CONFIG.MONETARY_POLICY_NEUTRAL_RATE;
      const gainMultiplier = Math.max(
        0.55,
        Math.min(
          1.45,
          1 - policyDelta * CONFIG.MONETARY_RATE_TATONNEMENT_SENSITIVITY
            + (this.liquiditySupportActive ? CONFIG.MONETARY_LIQUIDITY_TATONNEMENT_BONUS : 0),
        ),
      );
      const effectiveGain = calibration.tatonnementGain * gainMultiplier;
      const logPrice = Math.log(Math.max(CONFIG.MIN_PRICE, this.prices[sector]));
      const rawNewPrice = Math.exp(logPrice + effectiveGain * excessDemandRatio);

      const stepBase = this.liquiditySupportActive
        ? CONFIG.MONETARY_MAX_PRICE_STEP_LIQUIDITY
        : CONFIG.MONETARY_MAX_PRICE_STEP_BASE;
      const tightening = Math.max(0, policyDelta) * CONFIG.MONETARY_MAX_PRICE_STEP_RATE_SENSITIVITY;
      const maxStep = Math.max(0.08, stepBase - tightening);
      // Asymmetric price adjustment: prices drop slower than they rise (downward stickiness)
      const maxStepDown = excessDemandRatio < 0
        ? maxStep * CONFIG.PRICE_DOWNWARD_STICKINESS
        : maxStep;
      const lowerBound = this.prices[sector] * (1 - maxStepDown);
      const upperBound = this.prices[sector] * (1 + maxStep);
      const boundedRaw = Math.max(lowerBound, Math.min(upperBound, rawNewPrice));

      // Smooth with previous price
      const smoothed =
        calibration.priceSmoothing * boundedRaw
        + (1 - calibration.priceSmoothing) * this.prices[sector];
      this.prices[sector] = Math.max(CONFIG.MIN_PRICE, Math.min(CONFIG.MAX_PRICE, smoothed));

      // Record history
      this.priceHistory[sector].push(Math.round(this.prices[sector] * 100) / 100);
      if (this.priceHistory[sector].length > CONFIG.MAX_HISTORY_LENGTH) {
        this.priceHistory[sector].shift();
      }
    }
  }

  private reuseOrCloneHistory(previous: number[] | undefined, source: number[]): number[] {
    if (!previous) return [...source];
    if (source.length === previous.length + 1) {
      return [...previous, source[source.length - 1]];
    }
    if (
      source.length === previous.length &&
      source.length > 0 &&
      previous[0] === source[0] &&
      previous[source.length - 1] === source[source.length - 1]
    ) {
      return previous;
    }
    return [...source];
  }

  toState(previous?: MarketState): MarketState {
    const nextPrices = { ...this.prices };
    const nextSupply = { ...this.supply };
    const nextDemand = { ...this.demand };
    const nextVolume = { ...this.volume };
    const nextPriceHistory = {
      food: this.reuseOrCloneHistory(previous?.priceHistory.food, this.priceHistory.food),
      goods: this.reuseOrCloneHistory(previous?.priceHistory.goods, this.priceHistory.goods),
      services: this.reuseOrCloneHistory(previous?.priceHistory.services, this.priceHistory.services),
    };

    if (
      previous &&
      previous.prices.food === nextPrices.food &&
      previous.prices.goods === nextPrices.goods &&
      previous.prices.services === nextPrices.services &&
      previous.supply.food === nextSupply.food &&
      previous.supply.goods === nextSupply.goods &&
      previous.supply.services === nextSupply.services &&
      previous.demand.food === nextDemand.food &&
      previous.demand.goods === nextDemand.goods &&
      previous.demand.services === nextDemand.services &&
      previous.volume.food === nextVolume.food &&
      previous.volume.goods === nextVolume.goods &&
      previous.volume.services === nextVolume.services &&
      previous.priceHistory.food === nextPriceHistory.food &&
      previous.priceHistory.goods === nextPriceHistory.goods &&
      previous.priceHistory.services === nextPriceHistory.services
    ) {
      return previous;
    }

    return {
      prices: nextPrices,
      priceHistory: nextPriceHistory,
      supply: nextSupply,
      demand: nextDemand,
      volume: nextVolume,
    };
  }

  reset(): void {
    this.prices = { ...CONFIG.INITIAL_PRICES };
    this.priceHistory = {
      food: [CONFIG.INITIAL_PRICES.food],
      goods: [CONFIG.INITIAL_PRICES.goods],
      services: [CONFIG.INITIAL_PRICES.services],
    };
    this.supply = { food: 0, goods: 0, services: 0 };
    this.demand = { food: 0, goods: 0, services: 0 };
    this.volume = { food: 0, goods: 0, services: 0 };
    this.policyRate = CONFIG.MONETARY_POLICY_RATE_DEFAULT;
    this.liquiditySupportActive = false;
    this.clearOrders();
  }
}
