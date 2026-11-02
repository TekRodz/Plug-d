import type { Rng } from '../rng';
import type { Tuning } from '../tuning';
import type { EnemyType } from '../types';

export interface SpawnRequest {
  type: EnemyType;
  /** Côté d'apparition imposé (rafale) : 0 haut, 1 droite, 2 bas, 3 gauche. */
  side?: number;
}

/**
 * Planificateur de vagues, déterministe pour une seed donnée.
 * L'intervalle entre deux apparitions décroît au fil de l'arène ; une rafale arrive périodiquement.
 */
export class WaveDirector {
  private nextSpawnTick: number;
  private nextBurstTick: number;

  constructor(
    private readonly rng: Rng,
    private readonly t: Tuning,
  ) {
    this.nextSpawnTick = Math.round(1.5 * t.tickRate);
    this.nextBurstTick = Math.round(t.waves.burstEverySec * t.tickRate);
  }

  /** Progression 0 → 1 sur la durée de l'arène. */
  private progress(tick: number): number {
    return Math.min(1, tick / (this.t.arena.durationSec * this.t.tickRate));
  }

  private pickType(tick: number): EnemyType {
    const w = this.t.waves;
    if (tick >= w.cutterFromSec * this.t.tickRate && this.rng.chance(w.cutterChance)) return 'cutter';
    return 'crawler';
  }

  update(tick: number, aliveCount: number): SpawnRequest[] {
    const out: SpawnRequest[] = [];
    const w = this.t.waves;
    if (aliveCount >= w.maxEnemies) return out;
    if (tick >= this.nextSpawnTick) {
      out.push({ type: this.pickType(tick) });
      const p = this.progress(tick);
      const eased = p * p * (3 - 2 * p);
      const interval = w.startIntervalSec + (w.endIntervalSec - w.startIntervalSec) * eased;
      this.nextSpawnTick = tick + Math.max(1, Math.round(interval * this.t.tickRate * this.rng.range(0.7, 1.3)));
    }
    if (tick >= this.nextBurstTick) {
      const side = this.rng.int(0, 4);
      const size = w.burstSize + Math.floor(this.progress(tick) * w.burstSize);
      for (let i = 0; i < size; i++) out.push({ type: this.pickType(tick), side });
      this.nextBurstTick = tick + Math.round(w.burstEverySec * this.t.tickRate);
    }
    return out.slice(0, w.maxEnemies - aliveCount);
  }
}
