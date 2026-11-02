/**
 * Sons synthétisés en WebAudio (provisoires, aucun fichier) :
 * bourdonnement qui monte avec la longueur du câble, claquement sec à la fermeture,
 * grésillement pour la surchauffe.
 */
export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private humOsc: OscillatorNode | null = null;
  private humGain: GainNode | null = null;
  private humFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;

  constructor(private muted: boolean) {}

  /** À appeler sur un geste utilisateur (politique d'autoplay). */
  unlock(): void {
    if (this.muted) return;
    if (!this.ctx) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
      const len = this.ctx.sampleRate;
      this.noise = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = this.noise.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;

      this.humOsc = this.ctx.createOscillator();
      this.humOsc.type = 'sawtooth';
      this.humOsc.frequency.value = 55;
      this.humFilter = this.ctx.createBiquadFilter();
      this.humFilter.type = 'lowpass';
      this.humFilter.frequency.value = 300;
      this.humGain = this.ctx.createGain();
      this.humGain.gain.value = 0;
      this.humOsc.connect(this.humFilter).connect(this.humGain).connect(this.master);
      this.humOsc.start();
    }
    void this.ctx.resume();
  }

  setMuted(m: boolean): void {
    this.muted = m;
    if (this.master && this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.5, this.ctx.currentTime, 0.02);
  }

  suspend(): void {
    void this.ctx?.suspend();
  }

  resume(): void {
    if (!this.muted) void this.ctx?.resume();
  }

  /** ratio = longueur du câble / longueur max (0 = pas de câble). */
  hum(ratio: number): void {
    if (!this.ctx || !this.humOsc || !this.humGain || !this.humFilter) return;
    const t = this.ctx.currentTime;
    const on = ratio > 0.001;
    this.humOsc.frequency.setTargetAtTime(50 + ratio * 110, t, 0.05);
    this.humFilter.frequency.setTargetAtTime(220 + ratio * 900, t, 0.05);
    this.humGain.gain.setTargetAtTime(on ? 0.025 + ratio * ratio * 0.06 : 0, t, 0.06);
  }

  private tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0): void {
    if (!this.ctx || !this.master) return;
    const t = this.ctx.currentTime + delay;
    const o = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, t);
    o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(this.master);
    o.start(t);
    o.stop(t + dur + 0.02);
  }

  private burst(dur: number, vol: number, freq: number, q: number, delay = 0): void {
    if (!this.ctx || !this.master || !this.noise) return;
    const t = this.ctx.currentTime + delay;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    const f = this.ctx.createBiquadFilter();
    f.type = 'bandpass';
    f.frequency.value = freq;
    f.Q.value = q;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    src.connect(f).connect(g).connect(this.master);
    src.start(t, Math.random() * 0.5);
    src.stop(t + dur + 0.02);
  }

  attach(): void {
    this.tone('square', 1320, 1100, 0.05, 0.05);
  }

  /** Claquement sec, plus aigu quand la boucle est intense. */
  discharge(intensity01: number): void {
    this.burst(0.09, 0.5, 2500 + intensity01 * 2500, 0.8);
    this.tone('square', 180 + intensity01 * 220, 40, 0.18, 0.22);
    // Grésillement de surchauffe.
    for (let i = 0; i < 6; i++) this.burst(0.03, 0.08, 4000 + i * 300, 3, 0.12 + i * 0.07);
  }

  breakCable(): void {
    this.tone('sawtooth', 420, 60, 0.22, 0.14);
    this.burst(0.12, 0.2, 1800, 1.5);
  }

  stake(): void {
    this.tone('triangle', 300, 600, 0.08, 0.15);
    this.burst(0.05, 0.15, 900, 2);
  }

  kill(): void {
    this.tone('triangle', 900, 300, 0.06, 0.04);
  }

  hurt(): void {
    this.tone('sine', 140, 50, 0.2, 0.35);
  }

  end(won: boolean): void {
    const notes = won ? [523, 659, 784, 1046] : [392, 330, 262, 196];
    notes.forEach((f, i) => this.tone('square', f, f, 0.14, 0.08, i * 0.11));
  }
}
