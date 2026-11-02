/**
 * Grille de hachage spatial : requêtes de voisinage en O(1) amorti,
 * pour tenir 200 ennemis à 60 fps sur mobile.
 */
export class SpatialHash {
  private readonly cells = new Map<number, number[]>();
  private readonly pool: number[][] = [];

  constructor(private readonly cellSize: number) {}

  private key(cx: number, cy: number): number {
    return (cx + 32768) * 65536 + (cy + 32768);
  }

  clear(): void {
    for (const arr of this.cells.values()) {
      arr.length = 0;
      this.pool.push(arr);
    }
    this.cells.clear();
  }

  insert(id: number, x: number, y: number): void {
    const k = this.key(Math.floor(x / this.cellSize), Math.floor(y / this.cellSize));
    let cell = this.cells.get(k);
    if (!cell) {
      cell = this.pool.pop() ?? [];
      this.cells.set(k, cell);
    }
    cell.push(id);
  }

  /** Ids des éléments dont la cellule recoupe le rectangle (à filtrer finement par l'appelant). */
  queryRect(minX: number, minY: number, maxX: number, maxY: number, out: number[] = []): number[] {
    out.length = 0;
    const x0 = Math.floor(minX / this.cellSize);
    const y0 = Math.floor(minY / this.cellSize);
    const x1 = Math.floor(maxX / this.cellSize);
    const y1 = Math.floor(maxY / this.cellSize);
    for (let cx = x0; cx <= x1; cx++) {
      for (let cy = y0; cy <= y1; cy++) {
        const cell = this.cells.get(this.key(cx, cy));
        if (cell) for (const id of cell) out.push(id);
      }
    }
    return out;
  }

  queryRadius(x: number, y: number, r: number, out: number[] = []): number[] {
    return this.queryRect(x - r, y - r, x + r, y + r, out);
  }
}
