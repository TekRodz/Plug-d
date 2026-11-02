import Phaser from 'phaser';
import { CSS, FONT_MONO, FONT_TITLE, PALETTE } from '../render/palette';
import { pie } from '../render/draw';
import type { World } from '../sim/world';
import type { Device } from '../input/input';

export interface Layout {
  /** Facteur px écran / px CSS. */
  u: number;
  W: number;
  H: number;
  hudH: number;
  /** px écran par case. */
  s: number;
  ox: number;
  oy: number;
  skillBtn: { x: number; y: number; r: number };
  pauseBtn: { x: number; y: number; r: number };
}

export function computeLayout(W: number, H: number, u: number, arenaW: number, arenaH: number): Layout {
  const hudH = 66 * u;
  const pad = 8 * u;
  const s = Math.min((W - 2 * pad) / arenaW, (H - hudH - 2 * pad) / arenaH);
  const ox = (W - arenaW * s) / 2;
  const oy = hudH + pad;
  const r = 34 * u;
  // Bouton de compétence : en bas à droite, sous l'arène quand il y a la place.
  const below = H - (oy + arenaH * s);
  const by = below > 2 * r + 16 * u ? oy + arenaH * s + below / 2 : H - 22 * u - r;
  return {
    u,
    W,
    H,
    hudH,
    s,
    ox,
    oy,
    skillBtn: { x: W - 22 * u - r, y: by, r },
    pauseBtn: { x: W - 30 * u, y: 24 * u, r: 22 * u },
  };
}

function text(scene: Phaser.Scene, size: number, color: string, family = FONT_MONO, bold = false): Phaser.GameObjects.Text {
  return scene.add
    .text(0, 0, '', { fontFamily: family, fontSize: `${Math.round(size)}px`, color, fontStyle: bold ? 'bold' : 'normal' })
    .setResolution(1);
}

/** Interface en jeu : PV, temps, ennemis grillés, jauge de câble, bouton Piquet, pause. */
export class Hud {
  private readonly g: Phaser.GameObjects.Graphics;
  private readonly hpText: Phaser.GameObjects.Text;
  private readonly timeText: Phaser.GameObjects.Text;
  private readonly killText: Phaser.GameObjects.Text;
  private readonly cableLabel: Phaser.GameObjects.Text;
  private readonly cableValue: Phaser.GameObjects.Text;
  private readonly skillLabel: Phaser.GameObjects.Text;
  private readonly skillTimer: Phaser.GameObjects.Text;
  private readonly hint: Phaser.GameObjects.Text;
  private sizedFor = 0;

  constructor(scene: Phaser.Scene) {
    this.g = scene.add.graphics().setDepth(100);
    this.hpText = text(scene, 12, CSS.line).setDepth(101);
    this.timeText = text(scene, 26, CSS.line, FONT_TITLE, true).setOrigin(0.5, 0.5).setDepth(101);
    this.killText = text(scene, 12, CSS.line).setOrigin(1, 0.5).setDepth(101);
    this.cableLabel = text(scene, 11, CSS.enemyStroke).setOrigin(0, 0.5).setDepth(101);
    this.cableValue = text(scene, 11, CSS.line).setOrigin(1, 0.5).setDepth(101);
    this.skillLabel = text(scene, 10, CSS.line, FONT_MONO, true).setOrigin(0.5, 0).setDepth(101);
    this.skillTimer = text(scene, 18, CSS.line, FONT_MONO, true).setOrigin(0.5, 0.5).setDepth(102);
    this.hint = text(scene, 14, CSS.line, FONT_MONO)
      .setStroke(CSS.blueprint, 6)
      .setOrigin(0.5, 1)
      .setAlign('center')
      .setDepth(101);
  }

  private resize(L: Layout): void {
    if (this.sizedFor === L.u * 10000 + L.W) return;
    this.sizedFor = L.u * 10000 + L.W;
    const fs = (t: Phaser.GameObjects.Text, px: number) => t.setFontSize(Math.round(px * L.u));
    fs(this.hpText, 12);
    fs(this.timeText, 28);
    fs(this.killText, 12);
    fs(this.cableLabel, 11);
    fs(this.cableValue, 11);
    fs(this.skillLabel, 10);
    fs(this.skillTimer, 18);
    fs(this.hint, 13);
    this.hint.setWordWrapWidth(Math.min(L.W - 40 * L.u, 420 * L.u));
  }

  setVisible(v: boolean): void {
    for (const o of [this.g, this.hpText, this.timeText, this.killText, this.cableLabel, this.cableValue, this.skillLabel, this.skillTimer, this.hint]) o.setVisible(v);
  }

  update(L: Layout, world: World, device: Device, hintText: string, hintAlpha: number, vt: number): void {
    this.resize(L);
    const g = this.g;
    const u = L.u;
    const player = world.players[0]!;
    g.clear();

    // Bandeau.
    g.fillStyle(PALETTE.blueprintDeep, 0.92);
    g.fillRect(0, 0, L.W, L.hudH);
    g.lineStyle(Math.max(1, u), PALETTE.gridMajor, 1);
    g.lineBetween(0, L.hudH, L.W, L.hudH);

    const row = 22 * u;
    const left = 16 * u;
    // PV.
    const hpW = Math.min(120 * u, L.W * 0.28);
    const hpRatio = player.hp / player.maxHp;
    this.hpText.setText(`PV ${Math.ceil(player.hp)}`).setPosition(left, row - 18 * u);
    g.lineStyle(Math.max(1, u), PALETTE.line, 0.8);
    g.strokeRect(left, row + 1 * u, hpW, 8 * u);
    g.fillStyle(hpRatio > 0.3 ? PALETTE.line : PALETTE.overheat, 1);
    g.fillRect(left + 2 * u, row + 3 * u, Math.max(0, (hpW - 4 * u) * hpRatio), 4 * u);

    // Temps restant.
    const tl = Math.ceil(world.timeLeftSec);
    this.timeText.setText(`${Math.floor(tl / 60)}:${String(tl % 60).padStart(2, '0')}`).setPosition(L.W / 2, row);
    this.timeText.setColor(tl <= 10 ? CSS.arc : CSS.line);

    // Grillés.
    this.killText.setText(`GRILLÉS ${world.stats.kills}`).setPosition(L.pauseBtn.x - L.pauseBtn.r - 10 * u, row);

    // Bouton pause (44 px CSS).
    const pb = L.pauseBtn;
    g.lineStyle(Math.max(1, 1.5 * u), PALETTE.line, 0.7);
    g.strokeCircle(pb.x, pb.y, pb.r * 0.75);
    g.fillStyle(PALETTE.line, 0.8);
    g.fillRect(pb.x - 5 * u, pb.y - 6 * u, 3 * u, 12 * u);
    g.fillRect(pb.x + 2 * u, pb.y - 6 * u, 3 * u, 12 * u);

    // Jauge de câble : vibre puis clignote à 80 % (comme le câble lui-même).
    const len = world.cableLengthOf(player);
    const max = player.chain.maxLength;
    const ratio = Math.min(1, len / max);
    const tense = ratio >= world.t.cable.tensionWarnRatio;
    const blink = tense && Math.floor(vt * 8) % 2 === 0;
    const gy = 50 * u;
    const gx0 = left + 54 * u;
    const gx1 = L.W - left - 64 * u;
    this.cableLabel.setText('CÂBLE').setPosition(left, gy);
    this.cableValue.setText(`${len.toFixed(1)} / ${max}`).setPosition(L.W - left, gy);
    this.cableValue.setColor(tense ? CSS.overheat : CSS.line);
    g.fillStyle(PALETTE.gridMinor, 1);
    g.fillRect(gx0, gy - 3 * u, gx1 - gx0, 6 * u);
    if (ratio > 0) {
      g.fillStyle(tense ? PALETTE.overheat : PALETTE.arc, blink ? 0.35 : 1);
      g.fillRect(gx0, gy - 3 * u, (gx1 - gx0) * ratio, 6 * u);
    }
    g.lineStyle(Math.max(1, u), PALETTE.line, 0.5);
    const warnX = gx0 + (gx1 - gx0) * world.t.cable.tensionWarnRatio;
    g.lineBetween(warnX, gy - 6 * u, warnX, gy + 6 * u);

    // Bouton Piquet.
    const b = L.skillBtn;
    const cdTicks = Math.max(0, player.skillReadyAt - world.tick);
    const cdTotal = world.secondsToTicks(world.t.stake.cooldownSec);
    const ready = cdTicks === 0;
    g.fillStyle(PALETTE.blueprintDeep, 0.85);
    g.fillCircle(b.x, b.y, b.r);
    g.lineStyle(Math.max(1.5, 2 * u), ready ? PALETTE.arc : PALETTE.enemyStroke, 1);
    g.strokeCircle(b.x, b.y, b.r);
    // Icône : borne temporaire (losange) plantée.
    const ic = b.r * 0.32;
    g.lineStyle(Math.max(1.5, 2 * u), ready ? PALETTE.arc : PALETTE.enemyStroke, 1);
    g.strokePoints(
      [
        { x: b.x, y: b.y - ic - 6 * u },
        { x: b.x + ic, y: b.y - 6 * u },
        { x: b.x, y: b.y + ic - 6 * u },
        { x: b.x - ic, y: b.y - 6 * u },
      ],
      true,
      true,
    );
    g.lineBetween(b.x, b.y + ic - 6 * u, b.x, b.y + ic + 2 * u);
    if (!ready) {
      g.fillStyle(PALETTE.blueprintDeep, 0.75);
      pie(g, b.x, b.y, b.r - 2 * u, cdTicks / cdTotal);
      this.skillTimer.setText((cdTicks / world.t.tickRate).toFixed(1)).setPosition(b.x, b.y - 4 * u).setVisible(true);
    } else {
      this.skillTimer.setVisible(false);
    }
    this.skillLabel
      .setText(device === 'keyboard' ? 'PIQUET · ESPACE' : 'PIQUET')
      .setPosition(b.x, b.y + b.r * 0.42)
      .setColor(ready ? CSS.arc : CSS.enemyStroke);

    // Aide contextuelle (onboarding léger).
    this.hint.setText(hintText).setAlpha(hintAlpha);
    const arenaBottom = L.oy + world.height * L.s;
    this.hint.setPosition(L.W / 2, Math.min(arenaBottom - 10 * u, L.H - 10 * u));
  }
}

/** Écrans plein cadre : titre, pause, fin d'arène. */
export class Overlay {
  private readonly bg: Phaser.GameObjects.Graphics;
  private readonly title: Phaser.GameObjects.Text;
  private readonly body: Phaser.GameObjects.Text;
  private readonly foot: Phaser.GameObjects.Text;

  constructor(scene: Phaser.Scene) {
    this.bg = scene.add.graphics().setDepth(200);
    this.title = text(scene, 56, CSS.arc, FONT_TITLE, true).setOrigin(0.5, 1).setDepth(201).setAlign('center');
    this.body = text(scene, 14, CSS.line).setOrigin(0.5, 0).setDepth(201).setAlign('center').setLineSpacing(6);
    this.foot = text(scene, 14, CSS.arc, FONT_MONO, true).setOrigin(0.5, 1).setDepth(201).setAlign('center');
  }

  hide(): void {
    for (const o of [this.bg, this.title, this.body, this.foot]) o.setVisible(false);
  }

  show(L: Layout, title: string, body: string, foot: string, titleColor: string = CSS.arc, vt = 0, align: 'center' | 'left' = 'center'): void {
    const u = L.u;
    for (const o of [this.bg, this.title, this.body, this.foot]) o.setVisible(true);
    this.bg.clear();
    this.bg.fillStyle(PALETTE.blueprintDeep, 0.88);
    this.bg.fillRect(0, 0, L.W, L.H);
    const titleSize = Math.min(64 * u, L.W / Math.max(4, title.length * 0.62));
    this.title.setText(title).setFontSize(Math.round(titleSize)).setColor(titleColor).setPosition(L.W / 2, L.H * 0.3);
    const wrap = Math.min(L.W - 48 * u, 460 * u);
    this.body
      .setText(body)
      .setAlign(align)
      .setFontSize(Math.round(13 * u))
      .setWordWrapWidth(wrap)
      .setPosition(L.W / 2, L.H * 0.3 + 18 * u);
    this.foot
      .setText(foot)
      .setFontSize(Math.round(15 * u))
      .setAlpha(0.65 + 0.35 * Math.sin(vt * 4))
      .setPosition(L.W / 2, L.H - 36 * u);
    // Cartouche de plan.
    this.bg.lineStyle(Math.max(1, u), PALETTE.gridMajor, 1);
    this.bg.strokeRect(12 * u, 12 * u, L.W - 24 * u, L.H - 24 * u);
  }
}
