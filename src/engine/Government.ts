import { CONFIG } from '../config';
import type { SectorType, GovernmentState, TaxMode } from '../types';
import type { Agent } from './Agent';

/**
 * Progressive tax brackets based on the headline tax rate.
 * The rate is split into 3 brackets by income percentile:
 *   bottom 40% → rate × 0.5  (half rate)
 *   middle 40% → rate × 1.0  (full rate)
 *   top    20% → rate × 1.5  (1.5× rate, capped at MAX_TAX_RATE)
 */
const PROGRESSIVE_BRACKETS = [
  { percentile: 0.40, multiplier: 0.5 },
  { percentile: 0.80, multiplier: 1.0 },
  { percentile: 1.00, multiplier: 1.5 },
] as const;

export class Government {
  treasury: number = 0;
  taxRate: number = CONFIG.DEFAULT_TAX_RATE;
  taxMode: TaxMode = 'flat';
  subsidies: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
  welfareEnabled: boolean = false;
  publicWorksActive: boolean = false;
  policyRate: number = CONFIG.MONETARY_POLICY_RATE_DEFAULT;
  liquiditySupportActive: boolean = false;

  getSubsidyMultiplier(sector: SectorType): number {
    return 1 + this.subsidies[sector] / 100;
  }

  getPublicWorksBoost(): number {
    return this.publicWorksActive ? CONFIG.PUBLIC_WORKS_PRODUCTIVITY_BOOST : 0;
  }

  collectTaxes(agents: Agent[]): number {
    if (this.taxMode === 'flat') {
      let totalTax = 0;
      for (const agent of agents) {
        if (!agent.alive) continue;
        const tax = agent.payTax(this.taxRate);
        totalTax += tax;
      }
      this.treasury += totalTax;
      return totalTax;
    }

    // ── Progressive tax ──────────────────────────────────────────────
    // Sort alive agents by income to assign bracket rates
    const alive = agents.filter(a => a.alive);
    if (alive.length === 0) return 0;

    const sorted = [...alive].sort((a, b) => a.incomeThisTurn - b.incomeThisTurn);
    const n = sorted.length;
    let totalTax = 0;

    for (let i = 0; i < n; i++) {
      const rank = (i + 0.5) / n; // percentile rank 0..1
      let mult = 1;
      for (const bracket of PROGRESSIVE_BRACKETS) {
        if (rank <= bracket.percentile) {
          mult = bracket.multiplier;
          break;
        }
      }
      const effectiveRate = Math.min(CONFIG.MAX_TAX_RATE, this.taxRate * mult);
      const tax = sorted[i].payTax(effectiveRate);
      totalTax += tax;
    }
    this.treasury += totalTax;
    return totalTax;
  }

  distributeWelfare(agents: Agent[]): { totalSpent: number; recipients: number } {
    if (!this.welfareEnabled) return { totalSpent: 0, recipients: 0 };

    const alive = agents.filter(a => a.alive);
    const sorted = [...alive].sort((a, b) => a.money - b.money);
    const threshold = Math.floor(sorted.length * CONFIG.WELFARE_THRESHOLD_PERCENTILE);
    const recipients = sorted.slice(0, threshold);

    let totalSpent = 0;
    let servedRecipients = 0;
    for (const agent of recipients) {
      const amount = Math.min(CONFIG.WELFARE_AMOUNT, this.treasury);
      if (amount <= 0) break;
      agent.receiveWelfare(amount);
      this.treasury -= amount;
      totalSpent += amount;
      servedRecipients++;
    }
    return { totalSpent, recipients: servedRecipients };
  }

  /**
   * Automatic fiscal stabilizer: emergency welfare when economy is in distress.
   * Triggers when average satisfaction drops below threshold.
   * Scales with severity — mild distress gets small support, crisis gets larger.
   */
  distributeEmergencyWelfare(agents: Agent[]): { totalSpent: number; recipients: number } {
    const alive = agents.filter(a => a.alive);
    if (alive.length === 0) return { totalSpent: 0, recipients: 0 };

    const avgSat = alive.reduce((s, a) => s + a.satisfaction, 0) / alive.length;
    if (avgSat >= CONFIG.AUTO_STABILIZER_SAT_THRESHOLD) return { totalSpent: 0, recipients: 0 };

    // Scale amount by severity: more distress = more support
    const severity = (CONFIG.AUTO_STABILIZER_SAT_THRESHOLD - avgSat) / CONFIG.AUTO_STABILIZER_SAT_THRESHOLD;
    const amount = Math.min(CONFIG.AUTO_STABILIZER_MAX_AMOUNT, 2 + severity * 8);

    // Target bottom 50% by money holdings
    const sorted = [...alive].sort((a, b) => a.money - b.money);
    const threshold = Math.floor(sorted.length * CONFIG.AUTO_STABILIZER_PERCENTILE);
    const recipients = sorted.slice(0, threshold);

    let totalSpent = 0;
    let servedCount = 0;
    for (const agent of recipients) {
      const give = Math.min(amount, this.treasury);
      if (give <= 0) break;
      agent.receiveWelfare(give);
      this.treasury -= give;
      totalSpent += give;
      servedCount++;
    }
    return { totalSpent, recipients: servedCount };
  }

  payPublicWorks(): boolean {
    if (!this.publicWorksActive) return false;
    if (this.treasury >= CONFIG.PUBLIC_WORKS_COST_PER_TURN) {
      this.treasury -= CONFIG.PUBLIC_WORKS_COST_PER_TURN;
      return true;
    }
    // Can't afford it — auto-disable
    this.publicWorksActive = false;
    return false;
  }

  setTaxRate(rate: number): void {
    this.taxRate = Math.max(0, Math.min(CONFIG.MAX_TAX_RATE, rate));
  }

  setSubsidy(sector: SectorType, amount: number): void {
    this.subsidies[sector] = Math.max(0, Math.min(100, amount));
  }

  setWelfare(enabled: boolean): void {
    this.welfareEnabled = enabled;
  }

  setPublicWorks(active: boolean): void {
    this.publicWorksActive = active;
  }

  setPolicyRate(rate: number): void {
    this.policyRate = Math.max(
      CONFIG.MONETARY_POLICY_RATE_MIN,
      Math.min(CONFIG.MONETARY_POLICY_RATE_MAX, rate),
    );
  }

  setLiquiditySupport(active: boolean): void {
    this.liquiditySupportActive = active;
  }

  setTaxMode(mode: TaxMode): void {
    this.taxMode = mode;
  }

  toState(previous?: GovernmentState): GovernmentState {
    const treasury = Math.round(this.treasury * 100) / 100;
    if (
      previous &&
      previous.treasury === treasury &&
      previous.taxRate === this.taxRate &&
      previous.taxMode === this.taxMode &&
      previous.subsidies.food === this.subsidies.food &&
      previous.subsidies.goods === this.subsidies.goods &&
      previous.subsidies.services === this.subsidies.services &&
      previous.welfareEnabled === this.welfareEnabled &&
      previous.publicWorksActive === this.publicWorksActive &&
      previous.policyRate === this.policyRate &&
      previous.liquiditySupportActive === this.liquiditySupportActive
    ) {
      return previous;
    }

    return {
      treasury,
      taxRate: this.taxRate,
      taxMode: this.taxMode,
      subsidies: { ...this.subsidies },
      welfareEnabled: this.welfareEnabled,
      publicWorksActive: this.publicWorksActive,
      policyRate: this.policyRate,
      liquiditySupportActive: this.liquiditySupportActive,
    };
  }

  reset(): void {
    this.treasury = 0;
    this.taxRate = CONFIG.DEFAULT_TAX_RATE;
    this.taxMode = 'flat';
    this.subsidies = { food: 0, goods: 0, services: 0 };
    this.welfareEnabled = false;
    this.publicWorksActive = false;
    this.policyRate = CONFIG.MONETARY_POLICY_RATE_DEFAULT;
    this.liquiditySupportActive = false;
  }
}
