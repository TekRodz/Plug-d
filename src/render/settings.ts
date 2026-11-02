/**
 * Options d'accessibilité et de partie, lues dans l'URL pour le prototype :
 *   ?seed=1234   ?arena=grid|circle|corridors|islands   ?speed=0.8   ?fx=low   ?preview=always
 */
import { ARENA_TEMPLATES, type ArenaTemplate } from '../sim/content/arenas';

export interface Settings {
  seed: number | null;
  template: ArenaTemplate | undefined;
  gameSpeed: number;
  reduceFx: boolean;
  alwaysPreview: boolean;
  muted: boolean;
}

export function readSettings(search: string = typeof location !== 'undefined' ? location.search : ''): Settings {
  const q = new URLSearchParams(search);
  const seedRaw = q.get('seed');
  const arena = q.get('arena') as ArenaTemplate | null;
  const speed = Number(q.get('speed') ?? '1');
  return {
    seed: seedRaw !== null && /^\d+$/.test(seedRaw) ? Number(seedRaw) >>> 0 : null,
    template: arena && ARENA_TEMPLATES.includes(arena) ? arena : undefined,
    gameSpeed: Number.isFinite(speed) && speed > 0.2 && speed <= 2 ? speed : 1,
    reduceFx: q.get('fx') === 'low',
    alwaysPreview: q.get('preview') === 'always',
    muted: q.get('sound') === 'off',
  };
}
