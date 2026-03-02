import type { ActiveRandomEvent, AgentState, IslandTerrainState, SectorType } from '../../types';
import type { ZoneLayout } from './agentAnimator';
import { getIslandGeometry } from './islandGeometry';

// Draw animated water background
export function drawWater(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  // Base ocean gradient
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a3d6b');
  grad.addColorStop(1, '#062a4a');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  // Subtle wave lines
  ctx.strokeStyle = 'rgba(100, 180, 255, 0.08)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 8; i++) {
    ctx.beginPath();
    const baseY = (h / 8) * i + 20;
    for (let x = 0; x <= w; x += 4) {
      const y = baseY + Math.sin(x * 0.015 + time * 0.5 + i * 1.2) * 6;
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
  drawIslandPath(ctx, cx, cy, rx + 6, ry + 6, island.offsets, island.rotation);
  ctx.fillStyle = '#c2a878';
  ctx.fill();

  // Main island ground
  ctx.beginPath();
  drawIslandPath(ctx, cx, cy, rx, ry, island.offsets, island.rotation);
  const landGrad = ctx.createRadialGradient(cx, cy * 0.85, 0, cx, cy, Math.max(rx, ry));
  landGrad.addColorStop(0, '#3a5f3a');
  landGrad.addColorStop(0.6, '#2d4a2d');
  landGrad.addColorStop(1, '#1e3a1e');
  ctx.fillStyle = landGrad;
  ctx.fill();

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

function zoneAlpha(suitability: number): number {
  return 0.1 + Math.max(-0.06, Math.min(0.1, (suitability - 1) * 0.5));
}

function clamp01(v: number): number {
  return Math.max(0, Math.min(1, v));
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = clamp01((x - edge0) / Math.max(1e-6, edge1 - edge0));
  return t * t * (3 - 2 * t);
}

function getZoneReveal(sector: SectorType, agents: AgentState[], turn: number): number {
  const alive = agents.filter(a => a.alive);
  const pop = Math.max(1, alive.length);
  const workers = alive.filter(a => a.sector === sector).length;
  const workerRatio = workers / pop;

  if (sector === 'food') {
    return 1;
  }

  if (sector === 'goods') {
    const turnProgress = smoothstep(3, 26, turn);
    const workerProgress = smoothstep(0.08, 0.28, workerRatio);
    return clamp01(turnProgress * (0.35 + workerProgress * 0.65));
  }

  const turnProgress = smoothstep(10, 45, turn);
  const workerProgress = smoothstep(0.06, 0.24, workerRatio);
  return clamp01(turnProgress * (0.28 + workerProgress * 0.72));
}

function scaleZone(
  zone: { cx: number; cy: number; rx: number; ry: number },
  reveal: number,
): { cx: number; cy: number; rx: number; ry: number } {
  const scale = 0.28 + reveal * 0.72;
  return {
    cx: zone.cx,
    cy: zone.cy,
    rx: zone.rx * scale,
    ry: zone.ry * scale,
  };
}

function drawZoneSatellites(
  ctx: CanvasRenderingContext2D,
  zone: { cx: number; cy: number; rx: number; ry: number },
  color: string,
  reveal: number,
): void {
  if (reveal < 0.45) return;
  const satelliteReveal = smoothstep(0.45, 1, reveal);
  const alpha = 0.12 * satelliteReveal;
  const satColor = color.replace(/0\.\d+\)/, `${alpha.toFixed(3)})`);
  const offsets = [
    { x: zone.rx * 0.58, y: zone.ry * 0.1 },
    { x: -zone.rx * 0.48, y: -zone.ry * 0.16 },
  ];
  for (const offset of offsets) {
    drawZoneEllipse(
      ctx,
      {
        cx: zone.cx + offset.x,
        cy: zone.cy + offset.y,
        rx: zone.rx * (0.22 + 0.24 * satelliteReveal),
        ry: zone.ry * (0.2 + 0.2 * satelliteReveal),
      },
      satColor,
    );
  }
}

// Draw zone overlays
export function drawZones(
  ctx: CanvasRenderingContext2D,
  layout: ZoneLayout,
  terrain: IslandTerrainState,
  agents: AgentState[],
  turn: number,
  w: number,
  h: number,
): void {
  const island = getIslandGeometry(w, h, terrain);
  ctx.save();
  ctx.beginPath();
  drawIslandPath(ctx, island.cx, island.cy, island.rx, island.ry, island.offsets, island.rotation);
  ctx.clip();

  const foodReveal = getZoneReveal('food', agents, turn);
  const goodsReveal = getZoneReveal('goods', agents, turn);
  const servicesReveal = getZoneReveal('services', agents, turn);

  const foodAlpha = zoneAlpha(terrain.sectorSuitability.food).toFixed(3);
  const goodsAlpha = (zoneAlpha(terrain.sectorSuitability.goods) * goodsReveal).toFixed(3);
  const serviceAlpha = (zoneAlpha(terrain.sectorSuitability.services) * servicesReveal).toFixed(3);

  // Farm zone — green tint
  drawZoneEllipse(ctx, scaleZone(layout.farm, foodReveal), `rgba(76, 175, 80, ${foodAlpha})`);
  // Goods zone — blue tint
  if (goodsReveal > 0.03) {
    const goodsZone = scaleZone(layout.goods, goodsReveal);
    drawZoneEllipse(ctx, goodsZone, `rgba(33, 150, 243, ${goodsAlpha})`);
    drawZoneSatellites(ctx, goodsZone, `rgba(33, 150, 243, ${goodsAlpha})`, goodsReveal);
  }
  // Services zone — orange tint
  if (servicesReveal > 0.03) {
    const servicesZone = scaleZone(layout.services, servicesReveal);
    drawZoneEllipse(ctx, servicesZone, `rgba(255, 152, 0, ${serviceAlpha})`);
    drawZoneSatellites(ctx, servicesZone, `rgba(255, 152, 0, ${serviceAlpha})`, servicesReveal);
  }

  ctx.restore();
}

function drawZoneEllipse(
  ctx: CanvasRenderingContext2D,
  zone: { cx: number; cy: number; rx: number; ry: number },
  color: string,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Dashed border
  ctx.setLineDash([4, 4]);
  ctx.strokeStyle = color.replace(/0\.\d+\)/, '0.35)');
  ctx.lineWidth = 1;
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.restore();
}

// Draw zone labels
export function drawZoneLabels(
  ctx: CanvasRenderingContext2D,
  layout: ZoneLayout,
  terrain: IslandTerrainState,
  agents: AgentState[],
  turn: number,
): void {
  ctx.save();
  ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';

  const featurePct = (sector: SectorType) => {
    const pct = (terrain.sectorSuitability[sector] - 1) * 100;
    return `${pct >= 0 ? '+' : ''}${pct.toFixed(0)}%`;
  };

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
  if (goodsReveal > 0.18) {
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
  if (servicesReveal > 0.2) {
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
  let drawSize = size;
  if (isLowHealth) {
    const pulse = Math.sin(time * 4) * 0.3 + 0.7;
    drawSize = size * pulse;

    // Red glow for low health
    ctx.beginPath();
    ctx.arc(x, y, drawSize + 3, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(244, 67, 54, ${0.3 * pulse})`;
    ctx.fill();
  }

  // Main dot
  ctx.beginPath();
  ctx.arc(x, y, drawSize, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();

  // Bright center highlight
  ctx.beginPath();
  ctx.arc(x - drawSize * 0.2, y - drawSize * 0.2, drawSize * 0.4, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.3)';
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
  ctx.font = '8px sans-serif';
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
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
