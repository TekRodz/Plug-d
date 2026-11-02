import Phaser from 'phaser';
import { World, type ClosurePreview } from '../sim/world';
import { TEMPLATE_NAMES } from '../sim/content/arenas';
import { vertexCentroid, type Vec2 } from '../sim/geometry';
import type { Discharge, PlayerInput, SimEvent } from '../sim/types';
import { InputManager } from '../input/input';
import { Hud, Overlay, computeLayout, type Layout } from '../ui/hud';
import { CSS, FONT_MONO, FONT_TITLE, PALETTE } from './palette';
import { Sfx } from './audio';
import { dashedPolygon, enemyShape, hatchSquare, lightning, polyline, resistorGlyph, vibrate } from './draw';
import { readSettings, type Settings } from './settings';

type Mode = 'title' | 'playing' | 'paused' | 'ended';

interface Fx {
  kind: 'discharge' | 'kill' | 'break' | 'stake' | 'hit';
  t0: number;
  dur: number;
  pos: Vec2;
  discharge?: Discharge;
  color?: number;
}

const ONBOARDING = [
  'Passe sur les bornes ▢ : le câble suit.\nReviens sur une borne de ta chaîne pour fermer la boucle.',
  'Petite boucle = gros dégâts.\nGrande boucle = on ratisse large, mais le câble reste exposé.',
];

/**
 * Scène unique du prototype « une arène ». Elle ne contient aucune règle :
 * elle lit l'état de World, dessine et transmet les entrées.
 */
export class GameScene extends Phaser.Scene {
  private settings!: Settings;
  private world!: World;
  private inputMgr!: InputManager;
  private sfx!: Sfx;
  private hud!: Hud;
  private overlay!: Overlay;
  private bg!: Phaser.GameObjects.Graphics;
  private g!: Phaser.GameObjects.Graphics;
  private top!: Phaser.GameObjects.Graphics;
  private layout!: Layout;
  private mode: Mode = 'title';
  private acc = 0;
  /** Horloge visuelle (s), gelée en pause. */
  private vt = 0;
  private fx: Fx[] = [];
  private pylonTexts = new Map<number, Phaser.GameObjects.Text>();
  private previewText!: Phaser.GameObjects.Text;
  private hitFlashUntil = 0;
  private firstDischargeAt = -1;
  private lastBgKey = '';

  constructor() {
    super('game');
  }

  create(): void {
    this.settings = readSettings();
    this.sfx = new Sfx(this.settings.muted);
    this.bg = this.add.graphics().setDepth(0);
    this.g = this.add.graphics().setDepth(10);
    this.top = this.add.graphics().setDepth(50);
    this.previewText = this.add
      .text(0, 0, '', { fontFamily: FONT_MONO, fontSize: '14px', color: CSS.arc, fontStyle: 'bold' })
      .setOrigin(0.5)
      .setDepth(40)
      .setResolution(1);
    this.hud = new Hud(this);
    this.overlay = new Overlay(this);

    this.inputMgr = new InputManager(this.game.canvas, {
      hitSkillButton: (x, y) => this.mode === 'playing' && this.hit(this.layout.skillBtn, x, y),
      hitPauseButton: (x, y) => (this.mode === 'playing' || this.mode === 'paused') && this.hit(this.layout.pauseBtn, x, y),
      onPause: () => this.togglePause(),
      onConfirm: () => this.confirm(),
      onFirstGesture: () => this.sfx.unlock(),
    });
    window.addEventListener('keydown', this.onReplayKey);
    document.addEventListener('visibilitychange', this.onVisibility);
    window.addEventListener('blur', this.onBlur);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.inputMgr.destroy();
      window.removeEventListener('keydown', this.onReplayKey);
      document.removeEventListener('visibilitychange', this.onVisibility);
      window.removeEventListener('blur', this.onBlur);
    });

    this.newWorld(this.settings.seed ?? randomSeed());
    this.mode = 'title';
    // Accès de débogage depuis la console : plugd.world
    const scene = this;
    (window as unknown as { plugd: unknown }).plugd = {
      scene,
      get world() {
        return scene.world;
      },
    };
  }

  // ───────────────────────────── États ─────────────────────────────

  private newWorld(seed: number): void {
    this.world = new World({ seed, template: this.settings.template });
    this.fx = [];
    this.acc = 0;
    this.firstDischargeAt = -1;
    for (const t of this.pylonTexts.values()) t.destroy();
    this.pylonTexts.clear();
    this.lastBgKey = '';
  }

  private hit(btn: { x: number; y: number; r: number }, cssX: number, cssY: number): boolean {
    const u = this.layout.u;
    // Zone tactile ≥ 44 px CSS.
    const r = Math.max(btn.r, 22 * u);
    return Math.hypot(cssX * u - btn.x, cssY * u - btn.y) <= r;
  }

  private confirm(): void {
    if (this.mode === 'title') {
      this.mode = 'playing';
      this.inputMgr.flush();
    } else if (this.mode === 'paused') {
      this.togglePause();
    } else if (this.mode === 'ended' && this.vt - this.endedAt > 0.6) {
      this.newWorld(randomSeed());
      this.mode = 'playing';
      this.inputMgr.flush();
    }
  }

  private endedAt = 0;

  private onReplayKey = (e: KeyboardEvent): void => {
    if (this.mode === 'ended' && e.code === 'KeyR' && this.vt - this.endedAt > 0.6) {
      this.newWorld(this.world.seed);
      this.mode = 'playing';
      this.inputMgr.flush();
    }
  };

  private togglePause(): void {
    if (this.mode === 'playing') {
      this.mode = 'paused';
      this.tweens.pauseAll();
      this.sfx.hum(0);
    } else if (this.mode === 'paused') {
      this.mode = 'playing';
      this.tweens.resumeAll();
      this.inputMgr.flush();
    }
  }

  /** Mise en veille des onglets mobiles : pause automatique en solo. */
  private onVisibility = (): void => {
    if (document.hidden) {
      if (this.mode === 'playing') this.togglePause();
      this.sfx.suspend();
    } else {
      this.sfx.resume();
    }
  };

  private onBlur = (): void => {
    if (this.mode === 'playing') this.togglePause();
  };

  // ───────────────────────────── Boucle ─────────────────────────────

  override update(_time: number, deltaMs: number): void {
    const u = Math.min(window.devicePixelRatio || 1, 2);
    this.layout = computeLayout(this.scale.width, this.scale.height, u, this.world.width, this.world.height);
    const dt = Math.min(deltaMs, 100) / 1000;

    if (this.mode === 'playing') {
      this.vt += dt;
      this.acc += dt * this.settings.gameSpeed;
      const tickDt = 1 / this.world.t.tickRate;
      let input: PlayerInput = this.inputMgr.poll();
      let steps = 0;
      while (this.acc >= tickDt && steps < 8) {
        this.world.step([input]);
        this.handleEvents(this.world.events);
        input = { ...input, skill: false, drop: false };
        this.acc -= tickDt;
        steps++;
        if (this.world.status !== 'playing') break;
      }
      if (steps === 8) this.acc = 0;
      const pl = this.world.players[0]!;
      this.sfx.hum(pl.chain.nodes.length ? Math.min(1, this.world.cableLengthOf(pl) / pl.chain.maxLength) : 0);
    } else {
      if (this.mode !== 'paused') this.vt += dt;
      this.inputMgr.poll();
      this.sfx.hum(0);
    }

    this.drawBackground();
    this.drawWorld();
    this.drawOverlay();
  }

  private handleEvents(events: SimEvent[]): void {
    const reduce = this.settings.reduceFx;
    for (const ev of events) {
      switch (ev.type) {
        case 'attach':
          this.sfx.attach();
          break;
        case 'discharge': {
          const d = ev.discharge;
          this.fx.push({ kind: 'discharge', t0: this.vt, dur: 0.45, pos: d.center, discharge: d });
          const t = this.world.t.discharge;
          this.sfx.discharge((d.intensity - t.minDamage) / (t.maxDamage - t.minDamage));
          if (!reduce) this.cameras.main.shake(110, 0.0035 + Math.min(0.006, d.kills * 0.0008));
          this.popDamage(d);
          if (this.firstDischargeAt < 0) this.firstDischargeAt = this.vt;
          break;
        }
        case 'chainBroken':
          this.fx.push({ kind: 'break', t0: this.vt, dur: 0.6, pos: { x: ev.x, y: ev.y } });
          this.popLabel({ x: ev.x, y: ev.y }, ev.reason === 'cut' ? 'COUPÉ' : 'RUPTURE', CSS.overheat);
          this.sfx.breakCable();
          break;
        case 'stakePlaced': {
          const p = this.world.getPylon(ev.pylonId);
          if (p) this.fx.push({ kind: 'stake', t0: this.vt, dur: 0.35, pos: { x: p.x, y: p.y } });
          this.sfx.stake();
          break;
        }
        case 'enemyKilled':
          this.fx.push({ kind: 'kill', t0: this.vt, dur: 0.35, pos: { x: ev.x, y: ev.y } });
          this.sfx.kill();
          break;
        case 'playerHit':
          this.hitFlashUntil = this.vt + 0.18;
          this.sfx.hurt();
          if (!reduce) this.cameras.main.shake(90, 0.004);
          break;
        case 'arenaEnd':
          this.mode = 'ended';
          this.endedAt = this.vt;
          this.sfx.end(ev.result === 'won');
          break;
        default:
          break;
      }
    }
  }

  // ───────────────────────────── Dessin ─────────────────────────────

  private sx(x: number): number {
    return this.layout.ox + x * this.layout.s;
  }

  private sy(y: number): number {
    return this.layout.oy + y * this.layout.s;
  }

  private sp(p: Vec2): Vec2 {
    return { x: this.sx(p.x), y: this.sy(p.y) };
  }

  /** Fond de plan : grille fine, cartouche. Redessiné seulement au redimensionnement. */
  private drawBackground(): void {
    const L = this.layout;
    const key = `${L.W}x${L.H}@${L.u}`;
    if (key === this.lastBgKey) return;
    this.lastBgKey = key;
    const g = this.bg;
    const w = this.world.width;
    const h = this.world.height;
    g.clear();
    g.fillStyle(PALETTE.blueprint, 1);
    g.fillRect(0, 0, L.W, L.H);
    // Grille fine hors arène (papier de plan).
    const step = L.s / 2;
    g.lineStyle(1, PALETTE.gridMinor, 0.5);
    for (let x = L.ox % step; x < L.W; x += step) g.lineBetween(x, 0, x, L.H);
    for (let y = L.oy % step; y < L.H; y += step) g.lineBetween(0, y, L.W, y);
    // Grille de l'arène : une case = un carreau, traits forts toutes les 4 cases.
    for (let i = 0; i <= w; i++) {
      g.lineStyle(1, i % 4 === 0 ? PALETTE.gridMajor : PALETTE.gridMinor, 1);
      g.lineBetween(this.sx(i), this.sy(0), this.sx(i), this.sy(h));
    }
    for (let j = 0; j <= h; j++) {
      g.lineStyle(1, j % 4 === 0 ? PALETTE.gridMajor : PALETTE.gridMinor, 1);
      g.lineBetween(this.sx(0), this.sy(j), this.sx(w), this.sy(j));
    }
    g.lineStyle(Math.max(1.5, 2 * L.u), PALETTE.line, 0.7);
    g.strokeRect(this.sx(0), this.sy(0), w * L.s, h * L.s);
    // Repères de cotation aux coins.
    const tick = 6 * L.u;
    g.lineStyle(Math.max(1, L.u), PALETTE.line, 0.5);
    for (const [cx, cy] of [
      [0, 0],
      [w, 0],
      [0, h],
      [w, h],
    ] as const) {
      g.lineBetween(this.sx(cx) - tick, this.sy(cy), this.sx(cx) + tick, this.sy(cy));
      g.lineBetween(this.sx(cx), this.sy(cy) - tick, this.sx(cx), this.sy(cy) + tick);
    }
  }

  private drawWorld(): void {
    const g = this.g;
    const top = this.top;
    const L = this.layout;
    const s = L.s;
    const u = L.u;
    const w = this.world;
    const player = w.players[0]!;
    const vt = this.vt;
    const reduce = this.settings.reduceFx;
    g.clear();
    top.clear();

    // Aperçu de fermeture.
    const preview: ClosurePreview | null =
      this.mode === 'title' ? null : w.closurePreview(player, this.settings.alwaysPreview ? Infinity : w.t.preview.radius);
    if (preview) this.drawPreview(preview);
    else this.previewText.setVisible(false);

    // Décharges : flash du polygone.
    for (const f of this.fx) {
      if (f.kind !== 'discharge' || !f.discharge) continue;
      const k = (vt - f.t0) / f.dur;
      if (k < 0 || k > 1) continue;
      const pts = f.discharge.polygon.map((p) => this.sp(p));
      g.fillStyle(PALETTE.arc, (reduce ? 0.25 : 0.55) * (1 - k));
      g.fillPoints(pts, true);
      g.lineStyle(Math.max(2, 0.08 * s), PALETTE.arc, 1 - k);
      g.strokePoints(pts, true, true);
    }

    // Câble.
    const cable = w.cableOf(player).map((p) => this.sp(p));
    if (cable.length >= 2) {
      const ratio = w.cableLengthOf(player) / player.chain.maxLength;
      const warn = w.t.cable.tensionWarnRatio;
      const tense = ratio >= warn;
      const amp = tense ? ((ratio - warn) / (1 - warn)) * 0.12 * s + 0.02 * s : 0;
      const blink = tense && ratio > 0.92 && Math.floor(vt * 10) % 2 === 0;
      const pts = vibrate(cable, amp, vt);
      g.lineStyle(Math.max(4, 0.2 * s), PALETTE.arc, 0.15);
      polyline(g, pts);
      g.lineStyle(Math.max(2, 0.075 * s), tense ? PALETTE.overheat : PALETTE.arc, blink ? 0.35 : 1);
      polyline(g, pts);
    }

    // Bornes.
    const inChain = new Set(player.chain.nodes);
    const used = new Set<number>();
    const half = 0.21 * s;
    for (const p of w.pylons) {
      const c = this.sp(p);
      const hot = !w.isPylonAvailable(p);
      const chained = inChain.has(p.id);
      const lw = Math.max(1.5, 0.05 * s);
      if (p.kind === 'stake') {
        // Piquet : losange, avec sa durée de vie restante.
        const life = p.expiresAt !== undefined ? (p.expiresAt - w.tick) / w.secondsToTicks(w.t.stake.lifetimeSec) : 1;
        const hh = half * 1.25;
        const dia = [
          { x: c.x, y: c.y - hh },
          { x: c.x + hh, y: c.y },
          { x: c.x, y: c.y + hh },
          { x: c.x - hh, y: c.y },
        ];
        g.fillStyle(PALETTE.blueprint, 1);
        g.fillPoints(dia, true);
        if (chained) {
          g.fillStyle(PALETTE.arc, 1);
          g.fillPoints(dia.map((q) => ({ x: c.x + (q.x - c.x) * 0.5, y: c.y + (q.y - c.y) * 0.5 })), true);
        }
        g.lineStyle(lw, hot ? PALETTE.overheat : chained ? PALETTE.arc : PALETTE.line, life < 0.3 && Math.floor(vt * 6) % 2 ? 0.4 : 1);
        g.strokePoints(dia, true, true);
        g.lineStyle(Math.max(1, 0.04 * s), PALETTE.line, 0.6);
        g.beginPath();
        g.arc(c.x, c.y, hh * 1.45, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * Math.max(0, life));
        g.strokePath();
      } else {
        g.fillStyle(PALETTE.blueprint, 1);
        g.fillRect(c.x - half, c.y - half, half * 2, half * 2);
        if (hot) {
          g.lineStyle(Math.max(1, 0.035 * s), PALETTE.overheat, 0.9);
          hatchSquare(g, c.x, c.y, half, half * 0.6);
        } else if (chained) {
          g.fillStyle(PALETTE.arc, 1);
          g.fillRect(c.x - half * 0.55, c.y - half * 0.55, half * 1.1, half * 1.1);
        }
        g.lineStyle(lw, hot ? PALETTE.overheat : chained ? PALETTE.arc : PALETTE.line, 1);
        g.strokeRect(c.x - half, c.y - half, half * 2, half * 2);
        // Bornes du schéma : deux petites pattes.
        g.lineBetween(c.x - half, c.y, c.x - half * 1.5, c.y);
        g.lineBetween(c.x + half, c.y, c.x + half * 1.5, c.y);
      }
      if (hot) {
        used.add(p.id);
        let t = this.pylonTexts.get(p.id);
        if (!t) {
          t = this.add
            .text(0, 0, '', { fontFamily: FONT_MONO, fontSize: '12px', color: CSS.overheat, fontStyle: 'bold' })
            .setOrigin(0.5, 1)
            .setDepth(30)
            .setResolution(1);
          this.pylonTexts.set(p.id, t);
        }
        t.setFontSize(Math.max(10 * u, Math.round(0.34 * s)));
        t.setText(((p.cooldownUntil - w.tick) / w.t.tickRate).toFixed(1));
        t.setPosition(c.x, c.y - half - 2 * u).setVisible(true);
      }
    }
    for (const [id, t] of this.pylonTexts) {
      if (!used.has(id)) {
        if (!w.getPylon(id)) {
          t.destroy();
          this.pylonTexts.delete(id);
        } else t.setVisible(false);
      }
    }

    // Ennemis.
    for (const e of w.enemies) {
      const c = this.sp(e);
      const spawnK = Math.min(1, (w.tick - e.spawnTick) / 24);
      const r = e.radius * s * (0.6 + 0.4 * spawnK);
      const spiky = e.type === 'cutter';
      const pts = enemyShape(c.x, c.y, r, e.shapeSeed, vt + e.shapeSeed % 100, spiky);
      const hitNow = e.hitUntil > w.tick;
      g.fillStyle(hitNow ? PALETTE.line : PALETTE.enemyFill, spawnK);
      g.fillPoints(pts, true);
      g.lineStyle(Math.max(1.5, 0.05 * s), spiky ? PALETTE.overheat : PALETTE.enemyStroke, spawnK);
      g.strokePoints(pts, true, true);
      if (spiky) {
        // Les deux « lames » du Coupe-fil.
        g.lineStyle(Math.max(1, 0.04 * s), PALETTE.overheat, spawnK);
        g.lineBetween(c.x - r * 0.35, c.y - r * 0.35, c.x + r * 0.35, c.y + r * 0.35);
        g.lineBetween(c.x - r * 0.35, c.y + r * 0.35, c.x + r * 0.35, c.y - r * 0.35);
      } else {
        g.fillStyle(PALETTE.enemyStroke, 0.8 * spawnK);
        g.fillCircle(c.x + r * 0.25, c.y - r * 0.15, Math.max(1, r * 0.13));
        g.fillCircle(c.x - r * 0.2, c.y - r * 0.2, Math.max(1, r * 0.1));
      }
    }

    // Joueur.
    if (player.hp > 0) {
      const c = this.sp(player);
      const r = w.t.player.radius * s;
      const invuln = w.tick < player.invulnUntil && Math.floor(vt * 14) % 2 === 0;
      g.fillStyle(PALETTE.line, invuln ? 0.35 : 1);
      g.fillCircle(c.x, c.y, r);
      g.lineStyle(Math.max(1.5, 0.05 * s), PALETTE.arc, 1);
      g.strokeCircle(c.x, c.y, r + 0.08 * s);
      g.lineStyle(Math.max(1.5, 0.05 * s), PALETTE.blueprint, 1);
      resistorGlyph(g, c.x, c.y, r * 1.3);
      // Direction.
      g.fillStyle(PALETTE.arc, 1);
      g.fillCircle(c.x + player.facingX * (r + 0.22 * s), c.y + player.facingY * (r + 0.22 * s), Math.max(1.5, 0.06 * s));
    }

    // Effets ponctuels.
    for (const f of this.fx) {
      const k = (vt - f.t0) / f.dur;
      if (k < 0 || k > 1) continue;
      const c = this.sp(f.pos);
      if (f.kind === 'discharge' && f.discharge) {
        // Arcs électriques le long des arêtes.
        const pts = f.discharge.polygon.map((p) => this.sp(p));
        top.lineStyle(Math.max(1.5, 0.05 * s), PALETTE.line, 1 - k);
        for (let i = 0; i < pts.length; i++) {
          polyline(top, lightning(pts[i]!, pts[(i + 1) % pts.length]!, 0.25 * s, 8));
        }
        if (k < 0.15 && !reduce) {
          top.fillStyle(PALETTE.line, 0.1 * (1 - k / 0.15));
          top.fillRect(0, 0, L.W, L.H);
        }
      } else if (f.kind === 'kill') {
        top.lineStyle(Math.max(1, 0.05 * s), PALETTE.arc, 1 - k);
        top.strokeCircle(c.x, c.y, (0.3 + k * 0.6) * s);
        for (let i = 0; i < 5; i++) {
          const a = (i / 5) * Math.PI * 2 + f.t0;
          const d = (0.25 + k * 0.7) * s;
          top.fillStyle(PALETTE.enemyStroke, 1 - k);
          top.fillRect(c.x + Math.cos(a) * d - 1.5 * u, c.y + Math.sin(a) * d - 1.5 * u, 3 * u, 3 * u);
        }
      } else if (f.kind === 'break') {
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2 + f.t0 * 3;
          const d0 = k * 0.6 * s;
          const d1 = d0 + 0.25 * s * (1 - k);
          top.lineStyle(Math.max(1.5, 0.05 * s), PALETTE.overheat, 1 - k);
          top.lineBetween(c.x + Math.cos(a) * d0, c.y + Math.sin(a) * d0, c.x + Math.cos(a) * d1, c.y + Math.sin(a) * d1);
        }
      } else if (f.kind === 'stake') {
        top.lineStyle(Math.max(1.5, 0.05 * s), PALETTE.arc, 1 - k);
        top.strokeCircle(c.x, c.y, (0.2 + k) * s);
      }
    }
    this.fx = this.fx.filter((f) => this.vt - f.t0 <= f.dur);

    // Coup reçu : liseré de danger.
    if (this.vt < this.hitFlashUntil) {
      const a = (this.hitFlashUntil - this.vt) / 0.18;
      top.lineStyle(10 * u, PALETTE.overheat, (reduce ? 0.3 : 0.6) * a);
      top.strokeRect(5 * u, 5 * u, L.W - 10 * u, L.H - 10 * u);
    }

    // Joystick flottant.
    const j = this.inputMgr.joystick;
    if (j.active && this.mode === 'playing') {
      const jr = this.inputMgr.joystickRadius * u;
      top.lineStyle(Math.max(1, 1.5 * u), PALETTE.line, 0.35);
      top.strokeCircle(j.ox * u, j.oy * u, jr);
      top.fillStyle(PALETTE.line, 0.35);
      top.fillCircle(j.x * u, j.y * u, 18 * u);
    }
  }

  private drawPreview(pv: ClosurePreview): void {
    const g = this.g;
    const s = this.layout.s;
    const u = this.layout.u;
    const pts = pv.polygon.map((p) => this.sp(p));
    const t = this.world.t.discharge;
    const k = (pv.intensity - t.minDamage) / (t.maxDamage - t.minDamage);
    g.fillStyle(PALETTE.arc, 0.1 + 0.12 * k);
    g.fillPoints(pts, true);
    g.lineStyle(Math.max(1, 0.035 * s), PALETTE.arc, 0.8);
    dashedPolygon(g, pts, 0.18 * s, 0.12 * s, this.vt * s);
    // Jauge d'intensité au centre : petite boucle = forte.
    const c = this.sp(vertexCentroid(pv.polygon));
    const bw = Math.max(36 * u, 1.3 * s);
    const bh = Math.max(4 * u, 0.12 * s);
    g.fillStyle(PALETTE.blueprintDeep, 0.85);
    g.fillRect(c.x - bw / 2 - 2 * u, c.y + 8 * u, bw + 4 * u, bh + 4 * u);
    g.fillStyle(PALETTE.arc, 1);
    g.fillRect(c.x - bw / 2, c.y + 10 * u, bw * Math.max(0.04, k), bh);
    this.previewText
      .setVisible(true)
      .setFontSize(Math.max(12 * u, Math.round(0.42 * s)))
      .setText(`⚡${Math.round(pv.intensity)}`)
      .setPosition(c.x, c.y - 4 * u);
  }

  private popDamage(d: Discharge): void {
    const c = this.sp(d.center);
    const s = this.layout.s;
    const label = d.hits > 0 ? `${Math.round(d.totalDamage)}` : `⚡${Math.round(d.intensity)}`;
    const sub = d.kills > 1 ? `  ×${d.kills}` : '';
    const t = this.add
      .text(c.x, c.y, label + sub, {
        fontFamily: FONT_TITLE,
        fontSize: `${Math.round(Math.max(22 * this.layout.u, 0.8 * s) * (d.hits > 0 ? 1 : 0.7))}px`,
        color: d.hits > 0 ? CSS.arc : CSS.line,
        fontStyle: 'bold',
        stroke: CSS.blueprint,
        strokeThickness: Math.max(3, 0.1 * s),
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setResolution(1);
    this.tweens.add({ targets: t, y: c.y - 0.9 * s, alpha: 0, duration: 900, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  private popLabel(at: Vec2, label: string, color: string): void {
    const c = this.sp(at);
    const t = this.add
      .text(c.x, c.y, label, {
        fontFamily: FONT_MONO,
        fontSize: `${Math.round(Math.max(12 * this.layout.u, 0.38 * this.layout.s))}px`,
        color,
        fontStyle: 'bold',
        stroke: CSS.blueprint,
        strokeThickness: 4,
      })
      .setOrigin(0.5)
      .setDepth(60)
      .setResolution(1);
    this.tweens.add({ targets: t, y: c.y - 0.6 * this.layout.s, alpha: 0, duration: 800, onComplete: () => t.destroy() });
  }

  private drawOverlay(): void {
    const L = this.layout;
    const w = this.world;
    const touch = this.inputMgr.lastDevice === 'touch';
    const playing = this.mode === 'playing' || this.mode === 'paused';

    // Onboarding : consigne jusqu'à la première décharge, puis la règle des surfaces.
    let hint = '';
    let hintAlpha = 0;
    if (this.mode === 'playing') {
      if (this.firstDischargeAt < 0 && w.tick > 30) {
        hint = ONBOARDING[0]!;
        hintAlpha = Math.min(1, (w.tick - 30) / 30);
      } else if (this.firstDischargeAt >= 0 && this.vt - this.firstDischargeAt < 5) {
        hint = ONBOARDING[1]!;
        hintAlpha = Math.min(1, (5 - (this.vt - this.firstDischargeAt)) / 0.8);
      }
    }
    this.hud.setVisible(playing || this.mode === 'ended');
    this.hud.update(L, w, this.inputMgr.lastDevice, hint, hintAlpha, this.vt);

    const arena = `${w.template === 'custom' ? 'Arène' : `Arène ${TEMPLATE_NAMES[w.template]}`} · seed ${w.seed}`;
    if (this.mode === 'title') {
      const controls = touch
        ? 'Glisse n’importe où pour bouger.\nBouton : Piquet · Double-tap : lâcher.'
        : 'ZQSD / flèches / manette : bouger\nEspace : Piquet · R : lâcher le câble\nÉchap : pause';
      this.overlay.show(
        L,
        "PLUG'D",
        [
          'Tu n’as aucune arme.',
          '',
          'Passe sur les bornes ▢ :',
          'le câble suit.',
          'Repasse sur une borne de ta chaîne :',
          'la boucle se ferme et tout',
          'ce qui est dedans grille.',
          '',
          'Petite boucle = gros dégâts.',
          `Câble : ${w.t.cable.maxLength} cases max.`,
          'Les Coupe-fils ✕ tranchent le câble.',
          'Survis 75 secondes.',
          '',
          controls,
          '',
          arena,
        ].join('\n'),
        touch ? 'TOUCHE POUR BRANCHER' : 'ENTRÉE OU CLIC POUR BRANCHER',
        CSS.arc,
        this.vt,
      );
    } else if (this.mode === 'paused') {
      this.overlay.show(L, 'PAUSE', arena, touch ? 'TOUCHE POUR REPRENDRE' : 'ÉCHAP OU ENTRÉE POUR REPRENDRE', CSS.line, this.vt);
    } else if (this.mode === 'ended') {
      const won = w.status === 'won';
      const st = w.stats;
      const survived = Math.min(w.t.arena.durationSec, w.tick / w.t.tickRate);
      this.overlay.show(
        L,
        won ? 'ARÈNE SURVÉCUE' : 'COURT-CIRCUIT',
        [
          `Grillés            ${st.kills}`,
          `Décharges          ${st.discharges}`,
          `Meilleure décharge ${Math.round(st.bestDischarge)}`,
          `Câbles perdus      ${st.chainsBroken}`,
          `Temps              ${survived.toFixed(1)} s`,
          '',
          `seed ${w.seed}`,
        ].join('\n'),
        touch ? 'TOUCHE : NOUVELLE ARÈNE' : 'ENTRÉE : NOUVELLE ARÈNE · R : MÊME SEED',
        won ? CSS.arc : CSS.overheat,
        this.vt,
        'left',
      );
    } else {
      this.overlay.hide();
    }
  }
}

function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}

