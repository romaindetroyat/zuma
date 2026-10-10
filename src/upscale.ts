/**
 * Pixel-art 2 × enlargement (D-19): Scale2x / EPX — Eric's Pixel Expansion — with no dependency.
 * Each source pixel P becomes a 2 × 2 block; a corner takes the colour of two agreeing neighbours
 * when the opposite ones disagree, so diagonals and curves get smoothed without any colour being
 * invented (the filter only copies existing pixels). xBR was not retained: far more code for a small
 * gain on 12–18 px glyphs. `upscale2x` is pure and DOM-free (the Node tests lock it on synthetic
 * pictures); `upscaleBitmap` wraps it for a canvas and returns null when the pixels cannot be read.
 */
import type { Bitmap } from './original.js';

export interface RawImage { width: number; height: number; data: Uint8ClampedArray }

/**
 * EPX rules, with A above, B right, C left, D below P (a neighbour outside the picture counts as P):
 *   E0 (top-left)     = C == A && C != D && A != B ? A : P
 *   E1 (top-right)    = A == B && A != C && B != D ? B : P
 *   E2 (bottom-left)  = D == C && D != B && C != A ? C : P
 *   E3 (bottom-right) = B == D && B != A && D != C ? D : P
 * Equality is on the four RGBA bytes. The input is never modified.
 */
export function upscale2x(src: RawImage): RawImage {
  const w = Math.max(0, Math.floor(src.width));
  const h = Math.max(0, Math.floor(src.height));
  if (w === 0 || h === 0 || src.data.length < w * h * 4) return { width: 0, height: 0, data: new Uint8ClampedArray(0) };
  // 32-bit views: one RGBA pixel per entry (a copy when the source buffer is not 4-byte aligned).
  const aligned = src.data.byteOffset % 4 === 0 ? src.data : new Uint8ClampedArray(src.data);
  const inp = new Uint32Array(aligned.buffer, aligned.byteOffset, w * h);
  const w2 = w * 2;
  const out = new Uint32Array(w2 * h * 2);
  for (let y = 0; y < h; y++) {
    const row = y * w;
    for (let x = 0; x < w; x++) {
      const p = inp[row + x];
      const a = y > 0 ? inp[row - w + x] : p;
      const b = x + 1 < w ? inp[row + x + 1] : p;
      const c = x > 0 ? inp[row + x - 1] : p;
      const d = y + 1 < h ? inp[row + w + x] : p;
      const o = (y * 2) * w2 + x * 2;
      out[o] = c === a && c !== d && a !== b ? a : p;
      out[o + 1] = a === b && a !== c && b !== d ? b : p;
      out[o + w2] = d === c && d !== b && c !== a ? c : p;
      out[o + w2 + 1] = b === d && b !== a && d !== c ? d : p;
    }
  }
  return { width: w2, height: h * 2, data: new Uint8ClampedArray(out.buffer) };
}

/** One 2 × copy per source picture: fonts sharing a `.gif` (HUD and STATS Cancun12) share the atlas (T-05-22). */
const UPSCALED = new WeakMap<Bitmap, HTMLCanvasElement>();

/**
 * The picture enlarged 2 × by `upscale2x` on a fresh canvas (memoised per source); null when the
 * picture is empty or its pixels cannot be read (no 2D context, tainted image) so the caller keeps
 * the 1 × original.
 */
export function upscaleBitmap(image: Bitmap): HTMLCanvasElement | null {
  const cached = UPSCALED.get(image);
  if (cached) return cached;
  const out = upscaleFresh(image);
  if (out) UPSCALED.set(image, out);
  return out;
}

function upscaleFresh(image: Bitmap): HTMLCanvasElement | null {
  try {
    const w = image.width;
    const h = image.height;
    if (!(w > 0) || !(h > 0)) return null;
    const scratch = blankCanvas(w, h);
    const sctx = scratch.getContext('2d');
    if (!sctx) return null;
    sctx.drawImage(image, 0, 0);
    const big = upscale2x(sctx.getImageData(0, 0, w, h));
    const out = blankCanvas(big.width, big.height);
    const ctx = out.getContext('2d');
    if (!ctx) return null;
    ctx.putImageData(new ImageData(big.data, big.width, big.height), 0, 0);
    return out;
  } catch {
    return null;
  }
}

/** Blank canvas of at least 1 × 1 (own copy: this module stays a leaf, `original.ts` imports it). */
function blankCanvas(width: number, height: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, width);
  c.height = Math.max(1, height);
  return c;
}
