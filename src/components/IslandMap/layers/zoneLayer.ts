import type { AgentState, IslandTerrainState, SectorType, EconomyStage } from '../../../types';
import type { ZoneLayout } from '../agentAnimator';
import { getIslandGeometry } from '../islandGeometry';
import type { ZoneEllipse, Rgb } from '../renderConfig';
import { clamp01, smoothstep, rgba, shade, hashText, SECTOR_TEXTURE, SECTOR_TINT } from '../renderConfig';
import { getTextureTile, fillTexture, drawIslandPath } from './islandLayer';
import { t } from '../../../i18n/i18n';

export function computeZoneReveal(sector: SectorType, agents: AgentState[], turn: number): number {
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
  return { cx: zone.cx, cy: zone.cy, rx: zone.rx * scale, ry: zone.ry * scale };
}

function getZonePatches(sector: SectorType, zone: ZoneEllipse, reveal: number): ZoneEllipse[] {
  const scaled = scaleZone(zone, reveal);
  const patches: ZoneEllipse[] = [scaled];

  if (sector === 'food') {
    patches.push({
      cx: scaled.cx - scaled.rx * 0.45, cy: scaled.cy + scaled.ry * 0.22,
      rx: scaled.rx * 0.28, ry: scaled.ry * 0.26,
    });
    return patches;
  }

  if (reveal < 0.45) return patches;
  const satelliteReveal = smoothstep(0.45, 1, reveal);
  const satScale = 0.22 + 0.24 * satelliteReveal;
  patches.push(
    { cx: scaled.cx + scaled.rx * 0.58, cy: scaled.cy + scaled.ry * 0.1, rx: scaled.rx * satScale, ry: scaled.ry * satScale },
    { cx: scaled.cx - scaled.rx * 0.48, cy: scaled.cy - scaled.ry * 0.16, rx: scaled.rx * (satScale * 0.9), ry: scaled.ry * (satScale * 0.9) },
  );
  return patches;
}

function zoneTextureAlpha(suitability: number, reveal: number): number {
  const suitabilityDelta = clamp01((suitability - 0.85) * 0.7);
  return clamp01(0.24 + suitabilityDelta * 0.24 + reveal * 0.34);
}

function getZonesCenter(zones: ZoneEllipse[]): { x: number; y: number } {
  if (zones.length === 0) return { x: 0, y: 0 };
  let sx = 0; let sy = 0;
  for (const zone of zones) { sx += zone.cx; sy += zone.cy; }
  return { x: sx / zones.length, y: sy / zones.length };
}

function drawTexturedZonePatch(
  ctx: CanvasRenderingContext2D, zone: ZoneEllipse, texture: HTMLCanvasElement,
  tint: Rgb, w: number, h: number, alpha: number,
): void {
  ctx.save();
  ctx.beginPath();
  ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
  ctx.clip();

  fillTexture(ctx, texture, w, h, 0.42 + alpha * 0.58);

  const tintGrad = ctx.createRadialGradient(
    zone.cx - zone.rx * 0.2, zone.cy - zone.ry * 0.25, zone.rx * 0.12,
    zone.cx, zone.cy, Math.max(zone.rx, zone.ry),
  );
  tintGrad.addColorStop(0, rgba(shade(tint, 22), 0.06 + alpha * 0.14));
  tintGrad.addColorStop(0.65, rgba(tint, 0.18 + alpha * 0.25));
  tintGrad.addColorStop(1, rgba(shade(tint, -28), 0.28 + alpha * 0.3));
  ctx.fillStyle = tintGrad;
  ctx.fillRect(zone.cx - zone.rx * 1.3, zone.cy - zone.ry * 1.3, zone.rx * 2.6, zone.ry * 2.6);

  const edgeShade = ctx.createRadialGradient(
    zone.cx, zone.cy, Math.max(zone.rx, zone.ry) * 0.45,
    zone.cx, zone.cy, Math.max(zone.rx, zone.ry) * 1.05,
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
  ctx: CanvasRenderingContext2D, layout: ZoneLayout, terrain: IslandTerrainState, w: number, h: number,
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
    ctx.quadraticCurveTo(zone.cx + marketDx * 0.28, zone.cy + marketDy * 0.15, layout.market.cx, layout.market.cy);
    ctx.stroke();
  }
  ctx.setLineDash([]);
  ctx.restore();
}

export function drawZones(
  ctx: CanvasRenderingContext2D, layout: ZoneLayout, terrain: IslandTerrainState,
  agents: AgentState[], turn: number, stage: EconomyStage, w: number, h: number,
): void {
  const island = getIslandGeometry(w, h, terrain);
  ctx.save();
  ctx.beginPath();
  drawIslandPath(ctx, island.cx, island.cy, island.rx, island.ry, island.offsets, island.rotation);
  ctx.clip();

  drawResidentialZones(ctx, layout, terrain, w, h);

  const reveals: Record<SectorType, number> = {
    food: computeZoneReveal('food', agents, turn),
    goods: computeZoneReveal('goods', agents, turn),
    services: computeZoneReveal('services', agents, turn),
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

export function drawZoneLabels(
  ctx: CanvasRenderingContext2D, layout: ZoneLayout, terrain: IslandTerrainState,
  agents: AgentState[], turn: number, stage: EconomyStage,
): void {
  const drawClickableNode = (
    x: number, y: number, icon: string, fill: string, stroke: string, iconColor: string, alpha: number,
  ) => {
    const nodeRadius = 8.6;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.shadowColor = 'rgba(10, 20, 36, 0.58)';
    ctx.shadowBlur = 3;
    ctx.beginPath();
    ctx.arc(x, y, nodeRadius, 0, Math.PI * 2);
    ctx.fillStyle = fill;
    ctx.fill();
    ctx.strokeStyle = stroke;
    ctx.lineWidth = 1.1;
    ctx.stroke();

    ctx.font = '11px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillStyle = iconColor;
    ctx.fillText(icon, x, y - 0.2);

    ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.textBaseline = 'alphabetic';
    ctx.fillStyle = 'rgba(226, 236, 252, 0.92)';
    ctx.fillText(t('island.click'), x, y + nodeRadius + 9);
    ctx.restore();
  };

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

  ctx.fillStyle = 'rgba(76, 175, 80, 0.7)';
  ctx.fillText('🌾 農地 Food', layout.farm.cx, layout.farm.cy - layout.farm.ry - 12);
  ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.fillText(`${terrain.sectorFeatures.food} ${featurePct('food')}`, layout.farm.cx, layout.farm.cy - layout.farm.ry + 2);
  drawClickableNode(
    layout.farm.cx + layout.farm.rx * 0.44, layout.farm.cy + layout.farm.ry * 0.08,
    '🌾', 'rgba(90, 176, 97, 0.74)', 'rgba(198, 242, 205, 0.86)', 'rgba(233, 251, 236, 0.95)', 0.95,
  );

  const goodsReveal = computeZoneReveal('goods', agents, turn);
  if (stageAllowsSector(stage, 'goods') && goodsReveal > 0.18) {
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = `rgba(33, 150, 243, ${0.45 + goodsReveal * 0.35})`;
    ctx.fillText('🏭 工坊 Goods', layout.goods.cx, layout.goods.cy + layout.goods.ry + 12);
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${terrain.sectorFeatures.goods} ${featurePct('goods')}`, layout.goods.cx, layout.goods.cy + layout.goods.ry + 24);
    drawClickableNode(
      layout.goods.cx - layout.goods.rx * 0.28, layout.goods.cy - layout.goods.ry * 0.06,
      '🏭', 'rgba(57, 142, 224, 0.72)', 'rgba(192, 226, 255, 0.9)', 'rgba(238, 248, 255, 0.96)',
      Math.min(1, 0.78 + goodsReveal * 0.32),
    );
  }

  const servicesReveal = computeZoneReveal('services', agents, turn);
  if (stageAllowsSector(stage, 'services') && servicesReveal > 0.2) {
    ctx.font = '12px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = `rgba(255, 152, 0, ${0.42 + servicesReveal * 0.36})`;
    ctx.fillText('🏢 服務 Services', layout.services.cx, layout.services.cy + layout.services.ry + 12);
    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillText(`${terrain.sectorFeatures.services} ${featurePct('services')}`, layout.services.cx, layout.services.cy + layout.services.ry + 24);
    drawClickableNode(
      layout.services.cx + layout.services.rx * 0.25, layout.services.cy - layout.services.ry * 0.08,
      '🏢', 'rgba(227, 141, 59, 0.72)', 'rgba(255, 226, 189, 0.92)', 'rgba(255, 247, 235, 0.98)',
      Math.min(1, 0.75 + servicesReveal * 0.34),
    );
  }

  ctx.restore();
}

export function drawMarket(ctx: CanvasRenderingContext2D, layout: ZoneLayout): void {
  const { cx, cy, r } = layout.market;
  const marketX = cx - r * 0.34;
  const bankX = cx + r * 0.34;
  const nodeRadius = Math.max(8, r * 0.32);

  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, r, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 215, 0, 0.15)';
  ctx.fill();
  ctx.strokeStyle = 'rgba(255, 215, 0, 0.4)';
  ctx.lineWidth = 1.5;
  ctx.stroke();

  const drawNode = (x: number, icon: string, label: string, fillStyle: string, strokeStyle: string, iconColor: string) => {
    ctx.beginPath();
    ctx.arc(x, cy, nodeRadius, 0, Math.PI * 2);
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.strokeStyle = strokeStyle;
    ctx.lineWidth = 1.2;
    ctx.stroke();

    ctx.font = `${Math.max(12, Math.round(nodeRadius * 1.12))}px -apple-system, BlinkMacSystemFont, sans-serif`;
    ctx.fillStyle = iconColor;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(icon, x, cy - 0.5);

    ctx.font = '10px -apple-system, BlinkMacSystemFont, sans-serif';
    ctx.fillStyle = 'rgba(224, 235, 255, 0.88)';
    ctx.fillText(label, x, cy + nodeRadius + 8);
  };

  drawNode(marketX, '🏪', t('island.market'), 'rgba(255, 215, 0, 0.2)', 'rgba(255, 215, 0, 0.48)', 'rgba(255, 215, 0, 0.92)');
  drawNode(bankX, '🏦', t('island.bank'), 'rgba(120, 180, 255, 0.2)', 'rgba(120, 180, 255, 0.5)', 'rgba(188, 225, 255, 0.95)');

  ctx.beginPath();
  ctx.moveTo(marketX + nodeRadius * 0.72, cy);
  ctx.lineTo(bankX - nodeRadius * 0.72, cy);
  ctx.strokeStyle = 'rgba(204, 224, 255, 0.34)';
  ctx.lineWidth = 1;
  ctx.stroke();

  ctx.font = '9px -apple-system, BlinkMacSystemFont, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = 'rgba(226, 238, 255, 0.72)';
  ctx.fillText('金融中心 Financial Hub', cx, cy + r * 0.9);

  ctx.restore();
}
