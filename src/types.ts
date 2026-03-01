export type SectorType = 'food' | 'goods' | 'services';
export type Gender = 'M' | 'F';

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

export interface ActiveRandomEvent {
  def: RandomEventDef;
  turnsRemaining: number;
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
  };
}

export interface GameState {
  turn: number;
  agents: AgentState[];
  market: MarketState;
  government: GovernmentState;
  statistics: TurnSnapshot[];
  events: GameEvent[];
  activeRandomEvents: ActiveRandomEvent[];
  rngState: number;
  gameOver: GameOverState | null;
}
