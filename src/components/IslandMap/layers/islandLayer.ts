import type { IslandTerrainState } from '../../../types';
import { getIslandGeometry } from '../islandGeometry';
import type { TextureKind } from '../renderConfig';
import {
  TILE_CACHE_MAX, clamp01, createRng, hashText,
  drawWrappedCircle, drawWrappedRect, drawWrappedLine,
} from '../renderConfig';

const TILE_CACHE = new Map<string, HTMLCanvasElement>();

export function clearTileCache(): void {
  TILE_CACHE.clear();
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
    const x = rng() * size; const y = rng() * size; const r = 1.2 + rng() * 4.3;
    const color = palette[Math.floor(rng() * palette.length)];
    drawWrappedCircle(ctx, size, x, y, r, color, 0.12 + rng() * 0.18);
  }

  for (let i = 0; i < 24; i++) {
    const x = rng() * size; const y = rng() * size;
    const len = size * (0.2 + rng() * 0.6); const angle = rng() * Math.PI * 2;
    drawWrappedLine(ctx, size, x, y, x + Math.cos(angle) * len, y + Math.sin(angle) * len, '#203a24', 1.2 + rng() * 0.9, 0.06 + rng() * 0.07);
  }
}

function paintFarmTexture(ctx: CanvasRenderingContext2D, size: number, rng: () => number): void {
  ctx.fillStyle = '#7f9656';
  ctx.fillRect(0, 0, size, size);

  const parcelColors = ['#73934e', '#8da85f', '#9db86f', '#6f8a47', '#a18f5a'];
  for (let i = 0; i < 36; i++) {
    const rw = 10 + rng() * 28; const rh = 10 + rng() * 24;
    const x = rng() * size; const y = rng() * size;
    const color = parcelColors[Math.floor(rng() * parcelColors.length)];
    drawWrappedRect(ctx, size, x, y, rw, rh, color, 0.22 + rng() * 0.2);
  }

  for (let i = 0; i < 80; i++) {
    const x = rng() * size; const y = rng() * size;
    const len = size * (0.1 + rng() * 0.18); const tilt = (rng() - 0.5) * 0.22;
    drawWrappedLine(ctx, size, x - len, y - len * tilt, x + len, y + len * tilt, '#5e7b3f', 0.8, 0.13);
  }
}

function paintIndustryTexture(ctx: CanvasRenderingContext2D, size: number, rng: () => number): void {
  ctx.fillStyle = '#6a7680';
  ctx.fillRect(0, 0, size, size);

  for (let i = 0; i < 20; i++) {
    const x = rng() * size; const y = rng() * size;
    const rw = 8 + rng() * 24; const rh = 6 + rng() * 16;
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
    drawWrappedCircle(ctx, size, rng() * size, rng() * size, 0.8 + rng() * 1.4, '#4c565f', 0.12 + rng() * 0.12);
  }
}

function paintUrbanTexture(ctx: CanvasRenderingContext2D, size: number, rng: () => number): void {
  ctx.fillStyle = '#7a847e';
  ctx.fillRect(0, 0, size, size);

  const blockColors = ['#d5bf8f', '#b59672', '#948875', '#bea77e', '#8a9a8b'];
  for (let i = 0; i < 28; i++) {
    const x = rng() * size; const y = rng() * size;
    const rw = 7 + rng() * 16; const rh = 7 + rng() * 14;
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
    drawWrappedCircle(ctx, size, rng() * size, rng() * size, 1.2 + rng() * 2, '#6da06b', 0.1 + rng() * 0.15);
  }
}

export function getTextureTile(seed: number, kind: TextureKind): HTMLCanvasElement {
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

  if (TILE_CACHE.size >= TILE_CACHE_MAX) {
    const firstKey = TILE_CACHE.keys().next().value;
    if (firstKey !== undefined) TILE_CACHE.delete(firstKey);
  }
  TILE_CACHE.set(key, tile);
  return tile;
}

export function fillTexture(
  ctx: CanvasRenderingContext2D, texture: HTMLCanvasElement, w: number, h: number, alpha: number,
): void {
  const pattern = ctx.createPattern(texture, 'repeat');
  if (!pattern) return;
  ctx.save();
  ctx.globalAlpha = clamp01(alpha);
  ctx.fillStyle = pattern;
  ctx.fillRect(0, 0, w, h);
  ctx.restore();
}

export function drawIslandPath(
  ctx: CanvasRenderingContext2D, cx: number, cy: number, rx: number, ry: number,
  offsets: number[], rotation: number,
): void {
  const points = offsets.length;
  ctx.moveTo(cx + Math.cos(rotation) * rx * offsets[0], cy + Math.sin(rotation) * ry * offsets[0]);
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

export function drawIsland(ctx: CanvasRenderingContext2D, w: number, h: number, terrain: IslandTerrainState): void {
  const island = getIslandGeometry(w, h, terrain);
  const { cx, cy, rx, ry } = island;

  ctx.save();
  ctx.beginPath();
  drawIslandPath(ctx, cx, cy, rx + 7, ry + 7, island.offsets, island.rotation);
  ctx.fillStyle = '#c8ae81';
  ctx.fill();

  ctx.beginPath();
  drawIslandPath(ctx, cx, cy, rx + 3.5, ry + 3.5, island.offsets, island.rotation);
  ctx.fillStyle = 'rgba(181, 152, 105, 0.65)';
  ctx.fill();

  ctx.beginPath();
  drawIslandPath(ctx, cx, cy, rx, ry, island.offsets, island.rotation);
  ctx.clip();

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
