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
import { applyMask, canvasOf, type Bitmap, type OriginalPack } from './original.js';
import { loadBitmapFont, type BitmapFont } from './bitmapfont.js';
import { upscaleBitmap } from './upscale.js';
import { STATS_COLORS, STATS_LAYOUT, drawDialogButton, drawNineSlice, wrapText, type Rect, type StatsKit } from './statsdialog.js';
import { MENU_LAYOUT } from './menudialog.js';

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

// ------------------------------------------------------------------ welcome line

/** Fallback of `WELCOME_TO_ZUMA` (strings.json). */
const MM_WELCOME = 'Bienvenue dans Zuma';

/**
 * The welcome line: `WELCOME_TO_ZUMA` + « , » + name + « ! » — the original's concatenation, without a space before
 * « ! » (kept as is, a choice); without a profile « Bienvenue dans Zuma ! ». The `IF_THIS_IS_NOT_YOU` link is not
 * drawn: a click on the line itself reopens the name dialog (one local profile, research Q1 / Q4).
 */
export function welcomeLine(strings: Record<string, string> | null, name: string | null): string {
  const head = strings?.WELCOME_TO_ZUMA ?? MM_WELCOME;
  return name ? `${head}, ${name}!` : `${head} !`;
}

/** Width of the welcome line in logical px (bitmap font when the kit has it, else ≈ 9 px per character). */
export function welcomeLineWidth(kit: WelcomeKit | null, strings: Record<string, string> | null, name: string | null): number {
  const text = welcomeLine(strings, name);
  return kit?.font ? kit.font.measure(text) : text.length * 9;
}

// ------------------------------------------------------------------ kit

/**
 * Pieces of the main menu. `back` (mmscreen holed by `_mmscreen`) is required; any other piece may be missing and is
 * then skipped. `eyeLids` = the cut of mmscreen at (191, 331) through `_mmeyemask`; `glow` = `_mmsunglow.jpg` itself
 * (the mask is the picture, drawn additively). `pixelScale` 2 when every picture and the font are the 2 × EPX copies.
 */
export interface WelcomeKit {
  sky: Bitmap | null;
  back: Bitmap;
  eyeLeft: Bitmap | null;
  eyeRight: Bitmap | null;
  eyeLids: Bitmap | null;
  glow: Bitmap | null;
  sun: Bitmap | null;
  stones: Record<MmStoneId, Bitmap | null>;
  ufo: Bitmap | null;
  font: BitmapFont | null;
  dialog: StatsKit | null;
  pixelScale: 1 | 2;
}

/** Loads the main-menu pieces; null without `mmscreen` (→ vector welcome). Never throws. */
export async function loadWelcomeKit(pack: OriginalPack, dialog: StatsKit | null): Promise<WelcomeKit | null> {
  const safe = (p: Promise<Bitmap | null>): Promise<Bitmap | null> => p.catch(() => null);
  try {
    const backP = safe(pack.masked('mmscreen'));
    const screenP = safe(pack.image('mmscreen'));
    const maskP = safe(pack.image('_mmeyemask'));
    const skyP = safe(pack.image('mmsky'));
    const eyeLeftP = safe(pack.masked('mmeyeleft'));
    const eyeRightP = safe(pack.masked('mmeyeright'));
    const glowP = safe(pack.image('_mmsunglow'));
    const sunP = safe(pack.masked('mmsun'));
    const ufoP = safe(pack.masked('mmufo'));
    const fontP = loadBitmapFont(pack, 'nativealienextended16').catch(() => null);
    const stoneP = MM.stones.map(s => safe(pack.masked(s.image)));
    const back = await backP;
    if (!back) return null;
    const [screen, mask, sky, eyeLeft, eyeRight, glow, sun, ufo, font] = await Promise.all([screenP, maskP, skyP, eyeLeftP, eyeRightP, glowP, sunP, ufoP, fontP]);
    const loaded = await Promise.all(stoneP);
    const stones = {} as Record<MmStoneId, Bitmap | null>;
    MM.stones.forEach((s, i) => { stones[s.id] = loaded[i]; });
    return { sky, back, eyeLeft, eyeRight, eyeLids: mmEyeLids(screen, mask), glow, sun, stones, ufo, font, dialog, pixelScale: 1 };
  } catch {
    return null;
  }
}

/** The eyelids: mmscreen cut at the eye mask rectangle, alpha from `_mmeyemask` (0x433c40); null when unreadable. */
function mmEyeLids(screen: Bitmap | null, mask: Bitmap | null): Bitmap | null {
  if (!screen || !mask) return null;
  try {
    const E = MM.eyeMask;
    const cut = canvasOf(E.w, E.h);
    const ctx = cut.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(screen, -E.x, -E.y);
    return applyMask(cut, mask, false);
  } catch {
    return null;
  }
}

/**
 * The kit over 2 × EPX pictures and the 2 × font (D-19), with the 2 × dialog kit when given. All or nothing, like
 * buildHdAssets: when any picture or the font cannot be upscaled, the 1 × kit is returned.
 */
export function upscaleWelcomeKit(kit: WelcomeKit, dialogHd: StatsKit | null): WelcomeKit {
  if (kit.pixelScale !== 1) return kit;
  let complete = true;
  const big = (image: Bitmap | null): Bitmap | null => {
    if (!image) return null;
    const out = upscaleBitmap(image);
    if (!out) complete = false;
    return out;
  };
  const back = big(kit.back);
  const stones = {} as Record<MmStoneId, Bitmap | null>;
  for (const s of MM.stones) stones[s.id] = big(kit.stones[s.id]);
  const font = kit.font ? kit.font.upscaled() : null;
  if (font && font.pixelScale !== 2) complete = false;
  const out: WelcomeKit = {
    sky: big(kit.sky), back: back ?? kit.back, eyeLeft: big(kit.eyeLeft), eyeRight: big(kit.eyeRight), eyeLids: big(kit.eyeLids),
    glow: big(kit.glow), sun: big(kit.sun), stones, ufo: big(kit.ufo), font, dialog: dialogHd ?? kit.dialog, pixelScale: 2,
  };
  return complete && back ? out : kit;
}

// ------------------------------------------------------------------ drawing

export interface WelcomeView {
  /** Counter in maj (10 ms) since the screen was entered. */
  c: number;
  hover: string | null;
  pressed: string | null;
  /** Keyboard focus (an enabled stone), drawn like the hover. */
  focus: string | null;
  eyes: EyeMode;
  /** Pointer in logical px (followed in 'follow' mode). */
  target: MmPoint | null;
  ufo: UfoState;
  name: string | null;
  strings: Record<string, string> | null;
}

const MM_W = 640;
const MM_H = 480;

/** State column of a stone picture: disabled stones always show column 0 (D-11). */
function mmStoneColumn(stone: MmStone, view: WelcomeView): number {
  if (!stone.enabled) return 0;
  if (view.pressed === stone.id) return 2;
  return view.hover === stone.id || view.focus === stone.id ? 1 : 0;
}

/** Pupils' target: the flying UFO first, else the pointer in 'follow' mode. */
function mmLook(view: WelcomeView, ufo: UfoFrame): { left: MmPoint; right: MmPoint } {
  if (ufo.visible) return mmEyes('follow', { x: ufo.x + MM.ufo.w / 2, y: ufo.y + MM.ufo.h / 2 });
  return mmEyes(view.eyes, view.target);
}

/**
 * Draws the main menu in logical units (the caller sets the backing-store transform, Renderer.drawScene), in the order
 * of 0x43d1a0: sky ×3, holed screen, pupils, eyelids, additive rotating glow, sun, welcome line; then the stones (child
 * widgets) and the UFO. Pictures of a 2 × kit are cut at 2 × and drawn at their logical size. `kit` null → a vector
 * welcome with the same zones (never a DOM panel).
 */
export function drawWelcome(ctx: CanvasRenderingContext2D, kit: WelcomeKit | null, view: WelcomeView): void {
  const c = Number.isFinite(view.c) ? Math.max(0, view.c) : 0;
  const ufo = mmUfo(view.ufo, c);
  if (!kit) {
    mmDrawVector(ctx, view, c, ufo);
    return;
  }
  const k = kit.pixelScale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, MM_W, MM_H);
  if (kit.sky) {
    const o = mmSkyOffset(c);
    const w = MM.sky.w;
    for (const x of [o - w, o, o + w]) ctx.drawImage(kit.sky, x, 0, w, kit.sky.height / k);
  }
  ctx.drawImage(kit.back, 0, 0, MM_W, MM_H);
  const eyes = mmLook(view, ufo);
  const pupil = (image: Bitmap | null, at: MmPoint): void => {
    if (!image) return;
    const w = image.width / k;
    const h = image.height / k;
    ctx.drawImage(image, at.x - w / 2, at.y - h / 2, w, h);
  };
  pupil(kit.eyeLeft, eyes.left);
  pupil(kit.eyeRight, eyes.right);
  if (kit.eyeLids) ctx.drawImage(kit.eyeLids, MM.eyeMask.x, MM.eyeMask.y, MM.eyeMask.w, MM.eyeMask.h);
  if (kit.glow) {
    const G = MM.glow;
    const { alpha, angle } = mmGlow(c);
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = alpha;
    ctx.translate(G.x + G.w / 2, G.y + G.h / 2);
    ctx.rotate(angle);
    ctx.drawImage(kit.glow, -G.w / 2, -G.h / 2, G.w, G.h);
    ctx.restore();
  }
  if (kit.sun) ctx.drawImage(kit.sun, MM.sun.x, MM.sun.y, kit.sun.width / k, kit.sun.height / k);
  const line = welcomeLine(view.strings, view.name);
  if (kit.font) kit.font.draw(ctx, line, MM.welcome.cx, MM.welcome.baseline, { align: 'center' });
  else mmText(ctx, line, MM.welcome.cx, MM.welcome.baseline, '#ffffff', 16, 'center', 'alphabetic');
  for (const s of MM.stones) {
    const image = kit.stones[s.id];
    if (!image) continue;
    const col = mmStoneColumn(s, view);
    ctx.drawImage(image, col * s.w * k, 0, s.w * k, s.h * k, s.x, s.y, s.w, s.h);
  }
  if (ufo.visible && kit.ufo) {
    const U = MM.ufo;
    ctx.drawImage(kit.ufo, 0, ufo.frame * U.h * k, U.w * k, U.h * k, ufo.x, ufo.y, U.w, U.h);
  }
}

const MM_VECTOR_FONT = '"Trebuchet MS", Verdana, sans-serif';
/** Vector labels of the stones (the pictures carry them in the pack). */
const MM_VECTOR_LABELS: Record<MmStoneId, string> = { adventure: 'AVENTURE', gauntlet: 'GAUNTLET', options: 'OPTIONS', moregames: 'PLUS DE JEUX', quit: 'QUITTER' };

function mmText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, px: number, align: CanvasTextAlign = 'left', baseline: CanvasTextBaseline = 'middle'): void {
  ctx.font = `bold ${px}px ${MM_VECTOR_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = baseline;
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

function mmRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Vector welcome (no pack): dark sky, « Zuma », a frog whose pupils move like the original's, stones at their zones. */
function mmDrawVector(ctx: CanvasRenderingContext2D, view: WelcomeView, c: number, ufo: UfoFrame): void {
  const sky = ctx.createLinearGradient(0, 0, 0, MM_H);
  sky.addColorStop(0, '#16304a');
  sky.addColorStop(0.45, '#0e1e22');
  sky.addColorStop(1, '#06100a');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, MM_W, MM_H);
  // Sun with its pulsing glow (same timing as the original).
  const { alpha } = mmGlow(c);
  ctx.save();
  ctx.globalAlpha = alpha;
  ctx.beginPath();
  ctx.arc(44, 48, 70, 0, Math.PI * 2);
  ctx.fillStyle = '#ffd36a';
  ctx.fill();
  ctx.restore();
  ctx.beginPath();
  ctx.arc(44, 48, 36, 0, Math.PI * 2);
  ctx.fillStyle = '#ffcc33';
  ctx.fill();
  mmText(ctx, 'Zuma', 196, 200, '#f0c040', 72, 'center');
  // Frog idol: body, eyes, pupils from mmEyes.
  const F = MM.frog;
  ctx.beginPath();
  ctx.ellipse(F.x + F.w / 2, F.y + F.h / 2 + 10, F.w / 2 - 10, F.h / 2 - 12, 0, 0, Math.PI * 2);
  ctx.fillStyle = '#3d7a2c';
  ctx.fill();
  const eyes = mmLook(view, ufo);
  for (const [rest, at, r] of [[MM.eyes.left, eyes.left, 14], [MM.eyes.right, eyes.right, 11]] as const) {
    ctx.beginPath();
    ctx.arc(rest.x, rest.y, r, 0, Math.PI * 2);
    ctx.fillStyle = '#f4e9b0';
    ctx.fill();
    ctx.beginPath();
    ctx.arc(at.x, at.y, r / 2, 0, Math.PI * 2);
    ctx.fillStyle = '#101010';
    ctx.fill();
  }
  mmText(ctx, welcomeLine(view.strings, view.name), MM.welcome.cx, MM.welcome.baseline, '#ffffff', 16, 'center', 'alphabetic');
  for (const s of MM.stones) {
    const col = mmStoneColumn(s, view);
    ctx.save();
    if (!s.enabled) ctx.globalAlpha = 0.35;
    mmRoundRect(ctx, s.x + 6, s.y + 8, s.w - 12, s.h - 16, 14);
    ctx.fillStyle = col === 2 ? '#5a4a30' : col === 1 ? '#a08a5a' : '#7a6a48';
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = col === 0 ? '#3a3020' : '#ffe08a';
    ctx.stroke();
    mmText(ctx, MM_VECTOR_LABELS[s.id], s.x + s.w / 2 + (col === 2 ? 1 : 0), s.y + s.h / 2 + (col === 2 ? 1 : 0), s.enabled ? '#fff2c0' : '#c8c0a8', 20, 'center');
    ctx.restore();
  }
  if (ufo.visible) {
    ctx.beginPath();
    ctx.ellipse(ufo.x + MM.ufo.w / 2, ufo.y + MM.ufo.h / 2, 70, 22, 0, 0, Math.PI * 2);
    ctx.fillStyle = '#9aa4b0';
    ctx.fill();
  }
}

// ------------------------------------------------------------------ dialogs (name, continue)

export type NameWidgetId = 'name-field' | 'name-ok';
export type ContinueWidgetId = 'continue' | 'new-game';
export interface PromptView { kind: 'name' | 'rename' | 'continue'; text: string; caret: boolean; hover: string | null; pressed: string | null; focus: string | null }

/** Fallbacks of the dialog strings (strings.json values). */
const MM_PROMPT_STRINGS: Record<string, string> = {
  NEW_USER: 'NOUVEL UTILISATEUR', RENAME_USER: "RENOMMER L'UTILISATEUR", 'CONTINUE_?': 'CONTINUER ?', OK: 'OK',
  ENTER_YOUR_NAME_TO_CREATE_A_NEW_USER_PROFILE: "Entrez votre nom pour créer un nouveau profil d'utilisateur, afin de sauvegarder vos records et votre progression.",
  ENTER_YOUR_NAME: 'Entrez votre nom',
  'DO_YOU_WANT_TO_CONTINUE_YOUR_LAST_GAME_?': 'Voulez-vous continuer la dernière partie ?',
  SM_CONTINUE: 'Continuer', NEW_GAME: 'Rejouer',
};

function mmPromptString(strings: Record<string, string> | null, key: string): string {
  return strings?.[key] ?? MM_PROMPT_STRINGS[key] ?? key;
}

/**
 * Dialog geometry inside `MENU_LAYOUT.frame` (same frame, head, title and footer as the OPTIONS dialog): body text from
 * `bodyFirst`, then the name field above the footer button.
 */
export const WELCOME_DIALOG = {
  bodyFirst: 202,
  lineHeight: 20,
  field: { x: MENU_LAYOUT.content.x, y: 330, w: MENU_LAYOUT.content.w, h: 40 } as Rect,
};

/** Name dialog widgets (0x44a8b0: NEW_USER / RENAME_USER, text field, OK). */
export function nameDialogWidgets(strings: Record<string, string> | null): Array<{ id: NameWidgetId; rect: Rect; label: string }> {
  const L = MENU_LAYOUT;
  const ok = strings?.DIALOG_BUTTON_OK ?? mmPromptString(strings, 'OK');
  return [
    { id: 'name-field', rect: { ...WELCOME_DIALOG.field }, label: '' },
    { id: 'name-ok', rect: { x: L.content.x, y: L.button.footer, w: L.content.w, h: L.button.h }, label: ok },
  ];
}

/** Continue dialog widgets (0x44ef40): « Continuer » on the left, « Rejouer » on the right, the menu confirm geometry. */
export function continueDialogWidgets(strings: Record<string, string> | null): Array<{ id: ContinueWidgetId; rect: Rect; label: string }> {
  const L = MENU_LAYOUT;
  const w = L.confirm.buttonW;
  return [
    { id: 'continue', rect: { x: L.content.x, y: L.button.footer, w, h: L.button.h }, label: mmPromptString(strings, 'SM_CONTINUE') },
    { id: 'new-game', rect: { x: L.content.x + L.content.w - w, y: L.button.footer, w, h: L.button.h }, label: mmPromptString(strings, 'NEW_GAME') },
  ];
}

/** Title and wrapped body lines of a dialog (`&cr;` counts as a space, so trailing ones vanish). */
export function welcomePromptLayout(kind: PromptView['kind'], strings: Record<string, string> | null, measure: (s: string) => number): { title: string; lines: string[] } {
  const title = mmPromptString(strings, kind === 'name' ? 'NEW_USER' : kind === 'rename' ? 'RENAME_USER' : 'CONTINUE_?');
  const body = mmPromptString(strings, kind === 'name' ? 'ENTER_YOUR_NAME_TO_CREATE_A_NEW_USER_PROFILE' : kind === 'rename' ? 'ENTER_YOUR_NAME' : 'DO_YOU_WANT_TO_CONTINUE_YOUR_LAST_GAME_?');
  return { title, lines: wrapText(body, MENU_LAYOUT.content.w, measure) };
}

export type MmButtonState = 'normal' | 'hover' | 'pressed';
const mmButtonState = (id: string, view: PromptView): MmButtonState => (view.pressed === id ? 'pressed' : view.hover === id || view.focus === id ? 'hover' : 'normal');

/** Frame, head, title and rule shared by the welcome dialogs and the god dialogue (adventure.ts). */
export function mmDialogFrame(ctx: CanvasRenderingContext2D, kit: StatsKit | null, title: string): void {
  const L = MENU_LAYOUT;
  if (kit) {
    const k = kit.pixelScale;
    drawNineSlice(ctx, kit.frame, STATS_LAYOUT.source, STATS_LAYOUT.inset, L.frame, k);
    if (kit.head) ctx.drawImage(kit.head, 0, 0, kit.head.width, kit.head.height, L.head.x, L.head.y, kit.head.width / k, kit.head.height / k);
    kit.fonts.title.draw(ctx, title, L.title.x, L.title.baseline, { align: 'center', multiply: STATS_COLORS.title });
  } else {
    const f = L.frame;
    const g = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
    g.addColorStop(0, '#4a3313');
    g.addColorStop(1, '#1c1207');
    mmRoundRect(ctx, f.x, f.y, f.w, f.h, 16);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c9a85a';
    ctx.stroke();
    mmText(ctx, title, L.title.x, L.title.baseline - 8, STATS_COLORS.title, 22, 'center');
  }
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(L.rule.x1, L.rule.y, L.rule.x2 - L.rule.x1, 1);
  ctx.fillStyle = 'rgba(255,230,160,.25)';
  ctx.fillRect(L.rule.x1, L.rule.y + 1, L.rule.x2 - L.rule.x1, 1);
}

/** A dialog button: DialogButton in three slices with its label, or a vector stand-in. */
export function mmDialogButton(ctx: CanvasRenderingContext2D, kit: StatsKit | null, rect: Rect, label: string, state: MmButtonState): void {
  const nudge = state === 'pressed' ? 1 : 0;
  if (kit) {
    drawDialogButton(ctx, kit.button, state, rect, kit.pixelScale, MENU_LAYOUT.button.edge);
    kit.fonts.text.draw(ctx, label, rect.x + rect.w / 2 + nudge, rect.y + (STATS_LAYOUT.okLabelBaseline - STATS_LAYOUT.ok.y) + nudge, { tint: STATS_COLORS.value, align: 'center' });
    return;
  }
  const g = ctx.createLinearGradient(0, rect.y, 0, rect.y + rect.h);
  g.addColorStop(0, state === 'normal' ? '#7bd04a' : '#c050e0');
  g.addColorStop(1, state === 'normal' ? '#2f7a24' : '#7a1f9a');
  mmRoundRect(ctx, rect.x + 4, rect.y + 6, rect.w - 8, rect.h - 14, 14);
  ctx.fillStyle = g;
  ctx.fill();
  ctx.lineWidth = 3;
  ctx.strokeStyle = '#d8d2b0';
  ctx.stroke();
  mmText(ctx, label, rect.x + rect.w / 2 + nudge, rect.y + rect.h / 2 - 1 + nudge, STATS_COLORS.value, 15, 'center');
}

/** Body lines: left-aligned for the name dialog, centred on the frame for the continue question. */
export function mmDialogBody(ctx: CanvasRenderingContext2D, kit: StatsKit | null, lines: string[], first: number, centred: boolean): void {
  const L = MENU_LAYOUT;
  const x = centred ? L.title.x : L.content.x;
  lines.forEach((line, i) => {
    const y = first + i * WELCOME_DIALOG.lineHeight;
    if (kit) kit.fonts.text.draw(ctx, line, x, y, { tint: STATS_COLORS.value, align: centred ? 'center' : 'left' });
    else mmText(ctx, line, x, y - 5, STATS_COLORS.value, 14, centred ? 'center' : 'left');
  });
}

/**
 * Name dialog (NEW_USER at the first launch, RENAME_USER from the welcome line): wrapped text, the field (dark box with
 * the typed name in the text font and a blinking caret), OK. The name is only ever drawn on the canvas (T-06-08).
 */
export function drawNameDialog(ctx: CanvasRenderingContext2D, kit: StatsKit | null, view: PromptView, strings: Record<string, string> | null): void {
  const table = kit?.strings ?? strings;
  const font = kit?.fonts.text ?? null;
  const measure = font ? (s: string): number => font.measure(s) : (s: string): number => { ctx.font = `bold 14px ${MM_VECTOR_FONT}`; return ctx.measureText(s).width; };
  const layout = welcomePromptLayout(view.kind === 'rename' ? 'rename' : 'name', table, measure);
  mmDialogFrame(ctx, kit, layout.title);
  mmDialogBody(ctx, kit, layout.lines, WELCOME_DIALOG.bodyFirst, false);
  const [field, ok] = nameDialogWidgets(table);
  const r = field.rect;
  ctx.fillStyle = 'rgba(0,0,0,.6)';
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.lineWidth = view.focus === 'name-field' || view.hover === 'name-field' ? 2 : 1;
  ctx.strokeStyle = '#c9a85a';
  ctx.strokeRect(r.x + 0.5, r.y + 0.5, r.w - 1, r.h - 1);
  const textX = r.x + 10;
  const baseline = r.y + r.h / 2 + 6;
  let width: number;
  if (font) {
    font.draw(ctx, view.text, textX, baseline, { tint: '#ffffff', align: 'left' });
    width = font.measure(view.text);
  } else {
    mmText(ctx, view.text, textX, r.y + r.h / 2, '#ffffff', 16, 'left');
    width = ctx.measureText(view.text).width;
  }
  if (view.caret) {
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(textX + width + 2, r.y + 9, 2, r.h - 18);
  }
  mmDialogButton(ctx, kit, ok.rect, ok.label, mmButtonState(ok.id, view));
}

/** Continue dialog (0x44ef40): CONTINUE_? title, the question without its `&cr;`, « Continuer » / « Rejouer ». */
export function drawContinueDialog(ctx: CanvasRenderingContext2D, kit: StatsKit | null, view: PromptView, strings: Record<string, string> | null): void {
  const table = kit?.strings ?? strings;
  const font = kit?.fonts.text ?? null;
  const measure = font ? (s: string): number => font.measure(s) : (s: string): number => { ctx.font = `bold 14px ${MM_VECTOR_FONT}`; return ctx.measureText(s).width; };
  const layout = welcomePromptLayout('continue', table, measure);
  mmDialogFrame(ctx, kit, layout.title);
  mmDialogBody(ctx, kit, layout.lines, MENU_LAYOUT.confirm.bodyBaseline, true);
  for (const w of continueDialogWidgets(table)) mmDialogButton(ctx, kit, w.rect, w.label, mmButtonState(w.id, view));
}
