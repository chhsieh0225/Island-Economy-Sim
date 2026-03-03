import { useRef, useEffect, useCallback, useState } from 'react';
import type { AgentState, ActiveRandomEvent, IslandTerrainState } from '../../types';
import {
  getZoneLayout,
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
} from './islandRenderer';
import styles from './IslandMap.module.css';

type AutoPlaySpeed = 'slow' | 'medium' | 'fast' | null;

interface Props {
  agents: AgentState[];
  turn: number;
  terrain: IslandTerrainState;
  activeRandomEvents: ActiveRandomEvent[];
  autoPlaySpeed: AutoPlaySpeed;
  onAgentClick: (agent: AgentState) => void;
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

function zoneDistributionSignature(agents: AgentState[], turn: number): string {
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

  return `t${turn}|a${alive}|f${food}|g${goods}|s${services}`;
}

export function IslandMap({ agents, turn, terrain, activeRandomEvents, autoPlaySpeed, onAgentClick }: Props) {
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
  const zoneSigRef = useRef(zoneDistributionSignature(agents, turn));
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
  const [perfSnapshot, setPerfSnapshot] = useState<PerfSnapshot | null>(null);

  useEffect(() => {
    agentsRef.current = agents;
    turnRef.current = turn;
    terrainRef.current = terrain;
    activeEventsRef.current = activeRandomEvents;
    autoPlaySpeedRef.current = autoPlaySpeed;
    terrainSigRef.current = terrainSignature(terrain);
    zoneSigRef.current = zoneDistributionSignature(agents, turn);
  }, [agents, turn, terrain, activeRandomEvents, autoPlaySpeed]);

  // Trigger animation on turn change
  useEffect(() => {
    if (turn !== prevTurnRef.current && turn > 0) {
      animStartRef.current = performance.now();
      isAnimatingRef.current = true;
      prevTurnRef.current = turn;
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
      const perfEnabled = showPerfDebug;
      const perfCounters = perfCountersRef.current;

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

      const sceneKey = `${w}x${h}|${currentTerrainSig}`;
      let scene = sceneCacheRef.current;
      if (!scene || scene.key !== sceneKey) {
        scene = {
          key: sceneKey,
          layout: getZoneLayout(w, h, currentTerrain),
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
          drawZones(layer.ctx, layout, currentTerrain, currentAgents, currentTurn, w, h);
          zoneLayerRef.current = { key: zonesKey, canvas: layer.canvas };
        }
      } else if (perfEnabled) {
        perfCounters.zoneHits++;
      }
      if (zoneLayerRef.current) {
        ctx.drawImage(zoneLayerRef.current.canvas, 0, 0, w, h);
      } else {
        drawZones(ctx, layout, currentTerrain, currentAgents, currentTurn, w, h);
      }

      drawEventOverlays(ctx, layout, currentEvents, w, h, time);
      drawMarket(ctx, layout);
      drawZoneLabels(ctx, layout, currentTerrain, currentAgents, currentTurn);

      // Draw agents
      const aliveAgents = currentAgents.filter(a => a.alive);
      const rendered: AgentRenderState[] = [];

      for (const agent of aliveAgents) {
        const home = computeResidencePosition(agent.id, agent.familyId, agent.sector, layout, currentTerrain, w, h);
        const work = computeWorkPosition(agent.id, agent.sector, layout, currentTerrain, w, h);
        const market = { x: layout.market.cx, y: layout.market.cy };
        const visitMarket = shouldVisitMarketThisTurn(agent, currentTurn);

        let pos: Point;
        if (isAnimatingRef.current && visitMarket) {
          pos = computeAnimatedPosition(work, market, animProgress, agent.id, time);
          const { phase } = getAnimPhase(animProgress);

          if (phase === 'working') {
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
  }, [showPerfDebug]);

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
    hoveredAgentRef.current = found;

    if (canvas) {
      canvas.style.cursor = found ? 'pointer' : 'default';
    }
  }, []);

  const handleMouseLeave = useCallback(() => {
    hoveredAgentRef.current = null;
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
  }, [onAgentClick]);

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
