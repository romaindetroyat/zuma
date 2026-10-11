/**
 * Sound dispatch. Original Zuma resources are loaded when a local build supplies
 * them under assets/sounds/<key>.<ogg|m4a> (see sounds/manifest.json); otherwise
 * each cue is synthesised with WebAudio so the game stays audible without any
 * proprietary file. Every pack sound is decoded in parallel on the first user
 * gesture (D-07) so the first occurrence of a cue is already the original. The rolling
 * loop plays at a constant gain whenever the chain moves and the warning beat at a
 * constant gain with the original interval: neither is modulated by the speed (D-17, §5).
 */
import { clamp01, type SoundCue } from './feedback.js';
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
  powerbomb: { type: 'sawtooth', from: 160, to: 30, duration: 0.6, gain: 0.4, noise: true },
  powerslow: { type: 'sine', from: 800, to: 200, duration: 0.7, gain: 0.3 },
  powerback: { type: 'square', from: 300, to: 700, duration: 0.5, gain: 0.25 },
  poweraccuracy: { type: 'triangle', from: 1000, to: 2000, duration: 0.4, gain: 0.25 },
  warning: { type: 'sine', from: 180, to: 110, duration: 0.14, gain: 0.3 },
  extralife: { type: 'triangle', from: 660, to: 1320, duration: 0.22, gain: 0.25 },
  coinappear: { type: 'sine', from: 1400, to: 2100, duration: 0.15, gain: 0.2 },
  coinvanish: { type: 'sine', from: 900, to: 450, duration: 0.2, gain: 0.2 },
};

/** Start offset of a cue, seconds: `SoundCue.delay` bounded to 0..1, absent or non-finite → 0 (T-05-24). */
export function clampDelay(delay: number | undefined): number {
  return clamp01(Number(delay));
}

/** Stereo position of a cue, −1..1; absent or non-finite → 0 (centre, T-05-34). */
export function clampPan(pan: number | undefined): number {
  const p = Number(pan);
  if (!Number.isFinite(p)) return 0;
  return Math.max(-1, Math.min(1, p));
}

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

/**
 * Distance (track px) between the head ball and the skull under which the warning beat
 * starts: the original `danger` setting, 600 px (0x41a9ac; never overridden by levels.xml).
 */
export const WARNING_DISTANCE = 600;
/** Beat gain: the original plays `warning1` at full volume whatever the distance (0x418a74). */
export const WARNING_GAIN = 1;

/** Threat level 0..1 from the head ball's distance to the skull: 0 outside WARNING_DISTANCE, 1 at the skull. */
export function warningLevel(headDistance: number | null, playing: boolean): number {
  if (!playing || headDistance === null) return 0;
  return clamp01(1 - headDistance / WARNING_DISTANCE);
}

/**
 * Seconds between two beats for `remainingPx` to the skull (0x418a74, §5): the alert waits
 * `100 + 4000 × rem / danger` ms, but the next one cannot fire before the trail light has run
 * from the head to the skull at 11 px per update plus 60 updates — `(rem / 11 + 60)` × 10 ms.
 * 4.1 s on entering the zone, 2.1 s at 300 px, ≈ 0.77 s at 100 px, 0.6 s at the skull.
 */
export function warningIntervalAt(remainingPx: number): number {
  const r = Number.isFinite(remainingPx) ? Math.max(0, Math.min(WARNING_DISTANCE, remainingPx)) : 0;
  return Math.max(0.1 + 4 * r / WARNING_DISTANCE, (r / 11 + 60) / 100);
}

/** Seconds until the next warning beat from the threat level (1 − distance / WARNING_DISTANCE). */
export function warningInterval(level: number): number {
  return warningIntervalAt((1 - clamp01(level)) * WARNING_DISTANCE);
}

/** Gain of a warning beat: constant (the level is accepted for symmetry with warningInterval). */
export function warningGain(_level?: number): number {
  return WARNING_GAIN;
}

export type LoopKey = 'rolling';
export type PulseKey = 'warning';

/**
 * Gain of the rolling loop while the chain moves (D-17: constant, no modulation by the speed). 0.35 is the user's
 * choice (D-29, U32); the original plays the sample at 1.0 × the « Sons » slider, one channel per curve (0x419610) —
 * a single loop here.
 */
export const ROLLING_GAIN = 0.35;
/** Displacement (px/s of the fastest ball) above which the chain is heard rolling. */
export const ROLLING_MIN_SPEED = 2;
/** Attack when the chain starts rolling (the original restarts at 1.0 at once; 50 ms avoid the click). */
export const ROLLING_ATTACK_SECONDS = 0.05;
/** Linear fade when the chain stops: the original fades from 0.98 by 0.02 per update, ≈ 0.5 s (0x402880). */
export const ROLLING_FADE_SECONDS = 0.5;

/** Loop level derived from the simulation: rolling is on (1) above ROLLING_MIN_SPEED while playing, else off (0) (D-17). */
export function loopLevels(input: { speed: number; playing: boolean }): { rolling: 0 | 1 } {
  const rolling = input.playing && Number.isFinite(input.speed) && input.speed > ROLLING_MIN_SPEED ? 1 : 0;
  return { rolling };
}

/**
 * Ramp to schedule when a loop's target level goes from `previous` (null = never set, i.e. 0) to
 * `target`: null when unchanged, else 50 ms up to `target × ROLLING_GAIN` or ROLLING_FADE_SECONDS
 * down to 0. Re-arming the ramp every frame restarted the 150 ms fade from the current value
 * (exponential-like decay, deferred-items 05-07): the ramp is now armed once per target change.
 */
export function rampPlan(previous: number | null, target: number): { to: number; seconds: number } | null {
  if ((previous ?? 0) === target) return null;
  return target > 0 ? { to: target * ROLLING_GAIN, seconds: ROLLING_ATTACK_SECONDS } : { to: 0, seconds: ROLLING_FADE_SECONDS };
}

/** Seconds a loop stays allocated at level 0 before its source is stopped (T-04-12). */
const LOOP_IDLE_SECONDS = 2;

/** `target` = the last level the gain was ramped towards (0 at creation: the attack is armed by the first call). */
interface Loop { src: AudioBufferSourceNode; gain: GainNode; idleSince: number | null; target: number }
/** A repeated one-shot: the latest level sets the gain and the delay of the next beat. */
interface Pulse { level: number; timer: number }

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

/**
 * Safari's Audio Session API (iOS / iPadOS 16.4+): `ambient` mixes with other audio and follows the silent switch, as
 * games usually do (hypothesis to confirm in UAT 9 against `playback`). Absent elsewhere: nothing happens.
 */
function setAudioSession(): void {
  try {
    const session = (navigator as Navigator & { audioSession?: { type: string } }).audioSession;
    if (session) session.type = 'ambient';
  } catch {
    /* not settable */
  }
}

export class AudioManager {
  enabled = true;
  /** « Sons » slider of the menu, 0..1 (D-24); the master gain is 0.8 × volume. `enabled` (key M) stays a separate mute. */
  private sfxVolume = 1;
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private buffers = new Map<string, AudioBuffer>();
  /** Keys the pack provides in a playable format; a key is removed when its decode fails (synth fallback). */
  private available = new Set<string>();
  /** Chosen container per key. */
  private formats = new Map<string, string>();
  private loading = new Set<string>();
  private loops = new Map<LoopKey, Loop>();
  private pulses = new Map<PulseKey, Pulse>();

  constructor(private readonly assetBase = 'assets/') {}

  get volume(): number {
    return this.sfxVolume;
  }

  /** Sets the « Sons » volume, bounded 0..1 (non-finite → 1, T-05-31), applied to the master gain at once. */
  setVolume(v: number): void {
    this.sfxVolume = Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 1;
    if (this.master) this.master.gain.value = 0.8 * this.volume;
  }

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
      setAudioSession();
      this.ctx = new Ctor();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.8 * this.volume;
      this.master.connect(this.ctx.destination);
      void this.preload();
    }
    this.resume();
  }

  /** Resumes a context the browser suspended, or that iOS `interrupted` (call, other app, lock). */
  private resume(): void {
    const state: string = this.ctx?.state ?? 'closed';
    if (state === 'suspended' || state === 'interrupted') void this.ctx?.resume().catch(() => undefined);
  }

  /**
   * R2.0.20 (D-38 §6): iOS does not always take `touchstart` / `pointerdown` as an activation gesture, so the context
   * is also unlocked on `touchend`, `pointerup` and `click`; it is resumed when the page becomes visible again.
   */
  bindUnlock(target: EventTarget = window): void {
    const unlock = (): void => this.unlock();
    for (const type of ['touchend', 'pointerup', 'click']) target.addEventListener(type, unlock, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') this.resume();
    });
  }

  /** Fetches and decodes every available key at once; each failure only disables that key. */
  private async preload(): Promise<void> {
    await Promise.all([...this.available].map(key => this.load(key)));
  }

  /**
   * Node a one-shot connects to: the master, or a StereoPannerNode at `pan` feeding it when the cue is panned and
   * the browser has one (otherwise the cue plays centred).
   */
  private output(pan: number): AudioNode | null {
    const ctx = this.ctx;
    const master = this.master;
    if (!ctx || !master) return null;
    if (pan === 0 || typeof ctx.createStereoPanner !== 'function') return master;
    try {
      const panner = ctx.createStereoPanner();
      panner.pan.value = pan;
      panner.connect(master);
      return panner;
    } catch {
      return master;
    }
  }

  /** Plays a cue now, or `cue.delay` seconds later (the delayed `gapbonus1` / `extralife`), panned by `cue.pan`. */
  play(cue: SoundCue): void {
    if (!this.enabled || !this.ctx || !this.master) return;
    const delay = clampDelay(cue.delay);
    const pan = clampPan(cue.pan);
    if (this.available.has(cue.key)) {
      const buffer = this.buffers.get(cue.key);
      if (buffer) {
        const out = this.output(pan);
        if (!out) return;
        const src = this.ctx.createBufferSource();
        src.buffer = buffer;
        src.playbackRate.value = cue.rate;
        const gain = this.ctx.createGain();
        gain.gain.value = cue.gain;
        src.connect(gain).connect(out);
        const now = this.ctx.currentTime;
        src.start(now + delay);
        return;
      }
      // Still decoding: stay silent rather than doubling the original with the synth.
      void this.load(cue.key);
      return;
    }
    this.synth(cue, delay, pan);
  }

  /**
   * Drives a looping pack sound (rolling) at pitch 1. `level` 0..1 scales ROLLING_GAIN:
   * a rising target ramps in over 50 ms, a nil target fades out over ROLLING_FADE_SECONDS
   * (D-17), each ramp armed once per target change (rampPlan); a loop left at 0 for
   * LOOP_IDLE_SECONDS is stopped (the idle clock runs on every call).
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
      loop = { src, gain, idleSince: null, target: 0 };
      this.loops.set(key, loop);
    }
    if (!ctx) return;
    const now = ctx.currentTime;
    const g = loop.gain.gain;
    const plan = rampPlan(loop.target, target);
    if (plan) {
      g.cancelScheduledValues(now);
      g.setValueAtTime(g.value, now);
      g.linearRampToValueAtTime(plan.to, now + plan.seconds);
      loop.target = target;
    }
    if (target > 0) {
      loop.idleSince = null;
      return;
    }
    if (loop.idleSince === null) loop.idleSince = ctx.currentTime;
    else if (ctx.currentTime - loop.idleSince > LOOP_IDLE_SECONDS) this.stopLoop(key, loop);
  }

  /**
   * Repeated beat (the original `warning1`, 0.37 s, is a single hit — not a loop).
   * `level` 0..1: 0 stops the scheduling (the current beat finishes on its own);
   * above 0 the beat plays now if it was silent, then again every
   * `warningInterval(level)` seconds at `warningGain(level)`, both re-read at each beat
   * so the rhythm tightens progressively as the chain approaches the skull.
   */
  pulse(key: PulseKey, level: number): void {
    const target = this.enabled && this.ctx && this.master ? clamp01(level) : 0;
    const pulse = this.pulses.get(key);
    if (target <= 0) {
      if (pulse) this.stopPulse(key, pulse);
      return;
    }
    if (pulse) {
      pulse.level = target;
      return;
    }
    this.pulses.set(key, { level: target, timer: 0 });
    this.beat(key);
  }

  private beat(key: PulseKey): void {
    const pulse = this.pulses.get(key);
    if (!pulse) return;
    this.play({ key, gain: warningGain(pulse.level), rate: 1 });
    pulse.timer = window.setTimeout(() => this.beat(key), warningInterval(pulse.level) * 1000);
  }

  private stopPulse(key: PulseKey, pulse: Pulse): void {
    window.clearTimeout(pulse.timer);
    this.pulses.delete(key);
  }

  /** Stops and releases every loop and pulse (level change, panels, pause). */
  stopLoops(): void {
    for (const [key, loop] of this.loops) this.stopLoop(key, loop);
    for (const [key, pulse] of this.pulses) this.stopPulse(key, pulse);
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

  /** Synthesised fallback; `delay` shifts the whole envelope (the simplest equivalent of a delayed start), `pan` places it. */
  private synth(cue: SoundCue, delay = 0, pan = 0): void {
    const ctx = this.ctx;
    const out = this.output(pan);
    if (!ctx || !out) return;
    const spec = SYNTH[cue.key] ?? SYNTH.insert;
    const now = ctx.currentTime + delay;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.0001, now);
    gain.gain.exponentialRampToValueAtTime(spec.gain * cue.gain, now + 0.01);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + spec.duration);
    gain.connect(out);
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
