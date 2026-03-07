import { create } from 'zustand';
import type { TurnDeltas } from './turnDiffStore';

/* ────────────────────────────────────────────────────────────────────────────
 * Streak Store
 *
 * Tracks consecutive positive or negative turns. A positive turn is one where
 * GDP >= 0, population >= 0, and satisfaction >= -0.5.  A negative turn is one
 * where GDP < 0, population <= 0, and satisfaction < -0.5. Mixed turns reset.
 * ──────────────────────────────────────────────────────────────────────────── */

export type StreakType = 'positive' | 'negative' | null;

/** Returned by recordTurnDeltas so callers can react to milestone events. */
export interface StreakMilestone {
  type: StreakType;
  count: number;
}

/** Thresholds at which a streak milestone is announced. */
const MILESTONE_THRESHOLDS = [3, 5, 10, 15, 20, 30, 50];

interface StreakState {
  type: StreakType;
  count: number;
  bestPositiveStreak: number;
  /** Record current turn deltas and update streak.
   *  Returns a StreakMilestone if the new count exactly hits a threshold. */
  recordTurnDeltas: (deltas: TurnDeltas) => StreakMilestone | null;
  /** Clear streak state (on reset / new run) */
  clear: () => void;
}

function classifyTurn(d: TurnDeltas): StreakType {
  const isPositive = d.gdp >= 0 && d.population >= 0 && d.avgSatisfaction >= -0.5;
  const isNegative = d.gdp < 0 && d.population <= 0 && d.avgSatisfaction < -0.5;
  if (isPositive) return 'positive';
  if (isNegative) return 'negative';
  return null;
}

export const useStreakStore = create<StreakState>((set, get) => ({
  type: null,
  count: 0,
  bestPositiveStreak: 0,

  recordTurnDeltas: (deltas: TurnDeltas): StreakMilestone | null => {
    const turnType = classifyTurn(deltas);
    const { type: prevType, count: prevCount, bestPositiveStreak } = get();

    if (turnType === null) {
      set({ type: null, count: 0 });
      return null;
    }

    let newCount: number;
    if (turnType === prevType) {
      newCount = prevCount + 1;
      const newBest = turnType === 'positive'
        ? Math.max(bestPositiveStreak, newCount)
        : bestPositiveStreak;
      set({ count: newCount, bestPositiveStreak: newBest });
    } else {
      newCount = 1;
      const newBest = turnType === 'positive'
        ? Math.max(bestPositiveStreak, 1)
        : bestPositiveStreak;
      set({ type: turnType, count: 1, bestPositiveStreak: newBest });
    }

    if (MILESTONE_THRESHOLDS.includes(newCount)) {
      return { type: turnType, count: newCount };
    }
    return null;
  },

  clear: () => set({ type: null, count: 0, bestPositiveStreak: 0 }),
}));
