import { describe, expect, it } from 'vitest';
import { Rng, hashSeed } from '../src/sim/rng';
import { World } from '../src/sim/world';
import { ARENA_TEMPLATES } from '../src/sim/content/arenas';
import type { PlayerInput } from '../src/sim/types';

/** Entrées scriptées : un cercle lent, un piquet et un abandon de chaîne de temps en temps. */
function scriptedInput(tick: number): PlayerInput {
  const a = tick / 90;
  return { moveX: Math.cos(a), moveY: Math.sin(a * 0.7), skill: tick % 500 === 100, drop: tick % 700 === 650 };
}

function run(seed: number, ticks: number): World {
  const w = new World({ seed });
  for (let i = 0; i < ticks && w.status === 'playing'; i++) w.step([scriptedInput(i)]);
  return w;
}

describe('déterminisme', () => {
  it('le PRNG rejoue la même suite pour la même seed', () => {
    const a = new Rng(42);
    const b = new Rng(42);
    for (let i = 0; i < 100; i++) expect(a.next()).toBe(b.next());
    expect(hashSeed('2026-11-02')).toBe(hashSeed('2026-11-02'));
    expect(hashSeed('2026-11-02')).not.toBe(hashSeed('2026-11-03'));
  });

  it('la même seed produit la même arène', () => {
    for (const seed of [1, 7, 123456, hashSeed('2026-11-02')]) {
      const a = new World({ seed, waves: false });
      const b = new World({ seed, waves: false });
      expect(a.template).toBe(b.template);
      expect(a.pylons).toEqual(b.pylons);
      expect(a.players[0]).toEqual(b.players[0]);
    }
  });

  it('chaque gabarit produit une arène jouable', () => {
    for (const template of ARENA_TEMPLATES) {
      for (let seed = 1; seed <= 20; seed++) {
        const w = new World({ seed, template, waves: false });
        expect(w.pylons.length).toBeGreaterThanOrEqual(12);
        for (const p of w.pylons) {
          expect(p.x).toBeGreaterThan(0);
          expect(p.x).toBeLessThan(w.width);
          expect(p.y).toBeGreaterThan(0);
          expect(p.y).toBeLessThan(w.height);
        }
      }
    }
  });

  it('des seeds différentes produisent des arènes différentes', () => {
    const a = new World({ seed: 1, template: 'grid', waves: false });
    const b = new World({ seed: 2, template: 'grid', waves: false });
    expect(a.pylons).not.toEqual(b.pylons);
  });

  it('la même seed et les mêmes entrées produisent les mêmes vagues et le même état', () => {
    const a = run(99, 3000);
    const b = run(99, 3000);
    expect(a.stats.kills + a.enemies.length).toBeGreaterThan(10);
    expect(a.fingerprint()).toBe(b.fingerprint());
    expect(run(100, 3000).fingerprint()).not.toBe(a.fingerprint());
  });
});
