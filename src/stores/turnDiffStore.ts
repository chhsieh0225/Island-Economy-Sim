import { create } from 'zustand';
import type { GameState, GameEvent, TurnSnapshot } from '../types';

/* ────────────────────────────────────────────────────────────────────────────
 * Turn Diff Store
 *
 * Tracks turn-over-turn deltas so the StickyControlBar can show at-a-glance
 * stat changes without the player needing to scroll.
 * ──────────────────────────────────────────────────────────────────────────── */

export interface TurnDeltas {
  gdp: number;
  population: number;
  avgSatisfaction: number;
  avgHealth: number;
  treasury: number;
  giniCoefficient: number;
}

export interface TurnDiff {
  turn: number;
  deltas: TurnDeltas;
  events: GameEvent[];
  births: number;
  deaths: number;
  timestamp: number;
}

interface TurnDiffState {
  /** Snapshot captured before the turn advance */
  prevSnapshot: TurnSnapshot | null;
  /** Computed diff after the turn advance */
  currentDiff: TurnDiff | null;
  /** Whether the expandable summary panel is open */
  expanded: boolean;

  /** Call BEFORE engine.advanceTurn() */
  captureBefore: (state: GameState) => void;
  /** Call AFTER engine.advanceTurn() — computes diff and sets expanded */
  captureAfter: (state: GameState, isAutoPlay: boolean) => void;
  /** Toggle or set expanded state */
  setExpanded: (expanded: boolean) => void;
  /** Collapse summary */
  dismiss: () => void;
  /** Clear all diff state (on reset) */
  clear: () => void;
}

function getLatestSnapshot(state: GameState): TurnSnapshot | null {
  const stats = state.statistics;
  return stats.length > 0 ? stats[stats.length - 1] : null;
}

export const useTurnDiffStore = create<TurnDiffState>((set, get) => ({
  prevSnapshot: null,
  currentDiff: null,
  expanded: false,

  captureBefore: (state: GameState) => {
    set({ prevSnapshot: getLatestSnapshot(state) });
  },

  captureAfter: (state: GameState, isAutoPlay: boolean) => {
    const prev = get().prevSnapshot;
    const curr = getLatestSnapshot(state);

    if (!curr) {
      set({ prevSnapshot: null });
      return;
    }

    const deltas: TurnDeltas = {
      gdp: prev ? curr.gdp - prev.gdp : 0,
      population: prev ? curr.population - prev.population : 0,
      avgSatisfaction: prev ? curr.avgSatisfaction - prev.avgSatisfaction : 0,
      avgHealth: prev ? curr.avgHealth - prev.avgHealth : 0,
      treasury: prev ? curr.government.treasury - prev.government.treasury : 0,
      giniCoefficient: prev ? curr.giniCoefficient - prev.giniCoefficient : 0,
    };

    // Filter events from this turn only
    const turnEvents = state.events.filter(e => e.turn === state.turn);

    const diff: TurnDiff = {
      turn: state.turn,
      deltas,
      events: turnEvents,
      births: curr.births,
      deaths: curr.deaths,
      timestamp: Date.now(),
    };

    set({
      currentDiff: diff,
      prevSnapshot: curr,
      // Only auto-expand in manual play mode
      expanded: !isAutoPlay && turnEvents.length > 0,
    });
  },

  setExpanded: (expanded: boolean) => set({ expanded }),

  dismiss: () => set({ expanded: false }),

  clear: () => set({ prevSnapshot: null, currentDiff: null, expanded: false }),
}));
