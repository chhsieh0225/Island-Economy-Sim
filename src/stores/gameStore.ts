import { create } from 'zustand';
import { GameEngine } from '../engine/GameEngine';
import { computeScore } from '../engine/Scoring';
import { clearTileCache } from '../components/IslandMap/islandRenderer';
import { CONFIG } from '../config';
import { DEFAULT_SCENARIO, getScenarioById } from '../data/scenarios';
import { useNotificationStore, initLearningTracking } from './notificationStore';
import {
  saveGame, loadGame, deleteSave, hasSave,
  type SaveData, type PolicyLogEntry, type PolicyAction,
} from '../engine/modules/saveLoadModule';
import type {
  GameState,
  SectorType,
  ScenarioId,
  RunSummary,
  GameOverReason,
} from '../types';
import type { EconomicCalibrationProfileId } from '../engine/economicCalibration';
import { playSound } from '../audio/audioManager';
import { checkNarrativeTriggers, type NarrativeContext } from '../data/narrative';
import { useUiStore } from './uiStore';

export type AutoPlaySpeed = 'slow' | 'medium' | 'fast' | null;

function buildRunSummary(
  state: GameState,
  id: number,
  reason: GameOverReason | 'reset',
): RunSummary | null {
  if (state.turn <= 0 || state.statistics.length === 0) return null;

  const latest = state.statistics[state.statistics.length - 1];
  const totals = state.statistics.reduce(
    (acc, s) => ({
      births: acc.births + s.births,
      deaths: acc.deaths + s.deaths,
    }),
    { births: 0, deaths: 0 },
  );

  return {
    id,
    timestamp: new Date().toISOString(),
    scenarioId: state.scenarioId,
    scenarioName: getScenarioById(state.scenarioId).name,
    seed: state.seed,
    turns: state.turn,
    reason,
    finalPopulation: latest.population,
    totalBirths: totals.births,
    totalDeaths: totals.deaths,
    finalGdp: latest.gdp,
    finalGini: latest.giniCoefficient,
    score: computeScore(state.statistics).totalScore,
  };
}

interface GameStoreState {
  gameState: GameState;
  autoPlaySpeed: AutoPlaySpeed;
  runHistory: RunSummary[];
  economicCalibrationMode: EconomicCalibrationProfileId;
  hasSavedGame: boolean;

  // Actions
  advanceTurn: () => void;
  chooseDecision: (choiceId: string) => void;
  setTaxRate: (rate: number) => void;
  setSubsidy: (sector: SectorType, amount: number) => void;
  setWelfare: (enabled: boolean) => void;
  setPublicWorks: (active: boolean) => void;
  setPolicyRate: (rate: number) => void;
  setLiquiditySupport: (active: boolean) => void;
  reset: () => void;
  startNewRun: (seed: number, scenarioId: ScenarioId) => void;
  startAutoPlay: (speed: 'slow' | 'medium' | 'fast') => void;
  stopAutoPlay: () => void;
  endGame: () => void;
  setEconomicMode: (mode: EconomicCalibrationProfileId) => void;
  buildInfrastructure: (type: import('../types').InfrastructureType) => boolean;
  saveCurrentGame: () => boolean;
  loadSavedGame: () => boolean;
  deleteSavedGame: () => void;
}

// Module-level engine singleton
const engine = new GameEngine(Date.now(), DEFAULT_SCENARIO);
let runIdCounter = 1;
let autoPlayInterval: number | null = null;
let policyLog: PolicyLogEntry[] = [];
let autoSaveTurnCounter = 0;
let firedNarrativeIds = new Set<string>();

function buildNarrativeContext(state: GameState): NarrativeContext {
  const stats = state.statistics;
  const latest = stats.length > 0 ? stats[stats.length - 1] : null;
  const totals = stats.reduce(
    (acc, s) => ({ births: acc.births + s.births, deaths: acc.deaths + s.deaths }),
    { births: 0, deaths: 0 },
  );
  const gov = state.government;
  const hasPolicyApplied =
    gov.taxRate !== 0.1 ||
    gov.subsidies.food !== 0 ||
    gov.subsidies.goods !== 0 ||
    gov.subsidies.services !== 0 ||
    gov.welfareEnabled ||
    gov.publicWorksActive;

  // Compute food coverage: fraction of agents with enough food
  const aliveAgents = state.agents.filter(a => a.alive);
  const fedCount = aliveAgents.filter(a => a.inventory.food >= 0.8).length;
  const foodCoverage = aliveAgents.length > 0 ? fedCount / aliveAgents.length : 1;

  return {
    turn: state.turn,
    population: latest?.population ?? aliveAgents.length,
    gdp: latest?.gdp ?? 0,
    avgSatisfaction: latest?.avgSatisfaction ?? 100,
    giniCoefficient: latest?.giniCoefficient ?? 0,
    economyStage: state.economyStage,
    treasury: gov.treasury,
    hasRandomShock: state.activeRandomEvents.length > 0,
    foodCoverage,
    hasPolicyApplied,
    totalDeaths: totals.deaths,
    totalBirths: totals.births,
  };
}

function checkAndShowNarrative(state: GameState): void {
  const ctx = buildNarrativeContext(state);
  const narrative = checkNarrativeTriggers(ctx, firedNarrativeIds);
  if (narrative) {
    useUiStore.getState().showStoryNarrative(narrative);
  }
}

function logPolicy(action: PolicyAction): void {
  policyLog.push({ turn: engine.turn, action });
}

function syncState(prevState?: GameState): GameState {
  const state = engine.getState(prevState);
  useNotificationStore.getState().pushLearningToasts(state);
  return state;
}

function stopAutoPlayInternal(set: (partial: Partial<GameStoreState>) => void): void {
  if (autoPlayInterval !== null) {
    clearInterval(autoPlayInterval);
    autoPlayInterval = null;
  }
  set({ autoPlaySpeed: null });
}

function applyPolicyAction(eng: GameEngine, action: PolicyAction): void {
  switch (action.type) {
    case 'taxRate': eng.setTaxRate(action.value); break;
    case 'subsidy': eng.setSubsidy(action.sector as SectorType, action.value); break;
    case 'welfare': eng.setWelfare(action.enabled); break;
    case 'publicWorks': eng.setPublicWorks(action.active); break;
    case 'policyRate': eng.setPolicyRate(action.value); break;
    case 'liquiditySupport': eng.setLiquiditySupport(action.active); break;
    case 'decision': eng.resolveDecision(action.choiceId); break;
  }
}

function autoSaveIfNeeded(): void {
  autoSaveTurnCounter++;
  if (autoSaveTurnCounter % 5 === 0 && !engine.gameOver) {
    const data: SaveData = {
      version: 1,
      seed: engine.seed,
      scenarioId: engine.scenarioId,
      turns: engine.turn,
      calibrationProfileId: engine.getEconomicCalibrationProfileId(),
      policyLog: [...policyLog],
      timestamp: new Date().toISOString(),
    };
    saveGame(data);
    useGameStore.setState({ hasSavedGame: true });
  }
}

// Initialize learning tracking from initial state
initLearningTracking(engine.getState());

export const useGameStore = create<GameStoreState>((set, get) => ({
  gameState: engine.getState(),
  autoPlaySpeed: null,
  runHistory: [],
  economicCalibrationMode: engine.getEconomicCalibrationProfileId(),
  hasSavedGame: hasSave(),

  advanceTurn: () => {
    engine.advanceTurn();
    const milestones = engine.newMilestones;
    useNotificationStore.getState().pushMilestoneToasts(milestones);
    if (milestones.length > 0) playSound('milestone');
    const gameState = syncState(get().gameState);
    set({ gameState });
    playSound('turn_advance');
    checkAndShowNarrative(gameState);
    autoSaveIfNeeded();
    if (engine.gameOver || engine.pendingDecision) {
      stopAutoPlayInternal(s => set(s));
    }
  },

  chooseDecision: (choiceId) => {
    const resolved = engine.resolveDecision(choiceId);
    if (resolved) {
      logPolicy({ type: 'decision', choiceId });
      playSound('ui_click');
      set({ gameState: syncState(get().gameState) });
    }
  },

  setTaxRate: (rate) => {
    engine.setTaxRate(rate);
    logPolicy({ type: 'taxRate', value: rate });
    playSound('policy_set');
    useNotificationStore.getState().pushPolicyToast(`稅率已調整至 ${(rate * 100).toFixed(0)}% — 下回合生效`);
    set({ gameState: syncState(get().gameState) });
  },

  setSubsidy: (sector, amount) => {
    engine.setSubsidy(sector, amount);
    logPolicy({ type: 'subsidy', sector, value: amount });
    playSound('policy_set');
    const label = sector === 'food' ? '食物' : sector === 'goods' ? '商品' : '服務';
    useNotificationStore.getState().pushPolicyToast(`${label}補貼已調整至 ${amount.toFixed(0)}% — 下回合生效`);
    set({ gameState: syncState(get().gameState) });
  },

  setWelfare: (enabled) => {
    engine.setWelfare(enabled);
    logPolicy({ type: 'welfare', enabled });
    playSound('policy_set');
    useNotificationStore.getState().pushPolicyToast(enabled ? '福利已啟用 — 下回合生效' : '福利已停用 — 下回合生效');
    set({ gameState: syncState(get().gameState) });
  },

  setPublicWorks: (active) => {
    engine.setPublicWorks(active);
    logPolicy({ type: 'publicWorks', active });
    playSound('policy_set');
    useNotificationStore.getState().pushPolicyToast(active ? '公共建設已啟用' : '公共建設已停用');
    set({ gameState: syncState(get().gameState) });
  },

  setPolicyRate: (rate) => {
    engine.setPolicyRate(rate);
    logPolicy({ type: 'policyRate', value: rate });
    playSound('policy_set');
    useNotificationStore.getState().pushPolicyToast(`政策利率已調整至 ${(rate * 100).toFixed(1)}%`);
    set({ gameState: syncState(get().gameState) });
  },

  setLiquiditySupport: (active) => {
    engine.setLiquiditySupport(active);
    logPolicy({ type: 'liquiditySupport', active });
    playSound('policy_set');
    useNotificationStore.getState().pushPolicyToast(active ? '流動性支援已啟用' : '流動性支援已停用');
    set({ gameState: syncState(get().gameState) });
  },

  reset: () => {
    const state = engine.getState();
    get().startNewRun(state.seed, state.scenarioId);
  },

  startNewRun: (seed, scenarioId) => {
    stopAutoPlayInternal(s => set(s));

    const existing = engine.getState();
    if (existing.turn > 0) {
      const summary = buildRunSummary(existing, runIdCounter++, existing.gameOver?.reason ?? 'reset');
      if (summary) {
        set(s => ({ runHistory: [summary, ...s.runHistory].slice(0, 12) }));
      }
    }

    engine.reset(seed, scenarioId);
    policyLog = [];
    autoSaveTurnCounter = 0;
    firedNarrativeIds = new Set<string>();
    clearTileCache();
    initLearningTracking(engine.getState());
    set({ gameState: syncState() });
  },

  startAutoPlay: (speed) => {
    if (autoPlayInterval !== null) {
      clearInterval(autoPlayInterval);
    }
    set({ autoPlaySpeed: speed });
    const ms = CONFIG.AUTO_PLAY_SPEEDS[speed];
    autoPlayInterval = window.setInterval(() => {
      engine.advanceTurn();
      useNotificationStore.getState().pushMilestoneToasts(engine.newMilestones);
      const gameState = syncState(get().gameState);
      set({ gameState });
      checkAndShowNarrative(gameState);
      autoSaveIfNeeded();
      if (engine.gameOver || engine.pendingDecision) {
        stopAutoPlayInternal(s => set(s));
      }
    }, ms);
  },

  stopAutoPlay: () => {
    stopAutoPlayInternal(s => set(s));
  },

  endGame: () => {
    stopAutoPlayInternal(s => set(s));
    engine.endGame();
    set({ gameState: syncState(get().gameState) });
  },

  setEconomicMode: (mode) => {
    engine.setEconomicCalibrationProfile(mode);
    set({ economicCalibrationMode: mode });
  },

  buildInfrastructure: (type) => {
    const ok = engine.requestBuildInfrastructure(type);
    if (ok) {
      playSound('policy_set');
      useNotificationStore.getState().pushPolicyToast(`開始建設 — 已扣除國庫經費`);
      set({ gameState: syncState(get().gameState) });
    }
    return ok;
  },

  saveCurrentGame: () => {
    if (engine.turn <= 0) return false;
    const data: SaveData = {
      version: 1,
      seed: engine.seed,
      scenarioId: engine.scenarioId,
      turns: engine.turn,
      calibrationProfileId: engine.getEconomicCalibrationProfileId(),
      policyLog: [...policyLog],
      timestamp: new Date().toISOString(),
    };
    const ok = saveGame(data);
    if (ok) set({ hasSavedGame: true });
    return ok;
  },

  loadSavedGame: () => {
    const data = loadGame();
    if (!data) return false;

    stopAutoPlayInternal(s => set(s));

    // Replay from scratch using saved seed + policy log
    engine.reset(data.seed, data.scenarioId);
    engine.setEconomicCalibrationProfile(data.calibrationProfileId);

    // Build a map of turn → actions to apply BEFORE advancing that turn
    const actionsByTurn = new Map<number, PolicyAction[]>();
    for (const entry of data.policyLog) {
      const list = actionsByTurn.get(entry.turn) ?? [];
      list.push(entry.action);
      actionsByTurn.set(entry.turn, list);
    }

    // Replay turns
    for (let t = 0; t < data.turns; t++) {
      // Apply policies logged at this turn before advancing
      const actions = actionsByTurn.get(t);
      if (actions) {
        for (const action of actions) {
          applyPolicyAction(engine, action);
        }
      }
      engine.advanceTurn();
      // Handle any pending decisions that were resolved
      if (engine.pendingDecision) {
        const decisionActions = actionsByTurn.get(engine.turn);
        if (decisionActions) {
          for (const action of decisionActions) {
            if (action.type === 'decision') {
              engine.resolveDecision(action.choiceId);
            }
          }
        }
      }
    }

    policyLog = [...data.policyLog];
    autoSaveTurnCounter = data.turns;
    clearTileCache();
    initLearningTracking(engine.getState());
    set({
      gameState: syncState(),
      economicCalibrationMode: data.calibrationProfileId,
    });
    return true;
  },

  deleteSavedGame: () => {
    deleteSave();
    set({ hasSavedGame: false });
  },
}));
