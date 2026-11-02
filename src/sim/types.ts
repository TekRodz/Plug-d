import type { Vec2 } from './geometry';

export type PlayerId = number;

export type PylonKind = 'fixed' | 'stake' | 'player';

export interface Pylon {
  id: number;
  x: number;
  y: number;
  /** Tick jusqu'auquel la borne est en surchauffe (inutilisable). */
  cooldownUntil: number;
  kind: PylonKind;
  /** Piquet : tick de disparition. */
  expiresAt?: number;
}

export interface Chain {
  ownerId: PlayerId;
  /** Ids de bornes (ou de joueurs en coop), dans l'ordre d'accroche. */
  nodes: number[];
  maxLength: number;
}

export interface Discharge {
  ownerId: PlayerId;
  /** Ids des bornes formant la boucle, dans l'ordre. */
  pylonIds: number[];
  polygon: Vec2[];
  area: number;
  intensity: number;
  tick: number;
  center: Vec2;
  hits: number;
  kills: number;
  totalDamage: number;
}

export type EnemyType = 'crawler' | 'cutter';

export interface Enemy {
  id: number;
  type: EnemyType;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  radius: number;
  /** 'seek' (vers un joueur) ou 'hunt' (vers le câble). */
  state: string;
  /** Graine visuelle pour la forme organique (déterministe). */
  shapeSeed: number;
  hitUntil: number;
  spawnTick: number;
}

export interface Player {
  id: PlayerId;
  x: number;
  y: number;
  hp: number;
  maxHp: number;
  invulnUntil: number;
  skillReadyAt: number;
  chain: Chain;
  /** Bornes actuellement sous le joueur (pour ne déclencher qu'à l'entrée). */
  touching: number[];
  facingX: number;
  facingY: number;
}

export interface PlayerInput {
  /** Direction de déplacement, norme ≤ 1. */
  moveX: number;
  moveY: number;
  /** Compétence (Piquet) : vrai sur le tick où elle est demandée. */
  skill: boolean;
  /** Abandonner la chaîne. */
  drop: boolean;
}

export const IDLE_INPUT: PlayerInput = Object.freeze({ moveX: 0, moveY: 0, skill: false, drop: false });

export type SimEvent =
  | { type: 'attach'; playerId: PlayerId; pylonId: number }
  | { type: 'discharge'; discharge: Discharge }
  | { type: 'chainBroken'; playerId: PlayerId; reason: 'length' | 'cut'; x: number; y: number }
  | { type: 'chainDropped'; playerId: PlayerId }
  | { type: 'stakePlaced'; playerId: PlayerId; pylonId: number }
  | { type: 'stakeExpired'; pylonId: number; x: number; y: number }
  | { type: 'pylonReady'; pylonId: number }
  | { type: 'enemySpawned'; enemyId: number }
  | { type: 'enemyKilled'; enemyId: number; enemyType: EnemyType; x: number; y: number }
  | { type: 'playerHit'; playerId: PlayerId; damage: number }
  | { type: 'arenaEnd'; result: 'won' | 'lost' };

export type ArenaStatus = 'playing' | 'won' | 'lost';
