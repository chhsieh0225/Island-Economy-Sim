import type { Infrastructure, InfrastructureType, SectorType } from '../../types';
import type { Agent } from '../Agent';
import { te } from '../engineI18n';

export interface InfrastructureDef {
  type: InfrastructureType;
  label: string;
  labelEn: string;
  description: string;
  cost: number;
  buildTurns: number;
  maxCount: number;
  effect: InfrastructureEffect;
}

export interface InfrastructureEffect {
  /** Sector productivity boost (additive %) */
  productivityBoost?: Partial<Record<SectorType, number>>;
  /** Health boost per turn for all agents */
  healthBoost?: number;
  /** Satisfaction boost per turn for all agents */
  satisfactionBoost?: number;
  /** Overall productivity multiplier */
  overallProductivity?: number;
}

export const INFRASTRUCTURE_DEFS: InfrastructureDef[] = [
  {
    type: 'well',
    label: te('infra.well'),
    labelEn: 'Well',
    description: te('infra.well.desc'),
    cost: 150,
    buildTurns: 2,
    maxCount: 3,
    effect: {
      productivityBoost: { food: 0.10 },
    },
  },
  {
    type: 'workshop',
    label: te('infra.workshop'),
    labelEn: 'Workshop',
    description: te('infra.workshop.desc'),
    cost: 200,
    buildTurns: 3,
    maxCount: 3,
    effect: {
      productivityBoost: { goods: 0.12 },
    },
  },
  {
    type: 'clinic',
    label: te('infra.clinic'),
    labelEn: 'Clinic',
    description: te('infra.clinic.desc'),
    cost: 250,
    buildTurns: 3,
    maxCount: 2,
    effect: {
      healthBoost: 2,
      satisfactionBoost: 1,
    },
  },
  {
    type: 'school',
    label: te('infra.school'),
    labelEn: 'School',
    description: te('infra.school.desc'),
    cost: 300,
    buildTurns: 4,
    maxCount: 2,
    effect: {
      overallProductivity: 0.05,
    },
  },
  {
    type: 'port',
    label: te('infra.port'),
    labelEn: 'Port',
    description: te('infra.port.desc'),
    cost: 400,
    buildTurns: 5,
    maxCount: 1,
    effect: {
      productivityBoost: { services: 0.15 },
      overallProductivity: 0.03,
    },
  },
];

export function getInfrastructureDef(type: InfrastructureType): InfrastructureDef {
  return INFRASTRUCTURE_DEFS.find(d => d.type === type)!;
}

export function canBuild(
  type: InfrastructureType,
  existing: Infrastructure[],
  treasury: number,
): { ok: boolean; reason?: string } {
  const def = getInfrastructureDef(type);
  const activeCount = existing.filter(i => i.type === type).length;
  if (activeCount >= def.maxCount) {
    return { ok: false, reason: te('infra.error.maxReached', { max: def.maxCount }) };
  }
  if (treasury < def.cost) {
    return { ok: false, reason: te('infra.error.noFunds', { cost: def.cost }) };
  }
  return { ok: true };
}

export function buildInfrastructure(
  type: InfrastructureType,
  turn: number,
  existing: Infrastructure[],
): Infrastructure {
  const def = getInfrastructureDef(type);
  const id = `${type}_${existing.filter(i => i.type === type).length + 1}`;
  return {
    id,
    type,
    builtTurn: turn,
    buildTurnsLeft: def.buildTurns,
  };
}

export function tickInfrastructure(list: Infrastructure[]): Infrastructure[] {
  return list.map(infra =>
    infra.buildTurnsLeft > 0
      ? { ...infra, buildTurnsLeft: infra.buildTurnsLeft - 1 }
      : infra,
  );
}

export function computeInfrastructureEffects(list: Infrastructure[]): InfrastructureEffect {
  const combined: Required<InfrastructureEffect> = {
    productivityBoost: {},
    healthBoost: 0,
    satisfactionBoost: 0,
    overallProductivity: 0,
  };

  for (const infra of list) {
    if (infra.buildTurnsLeft > 0) continue; // still building
    const def = getInfrastructureDef(infra.type);
    const fx = def.effect;

    if (fx.productivityBoost) {
      for (const [sector, boost] of Object.entries(fx.productivityBoost)) {
        const s = sector as SectorType;
        combined.productivityBoost[s] = (combined.productivityBoost[s] ?? 0) + boost;
      }
    }
    combined.healthBoost += fx.healthBoost ?? 0;
    combined.satisfactionBoost += fx.satisfactionBoost ?? 0;
    combined.overallProductivity += fx.overallProductivity ?? 0;
  }

  return combined;
}

export function applyInfrastructureEffects(infrastructure: Infrastructure[], aliveAgents: Agent[]): void {
  const fx = computeInfrastructureEffects(infrastructure);
  const hBoost = fx.healthBoost ?? 0;
  const sBoost = fx.satisfactionBoost ?? 0;
  if (hBoost <= 0 && sBoost <= 0) return;

  for (const agent of aliveAgents) {
    if (hBoost > 0) {
      agent.health = Math.min(100, agent.health + hBoost);
    }
    if (sBoost > 0) {
      agent.satisfaction = Math.min(100, agent.satisfaction + sBoost);
    }
  }
  // Productivity boosts are applied via the production phase
}
