/** Direction artistique « plan d'électricien » (valeurs provisoires du document de référence). */
export const PALETTE = {
  blueprint: 0x14315c,
  blueprintDeep: 0x0f2749,
  gridMinor: 0x1d3f6e,
  gridMajor: 0x2a5590,
  line: 0xe8f1fa,
  arc: 0xffd23f,
  overheat: 0xff6b35,
  enemyFill: 0x0b1b33,
  enemyStroke: 0x8fb3d9,
} as const;

export const CSS = {
  blueprint: '#14315C',
  line: '#E8F1FA',
  arc: '#FFD23F',
  overheat: '#FF6B35',
  enemyStroke: '#8FB3D9',
} as const;

export const FONT_MONO = '"JetBrains Mono", "IBM Plex Mono", ui-monospace, monospace';
export const FONT_TITLE = '"Barlow Condensed", "Arial Narrow", sans-serif';
