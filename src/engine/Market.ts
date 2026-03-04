import { CONFIG } from '../config';
import type { SectorType, SellOrder, BuyOrder, MarketState } from '../types';
import { SECTORS } from '../types';
import { getActiveEconomicCalibration } from './economicCalibration';
import type { Agent } from './Agent';

export class Market {
  prices: Record<SectorType, number>;
  priceHistory: Record<SectorType, number[]>;
  supply: Record<SectorType, number>;
  demand: Record<SectorType, number>;
  volume: Record<SectorType, number>;

  private sellOrders: Map<SectorType, SellOrder[]>;
  private buyOrders: Map<SectorType, BuyOrder[]>;
  private agents: Map<number, Agent>;

  constructor() {
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

  getPrice(sector: SectorType): number {
    return this.prices[sector];
  }

  addSellOrder(order: SellOrder): void {
    this.sellOrders.get(order.sector)!.push(order);
  }

  addBuyOrder(order: BuyOrder): void {
    this.buyOrders.get(order.sector)!.push(order);
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
      const seller = this.agents.get(sell.agentId);
      const buyer = this.agents.get(buy.agentId);

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
    const calibration = getActiveEconomicCalibration();
    for (const sector of SECTORS) {
      const supplyTotal = this.supply[sector];
      const demandTotal = this.demand[sector];
      // Walrasian tatonnement on log prices:
      // ln p_{t+1} = ln p_t + k * (D - S) / (D + S + eps)
      const excessDemandRatio = (demandTotal - supplyTotal) / Math.max(1, demandTotal + supplyTotal);
      const logPrice = Math.log(Math.max(CONFIG.MIN_PRICE, this.prices[sector]));
      const rawNewPrice = Math.exp(logPrice + calibration.tatonnementGain * excessDemandRatio);

      // Smooth with previous price
      const smoothed =
        calibration.priceSmoothing * rawNewPrice
        + (1 - calibration.priceSmoothing) * this.prices[sector];
      this.prices[sector] = Math.max(CONFIG.MIN_PRICE, Math.min(CONFIG.MAX_PRICE, smoothed));

      // Record history
      this.priceHistory[sector].push(Math.round(this.prices[sector] * 100) / 100);
      if (this.priceHistory[sector].length > CONFIG.MAX_HISTORY_LENGTH) {
        this.priceHistory[sector].shift();
      }
    }
  }

  toState(): MarketState {
    return {
      prices: { ...this.prices },
      priceHistory: {
        food: [...this.priceHistory.food],
        goods: [...this.priceHistory.goods],
        services: [...this.priceHistory.services],
      },
      supply: { ...this.supply },
      demand: { ...this.demand },
      volume: { ...this.volume },
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
    this.clearOrders();
  }
}
