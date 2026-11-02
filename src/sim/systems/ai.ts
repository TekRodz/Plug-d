import { clamp, closestPointOnSegment, distSq, type Vec2 } from '../geometry';
import type { Enemy } from '../types';
import type { World } from '../world';

const neighbors: number[] = [];

/** Cible d'un ennemi : le joueur le plus proche, ou le câble exposé pour un Coupe-fil. */
function targetOf(world: World, e: Enemy): Vec2 | null {
  let best: Vec2 | null = null;
  let bestD = Infinity;
  const hunts = world.defs[e.type].cutsCable;
  for (const player of world.players) {
    if (player.hp <= 0) continue;
    if (hunts) {
      const cable = world.cableOf(player);
      for (let i = 1; i < cable.length; i++) {
        const q = closestPointOnSegment(e, cable[i - 1]!, cable[i]!);
        const d = distSq(q, e);
        if (d < bestD) {
          bestD = d;
          best = q;
        }
      }
      if (cable.length >= 2) continue;
    }
    const d = distSq(player, e);
    if (d < bestD) {
      bestD = d;
      best = player;
    }
  }
  if (hunts) e.state = best && world.players.some((p) => p.chain.nodes.length > 0) ? 'hunt' : 'seek';
  return best;
}

export function updateEnemies(world: World): void {
  const m = 0.2;
  for (const e of world.enemies) {
    const def = world.defs[e.type];
    const target = targetOf(world, e);
    let vx = 0;
    let vy = 0;
    if (target) {
      const dx = target.x - e.x;
      const dy = target.y - e.y;
      const d = Math.hypot(dx, dy);
      if (d > 1e-4) {
        vx = (dx / d) * def.speed;
        vy = (dy / d) * def.speed;
      }
    }
    // Séparation : les ennemis ne s'empilent pas, la horde garde une forme lisible.
    world.enemyHash.queryRadius(e.x, e.y, e.radius * 2, neighbors);
    for (const id of neighbors) {
      if (id === e.id) continue;
      const o = world.getEnemy(id);
      if (!o) continue;
      const dx = e.x - o.x;
      const dy = e.y - o.y;
      const minD = e.radius + o.radius;
      const d2 = dx * dx + dy * dy;
      if (d2 >= minD * minD) continue;
      const d = Math.sqrt(d2);
      if (d < 1e-6) {
        // Départage déterministe par id.
        vx += e.id < o.id ? -0.8 : 0.8;
        continue;
      }
      const push = ((minD - d) / minD) * 3;
      vx += (dx / d) * push;
      vy += (dy / d) * push;
    }
    const dt = 1 / world.t.tickRate;
    e.x = clamp(e.x + vx * dt, m, world.width - m);
    e.y = clamp(e.y + vy * dt, m, world.height - m);
  }
}
