import defaults from './tuning.json';

/**
 * Réglages d'équilibrage. Les valeurs vivent dans tuning.json : on les modifie
 * sans toucher au code. Unités : cases, secondes, points de vie.
 */
export type Tuning = typeof defaults;

export const DEFAULT_TUNING: Tuning = defaults;

/** Copie profonde, pour qu'un test ou un mode de jeu puisse modifier ses réglages sans effet de bord. */
export function cloneTuning(overrides?: (t: Tuning) => void): Tuning {
  const t = structuredClone(DEFAULT_TUNING);
  overrides?.(t);
  return t;
}
