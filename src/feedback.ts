/** Presentation rules anchored to M11_*.asm.txt. Never consume the simulation RNG here.
 * Timing in ticks is static evidence; the conversion to seconds follows the still-candidate engine Hz. */
import { SeededRandom, type GameEvent, type Point } from './core.js';

export interface SoundCue {
  key: string;
  gain: number;
  rate: number;
  /** Seconds before the cue starts (0 by default; clamped to 0..1 by audio.play). */
  delay?: number;
  /** Stereo position −1..1 (0 by default; clamped by audio.play, StereoPannerNode when available). */
  pan?: number;
}

const SIMPLE_CUES: Record<string, string> = {
  fire: 'fire',
  insert: 'insert',
  merge: 'merge',
  swap: 'swap',
  zuma: 'zuma',
  won: 'levelwin',
  lost: 'lose',
  gameover: 'gameover',
  'power-spawn': 'powerup',
  coin: 'coin',
};

/** 0..1 clamp, non-finite → 0 (shared with audio.ts: one definition in the standalone bundle). */
export const clamp01 = (v: number): number => Math.max(0, Math.min(1, Number.isFinite(v) ? v : 0));

const POWER_CUES: Record<string, string> = {
  bomb: 'powerbomb',
  slow: 'powerslow',
  backwards: 'powerback',
  accuracy: 'poweraccuracy',
};

/** Maps a simulation event to the original sound resources it triggers. */
export function soundCues(event: GameEvent): SoundCue[] {
  const simple = SIMPLE_CUES[event.kind];
  if (simple) return [{ key: simple, gain: 1, rate: 1 }];
  if (event.kind === 'power-activate') {
    const key = POWER_CUES[String(event.power)];
    return key ? [{ key, gain: 1, rate: 1 }] : [];
  }
  if (event.kind === 'streak') {
    const n = Math.max(5, Math.trunc(Number(event.streak) || 5));
    return [{ key: 'streak', gain: 1, rate: Math.pow(2, (n - 5) / 12) }];
  }
  if (event.kind === 'extra-life') {
    // 0x417380: PlaySample(SOUND_EXTRA_LIFE) then the same sample 30 and 60 maj later (0x415350): three
    // `extralife` at 0 / 0.3 / 0.6 s, one series per AddScore whatever the number of lives; no text in game.
    return EXTRA_LIFE_DELAYS.map(delay => ({ key: 'extralife', gain: 1, rate: 1, delay }));
  }
  if (event.kind === 'coin-appear' || event.kind === 'coin-vanish') {
    // JEWEL_APPEAR `jewelappear` at volume 0.40 (resources.xml), JEWEL_DISAPPEAR `gemvanishes` at 1, both panned by
    // the coin x (0x401d40: (x − 320) × 3000 / 320 in DirectSound units ±10 000 → ±0.3, hypothesis C3).
    const appear = event.kind === 'coin-appear';
    return [{ key: appear ? 'coinappear' : 'coinvanish', gain: appear ? 0.4 : 1, rate: 1, pan: coinPan(Number(event.x)) }];
  }
  if (event.kind === 'cleanup-pop') {
    // End-of-level tally (0x421550, §7): `endoflevelpop1` every 10 updates at volume 0.5, pitch not
    // modulated; the `cleanup` step itself is silent (the rising pitch belongs to the STATS count-up).
    return [{ key: 'bonuspop', gain: 0.5, rate: 1 }];
  }
  if (event.kind === 'gap') {
    // 0x420db1–0x420f10: `gapbonus1` at once, then again 15 maj (150 ms) later at +2 semitones for a
    // double gap and 30 maj (300 ms) later at +3 for a triple; never more than three.
    const count = Math.max(1, Math.trunc(Number(event.count) || 1));
    return Array.from({ length: Math.min(3, count) }, (_, i) => ({ key: 'gap', gain: 1, rate: Math.pow(2, (i === 0 ? 0 : i + 1) / 12), delay: GAP_CUE_DELAYS[i] }));
  }
  if (event.kind !== 'destroy') return [];
  // 0x4214b7–0x421514: BALLDESTROYED1..5 by combo, then `chime1` at 2 × combo semitones and volume
  // min(1, 0.4 + 0.2 × combo). The original skips both when the group triggered a power-up
  // (`curve+0x7c`, hypothesis B4): not implemented.
  const index = Math.max(0, Math.trunc(Number(event.depth) || 1) - 1);
  return [
    { key: 'destroy' + Math.min(5, index + 1), gain: 1, rate: 1 },
    { key: 'combo', gain: Math.min(1, 0.4 + 0.2 * index), rate: Math.pow(2, Math.min(index, 24) / 6) },
  ];
}

/** Start of the three `extralife`, seconds (0, 30 and 60 maj at 100 Hz). */
const EXTRA_LIFE_DELAYS = [0, 0.3, 0.6] as const;

/** Pan of a coin sound from its x: (x − 320) / 320 × 0.3, bounded to ±0.3; non-finite → 0. */
function coinPan(x: number): number {
  if (!Number.isFinite(x)) return 0;
  const pan = Math.max(-0.3, Math.min(0.3, ((x - 320) / 320) * 0.3));
  return pan === 0 ? 0 : pan;
}

/** Start of the 1st / 2nd / 3rd `gapbonus1`, seconds (0, 15 and 30 maj at 100 Hz). */
const GAP_CUE_DELAYS = [0, 0.15, 0.3] as const;

export const EXPLOSION_RGB = [0x80ffff, 0xffff40, 0xffaaaa, 0x80ff80, 0xff80ff, 0xffffff] as const;
export const PARTICLE_RGB = [0x1980ff, 0xffff00, 0xff0000, 0x00ff00, 0xff00ff, 0xffffff] as const;
export const EXPLOSION_FRAME_TICKS = 3, EXPLOSION_FRAME_COUNT = 13, PARTICLE_LIFE_TICKS = 40, PARTICLE_COUNT = 60;

export function explosionFrame(counter: number): number {
  const frame = Math.floor(counter / EXPLOSION_FRAME_TICKS);
  return counter >= 0 && frame < EXPLOSION_FRAME_COUNT ? frame : -1;
}

/** Arc length of one full ball rotation (radius 16). */
export const BALL_CIRCUMFERENCE = 2 * Math.PI * 16;

/**
 * Rolling sprite frame for arc length s; monotone in s so recoil visibly rolls
 * the balls backwards (R2.0.14 lock). Wraps every `circumference` px; `frames <= 1` → 0.
 */
export function rollFrame(s: number, frames: number, circumference = BALL_CIRCUMFERENCE): number {
  if (!(frames > 1) || !(circumference > 0)) return 0;
  const c = circumference;
  return Math.floor((((s % c) + c) % c) / c * frames) % frames;
}

/** Coin rotation frame (D-08): `COIN.gif` has 30 frames played at 20 frames/s, i.e. one frame every 3 ticks at 60 Hz. */
export function coinFrame(tick: number, frames = 30, ticksPerFrame = 3): number {
  if (!(frames > 0) || !(ticksPerFrame > 0)) return 0;
  const t = Math.max(0, Math.floor(tick));
  return Math.floor(t / ticksPerFrame) % frames;
}

/** Periodic sparkle over the coin (D-08): frames 0..13 over `frames × ticksPerFrame` ticks once per `period`, −1 otherwise. */
export function sparkleFrame(tick: number, frames = 14, period = 90, ticksPerFrame = 2): number {
  if (!(frames > 0) || !(period > 0) || !(ticksPerFrame > 0)) return -1;
  const t = Math.max(0, Math.floor(tick));
  const phase = t % period;
  const window = frames * ticksPerFrame;
  return phase < window ? Math.floor(phase / ticksPerFrame) : -1;
}

/**
 * Where a ball still opening its slot (`Ball.width` 0..1) is drawn: it slides
 * from its landing point `from` to its track position `to` with an ease-out,
 * swelling by at most 15 % half-way so the insertion reads as a movement (D-11).
 */
export function insertionPose(width: number, from: Point, to: Point): { x: number; y: number; scale: number } {
  const w = Math.max(0, Math.min(1, width));
  const e = 1 - (1 - w) * (1 - w);
  return {
    x: from.x + (to.x - from.x) * e,
    y: from.y + (to.y - from.y) * e,
    scale: 1 + 0.15 * Math.sin(Math.PI * w),
  };
}

export function particleAlpha(counter: number): number {
  return Math.max(0, Math.min(1, (PARTICLE_LIFE_TICKS - counter) / 20));
}

/**
 * `#rrggbb` of a ball colour for the floating « +N » of a match (the original tints it from the
 * per-colour table 0x587408, not extracted: the colour of the ball as rendered is used — hypothesis
 * for 05-09); white outside the table.
 */
export function ballCss(color: number): string {
  const rgb = PARTICLE_RGB[color] ?? 0xffffff;
  return '#' + rgb.toString(16).padStart(6, '0');
}

export function particleColor(color: number): string {
  const rgb = PARTICLE_RGB[color] ?? 0xffffff;
  const r = Math.min(255, ((rgb >> 16) & 255) + 200);
  const g = Math.min(255, ((rgb >> 8) & 255) + 200);
  const b = Math.min(255, (rgb & 255) + 200);
  return `rgb(${r},${g},${b})`;
}

export interface BurstParticle { x: number; y: number; vx: number; vy: number; size: number }
/** `layer` = draw pass of the burst (the priority of its ball, D-23), set by the presentation; absent → the last pass. */
export interface ColorBurst { id: number; x: number; y: number; color: number; start: number; particles: BurstParticle[]; layer?: number }

/** Deterministic particle burst for a destroyed ball; seeded from the ball id and tick only. */
export function makeColorBurst(ball: { id: number; x: number; y: number; color: number }, tick: number): ColorBurst {
  const random = new SeededRandom((Math.imul(ball.id, 0x45d9f3b) ^ Math.imul(tick, 0x119de1f3)) >>> 0);
  const ri = (n: number): number => Math.floor(random.next() * n);
  const particles = Array.from({ length: PARTICLE_COUNT }, () => {
    const angle = Math.fround(ri(360) * 3.141590118408203 / 180);
    const speed = Math.fround(ri(500) / 500);
    const vx = Math.fround(Math.fround(Math.cos(angle)) * speed);
    const vy = Math.fround(Math.fround(Math.sin(angle)) * speed);
    const offset = ri(30);
    return { x: Math.fround(ball.x + offset * vx), y: Math.fround(ball.y + offset * vy), vx, vy, size: ri(10) < 2 ? 2 : 1 };
  });
  return { ...ball, start: tick, particles };
}

/**
 * 5 random sparkles ± 10 px per tally step (0x4151e0): white (colour 5), slow drift, seeded from
 * the step and the tick only — presentation RNG, never the simulation's.
 */
export function makeSparks(x: number, y: number, step: number, tick: number): ColorBurst {
  const random = new SeededRandom((Math.imul(step + 1, 0x9e3779b1) ^ Math.imul(tick, 0x85ebca6b)) >>> 0);
  const ri = (n: number): number => Math.floor(random.next() * n);
  const particles = Array.from({ length: 5 }, () => ({
    x: x + (ri(21) - 10),
    y: y + (ri(21) - 10),
    vx: (ri(201) - 100) / 400,
    vy: -ri(100) / 300,
    size: ri(10) < 3 ? 2 : 1,
  }));
  return { id: step, x, y, color: 5, start: tick, particles };
}
