import type { Tuning } from '../tuning';
import type { EnemyType } from '../types';

export interface EnemyDef {
  type: EnemyType;
  /** Nom affiché. */
  name: string;
  hp: number;
  speed: number;
  radius: number;
  contactDamage: number;
  /** Coupe le câble actif au contact. */
  cutsCable: boolean;
}

export function enemyDefs(t: Tuning): Record<EnemyType, EnemyDef> {
  return {
    crawler: { type: 'crawler', name: 'Rampant', ...t.enemies.crawler, cutsCable: false },
    cutter: { type: 'cutter', name: 'Coupe-fil', ...t.enemies.cutter, cutsCable: true },
  };
}
