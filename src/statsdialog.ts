/**
 * Native STATS dialog composed at run time from the original building blocks
 * (plan 05-03, D-01…D-05): `dialogbox` as a 9-slice frame, `GodHead` overlapping the
 * top edge, `DialogButton` (three 120×48 states) and the PopCap bitmap fonts, with the
 * labels taken from `strings.json`. The composition targets a 640×480 canvas that
 * main.ts lays as the inline background of `.zuma-stats` (no `url(` in the stylesheet).
 *
 * Everything that does not need a canvas (`STATS_LAYOUT`, `statsValues`, `bestTime`,
 * `bestTimeKey`, `formatSeconds`, `wrapText`) is pure so the Node tests can lock it.
 */
import { BitmapFont, loadBitmapFont } from './bitmapfont.js';
import type { Bitmap, OriginalPack } from './original.js';
import { upscaleBitmap } from './upscale.js';

export interface Rect { x: number; y: number; w: number; h: number }
export interface Point { x: number; y: number }

export interface StatsKit {
  /** `dialogbox` with its `_dialogbox` mask (243×242, opaque region in `STATS_LAYOUT.source`). */
  frame: Bitmap;
  /** `GodHead` with its mask (156×140), optional. */
  head: Bitmap | null;
  /** `DialogButton` with its mask: 360×48 = normal / hover / pressed, 120 px each. */
  button: Bitmap;
  /** `tip` = Arial12Bold (else Cancun10); `tipSmall` = Cancun10 when a bigger tip font exists, tried before the ellipsis (D-20). */
  fonts: { title: BitmapFont; text: BitmapFont; tip: BitmapFont | null; tipSmall: BitmapFont | null };
  strings: Record<string, string>;
  /** 1, or 2 when every piece and font of the kit is the 2 × EPX copy (upscaleStatsKit, D-19). */
  pixelScale: 1 | 2;
}

export interface StatsValues { points: string; combos: string; coins: string; gaps: string; chain: string; comboMax: string; time: string; objective: string; bonus: string; record: string }

/** Reveal order: left column top to bottom, then the right column (D-05). */
export const STATS_ORDER: ReadonlyArray<keyof StatsValues> = ['points', 'combos', 'coins', 'gaps', 'chain', 'comboMax', 'time', 'objective', 'bonus', 'record'];

/** Margins of a single footer button inside a dialog frame (left, right, bottom) and its height. */
export interface FooterRule { left: number; right: number; bottom: number; height: number }

/**
 * Footer button of the original `Dialog` (D-36, spike 02 Q5). `Dialog::Resize` (0x4ac160, vtable slot 25) places a
 * single button at x = background.left + content.left, y = height − content.bottom − background.bottom − mButtonHeight,
 * width = width − the four horizontal insets, height = `mButtonHeight` (0x4b34b2: `DialogButton` height, 48). The STATS
 * (0x446ec0 → 0x43ef30 with the head flag) has background insets 0 / 80 / 0 / 0 and content insets 36 / 52 / 36 / 36
 * (left / top / right / bottom). Those apply to the drawn box, whose `_dialogbox` mask leaves 11 px left, 3 px right
 * and 11 px bottom transparent around our opaque `frame`: 25 / 33 / 25 px from the opaque edges. Our frame is centred
 * on 320 like the original box (x = (640 − W) / 2, 0x434642), so the 4 px horizontal asymmetry is shared: 29 / 29.
 */
export const STATS_OK_RULE: FooterRule = { left: 29, right: 29, bottom: 25, height: 48 };

/** Rectangle of a single footer button inside `frame` (pure). */
export function statsOkRect(frame: Rect, rule: FooterRule): Rect {
  return { x: frame.x + rule.left, y: frame.y + frame.h - rule.bottom - rule.height, w: frame.w - rule.left - rule.right, h: rule.height };
}

const STATS_FRAME: Rect = { x: 109, y: 91, w: 422, h: 355 };
const STATS_OK = statsOkRect(STATS_FRAME, STATS_OK_RULE);

/**
 * Pixel layout in the 640×480 stage, measured on the R2.0.12 reference picture
 * (frame x 17 %–83 %, y 19 %–93 %; baselines = top of the digits + 11). The OK follows `STATS_OK_RULE`.
 */
export const STATS_LAYOUT = {
  frame: STATS_FRAME,
  /** Opaque part of `dialogbox.jpg` (the gif mask leaves transparent margins left and bottom). */
  source: { x: 11, y: 0, w: 229, h: 231 } as Rect,
  /** 9-slice corner size, in source pixels (the carved corner blocks are ≈ 34 px). */
  inset: 36,
  head: { x: 320 - 78, y: 8 } as Point,
  title: { x: 320, baseline: 174 },
  rule: { y: 188, x1: 150, x2: 490 },
  separator: { x: 321, y1: 200, y2: 312 },
  /** Columns: label at labelX, value right-aligned at valueRight; baselines from `statsRows(lineHeight, first)` (D-18). */
  left: { labelX: 135, valueRight: 299, first: 219 },
  right: { labelX: 335, valueRight: 489, first: 219 },
  /**
   * Tip inset (D-20): « ASTUCE : » at `labelX`, the text left-aligned `gap` px after the label on `maxLines`
   * lines at most, wrapped on the room left in the box (never more than `maxWidth`).
   * R2.0.20 (D-36): the box keeps its top (the rows stay above it for every line height) and ends 2 px above the
   * OK (h 60 → 51, as before: 380 / 382); the text is re-centred in it (baseline 350 → 348).
   * R2.0.20 fix: a tip that needs more than `maxLines` lines in the column runs in under the label on `runInLines`
   * lines in the same font (layoutTipBlock) instead of switching to Cancun10 capitals with an ellipsis; the first
   * of three run-in baselines is `runInFirst` (336 / 350 / 364: ≈ 5 px of ink margin above, 4 below in the 51 px inset).
   */
  tip: { labelX: 150, baseline: 348, gap: 6, maxWidth: 270, lineHeight: 14, maxLines: 2, runInLines: 3, runInFirst: 336, align: 'left' as const, box: { x: 133, y: 320, w: 374, h: STATS_OK.y - 2 - 320 } as Rect },
  ok: STATS_OK,
  /** Label baseline: 30 px under the top of a 48 px button, centred for another height. */
  okLabelBaseline: STATS_OK.y + (STATS_OK.h - 48) / 2 + 30,
};

/**
 * Colours read in the original dialog (0x4525f0, §8): 0xffff00 before TEMPS, 0xffa500 before OBJECTIF,
 * 0x2aff03 for BONUS, 0x9dcba2 for NO_TIME_BONUS; labels yellow, values cream, RECORD gold (D-02) and the
 * NativeAlienExtended18 title multiplied by gold (D-18).
 */
export const STATS_COLORS = {
  label: '#f5d65b', value: '#fcf4d0', time: '#ffff00', objective: '#ffa500', bonus: '#2aff03', noBonus: '#9dcba2', record: '#fcdc80', title: '#f0c040',
};

/** Line height of the two columns as a multiple of the text font's capital height (D-18). */
export const STATS_LINE_RATIO = 1.65;
/** Line height used when the font gives no usable capital height, and the bounds that keep the rows above the tip box (T-05-18). */
export const STATS_LINE_FALLBACK = 19;
export const STATS_LINE_MIN = 16;
export const STATS_LINE_MAX = 20;

export interface StatsRows { left: number[]; right: { time: number; objective: number; rule: number; bonus: number; record: number } }

/**
 * Baselines of the six left rows and of the right column for a line height (D-20): one grid for both
 * columns — TEMPS on POINTS, OBJECTIF on COMBOS, the rule in the middle of the PIÈCES row, BONUS on
 * SAUTS, RECORD on ENCH. MAX. Research 02 Q4 reads the right labels at x0 + 200 and the line height as
 * font height + 1; the exact y of each line was not read, hence the shared grid.
 */
export function statsRows(lineHeight: number, first = 219): StatsRows {
  const lh = Number.isFinite(lineHeight) ? lineHeight : STATS_LINE_FALLBACK;
  const left = Array.from({ length: 6 }, (_, i) => Math.round(first + i * lh));
  return { left, right: { time: left[0], objective: left[1], rule: left[2] - Math.round(0.35 * lh), bonus: left[3], record: left[4] } };
}

/**
 * Points per count-up step (D-21): 100 while the total is at most 2 000, else the smallest multiple of
 * 100 that is ≥ total / 20, so the count-up never exceeds 20 steps (≈ 2 s). A non-finite total → 100.
 * The original counts +100 every 10 updates with no acceleration (research 02 Q3); the bounded step
 * and the click-to-fast mode are a deliberate deviation requested in UAT 5 (U24).
 */
export function bonusCountStep(total: number): number {
  if (!Number.isFinite(total) || total <= 2000) return 100;
  return Math.ceil(total / 20 / 100) * 100;
}

/** Points per step once the player clicks the dialog (0x440b82–0x440b9b: 2 500 per step in the `board+0x186` mode, never raised in adventure). */
export const BONUS_FAST_STEP = 2500;

/**
 * Time bonus shown `elapsedMs` after the dialog opened (0x440b00, §8): nothing during the first
 * second (100 updates), then one `step` every 100 ms (10 updates) up to `total`; the last step is
 * partial. `step` defaults to `bonusCountStep(total)`; a non-positive or non-finite step does too.
 */
export function bonusCountUp(total: number, elapsedMs: number, step = bonusCountStep(total)): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 1000) return 0;
  const s = Number.isFinite(step) && step > 0 ? step : bonusCountStep(total);
  return Math.min(total, s * (Math.floor((elapsedMs - 1000) / 100) + 1));
}

/** Pitch of the `endoflevelpop1` of each count-up step: 1 → 1.5 with the shown share (hypothesis A5: the original passes shown / 1000). */
export function bonusPopRate(shown: number, total: number): number {
  const share = total > 0 && Number.isFinite(shown) ? Math.max(0, Math.min(1, shown / total)) : 0;
  return 1 + 0.5 * share;
}

/** « 29 s » under a minute, « 1:42 » beyond, like the original dialog. */
export function formatSeconds(seconds: number): string {
  const s = Math.max(0, Math.round(Number.isFinite(seconds) ? seconds : 0));
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

export interface StatsInput {
  levelScore: number; combos: number; coins: number; gaps: number; maxStreak: number; maxCombo: number;
  seconds: number; parTime: number; timeBonus: number; won: boolean; bestSeconds: number | null; noBonusLabel: string;
  /** Share of `timeBonus` already counted up in the dialog (default: the whole bonus). */
  timeBonusShown?: number;
}

/**
 * The ten displayed strings (D-04, D-05): BONUS is `+N` only on a win with a time bonus (N = the counted-up
 * share while the dialog is open, `timeBonusShown`); RECORD falls back to the current time.
 */
export function statsValues(input: StatsInput): StatsValues {
  const int = (v: number): string => String(Math.max(0, Math.round(Number.isFinite(v) ? v : 0)));
  const bonus = input.won && input.timeBonus > 0 ? `+${int(input.timeBonusShown ?? input.timeBonus)}` : input.noBonusLabel;
  return {
    points: int(input.levelScore),
    combos: int(input.combos),
    coins: int(input.coins),
    gaps: int(input.gaps),
    chain: int(input.maxStreak),
    comboMax: int(input.maxCombo),
    time: formatSeconds(input.seconds),
    objective: input.parTime > 0 ? formatSeconds(input.parTime) : '—',
    bonus,
    record: formatSeconds(input.bestSeconds ?? input.seconds),
  };
}

/**
 * Extra record cells of the STATS (phase 6.1, D-09): `name` = first name of the holder of the best time shown in the
 * RECORD row, `personal` = the player's own best (already formatted) when it differs from it. Null → nothing drawn.
 */
export interface StatsRecordCells { name: string | null; personal: string | null }

/** Vector / DOM panel text of the RECORD row: « 1:23 (Sophie) », or the time alone when the name is null or blank. */
export function recordLabel(time: string, name: string | null): string {
  const n = (name ?? '').trim();
  return n ? `${time} (${n})` : time;
}

/** One row of the sixth right-column line (layoutRecordRow). */
export interface StatsRecordRow {
  personal: { label: string; labelX: number; value: string; valueX: number } | null;
  name: { text: string; right: number } | null;
}

/**
 * Sixth row of the right column of the STATS (phase 6.1, D-09), aligned on COMBO MAX. and empty in the original. The
 * R2.0.20 capture (3.125 px per logical pixel) gives 154 px between the label (x 335) and the right edge of the values
 * (x 489), « RECORD » ≈ 69 px and ≈ 9.6 px per capital: « 1:23 (SOPHIE) » cannot sit beside the RECORD label and must
 * not replace it, so the RECORD row keeps the time and this row carries « (NAME) » right-aligned on x 489 under it.
 * When the personal best differs, `personalLabel` sits at x 335 and the personal time 6 px after it; the name then
 * takes what is left (≥ 8 px gap), code points cut from its end and « . » appended until it fits, one letter + « . »
 * at least. Names are drawn in capitals like every text of the dialog. `measure` = width in the text font.
 */
export function layoutRecordRow(cells: StatsRecordCells, measure: (s: string) => number, personalLabel = 'MOI'): StatsRecordRow {
  const R = STATS_LAYOUT.right;
  const value = (cells.personal ?? '').trim();
  const personal = value ? { label: personalLabel, labelX: R.labelX, value, valueX: R.labelX + measure(personalLabel) + 6 } : null;
  const raw = (cells.name ?? '').trim().toUpperCase();
  if (!raw) return { personal, name: null };
  const left = personal ? personal.valueX + measure(personal.value) + 8 : R.labelX;
  const room = R.valueRight - left;
  let text = `(${raw})`;
  if (measure(text) > room) {
    const points = [...raw];
    let n = points.length - 1;
    text = `(${points.slice(0, Math.max(1, n)).join('')}.)`;
    while (n > 1 && measure(text) > room) {
      n--;
      text = `(${points.slice(0, n).join('')}.)`;
    }
  }
  return { personal, name: { text, right: R.valueRight } };
}

/** `localStorage` key of a level's best time; the id is lower-cased and reduced to `[a-z0-9-]` (T-05-08). */
export function bestTimeKey(levelId: string): string {
  return 'zuma.best.' + String(levelId).toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/** A win keeps the shorter time; otherwise the stored record (or the current time when none exists) is shown unchanged. */
export function bestTime(stored: number | null, seconds: number, won: boolean): number {
  if (won) return Math.min(stored ?? Number.POSITIVE_INFINITY, seconds);
  return stored ?? seconds;
}

/** Word wrap on `maxWidth` using `measure`; `&cr;` (original line break entity) counts as a space. */
export function wrapText(text: string, maxWidth: number, measure: (s: string) => number): string[] {
  const words = text.replace(/&cr;/g, ' ').split(/\s+/).filter(w => w.length > 0);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/**
 * Tip lines (D-20): wrapped with `measure` on `maxWidth`; when that takes more than two lines and a
 * smaller font is available (`measureSmall`), wrapped again with it (`small` = true); when it still
 * overflows, the second line is cut word by word until `line + '…'` fits. Never more than two lines.
 */
export function layoutTip(text: string, maxWidth: number, measure: (s: string) => number, measureSmall: ((s: string) => number) | null, ellipsis = '…'): { lines: string[]; small: boolean } {
  const MAX = 2;
  let lines = wrapText(text, maxWidth, measure);
  let small = false;
  let m = measure;
  if (lines.length > MAX && measureSmall) {
    lines = wrapText(text, maxWidth, measureSmall);
    small = true;
    m = measureSmall;
  }
  if (lines.length > MAX) {
    const words = lines[MAX - 1].split(' ');
    while (words.length > 0 && m(`${words.join(' ')}${ellipsis}`) > maxWidth) words.pop();
    lines = [...lines.slice(0, MAX - 1), `${words.join(' ')}${ellipsis}`];
  }
  return { lines, small };
}

/** Word wrap where line `i` may take `widthOf(i)` px; same rules as `wrapText` (`&cr;` is a space). */
export function wrapTextWidths(text: string, widthOf: (line: number) => number, measure: (s: string) => number): string[] {
  const words = text.replace(/&cr;/g, ' ').split(/\s+/).filter(w => w.length > 0);
  const lines: string[] = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (line && measure(candidate) > widthOf(lines.length)) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

export interface TipLine { text: string; x: number; baseline: number }
export interface TipBlock { lines: TipLine[]; small: boolean; labelBaseline: number }

/**
 * Tip placement in `STATS_LAYOUT.tip` for a label `labelWidth` px wide (R2.0.20 fix of D-20). Two lines of
 * Arial12Bold after « ASTUCE : » hold only 2 of the 7 original tips (the longest needs 451 px per line, more than
 * the whole frame), and the old fallback drew the other five in Cancun10 capitals cut by « ... ». Now:
 * 1. the column after the label on `maxLines` lines when the tip fits there (label centred on them, as in R2.0.19);
 * 2. else a run-in paragraph on `runInLines` lines: the first after the label, the next ones from the label's x,
 *    label on the first baseline, still in the tip font;
 * 3. else the R2.0.17 column (`layoutTip`: smaller font, then the ellipsis).
 */
export function layoutTipBlock(text: string, labelWidth: number, measure: (s: string) => number, measureSmall: ((s: string) => number) | null, ellipsis = '…'): TipBlock {
  const T = STATS_LAYOUT.tip;
  const right = T.box.x + T.box.w - 10;
  const textX = T.labelX + labelWidth + T.gap;
  const firstWidth = Math.min(T.maxWidth, right - textX);
  const centred = (n: number): number => T.baseline - Math.round(((n - 1) * T.lineHeight) / 2);
  const column = (lines: string[], small: boolean): TipBlock => {
    const first = T.baseline - (lines.length > 1 ? Math.round(T.lineHeight / 2) : 0);
    return { lines: lines.slice(0, T.maxLines).map((s, i) => ({ text: s, x: textX, baseline: first + i * T.lineHeight })), small, labelBaseline: T.baseline };
  };
  const wrapped = wrapText(text, firstWidth, measure);
  if (wrapped.length <= T.maxLines) return column(wrapped, false);
  const runIn = wrapTextWidths(text, i => (i === 0 ? firstWidth : right - T.labelX), measure);
  if (runIn.length <= T.runInLines) {
    const first = runIn.length === T.runInLines ? T.runInFirst : centred(runIn.length);
    return { lines: runIn.map((s, i) => ({ text: s, x: i === 0 ? textX : T.labelX, baseline: first + i * T.lineHeight })), small: false, labelBaseline: first };
  }
  const fallback = layoutTip(text, firstWidth, measure, measureSmall, ellipsis);
  return column(fallback.lines, fallback.small);
}

/** Keys of the original tips shown under « ASTUCE » (strings.json). */
export const TIP_KEYS = [
  'SHOOT_COINS_FOR_EXTRA_POINTS', 'SCORE_POINTS_TO_FILL_THE_ORANGE_GAUGE', 'CREATE_COMBOS_OF_2_OR_MORE_EXPLOSIONS',
  'CLOSE_GAPS_BY_PLACING_BALLS_OF_THE_SAME_COLOR', 'FINISH_A_LEVEL_QUICKLY', 'SHOOT_BALLS_THROUGH_TWO_OR_MORE_GAPS', 'PRESS_SPACE_BAR_TO_PAUSE',
] as const;

// -------------------------------------------------------------------- loading

/**
 * Loads the frame, head, button, fonts and strings in parallel. Null (→ vector panel)
 * when the frame, the button, one of the two main fonts or the strings are missing;
 * the head and the tip font are optional (tip falls back to `cancun10`, then to the text font).
 */
export async function loadStatsKit(pack: OriginalPack): Promise<StatsKit | null> {
  try {
    const [frame, head, button, title, text, arial, cancun10, strings] = await Promise.all([
      pack.masked('dialogbox'),
      pack.masked('godhead'),
      pack.masked('dialogbutton', '_dialogbutton'),
      loadBitmapFont(pack, 'nativealienextended18'),
      loadBitmapFont(pack, 'cancun12'),
      loadBitmapFont(pack, 'arial12bold'),
      loadBitmapFont(pack, 'cancun10'),
      pack.strings(),
    ]);
    if (!frame || !button || !title || !text || !strings) return null;
    return { frame, head, button, fonts: { title, text, tip: arial ?? cancun10, tipSmall: arial ? cancun10 : null }, strings, pixelScale: 1 };
  } catch {
    return null;
  }
}

/**
 * The kit over 2 × EPX pictures (D-19): frame, head, button through `upscaleBitmap`, fonts through
 * `upscaled()`, strings shared, `pixelScale` 2. All or nothing: when any piece cannot be read the
 * 1 × kit is returned unchanged.
 */
export function upscaleStatsKit(kit: StatsKit): StatsKit {
  if (kit.pixelScale !== 1) return kit;
  const frame = upscaleBitmap(kit.frame);
  const button = upscaleBitmap(kit.button);
  const head = kit.head ? upscaleBitmap(kit.head) : null;
  const title = kit.fonts.title.upscaled();
  const text = kit.fonts.text.upscaled();
  const tip = kit.fonts.tip ? kit.fonts.tip.upscaled() : null;
  const tipSmall = kit.fonts.tipSmall ? kit.fonts.tipSmall.upscaled() : null;
  const fontsOk = title.pixelScale === 2 && text.pixelScale === 2 && (!tip || tip.pixelScale === 2) && (!tipSmall || tipSmall.pixelScale === 2);
  if (!frame || !button || (kit.head && !head) || !fontsOk) return kit;
  return { frame, head, button, fonts: { title, text, tip, tipSmall }, strings: kit.strings, pixelScale: 2 };
}

// ------------------------------------------------------------------ composing

export type ButtonState = 'normal' | 'hover' | 'pressed';
/** `record` (phase 6.1): holder's name of the best time and differing personal best, drawn on the sixth right row. */
export interface ComposeOptions { revealed: number; button: ButtonState; tip: string; record?: StatsRecordCells }

export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 480;

/**
 * Draws the whole dialog on a canvas (reused when given) of 640 × 480 logical pixels composed at
 * `scale` backing-store pixels per logical pixel (1..4, D-19: one resampling only, the canvas
 * being shown at its physical size): 9-slice frame, head, title, rules, labels, the first
 * `options.revealed` values in `STATS_ORDER`, the tip and the OK button in its `options.button`
 * state. Returns the canvas.
 */
export function composeStatsDialog(kit: StatsKit, values: StatsValues, options: ComposeOptions, canvas?: HTMLCanvasElement, scale = 1): HTMLCanvasElement {
  const out = canvas ?? document.createElement('canvas');
  const s = Math.max(1, Math.min(4, Number.isFinite(scale) ? scale : 1));
  const width = Math.round(STAGE_WIDTH * s);
  const height = Math.round(STAGE_HEIGHT * s);
  if (out.width !== width) out.width = width;
  if (out.height !== height) out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const L = STATS_LAYOUT;
  const C = STATS_COLORS;
  const { title, text } = kit.fonts;
  const tipFont = kit.fonts.tip ?? text;
  const str = (key: string, fallback: string): string => kit.strings[key] ?? fallback;
  // Pictures of a 2 × kit are cut at 2 × and drawn at their logical size (the fonts do the same in BitmapFont.draw).
  const k = kit.pixelScale;

  drawNineSlice(ctx, kit.frame, L.source, L.inset, L.frame, k);
  if (kit.head) ctx.drawImage(kit.head, 0, 0, kit.head.width, kit.head.height, L.head.x, L.head.y, kit.head.width / k, kit.head.height / k);

  // Title in its own colours multiplied by gold (D-18); rows spaced 1.65 × the capital height, bounded (T-05-18).
  title.draw(ctx, str('STATS', 'STATISTIQUES'), L.title.x, L.title.baseline, { align: 'center', multiply: C.title });
  const cap = text.capHeight;
  const lineHeight = Number.isFinite(cap) && cap > 0 ? Math.max(STATS_LINE_MIN, Math.min(STATS_LINE_MAX, Math.round(STATS_LINE_RATIO * cap))) : STATS_LINE_FALLBACK;
  const leftRows = statsRows(lineHeight, L.left.first);
  const rightRows = statsRows(lineHeight, L.right.first).right;
  rule(ctx, L.rule.x1, L.rule.y, L.rule.x2, L.rule.y);
  rule(ctx, L.separator.x, L.separator.y1, L.separator.x, L.separator.y2);
  rule(ctx, L.right.labelX, rightRows.rule, L.right.valueRight, rightRows.rule);

  // The ten rows in STATS_ORDER: label (yellow) at labelX, value right-aligned at `right`.
  // The BONUS value without a « + » is the NO_TIME_BONUS label and takes its own tint (0x9dcba2).
  const leftLabels: Array<[string, string]> = [['POINTS', 'POINTS'], ['COMBOS', 'COMBOS'], ['COINS', 'PIÈCES'], ['GAPS', 'SAUTS'], ['MAX_CHAIN', 'ENCH. MAX.'], ['MAX_COMBO', 'COMBO MAX.']];
  const bonusColor = values.bonus.startsWith('+') ? C.bonus : C.noBonus;
  const rows: Array<{ key: keyof StatsValues; label: string; labelX: number; right: number; baseline: number; color: string }> = [
    ...leftLabels.map(([k, fb], i) => ({ key: STATS_ORDER[i], label: str(k, fb), labelX: L.left.labelX, right: L.left.valueRight, baseline: leftRows.left[i], color: C.value })),
    { key: 'time', label: str('YOUR_TIME', 'TEMPS'), labelX: L.right.labelX, right: L.right.valueRight, baseline: rightRows.time, color: C.time },
    { key: 'objective', label: str('ACE_TIME', 'OBJECTIF'), labelX: L.right.labelX, right: L.right.valueRight, baseline: rightRows.objective, color: C.objective },
    { key: 'bonus', label: str('BONUS', 'BONUS'), labelX: L.right.labelX, right: L.right.valueRight, baseline: rightRows.bonus, color: bonusColor },
    { key: 'record', label: str('BEST_TIME', 'RECORD'), labelX: L.right.labelX, right: L.right.valueRight, baseline: rightRows.record, color: C.record },
  ];
  const revealed = Math.max(0, Math.min(STATS_ORDER.length, Math.floor(options.revealed)));
  rows.forEach((row, i) => {
    const value = values[row.key];
    const shown = i < revealed;
    // A value too wide to sit beside its label (« PAS DE BONUS ») replaces the label on its row, as in the original.
    const fits = row.right - text.measure(value) >= row.labelX + text.measure(row.label) + 6;
    if (!shown || fits) text.draw(ctx, row.label, row.labelX, row.baseline, { tint: C.label });
    if (shown) text.draw(ctx, value, row.right, row.baseline, { tint: row.color, align: 'right' });
  });

  // Shared records (phase 6.1, D-09): the holder of the best time and the differing personal best on the sixth right
  // row, revealed with the RECORD value; nothing at all without them (the R2.0.21 dialog).
  if (options.record && revealed >= STATS_ORDER.length) {
    const extra = layoutRecordRow(options.record, s => text.measure(s));
    const baseline = statsRows(lineHeight, L.right.first).left[5];
    if (extra.personal) {
      text.draw(ctx, extra.personal.label, extra.personal.labelX, baseline, { tint: C.label });
      text.draw(ctx, extra.personal.value, extra.personal.valueX, baseline, { tint: C.record });
    }
    if (extra.name) text.draw(ctx, extra.name.text, extra.name.right, baseline, { tint: C.record, align: 'right' });
  }

  // Tip inset (a darker band as in the reference): « ASTUCE : » then the text left-aligned after it on two
  // lines (D-20), else run in under the label on three lines in the same font; the smaller font and the
  // ellipsis only beyond that (layoutTipBlock → layoutTip).
  insetBox(ctx, L.tip.box);
  const tipLabel = `${str('TIP', 'ASTUCE')} :`;
  const tipSmall = kit.fonts.tipSmall;
  // No pack font defines U+2026 (an unknown character is skipped by the layout): three dots then.
  const ellipsis = tipFont.measure('…') > 0 ? '…' : '...';
  const tip = layoutTipBlock(options.tip, text.measure(tipLabel), s => tipFont.measure(s), tipSmall ? s => tipSmall.measure(s) : null, ellipsis);
  text.draw(ctx, tipLabel, L.tip.labelX, tip.labelBaseline, { tint: C.label });
  const lineFont = tip.small && tipSmall ? tipSmall : tipFont;
  tip.lines.forEach(line => lineFont.draw(ctx, line.text, line.x, line.baseline, { tint: C.value, align: 'left' }));

  // OK button: the footer button of the original Dialog (D-36), one painted state in three slices, label centred
  // (nudged when pressed).
  drawDialogButton(ctx, kit.button, options.button, L.ok, k);
  const nudge = options.button === 'pressed' ? 1 : 0;
  text.draw(ctx, str('DIALOG_BUTTON_OK', str('OK', 'OK')), L.ok.x + L.ok.w / 2 + nudge, L.okLabelBaseline + nudge, { tint: C.value, align: 'center' });
  return out;
}

/** One `DialogButton` state: 120 × 48 source px, normal / hover / pressed side by side. */
export const DIALOG_BUTTON = { w: 120, h: 48, edge: 22 };

/**
 * `DialogButton` over `rect` in three horizontal slices (D-36, shared with the menu): the `edge`-px ends unscaled, the
 * centre stretched; the state picks the 120 px column. `sourceScale` (2 for an upscaled picture) multiplies the source.
 */
export function drawDialogButton(ctx: Pick<CanvasRenderingContext2D, 'drawImage'>, image: Bitmap, state: ButtonState, rect: Rect, sourceScale = 1, edge = DIALOG_BUTTON.edge): void {
  const { w: bw, h: bh } = DIALOG_BUTTON;
  const k = sourceScale;
  const e = Math.max(0, Math.min(edge, Math.floor(rect.w / 2), Math.floor(bw / 2)));
  const sx = (state === 'hover' ? 1 : state === 'pressed' ? 2 : 0) * bw;
  ctx.drawImage(image, sx * k, 0, e * k, bh * k, rect.x, rect.y, e, rect.h);
  ctx.drawImage(image, (sx + e) * k, 0, (bw - 2 * e) * k, bh * k, rect.x + e, rect.y, rect.w - 2 * e, rect.h);
  ctx.drawImage(image, (sx + bw - e) * k, 0, e * k, bh * k, rect.x + rect.w - e, rect.y, e, rect.h);
}

/**
 * 9-slice: corners unscaled, edges stretched along one axis, centre stretched both ways. `src`, `inset`
 * and `dst` are logical; `sourceScale` (2 for an upscaled picture) multiplies the source rectangles only.
 */
export function drawNineSlice(ctx: CanvasRenderingContext2D, image: Bitmap, src: Rect, inset: number, dst: Rect, sourceScale = 1): void {
  const i = Math.max(0, Math.min(inset, Math.floor(Math.min(src.w, src.h) / 2)));
  const S = sourceScale;
  const si = i * S;
  const sx = [src.x * S, src.x * S + si, (src.x + src.w) * S - si];
  const sy = [src.y * S, src.y * S + si, (src.y + src.h) * S - si];
  const sw = [si, src.w * S - 2 * si, si];
  const sh = [si, src.h * S - 2 * si, si];
  const dx = [dst.x, dst.x + i, dst.x + dst.w - i];
  const dy = [dst.y, dst.y + i, dst.y + dst.h - i];
  const dw = [i, dst.w - 2 * i, i];
  const dh = [i, dst.h - 2 * i, i];
  for (let r = 0; r < 3; r++) {
    for (let c = 0; c < 3; c++) {
      if (sw[c] <= 0 || sh[r] <= 0 || dw[c] <= 0 || dh[r] <= 0) continue;
      ctx.drawImage(image, sx[c], sy[r], sw[c], sh[r], dx[c], dy[r], dw[c], dh[r]);
    }
  }
}

/** Carved 1 px line: dark groove with a pale highlight one pixel below / to the right. */
function rule(ctx: CanvasRenderingContext2D, x1: number, y1: number, x2: number, y2: number): void {
  const vertical = x1 === x2;
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  if (vertical) ctx.fillRect(x1, y1, 1, y2 - y1); else ctx.fillRect(x1, y1, x2 - x1, 1);
  ctx.fillStyle = 'rgba(255,230,160,.25)';
  if (vertical) ctx.fillRect(x1 + 1, y1, 1, y2 - y1); else ctx.fillRect(x1, y1 + 1, x2 - x1, 1);
}

/** Darker rounded band behind the tip (reference picture), drawn with plain fills only. */
function insetBox(ctx: CanvasRenderingContext2D, r: Rect): void {
  const radius = 8;
  const path = (): void => {
    ctx.beginPath();
    ctx.moveTo(r.x + radius, r.y);
    ctx.arcTo(r.x + r.w, r.y, r.x + r.w, r.y + r.h, radius);
    ctx.arcTo(r.x + r.w, r.y + r.h, r.x, r.y + r.h, radius);
    ctx.arcTo(r.x, r.y + r.h, r.x, r.y, radius);
    ctx.arcTo(r.x, r.y, r.x + r.w, r.y, radius);
    ctx.closePath();
  };
  path();
  ctx.fillStyle = 'rgba(0,0,0,.28)';
  ctx.fill();
  path();
  ctx.strokeStyle = 'rgba(255,230,160,.18)';
  ctx.lineWidth = 1;
  ctx.stroke();
}
