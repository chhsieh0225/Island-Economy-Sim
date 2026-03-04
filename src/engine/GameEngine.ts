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
  PolicyTimelineEntry,
  PendingPolicyType,
  ScenarioId,
  DecisionChoice,
  EconomyStage,
  MilestoneRecord,
  IslandTerrainState,
  SectorDevelopmentLevel,
  ReflectiveQuestion,
  AgentBiography,
  BestOfRanking,
  TurnCausalReplay,
  CausalDriver,
} from '../types';
import { SECTORS } from '../types';
import { Agent } from './Agent';
import { Market } from './Market';
import { Government } from './Government';
import { Statistics } from './Statistics';
import { RNG } from './RNG';
import { computeScore } from './Scoring';
import { generateName } from '../data/names';
import { DEFAULT_SCENARIO, getScenarioById } from '../data/scenarios';
import { runSpoilagePhase, runProductionPhase, runMarketPostingPhase } from './phases/productionPhase';
import { runConsumptionPhase } from './phases/consumptionPhase';
import type { ConsumptionPhaseSummary } from './phases/consumptionPhase';
import { runAgingPhase, runLifeDeathPhase } from './phases/demographyPhase';
import type { DemographyPhaseSummary } from './phases/demographyPhase';
import { applyDecisionChoiceEffects, runRandomEventsPhase } from './phases/eventsPhase';
import { applyPendingPoliciesPhase } from './phases/policiesPhase';

export class GameEngine {
  turn: number = 0;
  agents: Agent[] = [];
  market: Market;
  government: Government;
  statistics: Statistics;
  terrain: IslandTerrainState;
  economyStage: EconomyStage = 'agriculture';
  events: GameEvent[] = [];
  milestones: MilestoneRecord[] = [];
  activeRandomEvents: ActiveRandomEvent[] = [];
  pendingDecision: PendingDecision | null = null;
  pendingPolicies: PendingPolicyChange[] = [];
  policyTimeline: PolicyTimelineEntry[] = [];

  rng: RNG;
  seed: number;
  scenarioId: ScenarioId;
  gameOver: GameOverState | null = null;

  private nextAgentId: number = CONFIG.INITIAL_POPULATION;
  private nextFamilyId: number = 1;
  private nextPolicyId: number = 1;
  private lastRandomEventTurn: number = -999;
  private lastDecisionTurn: number = -999;
  private eventChainSignals: Record<string, number> = {};
  private milestoneFlags: Set<string> = new Set();
  private _newMilestonesThisTurn: MilestoneRecord[] = [];

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
    this.economyStage = CONFIG.PROGRESSIVE_ECONOMY_ENABLED ? 'agriculture' : 'service';

    let i = 0;
    let familyId = 1;
    while (i < CONFIG.INITIAL_POPULATION) {
      const householdSize = this.rng.nextInt(1, 4);
      for (let member = 0; member < householdSize && i < CONFIG.INITIAL_POPULATION; member++, i++) {
        const unlocked = this.getUnlockedSectors();
        const sector = unlocked[this.rng.nextInt(0, unlocked.length - 1)];
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
    const emptyCausalReplay = this.buildZeroCausalReplay();

    if (this.gameOver) {
      return latestSnapshot ?? this.statistics.recordTurn(
        this.turn,
        this.agents,
        this.market,
        this.government,
        { births: 0, deaths: 0 },
        emptyCausalReplay,
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
        emptyCausalReplay,
      );
    }

    this.turn++;
    this._newMilestonesThisTurn = [];
    this.applyPendingPolicies();
    this.market.clearOrders();

    const aliveAgents = this.agents.filter(a => a.alive);
    const turnStartPopulation = aliveAgents.length;
    const turnStartAvgSatisfaction = this.averageAgentMetric(aliveAgents, agent => agent.satisfaction);
    const turnStartAvgHealth = this.averageAgentMetric(aliveAgents, agent => agent.health);
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
    const consumptionSummary = this.phaseConsumption(aliveAgents);

    // Phase 4.5: Family support transfers
    this.phaseFamilySupport(aliveAgents);

    // Phase 5: Government
    this.phaseGovernment(aliveAgents);

    // Phase 6: Agent Decisions
    this.phaseAgentDecisions(aliveAgents);

    // Phase 7: Aging
    const healthBeforeAging = this.averageAgentMetric(aliveAgents, agent => agent.health);
    this.phaseAging(aliveAgents);
    const healthAfterAging = this.averageAgentMetric(aliveAgents, agent => agent.health);
    const agingHealthDelta = healthAfterAging - healthBeforeAging;

    // Phase 8: Life/Death + Births
    const demographics = this.phaseLifeDeath(aliveAgents);

    // Phase 9: Random events and decision events
    this.phaseRandomEvents();

    // Phase 9.5: Economy progression unlock (applies to next-turn behavior)
    this.phaseEconomyProgression(this.agents.filter(a => a.alive));

    const endAliveAgents = this.agents.filter(a => a.alive);
    const turnEndAvgSatisfaction = this.averageAgentMetric(endAliveAgents, agent => agent.satisfaction);
    const turnEndAvgHealth = this.averageAgentMetric(endAliveAgents, agent => agent.health);
    const policySatisfactionEstimate = this.estimatePolicySatisfactionDelta();
    const causalReplay = this.buildTurnCausalReplay({
      startPopulation: turnStartPopulation,
      startAvgSatisfaction: turnStartAvgSatisfaction,
      endAvgSatisfaction: turnEndAvgSatisfaction,
      startAvgHealth: turnStartAvgHealth,
      endAvgHealth: turnEndAvgHealth,
      consumptionSummary,
      agingHealthDelta,
      policySatisfactionEstimate,
      demographics,
    });

    // Phase 10: Record income & statistics
    for (const agent of this.agents.filter(a => a.alive)) {
      agent.recordIncome();
    }
    const snapshot = this.statistics.recordTurn(
      this.turn,
      this.agents,
      this.market,
      this.government,
      demographics,
      causalReplay,
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
    runAgingPhase({
      turn: this.turn,
      agents,
      addEvent: (type, message) => this.addEvent(type, message),
    });
  }

  private phaseSpoilage(agents: Agent[]): void {
    runSpoilagePhase(agents);
  }

  private phaseProduction(agents: Agent[]): void {
    const allowedSectors = this.getUnlockedSectors();
    runProductionPhase({
      agents,
      activeRandomEvents: this.activeRandomEvents,
      terrain: this.terrain,
      government: this.government,
      workingAge: CONFIG.WORKING_AGE,
      allowedSectors,
      caregiverPenaltyPerChild: CONFIG.CAREGIVER_PRODUCTIVITY_PENALTY_PER_CHILD,
      caregiverPenaltyMax: CONFIG.CAREGIVER_PRODUCTIVITY_PENALTY_MAX,
    });
  }

  private phaseMarketPosting(aliveAgents: Agent[]): void {
    const demandMultipliers = this.getCurrentNeedMultipliers();
    runMarketPostingPhase({
      agents: aliveAgents,
      activeRandomEvents: this.activeRandomEvents,
      market: this.market,
      demandMultipliers,
    });
  }

  private phaseConsumption(agents: Agent[]): ConsumptionPhaseSummary {
    const demandMultipliers = this.getCurrentNeedMultipliers();
    return runConsumptionPhase(agents, this.activeRandomEvents, demandMultipliers);
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
    const rate = this.government.taxRate;
    const prevTreasuryTax = this.government.treasury;
    const taxCollected = this.government.collectTaxes(agents);
    if (taxCollected > 0) {
      const newTreasuryTax = this.government.treasury;
      this.addEvent('info', `📋 稅率 ${(rate * 100).toFixed(0)}% 生效 → 本回合稅收 $${taxCollected.toFixed(0)}（國庫 $${prevTreasuryTax.toFixed(0)} → $${newTreasuryTax.toFixed(0)}）`);
    }

    const prevTreasuryWelfare = this.government.treasury;
    const welfareSpent = this.government.distributeWelfare(agents);
    if (welfareSpent > 0) {
      const afterTreasuryWelfare = this.government.treasury;
      const aliveCount = agents.filter(a => a.alive).length;
      const recipients = Math.floor(aliveCount * CONFIG.WELFARE_THRESHOLD_PERCENTILE);
      this.addEvent('info', `📋 福利發放 → ${recipients} 人各獲 $${CONFIG.WELFARE_AMOUNT}（國庫 $${prevTreasuryWelfare.toFixed(0)} → $${afterTreasuryWelfare.toFixed(0)}）`);
    }

    const prevTreasuryPW = this.government.treasury;
    const pwPaid = this.government.payPublicWorks();
    if (pwPaid) {
      this.addEvent('info', `📋 公共建設支出 $${CONFIG.PUBLIC_WORKS_COST_PER_TURN} → 全體生產力 +10%`);
    } else if (this.government.publicWorksActive === false && prevTreasuryPW < CONFIG.PUBLIC_WORKS_COST_PER_TURN && prevTreasuryPW > 0) {
      // Public works was auto-disabled due to insufficient funds
      this.addEvent('warning', `公共建設因國庫不足（$${prevTreasuryPW.toFixed(0)} < $${CONFIG.PUBLIC_WORKS_COST_PER_TURN}）自動停用。`);
    }
  }

  private phaseAgentDecisions(agents: Agent[]): void {
    const prices = { ...this.market.prices };
    const allowedSectors = this.getUnlockedSectors();
    for (const agent of agents) {
      if (agent.age < CONFIG.WORKING_AGE) continue;
      const switchTo = agent.evaluateJob(prices, this.rng, allowedSectors);
      if (switchTo) {
        const oldSector = agent.sector;
        agent.switchJob(switchTo);
        agent.addLifeEvent(this.turn, 'job', `從${this.sectorLabel(oldSector)}轉職到${this.sectorLabel(switchTo)}。`, 'info');
        this.addEvent('info', `${agent.name} 從${this.sectorLabel(oldSector)}轉職到${this.sectorLabel(switchTo)}。`);
      }
    }
  }

  private phaseLifeDeath(agents: Agent[]): DemographyPhaseSummary {
    return runLifeDeathPhase({
      turn: this.turn,
      agents,
      allAgents: this.agents,
      rng: this.rng,
      createNewAgent: (familyId, ageTurns, bornOnIsland) => this.createNewAgent(familyId, ageTurns, bornOnIsland),
      addEvent: (type, message) => this.addEvent(type, message),
    });
  }

  private createNewAgent(
    familyId?: number,
    ageTurns: number = CONFIG.MIN_STARTING_AGE,
    bornOnIsland: boolean = false,
  ): Agent {
    const id = this.nextAgentId++;
    const gender = this.rng.next() < 0.5 ? 'M' as const : 'F' as const;
    const name = generateName(gender, this.rng);

    const aliveAgents = this.agents.filter(a => a.alive);
    const sectorCounts: Record<SectorType, number> = { food: 0, goods: 0, services: 0 };
    for (const a of aliveAgents) {
      sectorCounts[a.sector]++;
    }
    const unlocked = this.getUnlockedSectors();
    const sector = unlocked.reduce((min, s) => sectorCounts[s] < sectorCounts[min] ? s : min);

    const assignedFamilyId = familyId ?? this.nextFamilyId++;
    const agent = new Agent(id, name, sector, this.rng, {
      age: ageTurns,
      gender,
      familyId: assignedFamilyId,
    });
    if (bornOnIsland) {
      agent.addLifeEvent(this.turn, 'join', `在小島出生，目前由家戶照顧中（${Math.floor(ageTurns / 12)} 歲）。`, 'positive');
    } else {
      agent.addLifeEvent(this.turn, 'join', `加入小島，就業於${this.sectorLabel(sector)}。`, 'positive');
    }
    return agent;
  }

  private getUnlockedSectors(): SectorType[] {
    switch (this.economyStage) {
      case 'agriculture':
        return ['food'];
      case 'industrial':
        return ['food', 'goods'];
      case 'service':
        return ['food', 'goods', 'services'];
    }
  }

  private getCurrentNeedMultipliers(): Record<SectorType, number> {
    return { ...CONFIG.STAGE_NEED_MULTIPLIERS[this.economyStage] };
  }

  private averageAgentMetric(agents: Agent[], accessor: (agent: Agent) => number): number {
    if (agents.length === 0) return 0;
    const sum = agents.reduce((acc, agent) => acc + accessor(agent), 0);
    return sum / agents.length;
  }

  private roundMetric(value: number): number {
    return Math.round(value * 100) / 100;
  }

  private perCapitaDelta(totalDelta: number, startPopulation: number): number {
    if (startPopulation <= 0) return 0;
    return totalDelta / startPopulation;
  }

  private nonZeroDrivers(drivers: CausalDriver[]): CausalDriver[] {
    const visible = drivers.filter(driver => Math.abs(driver.value) >= 0.01);
    if (visible.length > 0) return visible;
    return [{ id: 'flat', label: '本回合變化很小', value: 0 }];
  }

  private buildZeroCausalReplay(): TurnCausalReplay {
    return {
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
    };
  }

  private estimatePolicySatisfactionDelta(): number {
    const shortageRatios = SECTORS.map(sector => {
      const demand = this.market.demand[sector];
      if (demand <= 0.001) return 0;
      return Math.max(0, (demand - this.market.supply[sector]) / demand);
    });
    const shortagePressure = shortageRatios.reduce((sum, ratio) => sum + ratio, 0) / shortageRatios.length;
    const shortagePenalty = -Math.min(7, shortagePressure * 8.5);
    const taxPenalty = -Math.max(0, (this.government.taxRate - 0.1) * 24);
    const welfareBoost = this.government.welfareEnabled ? 1.4 : 0;
    const publicWorksBoost = this.government.publicWorksActive ? 0.9 : 0;
    const eventBoost = this.activeRandomEvents.reduce(
      (sum, event) => sum + (event.def.effects.satisfactionBoost ?? 0) - (event.def.effects.healthDamage ?? 0) * 0.28,
      0,
    );
    return shortagePenalty + taxPenalty + welfareBoost + publicWorksBoost + eventBoost;
  }

  private buildTurnCausalReplay({
    startPopulation,
    startAvgSatisfaction,
    endAvgSatisfaction,
    startAvgHealth,
    endAvgHealth,
    consumptionSummary,
    agingHealthDelta,
    policySatisfactionEstimate,
    demographics,
  }: {
    startPopulation: number;
    startAvgSatisfaction: number;
    endAvgSatisfaction: number;
    startAvgHealth: number;
    endAvgHealth: number;
    consumptionSummary: ConsumptionPhaseSummary;
    agingHealthDelta: number;
    policySatisfactionEstimate: number;
    demographics: DemographyPhaseSummary;
  }): TurnCausalReplay {
    if (startPopulation <= 0) return this.buildZeroCausalReplay();

    const satNeeds = this.perCapitaDelta(consumptionSummary.needsSatisfactionDelta, startPopulation);
    const satEvents = this.perCapitaDelta(consumptionSummary.eventSatisfactionDelta, startPopulation);
    const satPolicyEstimate = policySatisfactionEstimate;
    const satNet = endAvgSatisfaction - startAvgSatisfaction;
    const satResidual = satNet - satNeeds - satEvents - satPolicyEstimate;

    const healthNeeds = this.perCapitaDelta(consumptionSummary.needsHealthDelta, startPopulation);
    const healthEvents = this.perCapitaDelta(consumptionSummary.eventHealthDelta, startPopulation);
    const healthAging = agingHealthDelta;
    const healthNet = endAvgHealth - startAvgHealth;
    const healthResidual = healthNet - healthNeeds - healthEvents - healthAging;

    const departuresNet = demographics.deaths - demographics.births;

    return {
      satisfaction: {
        net: this.roundMetric(satNet),
        unit: 'point',
        drivers: this.nonZeroDrivers([
          {
            id: 'needs',
            label: `需求狀態（缺口 ${consumptionSummary.unmetNeedCount}）`,
            value: this.roundMetric(satNeeds),
          },
          {
            id: 'events',
            label: '事件衝擊',
            value: this.roundMetric(satEvents),
          },
          {
            id: 'policy_est',
            label: '政策壓力（估算）',
            value: this.roundMetric(satPolicyEstimate),
          },
          {
            id: 'residual',
            label: '其他與人口組成',
            value: this.roundMetric(satResidual),
          },
        ]),
      },
      health: {
        net: this.roundMetric(healthNet),
        unit: 'point',
        drivers: this.nonZeroDrivers([
          {
            id: 'needs',
            label: `需求與照護（缺口 ${consumptionSummary.unmetNeedCount}）`,
            value: this.roundMetric(healthNeeds),
          },
          {
            id: 'events',
            label: '事件衝擊',
            value: this.roundMetric(healthEvents),
          },
          {
            id: 'aging',
            label: '老化效應',
            value: this.roundMetric(healthAging),
          },
          {
            id: 'residual',
            label: '其他與人口組成',
            value: this.roundMetric(healthResidual),
          },
        ]),
      },
      departures: {
        net: departuresNet,
        unit: 'count',
        drivers: this.nonZeroDrivers([
          {
            id: 'left',
            label: '不滿離島',
            value: demographics.deathByCause.left,
          },
          {
            id: 'health',
            label: '健康死亡',
            value: demographics.deathByCause.health,
          },
          {
            id: 'age',
            label: '老化死亡',
            value: demographics.deathByCause.age,
          },
          {
            id: 'births',
            label: '新生加入',
            value: -demographics.births,
          },
        ]),
      },
    };
  }

  private phaseEconomyProgression(agents: Agent[]): void {
    if (!CONFIG.PROGRESSIVE_ECONOMY_ENABLED) return;

    if (this.economyStage === 'agriculture') {
      const foodDemand = this.market.demand.food;
      const foodSupply = this.market.supply.food;
      const foodCoverage = foodDemand > 0.01 ? foodSupply / foodDemand : 1;
      if (this.turn >= CONFIG.STAGE_INDUSTRIAL_MIN_TURN && foodCoverage >= CONFIG.STAGE_INDUSTRIAL_MIN_FOOD_COVERAGE) {
        this.economyStage = 'industrial';
        this.addEvent('positive', '產業升級：島嶼進入工業化階段，商品業開始成形。');
      }
      return;
    }

    if (this.economyStage === 'industrial') {
      const adultWorkers = agents.filter(a => a.age >= CONFIG.WORKING_AGE);
      const goodsWorkers = adultWorkers.filter(a => a.sector === 'goods').length;
      const goodsShare = goodsWorkers / Math.max(1, adultWorkers.length);
      const avgSat = agents.reduce((sum, a) => sum + a.satisfaction, 0) / Math.max(1, agents.length);
      if (
        this.turn >= CONFIG.STAGE_SERVICE_MIN_TURN &&
        goodsShare >= CONFIG.STAGE_SERVICE_MIN_GOODS_WORKER_SHARE &&
        avgSat >= CONFIG.STAGE_SERVICE_MIN_AVG_SATISFACTION
      ) {
        this.economyStage = 'service';
        this.addEvent('positive', '產業升級：島嶼進入服務化階段，服務業全面展開。');
      }
    }
  }

  private phaseRandomEvents(): void {
    const result = runRandomEventsPhase({
      turn: this.turn,
      rng: this.rng,
      market: this.market,
      activeRandomEvents: this.activeRandomEvents,
      pendingDecision: this.pendingDecision,
      lastRandomEventTurn: this.lastRandomEventTurn,
      lastDecisionTurn: this.lastDecisionTurn,
      eventChainSignals: this.eventChainSignals,
      addEvent: (type, message) => this.addEvent(type, message),
    });
    this.activeRandomEvents = result.activeRandomEvents;
    this.pendingDecision = result.pendingDecision;
    this.lastRandomEventTurn = result.lastRandomEventTurn;
    this.lastDecisionTurn = result.lastDecisionTurn;
    this.eventChainSignals = result.eventChainSignals;
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
    applyDecisionChoiceEffects({
      choice,
      turn: this.turn,
      rng: this.rng,
      agents: this.agents,
      government: this.government,
      activeRandomEvents: this.activeRandomEvents,
      addEvent: (type, message) => this.addEvent(type, message),
    });
  }

  private applyPendingPolicies(): void {
    this.pendingPolicies = applyPendingPoliciesPhase({
      turn: this.turn,
      pendingPolicies: this.pendingPolicies,
      government: this.government,
      markPolicyApplied: policy => this.markPolicyTimelineApplied(policy),
      addEvent: (type, message) => this.addEvent(type, message),
    });
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

  get newMilestones(): MilestoneRecord[] {
    return this._newMilestonesThisTurn;
  }

  private addMilestone(record: MilestoneRecord): void {
    this._newMilestonesThisTurn.push(record);
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

  private upsertPolicyTimeline(policy: PendingPolicyChange): void {
    const nextEntry: PolicyTimelineEntry = {
      id: policy.id,
      type: policy.type,
      requestedTurn: policy.requestedTurn,
      applyTurn: policy.applyTurn,
      status: 'pending',
      value: policy.value,
      sector: policy.sector,
      summary: policy.summary,
      sideEffects: [...policy.sideEffects],
    };

    const existingIdx = this.policyTimeline.findIndex(entry => entry.id === policy.id);
    if (existingIdx >= 0) {
      this.policyTimeline[existingIdx] = nextEntry;
    } else {
      this.policyTimeline.unshift(nextEntry);
      if (this.policyTimeline.length > 80) {
        this.policyTimeline.pop();
      }
    }
  }

  private markPolicyTimelineApplied(policy: PendingPolicyChange): void {
    const existingIdx = this.policyTimeline.findIndex(entry => entry.id === policy.id);
    if (existingIdx >= 0) {
      this.policyTimeline[existingIdx] = {
        ...this.policyTimeline[existingIdx],
        status: 'applied',
        resolvedTurn: this.turn,
        applyTurn: policy.applyTurn,
        value: policy.value,
        summary: policy.summary,
        sideEffects: [...policy.sideEffects],
      };
      return;
    }

    this.policyTimeline.unshift({
      id: policy.id,
      type: policy.type,
      requestedTurn: policy.requestedTurn,
      applyTurn: policy.applyTurn,
      resolvedTurn: this.turn,
      status: 'applied',
      value: policy.value,
      sector: policy.sector,
      summary: policy.summary,
      sideEffects: [...policy.sideEffects],
    });
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
    this.upsertPolicyTimeline(nextPolicy);
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

  private classifySectorDevelopment(share: number): SectorDevelopmentLevel {
    if (share >= 45) return '主導';
    if (share >= 33) return '成熟';
    if (share >= 20) return '成長';
    if (share >= 10) return '起步';
    return '薄弱';
  }

  private getSectorDevelopmentComment(sector: SectorType, level: SectorDevelopmentLevel): string {
    const comments: Record<SectorType, Record<SectorDevelopmentLevel, string>> = {
      food: {
        薄弱: '糧食基礎不足，遇到衝擊時風險偏高。',
        起步: '糧食供給剛起步，仍需擴大生產能力。',
        成長: '糧食體系逐步穩定，已具備基本支撐力。',
        成熟: '糧食供應成熟，對人口承載較有保障。',
        主導: '糧食產業高度主導，安全盤穩但結構較單一。',
      },
      goods: {
        薄弱: '製造產能偏弱，實體經濟擴張受限。',
        起步: '工坊與生產鏈剛建立，仍在打底階段。',
        成長: '製造部門穩定成長，帶動交易活力。',
        成熟: '商品產業成熟，是經濟增長的重要引擎。',
        主導: '商品業高度集中，效率高但波動風險上升。',
      },
      services: {
        薄弱: '服務供給不足，生活品質與消費偏弱。',
        起步: '服務業剛形成，內需體驗還在建立。',
        成長: '服務業穩步發展，內需韌性逐漸提升。',
        成熟: '服務網絡成熟，居民福祉與交易體驗良好。',
        主導: '服務業主導結構，內需強勁但實體供應需平衡。',
      },
    };

    return comments[sector][level];
  }

  private buildSectorDevelopment(history: TurnSnapshot[]): GameOverState['finalStats']['sectorDevelopment'] {
    const latest = history[history.length - 1];
    const distribution: Record<SectorType, number> = latest?.jobDistribution ?? {
      food: 0,
      goods: 0,
      services: 0,
    };
    const total = Math.max(1, distribution.food + distribution.goods + distribution.services);

    const result = {} as GameOverState['finalStats']['sectorDevelopment'];
    for (const sector of SECTORS) {
      const share = (distribution[sector] / total) * 100;
      const level = this.classifySectorDevelopment(share);
      result[sector] = {
        share,
        level,
        comment: this.getSectorDevelopmentComment(sector, level),
      };
    }
    return result;
  }

  private buildCounterfactualNotes(history: TurnSnapshot[]): string[] {
    const latest = history[history.length - 1];
    if (!latest) {
      return ['資料不足，建議先運行數回合再比較政策反事實。'];
    }

    const notes: string[] = [];
    const taxPct = latest.government.taxRate * 100;
    const totalPopulationSeen = Math.max(1, this.agents.length);
    const leftCount = this.agents.filter(a => a.causeOfDeath === 'left').length;
    const leaveRate = (leftCount / totalPopulationSeen) * 100;

    if (taxPct >= 12) {
      const taxCut = 5;
      const taxRelief = Math.max(1, (taxPct - 10) * 0.18 + latest.giniCoefficient * 3.2);
      notes.push(
        `若稅率下調 ${taxCut}%（${taxPct.toFixed(0)}% → ${Math.max(0, taxPct - taxCut).toFixed(0)}%），估計離島率可減少約 ${taxRelief.toFixed(1)}%（現況約 ${leaveRate.toFixed(1)}%）。`,
      );
    }

    const foodDemand = latest.market.demand.food;
    const foodSupply = latest.market.supply.food;
    const foodGapRatio = foodDemand > 0 ? Math.max(0, (foodDemand - foodSupply) / foodDemand) : 0;
    if (foodGapRatio > 0.1) {
      const satLift = Math.min(7.5, 2 + foodGapRatio * 10);
      notes.push(
        `若把食物缺口補回一半，估計平均滿意度可回升約 ${satLift.toFixed(1)}%。`,
      );
    }

    if (!latest.government.welfareEnabled && latest.giniCoefficient > 0.44) {
      const giniDrop = Math.min(0.08, 0.02 + (latest.giniCoefficient - 0.44) * 0.35);
      notes.push(`若啟用福利並持續 12 回合，估計基尼可下降約 ${giniDrop.toFixed(3)}。`);
    }

    if (notes.length === 0) {
      notes.push('現況結構相對平衡：可用稅率或補貼 ±5% 做對照實驗，觀察中期差異。');
    }

    return notes.slice(0, 3);
  }

  private buildReflectiveQuestions(): ReflectiveQuestion[] {
    const history = this.statistics.history;
    const latest = history[history.length - 1];
    const questions: ReflectiveQuestion[] = [];

    // Gini comparison
    const gini = latest?.giniCoefficient ?? 0;
    const country = gini < 0.3 ? '北歐國家' : gini < 0.35 ? '台灣' : gini < 0.4 ? '美國' : gini < 0.45 ? '巴西' : '南非';
    questions.push({
      question: `你的島嶼 Gini=${gini.toFixed(2)}，接近${country}的水平。你覺得不平等是經濟成長的必然代價嗎？`,
      context: '基尼係數反映財富分配不均的程度。現實中各國選擇了不同的平衡點。',
      realWorldComparison: '台灣≈0.34, 美國≈0.39, 北歐≈0.27, 巴西≈0.48',
    });

    // Tax rate reflection
    const avgTax = history.reduce((s, h) => s + h.government.taxRate, 0) / Math.max(1, history.length);
    questions.push({
      question: `你的平均稅率是 ${(avgTax * 100).toFixed(0)}%。高稅率能支撐更多公共服務，但是否壓抑了經濟活力？`,
      context: '這是經濟學中「效率 vs 公平」的經典取捨。',
      realWorldComparison: '北歐稅率約 45-55%, 美國約 25-35%, 香港約 15%',
    });

    return questions.slice(0, 2);
  }

  private generateNarrative(agent: Agent): string {
    let text = `${agent.name}（IQ ${agent.intelligence}）`;
    const jobs = agent.lifeEvents.filter(e => e.category === 'job');
    const achievements = agent.lifeEvents.filter(e => e.category === 'achievement');
    if (jobs.length > 0) text += `，歷經 ${jobs.length} 次轉職`;
    if (achievements.length > 0) text += `，獲得 ${achievements.length} 項成就`;
    text += `，最終累積財富 $${agent.money.toFixed(0)}`;
    if (!agent.alive) {
      const cause = agent.causeOfDeath === 'age' ? '壽終正寢' : agent.causeOfDeath === 'health' ? '因病離世' : '離開了小島';
      text += `。${Math.floor(agent.age / 12)} 歲時${cause}。`;
    } else {
      text += `。至今仍健在（${Math.floor(agent.age / 12)} 歲）。`;
    }
    return text;
  }

  private buildAgentBiographies(): AgentBiography[] {
    const all = this.agents;
    const biographies: AgentBiography[] = [];

    // Richest agent
    const richest = all.reduce((b, a) => a.money > b.money ? a : b);
    biographies.push({
      agentId: richest.id,
      name: richest.name,
      title: '💰 最富有的島民',
      narrative: this.generateNarrative(richest),
      highlights: richest.lifeEvents
        .filter(e => e.category === 'achievement' || e.category === 'job')
        .slice(-3)
        .map(e => e.message),
    });

    // Oldest agent
    const oldest = all.reduce((b, a) => a.age > b.age ? a : b);
    if (oldest.id !== richest.id) {
      biographies.push({
        agentId: oldest.id,
        name: oldest.name,
        title: '🎂 最年長的島民',
        narrative: this.generateNarrative(oldest),
        highlights: oldest.lifeEvents
          .filter(e => e.category === 'achievement' || e.category === 'job')
          .slice(-3)
          .map(e => e.message),
      });
    }

    // Most switches (if >= 2)
    const switcher = all.reduce((b, a) => a.totalSwitches > b.totalSwitches ? a : b);
    if (switcher.totalSwitches >= 2 && switcher.id !== richest.id && switcher.id !== oldest.id) {
      biographies.push({
        agentId: switcher.id,
        name: switcher.name,
        title: '🔄 最多轉職的島民',
        narrative: this.generateNarrative(switcher),
        highlights: switcher.lifeEvents
          .filter(e => e.category === 'achievement' || e.category === 'job')
          .slice(-3)
          .map(e => e.message),
      });
    }

    return biographies;
  }

  private buildBestOfRankings(): BestOfRanking[] {
    const all = this.agents;
    const rankings: BestOfRanking[] = [];
    const richest = all.reduce((b, a) => a.money > b.money ? a : b);
    rankings.push({ category: 'wealth', label: '💰 最富有', agentName: richest.name, value: `$${richest.money.toFixed(0)}` });
    const oldest = all.reduce((b, a) => a.age > b.age ? a : b);
    rankings.push({ category: 'age', label: '🎂 最長壽', agentName: oldest.name, value: `${Math.floor(oldest.age / 12)} 歲` });
    const switcher = all.reduce((b, a) => a.totalSwitches > b.totalSwitches ? a : b);
    if (switcher.totalSwitches > 0) rankings.push({ category: 'career', label: '🔄 最多轉職', agentName: switcher.name, value: `${switcher.totalSwitches} 次` });
    const smartest = all.reduce((b, a) => a.intelligence > b.intelligence ? a : b);
    rankings.push({ category: 'iq', label: '🧠 最聰明', agentName: smartest.name, value: `IQ ${smartest.intelligence}` });
    return rankings;
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
        sectorDevelopment: this.buildSectorDevelopment(history),
        counterfactualNotes: this.buildCounterfactualNotes(history),
        reflectiveQuestions: this.buildReflectiveQuestions(),
        agentBiographies: this.buildAgentBiographies(),
        bestOfRankings: this.buildBestOfRankings(),
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
      economyStage: this.economyStage,
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
      policyTimeline: this.policyTimeline.map(entry => ({ ...entry, sideEffects: [...entry.sideEffects] })),
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
    this.policyTimeline = [];
    this.gameOver = null;
    this.nextPolicyId = 1;
    this.lastRandomEventTurn = -999;
    this.lastDecisionTurn = -999;
    this.eventChainSignals = {};
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
