import { polylineLength, type Vec2 } from './geometry';
import type { Chain } from './types';

export type AttachResult =
  | { kind: 'attached' }
  /** Boucle fermée : ids des nœuds du polygone, dans l'ordre. La chaîne repart du nœud de fermeture. */
  | { kind: 'closed'; loop: number[] }
  | { kind: 'ignored' };

/**
 * Indice du nœud où l'on fermerait la boucle en repassant sur `nodeId`, ou -1.
 * La boucle contient les nœuds situés entre les deux passages (au moins `minLoop`).
 */
export function closingIndex(chain: Chain, nodeId: number, minLoop: number): number {
  const idx = chain.nodes.indexOf(nodeId);
  if (idx === -1) return -1;
  return chain.nodes.length - idx >= minLoop ? idx : -1;
}

/**
 * Passage du joueur sur une borne disponible.
 * - Borne hors chaîne : elle s'ajoute à la chaîne.
 * - Borne déjà dans la chaîne, avec assez de bornes depuis : fermeture.
 * - Sinon (dernière borne, boucle trop petite) : rien.
 */
export function attachToChain(chain: Chain, nodeId: number, minLoop: number): AttachResult {
  const idx = chain.nodes.indexOf(nodeId);
  if (idx === -1) {
    chain.nodes.push(nodeId);
    return { kind: 'attached' };
  }
  if (chain.nodes.length - idx < minLoop) return { kind: 'ignored' };
  const loop = chain.nodes.slice(idx);
  chain.nodes = [nodeId];
  return { kind: 'closed', loop };
}

/** Points du câble : bornes dans l'ordre, puis le joueur. */
export function cablePoints(nodes: readonly Vec2[], end: Vec2): Vec2[] {
  return nodes.length === 0 ? [] : [...nodes, end];
}

export function cableLength(nodes: readonly Vec2[], end: Vec2): number {
  return polylineLength(cablePoints(nodes, end));
}

/** Retire un nœud disparu (piquet expiré) ; le câble se reconnecte entre ses voisins. */
export function removeNode(chain: Chain, nodeId: number): boolean {
  const before = chain.nodes.length;
  chain.nodes = chain.nodes.filter((id) => id !== nodeId);
  return chain.nodes.length !== before;
}
