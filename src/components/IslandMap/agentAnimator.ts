import type { AgentState, SectorType } from '../../types';

export interface Point {
  x: number;
  y: number;
}

export interface ZoneLayout {
  farm: { cx: number; cy: number; rx: number; ry: number };
  goods: { cx: number; cy: number; rx: number; ry: number };
  services: { cx: number; cy: number; rx: number; ry: number };
  market: { cx: number; cy: number; r: number };
}

// Animation phases within a turn cycle
export type AnimPhase = 'working' | 'toMarket' | 'atMarket' | 'returning';

export function getZoneLayout(w: number, h: number): ZoneLayout {
  // Island center
  const cx = w / 2;
  const cy = h / 2;

  return {
    farm: { cx: cx, cy: cy * 0.42, rx: w * 0.22, ry: h * 0.14 },
    goods: { cx: cx * 0.58, cy: cy * 1.38, rx: w * 0.16, ry: h * 0.14 },
    services: { cx: cx * 1.42, cy: cy * 1.38, rx: w * 0.16, ry: h * 0.14 },
    market: { cx: cx, cy: cy * 0.92, r: w * 0.06 },
  };
}

// Seeded pseudo-random for stable agent positions
function seededRandom(seed: number): number {
  const x = Math.sin(seed * 9301 + 49297) * 233280;
  return x - Math.floor(x);
}

export function computeHomePosition(agentId: number, sector: SectorType, layout: ZoneLayout): Point {
  const zone = sector === 'food' ? layout.farm
    : sector === 'goods' ? layout.goods
    : layout.services;

  // Distribute agents within the zone ellipse using seeded random
  const angle = seededRandom(agentId * 7 + 1) * Math.PI * 2;
  const radius = Math.sqrt(seededRandom(agentId * 13 + 3)) * 0.85; // sqrt for uniform distribution

  return {
    x: zone.cx + Math.cos(angle) * zone.rx * radius,
    y: zone.cy + Math.sin(angle) * zone.ry * radius,
  };
}

export function getAnimPhase(progress: number): { phase: AnimPhase; phaseProgress: number } {
  // progress: 0 to 1 over the full animation cycle
  if (progress < 0.3) {
    return { phase: 'working', phaseProgress: progress / 0.3 };
  } else if (progress < 0.5) {
    return { phase: 'toMarket', phaseProgress: (progress - 0.3) / 0.2 };
  } else if (progress < 0.7) {
    return { phase: 'atMarket', phaseProgress: (progress - 0.5) / 0.2 };
  } else {
    return { phase: 'returning', phaseProgress: (progress - 0.7) / 0.3 };
  }
}

// Ease in-out cubic
function ease(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

export function computeAnimatedPosition(
  home: Point,
  market: Point,
  animProgress: number,
  agentId: number,
  time: number,
): Point {
  const { phase, phaseProgress } = getAnimPhase(animProgress);
  const t = ease(phaseProgress);

  // Small wobble based on time
  const wobbleX = Math.sin(time * 3 + agentId * 2.1) * 2;
  const wobbleY = Math.cos(time * 2.7 + agentId * 1.7) * 2;

  let x: number, y: number;

  switch (phase) {
    case 'working':
      // Stay at home with work wobble
      x = home.x + wobbleX * 1.5;
      y = home.y + wobbleY * 1.5;
      break;
    case 'toMarket':
      x = lerp(home.x, market.x + wobbleX, t);
      y = lerp(home.y, market.y + wobbleY, t);
      break;
    case 'atMarket':
      // Cluster around market with slight movement
      x = market.x + wobbleX * 2;
      y = market.y + wobbleY * 2;
      break;
    case 'returning':
      x = lerp(market.x + wobbleX, home.x, t);
      y = lerp(market.y + wobbleY, home.y, t);
      break;
  }

  return { x, y };
}

// Position for when no animation is playing (idle)
export function computeIdlePosition(home: Point, agentId: number, time: number): Point {
  const wobbleX = Math.sin(time * 0.8 + agentId * 2.1) * 1.5;
  const wobbleY = Math.cos(time * 0.6 + agentId * 1.7) * 1.5;
  return { x: home.x + wobbleX, y: home.y + wobbleY };
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
