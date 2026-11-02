import Phaser from 'phaser';
import { GameScene } from './render/GameScene';

/** Rendu net sur écrans haute densité : le canvas est en px physiques, affiché à 1/dpr. */
const dpr = Math.min(window.devicePixelRatio || 1, 2);
const size = () => ({ w: Math.round(window.innerWidth * dpr), h: Math.round(window.innerHeight * dpr) });
const { w, h } = size();

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
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
