import { create } from 'zustand';
import type { ToastNotification, MilestoneRecord } from '../types';
import { buildLearningJourney } from '../learning/journey';
import type { GameState } from '../types';

interface NotificationState {
  toastQueue: ToastNotification[];
  tutorialToastsEnabled: boolean;

  dismissToast: (id: string) => void;
  setTutorialToasts: (enabled: boolean) => void;
  pushPolicyToast: (message: string) => void;
  pushMilestoneToasts: (milestones: MilestoneRecord[]) => void;
  pushLearningToasts: (state: GameState) => void;
}

let toastIdCounter = 0;
const completedQuestIds = new Set<string>();
const unlockedNodeIds = new Set<string>();

function readTutorialPref(): boolean {
  try {
    const raw = window.localStorage.getItem('econ_sim_tutorial_toasts_enabled');
    if (raw === 'false') return false;
  } catch { /* ignore */ }
  return true;
}

export const useNotificationStore = create<NotificationState>((set, get) => ({
  toastQueue: [],
  tutorialToastsEnabled: readTutorialPref(),

  dismissToast: (id) => {
    set(s => ({ toastQueue: s.toastQueue.filter(t => t.id !== id) }));
  },

  setTutorialToasts: (enabled) => {
    set({ tutorialToastsEnabled: enabled });
    try {
      window.localStorage.setItem('econ_sim_tutorial_toasts_enabled', enabled ? 'true' : 'false');
    } catch { /* ignore */ }
  },

  pushPolicyToast: (message) => {
    const toast: ToastNotification = {
      id: `toast-${toastIdCounter++}`,
      type: 'info',
      title: '政策調整',
      message,
      createdAt: Date.now(),
      duration: 2500,
    };
    set(s => ({ toastQueue: [...s.toastQueue, toast].slice(-6) }));
  },

  pushMilestoneToasts: (milestones) => {
    if (milestones.length === 0) return;
    const now = Date.now();
    const toasts: ToastNotification[] = milestones.map(m => ({
      id: `toast-${toastIdCounter++}`,
      type: 'milestone' as const,
      title: m.title,
      message: m.description,
      createdAt: now,
      duration: 4000,
    }));
    set(s => ({ toastQueue: [...s.toastQueue, ...toasts].slice(-6) }));
  },

  pushLearningToasts: (state) => {
    const { tutorialToastsEnabled } = get();
    if (!tutorialToastsEnabled) return;

    const learning = buildLearningJourney(state);
    const toasts: ToastNotification[] = [];

    for (const quest of learning.quests) {
      if (!quest.done || completedQuestIds.has(quest.id)) continue;
      toasts.push({
        id: `toast-${toastIdCounter++}`,
        type: 'celebration',
        title: `新手任務完成：${quest.title}`,
        message: quest.objective,
        createdAt: Date.now(),
        duration: 5200,
      });
    }

    for (const node of learning.knowledgeNodes) {
      if (!node.unlocked || unlockedNodeIds.has(node.id)) continue;
      toasts.push({
        id: `toast-${toastIdCounter++}`,
        type: 'info',
        title: `知識解鎖：${node.title}`,
        message: `${node.chain} · ${node.concept}`,
        createdAt: Date.now(),
        duration: 5200,
      });
    }

    // Update tracking sets
    completedQuestIds.clear();
    for (const q of learning.quests) { if (q.done) completedQuestIds.add(q.id); }
    unlockedNodeIds.clear();
    for (const n of learning.knowledgeNodes) { if (n.unlocked) unlockedNodeIds.add(n.id); }

    if (toasts.length > 0) {
      set(s => ({ toastQueue: [...s.toastQueue, ...toasts.slice(0, 3)].slice(-8) }));
    }
  },
}));

// Initialize tracking sets from initial state
export function initLearningTracking(state: GameState): void {
  const learning = buildLearningJourney(state);
  completedQuestIds.clear();
  for (const q of learning.quests) { if (q.done) completedQuestIds.add(q.id); }
  unlockedNodeIds.clear();
  for (const n of learning.knowledgeNodes) { if (n.unlocked) unlockedNodeIds.add(n.id); }
}
