/** Presentation rules anchored to M11_*.asm.txt. Never consume the simulation RNG here.
 * Timing in ticks is static evidence; the conversion to seconds follows the still-candidate engine Hz. */
import { SeededRandom, type GameEvent, type Point } from './core.js';

export interface SoundCue { key: string; gain: number; rate: number }

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
  'coin-appear': 'coinappear',
  coin: 'coin',
  'coin-vanish': 'coinvanish',
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
  if (event.kind === 'cleanup') {
    // End-of-level tally pop (D-10): pitch rises from 1 to 1.5 along the track.
    return [{ key: 'bonuspop', gain: 1, rate: 1 + 0.5 * clamp01(Number(event.progress)) }];
  }
  if (event.kind === 'gap') {
    const count = Math.max(1, Math.trunc(Number(event.count) || 1));
    return Array.from({ length: Math.min(3, count) }, (_, i) => ({ key: 'gap', gain: 1, rate: Math.pow(2, (i === 0 ? 0 : i + 1) / 12) }));
  }
  if (event.kind !== 'destroy') return [];
  const index = Math.max(0, Math.trunc(Number(event.depth) || 1) - 1);
  return [
    { key: 'destroy' + Math.min(5, index + 1), gain: 1, rate: 1 },
    { key: 'combo', gain: Math.min(1, 0.4 + 0.2 * index), rate: Math.pow(2, Math.min(index, 24) / 6) },
  ];
}

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

export function particleColor(color: number): string {
  const rgb = PARTICLE_RGB[color] ?? 0xffffff;
  const r = Math.min(255, ((rgb >> 16) & 255) + 200);
  const g = Math.min(255, ((rgb >> 8) & 255) + 200);
  const b = Math.min(255, (rgb & 255) + 200);
  return `rgb(${r},${g},${b})`;
}

export interface BurstParticle { x: number; y: number; vx: number; vy: number; size: number }
export interface ColorBurst { id: number; x: number; y: number; color: number; start: number; particles: BurstParticle[] }

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
