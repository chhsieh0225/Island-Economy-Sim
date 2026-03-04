import { CONFIG } from '../config';
import type { SectorType, GovernmentState } from '../types';
import type { Agent } from './Agent';

export class Government {
  treasury: number = 0;
  taxRate: number = CONFIG.DEFAULT_TAX_RATE;
  subsidies: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
  welfareEnabled: boolean = false;
  publicWorksActive: boolean = false;

  getSubsidyMultiplier(sector: SectorType): number {
    return 1 + this.subsidies[sector] / 100;
  }

  getPublicWorksBoost(): number {
    return this.publicWorksActive ? CONFIG.PUBLIC_WORKS_PRODUCTIVITY_BOOST : 0;
  }

  collectTaxes(agents: Agent[]): number {
    let totalTax = 0;
    for (const agent of agents) {
      if (!agent.alive) continue;
      const tax = agent.payTax(this.taxRate);
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

  toState(previous?: GovernmentState): GovernmentState {
    const treasury = Math.round(this.treasury * 100) / 100;
    if (
      previous &&
      previous.treasury === treasury &&
      previous.taxRate === this.taxRate &&
      previous.subsidies.food === this.subsidies.food &&
      previous.subsidies.goods === this.subsidies.goods &&
      previous.subsidies.services === this.subsidies.services &&
      previous.welfareEnabled === this.welfareEnabled &&
      previous.publicWorksActive === this.publicWorksActive
    ) {
      return previous;
    }

    return {
      treasury,
      taxRate: this.taxRate,
      subsidies: { ...this.subsidies },
      welfareEnabled: this.welfareEnabled,
      publicWorksActive: this.publicWorksActive,
    };
  }

  reset(): void {
    this.treasury = 0;
    this.taxRate = CONFIG.DEFAULT_TAX_RATE;
    this.subsidies = { food: 0, goods: 0, services: 0 };
    this.welfareEnabled = false;
    this.publicWorksActive = false;
  }
}
