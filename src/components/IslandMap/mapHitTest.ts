// ── Map Hit-Testing & Feature Highlight Shapes ───────────────────────────
// Extracted from IslandMap.tsx for maintainability.
// All functions are pure and stateless.

import type { ZoneLayout } from './agentAnimator';

export type MapFeatureType = 'bank' | 'residential' | 'farm' | 'goods' | 'services';

export type HighlightShape =
  | { kind: 'circle'; cx: number; cy: number; r: number }
  | { kind: 'ellipse'; cx: number; cy: number; rx: number; ry: number };

export interface FeatureHighlightStyle {
  fill: string;
  stroke: string;
  glow: string;
}

// ── Geometric primitives ─────────────────────────────────────────────────

export function isInsideCircle(x: number, y: number, cx: number, cy: number, radius: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return (dx * dx + dy * dy) <= (radius * radius);
}

export function isInsideEllipse(
  x: number,
  y: number,
  cx: number,
  cy: number,
  rx: number,
  ry: number,
): boolean {
  const nx = (x - cx) / Math.max(1e-6, rx);
  const ny = (y - cy) / Math.max(1e-6, ry);
  return (nx * nx + ny * ny) <= 1;
}

// ── Feature detection from mouse coordinates ─────────────────────────────

export function detectMapFeature(
  x: number,
  y: number,
  layout: ZoneLayout,
): MapFeatureType | null {
  const bankX = layout.market.cx + layout.market.r * 0.34;
  const bankRadius = Math.max(10, layout.market.r * 0.32) + 4;
  if (isInsideCircle(x, y, bankX, layout.market.cy, bankRadius)) {
    return 'bank';
  }

  for (const zone of layout.residential) {
    if (isInsideEllipse(x, y, zone.cx, zone.cy, zone.rx * 1.06, zone.ry * 1.08)) {
      return 'residential';
    }
  }

  if (isInsideEllipse(x, y, layout.farm.cx, layout.farm.cy, layout.farm.rx * 1.04, layout.farm.ry * 1.06)) {
    return 'farm';
  }
  if (isInsideEllipse(x, y, layout.goods.cx, layout.goods.cy, layout.goods.rx * 1.04, layout.goods.ry * 1.06)) {
    return 'goods';
  }
  if (isInsideEllipse(
    x,
    y,
    layout.services.cx,
    layout.services.cy,
    layout.services.rx * 1.04,
    layout.services.ry * 1.06,
  )) {
    return 'services';
  }

  return null;
}

// ── Highlight styles per feature ─────────────────────────────────────────

export function getFeatureHighlightStyle(feature: MapFeatureType): FeatureHighlightStyle {
  switch (feature) {
    case 'bank':
      return { fill: 'rgba(120, 180, 255, 0.26)', stroke: 'rgba(198, 228, 255, 0.95)', glow: 'rgba(130, 193, 255, 0.7)' };
    case 'residential':
      return { fill: 'rgba(222, 199, 144, 0.24)', stroke: 'rgba(255, 230, 186, 0.92)', glow: 'rgba(230, 207, 164, 0.68)' };
    case 'farm':
      return { fill: 'rgba(101, 185, 109, 0.24)', stroke: 'rgba(199, 242, 206, 0.92)', glow: 'rgba(121, 204, 131, 0.68)' };
    case 'goods':
      return { fill: 'rgba(59, 145, 223, 0.24)', stroke: 'rgba(201, 229, 255, 0.94)', glow: 'rgba(99, 166, 232, 0.7)' };
    case 'services':
      return { fill: 'rgba(228, 145, 62, 0.24)', stroke: 'rgba(255, 232, 199, 0.96)', glow: 'rgba(239, 171, 98, 0.72)' };
  }
}

// ── Highlight shape geometry per feature ─────────────────────────────────

export function getFeatureHighlightShapes(layout: ZoneLayout, feature: MapFeatureType): HighlightShape[] {
  switch (feature) {
    case 'bank':
      return [{
        kind: 'circle',
        cx: layout.market.cx + layout.market.r * 0.34,
        cy: layout.market.cy,
        r: Math.max(11, layout.market.r * 0.38),
      }];
    case 'residential':
      return layout.residential.map(zone => ({
        kind: 'ellipse' as const,
        cx: zone.cx,
        cy: zone.cy,
        rx: zone.rx * 1.08,
        ry: zone.ry * 1.08,
      }));
    case 'farm':
      return [{
        kind: 'ellipse',
        cx: layout.farm.cx,
        cy: layout.farm.cy,
        rx: layout.farm.rx * 1.08,
        ry: layout.farm.ry * 1.08,
      }];
    case 'goods':
      return [{
        kind: 'ellipse',
        cx: layout.goods.cx,
        cy: layout.goods.cy,
        rx: layout.goods.rx * 1.08,
        ry: layout.goods.ry * 1.08,
      }];
    case 'services':
      return [{
        kind: 'ellipse',
        cx: layout.services.cx,
        cy: layout.services.cy,
        rx: layout.services.rx * 1.08,
        ry: layout.services.ry * 1.08,
      }];
  }
}
