import { describe, expect, it } from 'vitest';
import { attachToChain, closingIndex } from '../src/sim/chain';
import { World } from '../src/sim/world';
import { cloneTuning } from '../src/sim/tuning';
import { IDLE_INPUT, type Chain, type SimEvent } from '../src/sim/types';

const chainOf = (nodes: number[]): Chain => ({ ownerId: 1, nodes, maxLength: 10 });

describe('chaîne (logique pure)', () => {
  it('accroche les bornes dans l’ordre', () => {
    const c = chainOf([]);
    expect(attachToChain(c, 5, 3)).toEqual({ kind: 'attached' });
    expect(attachToChain(c, 7, 3)).toEqual({ kind: 'attached' });
    expect(c.nodes).toEqual([5, 7]);
  });

  it('repasser sur une borne ferme le polygone des bornes entre les deux passages', () => {
    const c = chainOf([1, 2, 3, 4, 5]);
    expect(attachToChain(c, 2, 3)).toEqual({ kind: 'closed', loop: [2, 3, 4, 5] });
    expect(c.nodes).toEqual([2]);
  });

  it('pas de fermeture à moins de 3 bornes', () => {
    const c = chainOf([1, 2, 3]);
    expect(attachToChain(c, 2, 3)).toEqual({ kind: 'ignored' });
    expect(attachToChain(c, 3, 3)).toEqual({ kind: 'ignored' });
    expect(c.nodes).toEqual([1, 2, 3]);
    expect(closingIndex(c, 1, 3)).toBe(0);
    expect(closingIndex(c, 2, 3)).toBe(-1);
  });
});

/** Arène vide 12×20 avec 4 bornes en carré de 2 cases, sans vagues. */
function squareWorld() {
  const tuning = cloneTuning();
  const pylons = [
    { x: 4, y: 8 },
    { x: 6, y: 8 },
    { x: 6, y: 10 },
    { x: 4, y: 10 },
  ];
  const world = new World({ seed: 1, tuning, pylons, playerSpawn: { x: 2, y: 2 }, waves: false });
  const ids = world.pylons.map((p) => p.id);
  const visit = (i: number): SimEvent[] => {
    const p = world.pylons[i]!;
    world.players[0]!.x = p.x;
    world.players[0]!.y = p.y;
    world.step([IDLE_INPUT]);
    return world.events;
  };
  return { world, ids, visit };
}

describe('fermeture dans la simulation', () => {
  it('forme le bon polygone, touche les ennemis dedans et applique le refroidissement', () => {
    const { world, ids, visit } = squareWorld();
    const inside = world.spawnEnemy('crawler', 5, 9);
    const outside = world.spawnEnemy('crawler', 9, 15);

    visit(0);
    visit(1);
    visit(2);
    visit(3);
    expect(world.players[0]!.chain.nodes).toEqual(ids);

    const events = visit(0);
    const ev = events.find((e) => e.type === 'discharge');
    expect(ev?.type).toBe('discharge');
    if (ev?.type !== 'discharge') return;
    const d = ev.discharge;
    expect(d.pylonIds).toEqual(ids);
    expect(d.polygon).toEqual([
      { x: 4, y: 8 },
      { x: 6, y: 8 },
      { x: 6, y: 10 },
      { x: 4, y: 10 },
    ]);
    expect(d.area).toBeCloseTo(4);
    // Surface = surface de référence → 40 dégâts ; le Rampant (20 PV) meurt.
    expect(d.intensity).toBeCloseTo(40);
    expect(d.hits).toBe(1);
    expect(d.kills).toBe(1);
    expect(world.getEnemy(inside.id)).toBeUndefined();
    expect(world.getEnemy(outside.id)?.hp).toBe(20);

    // Refroidissement : 4 s pour chaque borne de la boucle.
    const cd = world.secondsToTicks(world.t.pylon.cooldownSec);
    for (const p of world.pylons) expect(p.cooldownUntil).toBe(world.tick + cd);
    // La chaîne repart de la borne de fermeture.
    expect(world.players[0]!.chain.nodes).toEqual([ids[0]]);
  });

  it('une borne en surchauffe ne peut pas être accrochée', () => {
    const { world, visit } = squareWorld();
    [0, 1, 2, 3, 0].forEach(visit);
    visit(1);
    expect(world.players[0]!.chain.nodes).toHaveLength(1);
    // Après le refroidissement, elle redevient accrochable.
    for (let i = 0; i < world.secondsToTicks(4) + 1; i++) world.step([IDLE_INPUT]);
    world.players[0]!.x = 0.5;
    world.step([IDLE_INPUT]);
    visit(1);
    expect(world.players[0]!.chain.nodes).toContain(world.pylons[1]!.id);
  });

  it('une petite boucle frappe plus fort qu’une grande', () => {
    const tuning = cloneTuning();
    const small = new World({ seed: 1, tuning, pylons: [{ x: 4, y: 8 }, { x: 5, y: 8 }, { x: 4.5, y: 9 }], waves: false });
    const big = new World({ seed: 1, tuning, pylons: [{ x: 2, y: 4 }, { x: 5, y: 4 }, { x: 3.5, y: 6.6 }], waves: false });
    const intensity = (w: World) => {
      for (const i of [0, 1, 2, 0]) {
        w.players[0]!.x = w.pylons[i]!.x;
        w.players[0]!.y = w.pylons[i]!.y;
        w.step([IDLE_INPUT]);
      }
      return w.lastDischarges[0]!.intensity;
    };
    expect(intensity(small)).toBeGreaterThan(intensity(big));
  });

  it('le câble rompt au-delà de sa longueur maximale', () => {
    const { world, visit } = squareWorld();
    visit(0);
    visit(1);
    const p = world.players[0]!;
    p.x = 6;
    p.y = 18; // 2 + 10 > 10
    world.step([IDLE_INPUT]);
    expect(world.events.some((e) => e.type === 'chainBroken' && e.reason === 'length')).toBe(true);
    expect(p.chain.nodes).toEqual([]);
  });

  it('un Coupe-fil qui touche le câble le coupe', () => {
    const { world, visit } = squareWorld();
    visit(0);
    visit(1);
    world.spawnEnemy('cutter', 5, 8.1);
    world.step([IDLE_INPUT]);
    expect(world.events.some((e) => e.type === 'chainBroken' && e.reason === 'cut')).toBe(true);
    expect(world.players[0]!.chain.nodes).toEqual([]);
  });

  it('le Piquet plante une borne temporaire, accrochée aussitôt, qui disparaît après 6 s', () => {
    const { world } = squareWorld();
    world.step([{ ...IDLE_INPUT, skill: true }]);
    const stake = world.pylons.find((p) => p.kind === 'stake');
    expect(stake).toBeDefined();
    expect(world.players[0]!.chain.nodes).toEqual([stake!.id]);
    // Recharge : un second appui immédiat ne fait rien.
    world.step([{ ...IDLE_INPUT, skill: true }]);
    expect(world.pylons.filter((p) => p.kind === 'stake')).toHaveLength(1);
    for (let i = 0; i < world.secondsToTicks(6); i++) world.step([IDLE_INPUT]);
    expect(world.pylons.some((p) => p.kind === 'stake')).toBe(false);
    expect(world.players[0]!.chain.nodes).toEqual([]);
  });

  it('abandonner la chaîne la vide', () => {
    const { world, visit } = squareWorld();
    visit(0);
    visit(1);
    world.step([{ ...IDLE_INPUT, drop: true }]);
    expect(world.players[0]!.chain.nodes).toEqual([]);
  });
});
