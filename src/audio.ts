/**
 * Sound dispatch. Original Zuma resources are loaded when a local build supplies
 * them under assets/sounds/<key>.<ogg|m4a> (see sounds/manifest.json); otherwise
 * each cue is synthesised with WebAudio so the game stays audible without any
 * proprietary file. Every pack sound is decoded in parallel on the first user
 * gesture (D-07) so the first occurrence of a cue is already the original.
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

/** MIME types probed with `canPlayType` for each container shipped by the importer (D-06). */
const MIME: Record<string, string> = {
  ogg: 'audio/ogg; codecs="vorbis"',
  m4a: 'audio/mp4; codecs="mp4a.40.2"',
};

/** First listed format the browser reports playable (`canPlayType` non-empty); unknown formats are skipped. */
export function pickFormat(formats: string[], canPlay: (mime: string) => string): string | null {
  for (const format of formats) {
    const mime = MIME[format];
    if (mime && canPlay(mime)) return format;
  }
  return null;
}

/** Distance (track px) between the head ball and the skull under which the warning loop plays (D-08). */
export const WARNING_DISTANCE = 160;

export type LoopKey = 'rolling' | 'warning';

/** Loop gains derived from the simulation: rolling follows the chain speed, warning the head distance (D-08). */
export function loopLevels(input: { speed: number; feedSpeed: number; headDistance: number | null; playing: boolean }): { rolling: number; warning: number } {
  const rolling = input.playing && input.feedSpeed > 0 ? Math.max(0, Math.min(1, input.speed / input.feedSpeed)) : 0;
  const warning = input.playing && input.headDistance !== null && input.headDistance < WARNING_DISTANCE ? 1 : 0;
  return { rolling, warning };
}

/** Base volume of each loop at level 1. */
const LOOP_BASE: Record<LoopKey, number> = { rolling: 0.5, warning: 0.8 };
/** Seconds a loop stays allocated at level 0 before its source is stopped (T-04-12). */
const LOOP_IDLE_SECONDS = 2;

interface Loop { src: AudioBufferSourceNode; gain: GainNode; idleSince: number | null }

/** Sound manifest produced by tools/import-original.mjs: format 2 lists the containers per key; legacy is a key array. */
function parseManifest(raw: unknown): Record<string, string[]> {
  const sounds: Record<string, string[]> = {};
  if (Array.isArray(raw)) {
    for (const key of raw) if (typeof key === 'string') sounds[key] = ['ogg'];
    return sounds;
  }
  if (raw && typeof raw === 'object' && (raw as { format?: unknown }).format === 2) {
    const list = (raw as { sounds?: unknown }).sounds;
    if (list && typeof list === 'object') {
      for (const [key, formats] of Object.entries(list as Record<string, unknown>)) {
        if (Array.isArray(formats)) sounds[key] = formats.filter((f): f is string => typeof f === 'string');
      }
    }
  }
  return sounds;
}

export class AudioManager {
  enabled = true;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  /** Keys the pack provides in a playable format; a key is removed when its decode fails (synth fallback). */
  private available = new Set<string>();
  /** Chosen container per key. */
  private formats = new Map<string, string>();
  private loading = new Set<string>();
  private loops = new Map<LoopKey, Loop>();

  constructor(private readonly assetBase = 'assets/') {}

  /** Reads the manifest produced by `build --local` and picks one playable format per key. */
  async discover(): Promise<void> {
    try {
      const res = await fetch(assetUrl('sounds/manifest.json', this.assetBase), { cache: 'no-store' });
      if (!res.ok) return;
      const sounds = parseManifest((await res.json()) as unknown);
      const canPlay = this.probe();
      for (const [key, formats] of Object.entries(sounds)) {
        const format = pickFormat(formats, canPlay);
        if (!format) continue;
        this.formats.set(key, format);
        this.available.add(key);
      }
    } catch {
      /* no original assets: synthesis only */
    }
  }

  /** `canPlayType` of a throw-away <audio>; without one, assume Vorbis/Ogg. */
  private probe(): (mime: string) => string {
    try {
      const audio = document.createElement('audio');
      if (typeof audio.canPlayType === 'function') return mime => audio.canPlayType(mime);
    } catch {
      /* no DOM */
    }
    return mime => (mime.startsWith('audio/ogg') ? 'maybe' : '');
  }

  /** Must be called from a user gesture so the context can start; decodes every pack sound in parallel (D-07). */
  unlock(): void {
    if (!this.ctx) {
      const Ctor = (window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext);
      if (!Ctor) return;
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8;
      this.master.connect(this.ctx.destination);
      void this.preload();
    }
    if (this.ctx.state === 'suspended') void this.ctx.resume();
  }

  /** Fetches and decodes every available key at once; each failure only disables that key. */
  private async preload(): Promise<void> {
    await Promise.all([...this.available].map(key => this.load(key)));
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
      // Still decoding: stay silent rather than doubling the original with the synth.
      void this.load(cue.key);
      return;
    }
    this.synth(cue);
  }

  /**
   * Drives a looping pack sound (rolling / warning). `level` 0..1 scales the loop's
   * base volume with a short ramp; a loop left at 0 for LOOP_IDLE_SECONDS is stopped.
   */
  setLoop(key: LoopKey, level: number): void {
    const ctx = this.ctx;
    const master = this.master;
    const target = this.enabled && ctx && master ? Math.max(0, Math.min(1, level)) : 0;
    let loop = this.loops.get(key);
    if (!loop) {
      if (target <= 0 || !ctx || !master) return;
      const buffer = this.buffers.get(key);
      if (!buffer) return;
      const src = ctx.createBufferSource();
      src.buffer = buffer;
      src.loop = true;
      const gain = ctx.createGain();
      gain.gain.value = 0;
      src.connect(gain).connect(master);
      src.start();
      loop = { src, gain, idleSince: null };
      this.loops.set(key, loop);
    }
    if (!ctx) return;
    loop.gain.gain.setTargetAtTime(target * LOOP_BASE[key], ctx.currentTime, 0.05);
    if (target > 0) {
      loop.idleSince = null;
      return;
    }
    if (loop.idleSince === null) loop.idleSince = ctx.currentTime;
    else if (ctx.currentTime - loop.idleSince > LOOP_IDLE_SECONDS) this.stopLoop(key, loop);
  }

  /** Stops and releases every loop (level change, panels, pause). */
  stopLoops(): void {
    for (const [key, loop] of this.loops) this.stopLoop(key, loop);
  }

  private stopLoop(key: LoopKey, loop: Loop): void {
    try { loop.src.stop(); } catch { /* already stopped */ }
    loop.src.disconnect();
    loop.gain.disconnect();
    this.loops.delete(key);
  }

  private async load(key: string): Promise<void> {
    if (!this.ctx || this.loading.has(key) || this.buffers.has(key)) return;
    this.loading.add(key);
    try {
      const format = this.formats.get(key) ?? 'ogg';
      const res = await fetch(assetUrl(`sounds/${key}.${format}`, this.assetBase));
      if (!res.ok) throw new Error(String(res.status));
      this.buffers.set(key, await this.ctx.decodeAudioData(await res.arrayBuffer()));
    } catch {
      this.available.delete(key);
    } finally {
      this.loading.delete(key);
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
