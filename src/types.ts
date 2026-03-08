export type SectorType = 'food' | 'goods' | 'services';
export type Gender = 'M' | 'F';
export type AgeGroup = 'youth' | 'adult' | 'senior';
export type ScenarioId = 'baseline' | 'inflation' | 'inequality' | 'aging';
export type AgentGoalType = 'survival' | 'wealth' | 'happiness' | 'balanced';
export type EconomyStage = 'agriculture' | 'industrial' | 'service';
export type TaxMode = 'flat' | 'progressive';

export const SECTORS: SectorType[] = ['food', 'goods', 'services'];

export interface AgentState {
  id: number;
  name: string;
  sector: SectorType;
  money: number;
  savings: number;
  inventory: Record<SectorType, number>;
  health: number;
  satisfaction: number;
  productivity: number;
  alive: boolean;
  lowIncomeTurns: number;
  incomeHistory: number[];
  lastNetIncome: number;
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
  taxMode: TaxMode;
  subsidies: Record<SectorType, number>;
  welfareEnabled: boolean;
  publicWorksActive: boolean;
  policyRate: number; // annual policy rate
  liquiditySupportActive: boolean;
  stockpileEnabled: boolean;
  stockpile: Record<SectorType, number>;
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
  workingAgePopulation: number;
  laborForce: number;
  employed: number;
  unemployed: number;
  employmentRate: number;
  unemploymentRate: number;
  laborParticipationRate: number;
  crudeBirthRate: number; // annual births per 1,000 people
  fertilityRate: number; // annual births per reproductive-age woman
  laborProductivity: number; // GDP per employed worker
  dependencyRatio: number; // (children + seniors) / working-age population
  moneySupply: number; // total circulating money: Σ(alive: money+savings) + government treasury
  causalReplay: TurnCausalReplay;
}

export interface CausalDriver {
  id: string;
  label: string;
  value: number;
}

export interface CausalMetricReplay {
  net: number;
  unit: 'point' | 'count';
  drivers: CausalDriver[];
}

export interface TurnCausalReplay {
  satisfaction: CausalMetricReplay;
  health: CausalMetricReplay;
  departures: CausalMetricReplay;
  policy: PolicyExecutionReplay;
}

export interface PolicyExecutionReplay {
  fiscalInjection: number;         // new money created per turn (government money creation)
  taxCollected: number;
  welfarePaid: number;
  welfareRecipients: number;
  publicWorksCost: number;
  liquidityInjected: number;
  autoStabilizerSpent: number; // emergency welfare from automatic fiscal stabilizers
  stockpileBuySpent: number;       // treasury spent buying goods into stockpile
  stockpileSellRevenue: number;    // treasury gained from selling stockpile goods
  stockpileMaintenance: number;    // storage maintenance cost
  policyRate: number;
  perCapitaCashDelta: number; // (welfare + liquidity + autoStabilizer - tax) / population
  treasuryDelta: number; // fiscalInjection + tax - welfare - publicWorks - liquidity - autoStabilizer - stockpile
}

export interface GameEvent {
  turn: number;
  type: 'info' | 'warning' | 'critical' | 'positive';
  message: string;
}

export interface RandomEventDef {
  id: string;
  name: string;
  nameEn: string;
  probability: number;
  duration: number;
  effects: RandomEventEffects;
  message: string;
  messageEn: string;
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
  labelEn: string;
  description: string;
  descriptionEn: string;
  immediate?: DecisionImmediateEffects;
  temporary?: {
    duration: number;
    effects: RandomEventEffects;
    message: string;
    messageEn: string;
    severity?: GameEvent['type'];
  };
}

export interface DecisionEventDef {
  id: string;
  name: string;
  nameEn: string;
  probability: number;
  message: string;
  messageEn: string;
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

export type PendingPolicyType =
  | 'tax'
  | 'taxMode'
  | 'subsidy'
  | 'welfare'
  | 'publicWorks'
  | 'policyRate'
  | 'liquiditySupport'
  | 'stockpile';

export interface PendingPolicyChange {
  id: string;
  type: PendingPolicyType;
  requestedTurn: number;
  applyTurn: number;
  value: number | boolean | string;
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
  value: number | boolean | string;
  sector?: SectorType;
  summary: string;
  sideEffects: string[];
}

export interface ScenarioNarrative {
  title: string;
  titleEn: string;
  paragraphs: string[];
  paragraphsEn: string[];
  challenge: string;
  challengeEn: string;
}

export interface ScenarioDef {
  id: ScenarioId;
  name: string;
  nameEn: string;
  description: string;
  descriptionEn: string;
  initialTreasury?: number;
  initialTaxRate?: number;
  initialPolicyRate?: number;
  initialSubsidies?: Partial<Record<SectorType, number>>;
  enableWelfare?: boolean;
  enablePublicWorks?: boolean;
  enableLiquiditySupport?: boolean;
  priceMultiplier?: Partial<Record<SectorType, number>>;
  ageShiftTurns?: number;
  wealthSkew?: {
    topPercent: number;
    topMultiplier: number;
    bottomMultiplier: number;
  };
  openingNarrative?: ScenarioNarrative;
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

export type SectorDevelopmentLevel = 'weak' | 'initial' | 'growth' | 'mature' | 'dominant';

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

// Toast notification system
export interface ToastNotification {
  id: string;
  type: 'milestone' | 'population' | 'celebration' | 'info';
  title: string;
  message: string;
  createdAt: number;
  duration: number;
}

// Reflective question for game over
export interface ReflectiveQuestion {
  question: string;
  context: string;
  realWorldComparison?: string;
}

// Agent biography for game over
export interface AgentBiography {
  agentId: number;
  name: string;
  title: string;
  narrative: string;
  highlights: string[];
}

// Best-of rankings for game over
export interface BestOfRanking {
  category: string;
  label: string;
  agentName: string;
  value: string;
}

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
    reflectiveQuestions: ReflectiveQuestion[];
    agentBiographies: AgentBiography[];
    bestOfRankings: BestOfRanking[];
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

export type InfrastructureType = 'well' | 'workshop' | 'clinic' | 'school' | 'port';

export interface Infrastructure {
  id: string;
  type: InfrastructureType;
  builtTurn: number;
  /** Turns remaining until operational (0 = active) */
  buildTurnsLeft: number;
}

export interface GameState {
  turn: number;
  agents: AgentState[];
  terrain: IslandTerrainState;
  economyStage: EconomyStage;
  market: MarketState;
  government: GovernmentState;
  statistics: TurnSnapshot[];
  events: GameEvent[];
  milestones: MilestoneRecord[];
  activeRandomEvents: ActiveRandomEvent[];
  pendingDecision: PendingDecision | null;
  pendingPolicies: PendingPolicyChange[];
  policyTimeline: PolicyTimelineEntry[];
  infrastructure: Infrastructure[];
  rngState: number;
  seed: number;
  scenarioId: ScenarioId;
  gameOver: GameOverState | null;
}
