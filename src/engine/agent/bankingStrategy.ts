import { CONFIG } from '../../config';
import type { AgentContext } from './agentContext';
import { computeCashReserveTarget } from './demandStrategy';

export interface BankingResult {
  deposit: number;
  withdrawal: number;
  interest: number;
  satisfactionDelta: number;
}

export function computeHouseholdBanking(
  ctx: AgentContext,
  policyRateAnnual: number = CONFIG.MONETARY_POLICY_RATE_DEFAULT,
): BankingResult {
  const reserve = computeCashReserveTarget(ctx);
  let money = ctx.money;
  let savings = ctx.savings;
  let incomeThisTurn = ctx.incomeThisTurn;

  let withdrawal = 0;
  const withdrawFloor = reserve * CONFIG.BANK_WITHDRAW_TRIGGER_RATIO;
  if (money < withdrawFloor && savings > 0) {
    withdrawal = Math.max(0, Math.min(savings, withdrawFloor - money));
    savings -= withdrawal;
    money += withdrawal;
  }

  let deposit = 0;
  const excessCash = Math.max(0, money - reserve);
  if (excessCash > 0.01) {
    deposit = excessCash * CONFIG.BANK_DEPOSIT_RATE;
    money -= deposit;
    savings += deposit;
  }

  let interest = 0;
  if (savings > 0.01) {
    const policyPassThrough = Math.max(0, policyRateAnnual / 12) + CONFIG.BANK_INTEREST_SPREAD_PER_TURN;
    const effectiveRate = Math.max(CONFIG.BANK_INTEREST_RATE_PER_TURN, policyPassThrough);
    interest = savings * effectiveRate;
    incomeThisTurn += interest;
  }

  const netIncome = incomeThisTurn - ctx.spentThisTurn;
  const incomeGain = Math.max(0, Math.min(1, netIncome / CONFIG.BANK_SAT_INCOME_NORMALIZER));
  const securityGoal = Math.max(1, reserve * 2);
  const securityGain = Math.max(0, Math.min(1, (savings + interest) / securityGoal));
  const satBoost = incomeGain * CONFIG.BANK_SAT_INCOME_MAX + securityGain * CONFIG.BANK_SAT_SECURITY_MAX;

  return {
    deposit,
    withdrawal,
    interest,
    satisfactionDelta: satBoost > 0 ? satBoost : 0,
  };
}
