import { CONFIG } from '../config';
import type {
  SectorType, GameState, GameEvent, ActiveRandomEvent, TurnSnapshot,
} from '../types';
import { SECTORS } from '../types';
import { Agent } from './Agent';
import { Market } from './Market';
import { Government } from './Government';
import { Statistics } from './Statistics';
import { NAMES } from '../data/names';
import { RANDOM_EVENTS } from '../data/events';

export class GameEngine {
  turn: number = 0;
  agents: Agent[] = [];
  market: Market;
  government: Government;
  statistics: Statistics;
  events: GameEvent[] = [];
  activeRandomEvents: ActiveRandomEvent[] = [];

  constructor() {
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
      const name = NAMES[i % NAMES.length];
      this.agents.push(new Agent(i, name, sector));
    }
    this.market.setAgents(this.agents);
  }

  advanceTurn(): TurnSnapshot {
    this.turn++;
    this.market.clearOrders();

    const aliveAgents = this.agents.filter(a => a.alive);
    this.market.setAgents(aliveAgents);

    // Phase 1: Production
    this.phaseProduction(aliveAgents);

    // Phase 2: Market Posting
    this.phaseMarketPosting(aliveAgents);

    // Phase 3: Market Clearing
    this.market.clearMarket();

    // Phase 3.5: Inventory spoilage (prevents infinite accumulation)
    this.phaseSpoilage(aliveAgents);

    // Phase 4: Consumption
    this.phaseConsumption(aliveAgents);

    // Phase 5: Government
    this.phaseGovernment(aliveAgents);

    // Phase 6: Agent Decisions
    this.phaseAgentDecisions(aliveAgents);

    // Phase 7: Life/Death
    this.phaseLifeDeath(aliveAgents);

    // Phase 8: Random Events
    this.phaseRandomEvents();

    // Phase 9: Record income & statistics
    for (const agent of aliveAgents) {
      agent.recordIncome();
    }
    const snapshot = this.statistics.recordTurn(
      this.turn,
      this.agents,
      this.market,
      this.government
    );

    return snapshot;
  }

  private phaseSpoilage(agents: Agent[]): void {
    const rate = CONFIG.INVENTORY_SPOILAGE_RATE;
    for (const agent of agents) {
      for (const sector of SECTORS) {
        // Spoil excess inventory beyond what's needed for 1 turn of consumption
        const keep = CONFIG.CONSUMPTION[sector];
        const excess = agent.inventory[sector] - keep;
        if (excess > 0) {
          agent.inventory[sector] -= excess * rate;
        }
      }
    }
  }

  private phaseProduction(agents: Agent[]): void {
    // Compute effective productivity modifiers from active events
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

  private phaseMarketPosting(agents: Agent[]): void {
    for (const agent of agents) {
      agent.postSellOrders(this.market);
    }
    for (const agent of agents) {
      agent.postBuyOrders(this.market);
    }
  }

  private phaseConsumption(agents: Agent[]): void {
    // Apply health damage from active events
    let eventHealthDamage = 0;
    for (const event of this.activeRandomEvents) {
      if (event.def.effects.healthDamage) {
        eventHealthDamage += event.def.effects.healthDamage;
      }
    }

    // Apply satisfaction boost from active events
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
      const switchTo = agent.evaluateJob(prices);
      if (switchTo) {
        const oldSector = agent.sector;
        agent.switchJob(switchTo);
        this.addEvent('info', `${agent.name} 從${this.sectorLabel(oldSector)}轉職到${this.sectorLabel(switchTo)}。`);
      }
    }
  }

  private phaseLifeDeath(agents: Agent[]): void {
    for (const agent of agents) {
      if (!agent.alive) continue;

      if (agent.isDead) {
        agent.alive = false;
        this.addEvent('critical', `${agent.name} 因健康不佳而死亡。`);
      } else if (agent.shouldLeave) {
        agent.alive = false;
        this.addEvent('warning', `${agent.name} 因不滿離開了小島。`);
      }
    }
  }

  private phaseRandomEvents(): void {
    // Tick down active events
    this.activeRandomEvents = this.activeRandomEvents.filter(e => {
      e.turnsRemaining--;
      return e.turnsRemaining > 0;
    });

    // Roll for new events
    for (const eventDef of RANDOM_EVENTS) {
      // Don't stack same event
      if (this.activeRandomEvents.some(e => e.def.id === eventDef.id)) continue;

      if (Math.random() < eventDef.probability) {
        this.activeRandomEvents.push({
          def: eventDef,
          turnsRemaining: eventDef.duration,
        });
        this.addEvent(eventDef.severity, eventDef.message);
      }
    }

    // Apply price modifiers from events
    for (const event of this.activeRandomEvents) {
      if (event.def.effects.priceModifier) {
        for (const [sector, mod] of Object.entries(event.def.effects.priceModifier)) {
          this.market.prices[sector as SectorType] *= mod;
        }
      }
    }
  }

  private addEvent(type: GameEvent['type'], message: string): void {
    this.events.push({ turn: this.turn, type, message });
    // Keep last 100 events
    if (this.events.length > 100) {
      this.events.shift();
    }
  }

  private sectorLabel(sector: SectorType): string {
    const labels: Record<SectorType, string> = {
      food: '食物業',
      goods: '商品業',
      services: '服務業',
    };
    return labels[sector];
  }

  // Policy setters (called from UI)
  setTaxRate(rate: number): void {
    this.government.setTaxRate(rate);
  }

  setSubsidy(sector: SectorType, amount: number): void {
    this.government.setSubsidy(sector, amount);
  }

  setWelfare(enabled: boolean): void {
    this.government.setWelfare(enabled);
  }

  setPublicWorks(active: boolean): void {
    this.government.setPublicWorks(active);
  }

  getState(): GameState {
    return {
      turn: this.turn,
      agents: this.agents.map(a => a.toState()),
      market: this.market.toState(),
      government: this.government.toState(),
      statistics: [...this.statistics.history],
      events: [...this.events],
      activeRandomEvents: this.activeRandomEvents.map(e => ({
        def: e.def,
        turnsRemaining: e.turnsRemaining,
      })),
    };
  }

  reset(): void {
    this.turn = 0;
    this.events = [];
    this.activeRandomEvents = [];
    this.market.reset();
    this.government.reset();
    this.statistics.reset();
    this.initializeAgents();
  }
}
