import type { PlayerInput } from '../sim/types';

export type Device = 'keyboard' | 'touch' | 'gamepad';

export interface InputHooks {
  /** Le point (px CSS, relatif au canvas) est-il sur le bouton de compétence ? */
  hitSkillButton(x: number, y: number): boolean;
  /** Le point est-il sur le bouton pause ? */
  hitPauseButton(x: number, y: number): boolean;
  onPause(): void;
  onConfirm(): void;
  /** Premier geste utilisateur (déverrouille l'audio). */
  onFirstGesture(): void;
}

export interface JoystickState {
  active: boolean;
  /** Origine et position courante, en px CSS relatifs au canvas. */
  ox: number;
  oy: number;
  x: number;
  y: number;
}

const JOYSTICK_RADIUS = 56; // px CSS
const DEAD_ZONE = 6;
const DOUBLE_TAP_MS = 300;
const DOUBLE_TAP_DIST = 48;

/**
 * Entrées unifiées : clavier (ZQSD / WASD par position physique, flèches), joystick tactile
 * flottant (glisser n'importe où), manette. Un seul doigt suffit.
 */
export class InputManager {
  readonly joystick: JoystickState = { active: false, ox: 0, oy: 0, x: 0, y: 0 };
  lastDevice: Device = 'keyboard';

  private readonly keys = new Set<string>();
  private skillQueued = false;
  private dropQueued = false;
  private joyPointer: number | null = null;
  private lastTap = { t: -Infinity, x: 0, y: 0 };
  private gesture = false;
  private padPrev: boolean[] = [];
  private readonly off: Array<() => void> = [];

  constructor(
    private readonly el: HTMLElement,
    private readonly hooks: InputHooks,
  ) {
    this.listen(window, 'keydown', (e) => this.onKeyDown(e as KeyboardEvent));
    this.listen(window, 'keyup', (e) => this.keys.delete((e as KeyboardEvent).code));
    this.listen(window, 'blur', () => this.keys.clear());
    this.listen(el, 'pointerdown', (e) => this.onPointerDown(e as PointerEvent));
    this.listen(window, 'pointermove', (e) => this.onPointerMove(e as PointerEvent));
    this.listen(window, 'pointerup', (e) => this.onPointerUp(e as PointerEvent));
    this.listen(window, 'pointercancel', (e) => this.onPointerUp(e as PointerEvent));
    this.listen(el, 'contextmenu', (e) => e.preventDefault());
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn, { passive: false });
    this.off.push(() => target.removeEventListener(type, fn));
  }

  destroy(): void {
    for (const f of this.off) f();
  }

  private firstGesture(): void {
    if (this.gesture) return;
    this.gesture = true;
    this.hooks.onFirstGesture();
  }

  private local(e: PointerEvent): { x: number; y: number } {
    const r = this.el.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  }

  private onKeyDown(e: KeyboardEvent): void {
    this.firstGesture();
    this.lastDevice = 'keyboard';
    if (e.repeat) return;
    this.keys.add(e.code);
    switch (e.code) {
      case 'Space':
        this.skillQueued = true;
        e.preventDefault();
        break;
      case 'KeyR':
        this.dropQueued = true;
        break;
      case 'Escape':
      case 'KeyP':
        this.hooks.onPause();
        break;
      case 'Enter':
      case 'NumpadEnter':
        this.hooks.onConfirm();
        break;
      default:
        if (e.code.startsWith('Arrow')) e.preventDefault();
    }
  }

  private onPointerDown(e: PointerEvent): void {
    e.preventDefault();
    this.firstGesture();
    this.lastDevice = e.pointerType === 'mouse' ? this.lastDevice : 'touch';
    const p = this.local(e);
    if (this.hooks.hitPauseButton(p.x, p.y)) {
      this.hooks.onPause();
      return;
    }
    if (this.hooks.hitSkillButton(p.x, p.y)) {
      this.skillQueued = true;
      return;
    }
    this.hooks.onConfirm();
    // Double-tap : abandonner la chaîne.
    const now = performance.now();
    if (now - this.lastTap.t < DOUBLE_TAP_MS && Math.hypot(p.x - this.lastTap.x, p.y - this.lastTap.y) < DOUBLE_TAP_DIST) {
      this.dropQueued = true;
      this.lastTap.t = -Infinity;
    } else {
      this.lastTap = { t: now, x: p.x, y: p.y };
    }
    if (this.joyPointer === null) {
      this.joyPointer = e.pointerId;
      Object.assign(this.joystick, { active: true, ox: p.x, oy: p.y, x: p.x, y: p.y });
    }
  }

  private onPointerMove(e: PointerEvent): void {
    if (e.pointerId !== this.joyPointer) return;
    const p = this.local(e);
    const j = this.joystick;
    // Joystick « flottant » : l'origine suit le doigt s'il dépasse le rayon.
    const dx = p.x - j.ox;
    const dy = p.y - j.oy;
    const d = Math.hypot(dx, dy);
    if (d > JOYSTICK_RADIUS) {
      j.ox = p.x - (dx / d) * JOYSTICK_RADIUS;
      j.oy = p.y - (dy / d) * JOYSTICK_RADIUS;
    }
    j.x = p.x;
    j.y = p.y;
  }

  private onPointerUp(e: PointerEvent): void {
    if (e.pointerId !== this.joyPointer) return;
    this.joyPointer = null;
    this.joystick.active = false;
  }

  get joystickRadius(): number {
    return JOYSTICK_RADIUS;
  }

  private pollGamepad(): { x: number; y: number } {
    const pads = typeof navigator !== 'undefined' && navigator.getGamepads ? navigator.getGamepads() : [];
    for (const pad of pads) {
      if (!pad) continue;
      const pressed = pad.buttons.map((b) => b.pressed);
      const edge = (i: number) => pressed[i] === true && this.padPrev[i] !== true;
      if (edge(0) || edge(5) || edge(7)) this.skillQueued = true; // A, RB, RT
      if (edge(2) || edge(1)) this.dropQueued = true; // X, B
      if (edge(9)) this.hooks.onPause(); // Start
      if (edge(0) || edge(9)) this.hooks.onConfirm();
      this.padPrev = pressed;
      let x = pad.axes[0] ?? 0;
      let y = pad.axes[1] ?? 0;
      if (pressed[12]) y = -1;
      if (pressed[13]) y = 1;
      if (pressed[14]) x = -1;
      if (pressed[15]) x = 1;
      const mag = Math.hypot(x, y);
      if (mag < 0.18) return { x: 0, y: 0 };
      if (pressed.some(Boolean) || mag > 0.3) this.lastDevice = 'gamepad';
      return { x, y };
    }
    return { x: 0, y: 0 };
  }

  /** Lit l'état courant et consomme les actions ponctuelles (compétence, abandon). */
  poll(): PlayerInput {
    let x = 0;
    let y = 0;
    const k = this.keys;
    if (k.has('KeyA') || k.has('ArrowLeft')) x -= 1;
    if (k.has('KeyD') || k.has('ArrowRight')) x += 1;
    if (k.has('KeyW') || k.has('ArrowUp')) y -= 1;
    if (k.has('KeyS') || k.has('ArrowDown')) y += 1;

    const pad = this.pollGamepad();
    if (x === 0 && y === 0) {
      x = pad.x;
      y = pad.y;
    }

    const j = this.joystick;
    if (j.active) {
      const dx = j.x - j.ox;
      const dy = j.y - j.oy;
      const d = Math.hypot(dx, dy);
      if (d > DEAD_ZONE) {
        const m = Math.min(1, d / (JOYSTICK_RADIUS * 0.6));
        x = (dx / d) * m;
        y = (dy / d) * m;
      }
    }

    const mag = Math.hypot(x, y);
    if (mag > 1) {
      x /= mag;
      y /= mag;
    }
    const out: PlayerInput = { moveX: x, moveY: y, skill: this.skillQueued, drop: this.dropQueued };
    this.skillQueued = false;
    this.dropQueued = false;
    return out;
  }

  /** Vide les actions en attente (changement d'écran). */
  flush(): void {
    this.skillQueued = false;
    this.dropQueued = false;
  }
}
