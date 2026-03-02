import { useRef, useState, useCallback, useEffect } from 'react';
import { GameEngine } from '../engine/GameEngine';
import { computeScore } from '../engine/Scoring';
import type {
  GameState,
  SectorType,
  ScenarioId,
  RunSummary,
  GameOverReason,
} from '../types';
import { CONFIG } from '../config';
import { DEFAULT_SCENARIO, getScenarioById } from '../data/scenarios';

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

export function useGameEngine() {
  const initialSeed = Date.now();
  const engineRef = useRef<GameEngine>(new GameEngine(initialSeed, DEFAULT_SCENARIO));
  const [gameState, setGameState] = useState<GameState>(() => engineRef.current.getState());
  const [autoPlaySpeed, setAutoPlaySpeed] = useState<AutoPlaySpeed>(null);
  const [runHistory, setRunHistory] = useState<RunSummary[]>([]);
  const intervalRef = useRef<number | null>(null);
  const runIdRef = useRef(1);

  const syncState = useCallback(() => {
    setGameState(engineRef.current.getState());
  }, []);

  const stopAutoPlayInternal = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    setAutoPlaySpeed(null);
  }, []);

  const pushRunSnapshot = useCallback((reason: GameOverReason | 'reset') => {
    const summary = buildRunSummary(engineRef.current.getState(), runIdRef.current++, reason);
    if (!summary) return;
    setRunHistory(prev => [summary, ...prev].slice(0, 12));
  }, []);

  const advanceTurn = useCallback(() => {
    engineRef.current.advanceTurn();
    syncState();
    if (engineRef.current.gameOver || engineRef.current.pendingDecision) {
      stopAutoPlayInternal();
    }
  }, [syncState, stopAutoPlayInternal]);

  const setTaxRate = useCallback((rate: number) => {
    engineRef.current.setTaxRate(rate);
    syncState();
  }, [syncState]);

  const setSubsidy = useCallback((sector: SectorType, amount: number) => {
    engineRef.current.setSubsidy(sector, amount);
    syncState();
  }, [syncState]);

  const setWelfare = useCallback((enabled: boolean) => {
    engineRef.current.setWelfare(enabled);
    syncState();
  }, [syncState]);

  const setPublicWorks = useCallback((active: boolean) => {
    engineRef.current.setPublicWorks(active);
    syncState();
  }, [syncState]);

  const chooseDecision = useCallback((choiceId: string) => {
    const resolved = engineRef.current.resolveDecision(choiceId);
    if (resolved) {
      syncState();
    }
  }, [syncState]);

  const startNewRun = useCallback((seed: number, scenarioId: ScenarioId) => {
    stopAutoPlayInternal();

    const existing = engineRef.current.getState();
    if (existing.turn > 0) {
      pushRunSnapshot(existing.gameOver?.reason ?? 'reset');
    }

    engineRef.current.reset(seed, scenarioId);
    syncState();
  }, [pushRunSnapshot, stopAutoPlayInternal, syncState]);

  const reset = useCallback(() => {
    const state = engineRef.current.getState();
    startNewRun(state.seed, state.scenarioId);
  }, [startNewRun]);

  const startAutoPlay = useCallback((speed: 'slow' | 'medium' | 'fast') => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
    }
    setAutoPlaySpeed(speed);
    const ms = CONFIG.AUTO_PLAY_SPEEDS[speed];
    intervalRef.current = window.setInterval(() => {
      engineRef.current.advanceTurn();
      syncState();
      if (engineRef.current.gameOver || engineRef.current.pendingDecision) {
        stopAutoPlayInternal();
      }
    }, ms);
  }, [syncState, stopAutoPlayInternal]);

  const stopAutoPlay = useCallback(() => {
    stopAutoPlayInternal();
  }, [stopAutoPlayInternal]);

  const endGame = useCallback(() => {
    stopAutoPlayInternal();
    engineRef.current.endGame();
    syncState();
  }, [syncState, stopAutoPlayInternal]);

  // Auto-stop autoplay if a decision appears from non-autoplay actions.
  useEffect(() => {
    if ((gameState.pendingDecision || gameState.gameOver) && autoPlaySpeed !== null) {
      stopAutoPlayInternal();
    }
  }, [gameState.pendingDecision, gameState.gameOver, autoPlaySpeed, stopAutoPlayInternal]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  return {
    gameState,
    autoPlaySpeed,
    runHistory,
    advanceTurn,
    chooseDecision,
    setTaxRate,
    setSubsidy,
    setWelfare,
    setPublicWorks,
    reset,
    startNewRun,
    startAutoPlay,
    stopAutoPlay,
    endGame,
  };
}
