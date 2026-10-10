/**
 * PopCap bitmap fonts (`fonts/<name>.txt` + `<name>.gif` / `_<name>.gif`).
 *
 * The script grammar is a flat list of `;`-terminated directives:
 *   Define NAME ( values );          values = 'c' | "c" | int | ( x, y ) | ( x, y, w, h )
 *   CreateLayer NAME;
 *   LayerSetImage NAME 'File';       LayerSetAscent NAME n;
 *   LayerSetCharWidths NAME Chars Widths;   (lists by name or inline)
 *   LayerSetKerningPairs NAME Pairs Values; LayerSetImageMap NAME Chars Rects;
 *   LayerSetCharOffsets NAME Chars Offsets; LayerSetOffset NAME (x, y);
 *   LayerSetColorMult NAME (r, g, b, a);    LayerSetBaseOrder NAME n;
 *   LayerSetAscentPadding / LayerSetLineSpacingOffset / LayerSetPointSize NAME n;
 *   SetCharMap From To;              SetDefaultPointSize n;
 * Unknown directives are ignored. `parseFontScript`, `layoutText` and `measureText`
 * are pure (no DOM) so the Node tests can lock them; `BitmapFont` draws on a canvas.
 */
import { applyMask, assetUrl, type Bitmap } from './original.js';

export interface FontRect { x: number; y: number; w: number; h: number }
export interface FontLayer {
  name: string;
  /** Stem of the glyph image (`LayerSetImage`), lower-cased: 'cancun12'. */
  image: string;
  ascent: number;
  ascentPadding: number;
  lineSpacingOffset: number;
  pointSize: number;
  /** Advance per character; characters absent from `rects` (space) only advance. */
  widths: Map<string, number>;
  rects: Map<string, FontRect>;
  offsets: Map<string, { x: number; y: number }>;
  /** Key = the two characters of the pair ("AT"). */
  kerning: Map<string, number>;
  /** `LayerSetOffset`: whole-layer displacement (shadow). */
  offset: { x: number; y: number };
  /** `LayerSetColorMult` r,g,b,a in 0..1 or null (identity). */
  colorMult: [number, number, number, number] | null;
  /** `LayerSetBaseOrder`: layers are drawn in ascending order (shadow −1 first). */
  baseOrder: number;
}
export interface FontScript {
  /** Sorted by baseOrder, stable. */
  layers: FontLayer[];
  /** SetCharMap From → To, applied before lookup. */
  charMap: Map<string, string>;
  defaultPointSize: number;
}
export interface GlyphPlacement { layer: number; char: string; sx: number; sy: number; sw: number; sh: number; dx: number; dy: number }
export interface TextLayout { width: number; ascent: number; height: number; glyphs: GlyphPlacement[] }

// ------------------------------------------------------------------ tokenizer

type Value = string | number | Value[] | { ref: string };

const TOKEN = /\s+|([A-Za-z_][A-Za-z0-9_]*)|(-?\d+(?:\.\d+)?)|'((?:\\.|[^'\\])*)'|"((?:\\.|[^"\\])*)"|([(),;])|(.)/gsu;

interface Token { kind: 'id' | 'num' | 'str' | 'punct'; text: string }

function tokenize(text: string): Token[] {
  const out: Token[] = [];
  for (const m of text.matchAll(TOKEN)) {
    if (m[1] !== undefined) out.push({ kind: 'id', text: m[1] });
    else if (m[2] !== undefined) out.push({ kind: 'num', text: m[2] });
    else if (m[3] !== undefined) out.push({ kind: 'str', text: unescape(m[3]) });
    else if (m[4] !== undefined) out.push({ kind: 'str', text: unescape(m[4]) });
    else if (m[5] !== undefined) out.push({ kind: 'punct', text: m[5] });
    // Any other byte (m[6]) is noise: skipped.
  }
  return out;
}

function unescape(s: string): string {
  return s.replace(/\\(.)/gs, '$1');
}

/** Splits the token stream into `;`-terminated statements and parses their values. */
function statements(tokens: Token[]): Array<{ name: string; args: Value[] }> {
  const out: Array<{ name: string; args: Value[] }> = [];
  let i = 0;
  const readValue = (): Value | undefined => {
    const t = tokens[i];
    if (!t) return undefined;
    if (t.kind === 'punct' && t.text === '(') {
      i++;
      const list: Value[] = [];
      while (i < tokens.length) {
        const n = tokens[i];
        if (n.kind === 'punct' && n.text === ')') { i++; break; }
        if (n.kind === 'punct' && n.text === ',') { i++; continue; }
        if (n.kind === 'punct' && n.text === ';') break; // unterminated list: stop at the statement end
        const v = readValue();
        if (v === undefined) break;
        list.push(v);
      }
      return list;
    }
    i++;
    if (t.kind === 'num') return Number(t.text);
    if (t.kind === 'str') return t.text;
    if (t.kind === 'id') return { ref: t.text };
    return undefined; // stray ',' or ')'
  };
  while (i < tokens.length) {
    const head = tokens[i];
    if (head.kind !== 'id') { i++; continue; }
    i++;
    const args: Value[] = [];
    while (i < tokens.length && !(tokens[i].kind === 'punct' && tokens[i].text === ';')) {
      const v = readValue();
      if (v !== undefined) args.push(v);
    }
    i++; // ';'
    out.push({ name: head.text, args });
  }
  return out;
}

// --------------------------------------------------------------------- parser

function newLayer(name: string): FontLayer {
  return {
    name, image: '', ascent: 0, ascentPadding: 0, lineSpacingOffset: 0, pointSize: 0,
    widths: new Map(), rects: new Map(), offsets: new Map(), kerning: new Map(),
    offset: { x: 0, y: 0 }, colorMult: null, baseOrder: 0,
  };
}

const isRef = (v: Value | undefined): v is { ref: string } => typeof v === 'object' && v !== null && !Array.isArray(v);
const num = (v: Value | undefined, fallback = 0): number => (typeof v === 'number' && Number.isFinite(v) ? v : fallback);
const str = (v: Value | undefined): string | null => (typeof v === 'string' ? v : null);

export function parseFontScript(text: string): FontScript {
  const defines = new Map<string, Value[]>();
  const layers = new Map<string, FontLayer>();
  const order: FontLayer[] = [];
  const charMap = new Map<string, string>();
  let defaultPointSize = 0;

  const list = (v: Value | undefined): Value[] => {
    if (Array.isArray(v)) return v;
    if (isRef(v)) return defines.get(v.ref) ?? [];
    return v === undefined ? [] : [v];
  };
  const layerOf = (v: Value | undefined): FontLayer | undefined => (isRef(v) ? layers.get(v.ref) : undefined);
  const pair = (v: Value): { x: number; y: number } | null => (Array.isArray(v) && v.length >= 2 ? { x: num(v[0]), y: num(v[1]) } : null);
  const zip = <T>(chars: Value[], values: Value[], into: Map<string, T>, conv: (v: Value) => T | null): void => {
    const n = Math.min(chars.length, values.length);
    for (let k = 0; k < n; k++) {
      const c = str(chars[k]);
      if (c === null) continue;
      const v = conv(values[k]);
      if (v !== null) into.set(c, v);
    }
  };

  for (const { name, args } of statements(tokenize(text))) {
    switch (name) {
      case 'Define': {
        if (isRef(args[0])) defines.set(args[0].ref, list(args[1]));
        break;
      }
      case 'CreateLayer': {
        if (isRef(args[0]) && !layers.has(args[0].ref)) {
          const layer = newLayer(args[0].ref);
          layers.set(layer.name, layer);
          order.push(layer);
        }
        break;
      }
      case 'SetCharMap': {
        zip(list(args[0]), list(args[1]), charMap, v => str(v));
        break;
      }
      case 'SetDefaultPointSize': {
        defaultPointSize = num(args[0], defaultPointSize);
        break;
      }
      default: {
        if (!name.startsWith('LayerSet')) break;
        const layer = layerOf(args[0]);
        if (!layer) break;
        const a = args[1];
        const b = args[2];
        switch (name) {
          case 'LayerSetImage': layer.image = (str(a) ?? '').toLowerCase(); break;
          case 'LayerSetAscent': layer.ascent = num(a); break;
          case 'LayerSetAscentPadding': layer.ascentPadding = num(a); break;
          case 'LayerSetLineSpacingOffset': layer.lineSpacingOffset = num(a); break;
          case 'LayerSetPointSize': layer.pointSize = num(a); break;
          case 'LayerSetBaseOrder': layer.baseOrder = num(a); break;
          case 'LayerSetCharWidths': zip(list(a), list(b), layer.widths, v => (typeof v === 'number' ? v : null)); break;
          case 'LayerSetKerningPairs': zip(list(a), list(b), layer.kerning, v => (typeof v === 'number' ? v : null)); break;
          case 'LayerSetCharOffsets': zip(list(a), list(b), layer.offsets, pair); break;
          case 'LayerSetImageMap':
            zip(list(a), list(b), layer.rects, v => (Array.isArray(v) && v.length >= 4 ? { x: num(v[0]), y: num(v[1]), w: num(v[2]), h: num(v[3]) } : null));
            break;
          case 'LayerSetOffset': { const p = Array.isArray(a) ? pair(a) : null; if (p) layer.offset = p; break; }
          case 'LayerSetColorMult': {
            if (Array.isArray(a) && a.length >= 3) layer.colorMult = [num(a[0]), num(a[1]), num(a[2]), num(a[3], 1)];
            break;
          }
          default: break; // LayerRequireTags and friends: ignored
        }
      }
    }
  }
  // Stable sort by baseOrder (Array.prototype.sort is stable since ES2019).
  const sorted = order.map((layer, index) => ({ layer, index }))
    .sort((p, q) => p.layer.baseOrder - q.layer.baseOrder || p.index - q.index)
    .map(p => p.layer);
  return { layers: sorted, charMap, defaultPointSize };
}

// --------------------------------------------------------------------- layout

/** Font-wide vertical metrics: tallest ascent and deepest glyph descent across layers. */
export function fontMetrics(font: FontScript): { ascent: number; height: number } {
  let ascent = 0;
  let descent = 0;
  for (const layer of font.layers) {
    ascent = Math.max(ascent, layer.ascent);
    for (const [c, r] of layer.rects) {
      const oy = (layer.offsets.get(c)?.y ?? 0) + layer.offset.y;
      descent = Math.max(descent, r.h + oy - layer.ascent);
    }
  }
  return { ascent, height: ascent + descent };
}

/** dx/dy relative to the pen origin (x = start, y = baseline); glyphs ordered by layer (baseOrder). */
export function layoutText(font: FontScript, text: string): TextLayout {
  const chars = Array.from(text, c => font.charMap.get(c) ?? c);
  const glyphs: GlyphPlacement[] = [];
  let width = 0;
  font.layers.forEach((layer, index) => {
    let pen = 0;
    let prev: string | null = null;
    for (const c of chars) {
      const w = layer.widths.get(c);
      const r = layer.rects.get(c);
      if (w === undefined && !r) continue; // unknown character: ignored
      if (prev !== null) pen += layer.kerning.get(prev + c) ?? 0;
      if (r) {
        const o = layer.offsets.get(c);
        glyphs.push({
          layer: index, char: c, sx: r.x, sy: r.y, sw: r.w, sh: r.h,
          dx: pen + (o?.x ?? 0) + layer.offset.x,
          dy: -layer.ascent + (o?.y ?? 0) + layer.offset.y,
        });
      }
      pen += w ?? r?.w ?? 0;
      prev = c;
    }
    width = Math.max(width, pen);
  });
  const { ascent, height } = fontMetrics(font);
  return { width, ascent, height, glyphs };
}

export function measureText(font: FontScript, text: string): number {
  return layoutText(font, text).width;
}

// ------------------------------------------------------------- canvas drawing

export interface DrawOptions { tint?: string; align?: 'left' | 'center' | 'right'; alpha?: number }

type Rgb = [number, number, number];

/** `#rgb`, `#rrggbb` or `rgb(r, g, b)`; anything else is white. */
function parseColor(css: string | undefined): Rgb {
  if (!css) return [255, 255, 255];
  const hex = css.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i);
  if (hex) {
    const h = hex[1].length === 3 ? hex[1].split('').map(c => c + c).join('') : hex[1];
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
  }
  const fn = css.trim().match(/^rgba?\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)/i);
  if (fn) return [Number(fn[1]), Number(fn[2]), Number(fn[3])];
  return [255, 255, 255];
}

const cssOf = (rgb: Rgb): string => `rgb(${rgb[0]},${rgb[1]},${rgb[2]})`;
const clamp255 = (v: number): number => Math.max(0, Math.min(255, Math.round(v)));

/**
 * A parsed script bound to its glyph images.
 *
 * `images` maps every layer image stem (lower-case) to a bitmap: for a colour font the
 * already composed picture (`applyMask(image, mask)`), for a mask-only font the mask
 * itself (its luminance is the glyph alpha; the glyph colour comes from `tint`).
 */
export class BitmapFont {
  readonly ascent: number;
  readonly height: number;
  private readonly atlases = new Map<string, HTMLCanvasElement | null>();
  private readonly alphaMasks = new Map<string, HTMLCanvasElement | null>();

  constructor(readonly script: FontScript, readonly images: Map<string, Bitmap>, readonly maskOnly: boolean) {
    const m = fontMetrics(script);
    this.ascent = m.ascent;
    this.height = m.height;
  }

  measure(text: string): number {
    return measureText(this.script, text);
  }

  /** Draws at (x, baseline y). Mask-only fonts are tinted with `tint` (default '#ffffff'); colour fonts ignore `tint`. Returns the drawn width. */
  draw(ctx: CanvasRenderingContext2D, text: string, x: number, y: number, options: DrawOptions = {}): number {
    const layout = layoutText(this.script, text);
    const align = options.align ?? 'left';
    const ox = Math.round(x - (align === 'center' ? layout.width / 2 : align === 'right' ? layout.width : 0));
    const oy = Math.round(y);
    const alpha = options.alpha ?? 1;
    const tint = parseColor(options.tint);
    const sources = this.script.layers.map(layer => this.sourceFor(layer, tint));
    const savedAlpha = ctx.globalAlpha;
    for (const g of layout.glyphs) {
      const src = sources[g.layer];
      if (!src || g.sw <= 0 || g.sh <= 0) continue;
      const mult = this.script.layers[g.layer].colorMult;
      ctx.globalAlpha = savedAlpha * alpha * (mult ? mult[3] : 1);
      ctx.drawImage(src, g.sx, g.sy, g.sw, g.sh, ox + g.dx, oy + g.dy, g.sw, g.sh);
    }
    ctx.globalAlpha = savedAlpha;
    return layout.width;
  }

  /** Bitmap to cut a layer's glyphs from: the picture itself, or a cached tinted / multiplied atlas. */
  private sourceFor(layer: FontLayer, tint: Rgb): Bitmap | null {
    const base = this.images.get(layer.image) ?? this.images.values().next().value ?? null;
    if (!base) return null;
    const mult = layer.colorMult;
    if (!this.maskOnly && !mult) return base;
    const rgb: Rgb = this.maskOnly ? [...tint] : [255, 255, 255];
    if (mult) for (let i = 0; i < 3; i++) rgb[i] = clamp255(rgb[i] * mult[i]);
    const key = `${layer.image}|${rgb.join(',')}`;
    let atlas = this.atlases.get(key);
    if (atlas === undefined) {
      atlas = this.maskOnly ? this.tintedAtlas(layer.image, base, rgb) : multipliedAtlas(base, rgb);
      this.atlases.set(key, atlas);
    }
    return atlas;
  }

  /** Mask-only font: solid `rgb` kept where the mask luminance says so. */
  private tintedAtlas(stem: string, mask: Bitmap, rgb: Rgb): HTMLCanvasElement | null {
    let alphaMask = this.alphaMasks.get(stem);
    if (alphaMask === undefined) {
      alphaMask = luminanceToAlpha(mask);
      this.alphaMasks.set(stem, alphaMask);
    }
    if (!alphaMask) return null;
    const out = canvasOf(mask.width, mask.height);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = cssOf(rgb);
    ctx.fillRect(0, 0, out.width, out.height);
    ctx.globalCompositeOperation = 'destination-in';
    ctx.drawImage(alphaMask, 0, 0);
    return out;
  }
}

function canvasOf(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, width);
  c.height = Math.max(1, height);
  return c;
}

/** White picture whose alpha is the red channel of `mask` (PopCap `_name.gif` convention). */
function luminanceToAlpha(mask: Bitmap): HTMLCanvasElement | null {
  try {
    const out = canvasOf(mask.width, mask.height);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(mask, 0, 0);
    const pixels = ctx.getImageData(0, 0, out.width, out.height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i + 3] = d[i];
      d[i] = d[i + 1] = d[i + 2] = 255;
    }
    ctx.putImageData(pixels, 0, 0);
    return out;
  } catch {
    return null;
  }
}

/** Colour font layer with `LayerSetColorMult`: picture multiplied by `rgb`, alpha preserved. */
function multipliedAtlas(image: Bitmap, rgb: Rgb): HTMLCanvasElement | null {
  const out = canvasOf(image.width, image.height);
  const ctx = out.getContext('2d');
  if (!ctx) return null;
  ctx.drawImage(image, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = cssOf(rgb);
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(image, 0, 0);
  return out;
}

// -------------------------------------------------------------------- loading

/** Structural view of the pack (05-03 adds the official fields to `PackData`). */
export interface FontPackEntry { script: string; image: string | null; mask: string | null }
export interface FontPack {
  readonly base: string;
  readonly data: { fonts?: Record<string, FontPackEntry>; strings?: string | null };
  image(path: string): Promise<Bitmap | null>;
}

/** Null when the pack has no such font, the script cannot be fetched or no glyph picture loads (never throws). */
export async function loadBitmapFont(pack: FontPack, key: string): Promise<BitmapFont | null> {
  const entry = pack.data.fonts?.[key];
  if (!entry || !entry.script) return null;
  let text: string;
  try {
    const res = await fetch(assetUrl(entry.script, pack.base));
    if (!res.ok) return null;
    text = await res.text();
  } catch {
    return null;
  }
  const [image, mask] = await Promise.all([
    entry.image ? pack.image(entry.image) : Promise.resolve(null),
    entry.mask ? pack.image(entry.mask) : Promise.resolve(null),
  ]);
  let bitmap: Bitmap | null = null;
  if (image && mask) {
    try { bitmap = applyMask(image, mask, false); } catch { bitmap = image; }
  } else {
    bitmap = image ?? mask;
  }
  if (!bitmap) return null;
  const script = parseFontScript(text);
  const images = new Map<string, Bitmap>();
  for (const layer of script.layers) images.set(layer.image, bitmap);
  if (images.size === 0) images.set(key, bitmap);
  return new BitmapFont(script, images, image === null);
}
