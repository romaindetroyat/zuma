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
 * Writes `stats_bg.<ext>` into `outDir` from a standalone file.
 * @returns {{ file: string, size: { width: number, height: number } | null }}
 */
export function importStats(standaloneFile, outDir = 'private_assets/original/extra') {
  const html = fs.readFileSync(standaloneFile, 'utf8');
  const image = extractStatsImage(html);
  if (!image) throw new Error(`no .zuma-stats:before background data URL in ${standaloneFile}`);
  fs.mkdirSync(outDir, { recursive: true });
  const file = path.join(outDir, `stats_bg${image.ext}`);
  fs.writeFileSync(file, image.buffer);
  return { file, size: pngSize(image.buffer) };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const [source, outDir] = process.argv.slice(2);
  if (!source) {
    console.error('usage: node tools/import-r212-stats.mjs <standalone-r2012.html> [private_assets/original/extra]');
    process.exit(1);
  }
  try {
    const { file, size } = importStats(source, outDir);
    console.log(`${file}: ${size ? `${size.width}×${size.height}` : 'unknown size'}, ${fs.statSync(file).size} bytes`);
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
