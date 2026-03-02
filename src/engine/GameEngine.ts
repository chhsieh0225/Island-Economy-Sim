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
  MilestoneRecord,
  IslandTerrainState,
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
  terrain: IslandTerrainState;
  events: GameEvent[] = [];
  milestones: MilestoneRecord[] = [];
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
  private lastRandomEventTurn: number = -999;
  private lastDecisionTurn: number = -999;
  private milestoneFlags: Set<string> = new Set();

  constructor(seed?: number, scenarioId: ScenarioId = DEFAULT_SCENARIO) {
    this.seed = seed ?? Date.now();
    this.scenarioId = scenarioId;
    this.rng = new RNG(this.seed);
    this.market = new Market();
    this.government = new Government();
    this.statistics = new Statistics();
    this.terrain = this.generateTerrainProfile(this.seed);
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
        const agent = new Agent(i, name, sector, this.rng, { gender, familyId });
        agent.addLifeEvent(0, 'join', `加入小島，就業於${this.sectorLabel(sector)}。`, 'positive');
        this.agents.push(agent);
      }
      familyId++;
    }

    this.nextAgentId = CONFIG.INITIAL_POPULATION;
    this.nextFamilyId = familyId;
    this.market.setAgents(this.agents);
    this.applyScenarioSetup();
    this.announceTerrainProfile();
  }

  private generateTerrainProfile(seed: number): IslandTerrainState {
    const terrainRng = new RNG((seed ^ 0x9e3779b9) >>> 0);

    const coastlineOffsets = Array.from({ length: 14 }, () => 0.9 + terrainRng.next() * 0.22);
    // Light smoothing keeps the coastline organic but avoids sharp spikes.
    for (let i = 0; i < coastlineOffsets.length; i++) {
      const prev = coastlineOffsets[(i - 1 + coastlineOffsets.length) % coastlineOffsets.length];
      const curr = coastlineOffsets[i];
      const next = coastlineOffsets[(i + 1) % coastlineOffsets.length];
      coastlineOffsets[i] = 0.25 * prev + 0.5 * curr + 0.25 * next;
    }

    const islandScaleX = 0.96 + terrainRng.next() * 0.1;
    const islandScaleY = 0.96 + terrainRng.next() * 0.1;
    const islandRotation = (terrainRng.next() - 0.5) * 0.35;

    const zoneOffsets: IslandTerrainState['zoneOffsets'] = {
      food: {
        x: (terrainRng.next() - 0.5) * 0.1,
        y: -0.08 + terrainRng.next() * 0.07,
      },
      goods: {
        x: -0.11 + terrainRng.next() * 0.08,
        y: 0.02 + terrainRng.next() * 0.09,
      },
      services: {
        x: 0.04 + terrainRng.next() * 0.08,
        y: 0.02 + terrainRng.next() * 0.09,
      },
    };

    const shuffled = [...SECTORS];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = terrainRng.nextInt(0, i);
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    const baseSuitability = [1.14, 1.0, 0.88];
    const sectorSuitability: Record<SectorType, number> = { food: 1, goods: 1, services: 1 };
    for (let i = 0; i < shuffled.length; i++) {
      const sector = shuffled[i];
      const noise = (terrainRng.next() - 0.5) * 0.08;
      sectorSuitability[sector] = Math.max(0.82, Math.min(1.2, baseSuitability[i] + noise));
    }

    const sectorFeatures: Record<SectorType, string> = {
      food: this.pickTerrainFeature('food', sectorSuitability.food, terrainRng),
      goods: this.pickTerrainFeature('goods', sectorSuitability.goods, terrainRng),
      services: this.pickTerrainFeature('services', sectorSuitability.services, terrainRng),
    };

    return {
      seed,
      coastlineOffsets,
      islandScaleX,
      islandScaleY,
      islandRotation,
      zoneOffsets,
      sectorSuitability,
      sectorFeatures,
    };
  }

  private pickTerrainFeature(sector: SectorType, suitability: number, rng: RNG): string {
    const highPools: Record<SectorType, string[]> = {
      food: ['沖積平原', '濕潤谷地', '黑土農帶'],
      goods: ['礦脈丘陵', '工業盆地', '石灰岩台地'],
      services: ['天然港灣', '觀光海岬', '交通樞紐'],
    };
    const midPools: Record<SectorType, string[]> = {
      food: ['一般農地', '混合地貌', '丘陵農區'],
      goods: ['一般工地', '混合地貌', '河港工區'],
      services: ['一般市鎮', '混合地貌', '商業聚落'],
    };
    const lowPools: Record<SectorType, string[]> = {
      food: ['鹽鹼薄土', '乾燥坡地', '碎石地'],
      goods: ['缺礦地帶', '鬆散砂地', '分散聚落'],
      services: ['內陸閉塞', '交通瓶頸', '低密度聚落'],
    };

    const pool = suitability >= 1.05
      ? highPools[sector]
      : suitability <= 0.95
        ? lowPools[sector]
        : midPools[sector];
    return rng.pick(pool);
  }

  private announceTerrainProfile(): void {
    const labels = SECTORS.map(sector => {
      const pct = (this.terrain.sectorSuitability[sector] - 1) * 100;
      const sign = pct >= 0 ? '+' : '';
      return `${this.sectorLabel(sector)}${sign}${pct.toFixed(0)}%（${this.terrain.sectorFeatures[sector]}）`;
    });
    this.addEvent('info', `新地貌生成：${labels.join('、')}`);
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
    this.phaseMilestones();

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
      const terrainMult = this.terrain.sectorSuitability[agent.sector];
      const subsidyMult = this.government.getSubsidyMultiplier(agent.sector) * productivityMods[agent.sector] * terrainMult;
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
        agent.addLifeEvent(this.turn, 'job', `從${this.sectorLabel(oldSector)}轉職到${this.sectorLabel(switchTo)}。`, 'info');
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
        agent.addLifeEvent(this.turn, 'death', `於 ${Math.floor(agent.age / 12)} 歲因年老去世。`, 'warning');
        deaths++;
        this.addEvent('warning', `${agent.name} 因年老去世 (${Math.floor(agent.age / 12)} 歲)。`);
      } else if (agent.isDead) {
        agent.alive = false;
        agent.causeOfDeath = 'health';
        agent.addLifeEvent(this.turn, 'death', '因健康不佳去世。', 'critical');
        deaths++;
        this.addEvent('critical', `${agent.name} 因健康不佳而死亡。`);
      } else if (agent.shouldLeave) {
        agent.alive = false;
        agent.causeOfDeath = 'left';
        agent.addLifeEvent(this.turn, 'leave', '對小島失去信心，選擇離開。', 'warning');
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
    const agent = new Agent(id, name, sector, this.rng, {
      age: CONFIG.MIN_STARTING_AGE,
      gender,
      familyId: assignedFamilyId,
    });
    agent.addLifeEvent(this.turn, 'join', `加入小島，就業於${this.sectorLabel(sector)}。`, 'positive');
    return agent;
  }

  private phaseRandomEvents(): void {
    this.activeRandomEvents = this.activeRandomEvents.filter(e => {
      e.turnsRemaining--;
      return e.turnsRemaining > 0;
    });

    const decisionCooldownDone = this.turn - this.lastDecisionTurn > CONFIG.DECISION_EVENT_COOLDOWN_TURNS;
    if (!this.pendingDecision && decisionCooldownDone) {
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
          this.lastDecisionTurn = this.turn;
          this.addEvent(eventDef.severity, `${eventDef.name}：${eventDef.message}`);
          this.addEvent('info', '市政抉擇已出現，請先做出選擇。');
          break;
        }
      }
    }

    const randomCooldownDone = this.turn - this.lastRandomEventTurn > CONFIG.RANDOM_EVENT_COOLDOWN_TURNS;
    if (randomCooldownDone) {
      const available = RANDOM_EVENTS.filter(
        eventDef => !this.activeRandomEvents.some(e => e.def.id === eventDef.id),
      );

      if (available.length > 0) {
        const startIdx = this.rng.nextInt(0, available.length - 1);
        for (let i = 0; i < available.length; i++) {
          const eventDef = available[(startIdx + i) % available.length];
          const adjustedProbability = eventDef.probability * CONFIG.RANDOM_EVENT_PROBABILITY_MULTIPLIER;
          if (this.rng.next() < adjustedProbability) {
            this.activeRandomEvents.push({ def: eventDef, turnsRemaining: eventDef.duration });
            this.lastRandomEventTurn = this.turn;
            this.addEvent(eventDef.severity, eventDef.message);
            break; // at most one new random event per turn
          }
        }
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

  private phaseMilestones(): void {
    const aliveAgents = this.agents.filter(a => a.alive);
    if (aliveAgents.length === 0) return;

    // Wealth milestones: trigger once per global threshold.
    const richest = aliveAgents.reduce((best, a) => (a.money > best.money ? a : best), aliveAgents[0]);
    const wealthMilestones = [
      { threshold: 1_000, label: '千元富翁' },
      { threshold: 10_000, label: '萬元富翁' },
      { threshold: 1_000_000, label: '百萬富翁' },
    ];
    for (const m of wealthMilestones) {
      const key = `wealth_${m.threshold}`;
      if (!this.milestoneFlags.has(key) && richest.money >= m.threshold) {
        this.milestoneFlags.add(key);
        this.addMilestone({
          id: key,
          turn: this.turn,
          kind: 'wealth',
          title: m.label,
          description: `${richest.name} 資產突破 $${m.threshold.toLocaleString()}（目前 $${richest.money.toFixed(0)}）。`,
          agentId: richest.id,
        });
      }
    }

    // Super genius: announce once when the first extraordinary IQ appears.
    const smartest = aliveAgents.reduce(
      (best, a) => (a.intelligence > best.intelligence ? a : best),
      aliveAgents[0],
    );
    if (!this.milestoneFlags.has('super_genius') && smartest.intelligence >= 135) {
      this.milestoneFlags.add('super_genius');
      this.addMilestone({
        id: 'super_genius',
        turn: this.turn,
        kind: 'talent',
        title: '超級天才',
        description: `${smartest.name} 的 IQ 高達 ${smartest.intelligence}。`,
        agentId: smartest.id,
      });
    }

    // Longevity milestones.
    const oldest = aliveAgents.reduce((best, a) => (a.age > best.age ? a : best), aliveAgents[0]);
    const ageMilestones = [
      { turns: 720, label: '長壽里程碑', ageLabel: '60 歲' },
      { turns: 900, label: '超高齡里程碑', ageLabel: '75 歲' },
    ];
    for (const m of ageMilestones) {
      const key = `age_${m.turns}`;
      if (!this.milestoneFlags.has(key) && oldest.age >= m.turns) {
        this.milestoneFlags.add(key);
        this.addMilestone({
          id: key,
          turn: this.turn,
          kind: 'longevity',
          title: m.label,
          description: `${oldest.name} 達到 ${m.ageLabel}。`,
          agentId: oldest.id,
        });
      }
    }

    // Career switching milestones.
    const switchKing = aliveAgents.reduce(
      (best, a) => (a.totalSwitches > best.totalSwitches ? a : best),
      aliveAgents[0],
    );
    const switchMilestones = [3, 6];
    for (const threshold of switchMilestones) {
      const key = `switch_${threshold}`;
      if (!this.milestoneFlags.has(key) && switchKing.totalSwitches >= threshold) {
        this.milestoneFlags.add(key);
        this.addMilestone({
          id: key,
          turn: this.turn,
          kind: 'career',
          title: '轉職王',
          description: `${switchKing.name} 已轉職 ${switchKing.totalSwitches} 次。`,
          agentId: switchKing.id,
        });
      }
    }

    // Family wealth milestones.
    const familyTotals = new Map<number, { wealth: number; members: Agent[] }>();
    for (const agent of aliveAgents) {
      const current = familyTotals.get(agent.familyId);
      if (current) {
        current.wealth += agent.money;
        current.members.push(agent);
      } else {
        familyTotals.set(agent.familyId, { wealth: agent.money, members: [agent] });
      }
    }
    const richestFamily = [...familyTotals.entries()].reduce((best, entry) => (
      !best || entry[1].wealth > best[1].wealth ? entry : best
    ), null as [number, { wealth: number; members: Agent[] }] | null);

    if (richestFamily) {
      const familyMilestones = [5000, 20000];
      for (const threshold of familyMilestones) {
        const key = `family_wealth_${threshold}`;
        if (!this.milestoneFlags.has(key) && richestFamily[1].wealth >= threshold) {
          this.milestoneFlags.add(key);
          const representative = richestFamily[1].members.reduce(
            (best, a) => (a.money > best.money ? a : best),
            richestFamily[1].members[0],
          );
          this.addMilestone({
            id: key,
            turn: this.turn,
            kind: 'family',
            title: '家族崛起',
            description: `${representative.name} 所在的 #${richestFamily[0]} 家族總資產突破 $${threshold.toLocaleString()}。`,
            agentId: representative.id,
            familyId: richestFamily[0],
          });
        }
      }
    }

    // Legendary elder with excellent health.
    const immortalCandidate = aliveAgents.find(a => a.age >= 720 && a.health >= 92);
    if (immortalCandidate && !this.milestoneFlags.has('immortal_legend')) {
      this.milestoneFlags.add('immortal_legend');
      this.addMilestone({
        id: 'immortal_legend',
        turn: this.turn,
        kind: 'longevity',
        title: '不死傳說',
        description: `${immortalCandidate.name} 已 ${Math.floor(immortalCandidate.age / 12)} 歲仍維持 ${immortalCandidate.health.toFixed(0)}% 健康。`,
        agentId: immortalCandidate.id,
      });
    }

    // Worker model: sustained high income streak.
    const workerModel = aliveAgents.find(agent => this.hasRecentIncomeStreak(agent, 5, 90));
    if (workerModel && !this.milestoneFlags.has('worker_model')) {
      this.milestoneFlags.add('worker_model');
      this.addMilestone({
        id: 'worker_model',
        turn: this.turn,
        kind: 'work',
        title: '勞工楷模',
        description: `${workerModel.name} 連續 5 回合高收入，展現驚人穩定性。`,
        agentId: workerModel.id,
      });
    }
  }

  private addMilestone(record: MilestoneRecord): void {
    this.milestones.unshift(record);
    if (this.milestones.length > 30) {
      this.milestones.pop();
    }
    if (record.agentId !== undefined) {
      const target = this.agents.find(a => a.id === record.agentId);
      if (target) {
        target.addLifeEvent(record.turn, 'achievement', `${record.title}：${record.description}`, 'positive');
      }
    }
    // Keep a brief log entry for timeline context, but detailed browsing goes to milestone panel.
    this.addEvent('positive', `🏅 ${record.title}：${record.description}`);
  }

  private hasRecentIncomeStreak(agent: Agent, turns: number, threshold: number): boolean {
    if (agent.incomeHistory.length < turns) return false;
    const recent = agent.incomeHistory.slice(-turns);
    return recent.every(v => v >= threshold);
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
      terrain: {
        ...this.terrain,
        coastlineOffsets: [...this.terrain.coastlineOffsets],
        zoneOffsets: {
          food: { ...this.terrain.zoneOffsets.food },
          goods: { ...this.terrain.zoneOffsets.goods },
          services: { ...this.terrain.zoneOffsets.services },
        },
        sectorSuitability: { ...this.terrain.sectorSuitability },
        sectorFeatures: { ...this.terrain.sectorFeatures },
      },
      market: this.market.toState(),
      government: this.government.toState(),
      statistics: [...this.statistics.history],
      events: [...this.events],
      milestones: [...this.milestones],
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
    this.milestones = [];
    this.activeRandomEvents = [];
    this.pendingDecision = null;
    this.pendingPolicies = [];
    this.gameOver = null;
    this.nextPolicyId = 1;
    this.lastRandomEventTurn = -999;
    this.lastDecisionTurn = -999;
    this.milestoneFlags.clear();

    this.seed = seed ?? Date.now();
    this.scenarioId = scenarioId;
    this.rng = new RNG(this.seed);
    this.terrain = this.generateTerrainProfile(this.seed);

    this.market.reset();
    this.government.reset();
    this.statistics.reset();
    this.initializeAgents();
  }
}
