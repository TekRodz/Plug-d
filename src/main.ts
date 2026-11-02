import Phaser from 'phaser';
import { GameScene } from './render/GameScene';

/** Rendu net sur écrans haute densité : le canvas est en px physiques, affiché à 1/dpr. */
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const parent = document.getElementById('game') ?? document.body;
/** Taille du conteneur (respecte les zones sûres), à défaut celle de la fenêtre. */
const size = () => {
  const r = parent.getBoundingClientRect();
  const cw = r.width || window.innerWidth;
  const ch = r.height || window.innerHeight;
  return { w: Math.round(cw * dpr), h: Math.round(ch * dpr) };
};
const { w, h } = size();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent,
  backgroundColor: '#14315C',
  scale: { mode: Phaser.Scale.NONE, width: w, height: h, zoom: 1 / dpr },
  render: { antialias: true, roundPixels: false },
  input: { keyboard: false, mouse: false, touch: false, gamepad: false },
  disableContextMenu: true,
  banner: false,
  scene: [GameScene],
});

window.addEventListener('resize', () => {
  const s = size();
  game.scale.resize(s.w, s.h);
  game.scale.setZoom(1 / dpr);
});
