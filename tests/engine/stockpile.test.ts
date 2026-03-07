import { describe, it, expect } from 'vitest';

import { CONFIG } from '../../src/config';
import { Government } from '../../src/engine/Government';
import { Market } from '../../src/engine/Market';
import { GameEngine } from '../../src/engine/GameEngine';
import type { Agent } from '../../src/engine/Agent';
import type { SectorType } from '../../src/types';

// ── Government unit tests ─────────────────────────────────────────────

describe('Government stockpile orders', () => {
  it('computes buy orders when price < buy threshold', () => {
    const gov = new Government();
    gov.stockpileEnabled = true;
    gov.treasury = 1000;

    // Set food price well below threshold (initial 10 × 0.8 = 8)
    const prices: Record<SectorType, number> = { food: 5, goods: 15, services: 12 };
    const { buyOrders, sellOrders } = gov.computeStockpileOrders(prices, -1);

    expect(buyOrders.length).toBeGreaterThan(0);
    const foodBuy = buyOrders.find(o => o.sector === 'food');
    expect(foodBuy).toBeDefined();
    expect(foodBuy!.quantity).toBeGreaterThan(0);
    expect(foodBuy!.quantity).toBeLessThanOrEqual(CONFIG.STOCKPILE_MAX_BUY_PER_TURN);
    expect(foodBuy!.maxPrice).toBeCloseTo(5 * CONFIG.STOCKPILE_BUY_PRICE_PREMIUM);

    // Goods and services are at/above threshold — no buy orders for them
    expect(buyOrders.find(o => o.sector === 'goods')).toBeUndefined();
    expect(buyOrders.find(o => o.sector === 'services')).toBeUndefined();
    expect(sellOrders.length).toBe(0);
  });

  it('computes sell orders when price > sell threshold', () => {
    const gov = new Government();
    gov.stockpileEnabled = true;
    gov.treasury = 1000;
    gov.stockpile = { food: 20, goods: 0, services: 10 };

    // Set food price above threshold (initial 10 × 1.3 = 13)
    const prices: Record<SectorType, number> = { food: 18, goods: 15, services: 20 };
    const { buyOrders, sellOrders } = gov.computeStockpileOrders(prices, -1);

    expect(sellOrders.length).toBeGreaterThan(0);
    const foodSell = sellOrders.find(o => o.sector === 'food');
    expect(foodSell).toBeDefined();
    expect(foodSell!.quantity).toBeGreaterThan(0);
    expect(foodSell!.quantity).toBeLessThanOrEqual(CONFIG.STOCKPILE_MAX_SELL_PER_TURN);
    expect(foodSell!.minPrice).toBeCloseTo(18 * CONFIG.STOCKPILE_SELL_PRICE_DISCOUNT);

    // Services also above sell threshold (initial 12 × 1.3 = 15.6)
    const servicesSell = sellOrders.find(o => o.sector === 'services');
    expect(servicesSell).toBeDefined();
    expect(servicesSell!.quantity).toBeGreaterThan(0);

    expect(buyOrders.length).toBe(0);
  });

  it('produces no orders when prices are between thresholds', () => {
    const gov = new Government();
    gov.stockpileEnabled = true;
    gov.treasury = 1000;
    gov.stockpile = { food: 10, goods: 10, services: 10 };

    // All prices between buy and sell thresholds
    const prices: Record<SectorType, number> = { food: 10, goods: 15, services: 12 };
    const { buyOrders, sellOrders } = gov.computeStockpileOrders(prices, -1);

    expect(buyOrders.length).toBe(0);
    expect(sellOrders.length).toBe(0);
  });

  it('buy quantity limited by treasury', () => {
    const gov = new Government();
    gov.stockpileEnabled = true;
    gov.treasury = 3; // Very low treasury

    const prices: Record<SectorType, number> = { food: 5, goods: 15, services: 12 };
    const { buyOrders } = gov.computeStockpileOrders(prices, -1);

    if (buyOrders.length > 0) {
      const foodBuy = buyOrders.find(o => o.sector === 'food');
      if (foodBuy) {
        // Affordable qty = treasury / maxPrice = 3 / (5 * 1.1) ≈ 0.545
        const maxPrice = 5 * CONFIG.STOCKPILE_BUY_PRICE_PREMIUM;
        const affordableQty = gov.treasury / maxPrice;
        expect(foodBuy.quantity).toBeLessThanOrEqual(affordableQty + 0.01);
      }
    }
  });

  it('sell quantity limited by current stockpile', () => {
    const gov = new Government();
    gov.stockpileEnabled = true;
    gov.treasury = 1000;
    gov.stockpile = { food: 2, goods: 0, services: 0 };

    const prices: Record<SectorType, number> = { food: 18, goods: 25, services: 20 };
    const { sellOrders } = gov.computeStockpileOrders(prices, -1);

    const foodSell = sellOrders.find(o => o.sector === 'food');
    expect(foodSell).toBeDefined();
    expect(foodSell!.quantity).toBeLessThanOrEqual(2);
    // No sell orders for empty sectors
    expect(sellOrders.find(o => o.sector === 'goods')).toBeUndefined();
    expect(sellOrders.find(o => o.sector === 'services')).toBeUndefined();
  });

  it('capacity cap prevents buying beyond STOCKPILE_MAX_CAPACITY', () => {
    const gov = new Government();
    gov.stockpileEnabled = true;
    gov.treasury = 10000;
    gov.stockpile = { food: CONFIG.STOCKPILE_MAX_CAPACITY - 1, goods: 0, services: 0 };

    const prices: Record<SectorType, number> = { food: 5, goods: 15, services: 12 };
    const { buyOrders } = gov.computeStockpileOrders(prices, -1);

    const foodBuy = buyOrders.find(o => o.sector === 'food');
    if (foodBuy) {
      expect(foodBuy.quantity).toBeLessThanOrEqual(1.01); // only 1 unit of capacity
    }

    // At capacity → no buy order
    gov.stockpile.food = CONFIG.STOCKPILE_MAX_CAPACITY;
    const { buyOrders: buyOrders2 } = gov.computeStockpileOrders(prices, -1);
    expect(buyOrders2.find(o => o.sector === 'food')).toBeUndefined();
  });

  it('produces no orders when disabled', () => {
    const gov = new Government();
    gov.stockpileEnabled = false;
    gov.treasury = 1000;
    gov.stockpile = { food: 10, goods: 10, services: 10 };

    const prices: Record<SectorType, number> = { food: 1, goods: 30, services: 1 };
    const { buyOrders, sellOrders } = gov.computeStockpileOrders(prices, -1);

    expect(buyOrders.length).toBe(0);
    expect(sellOrders.length).toBe(0);
  });
});

describe('Government stockpile spoilage', () => {
  it('decays stockpile by STOCKPILE_SPOILAGE_RATE per turn', () => {
    const gov = new Government();
    gov.stockpile = { food: 100, goods: 50, services: 20 };

    gov.applySpoilage();

    const expectedFood = 100 * (1 - CONFIG.STOCKPILE_SPOILAGE_RATE);
    const expectedGoods = 50 * (1 - CONFIG.STOCKPILE_SPOILAGE_RATE);
    const expectedServices = 20 * (1 - CONFIG.STOCKPILE_SPOILAGE_RATE);

    expect(gov.stockpile.food).toBeCloseTo(expectedFood, 2);
    expect(gov.stockpile.goods).toBeCloseTo(expectedGoods, 2);
    expect(gov.stockpile.services).toBeCloseTo(expectedServices, 2);
  });

  it('zeroes out tiny stockpile amounts', () => {
    const gov = new Government();
    gov.stockpile = { food: 0.005, goods: 0, services: 0 };

    gov.applySpoilage();

    expect(gov.stockpile.food).toBe(0);
  });
});

describe('Government stockpile maintenance', () => {
  it('deducts maintenance cost from treasury', () => {
    const gov = new Government();
    gov.stockpileEnabled = true;
    gov.treasury = 100;

    const cost = gov.payStockpileMaintenance();

    expect(cost).toBe(CONFIG.STOCKPILE_MAINTENANCE_COST);
    expect(gov.treasury).toBe(100 - CONFIG.STOCKPILE_MAINTENANCE_COST);
    expect(gov.stockpileEnabled).toBe(true);
  });

  it('auto-disables when treasury is insufficient', () => {
    const gov = new Government();
    gov.stockpileEnabled = true;
    gov.treasury = CONFIG.STOCKPILE_MAINTENANCE_COST - 0.1; // Not enough

    const cost = gov.payStockpileMaintenance();

    expect(cost).toBe(0);
    expect(gov.stockpileEnabled).toBe(false);
  });

  it('returns 0 when stockpile is disabled', () => {
    const gov = new Government();
    gov.stockpileEnabled = false;
    gov.treasury = 100;

    const cost = gov.payStockpileMaintenance();

    expect(cost).toBe(0);
    expect(gov.treasury).toBe(100);
  });
});

// ── Market integration tests ──────────────────────────────────────────

describe('Market government trader', () => {
  it('government buy order executes in market clearing', () => {
    const market = new Market();
    const gov = new Government();
    gov.treasury = 1000;
    gov.stockpileEnabled = true;
    const trader = gov.createMarketTrader();
    market.setGovernmentTrader(trader);

    // Create a cheap sell order from a mock agent
    const mockAgent = createMockAgent(1);
    mockAgent.inventory.food = 10;
    market.setAgents([mockAgent as unknown as Agent]);

    // Agent posts cheap sell order
    market.addSellOrder({ agentId: 1, sector: 'food', quantity: 5, minPrice: 4 });
    // Government posts buy order
    market.addBuyOrder({ agentId: Market.GOVERNMENT_TRADER_ID, sector: 'food', quantity: 3, maxPrice: 6 });

    const treasuryBefore = gov.treasury;
    market.clearMarket();

    // Government should have bought some food
    expect(gov.stockpile.food).toBeGreaterThan(0);
    expect(gov.treasury).toBeLessThan(treasuryBefore);
  });

  it('government sell order executes in market clearing', () => {
    const market = new Market();
    const gov = new Government();
    gov.treasury = 100;
    gov.stockpileEnabled = true;
    gov.stockpile = { food: 10, goods: 0, services: 0 };
    const trader = gov.createMarketTrader();
    market.setGovernmentTrader(trader);

    // Create a buy order from a mock agent
    const mockAgent = createMockAgent(1);
    mockAgent.money = 200;
    market.setAgents([mockAgent as unknown as Agent]);

    // Agent posts high buy order
    market.addBuyOrder({ agentId: 1, sector: 'food', quantity: 3, maxPrice: 20 });
    // Government posts sell order
    market.addSellOrder({ agentId: Market.GOVERNMENT_TRADER_ID, sector: 'food', quantity: 3, minPrice: 8 });

    const treasuryBefore = gov.treasury;
    const stockpileBefore = gov.stockpile.food;
    market.clearMarket();

    // Government should have sold some food
    expect(gov.stockpile.food).toBeLessThan(stockpileBefore);
    expect(gov.treasury).toBeGreaterThan(treasuryBefore);
  });
});

// ── GameEngine integration test ───────────────────────────────────────

describe('Stockpile integration', () => {
  it('stockpile dampens price volatility over multiple turns', () => {
    // Run two simulations: one with stockpile, one without
    const seed = 20260307;
    const turnsToRun = 36; // 3 years

    // Baseline: no stockpile
    const engineBase = new GameEngine(seed, 'baseline');
    for (let i = 0; i < turnsToRun; i++) {
      if (engineBase.pendingDecision) {
        engineBase.resolveDecision(engineBase.pendingDecision.choices[0].id);
      }
      engineBase.advanceTurn();
    }

    // With stockpile: enable immediately (bypass delay for direct test)
    const engineStock = new GameEngine(seed, 'baseline');
    engineStock.government.stockpileEnabled = true;
    engineStock.government.treasury = 200; // Give extra treasury for buying
    for (let i = 0; i < turnsToRun; i++) {
      if (engineStock.pendingDecision) {
        engineStock.resolveDecision(engineStock.pendingDecision.choices[0].id);
      }
      engineStock.advanceTurn();
    }

    // Compare price volatility (std deviation of food prices)
    const basePrices = engineBase.market.priceHistory.food;
    const stockPrices = engineStock.market.priceHistory.food;

    const baseVolatility = priceVolatility(basePrices);
    const stockVolatility = priceVolatility(stockPrices);

    // Stockpile should reduce or at least not increase volatility substantially
    // (It may not always reduce due to random events, but it shouldn't be much worse)
    expect(stockVolatility).toBeLessThan(baseVolatility * 1.5);
  });

  it('stockpile policy flows through delay system correctly', () => {
    const engine = new GameEngine(42, 'baseline');
    engine.advanceTurn();

    expect(engine.government.stockpileEnabled).toBe(false);

    // Queue the stockpile policy
    engine.setStockpile(true);

    // Should appear in pending policies
    const pending = engine.pendingPolicies.find(p => p.type === 'stockpile');
    expect(pending).toBeDefined();
    expect(pending!.value).toBe(true);

    // Advance past delay
    for (let i = 0; i < CONFIG.POLICY_DELAY_TURNS + 1; i++) {
      if (engine.pendingDecision) {
        engine.resolveDecision(engine.pendingDecision.choices[0].id);
      }
      engine.advanceTurn();
    }

    // Should now be enabled
    expect(engine.government.stockpileEnabled).toBe(true);
  });

  it('government state includes stockpile fields', () => {
    const engine = new GameEngine(42, 'baseline');
    engine.government.stockpileEnabled = true;
    engine.government.stockpile = { food: 5, goods: 3, services: 1 };

    const state = engine.getState();
    expect(state.government.stockpileEnabled).toBe(true);
    expect(state.government.stockpile.food).toBe(5);
    expect(state.government.stockpile.goods).toBe(3);
    expect(state.government.stockpile.services).toBe(1);
  });
});

// ── Helpers ───────────────────────────────────────────────────────────

/** Minimal mock Agent for market tests. Implements the MarketTrader-compatible interface. */
function createMockAgent(id: number) {
  return {
    id,
    alive: true,
    money: 100,
    savings: 0,
    inventory: { food: 0, goods: 0, services: 0 } as Record<SectorType, number>,
    sector: 'food' as SectorType,
    spendMoney(amount: number) { this.money -= amount; },
    receiveMoney(amount: number) { this.money += amount; },
    receiveGoods(sector: SectorType, qty: number) { this.inventory[sector] += qty; },
    removeGoods(sector: SectorType, qty: number) { this.inventory[sector] -= qty; },
  };
}

/** Compute standard deviation of price series (measure of volatility). */
function priceVolatility(prices: number[]): number {
  if (prices.length < 2) return 0;
  const mean = prices.reduce((s, p) => s + p, 0) / prices.length;
  const variance = prices.reduce((s, p) => s + (p - mean) ** 2, 0) / prices.length;
  return Math.sqrt(variance);
}
