/**
 * In-game MENU (D-24, spike 03 Q2): the original has no separate menu dialog — it is the OPTIONS dialog built in
 * « in game » mode (0x445310 with inGame = 1): title `MENU`, sliders `MUSIC_VOLUME` / `SOUND_EFFECTS`
 * (slidertrack / sliderthumb), check boxes (`FULLSCREEN`, and « Pixels nets » in place of `CUSTOM_CURSORS` /
 * `3D_HARDWARE_ACCELERATION`), buttons `HELP` and `BACK_TO_MAIN_MENU`, footer button `BACK_TO_GAME`. It is
 * composed on a canvas with the STATS kit (dialogbox 9-slice, GodHead, DialogButton, bitmap fonts, pack strings)
 * plus the slider and check-box pictures; without the pack, a vector dialog with the same rectangles.
 *
 * The geometry is a reading of the original (vertical order sure, `LAY_*` margins not decoded — proportions of
 * the STATS, hypothesis to confirm). Nothing here touches the DOM at module level: Node tests import it.
 */
import { STATS_COLORS, drawDialogButton, drawNineSlice, STATS_LAYOUT, wrapText, type Point, type Rect, type StatsKit } from './statsdialog.js';
import type { Bitmap, OriginalPack } from './original.js';
import type { BitmapFont } from './bitmapfont.js';
import { upscaleBitmap } from './upscale.js';

export type MenuView = 'menu' | 'help' | 'confirm';
export type MenuWidgetId = 'music' | 'sfx' | 'fullscreen' | 'pixels' | 'help' | 'main-menu' | 'back' | 'help-done' | 'leave' | 'cancel' | 'install';
export interface MenuWidget { id: MenuWidgetId; kind: 'slider' | 'check' | 'button'; rect: Rect; label: string; enabled: boolean }

/**
 * Stage layout (640 × 480 logical px). Frame ≈ 400 × 390 (content + 250 px, 0x445ab8–0x445ade); GodHead 83 px above
 * the frame like the STATS (hypothesis: the same header as the other dialogs); content edge at frame.x + 30, sliders
 * 130 px right of it and 205 px wide (0x4402f7–0x440319: x = content + 130, row of 36 px); check boxes 50 × 46 (one
 * state of `checkbutton`); buttons over the content width (`DialogButton` stretched in three slices); footer button
 * `BACK_TO_GAME`.
 */
export const MENU_LAYOUT = {
  frame: { x: 120, y: 84, w: 400, h: 390 } as Rect,
  head: { x: 320 - 78, y: 84 - 83 } as Point,
  title: { x: 320, baseline: 162 },
  rule: { y: 172, x1: 150, x2: 490 },
  /** Left edge of the content (labels). */
  content: { x: 150, w: 340 },
  slider: { x: 280, w: 205, h: 33, firstY: 178, pitch: 36 },
  check: { y: 250, size: { w: 50, h: 46 }, xs: [150, 320], rectW: 160, labelGap: 4 },
  button: { h: 48, edge: 22, help: 300, mainMenu: 350, footer: 404 },
  /** Help text area (controls, tips, badge) above the footer button. */
  helpText: { x: 146, y: 186, w: 348, bottom: 396 },
  confirm: { bodyBaseline: 282, lineHeight: 20, buttonW: 164 },
};

/** Original string keys and their French fallbacks (strings.json values) for a pack-less build. */
const MENU_STRINGS: Record<string, string> = {
  MENU: 'MENU', OPTIONS: 'OPTIONS', HELP: 'Aide', MUSIC_VOLUME: 'Musique', SOUND_EFFECTS: 'Sons', FULLSCREEN: 'Plein écran',
  BACK_TO_MAIN_MENU: 'Retour au menu principal', BACK_TO_GAME: 'Retour à la partie', DONE: 'Terminé', LEAVE: 'Quitter', CANCEL: 'ANNULER',
  'LEAVE_GAME_?': 'Quitter la partie ?', 'QUIT_THE_GAME_?': 'Voulez-vous vraiment&cr;quitter la partie ?',
};
/** « Pixels nets » has no original string (it replaces CUSTOM_CURSORS / 3D_HARDWARE_ACCELERATION). */
const PIXELS_LABEL = 'Pixels nets';

/**
 * Platform-dependent widgets (R2.0.20, D-38). `install`: the help view gets « Installer » (left, the confirm view's
 * button geometry) beside « Terminé » (right) — no original string: a deliberate addition with no OPTIONS equivalent.
 */
export interface MenuOptions {
  install?: boolean;
  /** « Plein écran » (default true); false without the Fullscreen API (iPhone): the check disappears, « Pixels nets » keeps its place. */
  fullscreen?: boolean;
  /**
   * false: OPTIONS out of game, from the main menu (0x445310 with inGame = 0, spike 06 Q1) — title `OPTIONS`, no
   * `BACK_TO_MAIN_MENU`, footer `DONE` « Terminé »; « Aide » stays. Default true (the in-game MENU).
   */
  inGame?: boolean;
}
/** « Installer » has no original string. */
const INSTALL_LABEL = 'Installer';

/** Bindings shown first in the help view (D-26). */
export const CONTROLS_HELP = 'Clic : tirer · Clic droit : échanger · Espace / Entrée / Échap : menu · Appui long sur MENU : menu · Tab : statistiques · P : pause';

function menuString(strings: Record<string, string> | null, key: string): string {
  return strings?.[key] ?? MENU_STRINGS[key] ?? key;
}

/** Widgets of a view, top to bottom (0x445310 order for `menu`); rectangles in logical stage pixels. */
export function menuWidgets(view: MenuView, strings: Record<string, string> | null, options: MenuOptions = {}): MenuWidget[] {
  const L = MENU_LAYOUT;
  const str = (key: string): string => menuString(strings, key);
  const footer: Rect = { x: L.content.x, y: L.button.footer, w: L.content.w, h: L.button.h };
  if (view === 'help') {
    if (!options.install) return [{ id: 'help-done', kind: 'button', rect: footer, label: str('DONE'), enabled: true }];
    const w = L.confirm.buttonW;
    return [
      { id: 'install', kind: 'button', rect: { x: L.content.x, y: L.button.footer, w, h: L.button.h }, label: INSTALL_LABEL, enabled: true },
      { id: 'help-done', kind: 'button', rect: { x: L.content.x + L.content.w - w, y: L.button.footer, w, h: L.button.h }, label: str('DONE'), enabled: true },
    ];
  }
  if (view === 'confirm') {
    const w = L.confirm.buttonW;
    return [
      { id: 'leave', kind: 'button', rect: { x: L.content.x, y: L.button.footer, w, h: L.button.h }, label: str('LEAVE'), enabled: true },
      { id: 'cancel', kind: 'button', rect: { x: L.content.x + L.content.w - w, y: L.button.footer, w, h: L.button.h }, label: str('CANCEL'), enabled: true },
    ];
  }
  const slider = (i: number): Rect => ({ x: L.slider.x, y: L.slider.firstY + i * L.slider.pitch, w: L.slider.w, h: L.slider.h });
  const check = (i: number): Rect => ({ x: L.check.xs[i], y: L.check.y, w: L.check.rectW, h: L.check.size.h });
  const button = (y: number): Rect => ({ x: L.content.x, y, w: L.content.w, h: L.button.h });
  return [
    // No music is played before phases 6–7: the slider is shown greyed and inert.
    { id: 'music', kind: 'slider', rect: slider(0), label: str('MUSIC_VOLUME'), enabled: false },
    { id: 'sfx', kind: 'slider', rect: slider(1), label: str('SOUND_EFFECTS'), enabled: true },
    ...(options.fullscreen === false ? [] : [{ id: 'fullscreen' as const, kind: 'check' as const, rect: check(0), label: str('FULLSCREEN'), enabled: true }]),
    { id: 'pixels', kind: 'check', rect: check(1), label: PIXELS_LABEL, enabled: true },
    { id: 'help', kind: 'button', rect: button(L.button.help), label: str('HELP'), enabled: true },
    ...(options.inGame === false ? [] : [{ id: 'main-menu' as const, kind: 'button' as const, rect: button(L.button.mainMenu), label: str('BACK_TO_MAIN_MENU'), enabled: true }]),
    { id: 'back', kind: 'button', rect: footer, label: str(options.inGame === false ? 'DONE' : 'BACK_TO_GAME'), enabled: true },
  ];
}

/** The enabled widget under a logical point, or null. */
export function hitMenu(widgets: MenuWidget[], x: number, y: number): MenuWidget | null {
  if (!Number.isFinite(x) || !Number.isFinite(y)) return null;
  for (const w of widgets) {
    if (!w.enabled) continue;
    const r = w.rect;
    if (x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h) return w;
  }
  return null;
}

/** Slider value 0..1 for a logical x over its rectangle; non-finite or empty → 0. */
export function sliderValue(rect: Rect, x: number): number {
  if (!Number.isFinite(x) || !(rect.w > 0)) return 0;
  return Math.max(0, Math.min(1, (x - rect.x) / rect.w));
}

export interface MenuState {
  view: MenuView;
  music: number;
  sfx: number;
  fullscreen: boolean;
  pixelated: boolean;
  hover: MenuWidgetId | null;
  pressed: MenuWidgetId | null;
  focus: MenuWidgetId | null;
  /** Pack tips (help view), `&cr;` allowed. */
  tips: string[];
  /** Build badge shown at the bottom of the help view. */
  badge: string;
  /** Platform-dependent widgets (R2.0.20). */
  options?: MenuOptions;
}

/** STATS kit + the OPTIONS widgets; `pixelScale` 2 when every picture is the 2 × EPX copy (D-19). */
export interface MenuKit { stats: StatsKit; sliderTrack: Bitmap | null; sliderThumb: Bitmap | null; check: Bitmap | null; pixelScale: 1 | 2 }

/** Loads `slidertrack`, `sliderthumb` and `checkbutton` with their masks; a missing picture → that widget is drawn as a vector. */
export async function loadMenuKit(pack: OriginalPack, stats: StatsKit): Promise<MenuKit> {
  const safe = (key: string): Promise<Bitmap | null> => pack.masked(key).catch(() => null);
  const [sliderTrack, sliderThumb, check] = await Promise.all([safe('slidertrack'), safe('sliderthumb'), safe('checkbutton')]);
  return { stats, sliderTrack, sliderThumb, check, pixelScale: 1 };
}

/** The kit over 2 × EPX pictures with the 2 × STATS kit; all or nothing, like upscaleStatsKit. */
export function upscaleMenuKit(kit: MenuKit, statsHd: StatsKit): MenuKit {
  if (kit.pixelScale !== 1 || statsHd.pixelScale !== 2) return kit;
  let complete = true;
  const big = (image: Bitmap | null): Bitmap | null => {
    if (!image) return null;
    const out = upscaleBitmap(image);
    if (!out) complete = false;
    return out;
  };
  const sliderTrack = big(kit.sliderTrack);
  const sliderThumb = big(kit.sliderThumb);
  const check = big(kit.check);
  if (!complete) return kit;
  return { stats: statsHd, sliderTrack, sliderThumb, check, pixelScale: 2 };
}

// ------------------------------------------------------------------ composing

const MENU_STAGE_W = 640;
const MENU_STAGE_H = 480;
/** Opacity of a disabled widget (the greyed music slider). */
const MENU_DISABLED_ALPHA = 0.45;
const MENU_VECTOR_FONT = '"Trebuchet MS", Verdana, sans-serif';

/**
 * Composes the dialog of `state.view` on `canvas` (created when absent) at `scale` backing-store pixels per
 * logical pixel (bounded 1..4), like composeStatsDialog: the canvas is round(640 s) × round(480 s), drawn in
 * logical units after setTransform(s). `kit` null → vector dialog with the same rectangles (never a DOM panel).
 */
export function composeMenuDialog(kit: MenuKit | null, state: MenuState, canvas?: HTMLCanvasElement, scale = 1): HTMLCanvasElement {
  const out = canvas ?? document.createElement('canvas');
  const s = Math.max(1, Math.min(4, Number.isFinite(scale) ? scale : 1));
  const width = Math.round(MENU_STAGE_W * s);
  const height = Math.round(MENU_STAGE_H * s);
  if (out.width !== width) out.width = width;
  if (out.height !== height) out.height = height;
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, out.width, out.height);
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.imageSmoothingEnabled = true;
  const strings = kit?.stats.strings ?? null;
  const widgets = menuWidgets(state.view, strings, state.options);
  const painter = kit ? new NativeMenuPainter(ctx, kit) : new VectorMenuPainter(ctx);
  painter.frame();
  // Out of game (main menu) the dialog is titled OPTIONS, in game MENU (0x445310).
  const menuTitle = state.options?.inGame === false ? 'OPTIONS' : 'MENU';
  const title = state.view === 'help' ? menuString(strings, 'HELP') : state.view === 'confirm' ? menuString(strings, 'LEAVE_GAME_?') : menuString(strings, menuTitle);
  painter.title(title);
  if (state.view === 'help') painter.helpText(state);
  if (state.view === 'confirm') painter.confirmText(menuString(strings, 'QUIT_THE_GAME_?'));
  for (const w of widgets) {
    ctx.save();
    if (!w.enabled) ctx.globalAlpha = MENU_DISABLED_ALPHA;
    const lit = state.hover === w.id || state.focus === w.id;
    if (w.kind === 'slider') painter.slider(w, w.id === 'music' ? state.music : state.sfx, lit);
    else if (w.kind === 'check') painter.check(w, w.id === 'fullscreen' ? state.fullscreen : state.pixelated, lit);
    else painter.button(w, state.pressed === w.id ? 'pressed' : lit ? 'hover' : 'normal');
    ctx.restore();
  }
  return out;
}

type MenuButtonState = 'normal' | 'hover' | 'pressed';

/** What both renderings draw; the rectangles come from menuWidgets / MENU_LAYOUT. */
interface MenuPainter {
  frame(): void;
  title(text: string): void;
  helpText(state: MenuState): void;
  confirmText(text: string): void;
  slider(w: MenuWidget, value: number, lit: boolean): void;
  check(w: MenuWidget, checked: boolean, lit: boolean): void;
  button(w: MenuWidget, state: MenuButtonState): void;
}

/** Label colours: yellow like the STATS labels, white when hovered / focused. */
const MENU_LABEL = STATS_COLORS.label;
const MENU_LABEL_LIT = '#ffffff';

/**
 * Controls on as few lines as possible, one binding never split: the bindings of CONTROLS_HELP joined by
 * `separator` (the pack fonts have no « · » glyph) and wrapped binding by binding on `width`.
 */
function menuControlLines(width: number, measure: (s: string) => number, separator: string, slash: string): string[] {
  const lines: string[] = [];
  let line = '';
  for (const binding of CONTROLS_HELP.split(' · ').map(b => b.replace(/ \/ /g, slash))) {
    const candidate = line ? `${line}${separator}${binding}` : binding;
    if (line && measure(candidate) > width) {
      lines.push(line);
      line = binding;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

/** Help lines (controls, blank, tips) wrapped on `width`; tips are dropped from the end when they do not fit `maxLines`. */
function menuHelpLines(state: MenuState, width: number, measure: (s: string) => number, maxLines: number, separator = ' · ', slash = ' / '): { lines: string[]; tipsShown: number } {
  const head = menuControlLines(width, measure, separator, slash);
  const tips = state.tips.map(t => wrapText(t, width, measure));
  let shown = tips.length;
  const count = (n: number): number => head.length + 1 + tips.slice(0, n).reduce((a, t) => a + t.length, 0) + 1;
  while (shown > 0 && count(shown) > maxLines) shown--;
  return { lines: [...head, '', ...tips.slice(0, shown).flat()], tipsShown: shown };
}

class NativeMenuPainter implements MenuPainter {
  private readonly k: number;
  constructor(private readonly ctx: CanvasRenderingContext2D, private readonly kit: MenuKit) {
    this.k = kit.stats.pixelScale;
  }

  private get text(): BitmapFont {
    return this.kit.stats.fonts.text;
  }

  frame(): void {
    const { ctx, kit, k } = this;
    drawNineSlice(ctx, kit.stats.frame, STATS_LAYOUT.source, STATS_LAYOUT.inset, MENU_LAYOUT.frame, k);
    const head = kit.stats.head;
    if (head) ctx.drawImage(head, 0, 0, head.width, head.height, MENU_LAYOUT.head.x, MENU_LAYOUT.head.y, head.width / k, head.height / k);
  }

  title(text: string): void {
    this.kit.stats.fonts.title.draw(this.ctx, text, MENU_LAYOUT.title.x, MENU_LAYOUT.title.baseline, { align: 'center', multiply: STATS_COLORS.title });
    menuRule(this.ctx, MENU_LAYOUT.rule.x1, MENU_LAYOUT.rule.y, MENU_LAYOUT.rule.x2);
  }

  helpText(state: MenuState): void {
    const T = MENU_LAYOUT.helpText;
    const fonts = this.kit.stats.fonts;
    const candidates = [fonts.tip, fonts.tipSmall, this.text].filter((f): f is BitmapFont => f !== null);
    // The tip font first, the smaller one when it fits more tips (D-20 fonts); the badge below in the smallest.
    let best: { font: BitmapFont; lines: string[]; tipsShown: number; lh: number } | null = null;
    for (const font of candidates) {
      const lh = Math.max(12, Math.round(font.height));
      // No pack font has « · » and the tip font's « / » is blank: wide spaces and commas instead.
      const layout = menuHelpLines(state, T.w, s => font.measure(s), Math.floor((T.bottom - T.y - 2 * lh) / lh), '    ', ', ');
      if (!best || layout.tipsShown > best.tipsShown) best = { font, lh, ...layout };
    }
    if (!best) return;
    const { font, lines, lh } = best;
    const head = lines.indexOf(''); // the controls (yellow) end at the blank line; the tips follow (cream)
    lines.forEach((line, i) => {
      if (line) font.draw(this.ctx, line, T.x, T.y + lh * (i + 1), { tint: i < head ? MENU_LABEL : STATS_COLORS.value, align: 'left' });
    });
    // Build badge in the smallest font, wrapped inside the frame and bottom-aligned on the text area.
    const small = fonts.tipSmall ?? fonts.tip ?? this.text;
    const badge = wrapText(state.badge.replace(/ · /g, small.measure('·') > 0 ? ' · ' : '  -  '), T.w, t => small.measure(t));
    const blh = Math.max(10, Math.round(small.height));
    badge.forEach((line, i) => small.draw(this.ctx, line, MENU_LAYOUT.title.x, T.bottom - (badge.length - 1 - i) * blh, { tint: STATS_COLORS.noBonus, align: 'center' }));
  }

  confirmText(text: string): void {
    const C = MENU_LAYOUT.confirm;
    text.split('&cr;').forEach((line, i) => this.text.draw(this.ctx, line.trim(), MENU_LAYOUT.title.x, C.bodyBaseline + i * C.lineHeight, { tint: STATS_COLORS.value, align: 'center' }));
  }

  private label(w: MenuWidget, x: number, centreY: number, lit: boolean): void {
    const cap = Number.isFinite(this.text.capHeight) && this.text.capHeight > 0 ? this.text.capHeight : 10;
    this.text.draw(this.ctx, w.label, x, Math.round(centreY + cap / 2), { tint: lit ? MENU_LABEL_LIT : MENU_LABEL });
  }

  slider(w: MenuWidget, value: number, lit: boolean): void {
    const { ctx, kit } = this;
    const r = w.rect;
    // Labels left of their slider, vertically centred (0x445b33–0x445bd0).
    this.label(w, MENU_LAYOUT.content.x, r.y + r.h / 2 - 2, lit);
    const k = kit.pixelScale;
    const v = Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0));
    if (kit.sliderTrack) ctx.drawImage(kit.sliderTrack, r.x, r.y, kit.sliderTrack.width / k, kit.sliderTrack.height / k);
    else menuVectorTrack(ctx, r);
    if (kit.sliderThumb) {
      const tw = kit.sliderThumb.width / k;
      ctx.drawImage(kit.sliderThumb, r.x + v * (r.w - tw), r.y, tw, kit.sliderThumb.height / k);
    } else {
      menuVectorThumb(ctx, r, v);
    }
  }

  check(w: MenuWidget, checked: boolean, lit: boolean): void {
    const { ctx, kit } = this;
    const r = w.rect;
    const box = MENU_LAYOUT.check.size;
    const k = kit.pixelScale;
    // `checkbutton` holds two 50 × 46 states side by side: checked (purple, ticked) then unchecked (green).
    if (kit.check) ctx.drawImage(kit.check, (checked ? 0 : box.w) * k, 0, box.w * k, box.h * k, r.x, r.y, box.w, box.h);
    else menuVectorCheck(ctx, r.x, r.y, checked);
    this.label(w, r.x + box.w + MENU_LAYOUT.check.labelGap, r.y + 19, lit);
  }

  button(w: MenuWidget, state: MenuButtonState): void {
    const { ctx, kit, k } = this;
    const r = w.rect;
    // DialogButton (three 120 × 48 states) stretched over the rectangle in three horizontal slices (shared with the STATS OK).
    drawDialogButton(ctx, kit.stats.button, state, r, k, MENU_LAYOUT.button.edge);
    const nudge = state === 'pressed' ? 1 : 0;
    // Same label baseline as the STATS OK (okLabelBaseline − ok.y = 30 for a 48 px button).
    this.text.draw(ctx, w.label, r.x + r.w / 2 + nudge, r.y + (STATS_LAYOUT.okLabelBaseline - STATS_LAYOUT.ok.y) + nudge, { tint: STATS_COLORS.value, align: 'center' });
  }
}

/** Vector rendering with the same rectangles (no pack): rounded stone-coloured frame, canvas text. */
class VectorMenuPainter implements MenuPainter {
  constructor(private readonly ctx: CanvasRenderingContext2D) {}

  private font(px: number): string {
    return `bold ${px}px ${MENU_VECTOR_FONT}`;
  }

  private text(text: string, x: number, y: number, color: string, px: number, align: CanvasTextAlign = 'left'): void {
    const ctx = this.ctx;
    ctx.font = this.font(px);
    ctx.textAlign = align;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  frame(): void {
    const ctx = this.ctx;
    const f = MENU_LAYOUT.frame;
    const g = ctx.createLinearGradient(0, f.y, 0, f.y + f.h);
    g.addColorStop(0, '#4a3313');
    g.addColorStop(1, '#1c1207');
    menuRoundRect(ctx, f.x, f.y, f.w, f.h, 16);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#c9a85a';
    ctx.stroke();
  }

  title(text: string): void {
    this.text(text, MENU_LAYOUT.title.x, MENU_LAYOUT.title.baseline - 8, STATS_COLORS.title, 22, 'center');
    menuRule(this.ctx, MENU_LAYOUT.rule.x1, MENU_LAYOUT.rule.y, MENU_LAYOUT.rule.x2);
  }

  helpText(state: MenuState): void {
    const T = MENU_LAYOUT.helpText;
    const ctx = this.ctx;
    ctx.font = this.font(12);
    const lh = 15;
    const { lines } = menuHelpLines(state, T.w, s => ctx.measureText(s).width, Math.floor((T.bottom - T.y - lh) / lh));
    const head = lines.indexOf('');
    lines.forEach((line, i) => { if (line) this.text(line, T.x, T.y + lh * (i + 1) - 4, i < head ? MENU_LABEL : STATS_COLORS.value, 12); });
    this.text(state.badge, MENU_LAYOUT.title.x, T.bottom - 4, STATS_COLORS.noBonus, 10, 'center');
  }

  confirmText(text: string): void {
    const C = MENU_LAYOUT.confirm;
    text.split('&cr;').forEach((line, i) => this.text(line.trim(), MENU_LAYOUT.title.x, C.bodyBaseline - 6 + i * C.lineHeight, STATS_COLORS.value, 15, 'center'));
  }

  slider(w: MenuWidget, value: number, lit: boolean): void {
    const r = w.rect;
    this.text(w.label, MENU_LAYOUT.content.x, r.y + r.h / 2, lit ? MENU_LABEL_LIT : MENU_LABEL, 14);
    menuVectorTrack(this.ctx, r);
    menuVectorThumb(this.ctx, r, Math.max(0, Math.min(1, Number.isFinite(value) ? value : 0)));
  }

  check(w: MenuWidget, checked: boolean, lit: boolean): void {
    const r = w.rect;
    menuVectorCheck(this.ctx, r.x, r.y, checked);
    this.text(w.label, r.x + MENU_LAYOUT.check.size.w + MENU_LAYOUT.check.labelGap, r.y + 19, lit ? MENU_LABEL_LIT : MENU_LABEL, 14);
  }

  button(w: MenuWidget, state: MenuButtonState): void {
    const ctx = this.ctx;
    const r = w.rect;
    const g = ctx.createLinearGradient(0, r.y, 0, r.y + r.h);
    const top = state === 'normal' ? '#7bd04a' : '#c050e0';
    const bottom = state === 'normal' ? '#2f7a24' : '#7a1f9a';
    g.addColorStop(0, top);
    g.addColorStop(1, bottom);
    menuRoundRect(ctx, r.x + 4, r.y + 6, r.w - 8, r.h - 14, 14);
    ctx.fillStyle = g;
    ctx.fill();
    ctx.lineWidth = 3;
    ctx.strokeStyle = '#d8d2b0';
    ctx.stroke();
    const nudge = state === 'pressed' ? 1 : 0;
    this.text(w.label, r.x + r.w / 2 + nudge, r.y + r.h / 2 - 1 + nudge, STATS_COLORS.value, 15, 'center');
  }
}

function menuRoundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/** Carved 1 px rule under the title (same as the STATS). */
function menuRule(ctx: CanvasRenderingContext2D, x1: number, y: number, x2: number): void {
  ctx.fillStyle = 'rgba(0,0,0,.45)';
  ctx.fillRect(x1, y, x2 - x1, 1);
  ctx.fillStyle = 'rgba(255,230,160,.25)';
  ctx.fillRect(x1, y + 1, x2 - x1, 1);
}

function menuVectorTrack(ctx: CanvasRenderingContext2D, r: Rect): void {
  ctx.fillStyle = '#b8b48c';
  ctx.fillRect(r.x, r.y + 2, r.w, 14);
  ctx.fillStyle = '#0c0804';
  ctx.fillRect(r.x + 4, r.y + 6, r.w - 8, 6);
}

function menuVectorThumb(ctx: CanvasRenderingContext2D, r: Rect, v: number): void {
  const tw = 34;
  ctx.fillStyle = '#9a7fd0';
  ctx.fillRect(r.x + v * (r.w - tw), r.y, tw, 24);
  ctx.strokeStyle = '#3a2a5a';
  ctx.lineWidth = 2;
  ctx.strokeRect(r.x + v * (r.w - tw), r.y, tw, 24);
}

function menuVectorCheck(ctx: CanvasRenderingContext2D, x: number, y: number, checked: boolean): void {
  ctx.beginPath();
  ctx.arc(x + 19, y + 19, 17, 0, Math.PI * 2);
  ctx.fillStyle = '#d8d2b0';
  ctx.fill();
  ctx.beginPath();
  ctx.arc(x + 19, y + 19, 11, 0, Math.PI * 2);
  ctx.fillStyle = checked ? '#9a2fc0' : '#4f9a3a';
  ctx.fill();
  if (!checked) return;
  ctx.strokeStyle = '#ffd84a';
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.moveTo(x + 12, y + 19);
  ctx.lineTo(x + 18, y + 25);
  ctx.lineTo(x + 28, y + 12);
  ctx.stroke();
}
