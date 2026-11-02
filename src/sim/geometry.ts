/**
 * Géométrie pure de Plug'd. Aucune dépendance au rendu.
 * Unité : la « case » (1 case = 1 unité de monde).
 */

export interface Vec2 {
  x: number;
  y: number;
}

export function vec(x: number, y: number): Vec2 {
  return { x, y };
}

export function dist(a: Vec2, b: Vec2): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function distSq(a: Vec2, b: Vec2): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return dx * dx + dy * dy;
}

/** Surface signée par la formule du lacet (positive si sens trigonométrique en repère y-haut). */
export function signedArea(poly: readonly Vec2[]): number {
  const n = poly.length;
  if (n < 3) return 0;
  let s = 0;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[j]!;
    const b = poly[i]!;
    s += a.x * b.y - b.x * a.y;
  }
  return s / 2;
}

/**
 * Surface par la formule du lacet, en valeur absolue.
 * Exacte pour les polygones simples (convexes ou concaves). Pour un polygone croisé,
 * les lobes de sens opposés se compensent : utiliser {@link evenOddArea}.
 */
export function polygonArea(poly: readonly Vec2[]): number {
  return Math.abs(signedArea(poly));
}

/**
 * Point dans polygone par lancer de rayon horizontal, règle pair-impair.
 * Gère les polygones croisés : seules les zones traversées un nombre impair de fois sont « dedans ».
 */
export function pointInPolygon(p: Vec2, poly: readonly Vec2[]): boolean {
  const n = poly.length;
  if (n < 3) return false;
  let inside = false;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > p.y !== b.y > p.y) {
      const xCross = a.x + ((p.y - a.y) * (b.x - a.x)) / (b.y - a.y);
      if (p.x < xCross) inside = !inside;
    }
  }
  return inside;
}

/** Longueur totale de l'intérieur (pair-impair) du polygone sur la droite horizontale y. */
function insideLengthAt(y: number, poly: readonly Vec2[], xs: number[]): number {
  xs.length = 0;
  const n = poly.length;
  for (let i = 0, j = n - 1; i < n; j = i++) {
    const a = poly[i]!;
    const b = poly[j]!;
    if (a.y > y !== b.y > y) {
      xs.push(a.x + ((y - a.y) * (b.x - a.x)) / (b.y - a.y));
    }
  }
  xs.sort((u, v) => u - v);
  let len = 0;
  for (let k = 0; k + 1 < xs.length; k += 2) len += xs[k + 1]! - xs[k]!;
  return len;
}

/** Intersection propre de deux segments [p1,p2] et [p3,p4], ou null. */
export function segmentIntersection(p1: Vec2, p2: Vec2, p3: Vec2, p4: Vec2): Vec2 | null {
  const d1x = p2.x - p1.x;
  const d1y = p2.y - p1.y;
  const d2x = p4.x - p3.x;
  const d2y = p4.y - p3.y;
  const den = d1x * d2y - d1y * d2x;
  if (Math.abs(den) < 1e-12) return null;
  const t = ((p3.x - p1.x) * d2y - (p3.y - p1.y) * d2x) / den;
  const u = ((p3.x - p1.x) * d1y - (p3.y - p1.y) * d1x) / den;
  if (t < 0 || t > 1 || u < 0 || u > 1) return null;
  return { x: p1.x + t * d1x, y: p1.y + t * d1y };
}

/**
 * Surface exacte de la région « dedans » selon la règle pair-impair.
 * Égale à {@link polygonArea} pour un polygone simple ; correcte aussi pour les polygones croisés
 * (là où le lacet donnerait par exemple 0 pour un huit symétrique).
 *
 * Méthode : entre deux ordonnées critiques consécutives (sommets et croisements d'arêtes),
 * la longueur intérieure d'une horizontale varie linéairement ; la règle du point milieu
 * est donc exacte sur chaque tranche.
 */
export function evenOddArea(poly: readonly Vec2[]): number {
  const n = poly.length;
  if (n < 3) return 0;
  const ys: number[] = [];
  for (const p of poly) ys.push(p.y);
  for (let i = 0; i < n; i++) {
    const a = poly[i]!;
    const b = poly[(i + 1) % n]!;
    for (let j = i + 2; j < n; j++) {
      if (i === 0 && j === n - 1) continue; // arêtes adjacentes
      const c = poly[j]!;
      const d = poly[(j + 1) % n]!;
      const hit = segmentIntersection(a, b, c, d);
      if (hit) ys.push(hit.y);
    }
  }
  ys.sort((u, v) => u - v);
  const xs: number[] = [];
  let area = 0;
  for (let k = 0; k + 1 < ys.length; k++) {
    const y0 = ys[k]!;
    const y1 = ys[k + 1]!;
    const h = y1 - y0;
    if (h <= 1e-12) continue;
    area += insideLengthAt((y0 + y1) / 2, poly, xs) * h;
  }
  return area;
}

/** Projection de p sur le segment [a,b]. */
export function closestPointOnSegment(p: Vec2, a: Vec2, b: Vec2): Vec2 {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len2 = dx * dx + dy * dy;
  if (len2 === 0) return { x: a.x, y: a.y };
  let t = ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2;
  t = t < 0 ? 0 : t > 1 ? 1 : t;
  return { x: a.x + t * dx, y: a.y + t * dy };
}

/** Distance au carré entre le point p et le segment [a,b]. */
export function distPointSegmentSq(p: Vec2, a: Vec2, b: Vec2): number {
  return distSq(p, closestPointOnSegment(p, a, b));
}

/** Distance entre le point p et le segment [a,b] (contact câble / ennemi). */
export function distPointSegment(p: Vec2, a: Vec2, b: Vec2): number {
  return Math.sqrt(distPointSegmentSq(p, a, b));
}

/** Longueur d'une ligne brisée ouverte. */
export function polylineLength(points: readonly Vec2[]): number {
  let len = 0;
  for (let i = 1; i < points.length; i++) len += dist(points[i - 1]!, points[i]!);
  return len;
}

/** Moyenne des sommets : sert à placer le chiffre de dégâts au centre du polygone. */
export function vertexCentroid(poly: readonly Vec2[]): Vec2 {
  let x = 0;
  let y = 0;
  for (const p of poly) {
    x += p.x;
    y += p.y;
  }
  const n = Math.max(1, poly.length);
  return { x: x / n, y: y / n };
}

export interface Bounds {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
}

export function bounds(points: readonly Vec2[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const p of points) {
    if (p.x < minX) minX = p.x;
    if (p.y < minY) minY = p.y;
    if (p.x > maxX) maxX = p.x;
    if (p.y > maxY) maxY = p.y;
  }
  return { minX, minY, maxX, maxY };
}

export function clamp(v: number, min: number, max: number): number {
  return v < min ? min : v > max ? max : v;
}
