import type { World } from '../world';

/** Fin de surchauffe des bornes et disparition des piquets. */
export function updateCooldowns(world: World): void {
  const expired: number[] = [];
  for (const p of world.pylons) {
    if (p.cooldownUntil === world.tick) world.events.push({ type: 'pylonReady', pylonId: p.id });
    if (p.expiresAt !== undefined && world.tick >= p.expiresAt) expired.push(p.id);
  }
  for (const id of expired) {
    const p = world.getPylon(id);
    if (!p) continue;
    world.removePylon(id);
    world.events.push({ type: 'stakeExpired', pylonId: id, x: p.x, y: p.y });
  }
}
