import { describe, it, expect } from 'vitest';
import { computeProductionOutput, computeSellOrder } from '../../src/engine/agent/productionStrategy';
import { CONFIG } from '../../src/config';
import { makeAgentContext } from './_testHelpers';

describe('productionStrategy', () => {
  describe('computeProductionOutput', () => {
    it('base case: default multipliers produce BASE_PRODUCTIVITY * effectiveProductivity', () => {
      const output = computeProductionOutput('food', 1.0, 1.0, 0, 1, 1);
      expect(output).toBeCloseTo(CONFIG.BASE_PRODUCTIVITY.food, 5);
    });

    it('scales linearly with effectiveProductivity', () => {
      const base = computeProductionOutput('food', 1.0, 1.0, 0, 1, 1);
      const doubled = computeProductionOutput('food', 2.0, 1.0, 0, 1, 1);
      expect(doubled).toBeCloseTo(base * 2, 5);
    });

    it('subsidy multiplier increases output', () => {
      const base = computeProductionOutput('goods', 1.0, 1.0, 0, 1, 1);
      const subsidized = computeProductionOutput('goods', 1.0, 1.5, 0, 1, 1);
      expect(subsidized).toBeCloseTo(base * 1.5, 5);
    });

    it('public works boost is additive', () => {
      const base = computeProductionOutput('services', 1.0, 1.0, 0, 1, 1);
      const boosted = computeProductionOutput('services', 1.0, 1.0, 0.1, 1, 1);
      expect(boosted).toBeCloseTo(base * 1.1, 5);
    });

    it('luck factor multiplies output', () => {
      const base = computeProductionOutput('food', 1.0, 1.0, 0, 1, 1);
      const lucky = computeProductionOutput('food', 1.0, 1.0, 0, 1.2, 1);
      expect(lucky).toBeCloseTo(base * 1.2, 5);
    });

    it('labor scale < 1 reduces output', () => {
      const full = computeProductionOutput('food', 1.0, 1.0, 0, 1, 1);
      const half = computeProductionOutput('food', 1.0, 1.0, 0, 1, 0.5);
      expect(half).toBeCloseTo(full * 0.5, 5);
    });

    it('never returns negative', () => {
      // Negative luck factor should still produce at least 0
      const output = computeProductionOutput('food', 1.0, 1.0, 0, -1, 1);
      expect(output).toBe(0);
    });

    it('all multipliers combine multiplicatively', () => {
      const output = computeProductionOutput('food', 1.5, 1.2, 0.1, 1.1, 0.8);
      const expected = CONFIG.BASE_PRODUCTIVITY.food * 1.5 * 1.2 * (1 + 0.1) * 1.1 * 0.8;
      expect(output).toBeCloseTo(expected, 5);
    });

    it('produces different base output per sector', () => {
      const food = computeProductionOutput('food', 1, 1, 0, 1, 1);
      const goods = computeProductionOutput('goods', 1, 1, 0, 1, 1);
      const services = computeProductionOutput('services', 1, 1, 0, 1, 1);
      expect(food).toBeCloseTo(CONFIG.BASE_PRODUCTIVITY.food, 5);
      expect(goods).toBeCloseTo(CONFIG.BASE_PRODUCTIVITY.goods, 5);
      expect(services).toBeCloseTo(CONFIG.BASE_PRODUCTIVITY.services, 5);
      expect(food).toBeGreaterThan(goods);
      expect(goods).toBeGreaterThan(services);
    });
  });

  describe('computeSellOrder', () => {
    it('returns null when inventory is zero', () => {
      const ctx = makeAgentContext({ inventory: { food: 0, goods: 1, services: 1 } });
      expect(computeSellOrder(ctx, 1, 10)).toBeNull();
    });

    it('returns null when all inventory is needed as buffer', () => {
      // With low inventory, agent keeps everything
      const ctx = makeAgentContext({ inventory: { food: 0.5, goods: 1, services: 1 } });
      expect(computeSellOrder(ctx, 1, 10)).toBeNull();
    });

    it('sells excess above buffer', () => {
      const ctx = makeAgentContext({
        sector: 'food',
        inventory: { food: 10, goods: 1, services: 1 },
      });
      const order = computeSellOrder(ctx, 1, 10);
      expect(order).not.toBeNull();
      expect(order!.quantity).toBeGreaterThan(0);
      expect(order!.quantity).toBeLessThanOrEqual(10);
    });

    it('minPrice reflects market price with sell discount + wealth goal weight', () => {
      const ctx = makeAgentContext({
        sector: 'food',
        inventory: { food: 10, goods: 1, services: 1 },
        goalWeights: { survival: 0.25, wealth: 0.40, happiness: 0.20, stability: 0.15 },
      });
      const marketPrice = 10;
      const order = computeSellOrder(ctx, 1, marketPrice);
      expect(order).not.toBeNull();
      const expectedMin = marketPrice * (CONFIG.SELL_PRICE_DISCOUNT + 0.40 * 0.05);
      expect(order!.minPrice).toBeCloseTo(expectedMin, 5);
    });

    it('sell order includes correct agentId and sector', () => {
      const ctx = makeAgentContext({
        sector: 'goods',
        inventory: { food: 1, goods: 10, services: 1 },
      });
      const order = computeSellOrder(ctx, 42, 15);
      expect(order).not.toBeNull();
      expect(order!.agentId).toBe(42);
      expect(order!.sector).toBe('goods');
    });
  });
});
