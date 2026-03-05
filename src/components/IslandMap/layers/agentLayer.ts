export function drawAgent(
  ctx: CanvasRenderingContext2D,
  x: number, y: number, color: string, size: number, opacity: number,
  isLowHealth: boolean, time: number,
): void {
  ctx.save();
  ctx.globalAlpha = opacity;

  let drawSize = Math.max(2.6, size);
  if (isLowHealth) {
    const pulse = Math.sin(time * 4) * 0.3 + 0.7;
    drawSize = size * pulse;
    ctx.beginPath();
    ctx.arc(x, y, drawSize + 4.6, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(244, 67, 54, ${0.3 * pulse})`;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(x, y, drawSize + 3.2, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(8, 18, 33, 0.5)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, drawSize + 1.7, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(245, 249, 255, 0.86)';
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, drawSize, 0, Math.PI * 2);
  ctx.fillStyle = color;
  ctx.fill();
  ctx.strokeStyle = 'rgba(9, 20, 35, 0.6)';
  ctx.lineWidth = 0.9;
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(x - drawSize * 0.24, y - drawSize * 0.24, drawSize * 0.42, 0, Math.PI * 2);
  ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
  ctx.fill();

  ctx.restore();
}

export function drawWorkParticle(
  ctx: CanvasRenderingContext2D, x: number, y: number, color: string, progress: number,
): void {
  if (progress > 0.3) return;
  const t = progress / 0.3;
  const particleAlpha = (1 - t) * 0.6;
  const particleY = y - t * 12;

  ctx.save();
  ctx.globalAlpha = particleAlpha;
  ctx.font = '700 9px sans-serif';
  ctx.strokeStyle = 'rgba(8, 18, 33, 0.8)';
  ctx.lineWidth = 1.4;
  ctx.fillStyle = color;
  ctx.textAlign = 'center';
  ctx.strokeText('+', x + 6, particleY);
  ctx.fillText('+', x + 6, particleY);
  ctx.restore();
}

export function drawTooltip(
  ctx: CanvasRenderingContext2D, x: number, y: number, text: string, w: number,
): void {
  ctx.save();
  ctx.font = '11px -apple-system, BlinkMacSystemFont, "Noto Sans TC", sans-serif';
  const metrics = ctx.measureText(text);
  const pad = 6;
  const tw = metrics.width + pad * 2;
  const th = 20;

  let tx = x - tw / 2;
  let ty = y - 22;
  if (tx < 4) tx = 4;
  if (tx + tw > w - 4) tx = w - 4 - tw;
  if (ty < 4) ty = y + 14;

  ctx.fillStyle = 'rgba(10, 25, 47, 0.9)';
  ctx.strokeStyle = 'rgba(100, 255, 218, 0.5)';
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.roundRect(tx, ty, tw, th, 4);
  ctx.fill();
  ctx.stroke();

  ctx.fillStyle = '#e6f1ff';
  ctx.textAlign = 'left';
  ctx.textBaseline = 'middle';
  ctx.fillText(text, tx + pad, ty + th / 2);
  ctx.restore();
}
