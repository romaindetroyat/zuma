/**
 * Adventure screen of the original (spike 06 Q2, D-02), the god dialogue between temples and the ending screen (Q3,
 * D-03 / D-10). Geometry and timings read in the executable — AdventureScreen: ctor 0x449b90 (door table 0x449cb2–
 * 0x449ec8), draw 0x441b50, temples 0x43e640 / 0x43e670 / 0x43e790 / 0x43e8b0, doors 0x43e5c0, door hit test 0x440c90,
 * mouse 0x440d50 / 0x440db0, arrival animation 0x43e3f0 / 0x43e470, button layout 0x4414f0 (scratchpad
 * shots-r221/adventure-measure.log).
 *
 * Time unit: the original counts updates at 100 Hz (`maj`, 10 ms); the presentation passes counters in maj since the
 * screen was entered. Everything except the drawing / loading functions is pure so the Node tests lock it; nothing
 * touches the DOM at module level. Top-level names carry an `adv` / `ADV` prefix (the standalone concatenates every
 * module into one scope).
 */
import { DOOR_COUNT, DOOR_MESSAGES, TEMPLE_NAMES, type HighScore } from './progress.js';

export interface AdvRect { x: number; y: number; w: number; h: number }
export interface AdvDoor { x: number; y: number; anchor: { x: number; y: number } }

/** Geometry of the adventure screen in logical 640 × 480 pixels (top-left corners; text y = baseline). */
export const ADV = {
  /** `advsky` 640 × 116, drawn at x = o − 640, o, o + 640 (y 0) with o = (c >> 2) mod 640: 25 px/s (0x441b81). */
  sky: { w: 640, h: 116 },
  title: { x: 0, y: 0 },
  plaque: { x: 456, y: 0, w: 184, h: 65 },
  /**
   * High scores under the plaque (0x44286b–0x442adc): the first three entries, scores « %d » left-aligned at x 575,
   * names at x 470 clipped to x < 567 (0x463820), baselines 70 + i × line spacing; FONT_MAIN8OUTLINESCORE 0xffff4c.
   */
  scores: { nameX: 470, nameClip: 567, scoreX: 575, top: 70, rows: 3, color: '#ffff4c' },
  /** `advstage` plaque and « %d » of the selected door + 1 in FONT_DIALOG 0xfbf1b0 (0x442658–0x4426e7). */
  stage: { x: 289, y: 382, numberX: 344, numberBaseline: 396, color: '#fbf1b0' },
  /**
   * Line 1: the temple name of the selected door in FONT_BROWNTITLE, white, centred on 326, baseline 422; line 2: its
   * door message in FONT_MAIN10OUTLINE2 0xffea01, centred on 326, baseline 456 (0x4426ec–0x442827).
   */
  message: { cx: 326, baseline: 422, second: 456, secondColor: '#ffea01' },
  /** Word-wrapped hint (FONT_MAIN8OUTLINE 0xffff4c, line spacing 14, left) in this rectangle (0x442ae1–0x442c9e). */
  hint: { x: 20, y: 60, w: 150, h: 100, lineHeight: 14, color: '#ffff4c' },
  temples: { 1: { x: 0, y: 188 }, 2: { x: 0, y: 112 }, 3: { x: 395, y: 125 }, 4: { x: 174, y: 1 }, middle: { x: 0, y: 72 } },
  /** Doors of stages 1–12 (`advdoor{temple}{a,b,c}`, four horizontal cels) and the anchor stored beside each one. */
  doors: [
    { x: 226, y: 300, anchor: { x: 256, y: 361 } }, { x: 296, y: 270, anchor: { x: 327, y: 364 } }, { x: 366, y: 300, anchor: { x: 398, y: 360 } },
    { x: 0, y: 164, anchor: { x: 56, y: 218 } }, { x: 69, y: 159, anchor: { x: 116, y: 201 } }, { x: 120, y: 155, anchor: { x: 167, y: 188 } },
    { x: 452, y: 154, anchor: { x: 462, y: 188 } }, { x: 509, y: 154, anchor: { x: 521, y: 192 } }, { x: 568, y: 154, anchor: { x: 584, y: 196 } },
    { x: 220, y: 35, anchor: { x: 248, y: 86 } }, { x: 291, y: 35, anchor: { x: 324, y: 86 } }, { x: 369, y: 35, anchor: { x: 408, y: 85 } },
  ] as ReadonlyArray<AdvDoor>,
  /** Widgets of 0x434d10 (three horizontal states, click sound only) placed by Resize 0x4414f0. */
  buttons: { mainMenu: { x: 0, y: 438, w: 125, h: 42 } as AdvRect, play: { x: 542, y: 441, w: 97, h: 39 } as AdvRect },
  /**
   * Arrival after a finished stage (0x43e3f0(75, maxStage / 3 + 1)): 75 maj of delay, then temples 2 / 3 crossfade
   * veiled → open over 100 maj, temple 4 rises from 300 px below over 300 maj ((300 − n)² / 300) while the temples
   * shake by at most 10 px.
   */
  reveal: { delayMaj: 75, fadeMaj: 100, riseMaj: 300, rise: 300, shakeMax: 10 },
};

const advFinite = (v: number): number => (Number.isFinite(v) ? v : 0);
const advMod = (v: number, m: number): number => ((v % m) + m) % m;

/** Sky offset o = (c >> 2) mod 640 (draw x = o − 640, o, o + 640); non-finite → 0, never negative. */
export function advSkyOffset(c: number): number {
  return advMod(Math.floor(advFinite(c) / 4), ADV.sky.w);
}

export type AdvTempleId = 2 | 3 | 4;
export interface AdvReveal { temple: AdvTempleId; progress: number }
/** One picture of the temple layer, drawn at (x, y) with `alpha`, followed by doors [doors[0], doors[1]) moved by `dx` / `dy`. */
export interface AdvTemplePiece { image: string; x: number; y: number; alpha: number; doors: [number, number]; dx: number; dy: number }

const advClamp01 = (v: number): number => (Number.isFinite(v) ? Math.max(0, Math.min(1, v)) : 0);

/**
 * Temple pictures back to front for the profile's highest stage (0x441c0a–0x441c74): temple 4 with doors 9..11 (from
 * stage 10), `advmiddle` over it, temple 3, temple 2, temple 1. A locked temple 2 / 3 is drawn veiled and without its
 * doors. `reveal`: temple 2 / 3 crossfade (veiled at 1 − p, open at p, doors at p), temple 4 rising (absent at p = 0,
 * then ⌊(300 − 300 p)² / 300⌋ px below its place). `shake`: x offsets of temples 1..4 (0x441c12–0x441c6c).
 */
export function advTemples(maxStage: number, reveal: AdvReveal | null, shake: readonly number[] = [0, 0, 0, 0]): AdvTemplePiece[] {
  const T = ADV.temples;
  const top = Number.isFinite(maxStage) ? maxStage : 0;
  const sx = (i: number): number => advFinite(shake[i] ?? 0);
  const piece = (image: string, at: { x: number; y: number }, doors: [number, number], shakeIndex: number, alpha = 1, dy = 0): AdvTemplePiece => ({
    image, x: at.x + sx(shakeIndex), y: at.y + dy, alpha, doors, dx: sx(shakeIndex), dy,
  });
  const out: AdvTemplePiece[] = [];
  const p = reveal ? advClamp01(reveal.progress) : 1;
  if (reveal?.temple === 4) {
    if (p > 0) {
      const n = p * ADV.reveal.riseMaj;
      out.push(piece('advtemple4', T[4], [9, 12], 3, 1, Math.floor((ADV.reveal.riseMaj - n) ** 2 / ADV.reveal.riseMaj)));
    }
  } else if (top >= 9) {
    out.push(piece('advtemple4', T[4], [9, 12], 3));
  }
  out.push(piece('advmiddle', T.middle, [0, 0], -1));
  for (const [temple, unlockAt, first] of [[3, 6, 6], [2, 3, 3]] as const) {
    const at = T[temple];
    if (reveal?.temple === temple) {
      out.push(piece(`advtemple${temple}v`, at, [first, first], temple - 1, 1 - p));
      out.push(piece(`advtemple${temple}`, at, [first, first + 3], temple - 1, p));
    } else if (top >= unlockAt) {
      out.push(piece(`advtemple${temple}`, at, [first, first + 3], temple - 1));
    } else {
      out.push(piece(`advtemple${temple}v`, at, [first, first], temple - 1));
    }
  }
  out.push(piece('advtemple1', T[1], [0, 3], 0));
  return out;
}

/** Cel of door `i` (0x43e5c0): 3 selected, 2 hovered, 1 unlocked (i ≤ maxStage), 0 locked. */
export function doorCel(i: number, maxStage: number, selected: number | null, hover: number | null): 0 | 1 | 2 | 3 {
  if (i === selected) return 3;
  if (i === hover) return 2;
  return i <= maxStage ? 1 : 0;
}

/**
 * Unlocked door under a logical point (0x440c90): doors 0..min(maxStage, 11) in order, inside the cel rectangle
 * (x, y, celWidths[i], heights[i]) and — when `opaque` is given — on a non-transparent pixel of cel 0 (cel-local
 * coordinates). Null otherwise.
 */
export function doorAt(x: number, y: number, maxStage: number, celWidths: readonly number[], heights: readonly number[], opaque?: (door: number, lx: number, ly: number) => boolean): number | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const last = Math.min(DOOR_COUNT - 1, Number.isFinite(maxStage) ? Math.floor(maxStage) : 0);
  for (let i = 0; i <= last; i++) {
    const d = ADV.doors[i];
    const w = celWidths[i] ?? 0;
    const h = heights[i] ?? 0;
    if (!(w > 0) || !(h > 0) || x < d.x || x >= d.x + w || y < d.y || y >= d.y + h) continue;
    if (opaque && !opaque(i, x - d.x, y - d.y)) continue;
    return i;
  }
  return null;
}

export type AdvButtonId = 'main-menu' | 'play';

/** « Menu principal » / « Jouer » under a logical point, else null. */
export function advButtonAt(x: number, y: number): AdvButtonId | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  const inside = (r: AdvRect): boolean => x >= r.x && x < r.x + r.w && y >= r.y && y < r.y + r.h;
  if (inside(ADV.buttons.mainMenu)) return 'main-menu';
  if (inside(ADV.buttons.play)) return 'play';
  return null;
}

/** Plaque rows: the first three entries, name as stored, score « %d », baseline 70 + i × lineHeight. */
export function scoreRows(scores: readonly HighScore[], lineHeight: number): Array<{ name: string; score: string; baseline: number }> {
  const h = Number.isFinite(lineHeight) ? lineHeight : 0;
  return scores.slice(0, ADV.scores.rows).map((e, i) => ({ name: e.name, score: String(Math.max(0, Math.floor(advFinite(e.score)))), baseline: ADV.scores.top + i * h }));
}

/** Temple revealed on arriving with the door `opening` open: stage index 3 → 2, 6 → 3, 9 → 4; otherwise none. */
export function revealTemple(opening: number | null): AdvTempleId | null {
  if (opening === 3) return 2;
  if (opening === 6) return 3;
  if (opening === 9) return 4;
  return null;
}

/** Reveal progress 0..1 `maj` after the arrival: 0 during the 75 maj delay, then over 100 maj (fade) or 300 maj (rise). */
export function revealProgress(maj: number, temple: AdvTempleId): number {
  const R = ADV.reveal;
  return advClamp01((advFinite(maj) - R.delayMaj) / (temple === 4 ? R.riseMaj : R.fadeMaj));
}

/** Length in maj of the arrival lock (+0x204: the doors ignore the pointer): delay + fade, or delay + rise for temple 4. */
export function advArrivalMaj(temple: AdvTempleId | 1 | null): number {
  const R = ADV.reveal;
  return R.delayMaj + (temple === 4 ? R.riseMaj : R.fadeMaj);
}

/**
 * One shake step of the rise of temple 4 (0x43e4dd–0x43e538, every 4 maj): each x offset moves by ⌊rand × 3⌋ − 1 and
 * is clamped to ±(10 − ⌊n × 10 / 300⌋); after the rise (n > 300) every offset is 0.
 */
export function advShakeStep(offsets: readonly number[], n: number, rand: () => number): number[] {
  const R = ADV.reveal;
  if (!Number.isFinite(n) || n > R.riseMaj) return [0, 0, 0, 0];
  const amp = Math.max(0, R.shakeMax - Math.floor((Math.max(0, n) * R.shakeMax) / R.riseMaj));
  return [0, 1, 2, 3].map(i => {
    const step = Math.floor(advClamp01(rand()) * 3) - 1;
    const v = advFinite(offsets[i] ?? 0) + Math.max(-1, Math.min(1, step));
    return Math.max(-amp, Math.min(amp, v));
  });
}

/** Literal names of the temples whose keys the French pack lacks (0x550504, 0x5504d0), then the pack's two keys. */
function advTempleName(strings: Record<string, string> | null, index: number): string {
  const t = TEMPLE_NAMES[Math.max(0, Math.min(TEMPLE_NAMES.length - 1, index))];
  return strings?.[t.key] ?? t.fallback;
}

/** Fallbacks of the door messages and hints (strings.json values). */
const ADV_STRINGS: Record<string, string> = {
  DO_YOU_DARE_ENTER_THE_ANCIENT_RUINS: 'ENTRER DANS LES RUINES ANCIENNES ?',
  CLICK_ON_A_DOORWAY: 'Cliquez sur une porte pour sélectionner un niveau.',
  UNCOVER_THE_SECRET_TEMPLES: 'Découvrez les temples secrets de Zuma !',
};

function advString(strings: Record<string, string> | null, key: string): string {
  return strings?.[key] ?? ADV_STRINGS[key] ?? key.replace(/_/g, ' ');
}

/** The two lines under the doors for the selected door: its temple name and its message (index min(selected, 11)). */
export function advLines(selected: number, strings: Record<string, string> | null): { title: string; message: string } {
  const door = Math.max(0, Math.min(DOOR_COUNT - 1, Number.isFinite(selected) ? Math.floor(selected) : 0));
  return { title: advTempleName(strings, Math.floor(door / 3)), message: advString(strings, DOOR_MESSAGES[door]) };
}

/** Hint box text: CLICK_ON_A_DOORWAY while a door other than the selected one is hovered, else UNCOVER_THE_SECRET_TEMPLES. */
export function advHint(hover: number | null, selected: number, strings: Record<string, string> | null): string {
  return advString(strings, hover !== null && hover !== selected ? 'CLICK_ON_A_DOORWAY' : 'UNCOVER_THE_SECRET_TEMPLES');
}
