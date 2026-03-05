import { create } from 'zustand';
import { TUTORIAL_LESSONS, type TutorialLesson, type PolicySection } from '../data/tutorialLessons';
import type { GameState } from '../types';

/* ────────────────────────────────────────────────────────────────────────────
 * Tutorial Store
 *
 * Manages the dedicated tutorial mode state: current lesson, objective
 * completion tracking, and lesson progression.
 * ──────────────────────────────────────────────────────────────────────────── */

export type TutorialPhase =
  | 'intro'        // Showing lesson intro modal
  | 'playing'      // In-lesson gameplay
  | 'completed'    // Lesson objectives met, showing summary
  | 'finished';    // All lessons done

export interface ObjectiveStatus {
  id: string;
  completed: boolean;
}

interface TutorialState {
  /** Is tutorial mode active? */
  active: boolean;

  /** Current lesson index (0-based) */
  currentLessonIndex: number;

  /** Current phase within the lesson */
  phase: TutorialPhase;

  /** Set of completed lesson IDs */
  completedLessons: Set<string>;

  /** Objective status for the current lesson */
  objectiveStatuses: ObjectiveStatus[];

  /** The initial game state snapshot (used for some condition checks) */
  lessonStartTurn: number;

  // ── Derived getters ──
  /** Get the current lesson definition */
  getCurrentLesson: () => TutorialLesson | null;

  /** Get enabled policy controls for the current lesson */
  getEnabledControls: () => Set<PolicySection>;

  // ── Actions ──
  /** Start tutorial mode from lesson 0 (or resume) */
  startTutorial: () => void;

  /** Begin a specific lesson by index */
  startLesson: (index: number) => void;

  /** Called after intro modal is dismissed */
  dismissIntro: () => void;

  /** Check objectives against current game state */
  checkObjectives: (state: GameState) => void;

  /** Mark current lesson as completed */
  completeLesson: () => void;

  /** Advance to the next lesson */
  nextLesson: () => void;

  /** Exit tutorial mode entirely */
  exitTutorial: () => void;

  /** Get active hints for current game state */
  getActiveHints: (state: GameState, locale: string) => string[];
}

function buildObjectiveStatuses(lesson: TutorialLesson): ObjectiveStatus[] {
  return lesson.objectives.map(obj => ({
    id: obj.id,
    completed: false,
  }));
}

// Persist completed lessons to localStorage
const STORAGE_KEY = 'econ_sim_tutorial_progress';

function loadProgress(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const arr = JSON.parse(raw) as string[];
      return new Set(arr);
    }
  } catch { /* ignore */ }
  return new Set();
}

function saveProgress(completed: Set<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...completed]));
  } catch { /* ignore */ }
}

export const useTutorialStore = create<TutorialState>((set, get) => ({
  active: false,
  currentLessonIndex: 0,
  phase: 'intro',
  completedLessons: loadProgress(),
  objectiveStatuses: [],
  lessonStartTurn: 0,

  getCurrentLesson: () => {
    const { active, currentLessonIndex } = get();
    if (!active) return null;
    return TUTORIAL_LESSONS[currentLessonIndex] ?? null;
  },

  getEnabledControls: () => {
    const lesson = get().getCurrentLesson();
    return lesson?.enabledControls ?? new Set();
  },

  startTutorial: () => {
    const completed = loadProgress();
    // Find the first uncompleted lesson
    let startIndex = 0;
    for (let i = 0; i < TUTORIAL_LESSONS.length; i++) {
      if (!completed.has(TUTORIAL_LESSONS[i].id)) {
        startIndex = i;
        break;
      }
      if (i === TUTORIAL_LESSONS.length - 1) {
        // All completed, restart from 0
        startIndex = 0;
      }
    }
    const lesson = TUTORIAL_LESSONS[startIndex];
    set({
      active: true,
      currentLessonIndex: startIndex,
      phase: 'intro',
      completedLessons: completed,
      objectiveStatuses: buildObjectiveStatuses(lesson),
      lessonStartTurn: 0,
    });
  },

  startLesson: (index) => {
    const lesson = TUTORIAL_LESSONS[index];
    if (!lesson) return;
    set({
      currentLessonIndex: index,
      phase: 'intro',
      objectiveStatuses: buildObjectiveStatuses(lesson),
      lessonStartTurn: 0,
    });
  },

  dismissIntro: () => {
    set({ phase: 'playing' });
  },

  checkObjectives: (state) => {
    const { phase, currentLessonIndex, objectiveStatuses } = get();
    if (phase !== 'playing') return;

    const lesson = TUTORIAL_LESSONS[currentLessonIndex];
    if (!lesson) return;

    // Update lessonStartTurn on first check
    if (get().lessonStartTurn === 0 && state.turn > 0) {
      set({ lessonStartTurn: state.turn });
    }

    let changed = false;
    const updated = objectiveStatuses.map(os => {
      if (os.completed) return os;
      const objDef = lesson.objectives.find(o => o.id === os.id);
      if (objDef && objDef.check(state)) {
        changed = true;
        return { ...os, completed: true };
      }
      return os;
    });

    if (changed) {
      set({ objectiveStatuses: updated });
    }

    // Check if all objectives are completed
    const allDone = updated.every(os => os.completed);

    // Also auto-complete if max turns reached
    const turnsInLesson = state.turn;
    const autoComplete = turnsInLesson >= lesson.maxTurns;

    if (allDone || autoComplete) {
      // Mark lesson as completed
      const completed = new Set(get().completedLessons);
      completed.add(lesson.id);
      saveProgress(completed);

      set({
        objectiveStatuses: updated,
        completedLessons: completed,
        phase: 'completed',
      });
    }
  },

  completeLesson: () => {
    const lesson = get().getCurrentLesson();
    if (!lesson) return;
    const completed = new Set(get().completedLessons);
    completed.add(lesson.id);
    saveProgress(completed);
    set({ completedLessons: completed, phase: 'completed' });
  },

  nextLesson: () => {
    const nextIndex = get().currentLessonIndex + 1;
    if (nextIndex >= TUTORIAL_LESSONS.length) {
      // All lessons done!
      set({ phase: 'finished' });
      return;
    }
    const lesson = TUTORIAL_LESSONS[nextIndex];
    set({
      currentLessonIndex: nextIndex,
      phase: 'intro',
      objectiveStatuses: buildObjectiveStatuses(lesson),
      lessonStartTurn: 0,
    });
  },

  exitTutorial: () => {
    set({ active: false, phase: 'intro' });
  },

  getActiveHints: (state, locale) => {
    const lesson = get().getCurrentLesson();
    if (!lesson || get().phase !== 'playing') return [];
    return lesson.hints
      .filter(h => h.showWhen(state))
      .map(h => locale === 'zh-TW' ? h.text : h.textEn);
  },
}));
