/**
 * Sound dispatch. Original Zuma resources are loaded when a local build supplies
 * them under assets/sounds/<key>.ogg; otherwise each cue is synthesised with
 * WebAudio so the game stays audible without any proprietary file.
 */
import type { SoundCue } from './feedback.js';
import { assetUrl } from './original.js';

interface Synth { type: OscillatorType; from: number; to: number; duration: number; gain: number; noise?: boolean }

const SYNTH: Record<string, Synth> = {
  fire: { type: 'triangle', from: 520, to: 180, duration: 0.09, gain: 0.25 },
  insert: { type: 'square', from: 300, to: 240, duration: 0.05, gain: 0.18 },
  merge: { type: 'sine', from: 220, to: 260, duration: 0.06, gain: 0.15 },
  swap: { type: 'sine', from: 600, to: 900, duration: 0.07, gain: 0.15 },
  destroy1: { type: 'sine', from: 440, to: 660, duration: 0.18, gain: 0.3 },
  destroy2: { type: 'sine', from: 494, to: 740, duration: 0.18, gain: 0.3 },
  destroy3: { type: 'sine', from: 554, to: 830, duration: 0.18, gain: 0.3 },
  destroy4: { type: 'sine', from: 622, to: 932, duration: 0.18, gain: 0.3 },
  destroy5: { type: 'sine', from: 698, to: 1046, duration: 0.18, gain: 0.3 },
  combo: { type: 'triangle', from: 880, to: 1320, duration: 0.25, gain: 0.2 },
  streak: { type: 'square', from: 660, to: 1320, duration: 0.3, gain: 0.2 },
  gap: { type: 'triangle', from: 1200, to: 1800, duration: 0.2, gain: 0.25 },
  zuma: { type: 'sawtooth', from: 220, to: 880, duration: 0.8, gain: 0.3 },
  levelwin: { type: 'triangle', from: 440, to: 1760, duration: 1.2, gain: 0.3 },
  lose: { type: 'sawtooth', from: 400, to: 60, duration: 1.0, gain: 0.3 },
  gameover: { type: 'sawtooth', from: 300, to: 40, duration: 1.6, gain: 0.3 },
  powerup: { type: 'sine', from: 900, to: 1500, duration: 0.25, gain: 0.2 },
  powerbomb: { type: 'sawtooth', from: 160, to: 30, duration: 0.6, gain: 0.4, noise: true },
  powerslow: { type: 'sine', from: 800, to: 200, duration: 0.7, gain: 0.3 },
  powerback: { type: 'square', from: 300, to: 700, duration: 0.5, gain: 0.25 },
  poweraccuracy: { type: 'triangle', from: 1000, to: 2000, duration: 0.4, gain: 0.25 },
};

export class AudioManager {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  private available = new Set<string>();
  private loading = new Set<string>();

  constructor(private readonly assetBase = 'assets/') {}

  /** Reads the manifest produced by `build --local` to know which original sounds exist. */
  async discover(): Promise<void> {
    try {
      const res = await fetch(assetUrl('sounds/manifest.json', this.assetBase), { cache: 'no-store' });
      if (!res.ok) return;
      const list = (await res.json()) as unknown;
      if (Array.isArray(list)) for (const key of list) if (typeof key === 'string') this.available.add(key);
    } catch {
      /* no original assets: synthesis only */
    }
  }

  /** Must be called from a user gesture so the context can start. */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  play(cue: SoundCue): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    if (this.available.has(cue.key)) {
      const buffer = this.buffers.get(cue.key);
      if (buffer) {
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = cue.rate;
        const gain = this.ctx.createGain();
        gain.gain.value = cue.gain;
        src.connect(gain).connect(this.master);
        src.start();
        return;
      }
      void this.load(cue.key);
    }
    this.synth(cue);
  }

  private async load(key: string): Promise<void> {
    if (!this.ctx || this.loading.has(key)) return;
    this.loading.add(key);
    try {
      const res = await fetch(assetUrl(`sounds/${key}.ogg`, this.assetBase));
      if (!res.ok) throw new Error(String(res.status));
      this.buffers.set(key, await this.ctx.decodeAudioData(await res.arrayBuffer()));
    } catch {
      this.available.delete(key);
    }
  }

  private synth(cue: SoundCue): void {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return;
    const spec = SYNTH[cue.key] ?? SYNTH.insert;
    const now = ctx.currentTime;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(spec.gain * cue.gain, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    gain.connect(master);
    const osc = ctx.createOscillator();
    osc.type = spec.type;
    osc.frequency.setValueAtTime(spec.from * cue.rate, now);
    osc.frequency.exponentialRampToValueAtTime(Math.max(20, spec.to * cue.rate), now + spec.duration);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + spec.duration + 0.02);
    if (spec.noise) {
      const length = Math.floor(ctx.sampleRate * spec.duration);
      const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < length; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / length);
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.connect(gain);
      src.start(now);
    }
  }
}
