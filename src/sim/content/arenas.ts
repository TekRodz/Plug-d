import { dist, type Vec2 } from '../geometry';
import type { Rng } from '../rng';

export type ArenaTemplate = 'grid' | 'circle' | 'corridors' | 'islands';

export const ARENA_TEMPLATES: readonly ArenaTemplate[] = ['grid', 'circle', 'corridors', 'islands'];

export const TEMPLATE_NAMES: Record<ArenaTemplate, string> = {
  grid: 'Grille',
  circle: 'Cercle',
  corridors: 'Couloirs',
  islands: 'Îlots',
};

export interface ArenaLayout {
  template: ArenaTemplate;
  pylons: Vec2[];
  spawn: Vec2;
}

const MARGIN = 1.3;
/** Écart minimal entre deux bornes : au-dessous, le rayon de capture les confond. */
const MIN_GAP = 1.5;

function inside(p: Vec2, w: number, h: number): boolean {
  return p.x >= MARGIN && p.x <= w - MARGIN && p.y >= MARGIN && p.y <= h - MARGIN;
}

function addPylon(list: Vec2[], p: Vec2, w: number, h: number): void {
  if (!inside(p, w, h)) return;
  if (list.some((q) => dist(p, q) < MIN_GAP)) return;
  list.push({ x: round(p.x), y: round(p.y) });
}

function round(v: number): number {
  return Math.round(v * 1000) / 1000;
}

function grid(rng: Rng, w: number, h: number): Vec2[] {
  const out: Vec2[] = [];
  const spacing = rng.range(2.3, 2.8);
  const cols = Math.floor((w - 2 * MARGIN) / spacing) + 1;
  const rows = Math.floor((h - 2 * MARGIN) / spacing) + 1;
  const ox = (w - (cols - 1) * spacing) / 2;
  const oy = (h - (rows - 1) * spacing) / 2;
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      if (rng.chance(0.12)) continue; // trous : casser la régularité
      const j = 0.35;
      addPylon(out, { x: ox + c * spacing + rng.range(-j, j), y: oy + r * spacing + rng.range(-j, j) }, w, h);
    }
  }
  return out;
}

function circle(rng: Rng, w: number, h: number): Vec2[] {
  const out: Vec2[] = [];
  const cx = w / 2;
  const cy = h / 2;
  addPylon(out, { x: cx, y: cy }, w, h);
  const rings = [
    { r: 2.4, n: 6 },
    { r: 4.6, n: 11 },
  ];
  for (const ring of rings) {
    const phase = rng.range(0, Math.PI * 2);
    for (let i = 0; i < ring.n; i++) {
      const a = phase + (i / ring.n) * Math.PI * 2;
      addPylon(out, { x: cx + Math.cos(a) * ring.r, y: cy + Math.sin(a) * ring.r * 1.15 }, w, h);
    }
  }
  // Satellites en haut et en bas de l'arène portrait.
  for (const sy of [2, h - 2]) {
    for (let i = 0; i < 4; i++) addPylon(out, { x: rng.range(2, w - 2), y: sy + rng.range(-0.6, 0.6) }, w, h);
  }
  return out;
}

function corridors(rng: Rng, w: number, h: number): Vec2[] {
  const out: Vec2[] = [];
  const lanes = 3;
  for (let l = 0; l < lanes; l++) {
    const x = MARGIN + 0.4 + (l * (w - 2 * MARGIN - 0.8)) / (lanes - 1);
    let y = MARGIN + rng.range(0, 0.8);
    while (y < h - MARGIN) {
      addPylon(out, { x: x + rng.range(-0.3, 0.3), y }, w, h);
      // Paire décalée pour pouvoir fermer des triangles d'une colonne à l'autre.
      if (l < lanes - 1 && rng.chance(0.35)) addPylon(out, { x: x + (w - 2 * MARGIN) / (2 * (lanes - 1)), y: y + 1.1 }, w, h);
      y += rng.range(2.2, 2.9);
    }
  }
  return out;
}

function islands(rng: Rng, w: number, h: number): Vec2[] {
  const out: Vec2[] = [];
  const centers: Vec2[] = [];
  for (let attempt = 0; centers.length < 5 && attempt < 200; attempt++) {
    const c = { x: rng.range(2.6, w - 2.6), y: rng.range(2.6, h - 2.6) };
    if (centers.every((o) => dist(o, c) > 5)) centers.push(c);
  }
  for (const c of centers) {
    const n = rng.int(3, 6);
    const phase = rng.range(0, Math.PI * 2);
    const r = rng.range(1.2, 1.7);
    for (let i = 0; i < n; i++) {
      const a = phase + (i / n) * Math.PI * 2;
      addPylon(out, { x: c.x + Math.cos(a) * r, y: c.y + Math.sin(a) * r }, w, h);
    }
  }
  // Ponts isolés entre les îlots.
  for (let i = 0; i < 4; i++) addPylon(out, { x: rng.range(MARGIN, w - MARGIN), y: rng.range(MARGIN, h - MARGIN) }, w, h);
  return out;
}

const GENERATORS: Record<ArenaTemplate, (rng: Rng, w: number, h: number) => Vec2[]> = {
  grid,
  circle,
  corridors,
  islands,
};

export function generateArena(rng: Rng, w: number, h: number, template?: ArenaTemplate): ArenaLayout {
  const chosen = template ?? rng.pick(ARENA_TEMPLATES);
  const pylons = GENERATORS[chosen](rng, w, h);
  // Le joueur apparaît au centre, légèrement décalé d'une borne pour ne rien accrocher d'office.
  let spawn = { x: w / 2, y: h / 2 + 0.9 };
  for (let k = 0; k < 20 && pylons.some((p) => dist(p, spawn) < 1); k++) {
    spawn = { x: w / 2 + rng.range(-1.5, 1.5), y: h / 2 + rng.range(-1.5, 1.5) };
  }
  return { template: chosen, pylons, spawn };
}
