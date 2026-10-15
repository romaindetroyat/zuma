/**
 * PNG icons of the PWA (R2.0.20, plan 05-14, D-38 §3), generated at build time without any dependency: the geometry
 * of public/icon.svg rasterised with 4 × 4 supersampling, encoded as RGBA PNG (node:zlib + a CRC-32 table of our own:
 * zlib.crc32 is missing from early Node 22 releases).
 */
import zlib from 'node:zlib';

const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();

/** CRC-32 (PNG / zlib polynomial) of a byte sequence. */
export function crc32(bytes) {
  let c = 0xffffffff;
  for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(data.length, 0);
  head.write(type, 4, 'latin1');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), data])), 0);
  return Buffer.concat([head, data, crc]);
}

/** RGBA 8-bit PNG of `w × h` pixels (`rgba` row-major, 4 bytes per pixel), filter 0 on every row. */
export function encodePng(w, h, rgba) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 6; // RGBA
  const raw = Buffer.alloc(h * (1 + 4 * w));
  for (let y = 0; y < h; y++) {
    raw[y * (1 + 4 * w)] = 0;
    Buffer.from(rgba.buffer, rgba.byteOffset + y * 4 * w, 4 * w).copy(raw, y * (1 + 4 * w) + 1);
  }
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

const hex = s => [parseInt(s.slice(1, 3), 16) / 255, parseInt(s.slice(3, 5), 16) / 255, parseInt(s.slice(5, 7), 16) / 255];
const BG = hex('#120c06');
/** public/icon.svg, 128-unit design: rounded square rx 28, four balls of radius 18, four highlights at 70 % white. */
const BALLS = [[40, 50, '#1980ff'], [76, 40, '#ffff00'], [96, 76, '#ff0000'], [60, 88, '#00ff00']].map(([x, y, c]) => ({ x, y, rgb: hex(c) }));
const SHINES = [[34, 26], [70, 16], [90, 52], [54, 64]];

function inRoundedSquare(u, v) {
  const r = 28;
  const cx = Math.min(Math.max(u, r), 128 - r);
  const cy = Math.min(Math.max(v, r), 128 - r);
  return u >= 0 && u <= 128 && v >= 0 && v <= 128 && (u - cx) ** 2 + (v - cy) ** 2 <= r * r;
}

/** Straight-alpha colour [r, g, b, a] (0..1) of the design at (u, v); `under` = colour below the rounded square. */
function sample(u, v, under) {
  let c = under ? [...under, 1] : [0, 0, 0, 0];
  if (inRoundedSquare(u, v)) c = [...BG, 1];
  for (const b of BALLS) if ((u - b.x) ** 2 + (v - b.y) ** 2 <= 18 * 18) c = [...b.rgb, 1];
  for (const [x, y] of SHINES) {
    if ((u - x) ** 2 + (v - y) ** 2 > 36) continue;
    const a = 0.7;
    const outA = a + c[3] * (1 - a);
    c = [0, 1, 2].map(i => (1 * a + c[i] * c[3] * (1 - a)) / outA).concat(outA);
  }
  return c;
}

/**
 * RGBA pixels of a `size` px icon. « any » (default): the rounded square on transparency. `maskable` / `opaque`
 * (maskable and apple-touch-icon): a full #120c06 background with the design reduced to 80 % in the centre, inside the
 * maskable safe zone.
 */
export function renderIcon(size, { maskable = false, opaque = false } = {}) {
  const full = maskable || opaque;
  const out = new Uint8Array(size * size * 4);
  const N = 4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          let u = ((x + (i + 0.5) / N) / size) * 128;
          let v = ((y + (j + 0.5) / N) / size) * 128;
          if (full) { u = (u - 12.8) / 0.8; v = (v - 12.8) / 0.8; }
          const c = sample(u, v, full ? BG : null);
          r += c[0] * c[3]; g += c[1] * c[3]; b += c[2] * c[3]; a += c[3];
        }
      }
      const o = 4 * (y * size + x);
      const k = N * N;
      out[o + 3] = Math.round((a / k) * 255);
      if (a > 0) { out[o] = Math.round((r / a) * 255); out[o + 1] = Math.round((g / a) * 255); out[o + 2] = Math.round((b / a) * 255); }
    }
  }
  return out;
}

/** The four icons written into dist/public by tools/build.mjs. */
export const ICONS = [
  { file: 'icon-192.png', size: 192, options: {} },
  { file: 'icon-512.png', size: 512, options: {} },
  { file: 'icon-maskable-512.png', size: 512, options: { maskable: true } },
  { file: 'apple-touch-icon.png', size: 180, options: { opaque: true } },
];
