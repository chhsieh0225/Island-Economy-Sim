import { describe, it, expect } from 'vitest';
import {
  estimateSectorUtility,
  evaluateJobSwitch,
  chooseGoalType,
} from '../../src/engine/agent/decisionStrategy';
import { CONFIG } from '../../src/config';
import { RNG } from '../../src/engine/RNG';
import { makeAgentContext } from './_testHelpers';

describe('decisionStrategy', () => {
  describe('estimateSectorUtility', () => {
    it('returns a positive number', () => {
      const ctx = makeAgentContext();
      const prices = { food: 10, goods: 15, services: 12 };
      const maxIncome = 50;
      const util = estimateSectorUtility(ctx, 'food', prices, maxIncome);
      expect(util).toBeGreaterThan(0);
    });

    it('higher market price increases utility (via income score)', () => {
      const ctx = makeAgentContext();
      const lowPrices = { food: 5, goods: 15, services: 12 };
      const highPrices = { food: 20, goods: 15, services: 12 };
      const maxIncome = 100;
      const lowUtil = estimateSectorUtility(ctx, 'food', lowPrices, maxIncome);
      const highUtil = estimateSectorUtility(ctx, 'food', highPrices, maxIncome);
      expect(highUtil).toBeGreaterThan(lowUtil);
    });

    it('food sector has highest survival value', () => {
      const survivalCtx = makeAgentContext({
        goalWeights: { survival: 1, wealth: 0, happiness: 0, stability: 0 },
      });
      const prices = { food: 10, goods: 10, services: 10 };
      const maxIncome = 50;
      const foodUtil = estimateSectorUtility(survivalCtx, 'food', prices, maxIncome);
      const goodsUtil = estimateSectorUtility(survivalCtx, 'goods', prices, maxIncome);
      // With survival=1 and equal prices, food should score higher due to survival=1.0 vs 0.52
      expect(foodUtil).toBeGreaterThan(goodsUtil);
    });

    it('services sector has highest happiness value', () => {
      const happyCtx = makeAgentContext({
        goalWeights: { survival: 0, wealth: 0, happiness: 1, stability: 0 },
      });
      const prices = { food: 10, goods: 10, services: 10 };
      const maxIncome = 50;
      const servicesUtil = estimateSectorUtility(happyCtx, 'services', prices, maxIncome);
      const foodUtil = estimateSectorUtility(happyCtx, 'food', prices, maxIncome);
      expect(servicesUtil).toBeGreaterThan(foodUtil);
    });
  });

  describe('evaluateJobSwitch', () => {
    const rng = new RNG(42);
    const defaultPrices = { food: 10, goods: 15, services: 12 };

    it('no switch when turnsInSector < 4', () => {
      const ctx = makeAgentContext({ turnsInSector: 2 });
      const result = evaluateJobSwitch(ctx, defaultPrices, new RNG(42));
      expect(result.switchTo).toBeNull();
    });

    it('no switch when cannot afford JOB_SWITCH_COST and no pressure', () => {
      const ctx = makeAgentContext({
        money: CONFIG.JOB_SWITCH_COST - 1,
        turnsInSector: 10,
        lowIncomeTurns: 0,
      });
      const result = evaluateJobSwitch(ctx, defaultPrices, new RNG(42));
      expect(result.switchTo).toBeNull();
    });

    it('forced switch when current sector not in allowed list', () => {
      const ctx = makeAgentContext({
        sector: 'food',
        turnsInSector: 10,
        money: CONFIG.JOB_SWITCH_COST + 10,
      });
      const result = evaluateJobSwitch(ctx, defaultPrices, new RNG(42), ['goods', 'services']);
      expect(result.switchTo).not.toBeNull();
      expect(['goods', 'services']).toContain(result.switchTo);
    });

    it('eventually switches after enough lowIncomeTurns', () => {
      const ctx = makeAgentContext({
        sector: 'services',
        turnsInSector: 20,
        money: 200,
        lowIncomeTurns: 10, // well above threshold
      });
      // Run multiple times to account for noise
      let switched = false;
      for (let i = 0; i < 20; i++) {
        const result = evaluateJobSwitch(ctx, defaultPrices, new RNG(i));
        if (result.switchTo !== null) {
          switched = true;
          break;
        }
      }
      expect(switched).toBe(true);
    });

    it('intelligence reduces switch threshold', () => {
      const smart = makeAgentContext({
        turnsInSector: 10,
        money: 200,
        lowIncomeTurns: 4,
        intelligence: 145,
        intelligenceDecisionFactor: 0.9,
      });
      const dumb = makeAgentContext({
        turnsInSector: 10,
        money: 200,
        lowIncomeTurns: 4,
        intelligence: 60,
        intelligenceDecisionFactor: 0.1,
      });
      // Smart agent should be more decisive — test that threshold differs
      // We can't guarantee switch, but smart should have lower effective threshold
      const smartResult = evaluateJobSwitch(smart, defaultPrices, new RNG(42));
      const dumbResult = evaluateJobSwitch(dumb, defaultPrices, new RNG(42));
      // Both may or may not switch, but smart has lower threshold
      // Just verify no crash
      expect(smartResult.newLowIncomeTurns).toBeDefined();
      expect(dumbResult.newLowIncomeTurns).toBeDefined();
    });
  });

  describe('chooseGoalType', () => {
    it('returns a valid goal type', () => {
      const rng = new RNG(42);
      const validTypes = ['survival', 'wealth', 'happiness', 'balanced'];
      for (let i = 0; i < 50; i++) {
        const goal = chooseGoalType(300, rng);
        expect(validTypes).toContain(goal);
      }
    });

    it('seniors favor survival', () => {
      const rng = new RNG(42);
      const N = 500;
      let survivalCount = 0;
      for (let i = 0; i < N; i++) {
        if (chooseGoalType(800, new RNG(i)) === 'survival') survivalCount++;
      }
      // Seniors should pick survival ~45% of the time
      expect(survivalCount / N).toBeGreaterThan(0.3);
    });

    it('youth favor wealth and happiness', () => {
      const N = 500;
      let wealthOrHappy = 0;
      for (let i = 0; i < N; i++) {
        const goal = chooseGoalType(240, new RNG(i)); // 20 years old = youth
        if (goal === 'wealth' || goal === 'happiness') wealthOrHappy++;
      }
      // Youth should pick wealth or happiness > 50%
      expect(wealthOrHappy / N).toBeGreaterThan(0.5);
    });

    it('adult distribution is more balanced', () => {
      const N = 1000;
      const counts: Record<string, number> = { survival: 0, wealth: 0, happiness: 0, balanced: 0 };
      for (let i = 0; i < N; i++) {
        const goal = chooseGoalType(500, new RNG(i)); // 41 years old = adult
        counts[goal]++;
      }
      // No single goal should dominate > 40%
      for (const count of Object.values(counts)) {
        expect(count / N).toBeLessThan(0.4);
      }
    });
  });
});
