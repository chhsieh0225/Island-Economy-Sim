import { describe, it, expect } from 'vitest';
import {
  computeNeedForSector,
  computeTargetBufferTurns,
  computeCashReserveTarget,
  computeBuyOrders,
  computeConsumption,
} from '../../src/engine/agent/demandStrategy';
import { CONFIG } from '../../src/config';
import { makeAgentContext } from './_testHelpers';

describe('demandStrategy', () => {
  describe('computeNeedForSector', () => {
    it('returns base consumption * age multiplier for adults', () => {
      const ctx = makeAgentContext({ ageGroup: 'adult' });
      const need = computeNeedForSector(ctx, 'food');
      const expected = CONFIG.CONSUMPTION.food * CONFIG.CONSUMPTION_AGE_MULTIPLIERS.adult.food;
      expect(need).toBeCloseTo(expected, 5);
    });

    it('seniors need more services', () => {
      const adult = makeAgentContext({ ageGroup: 'adult' });
      const senior = makeAgentContext({ ageGroup: 'senior' });
      const adultNeed = computeNeedForSector(adult, 'services');
      const seniorNeed = computeNeedForSector(senior, 'services');
      expect(seniorNeed).toBeGreaterThan(adultNeed);
    });

    it('demand multiplier scales output', () => {
      const ctx = makeAgentContext();
      const base = computeNeedForSector(ctx, 'food', 1);
      const doubled = computeNeedForSector(ctx, 'food', 2);
      expect(doubled).toBeCloseTo(base * 2, 5);
    });

    it('food need is highest', () => {
      const ctx = makeAgentContext();
      const food = computeNeedForSector(ctx, 'food');
      const goods = computeNeedForSector(ctx, 'goods');
      const services = computeNeedForSector(ctx, 'services');
      expect(food).toBeGreaterThan(goods);
      expect(food).toBeGreaterThan(services);
    });
  });

  describe('computeTargetBufferTurns', () => {
    it('returns value in valid range [1, 4.2]', () => {
      const ctx = makeAgentContext();
      const turns = computeTargetBufferTurns(ctx, 'food');
      expect(turns).toBeGreaterThanOrEqual(1);
      expect(turns).toBeLessThanOrEqual(4.2);
    });

    it('survival-focused agents buffer more food', () => {
      const survivor = makeAgentContext({
        goalWeights: { survival: 0.8, wealth: 0.1, happiness: 0.05, stability: 0.05 },
      });
      const balanced = makeAgentContext();
      expect(computeTargetBufferTurns(survivor, 'food'))
        .toBeGreaterThan(computeTargetBufferTurns(balanced, 'food'));
    });

    it('low health adds extra buffer', () => {
      const healthy = makeAgentContext({ health: 80 });
      const sick = makeAgentContext({ health: 30 });
      expect(computeTargetBufferTurns(sick, 'food'))
        .toBeGreaterThan(computeTargetBufferTurns(healthy, 'food'));
    });
  });

  describe('computeCashReserveTarget', () => {
    it('includes emergency cash', () => {
      const ctx = makeAgentContext();
      const reserve = computeCashReserveTarget(ctx);
      expect(reserve).toBeGreaterThanOrEqual(CONFIG.GOAL_EMERGENCY_CASH);
    });

    it('survival-focused agents have higher reserves', () => {
      const survivor = makeAgentContext({
        goalWeights: { survival: 0.8, wealth: 0.1, happiness: 0.05, stability: 0.05 },
      });
      const happy = makeAgentContext({
        goalWeights: { survival: 0.1, wealth: 0.1, happiness: 0.7, stability: 0.1 },
      });
      expect(computeCashReserveTarget(survivor))
        .toBeGreaterThan(computeCashReserveTarget(happy));
    });
  });

  describe('computeBuyOrders', () => {
    const defaultPrices = { food: 10, goods: 15, services: 12 };

    it('returns empty when budget is near zero', () => {
      const ctx = makeAgentContext({ money: 0 });
      const orders = computeBuyOrders(ctx, 1, defaultPrices);
      expect(orders).toHaveLength(0);
    });

    it('returns orders for sectors with unmet needs', () => {
      const ctx = makeAgentContext({
        money: 200,
        inventory: { food: 0, goods: 0, services: 0 },
      });
      const orders = computeBuyOrders(ctx, 1, defaultPrices);
      expect(orders.length).toBeGreaterThan(0);
      for (const order of orders) {
        expect(order.quantity).toBeGreaterThan(0);
        expect(order.maxPrice).toBeGreaterThan(0);
        expect(order.agentId).toBe(1);
      }
    });

    it('respects allowed sectors', () => {
      const ctx = makeAgentContext({
        money: 200,
        inventory: { food: 0, goods: 0, services: 0 },
      });
      const orders = computeBuyOrders(ctx, 1, defaultPrices, undefined, ['food']);
      for (const order of orders) {
        expect(order.sector).toBe('food');
      }
    });

    it('desperate agents pay higher premium', () => {
      const calm = makeAgentContext({
        money: 200,
        inventory: { food: 0, goods: 0, services: 0 },
        desperation: 0,
      });
      const desperate = makeAgentContext({
        money: 200,
        inventory: { food: 0, goods: 0, services: 0 },
        desperation: 1,
      });
      const calmOrders = computeBuyOrders(calm, 1, defaultPrices);
      const despOrders = computeBuyOrders(desperate, 2, defaultPrices);
      // Find matching sector to compare maxPrice
      const calmFood = calmOrders.find(o => o.sector === 'food');
      const despFood = despOrders.find(o => o.sector === 'food');
      if (calmFood && despFood) {
        expect(despFood.maxPrice).toBeGreaterThan(calmFood.maxPrice);
      }
    });
  });

  describe('computeConsumption', () => {
    it('all needs met: health and satisfaction recover', () => {
      const ctx = makeAgentContext({
        health: 80,
        satisfaction: 70,
        inventory: { food: 5, goods: 5, services: 5 },
      });
      const result = computeConsumption(ctx);
      expect(result.unmetNeeds).toHaveLength(0);
      expect(result.healthDelta).toBeGreaterThan(0);
      expect(result.satisfactionDelta).toBeGreaterThan(0);
    });

    it('all needs met: health recovery = HEALTH_RECOVERY_ALL_MET', () => {
      const ctx = makeAgentContext({
        health: 80,
        satisfaction: 70,
        inventory: { food: 5, goods: 5, services: 5 },
      });
      const result = computeConsumption(ctx);
      expect(result.newHealth).toBe(Math.min(100, 80 + CONFIG.HEALTH_RECOVERY_ALL_MET));
      expect(result.newSatisfaction).toBe(Math.min(100, 70 + CONFIG.SATISFACTION_RECOVERY_ALL_MET));
    });

    it('partial unmet: some health recovery minus penalty', () => {
      const ctx = makeAgentContext({
        health: 80,
        satisfaction: 70,
        inventory: { food: 5, goods: 0, services: 5 }, // missing goods
      });
      const result = computeConsumption(ctx);
      expect(result.unmetNeeds).toContain('goods');
      expect(result.unmetNeeds).toHaveLength(1);
    });

    it('all needs unmet: health and satisfaction decay', () => {
      const ctx = makeAgentContext({
        health: 50,
        satisfaction: 50,
        inventory: { food: 0, goods: 0, services: 0 },
      });
      const result = computeConsumption(ctx);
      expect(result.unmetNeeds).toHaveLength(3);
      expect(result.healthDelta).toBeLessThan(0);
      expect(result.satisfactionDelta).toBeLessThan(0);
    });

    it('health and satisfaction clamped to [0, 100]', () => {
      // Very low health, all needs unmet
      const ctx = makeAgentContext({
        health: 5,
        satisfaction: 5,
        inventory: { food: 0, goods: 0, services: 0 },
      });
      const result = computeConsumption(ctx);
      expect(result.newHealth).toBeGreaterThanOrEqual(0);
      expect(result.newSatisfaction).toBeGreaterThanOrEqual(0);

      // Very high health, all needs met
      const ctx2 = makeAgentContext({
        health: 99,
        satisfaction: 99,
        inventory: { food: 5, goods: 5, services: 5 },
      });
      const result2 = computeConsumption(ctx2);
      expect(result2.newHealth).toBeLessThanOrEqual(100);
      expect(result2.newSatisfaction).toBeLessThanOrEqual(100);
    });

    it('inventoryConsumed reflects actual consumption', () => {
      const ctx = makeAgentContext({
        inventory: { food: 5, goods: 0.2, services: 5 },
      });
      const result = computeConsumption(ctx);
      // Food and services should consume their need amount
      expect(result.inventoryConsumed.food).toBeGreaterThan(0);
      // Goods: has 0.2 but needs 0.5 → consumes 0.2
      expect(result.inventoryConsumed.goods).toBeCloseTo(0.2, 5);
    });

    it('respects allowed sectors', () => {
      const ctx = makeAgentContext({
        health: 80,
        satisfaction: 70,
        inventory: { food: 5, goods: 0, services: 5 },
      });
      const result = computeConsumption(ctx, undefined, ['food', 'services']);
      // goods is not allowed, so it should not appear in unmetNeeds
      expect(result.unmetNeeds).not.toContain('goods');
    });
  });
});
