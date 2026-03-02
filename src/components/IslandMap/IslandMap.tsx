import { useRef, useEffect, useCallback, useState } from 'react';
import type { AgentState, ActiveRandomEvent, IslandTerrainState } from '../../types';
import {
  getZoneLayout,
  computeHomePosition,
  computeAnimatedPosition,
  computeIdlePosition,
  getAgentColor,
  getAgentOpacity,
  getAgentSize,
  hitTestAgent,
} from './agentAnimator';
import type { Point } from './agentAnimator';
import { clampPointToIsland, getIslandGeometry } from './islandGeometry';
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

const ANIM_DURATION = 1500; // ms per turn animation cycle

interface Props {
  agents: AgentState[];
  turn: number;
  terrain: IslandTerrainState;
  activeRandomEvents: ActiveRandomEvent[];
  onAgentClick: (agent: AgentState) => void;
}

interface AgentRenderState {
  pos: Point;
  color: string;
  opacity: number;
  size: number;
  agent: AgentState;
}

export function IslandMap({ agents, turn, terrain, activeRandomEvents, onAgentClick }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number>(0);

  // Animation state
  const animStartRef = useRef<number>(0);
  const isAnimatingRef = useRef(false);
  const prevTurnRef = useRef(turn);

  // Interaction state
  const [hoveredAgent, setHoveredAgent] = useState<AgentState | null>(null);
  const mouseRef = useRef<Point>({ x: -1, y: -1 });

  // Cache rendered agent positions for hit testing
  const agentPositionsRef = useRef<AgentRenderState[]>([]);

  // Trigger animation on turn change
  useEffect(() => {
    if (turn !== prevTurnRef.current && turn > 0) {
      animStartRef.current = performance.now();
      isAnimatingRef.current = true;
      prevTurnRef.current = turn;
    }
  }, [turn]);

  // Main render loop
  const render = useCallback((timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = rect.width;
    const h = rect.height;

    // Resize canvas if needed
    if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
      canvas.width = w * dpr;
      canvas.height = h * dpr;
      ctx.scale(dpr, dpr);
    }

    ctx.clearRect(0, 0, w, h);

    const time = timestamp / 1000;
    const layout = getZoneLayout(w, h, terrain);
    const island = getIslandGeometry(w, h, terrain);

    // Compute animation progress
    let animProgress = 0;
    if (isAnimatingRef.current) {
      const elapsed = timestamp - animStartRef.current;
      animProgress = Math.min(1, elapsed / ANIM_DURATION);
      if (animProgress >= 1) {
        isAnimatingRef.current = false;
        animProgress = 0;
      }
    }

    // Draw background layers
    drawWater(ctx, w, h, time);
    drawIsland(ctx, w, h, terrain);
    drawZones(ctx, layout, terrain, agents, turn, w, h);
    drawEventOverlays(ctx, layout, activeRandomEvents, w, h, time);
    drawMarket(ctx, layout);
    drawZoneLabels(ctx, layout, terrain, agents, turn);

    // Draw agents
    const aliveAgents = agents.filter(a => a.alive);
    const rendered: AgentRenderState[] = [];

    for (const agent of aliveAgents) {
      const home = computeHomePosition(agent.id, agent.sector, layout, terrain, w, h);
      const market = { x: layout.market.cx, y: layout.market.cy };

      let pos: Point;
      if (isAnimatingRef.current) {
        pos = computeAnimatedPosition(home, market, animProgress, agent.id, time);

        // Draw work particle during working phase
        drawWorkParticle(ctx, pos.x, pos.y, getAgentColor(agent), animProgress);
      } else {
        pos = computeIdlePosition(home, agent.id, time);
      }
      pos = clampPointToIsland(pos, island, 0.96);

      const color = getAgentColor(agent);
      const opacity = getAgentOpacity(agent);
      const size = getAgentSize(agent);
      const isLowHealth = agent.health < 40;

      drawAgent(ctx, pos.x, pos.y, color, size, opacity, isLowHealth, time);
      rendered.push({ pos, color, opacity, size, agent });
    }

    agentPositionsRef.current = rendered;

    // Draw tooltip for hovered agent
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

    animRef.current = requestAnimationFrame(render);
  }, [agents, activeRandomEvents, hoveredAgent, terrain]);

  // Start/stop animation loop
  useEffect(() => {
    animRef.current = requestAnimationFrame(render);
    return () => cancelAnimationFrame(animRef.current);
  }, [render]);

  // Mouse move handler for hover detection
  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    mouseRef.current = { x, y };

    // Hit test against rendered agents
    let found: AgentState | null = null;
    for (const r of agentPositionsRef.current) {
      if (hitTestAgent(x, y, r.pos.x, r.pos.y, r.size)) {
        found = r.agent;
        break;
      }
    }
    setHoveredAgent(found);

    if (canvas) {
      canvas.style.cursor = found ? 'pointer' : 'default';
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
        onMouseLeave={() => setHoveredAgent(null)}
        onClick={handleClick}
      />
    </div>
  );
}
