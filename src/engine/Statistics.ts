import type { TurnSnapshot, SectorType } from '../types';
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
    demographics?: { births: number; deaths: number }
  ): TurnSnapshot {
    const alive = agents.filter(a => a.alive);
    const snapshot: TurnSnapshot = {
      turn,
      population: alive.length,
      gdp: this.computeGDP(market),
      giniCoefficient: this.computeGini(alive),
      avgSatisfaction: this.computeAvg(alive, a => a.satisfaction),
      avgHealth: this.computeAvg(alive, a => a.health),
      jobDistribution: this.computeJobDistribution(alive),
      market: market.toState(),
      government: government.toState(),
      births: demographics?.births ?? 0,
      deaths: demographics?.deaths ?? 0,
      avgAge: alive.length > 0
        ? Math.round(alive.reduce((s, a) => s + a.age, 0) / alive.length / 12 * 10) / 10
        : 0,
    };

    this.history.push(snapshot);
    if (this.history.length > CONFIG.MAX_HISTORY_LENGTH) {
      this.history.shift();
    }

    return snapshot;
  }

  private computeGDP(market: Market): number {
    let gdp = 0;
    for (const sector of SECTORS) {
      gdp += market.prices[sector] * market.volume[sector];
    }
    return Math.round(gdp * 100) / 100;
  }

  // O(n log n) Gini using sorted-array formula: G = (2·Σ(i·x_i)) / (n·Σx_i) - (n+1)/n
  private computeGini(agents: Agent[]): number {
    if (agents.length === 0) return 0;
    const wealths = agents.map(a => a.money).sort((a, b) => a - b);
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
