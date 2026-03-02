import { CONFIG } from '../config';
import type {
  SectorType,
  GameState,
  GameEvent,
  ActiveRandomEvent,
  TurnSnapshot,
  GameOverState,
  GameOverReason,
  PendingDecision,
  PendingPolicyChange,
  PendingPolicyType,
  ScenarioId,
  DecisionChoice,
  RandomEventDef,
} from '../types';
import { SECTORS } from '../types';
import { Agent } from './Agent';
import { Market } from './Market';
import { Government } from './Government';
import { Statistics } from './Statistics';
import { RNG } from './RNG';
import { computeScore } from './Scoring';
import { generateName } from '../data/names';
import { DECISION_EVENTS, RANDOM_EVENTS } from '../data/events';
import { DEFAULT_SCENARIO, getScenarioById } from '../data/scenarios';

export class GameEngine {
  turn: number = 0;
  agents: Agent[] = [];
  market: Market;
  government: Government;
  statistics: Statistics;
  events: GameEvent[] = [];
  activeRandomEvents: ActiveRandomEvent[] = [];
  pendingDecision: PendingDecision | null = null;
  pendingPolicies: PendingPolicyChange[] = [];

  rng: RNG;
  seed: number;
  scenarioId: ScenarioId;
  gameOver: GameOverState | null = null;

  private nextAgentId: number = CONFIG.INITIAL_POPULATION;
  private nextFamilyId: number = 1;
  private nextPolicyId: number = 1;

  constructor(seed?: number, scenarioId: ScenarioId = DEFAULT_SCENARIO) {
    this.seed = seed ?? Date.now();
    this.scenarioId = scenarioId;
    this.rng = new RNG(this.seed);
    this.market = new Market();
    this.government = new Government();
    this.statistics = new Statistics();
    this.initializeAgents();
  }

  private initializeAgents(): void {
    this.agents = [];

    let i = 0;
    let familyId = 1;
    while (i < CONFIG.INITIAL_POPULATION) {
      const householdSize = this.rng.nextInt(1, 4);
      for (let member = 0; member < householdSize && i < CONFIG.INITIAL_POPULATION; member++, i++) {
        const sectorIdx = i % SECTORS.length;
        const sector = SECTORS[sectorIdx];
        const gender = this.rng.next() < 0.5 ? 'M' as const : 'F' as const;
        const name = generateName(gender, this.rng);
        this.agents.push(new Agent(i, name, sector, this.rng, { gender, familyId }));
      }
      familyId++;
    }

    this.nextAgentId = CONFIG.INITIAL_POPULATION;
    this.nextFamilyId = familyId;
    this.market.setAgents(this.agents);
    this.applyScenarioSetup();
  }

  private applyScenarioSetup(): void {
    const scenario = getScenarioById(this.scenarioId);

    if (scenario.initialTreasury !== undefined) {
      this.government.treasury = scenario.initialTreasury;
    }
    if (scenario.initialTaxRate !== undefined) {
      this.government.setTaxRate(scenario.initialTaxRate);
    }
    if (scenario.initialSubsidies) {
      for (const [sector, amount] of Object.entries(scenario.initialSubsidies)) {
        this.government.setSubsidy(sector as SectorType, amount ?? 0);
      }
    }
    if (scenario.enableWelfare !== undefined) {
      this.government.setWelfare(scenario.enableWelfare);
    }
    if (scenario.enablePublicWorks !== undefined) {
      this.government.setPublicWorks(scenario.enablePublicWorks);
    }

    if (scenario.priceMultiplier) {
      for (const [sector, mult] of Object.entries(scenario.priceMultiplier)) {
        const key = sector as SectorType;
        this.market.prices[key] *= mult ?? 1;
        this.market.priceHistory[key][0] = Math.round(this.market.prices[key] * 100) / 100;
      }
    }

    if (scenario.ageShiftTurns) {
      for (const agent of this.agents) {
        agent.shiftAge(scenario.ageShiftTurns);
      }
    }

    if (scenario.wealthSkew) {
      const sorted = [...this.agents].sort((a, b) => b.productivity - a.productivity);
      const topCount = Math.max(1, Math.floor(sorted.length * scenario.wealthSkew.topPercent));
      for (let idx = 0; idx < sorted.length; idx++) {
        const agent = sorted[idx];
        if (idx < topCount) {
          agent.money *= scenario.wealthSkew.topMultiplier;
        } else {
          agent.money *= scenario.wealthSkew.bottomMultiplier;
        }
      }
    }
  }

  advanceTurn(): TurnSnapshot {
    const latestSnapshot = this.statistics.history[this.statistics.history.length - 1];

    if (this.gameOver) {
      return latestSnapshot ?? this.statistics.recordTurn(
        this.turn,
        this.agents,
        this.market,
        this.government,
        { births: 0, deaths: 0 },
      );
    }

    // Pause simulation until user resolves the current decision.
    if (this.pendingDecision) {
      return latestSnapshot ?? this.statistics.recordTurn(
        this.turn,
        this.agents,
        this.market,
        this.government,
        { births: 0, deaths: 0 },
      );
    }

    this.turn++;
    this.applyPendingPolicies();
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

    // Phase 4.5: Family support transfers
    this.phaseFamilySupport(aliveAgents);

    // Phase 5: Government
    this.phaseGovernment(aliveAgents);

    // Phase 6: Agent Decisions
    this.phaseAgentDecisions(aliveAgents);

    // Phase 7: Aging
    this.phaseAging(aliveAgents);

    // Phase 8: Life/Death + Births
    const demographics = this.phaseLifeDeath(aliveAgents);

    // Phase 9: Random events and decision events
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

  private phaseFamilySupport(agents: Agent[]): void {
    const familyMap = new Map<number, Agent[]>();
    for (const agent of agents) {
      const members = familyMap.get(agent.familyId);
      if (members) members.push(agent);
      else familyMap.set(agent.familyId, [agent]);
    }

    for (const members of familyMap.values()) {
      if (members.length < 2) continue;

      const donors = members
        .filter(a => a.money > CONFIG.FAMILY_SUPPORT_DONOR_LINE)
        .sort((a, b) => b.money - a.money);
      const receivers = members
        .filter(a => a.money < CONFIG.FAMILY_SUPPORT_POOR_LINE)
        .sort((a, b) => a.money - b.money);

      if (donors.length === 0 || receivers.length === 0) continue;

      for (const receiver of receivers) {
        const donor = donors.find(d => d.money > CONFIG.FAMILY_SUPPORT_DONOR_LINE + 0.1);
        if (!donor) break;

        const transfer = Math.min(
          CONFIG.FAMILY_SUPPORT_TRANSFER_MAX,
          donor.money - CONFIG.FAMILY_SUPPORT_DONOR_LINE,
          CONFIG.FAMILY_SUPPORT_POOR_LINE - receiver.money,
        );

        if (transfer <= 0.1) continue;

        donor.spendMoney(transfer);
        receiver.receiveMoney(transfer);
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

    const aliveAgents = this.agents.filter(a => a.alive);
    const aliveCount = aliveAgents.length;
    const reproductiveAdults = aliveAgents.filter(
      a => a.gender === 'F' && a.age >= CONFIG.BIRTH_MIN_REPRO_AGE && a.age <= CONFIG.BIRTH_MAX_REPRO_AGE
    );

    const capacityFactor = Math.max(0, 1 - aliveCount / CONFIG.BIRTH_CAPACITY_FACTOR);
    const reproRatio = reproductiveAdults.length / Math.max(1, aliveCount);
    const birthProb = Math.min(1, Math.max(0,
      CONFIG.BIRTH_BASE_PROBABILITY * reproRatio * capacityFactor
    ));

    let births = 0;
    for (let i = 0; i < 5; i++) {
      if (births >= CONFIG.BIRTH_MAX_PER_TURN) break;
      if (reproductiveAdults.length === 0) break;
      if (birthProb > 0 && this.rng.next() < birthProb) {
        const parent = this.rng.pick(reproductiveAdults);
        const newAgent = this.createNewAgent(parent.familyId);
        this.agents.push(newAgent);
        births++;
        this.addEvent('positive', `新居民 ${newAgent.name} 來到了小島！(${Math.floor(newAgent.age / 12)} 歲)`);
      }
    }

    return { births, deaths };
  }

  private createNewAgent(familyId?: number): Agent {
    const id = this.nextAgentId++;
    const gender = this.rng.next() < 0.5 ? 'M' as const : 'F' as const;
    const name = generateName(gender, this.rng);

    const aliveAgents = this.agents.filter(a => a.alive);
    const sectorCounts: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
    for (const a of aliveAgents) {
      sectorCounts[a.sector]++;
    }
    const sector = SECTORS.reduce((min, s) => sectorCounts[s] < sectorCounts[min] ? s : min);

    const assignedFamilyId = familyId ?? this.nextFamilyId++;
    return new Agent(id, name, sector, this.rng, {
      age: CONFIG.MIN_STARTING_AGE,
      gender,
      familyId: assignedFamilyId,
    });
  }

  private phaseRandomEvents(): void {
    this.activeRandomEvents = this.activeRandomEvents.filter(e => {
      e.turnsRemaining--;
      return e.turnsRemaining > 0;
    });

    if (!this.pendingDecision) {
      for (const eventDef of DECISION_EVENTS) {
        if (this.rng.next() < eventDef.probability) {
          this.pendingDecision = {
            id: eventDef.id,
            name: eventDef.name,
            message: eventDef.message,
            severity: eventDef.severity,
            choices: eventDef.choices,
            turnIssued: this.turn,
          };
          this.addEvent(eventDef.severity, `${eventDef.name}：${eventDef.message}`);
          this.addEvent('info', '市政抉擇已出現，請先做出選擇。');
          break;
        }
      }
    }

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

  resolveDecision(choiceId: string): boolean {
    if (!this.pendingDecision || this.gameOver) return false;

    const choice = this.pendingDecision.choices.find(c => c.id === choiceId);
    if (!choice) return false;

    this.applyDecisionChoice(choice);
    this.addEvent('info', `市政抉擇：你選擇了「${choice.label}」。`);
    this.pendingDecision = null;
    return true;
  }

  private applyDecisionChoice(choice: DecisionChoice): void {
    if (choice.immediate) {
      if (choice.immediate.treasuryDelta) {
        this.government.treasury = Math.max(0, this.government.treasury + choice.immediate.treasuryDelta);
      }

      if (choice.immediate.satisfactionDelta) {
        for (const agent of this.agents) {
          if (!agent.alive) continue;
          agent.satisfaction = Math.max(0, Math.min(100, agent.satisfaction + choice.immediate.satisfactionDelta));
        }
      }

      if (choice.immediate.healthDelta) {
        for (const agent of this.agents) {
          if (!agent.alive) continue;
          agent.health = Math.max(0, Math.min(100, agent.health + choice.immediate.healthDelta));
        }
      }

      if (choice.immediate.taxRateDelta) {
        this.government.setTaxRate(this.government.taxRate + choice.immediate.taxRateDelta);
      }

      if (choice.immediate.subsidyDelta) {
        for (const [sector, delta] of Object.entries(choice.immediate.subsidyDelta)) {
          const key = sector as SectorType;
          this.government.setSubsidy(key, this.government.subsidies[key] + (delta ?? 0));
        }
      }
    }

    if (choice.temporary) {
      const tempDef: RandomEventDef = {
        id: `decision_${this.turn}_${choice.id}_${this.rng.nextInt(1, 1_000_000)}`,
        name: choice.label,
        probability: 0,
        duration: choice.temporary.duration,
        effects: choice.temporary.effects,
        message: choice.temporary.message,
        severity: choice.temporary.severity ?? 'info',
      };
      this.activeRandomEvents.push({ def: tempDef, turnsRemaining: tempDef.duration });
      this.addEvent(tempDef.severity, tempDef.message);
    }
  }

  private applyPendingPolicies(): void {
    if (this.pendingPolicies.length === 0) return;

    const due: PendingPolicyChange[] = [];
    this.pendingPolicies = this.pendingPolicies.filter(policy => {
      if (policy.applyTurn <= this.turn) {
        due.push(policy);
        return false;
      }
      return true;
    });

    for (const policy of due) {
      switch (policy.type) {
        case 'tax':
          this.government.setTaxRate(policy.value as number);
          break;
        case 'subsidy':
          if (policy.sector) {
            this.government.setSubsidy(policy.sector, policy.value as number);
          }
          break;
        case 'welfare':
          this.government.setWelfare(policy.value as boolean);
          break;
        case 'publicWorks':
          this.government.setPublicWorks(policy.value as boolean);
          break;
      }
      this.addEvent('positive', `政策生效：${policy.summary}`);
    }
  }

  private queuePolicy(change: {
    type: PendingPolicyType;
    value: number | boolean;
    sector?: SectorType;
    summary: string;
    sideEffects: string[];
  }): void {
    let nextPolicy: PendingPolicyChange = {
      id: `policy_${this.nextPolicyId++}`,
      type: change.type,
      requestedTurn: this.turn,
      applyTurn: this.turn + CONFIG.POLICY_DELAY_TURNS,
      value: change.value,
      sector: change.sector,
      summary: change.summary,
      sideEffects: change.sideEffects,
    };

    const existingIdx = this.pendingPolicies.findIndex(
      p => p.type === change.type && p.sector === change.sector,
    );

    if (existingIdx >= 0) {
      nextPolicy = { ...nextPolicy, id: this.pendingPolicies[existingIdx].id };
      this.pendingPolicies[existingIdx] = nextPolicy;
      this.addEvent('info', `政策更新：${change.summary}（將於 ${nextPolicy.applyTurn} 回合生效）`);
    } else {
      this.pendingPolicies.push(nextPolicy);
      this.addEvent('info', `政策排程：${change.summary}（將於 ${nextPolicy.applyTurn} 回合生效）`);
    }
  }

  private getPolicySideEffects(type: PendingPolicyType, value: number | boolean): string[] {
    switch (type) {
      case 'tax': {
        const numeric = value as number;
        if (numeric >= 0.25) {
          return ['國庫收入增加', '消費與需求可能放緩'];
        }
        return ['刺激消費與交易', '國庫累積速度下降'];
      }
      case 'subsidy':
        return ['目標產業產量上升', '可能造成跨產業失衡'];
      case 'welfare':
        return value
          ? ['底層居民現金改善', '國庫支出增加']
          : ['減少財政支出', '弱勢風險升高'];
      case 'publicWorks':
        return value
          ? ['全體生產力短期提升', '每回合固定消耗國庫']
          : ['停止固定支出', '失去公共建設加成'];
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

  setTaxRate(rate: number): void {
    const clamped = Math.max(0, Math.min(CONFIG.MAX_TAX_RATE, rate));
    const existing = this.pendingPolicies.find(p => p.type === 'tax');
    if (existing && existing.value === clamped) return;
    if (!existing && Math.abs(this.government.taxRate - clamped) < 1e-6) return;

    this.queuePolicy({
      type: 'tax',
      value: clamped,
      summary: `稅率調整至 ${(clamped * 100).toFixed(0)}%`,
      sideEffects: this.getPolicySideEffects('tax', clamped),
    });
  }

  setSubsidy(sector: SectorType, amount: number): void {
    const clamped = Math.max(0, Math.min(100, amount));
    const existing = this.pendingPolicies.find(p => p.type === 'subsidy' && p.sector === sector);
    if (existing && existing.value === clamped) return;
    if (!existing && Math.abs(this.government.subsidies[sector] - clamped) < 1e-6) return;

    this.queuePolicy({
      type: 'subsidy',
      value: clamped,
      sector,
      summary: `${this.sectorLabel(sector)}補貼調整至 ${clamped.toFixed(0)}%`,
      sideEffects: this.getPolicySideEffects('subsidy', clamped),
    });
  }

  setWelfare(enabled: boolean): void {
    const existing = this.pendingPolicies.find(p => p.type === 'welfare');
    if (existing && existing.value === enabled) return;
    if (!existing && this.government.welfareEnabled === enabled) return;

    this.queuePolicy({
      type: 'welfare',
      value: enabled,
      summary: `社會福利 ${enabled ? '啟用' : '停用'}`,
      sideEffects: this.getPolicySideEffects('welfare', enabled),
    });
  }

  setPublicWorks(active: boolean): void {
    const existing = this.pendingPolicies.find(p => p.type === 'publicWorks');
    if (existing && existing.value === active) return;
    if (!existing && this.government.publicWorksActive === active) return;

    this.queuePolicy({
      type: 'publicWorks',
      value: active,
      summary: `公共建設 ${active ? '啟用' : '停用'}`,
      sideEffects: this.getPolicySideEffects('publicWorks', active),
    });
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
      pendingDecision: this.pendingDecision
        ? {
          ...this.pendingDecision,
          choices: [...this.pendingDecision.choices] as PendingDecision['choices'],
        }
        : null,
      pendingPolicies: [...this.pendingPolicies],
      rngState: this.rng.getState(),
      seed: this.seed,
      scenarioId: this.scenarioId,
      gameOver: this.gameOver,
    };
  }

  reset(seed?: number, scenarioId: ScenarioId = this.scenarioId): void {
    this.turn = 0;
    this.events = [];
    this.activeRandomEvents = [];
    this.pendingDecision = null;
    this.pendingPolicies = [];
    this.gameOver = null;
    this.nextPolicyId = 1;

    this.seed = seed ?? Date.now();
    this.scenarioId = scenarioId;
    this.rng = new RNG(this.seed);

    this.market.reset();
    this.government.reset();
    this.statistics.reset();
    this.initializeAgents();
  }
}
