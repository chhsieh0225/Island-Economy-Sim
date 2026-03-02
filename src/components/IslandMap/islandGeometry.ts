import type { IslandTerrainState } from '../../types';

export interface PointLike {
  x: number;
  y: number;
}

export interface IslandGeometry {
  cx: number;
  cy: number;
  rx: number;
  ry: number;
  rotation: number;
  offsets: number[];
}

export function getIslandGeometry(w: number, h: number, terrain: IslandTerrainState): IslandGeometry {
  return {
    cx: w / 2,
    cy: h / 2,
    rx: w * 0.40 * terrain.islandScaleX,
    ry: h * 0.42 * terrain.islandScaleY,
    rotation: terrain.islandRotation,
    offsets: terrain.coastlineOffsets,
  };
}

function wrapAngle(angle: number): number {
  const twoPi = Math.PI * 2;
  let normalized = angle % twoPi;
  if (normalized < 0) normalized += twoPi;
  return normalized;
}

function sampleOffset(offsets: number[], angle: number): number {
  const wrapped = wrapAngle(angle);
  const pos = (wrapped / (Math.PI * 2)) * offsets.length;
  const i0 = Math.floor(pos) % offsets.length;
  const i1 = (i0 + 1) % offsets.length;
  const t = pos - Math.floor(pos);
  return offsets[i0] * (1 - t) + offsets[i1] * t;
}

export function getIslandPolarMetrics(point: PointLike, island: IslandGeometry): {
  localAngle: number;
  radial: number;
  boundary: number;
} {
  const dx = point.x - island.cx;
  const dy = point.y - island.cy;

  // Rotate into island local frame.
  const xr = Math.cos(island.rotation) * dx + Math.sin(island.rotation) * dy;
  const yr = -Math.sin(island.rotation) * dx + Math.cos(island.rotation) * dy;

  const localAngle = Math.atan2(yr / Math.max(1, island.ry), xr / Math.max(1, island.rx));
  const radial = Math.sqrt(
    (xr / Math.max(1, island.rx)) ** 2 + (yr / Math.max(1, island.ry)) ** 2,
  );
  const boundary = sampleOffset(island.offsets, localAngle);

  return { localAngle, radial, boundary };
}

export function clampPointToIsland(
  point: PointLike,
  island: IslandGeometry,
  margin: number = 0.96,
): PointLike {
  const dx = point.x - island.cx;
  const dy = point.y - island.cy;
  const xr = Math.cos(island.rotation) * dx + Math.sin(island.rotation) * dy;
  const yr = -Math.sin(island.rotation) * dx + Math.cos(island.rotation) * dy;

  const metrics = getIslandPolarMetrics(point, island);
  const limit = metrics.boundary * margin;
  if (metrics.radial <= limit || metrics.radial <= 1e-6) {
    return point;
  }

  const scale = limit / metrics.radial;
  const cxr = xr * scale;
  const cyr = yr * scale;

  // Rotate back to world frame.
  const x = island.cx + Math.cos(island.rotation) * cxr - Math.sin(island.rotation) * cyr;
  const y = island.cy + Math.sin(island.rotation) * cxr + Math.cos(island.rotation) * cyr;
  return { x, y };
}

export function isInsideIsland(
  point: PointLike,
  island: IslandGeometry,
  margin: number = 1,
): boolean {
  const metrics = getIslandPolarMetrics(point, island);
  return metrics.radial <= metrics.boundary * margin;
}
