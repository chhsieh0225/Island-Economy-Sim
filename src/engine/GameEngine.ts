import { CONFIG } from '../config';
import type {
  SectorType, GameState, GameEvent, ActiveRandomEvent, TurnSnapshot,
  GameOverState, GameOverReason,
} from '../types';
import { SECTORS } from '../types';
import { Agent } from './Agent';
import { Market } from './Market';
import { Government } from './Government';
import { Statistics } from './Statistics';
import { RNG } from './RNG';
import { computeScore } from './Scoring';
import { generateName } from '../data/names';
import { RANDOM_EVENTS } from '../data/events';

export class GameEngine {
  turn: number = 0;
  agents: Agent[] = [];
  market: Market;
  government: Government;
  statistics: Statistics;
  events: GameEvent[] = [];
  activeRandomEvents: ActiveRandomEvent[] = [];
  rng: RNG;
  gameOver: GameOverState | null = null;
  private nextAgentId: number = CONFIG.INITIAL_POPULATION;

  constructor(seed?: number) {
    this.rng = new RNG(seed ?? Date.now());
    this.market = new Market();
    this.government = new Government();
    this.statistics = new Statistics();
    this.initializeAgents();
  }

  private initializeAgents(): void {
    this.agents = [];
    for (let i = 0; i < CONFIG.INITIAL_POPULATION; i++) {
      const sectorIdx = i % SECTORS.length;
      const sector = SECTORS[sectorIdx];
      const gender = this.rng.next() < 0.5 ? 'M' as const : 'F' as const;
      const name = generateName(gender, this.rng);
      this.agents.push(new Agent(i, name, sector, this.rng, { gender }));
    }
    this.nextAgentId = CONFIG.INITIAL_POPULATION;
    this.market.setAgents(this.agents);
  }

  advanceTurn(): TurnSnapshot {
    // No-op if game already ended
    if (this.gameOver) {
      return this.statistics.history[this.statistics.history.length - 1];
    }

    this.turn++;
    this.market.clearOrders();

    const aliveAgents = this.agents.filter(a => a.alive);
    this.market.setAgents(aliveAgents);

    // Phase 0: Roll luck
    this.phaseRollLuck(aliveAgents);

    // Phase 1: Production
    this.phaseProduction(aliveAgents);

    // Phase 2: Market Posting
    this.phaseMarketPosting(aliveAgents);

    // Phase 3: Market Clearing
    this.market.clearMarket();

    // Phase 3.5: Inventory spoilage
    this.phaseSpoilage(aliveAgents);

    // Phase 4: Consumption
    this.phaseConsumption(aliveAgents);

    // Phase 5: Government
    this.phaseGovernment(aliveAgents);

    // Phase 6: Agent Decisions
    this.phaseAgentDecisions(aliveAgents);

    // Phase 7: Aging
    this.phaseAging(aliveAgents);

    // Phase 8: Life/Death + Births
    const demographics = this.phaseLifeDeath(aliveAgents);

    // Phase 9: Random Events
    this.phaseRandomEvents();

    // Phase 10: Record income & statistics
    for (const agent of this.agents.filter(a => a.alive)) {
      agent.recordIncome();
    }
    const snapshot = this.statistics.recordTurn(
      this.turn,
      this.agents,
      this.market,
      this.government,
      demographics
    );

    // Check end conditions
    this.gameOver = this.checkEndConditions();
    if (this.gameOver) {
      this.addEvent('critical', this.getGameOverMessage(this.gameOver.reason));
    }

    return snapshot;
  }

  private phaseRollLuck(agents: Agent[]): void {
    for (const agent of agents) {
      agent.rollTurnLuck(this.rng);
    }
  }

  private phaseAging(agents: Agent[]): void {
    for (const agent of agents) {
      agent.ageOneTurn();
    }
  }

  private phaseSpoilage(agents: Agent[]): void {
    const rate = CONFIG.INVENTORY_SPOILAGE_RATE;
    for (const agent of agents) {
      for (const sector of SECTORS) {
        const keep = CONFIG.CONSUMPTION[sector];
        const excess = agent.inventory[sector] - keep;
        if (excess > 0) {
          agent.inventory[sector] -= excess * rate;
        }
      }
    }
  }

  private phaseProduction(agents: Agent[]): void {
    const productivityMods: Record<SectorType, number> = { food: 1, goods: 1, services: 1 };
    for (const event of this.activeRandomEvents) {
      if (event.def.effects.sectorProductivity) {
        for (const [sector, mult] of Object.entries(event.def.effects.sectorProductivity)) {
          productivityMods[sector as SectorType] *= mult;
        }
      }
      if (event.def.effects.productivityPenalty) {
        for (const s of SECTORS) {
          productivityMods[s] *= event.def.effects.productivityPenalty;
        }
      }
    }

    for (const agent of agents) {
      const subsidyMult = this.government.getSubsidyMultiplier(agent.sector) * productivityMods[agent.sector];
      const publicWorksBoost = this.government.getPublicWorksBoost();
      agent.produce(subsidyMult, publicWorksBoost);
    }
  }

  private phaseMarketPosting(aliveAgents: Agent[]): void {
    // Collect demand modifiers from active events
    const demandModifiers: Partial<Record<SectorType, number>> = {};
    for (const event of this.activeRandomEvents) {
      if (event.def.effects.servicesDemandBoost) {
        demandModifiers.services = (demandModifiers.services ?? 1) * event.def.effects.servicesDemandBoost;
      }
    }

    for (const agent of aliveAgents) {
      agent.postSellOrders(this.market);
    }
    for (const agent of aliveAgents) {
      agent.postBuyOrders(this.market, Object.keys(demandModifiers).length > 0 ? demandModifiers : undefined);
    }
  }

  private phaseConsumption(agents: Agent[]): void {
    let eventHealthDamage = 0;
    for (const event of this.activeRandomEvents) {
      if (event.def.effects.healthDamage) {
        eventHealthDamage += event.def.effects.healthDamage;
      }
    }

    let eventSatBoost = 0;
    for (const event of this.activeRandomEvents) {
      if (event.def.effects.satisfactionBoost) {
        eventSatBoost += event.def.effects.satisfactionBoost;
      }
    }

    for (const agent of agents) {
      agent.consumeNeeds();
      if (eventHealthDamage > 0) {
        agent.health = Math.max(0, agent.health - eventHealthDamage);
      }
      if (eventSatBoost > 0) {
        agent.satisfaction = Math.min(100, agent.satisfaction + eventSatBoost);
      }
    }
  }

  private phaseGovernment(agents: Agent[]): void {
    const taxCollected = this.government.collectTaxes(agents);
    if (taxCollected > 0) {
      this.addEvent('info', `稅收 $${taxCollected.toFixed(0)} 入庫。`);
    }

    const welfareSpent = this.government.distributeWelfare(agents);
    if (welfareSpent > 0) {
      this.addEvent('info', `發放福利 $${welfareSpent.toFixed(0)}。`);
    }

    this.government.payPublicWorks();
  }

  private phaseAgentDecisions(agents: Agent[]): void {
    const prices = { ...this.market.prices };
    for (const agent of agents) {
      const switchTo = agent.evaluateJob(prices, this.rng);
      if (switchTo) {
        const oldSector = agent.sector;
        agent.switchJob(switchTo);
        this.addEvent('info', `${agent.name} 從${this.sectorLabel(oldSector)}轉職到${this.sectorLabel(switchTo)}。`);
      }
    }
  }

  private phaseLifeDeath(agents: Agent[]): { births: number; deaths: number } {
    let deaths = 0;

    for (const agent of agents) {
      if (!agent.alive) continue;

      if (agent.isOld) {
        agent.alive = false;
        agent.causeOfDeath = 'age';
        deaths++;
        this.addEvent('warning', `${agent.name} 因年老去世 (${Math.floor(agent.age / 12)} 歲)。`);
      } else if (agent.isDead) {
        agent.alive = false;
        agent.causeOfDeath = 'health';
        deaths++;
        this.addEvent('critical', `${agent.name} 因健康不佳而死亡。`);
      } else if (agent.shouldLeave) {
        agent.alive = false;
        agent.causeOfDeath = 'left';
        deaths++;
        this.addEvent('warning', `${agent.name} 因不滿離開了小島。`);
      }
    }

    // Birth system: linked to reproductive-age adults, clamped to [0,1]
    const aliveAgents = this.agents.filter(a => a.alive);
    const aliveCount = aliveAgents.length;
    const reproductiveAdults = aliveAgents.filter(
      a => a.age >= CONFIG.BIRTH_MIN_REPRO_AGE && a.age <= CONFIG.BIRTH_MAX_REPRO_AGE
    ).length;

    const capacityFactor = Math.max(0, 1 - aliveCount / CONFIG.BIRTH_CAPACITY_FACTOR);
    const reproRatio = reproductiveAdults / Math.max(1, aliveCount);
    const birthProb = Math.min(1, Math.max(0,
      CONFIG.BIRTH_BASE_PROBABILITY * reproRatio * capacityFactor
    ));

    let births = 0;
    for (let i = 0; i < 5; i++) {
      if (births >= CONFIG.BIRTH_MAX_PER_TURN) break;
      if (birthProb > 0 && this.rng.next() < birthProb) {
        const newAgent = this.createNewAgent();
        this.agents.push(newAgent);
        births++;
        this.addEvent('positive', `新居民 ${newAgent.name} 來到了小島！(${Math.floor(newAgent.age / 12)} 歲)`);
      }
    }

    return { births, deaths };
  }

  private createNewAgent(): Agent {
    const id = this.nextAgentId++;
    const gender = this.rng.next() < 0.5 ? 'M' as const : 'F' as const;
    const name = generateName(gender, this.rng);

    const aliveAgents = this.agents.filter(a => a.alive);
    const sectorCounts: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
    for (const a of aliveAgents) { sectorCounts[a.sector]++; }
    const sector = SECTORS.reduce((min, s) => sectorCounts[s] < sectorCounts[min] ? s : min);

    return new Agent(id, name, sector, this.rng, { age: CONFIG.MIN_STARTING_AGE, gender });
  }

  private phaseRandomEvents(): void {
    this.activeRandomEvents = this.activeRandomEvents.filter(e => {
      e.turnsRemaining--;
      return e.turnsRemaining > 0;
    });

    for (const eventDef of RANDOM_EVENTS) {
      if (this.activeRandomEvents.some(e => e.def.id === eventDef.id)) continue;
      if (this.rng.next() < eventDef.probability) {
        this.activeRandomEvents.push({ def: eventDef, turnsRemaining: eventDef.duration });
        this.addEvent(eventDef.severity, eventDef.message);
      }
    }

    for (const event of this.activeRandomEvents) {
      if (event.def.effects.priceModifier) {
        for (const [sector, mod] of Object.entries(event.def.effects.priceModifier)) {
          this.market.prices[sector as SectorType] *= mod;
        }
      }
    }
  }

  private checkEndConditions(): GameOverState | null {
    const aliveCount = this.agents.filter(a => a.alive).length;

    let reason: GameOverReason | null = null;

    if (aliveCount === 0) {
      reason = 'all_dead';
    } else if (this.computeCumulativeGDP() >= CONFIG.VICTORY_GDP_THRESHOLD) {
      reason = 'gdp_victory';
    } else if (this.government.treasury >= CONFIG.VICTORY_TREASURY_THRESHOLD) {
      reason = 'treasury_victory';
    } else if (this.turn >= CONFIG.MAX_TURNS) {
      reason = 'max_turns';
    }

    if (!reason) return null;

    return this.buildGameOverState(reason);
  }

  private computeCumulativeGDP(): number {
    return this.statistics.history.reduce((sum, s) => sum + s.gdp, 0);
  }

  private buildGameOverState(reason: GameOverReason): GameOverState {
    const history = this.statistics.history;
    return {
      reason,
      turn: this.turn,
      score: computeScore(history),
      finalStats: {
        peakPopulation: history.length > 0 ? Math.max(...history.map(h => h.population)) : 0,
        totalBirths: history.reduce((s, h) => s + h.births, 0),
        totalDeaths: history.reduce((s, h) => s + h.deaths, 0),
        peakGdp: history.length > 0 ? Math.max(...history.map(h => h.gdp)) : 0,
        avgSatisfaction: history.length > 0
          ? history.reduce((s, h) => s + h.avgSatisfaction, 0) / history.length : 0,
        avgHealth: history.length > 0
          ? history.reduce((s, h) => s + h.avgHealth, 0) / history.length : 0,
      },
    };
  }

  endGame(): GameOverState {
    if (!this.gameOver) {
      this.gameOver = this.buildGameOverState('player_exit');
      this.addEvent('critical', this.getGameOverMessage('player_exit'));
    }
    return this.gameOver;
  }

  private getGameOverMessage(reason: GameOverReason): string {
    switch (reason) {
      case 'all_dead': return '所有居民都已死亡或離開，小島荒廢了。';
      case 'gdp_victory': return '經濟繁榮！GDP 累計達到勝利門檻！';
      case 'treasury_victory': return '國庫充盈！達到財政勝利門檻！';
      case 'max_turns': return '50 年過去了，讓我們回顧小島的發展歷程。';
      case 'player_exit': return '市長決定離開小島。';
    }
  }

  private addEvent(type: GameEvent['type'], message: string): void {
    this.events.push({ turn: this.turn, type, message });
    if (this.events.length > 100) { this.events.shift(); }
  }

  private sectorLabel(sector: SectorType): string {
    const labels: Record<SectorType, string> = { food: '食物業', goods: '商品業', services: '服務業' };
    return labels[sector];
  }

  setTaxRate(rate: number): void { this.government.setTaxRate(rate); }
  setSubsidy(sector: SectorType, amount: number): void { this.government.setSubsidy(sector, amount); }
  setWelfare(enabled: boolean): void { this.government.setWelfare(enabled); }
  setPublicWorks(active: boolean): void { this.government.setPublicWorks(active); }

  getState(): GameState {
    return {
      turn: this.turn,
      agents: this.agents.map(a => a.toState()),
      market: this.market.toState(),
      government: this.government.toState(),
      statistics: [...this.statistics.history],
      events: [...this.events],
      activeRandomEvents: this.activeRandomEvents.map(e => ({ def: e.def, turnsRemaining: e.turnsRemaining })),
      rngState: this.rng.getState(),
      gameOver: this.gameOver,
    };
  }

  reset(seed?: number): void {
    this.turn = 0;
    this.events = [];
    this.activeRandomEvents = [];
    this.gameOver = null;
    this.rng = new RNG(seed ?? Date.now());
    this.market.reset();
    this.government.reset();
    this.statistics.reset();
    this.initializeAgents();
  }
}
