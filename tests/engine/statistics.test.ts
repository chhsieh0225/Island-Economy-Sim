import { describe, it, expect } from 'vitest';
import { Statistics } from '../../src/engine/Statistics';
import { Market } from '../../src/engine/Market';
import { Government } from '../../src/engine/Government';
import { Agent } from '../../src/engine/Agent';
import { RNG } from '../../src/engine/RNG';
import { CONFIG } from '../../src/config';

function createAgentWithWealth(id: number, money: number, savings: number, rng: RNG) {
  const agent = new Agent(id, `Agent${id}`, 'food', rng);
  agent.money = money;
  agent.savings = savings;
  return agent;
}

describe('Statistics', () => {
  describe('recordTurn', () => {
    it('records a snapshot with correct population', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = Array.from({ length: 10 }, (_, i) => new Agent(i, `A${i}`, 'food', rng));
      const market = new Market();
      const government = new Government();

      const snap = stats.recordTurn(1, agents, market, government);
      expect(snap.turn).toBe(1);
      expect(snap.population).toBe(10);
    });

    it('excludes dead agents from population', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = Array.from({ length: 10 }, (_, i) => new Agent(i, `A${i}`, 'food', rng));
      agents[0].alive = false;
      agents[1].alive = false;

      const snap = stats.recordTurn(1, agents, new Market(), new Government());
      expect(snap.population).toBe(8);
    });

    it('appends to history', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = [new Agent(0, 'A', 'food', rng)];
      const market = new Market();
      const government = new Government();

      stats.recordTurn(1, agents, market, government);
      stats.recordTurn(2, agents, market, government);
      stats.recordTurn(3, agents, market, government);

      expect(stats.history).toHaveLength(3);
      expect(stats.history[0].turn).toBe(1);
      expect(stats.history[2].turn).toBe(3);
    });
  });

  describe('Gini coefficient (via recordTurn)', () => {
    it('Gini = 0 when all agents have equal wealth', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = Array.from({ length: 20 }, (_, i) =>
        createAgentWithWealth(i, 100, 0, rng),
      );
      const snap = stats.recordTurn(1, agents, new Market(), new Government());
      expect(snap.giniCoefficient).toBe(0);
    });

    it('Gini approaches 1 for extreme inequality', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = Array.from({ length: 20 }, (_, i) =>
        createAgentWithWealth(i, i === 0 ? 10000 : 0, 0, rng),
      );
      const snap = stats.recordTurn(1, agents, new Market(), new Government());
      expect(snap.giniCoefficient).toBeGreaterThan(0.9);
    });

    it('Gini = 0 when all wealth is zero', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = Array.from({ length: 10 }, (_, i) =>
        createAgentWithWealth(i, 0, 0, rng),
      );
      const snap = stats.recordTurn(1, agents, new Market(), new Government());
      expect(snap.giniCoefficient).toBe(0);
    });

    it('Gini includes savings in wealth calculation', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = Array.from({ length: 10 }, (_, i) =>
        createAgentWithWealth(i, 50, i * 100, rng), // savings differ
      );
      const snap = stats.recordTurn(1, agents, new Market(), new Government());
      expect(snap.giniCoefficient).toBeGreaterThan(0);
    });

    it('known distribution: Gini is between 0 and 1', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      // Wealth: [10, 20, 30, 40, 50]
      const agents = [10, 20, 30, 40, 50].map((w, i) =>
        createAgentWithWealth(i, w, 0, rng),
      );
      const snap = stats.recordTurn(1, agents, new Market(), new Government());
      expect(snap.giniCoefficient).toBeGreaterThan(0);
      expect(snap.giniCoefficient).toBeLessThan(1);
      // Known Gini for [10,20,30,40,50] ≈ 0.267
      expect(snap.giniCoefficient).toBeCloseTo(0.267, 1);
    });
  });

  describe('GDP (via recordTurn)', () => {
    it('GDP = sum of price * volume for all sectors', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const market = new Market();

      // Simulate some trades to set volume
      const seller = new Agent(0, 'S', 'food', rng);
      seller.inventory.food = 20;
      const buyer = new Agent(1, 'B', 'goods', rng);
      buyer.money = 500;

      market.setAgents([seller, buyer]);
      market.addSellOrder({ agentId: 0, sector: 'food', quantity: 10, minPrice: 1 });
      market.addBuyOrder({ agentId: 1, sector: 'food', quantity: 10, maxPrice: 20 });
      market.clearMarket();

      const snap = stats.recordTurn(1, [seller, buyer], market, new Government());
      // GDP should be prices.food * volume.food + prices.goods * volume.goods + prices.services * volume.services
      const expectedGDP =
        market.prices.food * market.volume.food +
        market.prices.goods * market.volume.goods +
        market.prices.services * market.volume.services;
      expect(snap.gdp).toBeCloseTo(expectedGDP, 1);
    });

    it('GDP is 0 when no trades occur', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = [new Agent(0, 'A', 'food', rng)];
      const market = new Market();

      const snap = stats.recordTurn(1, agents, market, new Government());
      expect(snap.gdp).toBe(0);
    });
  });

  describe('history management', () => {
    it('caps history at MAX_HISTORY_LENGTH', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = [new Agent(0, 'A', 'food', rng)];
      const market = new Market();
      const government = new Government();

      for (let i = 0; i < CONFIG.MAX_HISTORY_LENGTH + 10; i++) {
        stats.recordTurn(i + 1, agents, market, government);
      }

      expect(stats.history.length).toBe(CONFIG.MAX_HISTORY_LENGTH);
    });

    it('reset clears history', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = [new Agent(0, 'A', 'food', rng)];
      stats.recordTurn(1, agents, new Market(), new Government());
      expect(stats.history.length).toBe(1);

      stats.reset();
      expect(stats.history.length).toBe(0);
    });
  });

  describe('labor statistics', () => {
    it('computes employment rate correctly', () => {
      const rng = new RNG(42);
      const stats = new Statistics();
      const agents = Array.from({ length: 5 }, (_, i) => {
        const a = new Agent(i, `A${i}`, 'food', rng, { age: CONFIG.WORKING_AGE + 10 });
        a.health = 100;
        return a;
      });
      // Simulate production so outputThisTurn > 0
      for (const a of agents) {
        a.produce(1, 0);
      }

      const snap = stats.recordTurn(1, agents, new Market(), new Government());
      expect(snap.laborForce).toBeGreaterThan(0);
      expect(snap.employmentRate).toBeGreaterThan(0);
    });
  });
});
