import { clamp } from '../geometry';
import type { Player, PlayerInput } from '../types';
import type { World } from '../world';

export function movePlayer(world: World, player: Player, input: PlayerInput): void {
  if (player.hp <= 0) return;
  let mx = input.moveX;
  let my = input.moveY;
  const mag = Math.hypot(mx, my);
  if (mag > 1) {
    mx /= mag;
    my /= mag;
  }
  if (mag > 0.05) {
    player.facingX = mx / Math.max(mag, 1e-6);
    player.facingY = my / Math.max(mag, 1e-6);
  }
  const step = world.t.player.speed / world.t.tickRate;
  const m = world.t.arena.wallMargin;
  player.x = clamp(player.x + mx * step, m, world.width - m);
  player.y = clamp(player.y + my * step, m, world.height - m);
}
