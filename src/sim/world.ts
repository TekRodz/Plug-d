import { attachToChain, cableLength, cablePoints, closingIndex, removeNode } from './chain';
import { createDischarge } from './discharge';
import { bounds, dist, distPointSegmentSq, pointInPolygon, type Vec2 } from './geometry';
import { Rng } from './rng';
import { DEFAULT_TUNING, type Tuning } from './tuning';
import { generateArena, type ArenaTemplate } from './content/arenas';
import { enemyDefs, type EnemyDef } from './content/enemies';
import { SpatialHash } from './systems/spatialHash';
import { WaveDirector } from './systems/waves';
import { updateEnemies } from './systems/ai';
import { movePlayer } from './systems/movement';
import { updateCooldowns } from './systems/cooldowns';
import type {
  ArenaStatus,
  Discharge,
  Enemy,
  EnemyType,
  Player,
  PlayerId,
  PlayerInput,
  Pylon,
  SimEvent,
} from './types';

export interface WorldOptions {
  seed: number;
  tuning?: Tuning;
  template?: ArenaTemplate;
  /** Remplace la génération d'arène (tests, tutoriels). */
  pylons?: Vec2[];
  playerSpawn?: Vec2;
  /** Désactive les vagues (tests, tutoriels). */
  waves?: boolean;
}

export interface WorldStats {
  kills: number;
  discharges: number;
  totalDamage: number;
  bestDischarge: number;
  chainsBroken: number;
}

export interface ClosurePreview {
  pylonId: number;
  polygon: Vec2[];
  area: number;
  intensity: number;
}

/**
 * Simulation d'une arène. Logique pure, pas de Phaser : le rendu lit l'état et les événements.
 * Pas de temps fixe (tuning.tickRate). Toute l'aléa passe par des Rng seedés.
 */
export class World {
  readonly t: Tuning;
  readonly seed: number;
  readonly template: ArenaTemplate | 'custom';
  readonly width: number;
  readonly height: number;
  readonly defs: Record<EnemyType, EnemyDef>;

  tick = 0;
  status: ArenaStatus = 'playing';
  pylons: Pylon[] = [];
  enemies: Enemy[] = [];
  players: Player[] = [];
  events: SimEvent[] = [];
  /** Décharges récentes (pour le rendu). */
  lastDischarges: Discharge[] = [];
  readonly stats: WorldStats = { kills: 0, discharges: 0, totalDamage: 0, bestDischarge: 0, chainsBroken: 0 };

  readonly enemyHash = new SpatialHash(1);
  private readonly pylonById = new Map<number, Pylon>();
  private readonly enemyById = new Map<number, Enemy>();
  private nextId = 1;
  /** Aléa des vagues et du comportement ennemi, séparé de celui de l'arène. */
  readonly rng: Rng;
  private readonly waves: WaveDirector | null;
  private readonly scratch: number[] = [];

  constructor(opts: WorldOptions) {
    this.t = opts.tuning ?? DEFAULT_TUNING;
    this.seed = opts.seed >>> 0;
    this.width = this.t.arena.width;
    this.height = this.t.arena.height;
    this.defs = enemyDefs(this.t);

    const root = new Rng(this.seed);
    const arenaRng = root.fork();
    this.rng = root.fork();

    let spawn: Vec2;
    if (opts.pylons) {
      this.template = 'custom';
      for (const p of opts.pylons) this.addPylon(p.x, p.y, 'fixed');
      spawn = opts.playerSpawn ?? { x: this.width / 2, y: this.height / 2 };
    } else {
      const layout = generateArena(arenaRng, this.width, this.height, opts.template);
      this.template = layout.template;
      for (const p of layout.pylons) this.addPylon(p.x, p.y, 'fixed');
      spawn = opts.playerSpawn ?? layout.spawn;
    }

    this.players.push(this.createPlayer(spawn));
    this.waves = opts.waves === false ? null : new WaveDirector(this.rng.fork(), this.t);
  }

  // ───────────────────────────── Accès ─────────────────────────────

  secondsToTicks(sec: number): number {
    return Math.round(sec * this.t.tickRate);
  }

  get timeLeftSec(): number {
    return Math.max(0, this.t.arena.durationSec - this.tick / this.t.tickRate);
  }

  getPylon(id: number): Pylon | undefined {
    return this.pylonById.get(id);
  }

  getEnemy(id: number): Enemy | undefined {
    return this.enemyById.get(id);
  }

  isPylonAvailable(p: Pylon): boolean {
    return this.tick >= p.cooldownUntil;
  }

  /** Positions des nœuds de la chaîne d'un joueur. */
  chainNodePositions(player: Player): Vec2[] {
    const out: Vec2[] = [];
    for (const id of player.chain.nodes) {
      const p = this.pylonById.get(id);
      if (p) out.push(p);
    }
    return out;
  }

  /** Câble complet : bornes puis joueur. */
  cableOf(player: Player): Vec2[] {
    return cablePoints(this.chainNodePositions(player), player);
  }

  cableLengthOf(player: Player): number {
    return cableLength(this.chainNodePositions(player), player);
  }

  /**
   * Aperçu de fermeture : la borne de la chaîne la plus proche qui fermerait une boucle.
   * `radius` = Infinity pour l'option d'accessibilité « aperçu toujours visible ».
   */
  closurePreview(player: Player, radius: number): ClosurePreview | null {
    const nodes = player.chain.nodes;
    let best: ClosurePreview | null = null;
    let bestD = radius;
    for (const id of nodes) {
      const pylon = this.pylonById.get(id);
      if (!pylon || !this.isPylonAvailable(pylon)) continue;
      const idx = closingIndex(player.chain, id, this.t.pylon.minLoopPylons);
      if (idx < 0) continue;
      const d = dist(pylon, player);
      if (d > bestD) continue;
      const polygon: Vec2[] = [];
      for (const nid of nodes.slice(idx)) {
        const n = this.pylonById.get(nid);
        if (n) polygon.push({ x: n.x, y: n.y });
      }
      const dis = createDischarge(player.id, [], polygon, this.tick, this.t.discharge);
      best = { pylonId: id, polygon, area: dis.area, intensity: dis.intensity };
      bestD = d;
    }
    return best;
  }

  // ───────────────────────────── Création ─────────────────────────────

  private createPlayer(spawn: Vec2): Player {
    const id = this.nextId++;
    return {
      id,
      x: spawn.x,
      y: spawn.y,
      hp: this.t.player.maxHp,
      maxHp: this.t.player.maxHp,
      invulnUntil: 0,
      skillReadyAt: 0,
      chain: { ownerId: id, nodes: [], maxLength: this.t.cable.maxLength },
      touching: [],
      facingX: 0,
      facingY: -1,
    };
  }

  addPylon(x: number, y: number, kind: Pylon['kind'], expiresAt?: number): Pylon {
    const p: Pylon = { id: this.nextId++, x, y, cooldownUntil: 0, kind };
    if (expiresAt !== undefined) p.expiresAt = expiresAt;
    this.pylons.push(p);
    this.pylonById.set(p.id, p);
    return p;
  }

  removePylon(id: number): void {
    const p = this.pylonById.get(id);
    if (!p) return;
    this.pylonById.delete(id);
    this.pylons = this.pylons.filter((q) => q.id !== id);
    for (const pl of this.players) {
      removeNode(pl.chain, id);
      pl.touching = pl.touching.filter((tid) => tid !== id);
    }
  }

  spawnEnemy(type: EnemyType, x: number, y: number): Enemy {
    const def = this.defs[type];
    const e: Enemy = {
      id: this.nextId++,
      type,
      x,
      y,
      hp: def.hp,
      maxHp: def.hp,
      radius: def.radius,
      state: type === 'cutter' ? 'hunt' : 'seek',
      shapeSeed: Math.floor(this.rng.next() * 1e9),
      hitUntil: 0,
      spawnTick: this.tick,
    };
    this.enemies.push(e);
    this.enemyById.set(e.id, e);
    this.events.push({ type: 'enemySpawned', enemyId: e.id });
    return e;
  }

  private killEnemy(e: Enemy): void {
    this.enemyById.delete(e.id);
    this.stats.kills++;
    this.events.push({ type: 'enemyKilled', enemyId: e.id, enemyType: e.type, x: e.x, y: e.y });
  }

  // ───────────────────────────── Boucle ─────────────────────────────

  /** Avance la simulation d'un tick. `inputs[i]` pilote `players[i]`. */
  step(inputs: readonly PlayerInput[]): void {
    this.events = [];
    if (this.status !== 'playing') return;
    this.tick++;

    updateCooldowns(this);
    this.rebuildEnemyHash();

    this.players.forEach((player, i) => {
      const input = inputs[i];
      if (input) this.applyPlayerInput(player, input);
      this.updatePylonContacts(player);
      this.checkCableLength(player);
    });

    // Retirer les ennemis tués par les décharges avant qu'ils n'agissent.
    this.enemies = this.enemies.filter((e) => this.enemyById.has(e.id));

    updateEnemies(this);
    this.checkCableCuts();
    this.checkPlayerContacts();
    this.spawnWaves();

    this.lastDischarges = this.lastDischarges.filter((d) => this.tick - d.tick < this.t.tickRate);

    if (this.players.every((p) => p.hp <= 0)) {
      this.status = 'lost';
      this.events.push({ type: 'arenaEnd', result: 'lost' });
    } else if (this.tick >= this.secondsToTicks(this.t.arena.durationSec)) {
      this.status = 'won';
      this.events.push({ type: 'arenaEnd', result: 'won' });
    }
  }

  private rebuildEnemyHash(): void {
    this.enemyHash.clear();
    for (const e of this.enemies) this.enemyHash.insert(e.id, e.x, e.y);
  }

  private applyPlayerInput(player: Player, input: PlayerInput): void {
    if (input.drop && player.chain.nodes.length > 0) {
      player.chain.nodes = [];
      this.events.push({ type: 'chainDropped', playerId: player.id });
    }
    movePlayer(this, player, input);
    if (input.skill && this.tick >= player.skillReadyAt) {
      const stake = this.addPylon(player.x, player.y, 'stake', this.tick + this.secondsToTicks(this.t.stake.lifetimeSec));
      player.skillReadyAt = this.tick + this.secondsToTicks(this.t.stake.cooldownSec);
      this.events.push({ type: 'stakePlaced', playerId: player.id, pylonId: stake.id });
    }
  }

  /** Accroche / ferme à l'entrée dans le rayon de capture d'une borne. */
  private updatePylonContacts(player: Player): void {
    const r = this.t.pylon.captureRadius;
    const now: number[] = [];
    const entered: Pylon[] = [];
    for (const p of this.pylons) {
      if (dist(p, player) <= r) {
        now.push(p.id);
        if (!player.touching.includes(p.id)) entered.push(p);
      }
    }
    player.touching = now;
    entered.sort((a, b) => dist(a, player) - dist(b, player));
    for (const pylon of entered) {
      if (!this.isPylonAvailable(pylon)) continue;
      const res = attachToChain(player.chain, pylon.id, this.t.pylon.minLoopPylons);
      if (res.kind === 'attached') {
        this.events.push({ type: 'attach', playerId: player.id, pylonId: pylon.id });
      } else if (res.kind === 'closed') {
        this.discharge(player.id, res.loop);
      }
    }
  }

  private discharge(ownerId: PlayerId, loop: number[]): Discharge {
    const polygon: Vec2[] = [];
    for (const id of loop) {
      const p = this.pylonById.get(id);
      if (p) polygon.push({ x: p.x, y: p.y });
    }
    const d = createDischarge(ownerId, loop, polygon, this.tick, this.t.discharge);
    const dmg = d.intensity;

    // Ennemis à l'intérieur (pair-impair) : le joueur et ses alliés ne sont jamais touchés.
    const b = bounds(polygon);
    const ids = this.enemyHash.queryRect(b.minX, b.minY, b.maxX, b.maxY, this.scratch);
    for (const id of ids) {
      const e = this.enemyById.get(id);
      if (!e || e.hp <= 0) continue;
      if (!pointInPolygon(e, polygon)) continue;
      const dealt = Math.min(e.hp, dmg);
      e.hp -= dmg;
      e.hitUntil = this.tick + 6;
      d.hits++;
      d.totalDamage += dealt;
      if (e.hp <= 0) {
        d.kills++;
        this.killEnemy(e);
      }
    }

    // Refroidissement : chaque borne du polygone surchauffe.
    const cd = this.secondsToTicks(this.t.pylon.cooldownSec);
    for (const id of loop) {
      const p = this.pylonById.get(id);
      if (p && p.kind !== 'player') p.cooldownUntil = this.tick + cd;
    }

    this.stats.discharges++;
    this.stats.totalDamage += d.totalDamage;
    this.stats.bestDischarge = Math.max(this.stats.bestDischarge, d.totalDamage);
    this.lastDischarges.push(d);
    this.events.push({ type: 'discharge', discharge: d });
    return d;
  }

  private breakChain(player: Player, reason: 'length' | 'cut', at: Vec2): void {
    const meaningful = player.chain.nodes.length >= 2;
    player.chain.nodes = [];
    if (meaningful) {
      this.stats.chainsBroken++;
      this.events.push({ type: 'chainBroken', playerId: player.id, reason, x: at.x, y: at.y });
    }
  }

  private checkCableLength(player: Player): void {
    if (player.chain.nodes.length === 0) return;
    if (this.cableLengthOf(player) > player.chain.maxLength) this.breakChain(player, 'length', player);
  }

  /** Câble exposé : les Coupe-fils le tranchent au contact. */
  private checkCableCuts(): void {
    for (const player of this.players) {
      const cable = this.cableOf(player);
      if (cable.length < 2) continue;
      const b = bounds(cable);
      const ids = this.enemyHash.queryRect(b.minX - 1, b.minY - 1, b.maxX + 1, b.maxY + 1, this.scratch);
      let cutAt: Vec2 | null = null;
      for (const id of ids) {
        const e = this.enemyById.get(id);
        if (!e || !this.defs[e.type].cutsCable) continue;
        for (let i = 1; i < cable.length && !cutAt; i++) {
          const a = cable[i - 1]!;
          const c = cable[i]!;
          if (distPointSegmentSq(e, a, c) <= e.radius * e.radius) cutAt = { x: e.x, y: e.y };
        }
        if (cutAt) break;
      }
      if (cutAt) this.breakChain(player, 'cut', cutAt);
    }
  }

  private checkPlayerContacts(): void {
    const pr = this.t.player.radius;
    for (const player of this.players) {
      if (player.hp <= 0) continue;
      const ids = this.enemyHash.queryRadius(player.x, player.y, pr + 1, this.scratch);
      for (const id of ids) {
        const e = this.enemyById.get(id);
        if (!e) continue;
        if (dist(e, player) > e.radius + pr) continue;
        if (this.tick < player.invulnUntil) break;
        const dmg = this.defs[e.type].contactDamage;
        player.hp = Math.max(0, player.hp - dmg);
        player.invulnUntil = this.tick + this.secondsToTicks(this.t.player.invulnSec);
        this.events.push({ type: 'playerHit', playerId: player.id, damage: dmg });
        // L'ennemi recule un peu pour laisser une chance de s'échapper.
        const d = Math.max(0.001, dist(e, player));
        e.x += ((e.x - player.x) / d) * 0.8;
        e.y += ((e.y - player.y) / d) * 0.8;
        break;
      }
    }
  }

  private spawnWaves(): void {
    if (!this.waves) return;
    const reqs = this.waves.update(this.tick, this.enemies.length);
    for (const req of reqs) {
      const pos = this.pickSpawnPoint(req.side);
      this.spawnEnemy(req.type, pos.x, pos.y);
    }
  }

  private pickSpawnPoint(side?: number): Vec2 {
    const w = this.width;
    const h = this.height;
    const m = 0.3;
    let best: Vec2 = { x: m, y: m };
    for (let attempt = 0; attempt < 8; attempt++) {
      const s = side ?? this.rng.int(0, 4);
      const u = this.rng.next();
      const p =
        s === 0 ? { x: m + u * (w - 2 * m), y: m }
        : s === 1 ? { x: w - m, y: m + u * (h - 2 * m) }
        : s === 2 ? { x: m + u * (w - 2 * m), y: h - m }
        : { x: m, y: m + u * (h - 2 * m) };
      best = p;
      if (this.players.every((pl) => dist(pl, p) >= this.t.waves.minSpawnDistance)) break;
    }
    return best;
  }

  /** Empreinte de l'état (tests de déterminisme). */
  fingerprint(): string {
    const r = (v: number) => v.toFixed(6);
    const parts: string[] = [`t${this.tick}`, this.status];
    for (const p of this.players) parts.push(`P${r(p.x)},${r(p.y)},${p.hp},[${p.chain.nodes.join(',')}]`);
    for (const p of this.pylons) parts.push(`B${p.id}:${r(p.x)},${r(p.y)},${p.cooldownUntil}`);
    for (const e of this.enemies) parts.push(`E${e.id}${e.type}:${r(e.x)},${r(e.y)},${e.hp}`);
    return parts.join('|');
  }
}
