import type { AgentState, IslandTerrainState, SectorType } from '../../types';
import {
  clampPointToIsland,
  getIslandGeometry,
  getIslandPolarMetrics,
} from './islandGeometry';

export interface Point {
  x: number;
  y: number;
}

export interface ZoneLayout {
  farm: { cx: number; cy: number; rx: number; ry: number };
  goods: { cx: number; cy: number; rx: number; ry: number };
  services: { cx: number; cy: number; rx: number; ry: number };
  residential: Array<{ cx: number; cy: number; rx: number; ry: number }>;
  market: { cx: number; cy: number; r: number };
}

// Animation phases within a turn cycle (phase-synced: produce → trade → return)
export type AnimPhase = 'working' | 'toMarket' | 'atMarket' | 'returning';

const BASE_RESIDENTIAL_BLOCKS = 3;
const MAX_RESIDENTIAL_BLOCKS = 9;
const RESIDENTIAL_GROWTH_THRESHOLD = 110;
const RESIDENTIAL_GROWTH_STEP = 28;

type ResidentialAnchor = {
  xFactor: number;
  yFactor: number;
  driftSector: SectorType;
};

const RESIDENTIAL_ANCHORS: ResidentialAnchor[] = [
  { xFactor: 0.68, yFactor: 0.58, driftSector: 'food' },
  { xFactor: 0.48, yFactor: 1.32, driftSector: 'goods' },
  { xFactor: 1.52, yFactor: 1.30, driftSector: 'services' },
  { xFactor: 0.95, yFactor: 0.44, driftSector: 'food' },
  { xFactor: 1.18, yFactor: 0.66, driftSector: 'services' },
  { xFactor: 0.34, yFactor: 1.02, driftSector: 'goods' },
  { xFactor: 1.66, yFactor: 1.02, driftSector: 'services' },
  { xFactor: 0.86, yFactor: 1.56, driftSector: 'goods' },
  { xFactor: 1.20, yFactor: 1.56, driftSector: 'services' },
];

export function getResidentialBlockCount(population: number): number {
  if (population <= RESIDENTIAL_GROWTH_THRESHOLD) {
    return BASE_RESIDENTIAL_BLOCKS;
  }
  const extra = Math.floor((population - RESIDENTIAL_GROWTH_THRESHOLD) / RESIDENTIAL_GROWTH_STEP) + 1;
  return Math.max(
    BASE_RESIDENTIAL_BLOCKS,
    Math.min(MAX_RESIDENTIAL_BLOCKS, BASE_RESIDENTIAL_BLOCKS + extra),
  );
}

export function getZoneLayout(
  w: number,
  h: number,
  terrain: IslandTerrainState,
  population: number = 100,
): ZoneLayout {
  // Island center
  const cx = w / 2;
  const cy = h / 2;
  const suitability = terrain.sectorSuitability;
  const zoneOffsets = terrain.zoneOffsets;

  const foodSize = 1 + (suitability.food - 1) * 0.45;
  const goodsSize = 1 + (suitability.goods - 1) * 0.45;
  const serviceSize = 1 + (suitability.services - 1) * 0.45;

  const island = getIslandGeometry(w, h, terrain);

  const buildZone = (
    rawCenter: Point,
    rx: number,
    ry: number,
  ) => {
    const clampedCenter = clampPointToIsland(rawCenter, island, 0.78);
    const metrics = getIslandPolarMetrics(clampedCenter, island);
    const edgeRatio = metrics.radial / Math.max(0.001, metrics.boundary);
    const edgeShrink = Math.max(0.58, 1 - Math.max(0, edgeRatio - 0.5) * 0.9);
    return {
      cx: clampedCenter.x,
      cy: clampedCenter.y,
      rx: rx * edgeShrink,
      ry: ry * edgeShrink,
    };
  };

  const farm = buildZone(
    { x: cx + w * zoneOffsets.food.x, y: cy * 0.42 + h * zoneOffsets.food.y },
    w * 0.22 * foodSize,
    h * 0.14 * foodSize,
  );
  const goods = buildZone(
    { x: cx * 0.58 + w * zoneOffsets.goods.x, y: cy * 1.38 + h * zoneOffsets.goods.y },
    w * 0.16 * goodsSize,
    h * 0.14 * goodsSize,
  );
  const services = buildZone(
    { x: cx * 1.42 + w * zoneOffsets.services.x, y: cy * 1.38 + h * zoneOffsets.services.y },
    w * 0.16 * serviceSize,
    h * 0.14 * serviceSize,
  );

  const residentialCount = getResidentialBlockCount(population);
  const residential = RESIDENTIAL_ANCHORS.slice(0, residentialCount).map((anchor, index) => {
    const drift = zoneOffsets[anchor.driftSector];
    const zoneScale = index >= 3 ? 0.9 : 1;
    return buildZone(
      {
        x: cx * anchor.xFactor + w * drift.x * 0.48,
        y: cy * anchor.yFactor + h * drift.y * 0.42,
      },
      w * 0.11 * zoneScale,
      h * 0.095 * zoneScale,
    );
  });

  const marketCenter = clampPointToIsland({ x: cx, y: cy * 0.92 }, island, 0.88);

  return {
    farm,
    goods,
    services,
    residential,
    market: { cx: marketCenter.x, cy: marketCenter.y, r: w * 0.06 },
  };
}

// Seeded pseudo-random for stable agent positions
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

function distributeInZone(
  zone: { cx: number; cy: number; rx: number; ry: number },
  seedA: number,
  seedB: number,
): Point {
  const angle = seededRandom(seedA) * Math.PI * 2;
  const radius = Math.sqrt(seededRandom(seedB)) * 0.86;
  return {
    x: zone.cx + Math.cos(angle) * zone.rx * radius,
    y: zone.cy + Math.sin(angle) * zone.ry * radius,
  };
}

export function computeWorkPosition(
  agentId: number,
  sector: SectorType,
  layout: ZoneLayout,
  terrain: IslandTerrainState,
  w: number,
  h: number,
): Point {
  const zone = sector === 'food' ? layout.farm
    : sector === 'goods' ? layout.goods
    : layout.services;

  const rawPoint = distributeInZone(zone, agentId * 7 + 1, agentId * 13 + 3);
  const island = getIslandGeometry(w, h, terrain);
  return clampPointToIsland(rawPoint, island, 0.88);
}

export function computeResidencePosition(
  agentId: number,
  familyId: number,
  sector: SectorType,
  layout: ZoneLayout,
  terrain: IslandTerrainState,
  w: number,
  h: number,
): Point {
  const residentialZones = layout.residential;
  const zoneCount = residentialZones.length;
  if (zoneCount === 0) {
    return computeWorkPosition(agentId, sector, layout, terrain, w, h);
  }

  const householdSeed = Math.abs(familyId || agentId);
  const baseZone = sector === 'food' ? 0 : sector === 'goods' ? 1 : 2;
  let zoneIndex = baseZone % zoneCount;

  const driftRoll = seededRandom(householdSeed * 29 + agentId * 11 + 7);
  if (driftRoll < 0.1) {
    zoneIndex = (zoneIndex + 1) % zoneCount;
  } else if (driftRoll > 0.92) {
    zoneIndex = (zoneIndex + zoneCount - 1) % zoneCount;
  }

  const zone = residentialZones[zoneIndex];

  const rawPoint = distributeInZone(
    zone,
    householdSeed * 17 + agentId * 5 + zoneIndex * 13 + 11,
    householdSeed * 23 + agentId * 3 + zoneIndex * 19 + 19,
  );
  const island = getIslandGeometry(w, h, terrain);
  return clampPointToIsland(rawPoint, island, 0.88);
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function shouldVisitMarketThisTurn(agent: AgentState, turn: number): boolean {
  const iqTendency = clamp01((agent.intelligence - 70) / 70);
  const inventoryTotal = agent.inventory.food + agent.inventory.goods + agent.inventory.services;
  const inventoryPressure = clamp01((2.4 - inventoryTotal) / 2.4);
  const moneyPressure = clamp01((95 - agent.money) / 95);
  const moodPressure = clamp01((55 - agent.satisfaction) / 55);

  const survivalBias = agent.goalType === 'survival' ? 0.65
    : agent.goalType === 'happiness' ? 0.32
    : agent.goalType === 'balanced' ? 0.22
    : 0;

  // Lower-frequency baseline: roughly every 6-11 turns, compressed under pressure.
  const pressureMix = inventoryPressure * 0.52 + moneyPressure * 0.31 + moodPressure * 0.17;
  const intervalRaw = 10.4 - iqTendency * 1.85 - survivalBias * 1.6 - pressureMix * 4.3;
  const interval = Math.max(6, Math.min(11, Math.round(intervalRaw)));

  const phaseSeed = seededRandom(agent.id * 41 + Math.abs(agent.familyId) * 17 + 5);
  const phase = Math.floor(phaseSeed * interval);
  const scheduled = (turn + phase) % interval === 0;

  if (scheduled) {
    // Crowd gate: even scheduled residents do not all move in the same turn.
    const gate = clamp01(
      0.3
      + pressureMix * 0.52
      + survivalBias * 0.12
      - iqTendency * 0.08,
    );
    const crowdRoll = seededRandom(agent.id * 131 + turn * 53 + Math.abs(agent.familyId) * 7 + 17);
    if (crowdRoll < gate) return true;
  }

  // Emergency trip if supplies or cash are critically low.
  const emergency = Math.max(
    clamp01((1.05 - (agent.inventory.food + agent.inventory.goods * 0.85 + agent.inventory.services * 0.65)) / 1.05),
    clamp01((26 - agent.money) / 26),
  );
  if (emergency < 0.9) return false;

  const emergencyRoll = seededRandom(agent.id * 191 + turn * 67 + Math.abs(agent.familyId) * 13 + 29);
  return emergencyRoll < 0.58;
}

export function getRoutineAnchor(agent: AgentState, turn: number, home: Point, work: Point): Point {
  // Strongly biased toward work: agents spend ~92% of idle time at their workplace.
  // Every 12 turns one slot sends them home so residential zones aren't ghost towns.
  const cycle = 12;
  const phaseSeed = seededRandom(agent.id * 83 + Math.abs(agent.familyId) * 17 + 3);
  const phase = Math.floor(phaseSeed * cycle);
  const slot = (turn + phase) % cycle;
  return slot === 0 ? home : work;
}

export function getAnimPhase(
  progress: number,
): { phase: AnimPhase; phaseProgress: number } {
  // Phase-synced to economic cycle: produce → travel to market → trade → return to work
  if (progress < 0.30) {
    return { phase: 'working', phaseProgress: progress / 0.30 };
  } else if (progress < 0.55) {
    return { phase: 'toMarket', phaseProgress: (progress - 0.30) / 0.25 };
  } else if (progress < 0.78) {
    return { phase: 'atMarket', phaseProgress: (progress - 0.55) / 0.23 };
  }
  return { phase: 'returning', phaseProgress: (progress - 0.78) / 0.22 };
}

// Ease in-out cubic
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

// Quadratic Bézier: P = (1-t)²·P0 + 2(1-t)t·P1 + t²·P2
function quadBezier(p0: Point, ctrl: Point, p2: Point, t: number): Point {
  const u = 1 - t;
  return {
    x: u * u * p0.x + 2 * u * t * ctrl.x + t * t * p2.x,
    y: u * u * p0.y + 2 * u * t * ctrl.y + t * t * p2.y,
  };
}

// Build a curved control point perpendicular to the work→market line.
// Each agent gets a consistent arc direction based on their seed.
function getArcControl(from: Point, to: Point, agentId: number): Point {
  const mx = (from.x + to.x) / 2;
  const my = (from.y + to.y) / 2;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const dist = Math.sqrt(dx * dx + dy * dy);
  // Perpendicular unit vector
  const px = -dy / Math.max(1, dist);
  const py = dx / Math.max(1, dist);
  // Arc magnitude: 20-45% of the distance, direction seeded per agent
  const arcSign = seededRandom(agentId * 53 + 11) < 0.5 ? -1 : 1;
  const arcMag = (0.20 + seededRandom(agentId * 67 + 23) * 0.25) * dist * arcSign;
  return { x: mx + px * arcMag, y: my + py * arcMag };
}

export function computeAnimatedPosition(
  work: Point,
  market: Point,
  animProgress: number,
  agentId: number,
  time: number,
): Point {
  const { phase, phaseProgress } = getAnimPhase(animProgress);
  const t = ease(phaseProgress);
  const marketAngle = seededRandom(agentId * 19 + 7) * Math.PI * 2;
  const marketRadius = 4 + seededRandom(agentId * 31 + 13) * 18;
  const marketAnchor = {
    x: market.x + Math.cos(marketAngle) * marketRadius,
    y: market.y + Math.sin(marketAngle) * marketRadius * 0.72,
  };

  // Wobble: strong when stationary, subtle when moving
  const wobbleX = Math.sin(time * 3 + agentId * 2.1) * 2;
  const wobbleY = Math.cos(time * 2.7 + agentId * 1.7) * 2;

  // Arc control point for curved travel (consistent per agent)
  const ctrl = getArcControl(work, marketAnchor, agentId);

  let x: number, y: number;

  switch (phase) {
    case 'working':
      x = work.x + wobbleX * 1.6;
      y = work.y + wobbleY * 1.6;
      break;
    case 'toMarket': {
      const p = quadBezier(work, ctrl, marketAnchor, t);
      x = p.x + wobbleX * 0.3;
      y = p.y + wobbleY * 0.3;
      break;
    }
    case 'atMarket':
      x = marketAnchor.x + wobbleX * 1.4;
      y = marketAnchor.y + wobbleY * 1.4;
      break;
    case 'returning': {
      // Reverse: market → work along same arc
      const p = quadBezier(marketAnchor, ctrl, work, t);
      x = p.x + wobbleX * 0.3;
      y = p.y + wobbleY * 0.3;
      break;
    }
  }

  return { x, y };
}

// Position for when no animation is playing (idle at anchor — usually work, occasionally home)
export function computeIdlePosition(anchor: Point, agentId: number, time: number): Point {
  const wobbleX = Math.sin(time * 0.8 + agentId * 2.1) * 1.5;
  const wobbleY = Math.cos(time * 0.6 + agentId * 1.7) * 1.5;
  return { x: anchor.x + wobbleX, y: anchor.y + wobbleY };
}

const SECTOR_COLORS: Record<SectorType, string> = {
  food: '#4caf50',
  goods: '#2196f3',
  services: '#ff9800',
};

export function getAgentColor(agent: AgentState): string {
  if (!agent.alive) return '#555';
  return SECTOR_COLORS[agent.sector];
}

export function getAgentOpacity(agent: AgentState): number {
  if (!agent.alive) return 0.2;
  // Map health to opacity: 100→1.0, 0→0.3
  return 0.3 + (agent.health / 100) * 0.7;
}

export function getAgentSize(agent: AgentState): number {
  if (!agent.alive) return 2;
  const base = 3 + agent.productivity * 1.5;
  // Older agents (>45yr) get slightly smaller
  if (agent.age > 540) {
    const ageFactor = Math.max(0.7, 1 - (agent.age - 540) / 1000);
    return base * ageFactor;
  }
  return base;
}

// Hit test: is a mouse point close enough to an agent?
export function hitTestAgent(mouseX: number, mouseY: number, agentX: number, agentY: number, size: number): boolean {
  const dx = mouseX - agentX;
  const dy = mouseY - agentY;
  return dx * dx + dy * dy <= (size + 4) * (size + 4); // +4px tolerance
}
