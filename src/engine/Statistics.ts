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
    government: Government
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

  private computeGini(agents: Agent[]): number {
    if (agents.length === 0) return 0;
    const wealths = agents.map(a => a.money).sort((a, b) => a - b);
    const n = wealths.length;
    let sumDiffs = 0;
    let sumWealth = 0;

    for (let i = 0; i < n; i++) {
      sumWealth += wealths[i];
      for (let j = 0; j < n; j++) {
        sumDiffs += Math.abs(wealths[i] - wealths[j]);
      }
    }

    if (sumWealth === 0) return 0;
    return Math.round((sumDiffs / (2 * n * sumWealth)) * 1000) / 1000;
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
