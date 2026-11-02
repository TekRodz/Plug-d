import { describe, expect, it } from 'vitest';
import { computeIntensity } from '../src/sim/discharge';
import { DEFAULT_TUNING } from '../src/sim/tuning';

const t = DEFAULT_TUNING.discharge;

describe('intensité selon la surface', () => {
  it('vaut la base à la surface de référence', () => {
    expect(computeIntensity(t.referenceArea, t)).toBeCloseTo(t.baseDamage);
  });

  it('décroît avec la surface', () => {
    expect(computeIntensity(1, t)).toBeGreaterThan(computeIntensity(4, t));
    expect(computeIntensity(4, t)).toBeGreaterThan(computeIntensity(9, t));
  });

  it('suit 40 × √(réf / surface)', () => {
    expect(computeIntensity(t.referenceArea * 4, t)).toBeCloseTo(t.baseDamage / 2);
  });

  it('est bornée entre 10 et 120', () => {
    expect(computeIntensity(0, t)).toBe(120);
    expect(computeIntensity(0.001, t)).toBe(120);
    expect(computeIntensity(1e6, t)).toBe(10);
  });
});
