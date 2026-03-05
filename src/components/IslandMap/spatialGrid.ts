// ── Spatial Grid ─────────────────────────────────────────────────────
// Grid-based spatial hash for O(1) agent hit testing on the canvas.
// Replaces linear scan through all agents.

import type { AgentState } from '../../types';

export interface GridEntry {
  agent: AgentState;
  x: number;
  y: number;
  size: number;
}

export class SpatialGrid {
  private cellSize: number;
  private cols: number;
  private rows: number;
  private cells: GridEntry[][];

  constructor(width: number, height: number, cellSize = 40) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize) || 1;
    this.rows = Math.ceil(height / cellSize) || 1;
    this.cells = new Array(this.cols * this.rows);
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i] = [];
    }
  }

  clear(): void {
    for (let i = 0; i < this.cells.length; i++) {
      this.cells[i].length = 0;
    }
  }

  insert(entry: GridEntry): void {
    const col = Math.floor(entry.x / this.cellSize);
    const row = Math.floor(entry.y / this.cellSize);
    const idx = this.getIndex(col, row);
    if (idx >= 0 && idx < this.cells.length) {
      this.cells[idx].push(entry);
    }
  }

  /**
   * Find the agent closest to (mx, my) within hit radius.
   * Checks only the cell containing the point and its 8 neighbors.
   */
  query(mx: number, my: number): AgentState | null {
    const col = Math.floor(mx / this.cellSize);
    const row = Math.floor(my / this.cellSize);

    let best: AgentState | null = null;
    let bestDist = Infinity;

    for (let dc = -1; dc <= 1; dc++) {
      for (let dr = -1; dr <= 1; dr++) {
        const idx = this.getIndex(col + dc, row + dr);
        if (idx < 0 || idx >= this.cells.length) continue;

        const cell = this.cells[idx];
        for (let i = 0; i < cell.length; i++) {
          const e = cell[i];
          const dx = mx - e.x;
          const dy = my - e.y;
          const dist = dx * dx + dy * dy;
          const hitRadius = e.size + 4; // generous click target
          if (dist < hitRadius * hitRadius && dist < bestDist) {
            bestDist = dist;
            best = e.agent;
          }
        }
      }
    }

    return best;
  }

  private getIndex(col: number, row: number): number {
    if (col < 0 || col >= this.cols || row < 0 || row >= this.rows) return -1;
    return row * this.cols + col;
  }
}
