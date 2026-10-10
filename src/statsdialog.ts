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
}

export interface StatsValues { points: string; combos: string; coins: string; gaps: string; chain: string; comboMax: string; time: string; objective: string; bonus: string; record: string }

/** Reveal order: left column top to bottom, then the right column (D-05). */
export const STATS_ORDER: ReadonlyArray<keyof StatsValues> = ['points', 'combos', 'coins', 'gaps', 'chain', 'comboMax', 'time', 'objective', 'bonus', 'record'];

/**
 * Pixel layout in the 640×480 stage, measured on the R2.0.12 reference picture
 * (frame x 17 %–83 %, y 19 %–93 %; baselines = top of the digits + 11).
 */
export const STATS_LAYOUT = {
  frame: { x: 109, y: 91, w: 422, h: 355 } as Rect,
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
   */
  tip: { labelX: 150, baseline: 350, gap: 6, maxWidth: 270, lineHeight: 14, maxLines: 2, align: 'left' as const, box: { x: 133, y: 320, w: 374, h: 60 } as Rect },
  ok: { x: 260, y: 382, w: 120, h: 48 } as Rect,
  okLabelBaseline: 412,
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
 * Time bonus shown `elapsedMs` after the dialog opened (0x440b00, §8): nothing during the first
 * second, then +100 every 100 ms (100 updates, then every 10) up to `total`; the last step is partial.
 */
export function bonusCountUp(total: number, elapsedMs: number): number {
  if (!Number.isFinite(total) || total <= 0 || !Number.isFinite(elapsedMs) || elapsedMs < 1000) return 0;
  return Math.min(total, 100 * (Math.floor((elapsedMs - 1000) / 100) + 1));
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
export function layoutTip(text: string, maxWidth: number, measure: (s: string) => number, measureSmall: ((s: string) => number) | null): { lines: string[]; small: boolean } {
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
    while (words.length > 0 && m(`${words.join(' ')}…`) > maxWidth) words.pop();
    lines = [...lines.slice(0, MAX - 1), `${words.join(' ')}…`];
  }
  return { lines, small };
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
    return { frame, head, button, fonts: { title, text, tip: arial ?? cancun10, tipSmall: arial ? cancun10 : null }, strings };
  } catch {
    return null;
  }
}

// ------------------------------------------------------------------ composing

export type ButtonState = 'normal' | 'hover' | 'pressed';
export interface ComposeOptions { revealed: number; button: ButtonState; tip: string }

export const STAGE_WIDTH = 640;
export const STAGE_HEIGHT = 480;

/**
 * Draws the whole dialog on a 640×480 canvas (reused when given): 9-slice frame, head,
 * title, rules, labels, the first `options.revealed` values in `STATS_ORDER`, the tip and
 * the OK button in its `options.button` state. Returns the canvas.
 */
export function composeStatsDialog(kit: StatsKit, values: StatsValues, options: ComposeOptions, canvas?: HTMLCanvasElement): HTMLCanvasElement {
  const out = canvas ?? document.createElement('canvas');
  if (out.width !== STAGE_WIDTH) out.width = STAGE_WIDTH;
  if (out.height !== STAGE_HEIGHT) out.height = STAGE_HEIGHT;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.imageSmoothingEnabled = true;
  const L = STATS_LAYOUT;
  const C = STATS_COLORS;
  const { title, text } = kit.fonts;
  const tipFont = kit.fonts.tip ?? text;
  const str = (key: string, fallback: string): string => kit.strings[key] ?? fallback;

  drawNineSlice(ctx, kit.frame, L.source, L.inset, L.frame);
  if (kit.head) ctx.drawImage(kit.head, L.head.x, L.head.y);

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

  // Tip inset (a darker band as in the reference): « ASTUCE : » then the text left-aligned after it on two
  // lines at most (D-20) — the smaller font first, the ellipsis last (layoutTip).
  insetBox(ctx, L.tip.box);
  const tipLabel = `${str('TIP', 'ASTUCE')} :`;
  text.draw(ctx, tipLabel, L.tip.labelX, L.tip.baseline, { tint: C.label });
  const textX = L.tip.labelX + text.measure(tipLabel) + L.tip.gap;
  const tipWidth = Math.min(L.tip.maxWidth, L.tip.box.x + L.tip.box.w - 10 - textX);
  const tipSmall = kit.fonts.tipSmall;
  const tip = layoutTip(options.tip, tipWidth, s => tipFont.measure(s), tipSmall ? s => tipSmall.measure(s) : null);
  const lineFont = tip.small && tipSmall ? tipSmall : tipFont;
  const firstBaseline = L.tip.baseline - (tip.lines.length > 1 ? Math.round(L.tip.lineHeight / 2) : 0);
  tip.lines.slice(0, L.tip.maxLines).forEach((line, i) => lineFont.draw(ctx, line, textX, firstBaseline + i * L.tip.lineHeight, { tint: C.value, align: 'left' }));

  // OK button: one of the three painted states, label centred (nudged when pressed).
  const state = options.button === 'hover' ? 1 : options.button === 'pressed' ? 2 : 0;
  ctx.drawImage(kit.button, state * L.ok.w, 0, L.ok.w, L.ok.h, L.ok.x, L.ok.y, L.ok.w, L.ok.h);
  const nudge = state === 2 ? 1 : 0;
  text.draw(ctx, str('DIALOG_BUTTON_OK', str('OK', 'OK')), L.ok.x + L.ok.w / 2 + nudge, L.okLabelBaseline + nudge, { tint: C.value, align: 'center' });
  return out;
}

/** 9-slice: corners unscaled, edges stretched along one axis, centre stretched both ways. */
export function drawNineSlice(ctx: CanvasRenderingContext2D, image: Bitmap, src: Rect, inset: number, dst: Rect): void {
  const i = Math.max(0, Math.min(inset, Math.floor(Math.min(src.w, src.h) / 2)));
  const sx = [src.x, src.x + i, src.x + src.w - i];
  const sy = [src.y, src.y + i, src.y + src.h - i];
  const sw = [i, src.w - 2 * i, i];
  const sh = [i, src.h - 2 * i, i];
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
