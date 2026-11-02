import { describe, expect, it } from 'vitest';
import {
  closestPointOnSegment,
  distPointSegment,
  evenOddArea,
  pointInPolygon,
  polygonArea,
  polylineLength,
  segmentIntersection,
  type Vec2,
} from '../src/sim/geometry';

const P = (x: number, y: number): Vec2 => ({ x, y });

const square = [P(0, 0), P(4, 0), P(4, 4), P(0, 4)];
const triangle = [P(0, 0), P(6, 0), P(0, 3)];
// Concave en « U » : 6×4 privé d'une encoche 2×3 au centre-haut.
const uShape = [P(0, 0), P(6, 0), P(6, 4), P(4, 4), P(4, 1), P(2, 1), P(2, 4), P(0, 4)];
// Nœud papillon (croisé) : deux triangles opposés qui se touchent en (2,2).
const bowtie = [P(0, 0), P(4, 4), P(4, 0), P(0, 4)];
// Pentagramme : polygone croisé dont le pentagone central est traversé deux fois.
const star = Array.from({ length: 5 }, (_, i) => {
  const a = -Math.PI / 2 + (i * 4 * Math.PI) / 5;
  return P(Math.cos(a) * 10, Math.sin(a) * 10);
});

describe('surface (lacet)', () => {
  it('convexe', () => {
    expect(polygonArea(square)).toBeCloseTo(16);
    expect(polygonArea(triangle)).toBeCloseTo(9);
  });

  it('indépendante du sens de parcours', () => {
    expect(polygonArea([...square].reverse())).toBeCloseTo(16);
  });

  it('concave', () => {
    expect(polygonArea(uShape)).toBeCloseTo(24 - 6);
  });

  it('dégénéré', () => {
    expect(polygonArea([P(0, 0), P(1, 1)])).toBe(0);
    expect(polygonArea([P(0, 0), P(1, 1), P(2, 2)])).toBeCloseTo(0);
  });
});

describe('surface pair-impair', () => {
  it('égale au lacet sur les polygones simples', () => {
    for (const poly of [square, triangle, uShape]) {
      expect(evenOddArea(poly)).toBeCloseTo(polygonArea(poly), 9);
    }
  });

  it('nœud papillon : somme des deux lobes (le lacet donne 0)', () => {
    expect(polygonArea(bowtie)).toBeCloseTo(0);
    expect(evenOddArea(bowtie)).toBeCloseTo(8, 9);
  });

  it('pentagramme : les 5 branches seulement, sans le pentagone central', () => {
    // Pentagramme de rayon R : surface des 5 pointes = surface étoile pleine − pentagone intérieur.
    const R = 10;
    const r = (R * Math.cos((2 * Math.PI) / 5)) / Math.cos(Math.PI / 5); // rayon du pentagone intérieur
    const innerPentagon = (5 / 2) * r * r * Math.sin((2 * Math.PI) / 5);
    // Étoile pleine = 10 triangles centre / pointe / sommet intérieur.
    const fullStar = 10 * 0.5 * R * r * Math.sin(Math.PI / 5);
    expect(evenOddArea(star)).toBeCloseTo(fullStar - innerPentagon, 6);
  });
});

describe('point dans polygone (pair-impair)', () => {
  it('convexe', () => {
    expect(pointInPolygon(P(2, 2), square)).toBe(true);
    expect(pointInPolygon(P(5, 2), square)).toBe(false);
    expect(pointInPolygon(P(-0.1, 2), square)).toBe(false);
    expect(pointInPolygon(P(1, 1), triangle)).toBe(true);
    expect(pointInPolygon(P(4, 2), triangle)).toBe(false);
  });

  it('concave : l’encoche est dehors', () => {
    expect(pointInPolygon(P(1, 3), uShape)).toBe(true);
    expect(pointInPolygon(P(5, 3), uShape)).toBe(true);
    expect(pointInPolygon(P(3, 0.5), uShape)).toBe(true);
    expect(pointInPolygon(P(3, 3), uShape)).toBe(false);
  });

  it('croisé : seuls les lobes sont dedans', () => {
    expect(pointInPolygon(P(2, 0.8), bowtie)).toBe(false);
    expect(pointInPolygon(P(0.8, 2), bowtie)).toBe(true);
    expect(pointInPolygon(P(3.2, 2), bowtie)).toBe(true);
    expect(pointInPolygon(P(2, 3.2), bowtie)).toBe(false);
  });

  it('pentagramme : le centre est dehors, les pointes dedans', () => {
    expect(pointInPolygon(P(0, 0), star)).toBe(false);
    expect(pointInPolygon(P(0, -8), star)).toBe(true);
  });

  it('cohérent avec la surface pair-impair (Monte-Carlo déterministe)', () => {
    let inside = 0;
    const N = 200;
    for (let i = 0; i < N; i++) {
      for (let j = 0; j < N; j++) {
        if (pointInPolygon(P(((i + 0.5) / N) * 4, ((j + 0.5) / N) * 4), bowtie)) inside++;
      }
    }
    expect((inside / (N * N)) * 16).toBeCloseTo(evenOddArea(bowtie), 1);
  });
});

describe('segments', () => {
  it('distance point-segment', () => {
    const a = P(0, 0);
    const b = P(10, 0);
    expect(distPointSegment(P(5, 3), a, b)).toBeCloseTo(3);
    expect(distPointSegment(P(-3, 4), a, b)).toBeCloseTo(5);
    expect(distPointSegment(P(13, -4), a, b)).toBeCloseTo(5);
    expect(distPointSegment(P(2, 2), a, a)).toBeCloseTo(Math.SQRT2 * 2);
  });

  it('projection', () => {
    expect(closestPointOnSegment(P(3, 7), P(0, 0), P(10, 0))).toEqual(P(3, 0));
  });

  it('intersection', () => {
    const hit = segmentIntersection(P(0, 0), P(4, 4), P(4, 0), P(0, 4));
    expect(hit?.x).toBeCloseTo(2);
    expect(hit?.y).toBeCloseTo(2);
    expect(segmentIntersection(P(0, 0), P(1, 0), P(0, 1), P(1, 1))).toBeNull();
    expect(segmentIntersection(P(0, 0), P(1, 1), P(2, 0), P(3, -1))).toBeNull();
  });

  it('longueur de ligne brisée', () => {
    expect(polylineLength([P(0, 0), P(3, 4), P(3, 10)])).toBeCloseTo(11);
    expect(polylineLength([P(1, 1)])).toBe(0);
  });
});
