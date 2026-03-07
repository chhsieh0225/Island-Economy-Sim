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
  Infrastructure,
  InfrastructureType,
} from '../types';
import { Agent } from './Agent';
import { Market } from './Market';
import { Government } from './Government';
import { Statistics } from './Statistics';
import { RNG } from './RNG';
import { generateName } from '../data/names';
import { DEFAULT_SCENARIO } from '../data/scenarios';
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
import { generateTerrainProfile, buildTerrainAnnouncement } from './modules/terrainModule';
import { applyScenarioSetup } from './modules/scenarioModule';
import {
  type StateDirtyFlags,
  createDirtyFlags,
  clearDirtyFlags,
  markDirty,
  buildGameState,
} from './modules/stateSerializerModule';
import {
  DEFAULT_ECONOMIC_CALIBRATION_PROFILE_ID,
  getEconomicCalibrationProfile,
  type EconomicCalibrationProfile,
  type EconomicCalibrationProfileId,
} from './economicCalibration';
import {
  buildInfrastructure as buildInfrastructureItem,
  tickInfrastructure,
  computeInfrastructureEffects,
  canBuild as canBuildInfrastructure,
  getInfrastructureDef,
} from './modules/infrastructureModule';

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
  infrastructure: Infrastructure[] = [];

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
  private stockpileTreasurySnapshot: number = 0; // snapshot before market clearing
  private milestoneFlags: Set<string> = new Set();
  private _newMilestonesThisTurn: MilestoneRecord[] = [];
  private stageTransitionFrom: EconomyStage | null = null;
  private stageTransitionStartTurn: number | null = null;
  private cachedState: GameState | null = null;
  private stateDirty: StateDirtyFlags = createDirtyFlags(true);

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
    this.market.setGovernmentTrader(this.government.createMarketTrader());
    this.statistics = new Statistics();
    this.terrain = generateTerrainProfile(this.seed);
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

  private markStateDirty(...keys: Array<keyof StateDirtyFlags>): void {
    markDirty(this.stateDirty, ...keys);
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
    applyScenarioSetup({
      scenarioId: this.scenarioId,
      government: this.government,
      agents: this.agents,
      market: this.market,
    });
    this.addEvent('info', buildTerrainAnnouncement(this.terrain));
  }

  advanceTurn(): TurnSnapshot {
    const latestSnapshot = this.statistics.history[this.statistics.history.length - 1];
    if (this.gameOver || this.pendingDecision) {
      return this.latestSnapshotOrRecord(latestSnapshot);
    }

    this.turn++;
    this._newMilestonesThisTurn = [];
    this.applyPendingPolicies();
    this.infrastructure = tickInfrastructure(this.infrastructure);
    this.applyInfrastructureEffects();
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
    const govSpending = pipeline.governmentSummary.welfareSpent
      + pipeline.governmentSummary.publicWorksSpent
      + pipeline.governmentSummary.liquidityInjected
      + pipeline.governmentSummary.autoStabilizerSpent
      + pipeline.governmentSummary.stockpileBuySpent
      + pipeline.governmentSummary.stockpileMaintenance
      - pipeline.governmentSummary.stockpileSellRevenue;
    const snapshot = this.statistics.recordTurn(
      this.turn,
      this.agents,
      this.market,
      this.government,
      pipeline.demographics,
      causalReplay,
      govSpending,
      pipeline.consumptionSummary.selfConsumptionValue,
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
      'infrastructure',
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

  private applyInfrastructureEffects(): void {
    const fx = computeInfrastructureEffects(this.infrastructure);
    const hBoost = fx.healthBoost ?? 0;
    const sBoost = fx.satisfactionBoost ?? 0;
    if (hBoost <= 0 && sBoost <= 0) return;

    const aliveAgents = this.agents.filter(a => a.alive);
    for (const agent of aliveAgents) {
      if (hBoost > 0) {
        agent.health = Math.min(100, agent.health + hBoost);
      }
      if (sBoost > 0) {
        agent.satisfaction = Math.min(100, agent.satisfaction + sBoost);
      }
    }
    // Productivity boosts are applied via the production phase
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
    const infraFx = computeInfrastructureEffects(this.infrastructure);
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
      infrastructureSectorBoost: infraFx.productivityBoost,
      infrastructureOverallBoost: infraFx.overallProductivity,
      marketPrices: { ...this.market.prices },
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

    // Government strategic stockpile: post buy/sell orders alongside agents
    if (this.government.stockpileEnabled) {
      const orders = this.government.computeStockpileOrders(
        this.market.prices,
        Market.GOVERNMENT_TRADER_ID,
      );
      for (const order of orders.buyOrders) {
        this.market.addBuyOrder(order);
      }
      for (const order of orders.sellOrders) {
        this.market.addSellOrder(order);
      }
    }

    // Snapshot treasury before market clearing to track stockpile trades
    this.stockpileTreasurySnapshot = this.government.treasury;
  }

  private phaseConsumption(agents: Agent[]): ConsumptionPhaseSummary {
    const demandMultipliers = this.getCurrentNeedMultipliers();
    return runConsumptionPhase(
      agents,
      this.activeRandomEvents,
      this.market.prices,
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

    // Automatic fiscal stabilizer: emergency welfare when economy is in distress
    const autoStabilizerResult = this.government.distributeEmergencyWelfare(agents);
    const autoStabilizerSpent = autoStabilizerResult.totalSpent;
    if (autoStabilizerSpent > 0) {
      this.addEvent('info', `📋 自動穩定機制啟動 → ${autoStabilizerResult.recipients} 人獲緊急補助 $${autoStabilizerSpent.toFixed(0)}`);
    }

    // Strategic stockpile: compute trade amounts, maintenance & spoilage
    // Treasury now = snapshot + stockpileChange + tax - welfare - pw - liquidity - auto
    // Isolate stockpileChange by subtracting all known fiscal operations:
    const treasuryAfterGov = this.government.treasury;
    const treasuryChangeFromMarket = treasuryAfterGov - this.stockpileTreasurySnapshot
      - taxCollected + welfareSpent + publicWorksSpent + liquidityInjected + autoStabilizerSpent;
    // If negative, government spent money buying; if positive, government earned from selling
    const stockpileBuySpent = Math.max(0, -treasuryChangeFromMarket);
    const stockpileSellRevenue = Math.max(0, treasuryChangeFromMarket);

    const stockpileMaintenance = this.government.payStockpileMaintenance();
    this.government.applySpoilage();

    if (stockpileBuySpent > 0.1) {
      this.addEvent('info', `📋 戰略儲備收購 → 支出 $${stockpileBuySpent.toFixed(0)}`);
    }
    if (stockpileSellRevenue > 0.1) {
      this.addEvent('info', `📋 戰略儲備釋出 → 收入 $${stockpileSellRevenue.toFixed(0)}`);
    }
    if (stockpileMaintenance > 0 && this.government.stockpileEnabled) {
      // Only log if still enabled (not auto-disabled due to insufficient funds)
    }

    const treasuryDelta = this.government.treasury - treasuryStart;
    const perCapitaCashDelta = aliveCount > 0
      ? (welfareSpent + liquidityInjected + autoStabilizerSpent - taxCollected) / aliveCount
      : 0;
    return {
      taxCollected,
      welfareSpent,
      welfareRecipients,
      publicWorksSpent,
      liquidityInjected,
      liquidityRecipients,
      autoStabilizerSpent,
      stockpileBuySpent,
      stockpileSellRevenue,
      stockpileMaintenance,
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
    value: number | boolean | string;
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

  setTaxMode(mode: 'flat' | 'progressive'): void {
    const existing = this.pendingPolicies.find(p => p.type === 'taxMode');
    if (existing && existing.value === mode) return;
    if (!existing && this.government.taxMode === mode) return;

    this.queuePolicy({
      type: 'taxMode',
      value: mode,
      summary: `稅制切換為${mode === 'progressive' ? '累進稅' : '統一稅'}`,
      sideEffects: getPolicySideEffectsModule('taxMode', mode),
    });
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

  setStockpile(enabled: boolean): void {
    const existing = this.pendingPolicies.find(p => p.type === 'stockpile');
    if (existing && existing.value === enabled) return;
    if (!existing && this.government.stockpileEnabled === enabled) return;

    this.queuePolicy({
      type: 'stockpile',
      value: enabled,
      summary: `戰略儲備 ${enabled ? '啟用' : '停用'}`,
      sideEffects: getPolicySideEffectsModule('stockpile', enabled),
    });
  }

  getState(previous?: GameState): GameState {
    const nextState = buildGameState({
      turn: this.turn,
      economyStage: this.economyStage,
      seed: this.seed,
      scenarioId: this.scenarioId,
      agents: this.agents,
      terrain: this.terrain,
      market: this.market,
      government: this.government,
      statistics: this.statistics,
      events: this.events,
      milestones: this.milestones,
      activeRandomEvents: this.activeRandomEvents,
      pendingDecision: this.pendingDecision,
      pendingPolicies: this.pendingPolicies,
      policyTimeline: this.policyTimeline,
      infrastructure: this.infrastructure,
      gameOver: this.gameOver,
      rng: this.rng,
      dirty: this.stateDirty,
      previous: previous ?? this.cachedState ?? null,
    });

    this.cachedState = nextState;
    clearDirtyFlags(this.stateDirty);
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
    this.infrastructure = [];
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
    this.terrain = generateTerrainProfile(this.seed);

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
      'infrastructure',
      'gameOver',
    );
  }

  requestBuildInfrastructure(type: InfrastructureType): boolean {
    const check = canBuildInfrastructure(type, this.infrastructure, this.government.treasury);
    if (!check.ok) return false;
    const def = getInfrastructureDef(type);
    this.government.treasury -= def.cost;
    this.infrastructure = [...this.infrastructure, buildInfrastructureItem(type, this.turn, this.infrastructure)];
    markDirty(this.stateDirty, 'infrastructure', 'government');
    return true;
  }
}
