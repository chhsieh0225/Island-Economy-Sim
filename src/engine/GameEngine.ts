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
} from '../types';
import { SECTORS } from '../types';
import { Agent } from './Agent';
import { Market } from './Market';
import { Government } from './Government';
import { Statistics } from './Statistics';
import { RNG } from './RNG';
import { generateName } from '../data/names';
import { DEFAULT_SCENARIO, getScenarioById } from '../data/scenarios';
import { runSpoilagePhase, runProductionPhase, runMarketPostingPhase } from './phases/productionPhase';
import { runConsumptionPhase } from './phases/consumptionPhase';
import type { ConsumptionPhaseSummary } from './phases/consumptionPhase';
import { runAgingPhase, runLifeDeathPhase } from './phases/demographyPhase';
import type { DemographyPhaseSummary } from './phases/demographyPhase';
import { applyDecisionChoiceEffects, runRandomEventsPhase } from './phases/eventsPhase';
import { applyPendingPoliciesPhase } from './phases/policiesPhase';
import {
  buildTurnCausalReplay as buildTurnCausalReplayModule,
  buildZeroCausalReplay,
} from './modules/economyModule';
import {
  evaluateEconomyStageProgression,
  getStageNeedMultipliers,
  getUnlockedSectorsForStage,
} from './modules/progressionModule';
import { evaluateMilestones } from './modules/milestonesModule';
import {
  buildGameOverState as buildGameOverStateModule,
  deriveGameOverReason,
} from './modules/gameOverModule';
import {
  getPolicySideEffects as getPolicySideEffectsModule,
  markPolicyTimelineApplied as markPolicyTimelineAppliedModule,
  queuePolicyChange,
} from './modules/policyModule';
import { runTurnPipeline, type TurnGovernmentSummary } from './modules/turnPipelineModule';
import {
  DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID,
  getEconomicCalibrationProfile,
  type EconomicCalibrationProfile,
  type EconomicCalibrationProfileId,
} from './economicCalibration';

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
  private economicCalibrationProfileId: EconomicCalibrationProfileId;

  private nextAgentId: number = CONFIG.INITIAL_POPULATION;
  private nextFamilyId: number = 1;
  private nextPolicyId: number = 1;
  private lastRandomEventTurn: number = -999;
  private lastDecisionTurn: number = -999;
  private eventChainSignals: Record<string, number> = {};
  private milestoneFlags: Set<string> = new Set();
  private _newMilestonesThisTurn: MilestoneRecord[] = [];
  private stageTransitionFrom: EconomyStage | null = null;
  private stageTransitionStartTurn: number | null = null;
  private cachedState: GameState | null = null;
  private stateDirty: {
    agents: boolean;
    terrain: boolean;
    market: boolean;
    government: boolean;
    statistics: boolean;
    events: boolean;
    milestones: boolean;
    activeRandomEvents: boolean;
    pendingDecision: boolean;
    pendingPolicies: boolean;
    policyTimeline: boolean;
    gameOver: boolean;
  } = {
      agents: true,
      terrain: true,
      market: true,
      government: true,
      statistics: true,
      events: true,
      milestones: true,
      activeRandomEvents: true,
      pendingDecision: true,
      pendingPolicies: true,
      policyTimeline: true,
      gameOver: true,
    };

  constructor(
    seed?: number,
    scenarioId: ScenarioId = DEFAULT_SCENARIO,
    calibrationProfileId: EconomicCalibrationProfileId = DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID,
  ) {
    this.seed = seed ?? Date.now();
    this.scenarioId = scenarioId;
    this.economicCalibrationProfileId = calibrationProfileId;
    this.rng = new RNG(this.seed);
    this.market = new Market({
      getEconomicCalibration: () => this.getEconomicCalibration(),
    });
    this.government = new Government();
    this.statistics = new Statistics();
    this.terrain = this.generateTerrainProfile(this.seed);
    this.initializeAgents();
  }

  getEconomicCalibrationProfileId(): EconomicCalibrationProfileId {
    return this.economicCalibrationProfileId;
  }

  setEconomicCalibrationProfile(id: EconomicCalibrationProfileId): void {
    this.economicCalibrationProfileId = id;
  }

  private getEconomicCalibration(): EconomicCalibrationProfile {
    return getEconomicCalibrationProfile(this.economicCalibrationProfileId);
  }

  private markStateDirty(...keys: Array<keyof GameEngine['stateDirty']>): void {
    for (const key of keys) {
      this.stateDirty[key] = true;
    }
  }

  private clearStateDirty(): void {
    this.stateDirty.agents = false;
    this.stateDirty.terrain = false;
    this.stateDirty.market = false;
    this.stateDirty.government = false;
    this.stateDirty.statistics = false;
    this.stateDirty.events = false;
    this.stateDirty.milestones = false;
    this.stateDirty.activeRandomEvents = false;
    this.stateDirty.pendingDecision = false;
    this.stateDirty.pendingPolicies = false;
    this.stateDirty.policyTimeline = false;
    this.stateDirty.gameOver = false;
  }

  private initializeAgents(): void {
    this.agents = [];
    this.economyStage = CONFIG.PROGRESSIVE_ECONOMY_ENABLED ? 'agriculture' : 'service';
    this.stageTransitionFrom = null;
    this.stageTransitionStartTurn = null;

    let i = 0;
    let familyId = 1;
    while (i < CONFIG.INITIAL_POPULATION) {
      const householdSize = this.rng.nextInt(1, 4);
      for (let member = 0; member < householdSize && i < CONFIG.INITIAL_POPULATION; member++, i++) {
        const unlocked = this.getUnlockedSectors();
        const sector = unlocked[this.rng.nextInt(0, unlocked.length - 1)];
        const gender = this.rng.next() < 0.5 ? 'M' as const : 'F' as const;
        const name = generateName(gender, this.rng);
        const agent = new Agent(i, name, sector, this.rng, {
          gender,
          familyId,
          getEconomicCalibration: () => this.getEconomicCalibration(),
        });
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
    if (scenario.initialPolicyRate !== undefined) {
      this.government.setPolicyRate(scenario.initialPolicyRate);
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
    if (scenario.enableLiquiditySupport !== undefined) {
      this.government.setLiquiditySupport(scenario.enableLiquiditySupport);
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

    this.market.setMonetaryStance(this.government.policyRate, this.government.liquiditySupportActive);
  }

  advanceTurn(): TurnSnapshot {
    const latestSnapshot = this.statistics.history[this.statistics.history.length - 1];
    if (this.gameOver || this.pendingDecision) {
      return this.latestSnapshotOrRecord(latestSnapshot);
    }

    this.turn++;
    this._newMilestonesThisTurn = [];
    this.applyPendingPolicies();
    this.market.clearOrders();

    const aliveAgents = this.agents.filter(a => a.alive);
    this.market.setAgents(aliveAgents);

    const pipeline = runTurnPipeline({
      aliveAgents,
      getAliveAgents: () => this.agents.filter(a => a.alive),
      averageMetric: (agents, accessor) => this.averageAgentMetric(agents, accessor),
      phaseRollLuck: agents => this.phaseRollLuck(agents),
      phaseProduction: agents => this.phaseProduction(agents),
      phaseMarketPosting: agents => this.phaseMarketPosting(agents),
      clearMarket: () => {
        this.market.setMonetaryStance(this.government.policyRate, this.government.liquiditySupportActive);
        this.market.clearMarket();
      },
      phaseSpoilage: agents => this.phaseSpoilage(agents),
      phaseConsumption: agents => this.phaseConsumption(agents),
      phaseFamilySupport: agents => this.phaseFamilySupport(agents),
      phaseGovernment: agents => this.phaseGovernment(agents),
      phaseHouseholdFinance: agents => this.phaseHouseholdFinance(agents),
      phaseAgentDecisions: agents => this.phaseAgentDecisions(agents),
      phaseAging: agents => this.phaseAging(agents),
      phaseLifeDeath: agents => this.phaseLifeDeath(agents),
      phaseRandomEvents: () => this.phaseRandomEvents(),
      phaseEconomyProgression: agents => this.phaseEconomyProgression(agents),
    });

    const causalReplay = buildTurnCausalReplayModule({
      startPopulation: pipeline.startPopulation,
      startAvgSatisfaction: pipeline.startAvgSatisfaction,
      endAvgSatisfaction: pipeline.endAvgSatisfaction,
      startAvgHealth: pipeline.startAvgHealth,
      endAvgHealth: pipeline.endAvgHealth,
      consumptionSummary: pipeline.consumptionSummary,
      financialSatisfactionDelta: pipeline.financialSatisfactionDelta,
      agingHealthDelta: pipeline.agingHealthDelta,
      governmentSummary: pipeline.governmentSummary,
      demographics: pipeline.demographics,
    });

    // Phase 10: Record income & statistics
    for (const agent of pipeline.endAliveAgents) {
      agent.recordIncome();
    }
    const snapshot = this.statistics.recordTurn(
      this.turn,
      this.agents,
      this.market,
      this.government,
      pipeline.demographics,
      causalReplay,
    );
    this.phaseMilestones();

    // Check end conditions
    this.gameOver = this.checkEndConditions();
    if (this.gameOver) {
      this.addEvent('critical', this.getGameOverMessage(this.gameOver.reason));
    }

    this.markStateDirty(
      'agents',
      'market',
      'government',
      'statistics',
      'events',
      'milestones',
      'activeRandomEvents',
      'pendingDecision',
      'pendingPolicies',
      'policyTimeline',
      'gameOver',
    );

    return snapshot;
  }

  private latestSnapshotOrRecord(latestSnapshot?: TurnSnapshot): TurnSnapshot {
    if (latestSnapshot) return latestSnapshot;
    return this.statistics.recordTurn(
      this.turn,
      this.agents,
      this.market,
      this.government,
      { births: 0, deaths: 0 },
      buildZeroCausalReplay(),
    );
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
      calibration: this.getEconomicCalibration(),
    });
  }

  private phaseMarketPosting(aliveAgents: Agent[]): void {
    const demandMultipliers = this.getCurrentNeedMultipliers();
    const allowedSectors = this.getUnlockedSectors();
    runMarketPostingPhase({
      agents: aliveAgents,
      activeRandomEvents: this.activeRandomEvents,
      market: this.market,
      demandMultipliers,
      allowedSectors,
    });
  }

  private phaseConsumption(agents: Agent[]): ConsumptionPhaseSummary {
    const demandMultipliers = this.getCurrentNeedMultipliers();
    return runConsumptionPhase(
      agents,
      this.activeRandomEvents,
      demandMultipliers,
      this.getUnlockedSectors(),
    );
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

  private phaseGovernment(agents: Agent[]): TurnGovernmentSummary {
    const aliveCount = agents.filter(a => a.alive).length;
    const treasuryStart = this.government.treasury;

    const rate = this.government.taxRate;
    const prevTreasuryTax = this.government.treasury;
    const taxCollected = this.government.collectTaxes(agents);
    if (taxCollected > 0) {
      const newTreasuryTax = this.government.treasury;
      this.addEvent('info', `📋 稅率 ${(rate * 100).toFixed(0)}% 生效 → 本回合稅收 $${taxCollected.toFixed(0)}（國庫 $${prevTreasuryTax.toFixed(0)} → $${newTreasuryTax.toFixed(0)}）`);
    }

    const prevTreasuryWelfare = this.government.treasury;
    const welfareResult = this.government.distributeWelfare(agents);
    const welfareSpent = welfareResult.totalSpent;
    const welfareRecipients = welfareResult.recipients;
    if (welfareSpent > 0) {
      const afterTreasuryWelfare = this.government.treasury;
      this.addEvent('info', `📋 福利發放 → ${welfareRecipients} 人獲補助（國庫 $${prevTreasuryWelfare.toFixed(0)} → $${afterTreasuryWelfare.toFixed(0)}）`);
    }

    const prevTreasuryPW = this.government.treasury;
    const pwPaid = this.government.payPublicWorks();
    const publicWorksSpent = pwPaid ? CONFIG.PUBLIC_WORKS_COST_PER_TURN : 0;
    if (pwPaid) {
      this.addEvent('info', `📋 公共建設支出 $${CONFIG.PUBLIC_WORKS_COST_PER_TURN} → 全體生產力 +10%`);
    } else if (this.government.publicWorksActive === false && prevTreasuryPW < CONFIG.PUBLIC_WORKS_COST_PER_TURN && prevTreasuryPW > 0) {
      // Public works was auto-disabled due to insufficient funds
      this.addEvent('warning', `公共建設因國庫不足（$${prevTreasuryPW.toFixed(0)} < $${CONFIG.PUBLIC_WORKS_COST_PER_TURN}）自動停用。`);
    }

    const prevTreasuryLiquidity = this.government.treasury;
    let liquidityInjected = 0;
    let liquidityRecipients = 0;
    if (this.government.liquiditySupportActive) {
      const eligible = agents
        .filter(a => a.alive)
        .sort((a, b) => (a.money + a.savings) - (b.money + b.savings));
      const targetCount = Math.max(1, Math.floor(eligible.length * CONFIG.MONETARY_LIQUIDITY_TARGET_PERCENTILE));
      for (const agent of eligible.slice(0, targetCount)) {
        const transfer = Math.min(CONFIG.MONETARY_LIQUIDITY_TRANSFER_PER_AGENT, this.government.treasury);
        if (transfer <= 0) break;
        agent.receiveMoney(transfer);
        agent.satisfaction = Math.min(100, agent.satisfaction + CONFIG.MONETARY_LIQUIDITY_SAT_BOOST);
        this.government.treasury -= transfer;
        liquidityInjected += transfer;
        liquidityRecipients++;
      }

      if (liquidityInjected > 0) {
        this.addEvent(
          'info',
          `📋 流動性支持 → ${liquidityRecipients} 人獲得注入（國庫 $${prevTreasuryLiquidity.toFixed(0)} → $${this.government.treasury.toFixed(0)}）`,
        );
      } else if (prevTreasuryLiquidity <= 0.1) {
        this.addEvent('warning', '流動性支持啟用中，但國庫不足，無法注入現金。');
      }
    }

    const treasuryDelta = this.government.treasury - treasuryStart;
    const perCapitaCashDelta = aliveCount > 0
      ? (welfareSpent + liquidityInjected - taxCollected) / aliveCount
      : 0;
    return {
      taxCollected,
      welfareSpent,
      welfareRecipients,
      publicWorksSpent,
      liquidityInjected,
      liquidityRecipients,
      policyRate: this.government.policyRate,
      treasuryDelta,
      perCapitaCashDelta,
    };
  }

  private phaseHouseholdFinance(agents: Agent[]): number {
    let totalSatDelta = 0;
    for (const agent of agents) {
      totalSatDelta += agent.runHouseholdBanking(this.government.policyRate);
    }
    return totalSatDelta;
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
      getEconomicCalibration: () => this.getEconomicCalibration(),
    });
    if (bornOnIsland) {
      agent.addLifeEvent(this.turn, 'join', `在小島出生，目前由家戶照顧中（${Math.floor(ageTurns / 12)} 歲）。`, 'positive');
    } else {
      agent.addLifeEvent(this.turn, 'join', `加入小島，就業於${this.sectorLabel(sector)}。`, 'positive');
    }
    return agent;
  }

  private getUnlockedSectors(): SectorType[] {
    return getUnlockedSectorsForStage(this.economyStage);
  }

  private getCurrentNeedMultipliers(): Record<SectorType, number> {
    const result = getStageNeedMultipliers({
      turn: this.turn,
      economyStage: this.economyStage,
      stageTransitionFrom: this.stageTransitionFrom,
      stageTransitionStartTurn: this.stageTransitionStartTurn,
    });
    this.stageTransitionFrom = result.stageTransitionFrom;
    this.stageTransitionStartTurn = result.stageTransitionStartTurn;
    return result.multipliers;
  }

  private averageAgentMetric(agents: Agent[], accessor: (agent: Agent) => number): number {
    if (agents.length === 0) return 0;
    const sum = agents.reduce((acc, agent) => acc + accessor(agent), 0);
    return sum / agents.length;
  }

  private phaseEconomyProgression(agents: Agent[]): void {
    const result = evaluateEconomyStageProgression({
      turn: this.turn,
      economyStage: this.economyStage,
      stageTransitionFrom: this.stageTransitionFrom,
      stageTransitionStartTurn: this.stageTransitionStartTurn,
      agents,
      foodDemand: this.market.demand.food,
      foodSupply: this.market.supply.food,
    });
    this.economyStage = result.economyStage;
    this.stageTransitionFrom = result.stageTransitionFrom;
    this.stageTransitionStartTurn = result.stageTransitionStartTurn;
    if (result.message) {
      this.addEvent('positive', result.message);
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
    this.markStateDirty(
      'agents',
      'government',
      'events',
      'activeRandomEvents',
      'pendingDecision',
      'gameOver',
    );
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
      markPolicyApplied: policy => {
        this.policyTimeline = markPolicyTimelineAppliedModule({
          policyTimeline: this.policyTimeline,
          policy,
          resolvedTurn: this.turn,
        });
      },
      addEvent: (type, message) => this.addEvent(type, message),
    });
  }

  private phaseMilestones(): void {
    const aliveAgents = this.agents.filter(a => a.alive);
    const records = evaluateMilestones({
      turn: this.turn,
      aliveAgents,
      milestoneFlags: this.milestoneFlags,
    });
    for (const record of records) {
      this.addMilestone(record);
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
    this.markStateDirty('milestones', 'agents');
  }

  private queuePolicy(change: {
    type: PendingPolicyType;
    value: number | boolean;
    sector?: SectorType;
    summary: string;
    sideEffects: string[];
  }): void {
    const result = queuePolicyChange({
      turn: this.turn,
      policyDelayTurns: CONFIG.POLICY_DELAY_TURNS,
      nextPolicyId: this.nextPolicyId,
      pendingPolicies: this.pendingPolicies,
      policyTimeline: this.policyTimeline,
      change,
    });
    this.nextPolicyId = result.nextPolicyId;
    this.pendingPolicies = result.pendingPolicies;
    this.policyTimeline = result.policyTimeline;
    this.addEvent(
      'info',
      `${result.updatedExisting ? '政策更新' : '政策排程'}：${change.summary}（將於 ${result.scheduledPolicy.applyTurn} 回合生效）`,
    );
    this.markStateDirty('pendingPolicies', 'policyTimeline', 'events');
  }

  private checkEndConditions(): GameOverState | null {
    const aliveCount = this.agents.filter(a => a.alive).length;
    const reason = deriveGameOverReason({
      aliveCount,
      cumulativeGdp: this.computeCumulativeGDP(),
      treasury: this.government.treasury,
      turn: this.turn,
    });
    if (!reason) return null;
    return this.buildGameOverState(reason);
  }

  private computeCumulativeGDP(): number {
    return this.statistics.history.reduce((sum, s) => sum + s.gdp, 0);
  }

  private buildGameOverState(reason: GameOverReason): GameOverState {
    return buildGameOverStateModule({
      reason,
      turn: this.turn,
      history: this.statistics.history,
      agents: this.agents,
    });
  }

  endGame(): GameOverState {
    if (!this.gameOver) {
      this.gameOver = this.buildGameOverState('player_exit');
      this.addEvent('critical', this.getGameOverMessage('player_exit'));
      this.markStateDirty('gameOver');
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
    this.markStateDirty('events');
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
      sideEffects: getPolicySideEffectsModule('tax', clamped),
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
      sideEffects: getPolicySideEffectsModule('subsidy', clamped),
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
      sideEffects: getPolicySideEffectsModule('welfare', enabled),
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
      sideEffects: getPolicySideEffectsModule('publicWorks', active),
    });
  }

  setPolicyRate(rate: number): void {
    const clamped = Math.max(CONFIG.MONETARY_POLICY_RATE_MIN, Math.min(CONFIG.MONETARY_POLICY_RATE_MAX, rate));
    const existing = this.pendingPolicies.find(p => p.type === 'policyRate');
    if (existing && Math.abs((existing.value as number) - clamped) < 1e-6) return;
    if (!existing && Math.abs(this.government.policyRate - clamped) < 1e-6) return;

    this.queuePolicy({
      type: 'policyRate',
      value: clamped,
      summary: `政策利率調整至 ${(clamped * 100).toFixed(2)}%`,
      sideEffects: getPolicySideEffectsModule('policyRate', clamped),
    });
  }

  setLiquiditySupport(active: boolean): void {
    const existing = this.pendingPolicies.find(p => p.type === 'liquiditySupport');
    if (existing && existing.value === active) return;
    if (!existing && this.government.liquiditySupportActive === active) return;

    this.queuePolicy({
      type: 'liquiditySupport',
      value: active,
      summary: `流動性支持 ${active ? '啟用' : '停用'}`,
      sideEffects: getPolicySideEffectsModule('liquiditySupport', active),
    });
  }

  private cloneTerrainState(): IslandTerrainState {
    return {
      ...this.terrain,
      coastlineOffsets: [...this.terrain.coastlineOffsets],
      zoneOffsets: {
        food: { ...this.terrain.zoneOffsets.food },
        goods: { ...this.terrain.zoneOffsets.goods },
        services: { ...this.terrain.zoneOffsets.services },
      },
      sectorSuitability: { ...this.terrain.sectorSuitability },
      sectorFeatures: { ...this.terrain.sectorFeatures },
    };
  }

  private appendOrCloneArray<T>(source: T[], previous?: T[]): T[] {
    if (!previous) {
      return [...source];
    }
    if (source.length === previous.length + 1) {
      return [...previous, source[source.length - 1]];
    }
    if (
      source.length === previous.length &&
      source.length > 0 &&
      source[0] === previous[0] &&
      source[source.length - 1] === previous[source.length - 1]
    ) {
      return previous;
    }
    if (source.length === 0 && previous.length === 0) {
      return previous;
    }
    return [...source];
  }

  getState(previous?: GameState): GameState {
    const prev = previous ?? this.cachedState ?? undefined;

    const agents = this.stateDirty.agents || !prev
      ? this.agents.map(a => a.toState())
      : prev.agents;
    const terrain = this.stateDirty.terrain || !prev
      ? this.cloneTerrainState()
      : prev.terrain;
    const market = this.stateDirty.market || !prev
      ? this.market.toState(prev?.market)
      : prev.market;
    const government = this.stateDirty.government || !prev
      ? this.government.toState(prev?.government)
      : prev.government;
    const statistics = this.stateDirty.statistics || !prev
      ? this.appendOrCloneArray(this.statistics.history, prev?.statistics)
      : prev.statistics;
    const events = this.stateDirty.events || !prev
      ? this.appendOrCloneArray(this.events, prev?.events)
      : prev.events;
    const milestones = this.stateDirty.milestones || !prev
      ? this.appendOrCloneArray(this.milestones, prev?.milestones)
      : prev.milestones;
    const activeRandomEvents = this.stateDirty.activeRandomEvents || !prev
      ? this.activeRandomEvents.map(e => ({
        def: e.def,
        turnsRemaining: e.turnsRemaining,
      }))
      : prev.activeRandomEvents;
    const pendingDecision = this.stateDirty.pendingDecision || !prev
      ? (this.pendingDecision
        ? {
          ...this.pendingDecision,
          choices: [...this.pendingDecision.choices] as PendingDecision['choices'],
        }
        : null)
      : prev.pendingDecision;
    const pendingPolicies = this.stateDirty.pendingPolicies || !prev
      ? [...this.pendingPolicies]
      : prev.pendingPolicies;
    const policyTimeline = this.stateDirty.policyTimeline || !prev
      ? this.policyTimeline.map(entry => ({ ...entry, sideEffects: [...entry.sideEffects] }))
      : prev.policyTimeline;
    const gameOver = this.stateDirty.gameOver || !prev
      ? this.gameOver
      : prev.gameOver;

    const nextState: GameState = {
      turn: this.turn,
      agents,
      terrain,
      economyStage: this.economyStage,
      market,
      government,
      statistics,
      events,
      milestones,
      activeRandomEvents,
      pendingDecision,
      pendingPolicies,
      policyTimeline,
      rngState: this.rng.getState(),
      seed: this.seed,
      scenarioId: this.scenarioId,
      gameOver,
    };

    this.cachedState = nextState;
    this.clearStateDirty();
    return nextState;
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
    this.stageTransitionFrom = null;
    this.stageTransitionStartTurn = null;

    this.seed = seed ?? Date.now();
    this.scenarioId = scenarioId;
    this.rng = new RNG(this.seed);
    this.terrain = this.generateTerrainProfile(this.seed);

    this.market.reset();
    this.government.reset();
    this.statistics.reset();
    this.initializeAgents();
    this.cachedState = null;
    this.markStateDirty(
      'agents',
      'terrain',
      'market',
      'government',
      'statistics',
      'events',
      'milestones',
      'activeRandomEvents',
      'pendingDecision',
      'pendingPolicies',
      'policyTimeline',
      'gameOver',
    );
  }
}
