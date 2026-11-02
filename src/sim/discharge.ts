import { clamp, evenOddArea, vertexCentroid, type Vec2 } from './geometry';
import type { Tuning } from './tuning';
import type { Discharge, PlayerId } from './types';

/**
 * Règle d'équilibrage centrale : plus la boucle est petite, plus elle frappe fort.
 * dégâts = base × √(surface de référence / surface), bornés entre min et max.
 */
export function computeIntensity(area: number, t: Tuning['discharge']): number {
  if (area <= 1e-9) return t.maxDamage;
  return clamp(t.baseDamage * Math.sqrt(t.referenceArea / area), t.minDamage, t.maxDamage);
}

export function createDischarge(
  ownerId: PlayerId,
  pylonIds: number[],
  polygon: Vec2[],
  tick: number,
  t: Tuning['discharge'],
): Discharge {
  const area = evenOddArea(polygon);
  return {
    ownerId,
    pylonIds,
    polygon,
    area,
    intensity: computeIntensity(area, t),
    tick,
    center: vertexCentroid(polygon),
    hits: 0,
    kills: 0,
    totalDamage: 0,
  };
}
