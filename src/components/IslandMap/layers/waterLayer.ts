export function drawWater(ctx: CanvasRenderingContext2D, w: number, h: number, time: number): void {
  const grad = ctx.createLinearGradient(0, 0, 0, h);
  grad.addColorStop(0, '#0a3d6b');
  grad.addColorStop(0.55, '#08345b');
  grad.addColorStop(1, '#052845');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, w, h);

  ctx.strokeStyle = 'rgba(111, 187, 255, 0.11)';
  ctx.lineWidth = 1;
  for (let i = 0; i < 9; i++) {
    ctx.beginPath();
    const baseY = (h / 9) * i + 20;
    for (let x = 0; x <= w; x += 4) {
      const y = baseY + Math.sin(x * 0.014 + time * 0.55 + i * 1.17) * 6;
      if (x === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();
  }
}
