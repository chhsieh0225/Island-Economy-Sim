import type { Infrastructure, InfrastructureType, SectorType } from '../../types';

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
    label: '水井',
    labelEn: 'Well',
    description: '改善灌溉，提升食物產量 10%',
    cost: 150,
    buildTurns: 2,
    maxCount: 3,
    effect: {
      productivityBoost: { food: 0.10 },
    },
  },
  {
    type: 'workshop',
    label: '工坊',
    labelEn: 'Workshop',
    description: '改善生產設備，提升商品產量 12%',
    cost: 200,
    buildTurns: 3,
    maxCount: 3,
    effect: {
      productivityBoost: { goods: 0.12 },
    },
  },
  {
    type: 'clinic',
    label: '診所',
    labelEn: 'Clinic',
    description: '每回合全島民健康 +2，滿意度 +1',
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
    label: '學校',
    labelEn: 'School',
    description: '全產業生產力 +5%',
    cost: 300,
    buildTurns: 4,
    maxCount: 2,
    effect: {
      overallProductivity: 0.05,
    },
  },
  {
    type: 'port',
    label: '港口',
    labelEn: 'Port',
    description: '提升服務業產量 15%，全產業 +3%',
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
    return { ok: false, reason: `已達上限 (${def.maxCount})` };
  }
  if (treasury < def.cost) {
    return { ok: false, reason: `國庫不足 (需 $${def.cost})` };
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
