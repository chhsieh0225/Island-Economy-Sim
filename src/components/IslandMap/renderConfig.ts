import type { SectorType } from '../../types';

// --- Types ---
export type TextureKind = 'base' | 'farm' | 'industry' | 'urban';
export type ZoneEllipse = { cx: number; cy: number; rx: number; ry: number };
export type Rgb = { r: number; g: number; b: number };

// --- Constants ---
export const TILE_CACHE_MAX = 32;
export const WRAP_SHIFTS = [-1, 0, 1] as const;

export const SECTOR_TEXTURE: Record<SectorType, TextureKind> = {
  food: 'farm',
  goods: 'industry',
  services: 'urban',
};

export const SECTOR_TINT: Record<SectorType, Rgb> = {
  food: { r: 89, g: 156, b: 84 },
  goods: { r: 68, g: 132, b: 192 },
  services: { r: 204, g: 141, b: 68 },
};

// --- Utility functions ---
export function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

export function rgba(color: Rgb, alpha: number): string {
  return `rgba(${color.r}, ${color.g}, ${color.b}, ${clamp01(alpha).toFixed(3)})`;
}

export function shade(color: Rgb, delta: number): Rgb {
  return {
    r: Math.max(0, Math.min(255, Math.round(color.r + delta))),
    g: Math.max(0, Math.min(255, Math.round(color.g + delta))),
    b: Math.max(0, Math.min(255, Math.round(color.b + delta))),
  };
}

export function createRng(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let x = t;
    x = Math.imul(x ^ (x >>> 15), x | 1);
    x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
    return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
  };
}

export function hashText(value: string): number {
  let h = 2166136261;
  for (let i = 0; i < value.length; i++) {
    h ^= value.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

export function forWrappedTiles(size: number, draw: (offsetX: number, offsetY: number) => void): void {
  for (const sx of WRAP_SHIFTS) {
    for (const sy of WRAP_SHIFTS) {
      draw(sx * size, sy * size);
    }
  }
}

export function drawWrappedCircle(
  ctx: CanvasRenderingContext2D, size: number,
  x: number, y: number, r: number, fillStyle: string, alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillStyle;
  forWrappedTiles(size, (ox, oy) => { ctx.beginPath(); ctx.arc(x + ox, y + oy, r, 0, Math.PI * 2); ctx.fill(); });
  ctx.restore();
}

export function drawWrappedRect(
  ctx: CanvasRenderingContext2D, size: number,
  x: number, y: number, w: number, h: number, fillStyle: string, alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.fillStyle = fillStyle;
  forWrappedTiles(size, (ox, oy) => { ctx.fillRect(x + ox, y + oy, w, h); });
  ctx.restore();
}

export function drawWrappedLine(
  ctx: CanvasRenderingContext2D, size: number,
  x1: number, y1: number, x2: number, y2: number,
  strokeStyle: string, width: number, alpha: number,
): void {
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.strokeStyle = strokeStyle;
  ctx.lineWidth = width;
  ctx.lineCap = 'round';
  forWrappedTiles(size, (ox, oy) => {
    ctx.beginPath(); ctx.moveTo(x1 + ox, y1 + oy); ctx.lineTo(x2 + ox, y2 + oy); ctx.stroke();
  });
  ctx.restore();
}
