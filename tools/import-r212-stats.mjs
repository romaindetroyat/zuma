#!/usr/bin/env node
/**
 * Extracts the original STATS dialog picture embedded in a R2.0.12 standalone
 * (`.zuma-stats:before{…background-image:url(data:…)}`) and writes it next to the
 * other private extras, together with the measured layout of its painted values.
 *
 *   node tools/import-r212-stats.mjs <standalone-r2012.html> [private_assets/original/extra]
 *
 * The picture is a screenshot of the proprietary game: it lives under
 * private_assets/ (ignored by Git) and travels only through the private pack.
 */
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const EXT_BY_MIME = { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/gif': '.gif', 'image/webp': '.webp' };

/** Size of the reference picture the measurements below were taken on. */
const REF = { width: 1445, height: 1089 };

const rect = (x, y, w, h) => ({ x, y, w, h });
/** Right edge of the painted values in each column (glyph edge, before the 2 px drop shadow). */
const RIGHT_LEFT_COLUMN = 675;
const RIGHT_RIGHT_COLUMN = 1105;
/** Painted digits are 25 px tall (cap height) → ~36 px Georgia bold at 1089 px of height. */
const FONT_PX = 36;
const CREAM = '#fcf4d0';
const GOLD = '#fcdc80';
const GREEN = '#58d828';

/**
 * Measured on stats_bg.png (1445×1089) with PIL: for each painted value, `erase` is the
 * rectangle holding the baked digits and their drop shadow, `patch` a clean rectangle of
 * the same size on the same panel (cloned over `erase` at load time), `box` the band
 * where the live value is written (right-aligned on the painted right edge, from the end
 * of the painted label). Pixel values here, fractions in the serialized JSON.
 */
const slot = (labelEnd, erase, patch, right, color) => ({
  box: rect(labelEnd + 12, erase.y, right - (labelEnd + 12), erase.h),
  erase,
  patch,
  align: 'right',
  color,
  fontSize: FONT_PX,
});
const STATS_LAYOUT_PX = {
  hudStrip: rect(0, 0, REF.width, 100),
  title: rect(400, 320, 650, 90),
  ok: rect(598, 874, 248, 58),
  slots: {
    points: slot(470, rect(590, 469, 90, 35), rect(495, 469, 90, 35), RIGHT_LEFT_COLUMN, CREAM),
    combos: slot(488, rect(654, 512, 26, 35), rect(600, 512, 26, 35), RIGHT_LEFT_COLUMN, CREAM),
    coins: slot(460, rect(653, 555, 27, 35), rect(600, 555, 27, 35), RIGHT_LEFT_COLUMN, CREAM),
    gaps: slot(449, rect(653, 597, 27, 35), rect(600, 597, 27, 35), RIGHT_LEFT_COLUMN, CREAM),
    chain: slot(540, rect(653, 639, 27, 35), rect(600, 639, 27, 35), RIGHT_LEFT_COLUMN, CREAM),
    comboMax: slot(564, rect(653, 681, 27, 35), rect(600, 681, 27, 35), RIGHT_LEFT_COLUMN, CREAM),
    time: slot(891, rect(1040, 470, 72, 35), rect(920, 470, 72, 35), RIGHT_RIGHT_COLUMN, GOLD),
    objective: slot(940, rect(1040, 513, 72, 35), rect(952, 513, 72, 35), RIGHT_RIGHT_COLUMN, GOLD),
    bonus: slot(890, rect(997, 579, 113, 35), rect(997, 678, 113, 35), RIGHT_RIGHT_COLUMN, GREEN),
    record: slot(914, rect(1040, 636, 72, 35), rect(925, 636, 72, 35), RIGHT_RIGHT_COLUMN, GOLD),
  },
};

const frac = (v, total) => Math.round((v / total) * 10000) / 10000;
const fracRect = r => ({ x: frac(r.x, REF.width), y: frac(r.y, REF.height), w: frac(r.w, REF.width), h: frac(r.h, REF.height) });

/** The layout as fractions of the picture (x, w / width; y, h, fontSize / height). */
export const STATS_LAYOUT = {
  format: 1,
  image: { ...REF },
  hudStrip: fracRect(STATS_LAYOUT_PX.hudStrip),
  title: fracRect(STATS_LAYOUT_PX.title),
  ok: fracRect(STATS_LAYOUT_PX.ok),
  slots: Object.fromEntries(Object.entries(STATS_LAYOUT_PX.slots).map(([key, s]) => [key, {
    box: fracRect(s.box),
    erase: fracRect(s.erase),
    patch: fracRect(s.patch),
    align: s.align,
    color: s.color,
    fontSize: frac(s.fontSize, REF.height),
  }])),
};

/**
 * Finds the `.zuma-stats:before` rule carrying a base64 data URL in a standalone's
 * markup and decodes it. Returns `{ mime, ext, buffer }` or `null` when absent.
 */
export function extractStatsImage(html) {
  const rule = /\.zuma-stats:before\s*\{[^}]*?url\((["']?)(data:(image\/[a-z+.-]+);base64,([A-Za-z0-9+/=\s]+))\1\)/g;
  let hit = null;
  for (const m of html.matchAll(rule)) hit = m;
  if (!hit) return null;
  const mime = hit[3].toLowerCase();
  const buffer = Buffer.from(hit[4].replace(/\s+/g, ''), 'base64');
  if (buffer.length === 0) return null;
  return { mime, ext: EXT_BY_MIME[mime] ?? '.bin', buffer };
}

/** Reads the PNG IHDR (or returns null for other formats). */
export function pngSize(buffer) {
  if (buffer.length < 24 || buffer.toString('latin1', 1, 4) !== 'PNG') return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

/**
 * Writes `stats_bg.<ext>` and `stats_layout.json` into `outDir` from a standalone file.
 * @returns {{ file: string, layoutFile: string, size: { width: number, height: number } | null }}
 */
export function importStats(standaloneFile, outDir = 'private_assets/original/extra') {
  const html = fs.readFileSync(standaloneFile, 'utf8');
  const image = extractStatsImage(html);
  if (!image) throw new Error(`no .zuma-stats:before background data URL in ${standaloneFile}`);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `stats_bg${image.ext}`);
  fs.writeFileSync(file, image.buffer);
  const size = pngSize(image.buffer);
  if (size && (size.width !== REF.width || size.height !== REF.height)) {
    console.warn(`stats_bg is ${size.width}×${size.height}, layout measured on ${REF.width}×${REF.height} (fractions still apply if the picture is the same design)`);
  }
  const layoutFile = path.join(outDir, 'stats_layout.json');
  fs.writeFileSync(layoutFile, JSON.stringify(STATS_LAYOUT, null, 1));
  return { file, layoutFile, size };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, outDir] = process.argv.slice(2);
  if (!source) {
    console.error('usage: node tools/import-r212-stats.mjs <standalone-r2012.html> [private_assets/original/extra]');
    process.exit(1);
  }
  try {
    const { file, layoutFile, size } = importStats(source, outDir);
    console.log(`${file}: ${size ? `${size.width}×${size.height}` : 'unknown size'}, ${fs.statSync(file).size} bytes`);
    console.log(`${layoutFile}: ${Object.keys(STATS_LAYOUT.slots).length} slots`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
