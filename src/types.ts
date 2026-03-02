export type SectorType = 'food' | 'goods' | 'services';
export type Gender = 'M' | 'F';
export type AgeGroup = 'youth' | 'adult' | 'senior';
export type ScenarioId = 'baseline' | 'inflation' | 'inequality' | 'aging';
export type AgentGoalType = 'survival' | 'wealth' | 'happiness' | 'balanced';

export const SECTORS: SectorType[] = ['food', 'goods', 'services'];

export interface AgentState {
  id: number;
  name: string;
  sector: SectorType;
  money: number;
  inventory: Record<SectorType, number>;
  health: number;
  satisfaction: number;
  productivity: number;
  alive: boolean;
  lowIncomeTurns: number;
  incomeHistory: number[];
  turnsInSector: number;
  age: number;           // in turns (1 turn = 1 month)
  maxAge: number;        // natural death age in turns
  intelligence: number;  // IQ-like: 55-145, mean 100
  baseLuck: number;      // permanent luck bias: -0.1 to +0.1
  gender: Gender;
  causeOfDeath?: 'health' | 'age' | 'left';
  totalSwitches: number;
  switchHistory: SectorType[];
  familyId: number;
  ageGroup: AgeGroup;
  goalType: AgentGoalType;
  lifeEvents: AgentLifeEvent[];
}

export interface AgentLifeEvent {
  turn: number;
  category: 'join' | 'job' | 'leave' | 'death' | 'achievement';
  message: string;
  severity: GameEvent['type'];
}

export interface SellOrder {
  agentId: number;
  sector: SectorType;
  quantity: number;
  minPrice: number;
}

export interface BuyOrder {
  agentId: number;
  sector: SectorType;
  quantity: number;
  maxPrice: number;
}

export interface MarketState {
  prices: Record<SectorType, number>;
  priceHistory: Record<SectorType, number[]>;
  supply: Record<SectorType, number>;
  demand: Record<SectorType, number>;
  volume: Record<SectorType, number>;
}

export interface GovernmentState {
  treasury: number;
  taxRate: number;
  subsidies: Record<SectorType, number>;
  welfareEnabled: boolean;
  publicWorksActive: boolean;
}

export interface TurnSnapshot {
  turn: number;
  population: number;
  gdp: number;
  giniCoefficient: number;
  avgSatisfaction: number;
  avgHealth: number;
  jobDistribution: Record<SectorType, number>;
  market: MarketState;
  government: GovernmentState;
  births: number;
  deaths: number;
  avgAge: number;  // in years
}

export interface GameEvent {
  turn: number;
  type: 'info' | 'warning' | 'critical' | 'positive';
  message: string;
}

export interface RandomEventDef {
  id: string;
  name: string;
  probability: number;
  duration: number;
  effects: RandomEventEffects;
  message: string;
  severity: GameEvent['type'];
}

export interface RandomEventEffects {
  sectorProductivity?: Partial<Record<SectorType, number>>;
  priceModifier?: Partial<Record<SectorType, number>>;
  satisfactionBoost?: number;
  healthDamage?: number;
  productivityPenalty?: number;
  servicesDemandBoost?: number;
}

export interface DecisionImmediateEffects {
  treasuryDelta?: number;
  satisfactionDelta?: number;
  healthDelta?: number;
  taxRateDelta?: number;
  subsidyDelta?: Partial<Record<SectorType, number>>;
}

export interface DecisionChoice {
  id: string;
  label: string;
  description: string;
  immediate?: DecisionImmediateEffects;
  temporary?: {
    duration: number;
    effects: RandomEventEffects;
    message: string;
    severity?: GameEvent['type'];
  };
}

export interface DecisionEventDef {
  id: string;
  name: string;
  probability: number;
  message: string;
  severity: GameEvent['type'];
  choices: [DecisionChoice, DecisionChoice];
}

export interface PendingDecision {
  id: string;
  name: string;
  message: string;
  severity: GameEvent['type'];
  choices: [DecisionChoice, DecisionChoice];
  turnIssued: number;
}

export interface ActiveRandomEvent {
  def: RandomEventDef;
  turnsRemaining: number;
}

export type PendingPolicyType = 'tax' | 'subsidy' | 'welfare' | 'publicWorks';

export interface PendingPolicyChange {
  id: string;
  type: PendingPolicyType;
  requestedTurn: number;
  applyTurn: number;
  value: number | boolean;
  sector?: SectorType;
  summary: string;
  sideEffects: string[];
}

export interface PolicyTimelineEntry {
  id: string;
  type: PendingPolicyType;
  requestedTurn: number;
  applyTurn: number;
  resolvedTurn?: number;
  status: 'pending' | 'applied';
  value: number | boolean;
  sector?: SectorType;
  summary: string;
  sideEffects: string[];
}

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  description: string;
  initialTreasury?: number;
  initialTaxRate?: number;
  initialSubsidies?: Partial<Record<SectorType, number>>;
  enableWelfare?: boolean;
  enablePublicWorks?: boolean;
  priceMultiplier?: Partial<Record<SectorType, number>>;
  ageShiftTurns?: number;
  wealthSkew?: {
    topPercent: number;
    topMultiplier: number;
    bottomMultiplier: number;
  };
}

export interface IslandTerrainState {
  seed: number;
  coastlineOffsets: number[];
  islandScaleX: number;
  islandScaleY: number;
  islandRotation: number;
  zoneOffsets: Record<SectorType, { x: number; y: number }>;
  sectorSuitability: Record<SectorType, number>;
  sectorFeatures: Record<SectorType, string>;
}

export interface ScoreBreakdown {
  totalScore: number;
  populationScore: number;
  prosperityScore: number;
  equalityScore: number;
  wellbeingScore: number;
  stabilityScore: number;
  longevityScore: number;
}

export type SectorDevelopmentLevel = '薄弱' | '起步' | '成長' | '成熟' | '主導';

export interface SectorDevelopmentSummary {
  share: number; // percentage 0-100
  level: SectorDevelopmentLevel;
  comment: string;
}

export type GameOverReason =
  | 'all_dead'
  | 'gdp_victory'
  | 'treasury_victory'
  | 'max_turns'
  | 'player_exit';

export interface GameOverState {
  reason: GameOverReason;
  turn: number;
  score: ScoreBreakdown;
  finalStats: {
    peakPopulation: number;
    totalBirths: number;
    totalDeaths: number;
    peakGdp: number;
    avgSatisfaction: number;
    avgHealth: number;
    sectorDevelopment: Record<SectorType, SectorDevelopmentSummary>;
    counterfactualNotes: string[];
  };
}

export type MilestoneKind = 'wealth' | 'talent' | 'longevity' | 'career' | 'family' | 'work';

export interface MilestoneRecord {
  id: string;
  turn: number;
  kind: MilestoneKind;
  title: string;
  description: string;
  agentId?: number;
  familyId?: number;
}

export interface RunSummary {
  id: number;
  timestamp: string;
  scenarioId: ScenarioId;
  scenarioName: string;
  seed: number;
  turns: number;
  reason: GameOverReason | 'reset';
  finalPopulation: number;
  totalBirths: number;
  totalDeaths: number;
  finalGdp: number;
  finalGini: number;
  score: number;
}

export interface GameState {
  turn: number;
  agents: AgentState[];
  terrain: IslandTerrainState;
  market: MarketState;
  government: GovernmentState;
  statistics: TurnSnapshot[];
  events: GameEvent[];
  milestones: MilestoneRecord[];
  activeRandomEvents: ActiveRandomEvent[];
  pendingDecision: PendingDecision | null;
  pendingPolicies: PendingPolicyChange[];
  policyTimeline: PolicyTimelineEntry[];
  rngState: number;
  seed: number;
  scenarioId: ScenarioId;
  gameOver: GameOverState | null;
}
