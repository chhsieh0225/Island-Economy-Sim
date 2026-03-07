import { describe, it, expect } from 'vitest';
import { computeHouseholdBanking } from '../../src/engine/agent/bankingStrategy';
import { CONFIG } from '../../src/config';
import { makeAgentContext } from './_testHelpers';

describe('bankingStrategy', () => {
  describe('computeHouseholdBanking', () => {
    it('withdraws when money falls below reserve trigger', () => {
      const ctx = makeAgentContext({
        money: 10,
        savings: 100,
      });
      const result = computeHouseholdBanking(ctx);
      expect(result.withdrawal).toBeGreaterThan(0);
      expect(result.deposit).toBe(0);
    });

    it('does not withdraw when no savings available', () => {
      const ctx = makeAgentContext({
        money: 10,
        savings: 0,
      });
      const result = computeHouseholdBanking(ctx);
      expect(result.withdrawal).toBe(0);
    });

    it('deposits excess cash above reserve', () => {
      const ctx = makeAgentContext({
        money: 500,
        savings: 0,
      });
      const result = computeHouseholdBanking(ctx);
      expect(result.deposit).toBeGreaterThan(0);
      expect(result.withdrawal).toBe(0);
    });

    it('deposit amount follows BANK_DEPOSIT_RATE', () => {
      const ctx = makeAgentContext({
        money: 500,
        savings: 0,
      });
      const reserve = CONFIG.GOAL_EMERGENCY_CASH +
        ctx.goalWeights.survival * CONFIG.GOAL_RESERVE_SURVIVAL_WEIGHT +
        ctx.goalWeights.wealth * CONFIG.GOAL_RESERVE_WEALTH_WEIGHT;
      const excess = Math.max(0, 500 - reserve);
      const expectedDeposit = excess * CONFIG.BANK_DEPOSIT_RATE;

      const result = computeHouseholdBanking(ctx);
      expect(result.deposit).toBeCloseTo(expectedDeposit, 2);
    });

    it('computes interest on savings', () => {
      const ctx = makeAgentContext({
        money: 200,
        savings: 1000,
      });
      const result = computeHouseholdBanking(ctx);
      expect(result.interest).toBeGreaterThan(0);
    });

    it('no interest when savings stays near zero (no deposit possible)', () => {
      // Set money low enough that no deposit occurs, so savings stays 0
      const ctx = makeAgentContext({
        money: 1,
        savings: 0,
      });
      const result = computeHouseholdBanking(ctx);
      expect(result.interest).toBe(0);
    });

    it('higher policy rate increases interest', () => {
      const ctx = makeAgentContext({
        money: 200,
        savings: 1000,
      });
      const lowRate = computeHouseholdBanking(ctx, 0.01);
      const highRate = computeHouseholdBanking(ctx, 0.06);
      expect(highRate.interest).toBeGreaterThanOrEqual(lowRate.interest);
    });

    it('satisfaction delta is non-negative', () => {
      const ctx = makeAgentContext({
        money: 200,
        savings: 100,
        incomeThisTurn: 30,
        spentThisTurn: 10,
      });
      const result = computeHouseholdBanking(ctx);
      expect(result.satisfactionDelta).toBeGreaterThanOrEqual(0);
    });

    it('positive net income gives higher satisfaction boost', () => {
      const earning = makeAgentContext({
        money: 200,
        savings: 100,
        incomeThisTurn: 50,
        spentThisTurn: 10,
      });
      const losing = makeAgentContext({
        money: 200,
        savings: 100,
        incomeThisTurn: 5,
        spentThisTurn: 50,
      });
      const earningResult = computeHouseholdBanking(earning);
      const losingResult = computeHouseholdBanking(losing);
      expect(earningResult.satisfactionDelta).toBeGreaterThanOrEqual(losingResult.satisfactionDelta);
    });
  });
});
