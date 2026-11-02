/**
 * PRNG seedé (mulberry32). Toute la simulation tire ses nombres d'ici :
 * c'est la condition du défi quotidien équitable et de la coop en ligne.
 * Ne jamais utiliser Math.random() dans src/sim.
 */
export class Rng {
  private s: number;

  constructor(seed: number) {
    this.s = seed >>> 0;
  }

  /** Flottant uniforme dans [0, 1). */
  next(): number {
    this.s = (this.s + 0x6d2b79f5) >>> 0;
    let t = this.s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Flottant uniforme dans [min, max). */
  range(min: number, max: number): number {
    return min + (max - min) * this.next();
  }

  /** Entier uniforme dans [min, maxExclusive). */
  int(min: number, maxExclusive: number): number {
    return min + Math.floor((maxExclusive - min) * this.next());
  }

  chance(p: number): boolean {
    return this.next() < p;
  }

  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick sur une liste vide');
    return items[this.int(0, items.length)]!;
  }

  /** Sous-générateur indépendant (pour isoler arène, vagues, offres…). */
  fork(): Rng {
    return new Rng(Math.floor(this.next() * 4294967296));
  }

  get state(): number {
    return this.s;
  }

  set state(value: number) {
    this.s = value >>> 0;
  }
}

/** Hache une chaîne (ex. « 2026-11-02 » pour le défi quotidien) en seed 32 bits (FNV-1a). */
export function hashSeed(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}
