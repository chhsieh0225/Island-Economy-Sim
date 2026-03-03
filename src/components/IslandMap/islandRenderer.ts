import type { ActiveRandomEvent, AgentState, IslandTerrainState, SectorType, EconomyStage } from '../../types';
import type { ZoneLayout } from './agentAnimator';
import { getIslandGeometry } from './islandGeometry';

type TextureKind = 'base' | 'farm' | 'industry' | 'urban';
type ZoneEllipse = { cx: number; cy: number; rx: number; ry: number };
type Rgb = { r: number; g: number; b: number };

const TILE_CACHE_MAX = 32;
const TILE_CACHE = new Map<string, HTMLCanvasElement>();

export function clearTileCache(): void {
  TILE_CACHE.clear();
}
const WRAP_SHIFTS = [-1, 0, 1] as const;
const SECTOR_TEXTURE: Record<SectorType, TextureKind> = {
  food: 'farm',
  goods: 'industry',
  services: 'urban',
};
const SECTOR_TINT: Record<SectorType, Rgb> = {
  food: { r: 89, g: 156, b: 84 },
  goods: { r: 68, g: 132, b: 192 },
  services: { r: 204, g: 141, b: 68 },
};

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp01(alpha).toFixed(3)})`;
}

function shade(color: Rgb, delta: number): Rgb {
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r + delta))),
    g: Math.max(0, Math.min(255, Math.round(color.g + delta))),
    b: Math.max(0, Math.min(255, Math.round(color.b + delta))),
  };
}

function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

function hashText(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function forWrappedTiles(size: number, draw: (offsetX: number, offsetY: number) => void): void {
  for (const sx of WRAP_SHIFTS) {
    for (const sy of WRAP_SHIFTS) {
      draw(sx * size, sy * size);
    }
  }
}

function drawWrappedCircle(
  ctx: CanvasRenderingContext2D,
  size: number,
  x: number,
  y: number,
  r: number,
  fillStyle: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillStyle;
  forWrappedTiles(size, (offsetX, offsetY) => {
    ctx.beginPath();
    ctx.arc(x + offsetX, y + offsetY, r, 0, Math.PI * 2);
    ctx.fill();
  });
  ctx.restore();
}

function drawWrappedRect(
  ctx: CanvasRenderingContext2D,
  size: number,
  x: number,
  y: number,
  w: number,
  h: number,
  fillStyle: string,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillStyle;
  forWrappedTiles(size, (offsetX, offsetY) => {
    ctx.fillRect(x + offsetX, y + offsetY, w, h);
  });
  ctx.restore();
}

function drawWrappedLine(
  ctx: CanvasRenderingContext2D,
  size: number,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  strokeStyle: string,
  width: number,
  alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  forWrappedTiles(size, (offsetX, offsetY) => {
    ctx.beginPath();
    ctx.moveTo(x1 + offsetX, y1 + offsetY);
    ctx.lineTo(x2 + offsetX, y2 + offsetY);
    ctx.stroke();
  });
  ctx.restore();
}

function paintBaseTexture(ctx: CanvasRenderingContext2D, size: number, rng: () => number): void {
  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, '#335c3a');
  grad.addColorStop(0.5, '#2c5133');
  grad.addColorStop(1, '#24462b');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const palette = ['#426f41', '#4c7e47', '#365f39', '#5f8350', '#6f935e'];
  for (let i = 0; i < 150; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const r = 1.2 + rng() * 4.3;
    const color = palette[Math.floor(rng() * palette.length)];
    drawWrappedCircle(ctx, size, x, y, r, color, 0.12 + rng() * 0.18);
  }

  for (let i = 0; i < 24; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = size * (0.2 + rng() * 0.6);
    const angle = rng() * Math.PI * 2;
    drawWrappedLine(
      ctx,
      size,
      x,
      y,
      x + Math.cos(angle) * len,
      y + Math.sin(angle) * len,
      '#203a24',
      1.2 + rng() * 0.9,
      0.06 + rng() * 0.07,
    );
  }
}

function paintFarmTexture(ctx: CanvasRenderingContext2D, size: number, rng: () => number): void {
  ctx.fillStyle = '#7f9656';
  ctx.fillRect(0, 0, size, size);

  const parcelColors = ['#73934e', '#8da85f', '#9db86f', '#6f8a47', '#a18f5a'];
  for (let i = 0; i < 36; i++) {
    const rw = 10 + rng() * 28;
    const rh = 10 + rng() * 24;
    const x = rng() * size;
    const y = rng() * size;
    const color = parcelColors[Math.floor(rng() * parcelColors.length)];
    drawWrappedRect(ctx, size, x, y, rw, rh, color, 0.22 + rng() * 0.2);
  }

  for (let i = 0; i < 80; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const len = size * (0.1 + rng() * 0.18);
    const tilt = (rng() - 0.5) * 0.22;
    drawWrappedLine(
      ctx,
      size,
      x - len,
      y - len * tilt,
      x + len,
      y + len * tilt,
      '#5e7b3f',
      0.8,
      0.13,
    );
  }
}

function paintIndustryTexture(ctx: CanvasRenderingContext2D, size: number, rng: () => number): void {
  ctx.fillStyle = '#6a7680';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 20; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rw = 8 + rng() * 24;
    const rh = 6 + rng() * 16;
    drawWrappedRect(ctx, size, x, y, rw, rh, '#81909a', 0.25 + rng() * 0.2);
    drawWrappedRect(ctx, size, x + 1, y + 1, rw - 2, rh - 2, '#53606a', 0.2 + rng() * 0.16);
  }

  for (let i = 0; i < 10; i++) {
    const y = rng() * size;
    drawWrappedLine(ctx, size, 0, y, size, y, '#9da8b1', 1.1, 0.22);
    const x = rng() * size;
    drawWrappedLine(ctx, size, x, 0, x, size, '#556069', 1.2, 0.2);
  }

  for (let i = 0; i < 120; i++) {
    drawWrappedCircle(
      ctx,
      size,
      rng() * size,
      rng() * size,
      0.8 + rng() * 1.4,
      '#4c565f',
      0.12 + rng() * 0.12,
    );
  }
}

function paintUrbanTexture(ctx: CanvasRenderingContext2D, size: number, rng: () => number): void {
  ctx.fillStyle = '#7a847e';
  ctx.fillRect(0, 0, size, size);

  const blockColors = ['#d5bf8f', '#b59672', '#948875', '#bea77e', '#8a9a8b'];
  for (let i = 0; i < 28; i++) {
    const x = rng() * size;
    const y = rng() * size;
    const rw = 7 + rng() * 16;
    const rh = 7 + rng() * 14;
    const color = blockColors[Math.floor(rng() * blockColors.length)];
    drawWrappedRect(ctx, size, x, y, rw, rh, color, 0.26 + rng() * 0.24);
  }

  for (let i = 0; i < 12; i++) {
    const y = rng() * size;
    drawWrappedLine(ctx, size, 0, y, size, y, '#687269', 1.4, 0.22);
    const x = rng() * size;
    drawWrappedLine(ctx, size, x, 0, x, size, '#6f7871', 1.1, 0.2);
  }

  for (let i = 0; i < 55; i++) {
    drawWrappedCircle(
      ctx,
      size,
      rng() * size,
      rng() * size,
      1.2 + rng() * 2,
      '#6da06b',
      0.1 + rng() * 0.15,
    );
  }
}

function getTextureTile(seed: number, kind: TextureKind): HTMLCanvasElement {
  const key = `${seed}:${kind}`;
  const cached = TILE_CACHE.get(key);
  if (cached) return cached;

  const tileSize = kind === 'base' ? 128 : 96;
  const tile = document.createElement('canvas');
  tile.width = tileSize;
  tile.height = tileSize;
  const tileCtx = tile.getContext('2d');
  if (tileCtx) {
    const rng = createRng((seed ^ hashText(kind)) >>> 0);
    if (kind === 'base') paintBaseTexture(tileCtx, tileSize, rng);
    if (kind === 'farm') paintFarmTexture(tileCtx, tileSize, rng);
    if (kind === 'industry') paintIndustryTexture(tileCtx, tileSize, rng);
    if (kind === 'urban') paintUrbanTexture(tileCtx, tileSize, rng);
  }

  // LRU eviction: remove oldest entries when cache exceeds limit
  if (TILE_CACHE.size >= TILE_CACHE_MAX) {
    const firstKey = TILE_CACHE.keys().next().value;
    if (firstKey !== undefined) TILE_CACHE.delete(firstKey);
  }
  TILE_CACHE.set(key, tile);
  return tile;
}

function fillTexture(
  ctx: CanvasRenderingContext2D,
  texture: HTMLCanvasElement,
  w: number,
  h: number,
  alpha: number,
): void {
  const pattern = ctx.createPattern(texture, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

// Draw animated water background
export function drawWater(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a3d6b');
  grad.addColorStop(0.55, '#08345b');
  grad.addColorStop(1, '#052845');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(111, 187, 255, 0.11)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const baseY = (h / 9) * i + 20;
    for (let x = 0; x <= w; x += 4) {
      const y = baseY + Math.sin(x * 0.014 + time * 0.55 + i * 1.17) * 6;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}

// Draw island shape — organic blob generated from terrain profile
export function drawIsland(ctx: CanvasRenderingContext2D, w: number, h: number, terrain: IslandTerrainState): void {
  const island = getIslandGeometry(w, h, terrain);
  const { cx, cy, rx, ry } = island;

  ctx.save();

  // Beach edge (slightly larger)
  ctx.beginPath();
  drawIslandPath(ctx, cx, cy, rx + 7, ry + 7, island.offsets, island.rotation);
  ctx.fillStyle = '#c8ae81';
  ctx.fill();

  // Wet sand transition
  ctx.beginPath();
  drawIslandPath(ctx, cx, cy, rx + 3.5, ry + 3.5, island.offsets, island.rotation);
  ctx.fillStyle = 'rgba(181, 152, 105, 0.65)';
  ctx.fill();

  ctx.beginPath();
  drawIslandPath(ctx, cx, cy, rx, ry, island.offsets, island.rotation);
  ctx.clip();

  // Satellite collage base: layered seamless tiles.
  fillTexture(ctx, getTextureTile(terrain.seed, 'base'), w, h, 1);
  fillTexture(ctx, getTextureTile(terrain.seed + 11, 'farm'), w, h, 0.14);
  fillTexture(ctx, getTextureTile(terrain.seed + 29, 'urban'), w, h, 0.08);

  const relief = ctx.createRadialGradient(cx, cy * 0.86, 0, cx, cy, Math.max(rx, ry) * 1.16);
  relief.addColorStop(0, 'rgba(224, 240, 197, 0.15)');
  relief.addColorStop(0.55, 'rgba(44, 85, 46, 0)');
  relief.addColorStop(1, 'rgba(8, 25, 13, 0.26)');
  ctx.fillStyle = relief;
  ctx.fillRect(0, 0, w, h);

  const seedWave = terrain.seed % 97;
  for (let i = 0; i < 5; i++) {
    const ridgeY = cy - ry * 0.45 + i * (ry * 0.23);
    const alpha = 0.025 + ((seedWave + i * 13) % 11) / 500;
    const ridge = ctx.createLinearGradient(cx - rx, ridgeY, cx + rx, ridgeY + 8);
    ridge.addColorStop(0, `rgba(20, 48, 26, ${alpha.toFixed(3)})`);
    ridge.addColorStop(0.5, 'rgba(20, 48, 26, 0)');
    ridge.addColorStop(1, `rgba(20, 48, 26, ${alpha.toFixed(3)})`);
    ctx.fillStyle = ridge;
    ctx.fillRect(cx - rx, ridgeY - 2, rx * 2, 18);
  }

  ctx.restore();

  ctx.beginPath();
  drawIslandPath(ctx, cx, cy, rx, ry, island.offsets, island.rotation);
  ctx.strokeStyle = 'rgba(240, 229, 194, 0.22)';
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.restore();
}

function drawIslandPath(
  ctx: CanvasRenderingContext2D,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  offsets: number[],
  rotation: number,
): void {
  const points = offsets.length;

  ctx.moveTo(
    cx + Math.cos(rotation) * rx * offsets[0],
    cy + Math.sin(rotation) * ry * offsets[0],
  );
  for (let i = 0; i < points; i++) {
    const a1 = (i / points) * Math.PI * 2 + rotation;
    const a2 = ((i + 1) / points) * Math.PI * 2 + rotation;
    const aMid = (a1 + a2) / 2;

    const r1 = offsets[i % offsets.length];
    const r2 = offsets[(i + 1) % offsets.length];
    const rMid = (r1 + r2) / 2 + (offsets[(i + 6) % offsets.length] - 1) * 0.5;

    const cp1x = cx + Math.cos(aMid) * rx * rMid * 1.05;
    const cp1y = cy + Math.sin(aMid) * ry * rMid * 1.05;
    const endx = cx + Math.cos(a2) * rx * r2;
    const endy = cy + Math.sin(a2) * ry * r2;

    ctx.quadraticCurveTo(cp1x, cp1y, endx, endy);
  }
  ctx.closePath();
}

function getZoneReveal(sector: SectorType, agents: AgentState[], turn: number): number {
  const alive = agents.filter(a => a.alive);
  const pop = Math.max(1, alive.length);
  const workers = alive.filter(a => a.sector === sector).length;
  const workerRatio = workers / pop;

  if (sector === 'food') return 1;

  if (sector === 'goods') {
    const turnProgress = smoothstep(3, 26, turn);
    const workerProgress = smoothstep(0.08, 0.28, workerRatio);
    return clamp01(turnProgress * (0.35 + workerProgress * 0.65));
  }

  const turnProgress = smoothstep(10, 45, turn);
  const workerProgress = smoothstep(0.06, 0.24, workerRatio);
  return clamp01(turnProgress * (0.28 + workerProgress * 0.72));
}

function stageAllowsSector(stage: EconomyStage, sector: SectorType): boolean {
  if (sector === 'food') return true;
  if (sector === 'goods') return stage === 'industrial' || stage === 'service';
  return stage === 'service';
}

function scaleZone(zone: ZoneEllipse, reveal: number): ZoneEllipse {
  const scale = 0.28 + reveal * 0.72;
  return {
    cx: zone.cx,
    cy: zone.cy,
    rx: zone.rx * scale,
    ry: zone.ry * scale,
  };
}

function getZonePatches(sector: SectorType, zone: ZoneEllipse, reveal: number): ZoneEllipse[] {
  const scaled = scaleZone(zone, reveal);
  const patches: ZoneEllipse[] = [scaled];

  if (sector === 'food') {
    patches.push({
      cx: scaled.cx - scaled.rx * 0.45,
      cy: scaled.cy + scaled.ry * 0.22,
      rx: scaled.rx * 0.28,
      ry: scaled.ry * 0.26,
    });
    return patches;
  }

  if (reveal < 0.45) return patches;

  const satelliteReveal = smoothstep(0.45, 1, reveal);
  const satScale = 0.22 + 0.24 * satelliteReveal;
  patches.push(
    {
      cx: scaled.cx + scaled.rx * 0.58,
      cy: scaled.cy + scaled.ry * 0.1,
      rx: scaled.rx * satScale,
      ry: scaled.ry * satScale,
    },
    {
      cx: scaled.cx - scaled.rx * 0.48,
      cy: scaled.cy - scaled.ry * 0.16,
      rx: scaled.rx * (satScale * 0.9),
      ry: scaled.ry * (satScale * 0.9),
    },
  );
  return patches;
}

function zoneTextureAlpha(suitability: number, reveal: number): number {
  const suitabilityDelta = clamp01((suitability - 0.85) * 0.7);
  return clamp01(0.24 + suitabilityDelta * 0.24 + reveal * 0.34);
}

function getZonesCenter(zones: ZoneEllipse[]): { x: number; y: number } {
  if (zones.length === 0) {
    return { x: 0, y: 0 };
  }
  let sx = 0;
  let sy = 0;
  for (const zone of zones) {
    sx += zone.cx;
    sy += zone.cy;
  }
  return { x: sx / zones.length, y: sy / zones.length };
}

function drawTexturedZonePatch(
  ctx: CanvasRenderingContext2D,
  zone: ZoneEllipse,
  texture: HTMLCanvasElement,
  tint: Rgb,
  w: number,
  h: number,
  alpha: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
  ctx.clip();

  fillTexture(ctx, texture, w, h, 0.42 + alpha * 0.58);

  const tintGrad = ctx.createRadialGradient(
    zone.cx - zone.rx * 0.2,
    zone.cy - zone.ry * 0.25,
    zone.rx * 0.12,
    zone.cx,
    zone.cy,
    Math.max(zone.rx, zone.ry),
  );
  tintGrad.addColorStop(0, rgba(shade(tint, 22), 0.06 + alpha * 0.14));
  tintGrad.addColorStop(0.65, rgba(tint, 0.18 + alpha * 0.25));
  tintGrad.addColorStop(1, rgba(shade(tint, -28), 0.28 + alpha * 0.3));
  ctx.fillStyle = tintGrad;
  ctx.fillRect(zone.cx - zone.rx * 1.3, zone.cy - zone.ry * 1.3, zone.rx * 2.6, zone.ry * 2.6);

  // Soft vignette makes patch edges blend with nearby tiles.
  const edgeShade = ctx.createRadialGradient(
    zone.cx,
    zone.cy,
    Math.max(zone.rx, zone.ry) * 0.45,
    zone.cx,
    zone.cy,
    Math.max(zone.rx, zone.ry) * 1.05,
  );
  edgeShade.addColorStop(0.72, 'rgba(0, 0, 0, 0)');
  edgeShade.addColorStop(1, `rgba(0, 0, 0, ${(0.22 + alpha * 0.2).toFixed(3)})`);
  ctx.fillStyle = edgeShade;
  ctx.fillRect(zone.cx - zone.rx * 1.35, zone.cy - zone.ry * 1.35, zone.rx * 2.7, zone.ry * 2.7);
  ctx.restore();

  ctx.save();
  ctx.beginPath();
  ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
  ctx.lineWidth = 1.2;
  ctx.setLineDash([5, 4]);
  ctx.strokeStyle = rgba(shade(tint, -18), 0.2 + alpha * 0.45);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

function drawResidentialZones(
  ctx: CanvasRenderingContext2D,
  layout: ZoneLayout,
  terrain: IslandTerrainState,
  w: number,
  h: number,
): void {
  const residentialTexture = getTextureTile(terrain.seed + hashText('zone:residential'), 'urban');
  const residentialTint: Rgb = { r: 182, g: 177, b: 140 };

  for (let i = 0; i < layout.residential.length; i++) {
    const zone = layout.residential[i];
    const alpha = 0.23 + i * 0.02;
    drawTexturedZonePatch(ctx, zone, residentialTexture, residentialTint, w, h, alpha);
  }

  const center = getZonesCenter(layout.residential);
  const marketDx = layout.market.cx - center.x;
  const marketDy = layout.market.cy - center.y;
  ctx.save();
  ctx.strokeStyle = 'rgba(220, 205, 165, 0.12)';
  ctx.lineWidth = 2.2;
  ctx.setLineDash([6, 6]);
  for (const zone of layout.residential) {
    ctx.beginPath();
    ctx.moveTo(zone.cx, zone.cy);
    ctx.quadraticCurveTo(
      zone.cx + marketDx * 0.28,
      zone.cy + marketDy * 0.15,
      layout.market.cx,
      layout.market.cy,
    );
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

// Draw zone overlays
export function drawZones(
  ctx: CanvasRenderingContext2D,
  layout: ZoneLayout,
  terrain: IslandTerrainState,
  agents: AgentState[],
  turn: number,
  stage: EconomyStage,
  w: number,
  h: number,
): void {
  const island = getIslandGeometry(w, h, terrain);

  ctx.save();
  ctx.beginPath();
  drawIslandPath(ctx, island.cx, island.cy, island.rx, island.ry, island.offsets, island.rotation);
  ctx.clip();

  drawResidentialZones(ctx, layout, terrain, w, h);

  const reveals: Record<SectorType, number> = {
    food: getZoneReveal('food', agents, turn),
    goods: getZoneReveal('goods', agents, turn),
    services: getZoneReveal('services', agents, turn),
  };
  const zones: Record<SectorType, ZoneEllipse> = {
    food: layout.farm,
    goods: layout.goods,
    services: layout.services,
  };

  const sectors: SectorType[] = ['food', 'goods', 'services'];
  for (const sector of sectors) {
    if (!stageAllowsSector(stage, sector)) continue;
    const reveal = reveals[sector];
    if (reveal <= 0.03) continue;

    const texture = getTextureTile(terrain.seed + hashText(`zone:${sector}`), SECTOR_TEXTURE[sector]);
    const tint = SECTOR_TINT[sector];
    const baseAlpha = zoneTextureAlpha(terrain.sectorSuitability[sector], reveal);
    const patches = getZonePatches(sector, zones[sector], reveal);

    for (let i = 0; i < patches.length; i++) {
      const patchAlpha = i === 0 ? baseAlpha : baseAlpha * (0.68 + reveal * 0.2);
      drawTexturedZonePatch(ctx, patches[i], texture, tint, w, h, patchAlpha);
    }
  }

  ctx.restore();
}

// Draw zone labels
export function drawZoneLabels(
  ctx: CanvasRenderingContext2D,
  layout: ZoneLayout,
  terrain: IslandTerrainState,
  agents: AgentState[],
  turn: number,
  stage: EconomyStage,
): void {
  ctx.save();
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.shadowColor = 'rgba(8, 20, 36, 0.75)';
  ctx.shadowBlur = 4;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 1;

  const featurePct = (sector: SectorType) => {
    const pct = (terrain.sectorSuitability[sector] - 1) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
  };

  const residentialCenter = getZonesCenter(layout.residential);
  if (layout.residential.length > 0) {
    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(224, 214, 175, 0.86)';
    ctx.fillText('🏘️ 住宅區 Residential', residentialCenter.x, residentialCenter.y - 8);
  }

  // Farm
  ctx.fillStyle = 'rgba(76, 175, 80, 0.7)';
  ctx.fillText('🌾 農地 Food', layout.farm.cx, layout.farm.cy - layout.farm.ry - 12);
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(
    `${terrain.sectorFeatures.food} ${featurePct('food')}`,
    layout.farm.cx,
    layout.farm.cy - layout.farm.ry + 2,
  );

  // Goods
  const goodsReveal = getZoneReveal('goods', agents, turn);
  if (stageAllowsSector(stage, 'goods') && goodsReveal > 0.18) {
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = `rgba(33, 150, 243, ${0.45 + goodsReveal * 0.35})`;
    ctx.fillText('🏭 工坊 Goods', layout.goods.cx, layout.goods.cy + layout.goods.ry + 12);
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(
      `${terrain.sectorFeatures.goods} ${featurePct('goods')}`,
      layout.goods.cx,
      layout.goods.cy + layout.goods.ry + 24,
    );
  }

  // Services
  const servicesReveal = getZoneReveal('services', agents, turn);
  if (stageAllowsSector(stage, 'services') && servicesReveal > 0.2) {
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = `rgba(255, 152, 0, ${0.42 + servicesReveal * 0.36})`;
    ctx.fillText('🏢 服務 Services', layout.services.cx, layout.services.cy + layout.services.ry + 12);
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(
      `${terrain.sectorFeatures.services} ${featurePct('services')}`,
      layout.services.cx,
      layout.services.cy + layout.services.ry + 24,
    );
  }

  ctx.restore();
}

// Draw market at center
export function drawMarket(ctx: CanvasRenderingContext2D, layout: ZoneLayout): void {
  const { cx, cy, r } = layout.market;

  // Market building
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  ctx.font = '13px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillStyle = 'rgba(255, 215, 0, 0.8)';
  ctx.fillText('🏪', cx, cy);

  ctx.restore();
}

// Draw single agent
export function drawAgent(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  size: number,
  opacity: number,
  isLowHealth: boolean,
  time: number,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;

  // Low health pulse effect
  let drawSize = Math.max(2.6, size);
  if (isLowHealth) {
    const pulse = Math.sin(time * 4) * 0.3 + 0.7;
    drawSize = size * pulse;

    // Red glow for low health
    ctx.beginPath();
    ctx.arc(x, y, drawSize + 4.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(244, 67, 54, ${0.3 * pulse})`;
    ctx.fill();
  }

  // Dark backdrop + bright ring keep agents visible over textured terrain.
  ctx.beginPath();
  ctx.arc(x, y, drawSize + 3.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 18, 33, 0.5)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, drawSize + 1.7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(245, 249, 255, 0.86)';
  ctx.fill();

  // Main dot
  ctx.beginPath();
  ctx.arc(x, y, drawSize, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(9, 20, 35, 0.6)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  // Bright center highlight
  ctx.beginPath();
  ctx.arc(x - drawSize * 0.24, y - drawSize * 0.24, drawSize * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fill();

  ctx.restore();
}

// Draw production particles around working agents
export function drawWorkParticle(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  color: string,
  progress: number,
): void {
  if (progress > 0.3) return; // Only during working phase

  const t = progress / 0.3;
  const particleAlpha = (1 - t) * 0.6;
  const particleY = y - t * 12;

  ctx.save();
  ctx.globalAlpha = particleAlpha;
  ctx.font = '700 9px sans-serif';
  ctx.strokeStyle = 'rgba(8, 18, 33, 0.8)';
  ctx.lineWidth = 1.4;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.strokeText('+', x + 6, particleY);
  ctx.fillText('+', x + 6, particleY);
  ctx.restore();
}

// Draw event overlays
export function drawEventOverlays(
  ctx: CanvasRenderingContext2D,
  layout: ZoneLayout,
  activeEvents: ActiveRandomEvent[],
  w: number,
  h: number,
  time: number,
): void {
  for (const event of activeEvents) {
    const id = event.def.id;

    if (id === 'drought' || id === 'good_harvest') {
      // Drought: brown overlay on farm; Harvest: golden glow
      const zone = layout.farm;
      ctx.save();
      ctx.beginPath();
      ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
      if (id === 'drought') {
        ctx.fillStyle = 'rgba(139, 90, 43, 0.2)';
      } else {
        ctx.fillStyle = `rgba(255, 215, 0, ${0.1 + Math.sin(time * 2) * 0.05})`;
      }
      ctx.fill();
      ctx.restore();
    }

    if (id === 'storm') {
      // Diagonal rain lines across entire island
      ctx.save();
      ctx.strokeStyle = 'rgba(150, 200, 255, 0.15)';
      ctx.lineWidth = 1;
      for (let i = 0; i < 40; i++) {
        const sx = seededFloat(i, time) * w;
        const sy = seededFloat(i + 100, time) * h;
        ctx.beginPath();
        ctx.moveTo(sx, sy);
        ctx.lineTo(sx + 8, sy + 12);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (id === 'epidemic') {
      // Sickly green haze
      ctx.save();
      const pulse = Math.sin(time * 1.5) * 0.03 + 0.07;
      ctx.fillStyle = `rgba(100, 200, 100, ${pulse})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (id === 'innovation') {
      // Sparkles on goods zone
      const zone = layout.goods;
      ctx.save();
      ctx.fillStyle = `rgba(33, 150, 243, ${0.15 + Math.sin(time * 3) * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (id === 'festival') {
      // Golden particles around services
      const zone = layout.services;
      ctx.save();
      ctx.fillStyle = `rgba(255, 152, 0, ${0.15 + Math.sin(time * 2.5) * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (id === 'inflation_spike') {
      // Warm haze to indicate island-wide price pressure.
      ctx.save();
      const pulse = 0.05 + Math.sin(time * 2.2) * 0.015;
      ctx.fillStyle = `rgba(255, 120, 64, ${pulse})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}

function seededFloat(seed: number, offset: number): number {
  const x = Math.sin(seed * 127.1 + offset * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

// Draw tooltip near an agent
export function drawTooltip(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  text: string,
  w: number,
): void {
  ctx.save();
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
  const metrics = ctx.measureText(text);
  const pad = 6;
  const tw = metrics.width + pad * 2;
  const th = 20;

  // Position above agent, clamp to canvas
  let tx = x - tw / 2;
  let ty = y - 22;
  if (tx < 4) tx = 4;
  if (tx + tw > w - 4) tx = w - 4 - tw;
  if (ty < 4) ty = y + 14;

  // Background
  ctx.fillStyle = 'rgba(10, 25, 47, 0.9)';
  ctx.strokeStyle = 'rgba(100, 255, 218, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 4);
  ctx.fill();
  ctx.stroke();

  // Text
  ctx.fillStyle = '#e6f1ff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tx + pad, ty + th / 2);

  ctx.restore();
}
