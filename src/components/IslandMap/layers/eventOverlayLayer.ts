import type { ActiveRandomEvent } from '../../../types';
import type { ZoneLayout } from '../agentAnimator';

function seededFloat(seed: number, offset: number): number {
  const x = Math.sin(seed * 127.1 + offset * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

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
      ctx.save();
      const pulse = Math.sin(time * 1.5) * 0.03 + 0.07;
      ctx.fillStyle = `rgba(100, 200, 100, ${pulse})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    if (id === 'innovation') {
      const zone = layout.goods;
      ctx.save();
      ctx.fillStyle = `rgba(33, 150, 243, ${0.15 + Math.sin(time * 3) * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (id === 'festival') {
      const zone = layout.services;
      ctx.save();
      ctx.fillStyle = `rgba(255, 152, 0, ${0.15 + Math.sin(time * 2.5) * 0.05})`;
      ctx.beginPath();
      ctx.ellipse(zone.cx, zone.cy, zone.rx, zone.ry, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    if (id === 'inflation_spike') {
      ctx.save();
      const pulse = 0.05 + Math.sin(time * 2.2) * 0.015;
      ctx.fillStyle = `rgba(255, 120, 64, ${pulse})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }
}
