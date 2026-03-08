// ── Feature Highlight Rendering ──────────────────────────────────────────
// Extracted from IslandMap.tsx for maintainability.

import type { ZoneLayout } from '../agentAnimator';
import type { MapFeatureType, HighlightShape } from '../mapHitTest';
import { getFeatureHighlightStyle, getFeatureHighlightShapes } from '../mapHitTest';

function drawHighlightShape(
  ctx: CanvasRenderingContext2D,
  shape: HighlightShape,
  scale: number,
): void {
  if (shape.kind === 'circle') {
    ctx.beginPath();
    ctx.arc(shape.cx, shape.cy, shape.r * scale, 0, Math.PI * 2);
    return;
  }
  ctx.beginPath();
  ctx.ellipse(shape.cx, shape.cy, shape.rx * scale, shape.ry * scale, 0, 0, Math.PI * 2);
}

export function drawFeatureHighlight(
  ctx: CanvasRenderingContext2D,
  layout: ZoneLayout,
  feature: MapFeatureType,
  progress: number,
  time: number,
): void {
  const shapes = getFeatureHighlightShapes(layout, feature);
  if (shapes.length === 0) return;

  const style = getFeatureHighlightStyle(feature);
  const pulse = 0.84 + Math.sin(time * 9) * 0.16;
  const alpha = Math.max(0.08, 1 - progress);
  const burstScale = 1 + progress * 0.22;

  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  ctx.shadowColor = style.glow;
  ctx.shadowBlur = 8 + 5 * pulse;

  for (const shape of shapes) {
    ctx.globalAlpha = alpha * (0.32 + pulse * 0.18);
    drawHighlightShape(ctx, shape, 1);
    ctx.fillStyle = style.fill;
    ctx.fill();

    ctx.globalAlpha = alpha * (0.7 + pulse * 0.18);
    drawHighlightShape(ctx, shape, 1.02);
    ctx.strokeStyle = style.stroke;
    ctx.lineWidth = 1.8;
    ctx.stroke();

    ctx.globalAlpha = alpha * 0.48;
    drawHighlightShape(ctx, shape, burstScale);
    ctx.lineWidth = 1.1;
    ctx.stroke();
  }

  ctx.restore();
}
