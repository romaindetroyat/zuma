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
import { DOOR_COUNT, DOOR_MESSAGES, GOD_LINES, TEMPLE_NAMES, type HighScore } from './progress.js';
import { canvasOf, type Bitmap, type OriginalPack } from './original.js';
import { loadBitmapFont, type BitmapFont } from './bitmapfont.js';
import { upscaleBitmap } from './upscale.js';
import { STATS_LAYOUT, drawNineSlice, wrapText, type Rect, type StatsKit } from './statsdialog.js';
import { MENU_LAYOUT } from './menudialog.js';
import { WELCOME_DIALOG, mmDialogBody, mmDialogButton, mmDialogFrame, type MmButtonState } from './welcome.js';

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

// ------------------------------------------------------------------ kit

/** Alpha of cel 0 of a door at 1 × (the hit test of 0x440c90 reads it), row-major, width × height. */
export interface AdvAlpha { w: number; h: number; alpha: Uint8Array }

/**
 * Pieces of the adventure and ending screens. `back` (advback holed by `_advback`) is required; any other piece may be
 * missing and is then skipped. Doors keep their four horizontal cels; `doorMasks` = cel 0 alpha at 1 × for the hit
 * test (null when the pixels cannot be read: the cel rectangle is used). Fonts: `brown` NativeAlienExtended16
 * (FONT_BROWNTITLE), `message` Cancun10 and `score` Cancun8 (outlined stand-ins of the « !program » fonts
 * MAIN10OUTLINE2 / MAIN8OUTLINE(SCORE)), `number` the STATS text font (FONT_DIALOG stand-in), `huge` NativeAlien48,
 * `title` NativeAlienExtended18. `pixelScale` 2 when every picture and font are the 2 × EPX copies.
 */
export interface AdventureKit {
  sky: Bitmap | null;
  back: Bitmap;
  title: Bitmap | null;
  plaque: Bitmap | null;
  stage: Bitmap | null;
  temples: Record<string, Bitmap | null>;
  doors: Array<Bitmap | null>;
  doorMasks: Array<AdvAlpha | null> | null;
  play: Bitmap | null;
  mainMenu: Bitmap | null;
  happyEnding: Bitmap | null;
  fonts: { brown: BitmapFont | null; message: BitmapFont | null; score: BitmapFont | null; number: BitmapFont | null; huge: BitmapFont | null; title: BitmapFont | null };
  dialog: StatsKit | null;
  pixelScale: 1 | 2;
}

const ADV_TEMPLE_KEYS = ['advtemple1', 'advtemple2', 'advtemple2v', 'advtemple3', 'advtemple3v', 'advtemple4', 'advmiddle'] as const;
/** Pack key of door i: advdoor{temple}{a,b,c}. */
const advDoorKey = (i: number): string => `advdoor${Math.floor(i / 3) + 1}${'abc'[i % 3]}`;

/** Cel 0 alpha of each door (1 ×), or null when a canvas cannot be read (Node, tainted picture). */
function advDoorMasks(doors: Array<Bitmap | null>): Array<AdvAlpha | null> | null {
  try {
    return doors.map(door => {
      if (!door) return null;
      const w = Math.floor(door.width / 4);
      const h = door.height;
      if (!(w > 0) || !(h > 0)) return null;
      const cut = canvasOf(w, h);
      const ctx = cut.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(door, 0, 0, w, h, 0, 0, w, h);
      const data = ctx.getImageData(0, 0, w, h).data;
      const alpha = new Uint8Array(w * h);
      for (let i = 0; i < alpha.length; i++) alpha[i] = data[i * 4 + 3];
      return { w, h, alpha };
    });
  } catch {
    return null;
  }
}

/** Loads the adventure / ending pieces; null without `advback` (→ vector adventure screen). Never throws. */
export async function loadAdventureKit(pack: OriginalPack, dialog: StatsKit | null): Promise<AdventureKit | null> {
  const safe = (p: Promise<Bitmap | null>): Promise<Bitmap | null> => p.catch(() => null);
  const font = (key: string): Promise<BitmapFont | null> => loadBitmapFont(pack, key).catch(() => null);
  try {
    const backP = safe(pack.masked('advback'));
    const pieces = Promise.all([
      safe(pack.image('advsky')), safe(pack.masked('advtitle')), safe(pack.masked('advhighscore')), safe(pack.masked('advstage')),
      safe(pack.masked('advplaybutton')), safe(pack.masked('advmainmenubutton')), safe(pack.image('happyending')),
    ]);
    const templeP = Promise.all(ADV_TEMPLE_KEYS.map(key => safe(pack.masked(key))));
    const doorP = Promise.all(Array.from({ length: DOOR_COUNT }, (_, i) => safe(pack.masked(advDoorKey(i)))));
    const fontP = Promise.all(['nativealienextended16', 'cancun10', 'cancun8', 'nativealien48', 'nativealienextended18'].map(font));
    const back = await backP;
    if (!back) return null;
    const [[sky, title, plaque, stage, play, mainMenu, happyEnding], templeList, doors, [brown, message, score, huge, titleFont]] = await Promise.all([pieces, templeP, doorP, fontP]);
    const temples: Record<string, Bitmap | null> = {};
    ADV_TEMPLE_KEYS.forEach((key, i) => { temples[key] = templeList[i]; });
    return {
      sky, back, title, plaque, stage, temples, doors, doorMasks: advDoorMasks(doors), play, mainMenu, happyEnding,
      fonts: { brown, message, score, number: dialog?.fonts.text ?? null, huge, title: titleFont }, dialog, pixelScale: 1,
    };
  } catch {
    return null;
  }
}

/**
 * The kit over 2 × EPX pictures and fonts (D-19), with the 2 × dialog kit when given. All or nothing, like
 * buildHdAssets / upscaleWelcomeKit: when any picture or font cannot be upscaled, the 1 × kit is returned.
 */
export function upscaleAdventureKit(kit: AdventureKit, dialogHd: StatsKit | null): AdventureKit {
  if (kit.pixelScale !== 1) return kit;
  let complete = true;
  const big = (image: Bitmap | null): Bitmap | null => {
    if (!image) return null;
    const out = upscaleBitmap(image);
    if (!out) complete = false;
    return out;
  };
  const font = (f: BitmapFont | null): BitmapFont | null => {
    if (!f) return null;
    const out = f.upscaled();
    if (out.pixelScale !== 2) complete = false;
    return out;
  };
  const back = big(kit.back);
  const temples: Record<string, Bitmap | null> = {};
  for (const key of Object.keys(kit.temples)) temples[key] = big(kit.temples[key]);
  const f = kit.fonts;
  const dialog = dialogHd ?? kit.dialog;
  const out: AdventureKit = {
    sky: big(kit.sky), back: back ?? kit.back, title: big(kit.title), plaque: big(kit.plaque), stage: big(kit.stage), temples,
    doors: kit.doors.map(big), doorMasks: kit.doorMasks, play: big(kit.play), mainMenu: big(kit.mainMenu), happyEnding: big(kit.happyEnding),
    fonts: { brown: font(f.brown), message: font(f.message), score: font(f.score), number: dialogHd?.fonts.text ?? font(f.number), huge: font(f.huge), title: font(f.title) },
    dialog, pixelScale: 2,
  };
  return complete && back ? out : kit;
}

/** Cel 0 alpha test of door `i` at a cel-local logical point (true when the kit has no mask for it). */
export function advDoorOpaque(kit: AdventureKit | null, i: number, lx: number, ly: number): boolean {
  const m = kit?.doorMasks?.[i];
  if (!m) return true;
  const x = Math.floor(lx);
  const y = Math.floor(ly);
  if (x < 0 || y < 0 || x >= m.w || y >= m.h) return false;
  return m.alpha[y * m.w + x] !== 0;
}

/** Logical cel widths and heights of the twelve doors (0 for a missing picture). */
export function advDoorSizes(kit: AdventureKit | null): { widths: number[]; heights: number[] } {
  const k = kit?.pixelScale ?? 1;
  const doors = kit?.doors ?? [];
  return {
    widths: Array.from({ length: DOOR_COUNT }, (_, i) => (doors[i] ? Math.floor(doors[i]!.width / k / 4) : ADV_VECTOR_DOOR.w)),
    heights: Array.from({ length: DOOR_COUNT }, (_, i) => (doors[i] ? Math.floor(doors[i]!.height / k) : ADV_VECTOR_DOOR.h)),
  };
}

// ------------------------------------------------------------------ drawing: adventure screen

export interface AdventureView {
  /** Counter in maj (10 ms) since the screen was entered. */
  c: number;
  maxStage: number;
  selected: number;
  hover: number | null;
  button: { hover: AdvButtonId | null; pressed: AdvButtonId | null };
  reveal: AdvReveal | null;
  shake: readonly number[];
  scores: readonly HighScore[];
  strings: Record<string, string> | null;
}

const ADV_W = 640;
const ADV_H = 480;
const ADV_VECTOR_FONT = '"Trebuchet MS", Verdana, sans-serif';
/** Door size of the vector screen (no pack picture). */
const ADV_VECTOR_DOOR = { w: 48, h: 40 };
/** 1 px black outline of the « OUTLINE » program fonts: the eight neighbours, then the text. */
const ADV_OUTLINE: ReadonlyArray<readonly [number, number]> = [[-1, -1], [0, -1], [1, -1], [-1, 0], [1, 0], [-1, 1], [0, 1], [1, 1]];

function advText(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, color: string, px: number, align: CanvasTextAlign = 'left'): void {
  ctx.font = `bold ${px}px ${ADV_VECTOR_FONT}`;
  ctx.textAlign = align;
  ctx.textBaseline = 'alphabetic';
  ctx.fillStyle = color;
  ctx.fillText(text, x, y);
}

/** Text in a bitmap font (tinted) or the vector stand-in; `outline` adds the 1 px black outline. */
function advWrite(ctx: CanvasRenderingContext2D, font: BitmapFont | null, text: string, x: number, y: number, color: string, align: 'left' | 'center' | 'right', px: number, outline = false): void {
  if (font) {
    if (outline) for (const [dx, dy] of ADV_OUTLINE) font.draw(ctx, text, x + dx, y + dy, { tint: '#000000', align });
    font.draw(ctx, text, x, y, { tint: color, align });
    return;
  }
  if (outline) {
    ctx.font = `bold ${px}px ${ADV_VECTOR_FONT}`;
    ctx.textAlign = align;
    ctx.textBaseline = 'alphabetic';
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#000000';
    ctx.strokeText(text, x, y);
  }
  advText(ctx, text, x, y, color, px, align);
}

/** Picture at its logical size (a 2 × kit picture is drawn at half its pixel size). */
function advImage(ctx: CanvasRenderingContext2D, image: Bitmap | null, x: number, y: number, k: number): void {
  if (!image) return;
  ctx.drawImage(image, x, y, image.width / k, image.height / k);
}

/** Cel `cel` of a picture cut in `cels` horizontal cels, drawn at its logical size. */
function advCel(ctx: CanvasRenderingContext2D, image: Bitmap | null, cel: number, cels: number, x: number, y: number, k: number): void {
  if (!image) return;
  const w = Math.floor(image.width / k / cels);
  const h = image.height / k;
  ctx.drawImage(image, cel * w * k, 0, w * k, h * k, x, y, w, h);
}

const advButtonCel = (id: AdvButtonId, view: AdventureView): number => (view.button.pressed === id ? 2 : view.button.hover === id ? 1 : 0);

/**
 * Draws the adventure screen in logical units (the caller sets the backing-store transform, Renderer.drawScene), in
 * the order of 0x441b50: sky ×3 (before the holed back), advback, advTitle, the plaque, the temples back to front with
 * their doors (cels from doorCel), the STAGE plaque and number, the temple name and the door message, the three
 * scores, the hint box; then the two buttons (child widgets). `kit` null → a vector adventure screen with the same
 * zones (never a DOM panel).
 */
export function drawAdventure(ctx: CanvasRenderingContext2D, kit: AdventureKit | null, view: AdventureView): void {
  const c = Number.isFinite(view.c) ? Math.max(0, view.c) : 0;
  if (!kit) {
    advDrawVector(ctx, view);
    return;
  }
  const k = kit.pixelScale;
  ctx.fillStyle = '#000';
  ctx.fillRect(0, 0, ADV_W, ADV_H);
  if (kit.sky) {
    const o = advSkyOffset(c);
    for (const x of [o - ADV.sky.w, o, o + ADV.sky.w]) ctx.drawImage(kit.sky, x, 0, ADV.sky.w, kit.sky.height / k);
  }
  ctx.drawImage(kit.back, 0, 0, ADV_W, kit.back.height / k);
  advImage(ctx, kit.title, ADV.title.x, ADV.title.y, k);
  advImage(ctx, kit.plaque, ADV.plaque.x, ADV.plaque.y, k);
  const saved = ctx.globalAlpha;
  for (const piece of advTemples(view.maxStage, view.reveal, view.shake)) {
    const image = kit.temples[piece.image] ?? null;
    if (piece.alpha <= 0) continue;
    ctx.globalAlpha = saved * piece.alpha;
    advImage(ctx, image, piece.x, piece.y, k);
    for (let i = piece.doors[0]; i < piece.doors[1]; i++) {
      const d = ADV.doors[i];
      advCel(ctx, kit.doors[i] ?? null, doorCel(i, view.maxStage, view.selected, view.hover), 4, d.x + piece.dx, d.y + piece.dy, k);
    }
    ctx.globalAlpha = saved;
  }
  advTexts(ctx, kit, view);
  advCel(ctx, kit.mainMenu, advButtonCel('main-menu', view), 3, ADV.buttons.mainMenu.x, ADV.buttons.mainMenu.y, k);
  advCel(ctx, kit.play, advButtonCel('play', view), 3, ADV.buttons.play.x, ADV.buttons.play.y, k);
}

/** STAGE plaque and number, the two lines, the plaque scores (names clipped at x 567) and the hint box. */
function advTexts(ctx: CanvasRenderingContext2D, kit: AdventureKit | null, view: AdventureView): void {
  const k = kit?.pixelScale ?? 1;
  const f = kit?.fonts;
  const S = ADV.stage;
  if (view.selected >= 0) {
    if (kit) advImage(ctx, kit.stage, S.x, S.y, k);
    else advText(ctx, 'STAGE', S.x + 4, S.numberBaseline, '#d9c48a', 12);
    advWrite(ctx, f?.number ?? null, String(Math.floor(view.selected) + 1), S.numberX, S.numberBaseline, S.color, 'left', 13);
  }
  const lines = advLines(view.selected, view.strings);
  const M = ADV.message;
  advWrite(ctx, f?.brown ?? null, lines.title, M.cx, M.baseline, '#ffffff', 'center', 16);
  advWrite(ctx, f?.message ?? null, lines.message, M.cx, M.second, M.secondColor, 'center', 12, true);
  const C = ADV.scores;
  const lineHeight = f?.score ? f.score.height : 12;
  const rows = scoreRows(view.scores, lineHeight);
  for (const row of rows) advWrite(ctx, f?.score ?? null, row.score, C.scoreX, row.baseline, C.color, 'left', 10, true);
  ctx.save();
  ctx.beginPath();
  ctx.rect(0, 0, C.nameClip, ADV_H);
  ctx.clip();
  for (const row of rows) advWrite(ctx, f?.score ?? null, row.name, C.nameX, row.baseline, C.color, 'left', 10, true);
  ctx.restore();
  const H = ADV.hint;
  const hint = advHint(view.hover, view.selected, view.strings);
  const font = f?.score ?? null;
  const measure = font ? (s: string): number => font.measure(s) : (s: string): number => { ctx.font = `bold 10px ${ADV_VECTOR_FONT}`; return ctx.measureText(s).width; };
  const first = H.y + (font ? font.ascent : 10);
  wrapText(hint, H.w, measure).forEach((line, i) => {
    const y = first + i * H.lineHeight;
    if (y <= H.y + H.h) advWrite(ctx, font, line, H.x, y, H.color, 'left', 10, true);
  });
}

/** Vector adventure screen (pack without its adventure pictures): the same zones, doors as boxes, texts, buttons. */
function advDrawVector(ctx: CanvasRenderingContext2D, view: AdventureView): void {
  const sky = ctx.createLinearGradient(0, 0, 0, ADV_H);
  sky.addColorStop(0, '#2c5a7a');
  sky.addColorStop(0.3, '#2f5a2a');
  sky.addColorStop(1, '#14260f');
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, ADV_W, ADV_H);
  advText(ctx, 'AVENTURE', 92, 46, '#f0c040', 26, 'center');
  advText(ctx, 'RECORDS', 548, 36, '#f0c040', 20, 'center');
  ADV.doors.forEach((d, i) => {
    const cel = doorCel(i, view.maxStage, view.selected, view.hover);
    ctx.fillStyle = cel === 3 ? '#ff9a2a' : cel === 2 ? '#b07a3a' : cel === 1 ? '#3a2a18' : '#6a6a5a';
    ctx.fillRect(d.x + 4, d.y + 4, ADV_VECTOR_DOOR.w, ADV_VECTOR_DOOR.h);
    ctx.lineWidth = 2;
    ctx.strokeStyle = '#d8c08a';
    ctx.strokeRect(d.x + 4, d.y + 4, ADV_VECTOR_DOOR.w, ADV_VECTOR_DOOR.h);
  });
  advTexts(ctx, null, view);
  for (const [id, label] of [['main-menu', 'MENU PRINCIPAL'], ['play', 'JOUER']] as const) {
    const r = id === 'play' ? ADV.buttons.play : ADV.buttons.mainMenu;
    const cel = advButtonCel(id, view);
    ctx.fillStyle = cel === 2 ? '#5a4a30' : cel === 1 ? '#a08a5a' : '#7a6a48';
    ctx.fillRect(r.x + 2, r.y + 2, r.w - 4, r.h - 4);
    advText(ctx, label, r.x + r.w / 2, r.y + r.h / 2 + 5, '#fff2c0', 13, 'center');
  }
}

// ------------------------------------------------------------------ god dialogue (TransitionMgr 0x430320–0x431b10)

export type GodTemple = 1 | 2 | 3 | 4 | 5;

/** Fallbacks of the frog's replies (strings.json values); the god texts fall back to their readable keys. */
const ADV_REPLY_STRINGS: Record<string, string> = {
  RIBBIT: 'Coâ-coâ.', 'RIBBIT_?': 'Coâ-coâ ?', 'RIBBIT_!': 'Coâ-coâ !', I_BEG_TO_DIFFER: '(Je proteste).', NEVER_GIVE_UP: '(Abandonner ? Jamais).',
  FULFILL_THE_PROPHECY: "(J'accomplirai la prophétie).", IN_SPACE: "(Dans l'espace) ?", WERD: '(Bizarre) !',
};

const advReply = (strings: Record<string, string> | null, key: string): string => strings?.[key] ?? ADV_REPLY_STRINGS[key] ?? key;

/** Pages of the god's speech: one per text key (temple 4 speaks twice). */
export function godPages(temple: GodTemple): number {
  return GOD_LINES[temple]?.god.length ?? 1;
}

/**
 * The dialogue's single footer button: the frog's reply « <RIBBIT…> <translation> » (0x430320–0x431b10 joins the two
 * strings with a space), the same on every page; it turns the page, then ends the dialogue.
 */
export function godDialogWidgets(strings: Record<string, string> | null, temple: GodTemple): Array<{ id: 'god-next'; rect: Rect; label: string }> {
  const L = MENU_LAYOUT;
  const [ribbit, reply] = (GOD_LINES[temple] ?? GOD_LINES[1]).reply;
  return [{ id: 'god-next', rect: { x: L.content.x, y: L.button.footer, w: L.content.w, h: L.button.h }, label: `${advReply(strings, ribbit)} ${advReply(strings, reply)}` }];
}

/**
 * God dialogue over the frozen board: the OPTIONS frame of the dialogs with the GodHead, the temple name as title (none
 * for the final « Espace » dialogue), the page's text wrapped on the content width, the reply button.
 */
export function drawGodDialog(ctx: CanvasRenderingContext2D, kit: StatsKit | null, view: { temple: GodTemple; page: number; hover: boolean; pressed: boolean }, strings: Record<string, string> | null): void {
  const table = kit?.strings ?? strings;
  const lines = GOD_LINES[view.temple] ?? GOD_LINES[1];
  const page = Math.max(0, Math.min(lines.god.length - 1, Number.isFinite(view.page) ? Math.floor(view.page) : 0));
  const title = view.temple <= 4 ? advTempleName(table, view.temple - 1) : '';
  mmDialogFrame(ctx, kit, title);
  const key = lines.god[page];
  const text = (table?.[key] ?? key.replace(/_/g, ' ')).replace(/&cr;/g, ' ');
  const font = kit?.fonts.text ?? null;
  const measure = font ? (s: string): number => font.measure(s) : (s: string): number => { ctx.font = `bold 14px ${ADV_VECTOR_FONT}`; return ctx.measureText(s).width; };
  mmDialogBody(ctx, kit, wrapText(text, MENU_LAYOUT.content.w, measure), WELCOME_DIALOG.bodyFirst, false);
  const [button] = godDialogWidgets(table, view.temple);
  const state: MmButtonState = view.pressed ? 'pressed' : view.hover ? 'hover' : 'normal';
  mmDialogButton(ctx, kit, button.rect, button.label, state);
}

// ------------------------------------------------------------------ ending (D-03, D-10)

/**
 * Ending screen layout (D-10, no original counterpart beyond `happyending`: the original scrolls the credits over it,
 * not reproduced): the title, the final score, the advHighscore plaque heading the dialogbox table of the ten best
 * scores (rank, name, score; the run's row highlighted), one OK.
 */
export const ADV_ENDING = {
  title: { cx: 320, baseline: 60, maxWidth: 600 },
  score: { cx: 320, baseline: 100 },
  plaque: { x: 228, y: 110 },
  frame: { x: 150, y: 146, w: 340, h: 326 } as Rect,
  rows: { first: 210, lineHeight: 18, rankRight: 196, nameX: 206, nameClip: 380, scoreRight: 446 },
  ok: { x: 260, y: 406, w: 120, h: 48 } as Rect,
  highlight: '#ffff4c',
  text: '#ffffff',
};

export function endingWidgets(): Array<{ id: 'ending-ok'; rect: Rect; label: string }> {
  return [{ id: 'ending-ok', rect: { ...ADV_ENDING.ok }, label: 'OK' }];
}

export interface EndingView { score: number; rank: number | null; scores: readonly HighScore[]; hover: boolean; pressed: boolean; strings: Record<string, string> | null }

/**
 * Ending screen: `happyending` full screen at (0, 0), CONGRATULATIONS (« FÉLICITATIONS ! ») in NativeAlien48 when it
 * fits 600 px (else NativeAlienExtended18), « Score : N », the plaque over the dialogbox table of the ten best scores
 * with the run's row in 0xffff4c (rank null: the run is out of the table, the score line says it), OK. `kit` null →
 * the same layout in vector form.
 */
export function drawEnding(ctx: CanvasRenderingContext2D, kit: AdventureKit | null, view: EndingView): void {
  const E = ADV_ENDING;
  const k = kit?.pixelScale ?? 1;
  const dialog = kit?.dialog ?? null;
  const table = view.strings ?? dialog?.strings ?? null;
  if (kit?.happyEnding) ctx.drawImage(kit.happyEnding, 0, 0, ADV_W, ADV_H);
  else {
    ctx.fillStyle = '#3a3428';
    ctx.fillRect(0, 0, ADV_W, ADV_H);
  }
  const title = table?.CONGRATULATIONS ?? 'FÉLICITATIONS !';
  const huge = kit?.fonts.huge ?? null;
  if (huge && huge.measure(title) <= E.title.maxWidth) huge.draw(ctx, title, E.title.cx, E.title.baseline, { align: 'center' });
  else if (kit?.fonts.title) kit.fonts.title.draw(ctx, title, E.title.cx, E.title.baseline, { align: 'center', multiply: '#f0c040' });
  else advWrite(ctx, null, title, E.title.cx, E.title.baseline, '#ffd84a', 'center', 40, true);
  const score = Math.max(0, Math.floor(advFinite(view.score)));
  advWrite(ctx, kit?.fonts.brown ?? null, `${table?.SCORE ?? 'Score :'} ${score}`, E.score.cx, E.score.baseline, '#ffffff', 'center', 18, !kit?.fonts.brown);
  if (dialog) drawNineSlice(ctx, dialog.frame, STATS_LAYOUT.source, STATS_LAYOUT.inset, E.frame, dialog.pixelScale);
  else {
    ctx.fillStyle = 'rgba(28,18,7,.88)';
    ctx.fillRect(E.frame.x, E.frame.y, E.frame.w, E.frame.h);
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c9a85a';
    ctx.strokeRect(E.frame.x, E.frame.y, E.frame.w, E.frame.h);
  }
  if (kit?.plaque) advImage(ctx, kit.plaque, E.plaque.x, E.plaque.y, k);
  else advText(ctx, 'RECORDS', 320, E.plaque.y + 40, '#f0c040', 22, 'center');
  const R = E.rows;
  const font = dialog?.fonts.text ?? null;
  view.scores.slice(0, 10).forEach((entry, i) => {
    const y = R.first + i * R.lineHeight;
    const color = i === view.rank ? E.highlight : E.text;
    advWrite(ctx, font, `${i + 1}.`, R.rankRight, y, color, 'right', 14);
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, R.nameClip, ADV_H);
    ctx.clip();
    advWrite(ctx, font, entry.name, R.nameX, y, color, 'left', 14);
    ctx.restore();
    advWrite(ctx, font, String(Math.max(0, Math.floor(advFinite(entry.score)))), R.scoreRight, y, color, 'right', 14);
  });
  const [ok] = endingWidgets();
  mmDialogButton(ctx, dialog, ok.rect, table?.DIALOG_BUTTON_OK ?? ok.label, view.pressed ? 'pressed' : view.hover ? 'hover' : 'normal');
}
