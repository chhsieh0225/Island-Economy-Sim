import type { TurnSnapshot, SectorType, TurnCausalReplay } from '../types';
import { SECTORS } from '../types';
import { CONFIG } from '../config';
import type { Agent } from './Agent';
import type { Market } from './Market';
import type { Government } from './Government';

export class Statistics {
  history: TurnSnapshot[] = [];

  recordTurn(
    turn: number,
    agents: Agent[],
    market: Market,
    government: Government,
    demographics?: { births: number; deaths: number },
    causalReplay?: TurnCausalReplay,
    /** Government expenditure this turn (welfare + public works + liquidity) */
    governmentSpending?: number,
    /** Value of inventory consumed directly by agents (not via market) */
    selfConsumptionValue?: number,
  ): TurnSnapshot {
    const alive = agents.filter(a => a.alive);
    const births = demographics?.births ?? 0;
    const deaths = demographics?.deaths ?? 0;
    const gdp = this.computeGDP(market, governmentSpending ?? 0, selfConsumptionValue ?? 0);
    const population = alive.length;
    const workingAgePopulation = alive.filter(a => a.age >= CONFIG.WORKING_AGE).length;
    const laborForcePool = alive.filter(
      a => a.age >= CONFIG.WORKING_AGE && a.health >= CONFIG.LABOR_FORCE_HEALTH_THRESHOLD,
    );
    const laborForce = laborForcePool.length;
    const employed = laborForcePool.filter(a => a.outputThisTurn > 0.01).length;
    const unemployed = Math.max(0, laborForce - employed);
    const children = alive.filter(a => a.age < CONFIG.WORKING_AGE).length;
    const seniors = alive.filter(a => a.age >= CONFIG.SENIOR_DEPENDENCY_AGE).length;
    const primeWorkingAge = alive.filter(
      a => a.age >= CONFIG.WORKING_AGE && a.age < CONFIG.SENIOR_DEPENDENCY_AGE,
    ).length;
    const reproductiveFemales = alive.filter(
      a => a.gender === 'F' && a.age >= CONFIG.BIRTH_MIN_REPRO_AGE && a.age <= CONFIG.BIRTH_MAX_REPRO_AGE,
    ).length;
    const employmentRate = laborForce > 0 ? (employed / laborForce) * 100 : 0;
    const unemploymentRate = laborForce > 0 ? (unemployed / laborForce) * 100 : 0;
    const laborParticipationRate = workingAgePopulation > 0 ? (laborForce / workingAgePopulation) * 100 : 0;
    const crudeBirthRate = population > 0 ? (births * 12 * 1000) / population : 0;
    const fertilityRate = reproductiveFemales > 0 ? (births * 12) / reproductiveFemales : 0;
    const laborProductivity = employed > 0 ? gdp / employed : 0;
    const dependencyRatio = (children + seniors) / Math.max(1, primeWorkingAge);

    const snapshot: TurnSnapshot = {
      turn,
      population,
      gdp,
      giniCoefficient: this.computeGini(alive),
      avgSatisfaction: this.computeAvg(alive, a => a.satisfaction),
      avgHealth: this.computeAvg(alive, a => a.health),
      jobDistribution: this.computeJobDistribution(alive),
      market: market.toState(),
      government: government.toState(),
      births,
      deaths,
      avgAge: alive.length > 0
        ? Math.round(alive.reduce((s, a) => s + a.age, 0) / alive.length / 12 * 10) / 10
        : 0,
      workingAgePopulation,
      laborForce,
      employed,
      unemployed,
      employmentRate: Math.round(employmentRate * 10) / 10,
      unemploymentRate: Math.round(unemploymentRate * 10) / 10,
      laborParticipationRate: Math.round(laborParticipationRate * 10) / 10,
      crudeBirthRate: Math.round(crudeBirthRate * 10) / 10,
      fertilityRate: Math.round(fertilityRate * 1000) / 1000,
      laborProductivity: Math.round(laborProductivity * 100) / 100,
      dependencyRatio: Math.round(dependencyRatio * 1000) / 1000,
      causalReplay: causalReplay ?? {
        satisfaction: {
          net: 0,
          unit: 'point',
          drivers: [{ id: 'flat', label: '本回合無顯著變化', value: 0 }],
        },
        health: {
          net: 0,
          unit: 'point',
          drivers: [{ id: 'flat', label: '本回合無顯著變化', value: 0 }],
        },
        departures: {
          net: 0,
          unit: 'count',
          drivers: [{ id: 'flat', label: '本回合無人口流出', value: 0 }],
        },
        policy: {
          taxCollected: 0,
          welfarePaid: 0,
          welfareRecipients: 0,
          publicWorksCost: 0,
          liquidityInjected: 0,
          autoStabilizerSpent: 0,
          stockpileBuySpent: 0,
          stockpileSellRevenue: 0,
          stockpileMaintenance: 0,
          policyRate: government.policyRate,
          perCapitaCashDelta: 0,
          treasuryDelta: 0,
        },
      },
    };

    this.history.push(snapshot);
    if (this.history.length > CONFIG.MAX_HISTORY_LENGTH) {
      this.history.shift();
    }

    return snapshot;
  }

  /**
   * GDP = C_market + C_self + G
   * C_market = Σ(price × market volume) — goods transacted on the market
   * C_self   = value of inventory consumed directly by agents (self-consumption)
   * G        = government expenditure (welfare + public works + liquidity)
   */
  private computeGDP(market: Market, governmentSpending: number, selfConsumptionValue: number): number {
    let marketGDP = 0;
    for (const sector of SECTORS) {
      marketGDP += market.prices[sector] * market.volume[sector];
    }
    const gdp = marketGDP + selfConsumptionValue + governmentSpending;
    return Math.round(gdp * 100) / 100;
  }

  // O(n log n) Gini using sorted-array formula: G = (2·Σ(i·x_i)) / (n·Σx_i) - (n+1)/n
  private computeGini(agents: Agent[]): number {
    if (agents.length === 0) return 0;
    const wealths = agents.map(a => a.money + a.savings).sort((a, b) => a - b);
    const n = wealths.length;
    let sumWealth = 0;
    let weightedSum = 0;

    for (let i = 0; i < n; i++) {
      sumWealth += wealths[i];
      weightedSum += (i + 1) * wealths[i];
    }

    if (sumWealth === 0) return 0;
    const gini = (2 * weightedSum) / (n * sumWealth) - (n + 1) / n;
    return Math.round(Math.max(0, Math.min(1, gini)) * 1000) / 1000;
  }

  private computeAvg(agents: Agent[], accessor: (a: Agent) => number): number {
    if (agents.length === 0) return 0;
    const sum = agents.reduce((s, a) => s + accessor(a), 0);
    return Math.round((sum / agents.length) * 10) / 10;
  }

  private computeJobDistribution(agents: Agent[]): Record<SectorType, number> {
    const dist: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
    for (const agent of agents) {
      dist[agent.sector]++;
    }
    return dist;
  }

  reset(): void {
    this.history = [];
  }
}
