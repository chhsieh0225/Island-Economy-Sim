import { useRef, useEffect, useCallback, useState } from 'react';
import type { AgentState, ActiveRandomEvent, IslandTerrainState, EconomyStage } from '../../types';
import {
  getZoneLayout,
  getResidentialBlockCount,
  computeWorkPosition,
  computeResidencePosition,
  computeAnimatedPosition,
  getAnimPhase,
  shouldVisitMarketThisTurn,
  getRoutineAnchor,
  computeIdlePosition,
  getAgentColor,
  getAgentOpacity,
  getAgentSize,
  hitTestAgent,
} from './agentAnimator';
import type { Point, ZoneLayout } from './agentAnimator';
import { clampPointToIsland, getIslandGeometry } from './islandGeometry';
import type { IslandGeometry } from './islandGeometry';
import {
  drawWater,
  drawIsland,
  drawZones,
  drawZoneLabels,
  drawMarket,
  drawAgent,
  drawWorkParticle,
  drawEventOverlays,
  drawTooltip,
  computeZoneReveal,
} from './islandRenderer';
import styles from './IslandMap.module.css';

type AutoPlaySpeed = 'slow' | 'medium' | 'fast' | null;
export type MapFeatureType = 'bank' | 'residential' | 'farm';

interface Props {
  agents: AgentState[];
  turn: number;
  terrain: IslandTerrainState;
  economyStage: EconomyStage;
  activeRandomEvents: ActiveRandomEvent[];
  autoPlaySpeed: AutoPlaySpeed;
  onAgentClick: (agent: AgentState) => void;
  onFeatureClick?: (feature: MapFeatureType) => void;
}

interface AgentRenderState {
  pos: Point;
  color: string;
  opacity: number;
  size: number;
  agent: AgentState;
}

interface CachedLayer {
  key: string;
  canvas: HTMLCanvasElement;
}

interface CachedSceneGeometry {
  key: string;
  layout: ZoneLayout;
  island: IslandGeometry;
}

interface PerfSnapshot {
  fps: number;
  frameMs: number;
  islandHitRate: number;
  zoneHitRate: number;
}

interface PerfCounters {
  frameCount: number;
  frameMsSum: number;
  lastPublishTs: number;
  lastFrameTs: number;
  islandHits: number;
  islandMisses: number;
  zoneHits: number;
  zoneMisses: number;
}

function getAnimDurationMs(autoPlaySpeed: AutoPlaySpeed): number {
  if (autoPlaySpeed === 'slow') return 1400;
  if (autoPlaySpeed === 'medium') return 800;
  if (autoPlaySpeed === 'fast') return 240;
  return 1600; // manual click
}

function getTargetFps(
  isAnimating: boolean,
  autoPlaySpeed: AutoPlaySpeed,
  isHovering: boolean,
  hasActiveEvents: boolean,
  documentHidden: boolean,
): number {
  if (documentHidden) return 2;

  if (isAnimating) {
    if (autoPlaySpeed === 'fast') return 52;
    if (autoPlaySpeed === 'medium') return 46;
    if (autoPlaySpeed === 'slow') return 40;
    return 48;
  }

  if (autoPlaySpeed === 'fast') return 34;
  if (autoPlaySpeed === 'medium') return 28;
  if (autoPlaySpeed === 'slow') return 22;
  if (isHovering) return 28;
  if (hasActiveEvents) return 20;
  return 14;
}

function shouldRenderWorkParticle(
  agentId: number,
  autoPlaySpeed: AutoPlaySpeed,
  aliveCount: number,
): boolean {
  if (autoPlaySpeed === 'fast') {
    return agentId % 3 === 0;
  }
  if (autoPlaySpeed === 'medium' || aliveCount > 150) {
    return agentId % 2 === 0;
  }
  return true;
}

function isInsideCircle(x: number, y: number, cx: number, cy: number, radius: number): boolean {
  const dx = x - cx;
  const dy = y - cy;
  return (dx * dx + dy * dy) <= (radius * radius);
}

function isInsideEllipse(
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

function detectMapFeature(
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

  return null;
}

function seededTurnRoll(agentId: number, turn: number, salt: number): number {
  const x = Math.sin((agentId + 1) * 12.9898 + (turn + 1) * 78.233 + salt * 37.719);
  const raw = x * 43758.5453;
  return raw - Math.floor(raw);
}

function shouldAnimateCommute(
  agent: AgentState,
  turn: number,
  autoPlaySpeed: AutoPlaySpeed,
): boolean {
  if (autoPlaySpeed === null || autoPlaySpeed === 'slow') return true;

  const inventoryTotal = agent.inventory.food + agent.inventory.goods + agent.inventory.services;
  const inventoryPressure = Math.max(0, Math.min(1, (2.5 - inventoryTotal) / 2.5));
  const moneyPressure = Math.max(0, Math.min(1, (70 - agent.money) / 70));
  const emergencyPressure = Math.max(inventoryPressure, moneyPressure);
  if (emergencyPressure >= 0.86) return true;

  const baseQuota = autoPlaySpeed === 'fast' ? 0.32 : 0.55;
  const quota = Math.min(0.9, baseQuota + emergencyPressure * 0.28);
  const roll = seededTurnRoll(agent.id, turn, Math.abs(agent.familyId) + 11);
  return roll < quota;
}

function createLayerCanvas(
  w: number,
  h: number,
  dpr: number,
): { canvas: HTMLCanvasElement; ctx: CanvasRenderingContext2D } | null {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.floor(w * dpr));
  canvas.height = Math.max(1, Math.floor(h * dpr));
  const ctx = canvas.getContext('2d');
  if (!ctx) return null;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  return { canvas, ctx };
}

function readPerfDebugFlag(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('perf') === '1') return true;
    return window.localStorage.getItem('islandPerfDebug') === '1';
  } catch {
    return false;
  }
}

function terrainSignature(terrain: IslandTerrainState): string {
  return [
    terrain.seed,
    terrain.islandScaleX.toFixed(4),
    terrain.islandScaleY.toFixed(4),
    terrain.islandRotation.toFixed(4),
    terrain.coastlineOffsets.map(v => v.toFixed(3)).join(','),
    terrain.zoneOffsets.food.x.toFixed(3),
    terrain.zoneOffsets.food.y.toFixed(3),
    terrain.zoneOffsets.goods.x.toFixed(3),
    terrain.zoneOffsets.goods.y.toFixed(3),
    terrain.zoneOffsets.services.x.toFixed(3),
    terrain.zoneOffsets.services.y.toFixed(3),
  ].join('|');
}

function revealBucket(value: number): number {
  return Math.round(value * 24);
}

function zoneRenderSignature(
  agents: AgentState[],
  turn: number,
  stage: EconomyStage,
): string {
  let alive = 0;
  let food = 0;
  let goods = 0;
  let services = 0;

  for (const agent of agents) {
    if (!agent.alive) continue;
    alive++;
    if (agent.sector === 'food') food++;
    else if (agent.sector === 'goods') goods++;
    else services++;
  }

  const goodsReveal = stage === 'agriculture' ? 0 : computeZoneReveal('goods', agents, turn);
  const servicesReveal = stage === 'service' ? computeZoneReveal('services', agents, turn) : 0;

  return [
    `stage:${stage}`,
    `a${alive}`,
    `f${food}`,
    `g${goods}`,
    `s${services}`,
    `gr${revealBucket(goodsReveal)}`,
    `sr${revealBucket(servicesReveal)}`,
  ].join('|');
}

export function IslandMap({
  agents,
  turn,
  terrain,
  economyStage,
  activeRandomEvents,
  autoPlaySpeed,
  onAgentClick,
  onFeatureClick,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  // Animation state
  const animStartRef = useRef<number>(0);
  const isAnimatingRef = useRef(false);
  const prevTurnRef = useRef(turn);

  // Cache rendered agent positions for hit testing
  const agentPositionsRef = useRef<AgentRenderState[]>([]);
  const hoveredAgentRef = useRef<AgentState | null>(null);
  const sceneCacheRef = useRef<CachedSceneGeometry | null>(null);
  const islandLayerRef = useRef<CachedLayer | null>(null);
  const zoneLayerRef = useRef<CachedLayer | null>(null);
  const agentsRef = useRef<AgentState[]>(agents);
  const turnRef = useRef(turn);
  const terrainRef = useRef(terrain);
  const activeEventsRef = useRef(activeRandomEvents);
  const autoPlaySpeedRef = useRef(autoPlaySpeed);
  const terrainSigRef = useRef(terrainSignature(terrain));
  const zoneSigRef = useRef(zoneRenderSignature(agents, turn, economyStage));
  const [showPerfDebug] = useState(readPerfDebugFlag);
  const perfCountersRef = useRef<PerfCounters>({
    frameCount: 0,
    frameMsSum: 0,
    lastPublishTs: 0,
    lastFrameTs: 0,
    islandHits: 0,
    islandMisses: 0,
    zoneHits: 0,
    zoneMisses: 0,
  });
  const lastDrawTsRef = useRef(0);
  const [perfSnapshot, setPerfSnapshot] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    agentsRef.current = agents;
    turnRef.current = turn;
    terrainRef.current = terrain;
    activeEventsRef.current = activeRandomEvents;
    autoPlaySpeedRef.current = autoPlaySpeed;
    terrainSigRef.current = terrainSignature(terrain);
    zoneSigRef.current = zoneRenderSignature(agents, turn, economyStage);
    lastDrawTsRef.current = 0;
  }, [agents, turn, terrain, economyStage, activeRandomEvents, autoPlaySpeed]);

  // Trigger animation on turn change
  useEffect(() => {
    if (turn !== prevTurnRef.current && turn > 0) {
      animStartRef.current = performance.now();
      isAnimatingRef.current = true;
      prevTurnRef.current = turn;
      lastDrawTsRef.current = 0;
    }
  }, [turn]);

  // Start/stop animation loop (single persistent RAF).
  useEffect(() => {
    let disposed = false;

    const renderFrame = (timestamp: number) => {
      if (disposed) return;
      const canvas = canvasRef.current;
      if (!canvas) {
        animRef.current = requestAnimationFrame(renderFrame);
        return;
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) {
        animRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      const currentAgents = agentsRef.current;
      const currentTurn = turnRef.current;
      const currentTerrain = terrainRef.current;
      const currentEvents = activeEventsRef.current;
      const currentSpeed = autoPlaySpeedRef.current;
      const currentTerrainSig = terrainSigRef.current;
      const currentZoneSig = zoneSigRef.current;
      const livingPopulation = currentAgents.reduce((sum, agent) => sum + (agent.alive ? 1 : 0), 0);
      const residentialBlocks = getResidentialBlockCount(livingPopulation);
      const perfEnabled = showPerfDebug;
      const perfCounters = perfCountersRef.current;
      const documentHidden = typeof document !== 'undefined' && document.visibilityState === 'hidden';
      const targetFps = getTargetFps(
        isAnimatingRef.current,
        currentSpeed,
        hoveredAgentRef.current !== null,
        currentEvents.length > 0,
        documentHidden,
      );
      const frameIntervalMs = 1000 / Math.max(1, targetFps);
      if (
        lastDrawTsRef.current > 0 &&
        timestamp - lastDrawTsRef.current < frameIntervalMs
      ) {
        animRef.current = requestAnimationFrame(renderFrame);
        return;
      }
      lastDrawTsRef.current = timestamp;

      if (documentHidden) {
        animRef.current = requestAnimationFrame(renderFrame);
        return;
      }

      const rect = canvas.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const w = rect.width;
      const h = rect.height;
      const pixelW = Math.max(1, Math.floor(w * dpr));
      const pixelH = Math.max(1, Math.floor(h * dpr));

      // Resize canvas if needed
      if (canvas.width !== pixelW || canvas.height !== pixelH) {
        canvas.width = pixelW;
        canvas.height = pixelH;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sceneKey = `${w}x${h}|${currentTerrainSig}|rb${residentialBlocks}`;
      let scene = sceneCacheRef.current;
      if (!scene || scene.key !== sceneKey) {
        scene = {
          key: sceneKey,
          layout: getZoneLayout(w, h, currentTerrain, livingPopulation),
          island: getIslandGeometry(w, h, currentTerrain),
        };
        sceneCacheRef.current = scene;
        islandLayerRef.current = null;
        zoneLayerRef.current = null;
      }

      ctx.clearRect(0, 0, w, h);

      const time = timestamp / 1000;
      const { layout, island } = scene;

      // Compute animation progress
      let animProgress = 0;
      if (isAnimatingRef.current) {
        const elapsed = timestamp - animStartRef.current;
        const animDuration = getAnimDurationMs(currentSpeed);
        animProgress = Math.min(1, elapsed / animDuration);
        if (animProgress >= 1) {
          isAnimatingRef.current = false;
          animProgress = 0;
        }
      }

      // Draw background layers
      drawWater(ctx, w, h, time);
      const islandLayerKey = `${sceneKey}|island|@${dpr.toFixed(2)}`;
      if (!islandLayerRef.current || islandLayerRef.current.key !== islandLayerKey) {
        if (perfEnabled) perfCounters.islandMisses++;
        islandLayerRef.current = null;
        const layer = createLayerCanvas(w, h, dpr);
        if (layer) {
          drawIsland(layer.ctx, w, h, currentTerrain);
          islandLayerRef.current = { key: islandLayerKey, canvas: layer.canvas };
        }
      } else if (perfEnabled) {
        perfCounters.islandHits++;
      }
      if (islandLayerRef.current) {
        ctx.drawImage(islandLayerRef.current.canvas, 0, 0, w, h);
      } else {
        drawIsland(ctx, w, h, currentTerrain);
      }

      const zonesKey = `${sceneKey}|zones|${currentZoneSig}|@${dpr.toFixed(2)}`;
      if (!zoneLayerRef.current || zoneLayerRef.current.key !== zonesKey) {
        if (perfEnabled) perfCounters.zoneMisses++;
        zoneLayerRef.current = null;
        const layer = createLayerCanvas(w, h, dpr);
        if (layer) {
          drawZones(layer.ctx, layout, currentTerrain, currentAgents, currentTurn, economyStage, w, h);
          zoneLayerRef.current = { key: zonesKey, canvas: layer.canvas };
        }
      } else if (perfEnabled) {
        perfCounters.zoneHits++;
      }
      if (zoneLayerRef.current) {
        ctx.drawImage(zoneLayerRef.current.canvas, 0, 0, w, h);
      } else {
        drawZones(ctx, layout, currentTerrain, currentAgents, currentTurn, economyStage, w, h);
      }

      drawEventOverlays(ctx, layout, currentEvents, w, h, time);
      drawMarket(ctx, layout);
      drawZoneLabels(ctx, layout, currentTerrain, currentAgents, currentTurn, economyStage);

      // Draw agents
      const aliveAgents = currentAgents.filter(a => a.alive);
      const rendered: AgentRenderState[] = [];
      const aliveCount = aliveAgents.length;

      for (const agent of aliveAgents) {
        const home = computeResidencePosition(agent.id, agent.familyId, agent.sector, layout, currentTerrain, w, h);
        const work = computeWorkPosition(agent.id, agent.sector, layout, currentTerrain, w, h);
        const market = { x: layout.market.cx, y: layout.market.cy };
        const visitMarket = shouldVisitMarketThisTurn(agent, currentTurn);
        const animateCommute = visitMarket && shouldAnimateCommute(agent, currentTurn, currentSpeed);

        let pos: Point;
        if (isAnimatingRef.current && animateCommute) {
          pos = computeAnimatedPosition(work, market, animProgress, agent.id, time);
          const { phase } = getAnimPhase(animProgress);

          if (phase === 'working' && shouldRenderWorkParticle(agent.id, currentSpeed, aliveCount)) {
            drawWorkParticle(ctx, pos.x, pos.y, getAgentColor(agent), animProgress);
          }
        } else {
          const anchor = getRoutineAnchor(agent, currentTurn, home, work);
          pos = computeIdlePosition(anchor, agent.id, time);
        }
        pos = clampPointToIsland(pos, island, 0.91);

        const color = getAgentColor(agent);
        const opacity = getAgentOpacity(agent);
        const size = getAgentSize(agent);
        const isLowHealth = agent.health < 40;

        drawAgent(ctx, pos.x, pos.y, color, size, opacity, isLowHealth, time);
        rendered.push({ pos, color, opacity, size, agent });
      }

      agentPositionsRef.current = rendered;

      // Draw tooltip for hovered agent
      const hoveredAgent = hoveredAgentRef.current;
      if (hoveredAgent) {
        const agentRender = rendered.find(r => r.agent.id === hoveredAgent.id);
        if (agentRender) {
          const { pos, agent } = agentRender;
          const sectorLabel = agent.sector === 'food' ? '食物' : agent.sector === 'goods' ? '商品' : '服務';
          const genderIcon = agent.gender === 'M' ? '♂' : '♀';
          const ageYears = Math.floor(agent.age / 12);
          const label = `${genderIcon}${agent.name} [${sectorLabel}] ${ageYears}歲 $${agent.money.toFixed(0)} HP:${agent.health.toFixed(0)}`;
          drawTooltip(ctx, pos.x, pos.y, label, w);
        }
      }

      if (perfEnabled) {
        if (perfCounters.lastPublishTs === 0) {
          perfCounters.lastPublishTs = timestamp;
        }
        if (perfCounters.lastFrameTs > 0) {
          const dt = timestamp - perfCounters.lastFrameTs;
          perfCounters.frameCount++;
          perfCounters.frameMsSum += dt;
        }
        perfCounters.lastFrameTs = timestamp;

        const publishIntervalMs = 600;
        const elapsed = timestamp - perfCounters.lastPublishTs;
        if (elapsed >= publishIntervalMs && perfCounters.frameCount > 0) {
          const islandTotal = perfCounters.islandHits + perfCounters.islandMisses;
          const zoneTotal = perfCounters.zoneHits + perfCounters.zoneMisses;
          const nextSnapshot: PerfSnapshot = {
            fps: (perfCounters.frameCount * 1000) / Math.max(1, elapsed),
            frameMs: perfCounters.frameMsSum / Math.max(1, perfCounters.frameCount),
            islandHitRate: islandTotal > 0 ? perfCounters.islandHits / islandTotal : 1,
            zoneHitRate: zoneTotal > 0 ? perfCounters.zoneHits / zoneTotal : 1,
          };
          setPerfSnapshot(nextSnapshot);
          perfCounters.frameCount = 0;
          perfCounters.frameMsSum = 0;
          perfCounters.lastPublishTs = timestamp;
          perfCounters.islandHits = 0;
          perfCounters.islandMisses = 0;
          perfCounters.zoneHits = 0;
          perfCounters.zoneMisses = 0;
        }
      }

      animRef.current = requestAnimationFrame(renderFrame);
    };

    animRef.current = requestAnimationFrame(renderFrame);
    return () => {
      disposed = true;
      cancelAnimationFrame(animRef.current);
    };
  }, [showPerfDebug, economyStage]);

  // Mouse move handler for hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    // Hit test against rendered agents
    let found: AgentState | null = null;
    for (const r of agentPositionsRef.current) {
      if (hitTestAgent(x, y, r.pos.x, r.pos.y, r.size)) {
        found = r.agent;
        break;
      }
    }
    if ((hoveredAgentRef.current?.id ?? -1) !== (found?.id ?? -1)) {
      lastDrawTsRef.current = 0;
    }
    hoveredAgentRef.current = found;

    const feature = found
      ? null
      : detectMapFeature(
        x,
        y,
        getZoneLayout(
          rect.width,
          rect.height,
          terrainRef.current,
          agentsRef.current.reduce((sum, agent) => sum + (agent.alive ? 1 : 0), 0),
        ),
      );

    if (canvas) {
      canvas.style.cursor = (found || feature) ? 'pointer' : 'default';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoveredAgentRef.current = null;
    lastDrawTsRef.current = 0;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.style.cursor = 'default';
    }
  }, []);

  // Click handler
  const handleClick = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    for (const r of agentPositionsRef.current) {
      if (hitTestAgent(x, y, r.pos.x, r.pos.y, r.size)) {
        onAgentClick(r.agent);
        return;
      }
    }

    const feature = detectMapFeature(
      x,
      y,
      getZoneLayout(
        rect.width,
        rect.height,
        terrainRef.current,
        agentsRef.current.reduce((sum, agent) => sum + (agent.alive ? 1 : 0), 0),
      ),
    );
    if (feature) {
      onFeatureClick?.(feature);
    }
  }, [onAgentClick, onFeatureClick]);

  return (
    <div className={styles.container} ref={containerRef}>
      <div className={styles.title}>島嶼地圖 Island Map</div>
      <canvas
        ref={canvasRef}
        className={styles.canvas}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        onClick={handleClick}
      />
      {showPerfDebug && perfSnapshot && (
        <div className={styles.perfDebug}>
          <div>FPS {perfSnapshot.fps.toFixed(1)}</div>
          <div>Frame {perfSnapshot.frameMs.toFixed(2)} ms</div>
          <div>Island Cache {(perfSnapshot.islandHitRate * 100).toFixed(0)}%</div>
          <div>Zone Cache {(perfSnapshot.zoneHitRate * 100).toFixed(0)}%</div>
        </div>
      )}
    </div>
  );
}
