export type SectorType = 'food' | 'goods' | 'services';

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

export interface GameState {
  turn: number;
  agents: AgentState[];
  market: MarketState;
  government: GovernmentState;
  statistics: TurnSnapshot[];
  events: GameEvent[];
  activeRandomEvents: ActiveRandomEvent[];
}
