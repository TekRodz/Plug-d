import type Phaser from 'phaser';
import type { Vec2 } from '../sim/geometry';

type G = Phaser.GameObjects.Graphics;

/** Hachage déterministe 0..1 pour les formes (pas d'aléa dans le rendu des ennemis). */
export function hash01(seed: number, i: number): number {
  let h = (seed ^ Math.imul(i + 1, 0x9e3779b1)) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Forme organique et irrégulière (Rampant) ou hérissée (Coupe-fil), en px écran. */
export function enemyShape(cx: number, cy: number, r: number, seed: number, t: number, spiky: boolean): Vec2[] {
  const n = spiky ? 10 : 9;
  const pts: Vec2[] = [];
  const spin = spiky ? t * 2.4 : Math.sin(t * 0.7 + seed) * 0.2;
  for (let i = 0; i < n; i++) {
    const a = spin + (i / n) * Math.PI * 2;
    const base = hash01(seed, i);
    let rr: number;
    if (spiky) {
      rr = r * (i % 2 === 0 ? 1.3 + 0.15 * base : 0.55 + 0.1 * base);
    } else {
      const wob = Math.sin(t * 3.2 + (seed % 13) + i * 1.9) * 0.1;
      rr = r * (0.82 + 0.32 * base + wob);
    }
    pts.push({ x: cx + Math.cos(a) * rr, y: cy + Math.sin(a) * rr });
  }
  return pts;
}

/** Ligne brisée électrique entre a et b (arc). */
export function lightning(a: Vec2, b: Vec2, amp: number, segs: number): Vec2[] {
  const pts: Vec2[] = [a];
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = Math.hypot(dx, dy) || 1;
  const nx = -dy / len;
  const ny = dx / len;
  for (let i = 1; i < segs; i++) {
    const t = i / segs;
    const off = (Math.random() * 2 - 1) * amp * Math.sin(t * Math.PI);
    pts.push({ x: a.x + dx * t + nx * off, y: a.y + dy * t + ny * off });
  }
  pts.push(b);
  return pts;
}

/** Câble tendu : ondulation perpendiculaire qui croît avec la tension. */
export function vibrate(points: Vec2[], amp: number, t: number): Vec2[] {
  if (amp <= 0) return points;
  const out: Vec2[] = [];
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    const nx = -dy / len;
    const ny = dx / len;
    const segs = Math.max(2, Math.round(len / 10));
    for (let k = 0; k < segs; k++) {
      const u = k / segs;
      const env = Math.sin(u * Math.PI);
      const off = Math.sin(t * 55 + (i * segs + k) * 1.3) * amp * env;
      out.push({ x: a.x + dx * u + nx * off, y: a.y + dy * u + ny * off });
    }
  }
  out.push(points[points.length - 1]!);
  return out;
}

export function polyline(g: G, pts: Vec2[]): void {
  if (pts.length < 2) return;
  g.beginPath();
  g.moveTo(pts[0]!.x, pts[0]!.y);
  for (let i = 1; i < pts.length; i++) g.lineTo(pts[i]!.x, pts[i]!.y);
  g.strokePath();
}

export function dashedPolygon(g: G, pts: Vec2[], dash: number, gap: number, phase: number): void {
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i]!;
    const b = pts[(i + 1) % pts.length]!;
    const len = Math.hypot(b.x - a.x, b.y - a.y);
    if (len < 1e-3) continue;
    const ux = (b.x - a.x) / len;
    const uy = (b.y - a.y) / len;
    let d = -((phase % (dash + gap)) + (dash + gap)) % (dash + gap);
    g.beginPath();
    while (d < len) {
      const s = Math.max(0, d);
      const e = Math.min(len, d + dash);
      if (e > s) {
        g.moveTo(a.x + ux * s, a.y + uy * s);
        g.lineTo(a.x + ux * e, a.y + uy * e);
      }
      d += dash + gap;
    }
    g.strokePath();
  }
}

/** Hachures diagonales dans un carré centré (borne en surchauffe : l'état ne repose pas que sur la couleur). */
export function hatchSquare(g: G, cx: number, cy: number, h: number, step: number): void {
  g.beginPath();
  for (let c = -2 * h + step / 2; c < 2 * h; c += step) {
    // Droite y = x - c dans le repère du carré [-h, h]².
    const x0 = Math.max(-h, -h + c);
    const x1 = Math.min(h, h + c);
    if (x1 <= x0) continue;
    g.moveTo(cx + x0, cy + x0 - c);
    g.lineTo(cx + x1, cy + x1 - c);
  }
  g.strokePath();
}

/** Symbole de résistance (zigzag) pour le personnage. */
export function resistorGlyph(g: G, cx: number, cy: number, w: number): void {
  const h = w * 0.28;
  const pts: Vec2[] = [{ x: cx - w / 2, y: cy }];
  const n = 6;
  for (let i = 0; i < n; i++) {
    pts.push({ x: cx - w / 2 + ((i + 0.5) / n) * w * 0.9 + w * 0.05, y: cy + (i % 2 === 0 ? -h : h) });
  }
  pts.push({ x: cx + w / 2, y: cy });
  polyline(g, pts);
}

/** Arc de cercle « camembert » (recharge), départ en haut, sens horaire. */
export function pie(g: G, cx: number, cy: number, r: number, frac: number): void {
  if (frac <= 0) return;
  const start = -Math.PI / 2;
  g.beginPath();
  g.moveTo(cx, cy);
  g.arc(cx, cy, r, start, start + Math.PI * 2 * Math.min(1, frac), false);
  g.closePath();
  g.fillPath();
}
