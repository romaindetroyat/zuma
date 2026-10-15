/**
 * Loader for the private asset pack produced by tools/import-original.mjs.
 *
 * The pack is optional: when `assets/pack.json` is absent the game falls back to
 * the procedural levels and vector rendering. Nothing in this module embeds
 * proprietary data; it only reads what a local build placed under assets/.
 */
import { Track, type Point, type TreasurePoint } from './core.js';
import { upscaleBitmap } from './upscale.js';

declare global {
  interface Window { __ZUMA_ASSETS__?: Record<string, string> }
}

/**
 * Resolves an asset path. A standalone build injects `window.__ZUMA_ASSETS__`
 * (path → data URL); every other build reads files next to the page.
 */
export function assetUrl(path: string, base = 'assets/'): string {
  const embedded = typeof window !== 'undefined' ? window.__ZUMA_ASSETS__ : undefined;
  if (embedded && Object.prototype.hasOwnProperty.call(embedded, path)) return embedded[path];
  return base + path;
}

export interface PackLayer { alpha: string | null; color: string | null }
export interface PackCutout { image: string; x: number; y: number; priority: number }
export interface PackOverlay { image: string; x: number; y: number; vx: number; vy: number }
export interface PackGraphics {
  id: string;
  name: string;
  curves: string[];
  curveFiles: string[];
  frog: Point;
  skullRotation: number | null;
  cutouts: PackCutout[];
  overlays: PackOverlay[];
  background: string | null;
  layers: Record<string, PackLayer>;
  thumbnail: string | null;
  /** Coin spots (`TreasurePoint` of levels.xml); emitted by the importer from plan 05-04, absent in older packs. */
  treasure?: TreasurePoint[];
}
/** A PopCap bitmap font: script (`.txt`, UTF-8), colour picture and/or `_name` mask. */
export interface PackFont { script: string; image: string | null; mask: string | null }
export interface PackSettings {
  id: string;
  speed?: number;
  start?: number;
  score?: number;
  repeat?: number;
  single?: number;
  colors?: number;
  slowfactor?: number;
  firespeed?: number;
  powerfreq?: number;
  partime?: number;
  /** ZUMA-mode slowdown / rollback lengths in 100 Hz steps (only `lvl35` sets them). */
  zumaslow?: number;
  zumaback?: number;
  [key: string]: unknown;
}
export interface PackData {
  format: number;
  graphics: Record<string, PackGraphics>;
  settings: Record<string, PackSettings>;
  progressions: Record<string, { settings: string[]; difficulty: number[] }>;
  levelOrder: Array<{ graphics: string; progression: string }>;
  stages: Array<{ levels: string[]; settings: string[] }>;
  sounds: string[];
  images: Record<string, string>;
  /** Bitmap fonts by lower-case stem (`cancun12`, `nativealienextended18`…). */
  fonts?: Record<string, PackFont>;
  /** Original strings extracted from properties/default.xml (`strings.json`). */
  strings?: string | null;
  music: string | null;
}
export interface CurveFile { version: number; controls: number[][]; points: Array<[number, number, number]> }

export type Bitmap = HTMLCanvasElement | HTMLImageElement;

export interface Sheet { image: Bitmap; frameWidth: number; frameHeight: number; frames: number }

const COLOR_NAMES = ['blue', 'yellow', 'red', 'green', 'purple', 'white'] as const;

export class OriginalPack {
  private readonly cache = new Map<string, Promise<Bitmap | null>>();
  private readonly curves = new Map<string, Promise<Track>>();
  private stringsPromise: Promise<Record<string, string> | null> | null = null;

  constructor(readonly base: string, readonly data: PackData) {}

  static async load(base = 'assets/'): Promise<OriginalPack | null> {
    try {
      const res = await fetch(assetUrl('pack.json', base), { cache: 'no-store' });
      if (!res.ok) return null;
      const data = (await res.json()) as PackData;
      if (data.format !== 1 || !data.graphics) return null;
      return new OriginalPack(base, data);
    } catch {
      return null;
    }
  }

  get hasStages(): boolean {
    return this.data.stages.length > 0;
  }

  graphics(id: string): PackGraphics | undefined {
    return this.data.graphics[id];
  }

  settings(id: string): PackSettings | undefined {
    return this.data.settings[id];
  }

  async tracks(graphics: PackGraphics): Promise<Track[]> {
    return Promise.all(graphics.curveFiles.map(file => this.track(file)));
  }

  private track(file: string): Promise<Track> {
    let p = this.curves.get(file);
    if (!p) {
      p = fetch(assetUrl(file, this.base)).then(async res => {
        if (!res.ok) throw new Error(`curve ${file}: ${res.status}`);
        const curve = (await res.json()) as CurveFile;
        return new Track(curve.points);
      });
      this.curves.set(file, p);
    }
    return p;
  }

  /** Loads an image by pack key (lower-case original name) or by relative path. */
  image(keyOrPath: string): Promise<Bitmap | null> {
    const path = this.data.images[keyOrPath] ?? keyOrPath;
    let p = this.cache.get(path);
    if (!p) {
      p = loadImage(assetUrl(path, this.base)).catch(() => null);
      this.cache.set(path, p);
    }
    return p;
  }

  /** Image combined with its PopCap `_name` alpha mask when one exists. */
  async masked(key: string, alphaKey = `_${key}`, tile = false): Promise<Bitmap | null> {
    const [color, alpha] = await Promise.all([this.image(key), this.data.images[alphaKey] ? this.image(alphaKey) : Promise.resolve(null)]);
    if (!color) return null;
    if (!alpha) return color;
    return applyMask(color, alpha, tile);
  }

  /**
   * Sprites shipped without a `_name` mask use their corner colour as transparency
   * (EYEBLINK): every pixel whose RGB equals pixel (0, 0) becomes fully transparent.
   * Returns null when the image is missing or its pixels cannot be read.
   */
  async keyed(key: string): Promise<Bitmap | null> {
    const image = await this.image(key);
    if (!image) return null;
    try {
      const out = canvasOf(image.width, image.height);
      const ctx = out.getContext('2d');
      if (!ctx) return null;
      ctx.drawImage(image, 0, 0);
      const pixels = ctx.getImageData(0, 0, out.width, out.height);
      const d = pixels.data;
      const kr = d[0], kg = d[1], kb = d[2];
      for (let i = 0; i < d.length; i += 4) if (d[i] === kr && d[i + 1] === kg && d[i + 2] === kb) d[i + 3] = 0;
      ctx.putImageData(pixels, 0, 0);
      return out;
    } catch {
      return null;
    }
  }

  /** Original strings (`strings.json`, id → text); null without the file or on any error. Cached. */
  strings(): Promise<Record<string, string> | null> {
    if (!this.stringsPromise) {
      const file = this.data.strings;
      this.stringsPromise = file ? this.json<Record<string, string>>(file).then(table => (table && typeof table === 'object' ? table : null)) : Promise.resolve(null);
    }
    return this.stringsPromise;
  }

  private async json<T>(file: string): Promise<T | null> {
    try {
      const res = await fetch(assetUrl(file, this.base));
      if (!res.ok) return null;
      return (await res.json()) as T;
    } catch {
      return null;
    }
  }

  /** Black drop shadow whose alpha follows the mask luminance. */
  async shadow(maskKey: string, strength = 0.55): Promise<Bitmap | null> {
    const mask = await this.image(maskKey);
    if (!mask) return null;
    const out = canvasOf(mask.width, mask.height);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(mask, 0, 0);
    const pixels = ctx.getImageData(0, 0, out.width, out.height);
    const d = pixels.data;
    for (let i = 0; i < d.length; i += 4) {
      d[i + 3] = Math.round(d[i] * strength);
      d[i] = d[i + 1] = d[i + 2] = 0;
    }
    ctx.putImageData(pixels, 0, 0);
    return out;
  }

  async sheet(key: string, frameHeight: number, alphaKey?: string, tile = false): Promise<Sheet | null> {
    const image = alphaKey ? await this.masked(key, alphaKey, tile) : await this.image(key);
    if (!image) return null;
    return { image, frameWidth: image.width, frameHeight, frames: Math.max(1, Math.floor(image.height / frameHeight)) };
  }

  /** Six rolling-ball sheets (32×32 frames) sharing the `_ballalpha` mask. */
  async ballSheets(): Promise<Array<Sheet | null>> {
    return Promise.all(COLOR_NAMES.map(name => this.sheet(`baball${name}`, 32, '_ballalpha', true)));
  }

  async powerIcons(kind: 'bomb' | 'slow' | 'backwards' | 'accuracy'): Promise<Array<Bitmap | null>> {
    const alpha = kind === 'bomb' ? '_babomb' : '_ballalpha';
    return Promise.all(COLOR_NAMES.map(name => this.masked(`ba${kind}${name}`, alpha)));
  }

  /** Background with its cutouts resolved into drawable layers. */
  async levelArt(g: PackGraphics): Promise<LevelArt> {
    const background = g.background ? await this.image(g.background) : null;
    const cutouts: DrawableLayer[] = [];
    const overlays: DrawableLayer[] = [];
    const resolve = async (layerName: string, x: number, y: number, priority: number): Promise<DrawableLayer | null> => {
      const layer = g.layers[layerName];
      if (!layer) return null;
      const alpha = layer.alpha ? await this.image(layer.alpha) : null;
      const color = layer.color ? await this.image(layer.color) : null;
      if (!alpha && !color) return null;
      if (color && alpha) return { image: applyMask(color, alpha, false), x, y, priority };
      if (color) return { image: color, x, y, priority };
      // Alpha-only layers are stencils cut from the background at the same position (hypothesis C2).
      if (background && alpha) return { image: cutFromBackground(background, alpha, x, y), x, y, priority };
      return null;
    };
    // Cutouts are drawn in the pass of their `pri` (0x4105e0 / 0x409210: all 22 of the pack are 1, D-23).
    for (const c of g.cutouts) {
      const d = await resolve(c.image, c.x, c.y, layerPriority(c.priority));
      if (d) cutouts.push(d);
    }
    // BackgroundAlpha overlays stay under every ball: their priority is irrelevant (0).
    for (const o of g.overlays) {
      const d = await resolve(o.image, o.x, o.y, 0);
      if (d) overlays.push({ ...d, vx: o.vx, vy: o.vy });
    }
    return { background, cutouts, overlays };
  }
}

/** A resolved cutout / overlay; `priority` = draw pass of a cutout (0..4, D-23). */
export interface DrawableLayer { image: Bitmap; x: number; y: number; vx?: number; vy?: number; priority: number }

/** Pack `priority` of a cutout as a draw pass: integer 0..4, absent or non-finite → 1 (the value of every pack cutout). */
export function layerPriority(value: unknown): number {
  const n = Number(value);
  if (value === undefined || value === null || !Number.isFinite(n)) return 1;
  return Math.max(0, Math.min(4, Math.trunc(n)));
}
export interface LevelArt { background: Bitmap | null; cutouts: DrawableLayer[]; overlays: DrawableLayer[] }

export function loadImage(url: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`cannot load ${url}`));
    img.src = url;
  });
}

/** Blank canvas of at least 1×1 (shared with the font module: one definition in the standalone bundle). */
export function canvasOf(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, width);
  c.height = Math.max(1, height);
  return c;
}

/** Uses the luminance of `alpha` as the alpha channel of `color`; `tile` repeats a small mask over a sheet. */
export function applyMask(color: Bitmap, alpha: Bitmap, tile: boolean): HTMLCanvasElement {
  const w = tile ? color.width : Math.min(color.width, alpha.width);
  const h = tile ? color.height : Math.min(color.height, alpha.height);
  const out = canvasOf(w, h);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.drawImage(color, 0, 0);
  const maskCanvas = canvasOf(w, h);
  const mctx = maskCanvas.getContext('2d');
  if (!mctx) return out;
  if (tile) {
    for (let y = 0; y < h; y += alpha.height) for (let x = 0; x < w; x += alpha.width) mctx.drawImage(alpha, x, y);
  } else {
    mctx.drawImage(alpha, 0, 0);
  }
  const pixels = ctx.getImageData(0, 0, w, h);
  const mask = mctx.getImageData(0, 0, w, h).data;
  const data = pixels.data;
  for (let i = 0; i < data.length; i += 4) data[i + 3] = mask[i];
  ctx.putImageData(pixels, 0, 0);
  return out;
}

/**
 * Object URL of the canvas as PNG, encoded synchronously: `toDataURL` takes ~10 ms for a
 * 640×480 frame where `toBlob`'s asynchronous encoder needs up to a second in a
 * software-rendered Chromium (measured, plan 05-03). The bytes are rewrapped in a Blob so the
 * style attribute only carries a short `blob:` URL; the data URL itself is the fallback.
 */
export function bitmapUrl(canvas: HTMLCanvasElement): string {
  const dataUrl = canvas.toDataURL('image/png');
  if (typeof URL === 'undefined' || typeof URL.createObjectURL !== 'function' || typeof atob !== 'function') return dataUrl;
  try {
    const bin = atob(dataUrl.slice(dataUrl.indexOf(',') + 1));
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return URL.createObjectURL(new Blob([bytes], { type: 'image/png' }));
  } catch {
    return dataUrl;
  }
}

function cutFromBackground(background: Bitmap, alpha: Bitmap, x: number, y: number): HTMLCanvasElement {
  const out = canvasOf(alpha.width, alpha.height);
  const ctx = out.getContext('2d');
  if (!ctx) return out;
  ctx.drawImage(background, -x, -y);
  const mctx = canvasOf(alpha.width, alpha.height).getContext('2d');
  if (!mctx) return out;
  mctx.drawImage(alpha, 0, 0);
  const pixels = ctx.getImageData(0, 0, out.width, out.height);
  const mask = mctx.getImageData(0, 0, out.width, out.height).data;
  for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i + 3] = mask[i];
  ctx.putImageData(pixels, 0, 0);
  return out;
}

/**
 * The sheet over its 2 × EPX picture (D-19): frame size doubled, frame count unchanged, so the
 * renderer keeps cutting frame by frame and drawing at the logical size. Without a 2 × picture
 * (unreadable pixels) the sheet is returned as is.
 */
export function upscaleSheet(sheet: Sheet, image: Bitmap | null = upscaleBitmap(sheet.image)): Sheet {
  if (!image) return sheet;
  return { image, frameWidth: sheet.frameWidth * 2, frameHeight: sheet.frameHeight * 2, frames: sheet.frames };
}

/** Tints a grey sprite sheet with an RGB colour (used for the per-colour explosion). */
export function tintSheet(sheet: Sheet, rgb: number): Sheet {
  const out = canvasOf(sheet.image.width, sheet.image.height);
  const ctx = out.getContext('2d');
  if (!ctx) return sheet;
  ctx.drawImage(sheet.image, 0, 0);
  ctx.globalCompositeOperation = 'multiply';
  ctx.fillStyle = `rgb(${(rgb >> 16) & 255},${(rgb >> 8) & 255},${rgb & 255})`;
  ctx.fillRect(0, 0, out.width, out.height);
  ctx.globalCompositeOperation = 'destination-in';
  ctx.drawImage(sheet.image, 0, 0);
  return { ...sheet, image: out };
}
