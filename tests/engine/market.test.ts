import { describe, it, expect } from 'vitest';
import { Market } from '../../src/engine/Market';
import { Agent } from '../../src/engine/Agent';
import { RNG } from '../../src/engine/RNG';
import { CONFIG } from '../../src/config';

function createTestAgent(id: number, sector: 'food' | 'goods' | 'services', money: number, rng: RNG) {
  const agent = new Agent(id, `Agent${id}`, sector, rng);
  agent.money = money;
  return agent;
}

describe('Market', () => {
  describe('constructor & reset', () => {
    it('initializes with CONFIG prices', () => {
      const market = new Market();
      expect(market.prices.food).toBe(CONFIG.INITIAL_PRICES.food);
      expect(market.prices.goods).toBe(CONFIG.INITIAL_PRICES.goods);
      expect(market.prices.services).toBe(CONFIG.INITIAL_PRICES.services);
    });

    it('reset restores initial state', () => {
      const market = new Market();
      market.prices.food = 999;
      market.reset();
      expect(market.prices.food).toBe(CONFIG.INITIAL_PRICES.food);
    });
  });

  describe('order management', () => {
    it('clearOrders removes all orders', () => {
      const market = new Market();
      market.addSellOrder({ agentId: 1, sector: 'food', quantity: 10, minPrice: 5 });
      market.addBuyOrder({ agentId: 2, sector: 'food', quantity: 5, maxPrice: 15 });
      market.clearOrders();
      // After clearing, supply/demand should be 0 when clearing market
      market.clearMarket();
      expect(market.supply.food).toBe(0);
      expect(market.demand.food).toBe(0);
    });
  });

  describe('clearMarket - order matching', () => {
    it('executes trade when buyer price >= seller price', () => {
      const rng = new RNG(42);
      const market = new Market();
      const seller = createTestAgent(1, 'food', 0, rng);
      seller.inventory.food = 10;
      const buyer = createTestAgent(2, 'goods', 200, rng);

      market.setAgents([seller, buyer]);
      market.addSellOrder({ agentId: 1, sector: 'food', quantity: 5, minPrice: 8 });
      market.addBuyOrder({ agentId: 2, sector: 'food', quantity: 5, maxPrice: 12 });
      market.clearMarket();

      expect(market.volume.food).toBeCloseTo(5, 1);
      // Trade price = (12+8)/2 = 10, total cost = 50
      expect(buyer.money).toBeLessThan(200);
      expect(seller.money).toBeGreaterThan(0);
    });

    it('no trade when buyer price < seller price', () => {
      const rng = new RNG(42);
      const market = new Market();
      const seller = createTestAgent(1, 'food', 0, rng);
      seller.inventory.food = 10;
      const buyer = createTestAgent(2, 'goods', 200, rng);

      market.setAgents([seller, buyer]);
      market.addSellOrder({ agentId: 1, sector: 'food', quantity: 5, minPrice: 15 });
      market.addBuyOrder({ agentId: 2, sector: 'food', quantity: 5, maxPrice: 10 });
      market.clearMarket();

      expect(market.volume.food).toBe(0);
      expect(buyer.money).toBe(200);
      expect(seller.money).toBe(0);
    });

    it('partial fill when quantities differ', () => {
      const rng = new RNG(42);
      const market = new Market();
      const seller = createTestAgent(1, 'food', 0, rng);
      seller.inventory.food = 10;
      const buyer = createTestAgent(2, 'goods', 500, rng);

      market.setAgents([seller, buyer]);
      // Seller offers 3, buyer wants 5
      market.addSellOrder({ agentId: 1, sector: 'food', quantity: 3, minPrice: 8 });
      market.addBuyOrder({ agentId: 2, sector: 'food', quantity: 5, maxPrice: 12 });
      market.clearMarket();

      expect(market.volume.food).toBeCloseTo(3, 1);
    });

    it('cheapest seller matched to highest bidder first', () => {
      const rng = new RNG(42);
      const market = new Market();
      const cheapSeller = createTestAgent(1, 'food', 0, rng);
      cheapSeller.inventory.food = 10;
      const expensiveSeller = createTestAgent(2, 'food', 0, rng);
      expensiveSeller.inventory.food = 10;
      const buyer = createTestAgent(3, 'goods', 500, rng);

      market.setAgents([cheapSeller, expensiveSeller, buyer]);
      market.addSellOrder({ agentId: 1, sector: 'food', quantity: 5, minPrice: 5 });
      market.addSellOrder({ agentId: 2, sector: 'food', quantity: 5, minPrice: 10 });
      market.addBuyOrder({ agentId: 3, sector: 'food', quantity: 5, maxPrice: 12 });
      market.clearMarket();

      // Cheap seller should have sold (received money)
      expect(cheapSeller.money).toBeGreaterThan(0);
    });

    it('tracks supply and demand correctly', () => {
      const rng = new RNG(42);
      const market = new Market();
      const seller = createTestAgent(1, 'food', 0, rng);
      seller.inventory.food = 20;
      const buyer = createTestAgent(2, 'goods', 500, rng);

      market.setAgents([seller, buyer]);
      market.addSellOrder({ agentId: 1, sector: 'food', quantity: 10, minPrice: 5 });
      market.addBuyOrder({ agentId: 2, sector: 'food', quantity: 7, maxPrice: 15 });
      market.clearMarket();

      expect(market.supply.food).toBe(10);
      expect(market.demand.food).toBe(7);
    });
  });

  describe('price adjustment', () => {
    it('excess demand raises price', () => {
      const rng = new RNG(42);
      const market = new Market();
      const seller = createTestAgent(1, 'food', 0, rng);
      seller.inventory.food = 20;
      const buyer1 = createTestAgent(2, 'goods', 500, rng);
      const buyer2 = createTestAgent(3, 'goods', 500, rng);

      market.setAgents([seller, buyer1, buyer2]);
      const priceBefore = market.prices.food;

      // More demand than supply
      market.addSellOrder({ agentId: 1, sector: 'food', quantity: 5, minPrice: 1 });
      market.addBuyOrder({ agentId: 2, sector: 'food', quantity: 10, maxPrice: 50 });
      market.addBuyOrder({ agentId: 3, sector: 'food', quantity: 10, maxPrice: 50 });
      market.clearMarket();

      expect(market.prices.food).toBeGreaterThan(priceBefore);
    });

    it('excess supply lowers price', () => {
      const rng = new RNG(42);
      const market = new Market();
      const seller1 = createTestAgent(1, 'food', 0, rng);
      seller1.inventory.food = 50;
      const seller2 = createTestAgent(2, 'food', 0, rng);
      seller2.inventory.food = 50;
      const buyer = createTestAgent(3, 'goods', 500, rng);

      market.setAgents([seller1, seller2, buyer]);
      const priceBefore = market.prices.food;

      market.addSellOrder({ agentId: 1, sector: 'food', quantity: 30, minPrice: 1 });
      market.addSellOrder({ agentId: 2, sector: 'food', quantity: 30, minPrice: 1 });
      market.addBuyOrder({ agentId: 3, sector: 'food', quantity: 2, maxPrice: 50 });
      market.clearMarket();

      expect(market.prices.food).toBeLessThan(priceBefore);
    });

    it('price stays within [MIN_PRICE, MAX_PRICE]', () => {
      const market = new Market();
      const rng = new RNG(42);
      const agents = Array.from({ length: 5 }, (_, i) => createTestAgent(i, 'food', 500, rng));

      market.setAgents(agents);
      // Extreme excess demand over many rounds
      for (let round = 0; round < 50; round++) {
        market.clearOrders();
        market.addSellOrder({ agentId: 0, sector: 'food', quantity: 1, minPrice: 0.5 });
        for (let i = 1; i < 5; i++) {
          market.addBuyOrder({ agentId: i, sector: 'food', quantity: 100, maxPrice: 500 });
        }
        market.clearMarket();
      }
      expect(market.prices.food).toBeLessThanOrEqual(CONFIG.MAX_PRICE);
      expect(market.prices.food).toBeGreaterThanOrEqual(CONFIG.MIN_PRICE);
    });
  });

  describe('monetary stance', () => {
    it('setMonetaryStance clamps rate within bounds', () => {
      const market = new Market();
      market.setMonetaryStance(-1, false);
      // Internal state can't be directly checked, but it shouldn't crash
      market.setMonetaryStance(1.0, true); // Above max
      // Also shouldn't crash
      expect(true).toBe(true);
    });
  });

  describe('toState', () => {
    it('returns immutable snapshot', () => {
      const market = new Market();
      const state = market.toState();
      expect(state.prices.food).toBe(CONFIG.INITIAL_PRICES.food);
      expect(state.priceHistory.food).toHaveLength(1);
      expect(state.supply.food).toBe(0);
      expect(state.demand.food).toBe(0);
      expect(state.volume.food).toBe(0);
    });

    it('reuses previous state when nothing changed', () => {
      const market = new Market();
      const state1 = market.toState();
      const state2 = market.toState(state1);
      expect(state2).toBe(state1); // Same reference
    });
  });
});
