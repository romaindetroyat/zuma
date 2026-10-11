/**
 * Main menu of the original (spike 06 Q1, D-01, D-11): the welcome screen composed from the pack — sky scrolling
 * behind `mmscreen` holed by its mask, pupils under the eyelids, additive sun glow, sun, the five stone buttons with
 * their baked French labels, the welcome line and the UFO easter egg. Geometry and timings are read in the executable
 * (MainMenu: ctor 0x43c900, layout 0x43cf60, draw 0x43d1a0, eyes 0x43c050 / 0x43c270 / 0x43c430, hover sound 0x43ed30,
 * UFO 0x43c550 / 0x43d880 / 0x43d9a0, hover semitones 0x434dd1–0x434e01).
 *
 * Time unit: the original counts updates at 100 Hz (`maj`, 10 ms); the presentation passes `c = ⌊(now − t0) / 10⌋`
 * since the screen was entered. Everything except the drawing / loading functions is pure so the Node tests lock it;
 * nothing touches the DOM at module level. Top-level names carry an `mm` / `MM` / `welcome` prefix (the standalone
 * concatenates every module into one scope).
 */

export type MmStoneId = 'adventure' | 'gauntlet' | 'options' | 'moregames' | 'quit';
export interface MmStone { id: MmStoneId; image: string; x: number; y: number; w: number; h: number; semitones: number; enabled: boolean }

/** Geometry of the main menu in logical 640 × 480 pixels (positions = top-left corners unless noted). */
export const MM = {
  /** `mmsky` 520 × 161, drawn at x = o − w, o, o + w (y 0) with o = (c >> 3) mod w: 1 px every 8 maj = 12.5 px/s. */
  sky: { w: 520, h: 161, pxPerMaj: 0.125 },
  /** `_mmsunglow.jpg` (the mask is the picture), additive, rotating 0.3° per maj, alpha 75 → 150 → 75 over 500 maj. */
  glow: { x: -69, y: -63, w: 229, h: 227, degPerMaj: 0.3, period: 500, min: 75, max: 150 },
  sun: { x: 0, y: 2 },
  /**
   * Pupils: rest centres (doubles 0x54f230–0x54f248) and picture sizes. `reach`: fallback A8 of the research — the pupil
   * moves `step` px towards its target, bounded by an ellipse of `x` × `y` px (the exact orbit of 0x43c050 is MEDIUM).
   */
  eyes: { left: { x: 219, y: 368, w: 21, h: 21 }, right: { x: 276, y: 355, w: 14, h: 17 }, reach: { x: 6, y: 4, step: 4 } },
  /** Eyelids: `mmscreen` × `_mmeyemask` cut at (191, 331), drawn over the pupils (0x433c40 at construction). */
  eyeMask: { x: 191, y: 331, w: 105, h: 54 },
  /** A click in x ∈ [63, 328), y ∈ [276, 471) toggles « the eyes follow the pointer » (0x43c430). */
  frog: { x: 63, y: 276, w: 265, h: 195 },
  /** `WELCOME_TO_ZUMA, <name>!` in NativeAlienExtended16, white, centred on 320, baseline 32 (PopCap DrawString: y = baseline). */
  welcome: { cx: 320, baseline: 32 },
  /**
   * Stones (0x434d10: three horizontal states normal / hover / pressed, label inside the picture), Layout positions
   * (0x43cf60), choral1 hover transposition `[2, 4, 0, −12, −5][id] + 10` semitones. D-11: only Aventure and Options
   * are active; the three others are drawn in their normal state, without hover, sound or click.
   */
  stones: [
    { id: 'adventure', image: 'mmarcadebutton', x: 452, y: 64, w: 163, h: 92, semitones: 12, enabled: true },
    { id: 'gauntlet', image: 'mmgauntletbutton', x: 436, y: 153, w: 180, h: 83, semitones: 14, enabled: false },
    { id: 'options', image: 'mmoptionsbutton', x: 418, y: 236, w: 203, h: 74, semitones: 10, enabled: true },
    { id: 'moregames', image: 'mmmoregamesbutton', x: 406, y: 306, w: 209, h: 83, semitones: -2, enabled: false },
    { id: 'quit', image: 'mmquitbutton', x: 394, y: 372, w: 220, h: 100, semitones: 5, enabled: false },
  ] as ReadonlyArray<MmStone>,
  /**
   * UFO (`mmufo` 175 × 504 = 6 frames of 84, frame (c >> 1) mod 5): (−50, −50) → (300, 210) in 300 maj, hover 1 000 maj
   * on x = 300 + 40 sin a, y = 210 − 15 cos a (a += 1° per maj), leaves for (−200, −200) in 50 maj, waits 100 maj
   * (loop still playing), then stops. Positions are the frame's top-left corner (hypothesis: 0x43d880 draws at (x, y)).
   */
  ufo: { w: 175, h: 84, frames: 6, from: [-50, -50], to: [300, 210], inMaj: 300, hoverMaj: 1000, out: [-200, -200], outMaj: 50, waitMaj: 100, swing: { x: 40, y: 15, degPerMaj: 1 } },
} as const;

/** Welcome-line hit box around the baseline (NativeAlienExtended16: ≈ 16 px of ascent). */
const MM_LINE_ABOVE = 20;
const MM_LINE_BELOW = 6;

const mmFinite = (c: number): number => (Number.isFinite(c) ? c : 0);
const mmMod = (v: number, m: number): number => ((v % m) + m) % m;

/** Sky offset o = (c >> 3) mod 520 (draw x = o − 520, o, o + 520); non-finite → 0, never negative. */
export function mmSkyOffset(c: number): number {
  return mmMod(Math.floor(mmFinite(c) / 8), MM.sky.w);
}

/** Sun glow: alpha (75 + ⌊75 × d / 250⌋) / 255 with d = c mod 500 folded beyond 250, angle c × 0.3° in radians (mod 2π). */
export function mmGlow(c: number): { alpha: number; angle: number } {
  const t = Math.floor(mmFinite(c));
  const half = MM.glow.period / 2;
  let d = mmMod(t, MM.glow.period);
  if (d > half) d = MM.glow.period - d;
  const alpha = (MM.glow.min + Math.floor(((MM.glow.max - MM.glow.min) * d) / half)) / 255;
  // c × 3 / 10 keeps whole degrees exact (c × 0.3 is not: 100 × 0.3 = 30.000000000000004).
  const degrees = mmMod((t * 3) / 10, 360);
  return { alpha, angle: (degrees * Math.PI) / 180 };
}

export type EyeMode = 'rest' | 'follow';
export interface MmPoint { x: number; y: number }

/** One pupil: rest + `step` px towards the target, scaled back onto the reach ellipse when outside it. */
function mmPupil(rest: MmPoint, target: MmPoint): MmPoint {
  const dx = target.x - rest.x;
  const dy = target.y - rest.y;
  const len = Math.hypot(dx, dy);
  if (!(len > 0) || !Number.isFinite(len)) return { x: rest.x, y: rest.y };
  const R = MM.eyes.reach;
  let ox = (dx / len) * R.step;
  let oy = (dy / len) * R.step;
  const e = (ox / R.x) ** 2 + (oy / R.y) ** 2;
  if (e > 1) {
    const k = 1 / Math.sqrt(e);
    ox *= k;
    oy *= k;
  }
  return { x: rest.x + ox, y: rest.y + oy };
}

/**
 * Pupil centres. 'rest' (or no / non-finite target): the fixed rest positions. 'follow': each pupil looks at the target
 * (the pointer once the frog was clicked, or the flying UFO) with the A8 fallback orbit.
 */
export function mmEyes(mode: EyeMode, target: MmPoint | null): { left: MmPoint; right: MmPoint } {
  const L = { x: MM.eyes.left.x, y: MM.eyes.left.y };
  const R = { x: MM.eyes.right.x, y: MM.eyes.right.y };
  if (mode !== 'follow' || !target || !Number.isFinite(target.x) || !Number.isFinite(target.y)) return { left: L, right: R };
  return { left: mmPupil(L, target), right: mmPupil(R, target) };
}

export interface UfoState { phase: 'idle' | 'in' | 'hover' | 'out' | 'wait'; t0: number }
export interface UfoFrame { x: number; y: number; frame: number; visible: boolean; sound: boolean; next: UfoState }

const mmLerp = (a: number, b: number, t: number): number => a + (b - a) * t;

/** Hover position `t` maj after the hover started. */
function mmUfoHover(t: number): MmPoint {
  const a = (t * MM.ufo.swing.degPerMaj * Math.PI) / 180;
  return { x: MM.ufo.to[0] + MM.ufo.swing.x * Math.sin(a), y: MM.ufo.to[1] - MM.ufo.swing.y * Math.cos(a) };
}

/**
 * UFO at counter `c` from its state; `next` is the state to keep (the same object while the phase holds). Each leg ends
 * on its arrival point at its last maj (inclusive), then hands over; a long jump of the counter walks the phases at once.
 */
export function mmUfo(state: UfoState, c: number): UfoFrame {
  const U = MM.ufo;
  const hidden = (next: UfoState, sound: boolean): UfoFrame => ({ x: U.out[0], y: U.out[1], frame: 0, visible: false, sound, next });
  if (!Number.isFinite(c) || !Number.isFinite(state.t0)) return hidden(state, false);
  const frame = mmMod(Math.floor(c / 2), 5);
  let s = state;
  for (let guard = 0; guard < 8; guard++) {
    const t = Math.max(0, c - s.t0);
    switch (s.phase) {
      case 'idle':
        return hidden(s, false);
      case 'in':
        if (t <= U.inMaj) {
          const k = t / U.inMaj;
          const next = t >= U.inMaj ? { phase: 'hover' as const, t0: s.t0 + U.inMaj } : s;
          return { x: mmLerp(U.from[0], U.to[0], k), y: mmLerp(U.from[1], U.to[1], k), frame, visible: true, sound: true, next };
        }
        s = { phase: 'hover', t0: s.t0 + U.inMaj };
        break;
      case 'hover':
        if (t < U.hoverMaj) {
          const p = mmUfoHover(t);
          return { x: p.x, y: p.y, frame, visible: true, sound: true, next: s };
        }
        s = { phase: 'out', t0: s.t0 + U.hoverMaj };
        break;
      case 'out':
        if (t <= U.outMaj) {
          const from = mmUfoHover(U.hoverMaj);
          const k = t / U.outMaj;
          const next = t >= U.outMaj ? { phase: 'wait' as const, t0: s.t0 + U.outMaj } : s;
          return { x: mmLerp(from.x, U.out[0], k), y: mmLerp(from.y, U.out[1], k), frame, visible: true, sound: true, next };
        }
        s = { phase: 'wait', t0: s.t0 + U.outMaj };
        break;
      case 'wait':
        if (t < U.waitMaj) return hidden(s, true);
        s = { phase: 'idle', t0: s.t0 + U.waitMaj };
        break;
      default:
        return hidden({ phase: 'idle', t0: 0 }, false);
    }
  }
  return hidden(s, false);
}

/**
 * Hover-order counter (0x5a1330): entering stone i advances when i is the next expected one; the pass over stone 4
 * after 0..3 counts one lap; at 3 laps the UFO is launched and the counter starts again. Any other stone resets the
 * expectation (to 1 when it is stone 0, which begins a new pass) and keeps the laps already made — the simplest rule,
 * the original's handling of a skip was not read. Call it on each entry into a stone (not on every move).
 */
export function mmHoverSequence(seq: { expect: number; laps: number }, stone: number): { seq: { expect: number; laps: number }; launch: boolean } {
  const count = MM.stones.length;
  if (stone === seq.expect) {
    if (stone < count - 1) return { seq: { expect: stone + 1, laps: seq.laps }, launch: false };
    const laps = seq.laps + 1;
    if (laps >= 3) return { seq: { expect: 0, laps: 0 }, launch: true };
    return { seq: { expect: 0, laps }, launch: false };
  }
  return { seq: { expect: stone === 0 ? 1 : 0, laps: seq.laps }, launch: false };
}

export type WelcomeZone = MmStoneId | 'frog' | 'welcome-line';

/**
 * Stone or zone under a logical point: stone ids (enabled or not — the hover sequence counts every stone), 'frog',
 * 'welcome-line' (a line `welcomeLineWidth` px wide centred on 320 around baseline 32), or null. Stones are tested on
 * their one-state box (the alpha mask is not consulted; the boxes barely overlap and only at transparent corners).
 */
export function welcomeHit(x: number, y: number, welcomeLineWidth: number): WelcomeZone | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const s of MM.stones) if (x >= s.x && x < s.x + s.w && y >= s.y && y < s.y + s.h) return s.id;
  const f = MM.frog;
  if (x >= f.x && x < f.x + f.w && y >= f.y && y < f.y + f.h) return 'frog';
  const w = Number.isFinite(welcomeLineWidth) ? Math.max(0, welcomeLineWidth) : 0;
  const b = MM.welcome.baseline;
  if (w > 0 && x >= MM.welcome.cx - w / 2 && x <= MM.welcome.cx + w / 2 && y >= b - MM_LINE_ABOVE && y <= b + MM_LINE_BELOW) return 'welcome-line';
  return null;
}
