// ─────────────────────────────────────────────────────────────
//  Sound design, synthesised — no audio files, no licensing.
//  Off by default (browser autoplay policy + good manners);
//  everything is built lazily on a user gesture.
// ─────────────────────────────────────────────────────────────
import { TL } from "./config";
import { clamp, smoothstep } from "./math";

interface Cue {
  at: number;
  fire: () => void;
}

export class SoundDesign {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private dry: GainNode | null = null;
  private space: GainNode | null = null;
  private droneGain: GainNode | null = null;
  private droneFilter: BiquadFilterNode | null = null;
  private airGain: GainNode | null = null;
  private airFilter: BiquadFilterNode | null = null;
  private noise: AudioBuffer | null = null;
  private droneNodes: OscillatorNode[] = [];
  private prevT = 0;
  private cues: Cue[] = [];
  private chimeNotes = [523.25, 587.33, 698.46, 783.99, 880, 1046.5, 1174.66, 1396.91, 1567.98, 2093];
  enabled = false;

  /** Must be called from a user gesture. */
  async enable() {
    if (this.enabled) return;
    try {
      const Ctor = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new Ctor({ latencyHint: "interactive" });
      await ctx.resume();
      this.ctx = ctx;

      const master = ctx.createGain();
      master.gain.value = 0.0;
      const comp = ctx.createDynamicsCompressor();
      comp.threshold.value = -18;
      comp.knee.value = 22;
      comp.ratio.value = 3.2;
      comp.attack.value = 0.004;
      comp.release.value = 0.32;
      master.connect(comp).connect(ctx.destination);

      // a cheap "hall": filtered feedback delay
      const delay = ctx.createDelay(1.2);
      delay.delayTime.value = 0.29;
      const fb = ctx.createGain();
      fb.gain.value = 0.42;
      const damp = ctx.createBiquadFilter();
      damp.type = "lowpass";
      damp.frequency.value = 2400;
      const space = ctx.createGain();
      space.gain.value = 0.42;
      const wet = ctx.createGain();
      wet.gain.value = 1;
      space.connect(delay);
      delay.connect(damp);
      damp.connect(fb);
      fb.connect(delay);
      damp.connect(wet);
      wet.connect(master);

      const dry = ctx.createGain();
      dry.gain.value = 1;
      dry.connect(master);

      this.master = master;
      this.dry = dry;
      this.space = space;

      // white noise bed
      const len = ctx.sampleRate * 2;
      const buf = ctx.createBuffer(1, len, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      this.noise = buf;

      // sub drone
      this.droneGain = ctx.createGain();
      this.droneGain.gain.value = 0;
      this.droneFilter = ctx.createBiquadFilter();
      this.droneFilter.type = "lowpass";
      this.droneFilter.frequency.value = 220;
      this.droneFilter.Q.value = 1.1;
      this.droneFilter.connect(this.droneGain);
      this.droneGain.connect(dry);
      this.droneGain.connect(space);
      for (const [f, g] of [
        [41.2, 0.5],
        [55, 0.34],
        [82.41, 0.16],
      ] as [number, number][]) {
        const o = ctx.createOscillator();
        o.type = "sawtooth";
        o.frequency.value = f;
        o.detune.value = (Math.random() - 0.5) * 8;
        const og = ctx.createGain();
        og.gain.value = g;
        o.connect(og).connect(this.droneFilter);
        o.start();
        this.droneNodes.push(o);
      }

      // moving air
      const air = ctx.createBufferSource();
      air.buffer = buf;
      air.loop = true;
      this.airFilter = ctx.createBiquadFilter();
      this.airFilter.type = "bandpass";
      this.airFilter.frequency.value = 420;
      this.airFilter.Q.value = 0.7;
      this.airGain = ctx.createGain();
      this.airGain.gain.value = 0;
      air.connect(this.airFilter).connect(this.airGain);
      this.airGain.connect(dry);
      this.airGain.connect(space);
      air.start();

      this.prevT = -1;
      this.buildCues();
      this.enabled = true;
      master.gain.setTargetAtTime(0.55, ctx.currentTime, 0.8);
    } catch (e) {
      console.warn("sound unavailable", e);
      this.enabled = false;
    }
  }

  private riseTimes: number[] = [];

  private buildCues() {
    this.cues = [];
    this.cues.push({ at: TL.GATE_PASS - 0.9, fire: () => this.whoosh(1.6, 0.5) });
    this.cues.push({ at: TL.ORBIT_START, fire: () => this.whoosh(2.4, 0.34) });
    this.cues.push({ at: TL.CHARGE_START, fire: () => this.riser(4.6) });
    this.cues.push({ at: TL.BLAST, fire: () => this.impact() });
    this.cues.push({ at: TL.SOLID, fire: () => this.shimmer() });
    this.riseTimes.forEach((t, i) => {
      this.cues.push({ at: t, fire: () => this.grow(i) });
      this.cues.push({ at: t + 2.3, fire: () => this.chime(i) });
    });
    this.cues.sort((a, b) => a.at - b.at);
  }

  /** Crystals grow and ignite on their own schedule — tell the mixer about it. */
  setRiseSchedule(times: number[]) {
    this.riseTimes = times.slice();
    this.buildCues();
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  private env(node: GainNode, peak: number, attack: number, decay: number, at = 0) {
    const t = this.now() + at;
    node.gain.cancelScheduledValues(t);
    node.gain.setValueAtTime(0.0001, t);
    node.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), t + attack);
    node.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
  }

  private noiseSource(): AudioBufferSourceNode | null {
    if (!this.ctx || !this.noise) return null;
    const s = this.ctx.createBufferSource();
    s.buffer = this.noise;
    s.loop = true;
    return s;
  }

  private grow(index: number) {
    if (!this.ctx || !this.dry) return;
    const ctx = this.ctx;
    const o = ctx.createOscillator();
    o.type = "triangle";
    const f0 = 38 + (index % 3) * 6;
    o.frequency.setValueAtTime(f0, ctx.currentTime);
    o.frequency.exponentialRampToValueAtTime(f0 * 2.6, ctx.currentTime + 1.5);
    const g = ctx.createGain();
    const lp = ctx.createBiquadFilter();
    lp.type = "lowpass";
    lp.frequency.value = 320;
    this.env(g, 0.16, 0.35, 2.0);
    o.connect(lp).connect(g);
    g.connect(this.dry);
    if (this.space) g.connect(this.space);
    o.start();
    o.stop(ctx.currentTime + 2.6);
  }

  private chime(index: number) {
    if (!this.ctx || !this.dry) return;
    const ctx = this.ctx;
    const f = this.chimeNotes[index % this.chimeNotes.length];
    const pan = ctx.createStereoPanner();
    pan.pan.value = ((index / 10) * 2 - 1) * 0.55;
    const g = ctx.createGain();
    for (const [mul, amp] of [
      [1, 0.5],
      [2.01, 0.18],
      [3.02, 0.07],
    ]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f * mul;
      const og = ctx.createGain();
      og.gain.value = amp;
      o.connect(og).connect(g);
      o.start();
      o.stop(ctx.currentTime + 2.4);
    }
    this.env(g, 0.055, 0.006, 1.9);
    g.connect(pan);
    pan.connect(this.dry);
    if (this.space) pan.connect(this.space);
  }

  private whoosh(dur: number, amp: number) {
    if (!this.ctx || !this.dry) return;
    const src = this.noiseSource();
    if (!src) return;
    const bp = this.ctx.createBiquadFilter();
    bp.type = "bandpass";
    bp.Q.value = 1.2;
    const t0 = this.now();
    bp.frequency.setValueAtTime(280, t0);
    bp.frequency.exponentialRampToValueAtTime(1800, t0 + dur * 0.7);
    bp.frequency.exponentialRampToValueAtTime(420, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(amp, t0 + dur * 0.45);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(bp).connect(g);
    g.connect(this.dry);
    if (this.space) g.connect(this.space);
    src.start();
    src.stop(t0 + dur + 0.1);
  }

  private riser(dur: number) {
    if (!this.ctx || !this.dry) return;
    const src = this.noiseSource();
    if (!src) return;
    const hp = this.ctx.createBiquadFilter();
    hp.type = "highpass";
    const t0 = this.now();
    hp.frequency.setValueAtTime(200, t0);
    hp.frequency.exponentialRampToValueAtTime(4200, t0 + dur);
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(0.0001, t0);
    g.gain.exponentialRampToValueAtTime(0.09, t0 + dur * 0.92);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    src.connect(hp).connect(g);
    g.connect(this.dry);
    if (this.space) g.connect(this.space);
    src.start();
    src.stop(t0 + dur + 0.05);

    const o = this.ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(90, t0);
    o.frequency.exponentialRampToValueAtTime(760, t0 + dur);
    const og = this.ctx.createGain();
    og.gain.setValueAtTime(0.0001, t0);
    og.gain.exponentialRampToValueAtTime(0.05, t0 + dur);
    o.connect(og).connect(this.dry);
    o.start();
    o.stop(t0 + dur + 0.05);
  }

  private impact() {
    if (!this.ctx || !this.dry) return;
    const ctx = this.ctx;
    const t0 = ctx.currentTime;

    // sub drop
    const o = ctx.createOscillator();
    o.type = "sine";
    o.frequency.setValueAtTime(92, t0);
    o.frequency.exponentialRampToValueAtTime(26, t0 + 1.6);
    const g = ctx.createGain();
    this.env(g, 0.85, 0.004, 3.4);
    o.connect(g);
    g.connect(this.dry);
    if (this.space) g.connect(this.space);
    o.start();
    o.stop(t0 + 4);

    // debris tail
    const src = this.noiseSource();
    if (src) {
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.setValueAtTime(9000, t0);
      lp.frequency.exponentialRampToValueAtTime(320, t0 + 3.2);
      const ng = ctx.createGain();
      this.env(ng, 0.5, 0.003, 3.6);
      src.connect(lp).connect(ng);
      ng.connect(this.dry);
      if (this.space) ng.connect(this.space);
      src.start();
      src.stop(t0 + 4);
    }
  }

  private shimmer() {
    if (!this.ctx || !this.dry) return;
    const ctx = this.ctx;
    const g = ctx.createGain();
    this.env(g, 0.05, 0.4, 3.2);
    const trem = ctx.createGain();
    trem.gain.value = 0.75;
    const lfo = ctx.createOscillator();
    lfo.frequency.value = 4.6;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.25;
    lfo.connect(lfoGain).connect(trem.gain);
    lfo.start();
    lfo.stop(ctx.currentTime + 4);
    for (const f of [1046.5, 1567.98, 2093, 2637]) {
      const o = ctx.createOscillator();
      o.type = "sine";
      o.frequency.value = f;
      const og = ctx.createGain();
      og.gain.value = 0.18;
      o.connect(og).connect(trem);
      o.start();
      o.stop(ctx.currentTime + 4);
    }
    trem.connect(g);
    g.connect(this.dry);
    if (this.space) g.connect(this.space);
  }

  /** Called every frame with the current timeline value. */
  update(t: number, state: { charge: number; speed: number; shake: number }) {
    if (!this.enabled || !this.ctx) return;
    if (this.prevT < 0) this.prevT = t;
    if (t < this.prevT - 0.05) {
      // timeline was seeked backwards — re-arm the cues
      this.prevT = t;
    } else if (t > this.prevT) {
      for (const c of this.cues) if (c.at > this.prevT && c.at <= t) c.fire();
      this.prevT = t;
    }

    const ctx = this.ctx;
    const now = ctx.currentTime;
    const blast = smoothstep(TL.BLAST, TL.BLAST + 0.4, t);
    if (this.droneGain) {
      const g = (0.1 + 0.55 * state.charge) * (1 - blast);
      this.droneGain.gain.setTargetAtTime(g, now, 0.25);
    }
    if (this.droneFilter) {
      this.droneFilter.frequency.setTargetAtTime(180 + 900 * state.charge, now, 0.3);
    }
    if (this.airGain) {
      const g = clamp(0.02 + 0.22 * state.speed + 0.1 * state.shake, 0, 0.4) * (1 - blast * 0.7);
      this.airGain.gain.setTargetAtTime(g, now, 0.2);
    }
    if (this.airFilter) {
      this.airFilter.frequency.setTargetAtTime(300 + 2200 * clamp(state.speed * 0.6 + state.charge * 0.5), now, 0.25);
    }
  }

  private setMuted(muted: boolean) {
    if (!this.ctx || !this.master) return;
    this.master.gain.setTargetAtTime(muted ? 0.0001 : 0.55, this.ctx.currentTime, 0.25);
  }

  async toggle() {
    if (this.enabled) {
      this.enabled = false;
      this.setMuted(true);
    } else if (this.ctx) {
      this.enabled = true;
      await this.ctx.resume();
      this.setMuted(false);
      this.prevT = -1;
    } else {
      await this.enable();
    }
    return this.enabled;
  }

  dispose() {
    this.enabled = false;
    for (const o of this.droneNodes) {
      try {
        o.stop();
      } catch {
        /* already stopped */
      }
    }
    this.droneNodes = [];
    if (this.ctx) {
      void this.ctx.close();
      this.ctx = null;
    }
    this.space = null;
    this.dry = null;
    this.master = null;
  }
}
