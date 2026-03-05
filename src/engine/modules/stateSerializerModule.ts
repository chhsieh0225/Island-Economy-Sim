import type {
  GameState,
  IslandTerrainState,
  Infrastructure,
  PendingDecision,
  ActiveRandomEvent,
  PendingPolicyChange,
  PolicyTimelineEntry,
  GameEvent,
  MilestoneRecord,
  GameOverState,
  EconomyStage,
  ScenarioId,
  TurnSnapshot,
} from '../../types';
import type { Agent } from '../Agent';
import type { Market } from '../Market';
import type { Government } from '../Government';
import type { Statistics } from '../Statistics';
import type { RNG } from '../RNG';

export interface StateDirtyFlags {
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
  infrastructure: boolean;
  gameOver: boolean;
}

export function createDirtyFlags(allDirty: boolean): StateDirtyFlags {
  return {
    agents: allDirty,
    terrain: allDirty,
    market: allDirty,
    government: allDirty,
    statistics: allDirty,
    events: allDirty,
    milestones: allDirty,
    activeRandomEvents: allDirty,
    pendingDecision: allDirty,
    pendingPolicies: allDirty,
    policyTimeline: allDirty,
    infrastructure: allDirty,
    gameOver: allDirty,
  };
}

export function clearDirtyFlags(flags: StateDirtyFlags): void {
  flags.agents = false;
  flags.terrain = false;
  flags.market = false;
  flags.government = false;
  flags.statistics = false;
  flags.events = false;
  flags.milestones = false;
  flags.activeRandomEvents = false;
  flags.pendingDecision = false;
  flags.pendingPolicies = false;
  flags.policyTimeline = false;
  flags.infrastructure = false;
  flags.gameOver = false;
}

export function markDirty(flags: StateDirtyFlags, ...keys: Array<keyof StateDirtyFlags>): void {
  for (const key of keys) {
    flags[key] = true;
  }
}

function cloneTerrainState(terrain: IslandTerrainState): IslandTerrainState {
  return {
    ...terrain,
    coastlineOffsets: [...terrain.coastlineOffsets],
    zoneOffsets: {
      food: { ...terrain.zoneOffsets.food },
      goods: { ...terrain.zoneOffsets.goods },
      services: { ...terrain.zoneOffsets.services },
    },
    sectorSuitability: { ...terrain.sectorSuitability },
    sectorFeatures: { ...terrain.sectorFeatures },
  };
}

function appendOrCloneArray<T>(source: T[], previous?: T[]): T[] {
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

export function buildGameState(params: {
  turn: number;
  economyStage: EconomyStage;
  seed: number;
  scenarioId: ScenarioId;
  agents: Agent[];
  terrain: IslandTerrainState;
  market: Market;
  government: Government;
  statistics: Statistics;
  events: GameEvent[];
  milestones: MilestoneRecord[];
  activeRandomEvents: ActiveRandomEvent[];
  pendingDecision: PendingDecision | null;
  pendingPolicies: PendingPolicyChange[];
  policyTimeline: PolicyTimelineEntry[];
  infrastructure: Infrastructure[];
  gameOver: GameOverState | null;
  rng: RNG;
  dirty: StateDirtyFlags;
  previous: GameState | null;
}): GameState {
  const { dirty, previous: cachedPrev } = params;
  const prev = cachedPrev ?? undefined;

  const agents = dirty.agents || !prev
    ? params.agents.map(a => a.toState())
    : prev.agents;
  const terrain = dirty.terrain || !prev
    ? cloneTerrainState(params.terrain)
    : prev.terrain;
  const market = dirty.market || !prev
    ? params.market.toState(prev?.market)
    : prev.market;
  const government = dirty.government || !prev
    ? params.government.toState(prev?.government)
    : prev.government;
  const statistics = dirty.statistics || !prev
    ? appendOrCloneArray(params.statistics.history, prev?.statistics) as TurnSnapshot[]
    : prev.statistics;
  const events = dirty.events || !prev
    ? appendOrCloneArray(params.events, prev?.events)
    : prev.events;
  const milestones = dirty.milestones || !prev
    ? appendOrCloneArray(params.milestones, prev?.milestones)
    : prev.milestones;
  const activeRandomEvents = dirty.activeRandomEvents || !prev
    ? params.activeRandomEvents.map(e => ({
      def: e.def,
      turnsRemaining: e.turnsRemaining,
    }))
    : prev.activeRandomEvents;
  const pendingDecision = dirty.pendingDecision || !prev
    ? (params.pendingDecision
      ? {
        ...params.pendingDecision,
        choices: [...params.pendingDecision.choices] as PendingDecision['choices'],
      }
      : null)
    : prev.pendingDecision;
  const pendingPolicies = dirty.pendingPolicies || !prev
    ? [...params.pendingPolicies]
    : prev.pendingPolicies;
  const policyTimeline = dirty.policyTimeline || !prev
    ? params.policyTimeline.map(entry => ({ ...entry, sideEffects: [...entry.sideEffects] }))
    : prev.policyTimeline;
  const infrastructure = dirty.infrastructure || !prev
    ? params.infrastructure.map(i => ({ ...i }))
    : prev.infrastructure;
  const gameOver = dirty.gameOver || !prev
    ? params.gameOver
    : prev.gameOver;

  return {
    turn: params.turn,
    agents,
    terrain,
    economyStage: params.economyStage,
    market,
    government,
    statistics,
    events,
    milestones,
    activeRandomEvents,
    pendingDecision,
    pendingPolicies,
    policyTimeline,
    infrastructure,
    rngState: params.rng.getState(),
    seed: params.seed,
    scenarioId: params.scenarioId,
    gameOver,
  };
}
