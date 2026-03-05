import { create } from 'zustand';
import type { AgentState, ScenarioNarrative } from '../types';
import type { NarrativeContent } from '../data/narrative';

export type MapFeatureType = 'bank' | 'residential' | 'farm' | 'goods' | 'services';
export type RightTab = 'market' | 'terrain' | 'events' | 'milestones' | 'encyclopedia';
export type AppMode = 'start' | 'freeplay' | 'tutorial';

/** Union type for all narratives the modal can display */
export type NarrativeDisplay =
  | { kind: 'scenario'; data: ScenarioNarrative }
  | { kind: 'story'; data: NarrativeContent };

const FEATURE_HIGHLIGHT_MS = 1700;

interface UiState {
  appMode: AppMode;
  selectedAgent: AgentState | null;
  selectedMapFeature: MapFeatureType | null;
  featureHighlight: { feature: MapFeatureType; untilMs: number } | null;
  rightTab: RightTab;
  narrativeToShow: NarrativeDisplay | null;

  setAppMode: (mode: AppMode) => void;
  selectAgent: (agent: AgentState) => void;
  clearAgent: () => void;
  selectMapFeature: (feature: MapFeatureType) => void;
  clearMapFeature: () => void;
  setRightTab: (tab: RightTab) => void;
  showNarrative: (narrative: ScenarioNarrative) => void;
  showStoryNarrative: (narrative: NarrativeContent) => void;
  dismissNarrative: () => void;
  resetSelections: () => void;
}

export const useUiStore = create<UiState>((set) => ({
  appMode: 'start',
  selectedAgent: null,
  selectedMapFeature: null,
  featureHighlight: null,
  rightTab: 'terrain',
  narrativeToShow: null,

  setAppMode: (mode) => {
    set({ appMode: mode });
  },

  selectAgent: (agent) => {
    set({ selectedAgent: agent, selectedMapFeature: null });
  },

  clearAgent: () => {
    set({ selectedAgent: null });
  },

  selectMapFeature: (feature) => {
    const now = typeof performance !== 'undefined' ? performance.now() : Date.now();
    set({
      selectedAgent: null,
      selectedMapFeature: feature,
      featureHighlight: { feature, untilMs: now + FEATURE_HIGHLIGHT_MS },
    });
  },

  clearMapFeature: () => {
    set({ selectedMapFeature: null });
  },

  setRightTab: (tab) => {
    set({ rightTab: tab });
  },

  showNarrative: (narrative) => {
    set({ narrativeToShow: { kind: 'scenario', data: narrative } });
  },

  showStoryNarrative: (narrative) => {
    set({ narrativeToShow: { kind: 'story', data: narrative } });
  },

  dismissNarrative: () => {
    set({ narrativeToShow: null });
  },

  resetSelections: () => {
    set({ selectedAgent: null, selectedMapFeature: null, featureHighlight: null });
  },
}));

export { FEATURE_HIGHLIGHT_MS };
