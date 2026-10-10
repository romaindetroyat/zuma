#!/usr/bin/env node
/**
 * Converts a locally extracted original Zuma Deluxe install into the private
 * asset pack consumed by `npm run dev` / `npm run standalone`.
 *
 *   node tools/import-original.mjs [private_assets/original] [private_assets/pack]
 *
 * Nothing produced here may be committed: private_assets/ is ignored by Git and
 * the publication guard refuses any tracked proprietary file.
 */
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

/** Only these extensions may be copied as images: the level directories also hold CURV `.dat` curves. */
const IMAGE_EXTS = ['.jpg', '.jpeg', '.png', '.gif'];

/** Sound keys used by src/feedback.ts → original resource file names. */
export const SOUND_MAP = {
  fire: 'fireball1', insert: 'ballclick1', merge: 'ballclick2', swap: 'pop', zuma: 'chant4',
  levelwin: 'chant5', lose: 'chant14', gameover: 'chant8', destroy1: 'ballsdestroyed1',
  destroy2: 'ballsdestroyed2', destroy3: 'ballsdestroyed3', destroy4: 'ballsdestroyed4',
  destroy5: 'ballsdestroyed5', combo: 'chime1', streak: 'chain1', gap: 'gapbonus1',
  powerup: 'jewelappear', powerbomb: 'bombexplode', powerslow: 'slowdown1', powerback: 'reverse1',
  poweraccuracy: 'accuracy3', gamestart: 'chant1', levelup: 'chant2', warning: 'warning1',
  rolling: 'rolling', extralife: 'extralife', bonuspop: 'endoflevelpop1', button: 'button1',
  button2: 'button2', coin: 'coingrab', frogland: 'frogland2', earthquake: 'earthquake',
  lighttrail: 'lighttrail2', trailend: 'chant3', templecomplete: 'chant6', choral: 'choral1', ufo: 'ufo1',
};

/** Images copied as-is (lower-cased) plus their alpha masks when present. */
const IMAGES = [
  'baBallBlue', 'baBallYellow', 'baBallRed', 'baBallGreen', 'baBallPurple', 'baBallWhite', '_ballalpha', '_ballshadow',
  'baBombBlue', 'baBombYellow', 'baBombRed', 'baBombGreen', 'baBombPurple', 'baBombWhite', '_baBomb',
  'baSlowBlue', 'baSlowYellow', 'baSlowRed', 'baSlowGreen', 'baSlowPurple', 'baSlowWhite',
  'baBackwardsBlue', 'baBackwardsYellow', 'baBackwardsRed', 'baBackwardsGreen', 'baBackwardsPurple', 'baBackwardsWhite',
  'baAccuracyBlue', 'baAccuracyYellow', 'baAccuracyRed', 'baAccuracyGreen', 'baAccuracyPurple', 'baAccuracyWhite',
  'baLightBlue', 'baLightYellow', 'baLightRed', 'baLightGreen', 'baLightPurple', 'baLightWhite', '_baLight',
  'baSlowLight', 'baBackwardsLight', 'baAccuracyLight', '_baSlowLight', '_baBackwardsLight', '_baAccuracyLight', 'baDotz',
  'Explosion', 'grayplosion', 'sparkle', 'Hole', '_Hole', 'pitcover', '_pitcover', 'COIN', '_COIN',
  'SMALLFROGonPAD', '_SMALLFROGonPAD', 'hatchback', '_hatchback', 'Tongue', '_Tongue', 'EYEBLINK',
  'Menubar', '_Menubar', 'MenuButton', '_Menubutton', 'gauge', '_gauge', 'gaugegreen', 'ToadLives', '_toadlives',
  'GodHead', '_GodHead', 'dialogbox', '_dialogbox', 'DialogButton', '_Dialogbutton', 'loadingscreen', 'mmscreen',
];

function readText(file) {
  const buf = fs.readFileSync(file);
  if (buf[0] === 0xff && buf[1] === 0xfe) return buf.subarray(2).toString('utf16le');
  if (buf[1] === 0 && buf[3] === 0) return buf.toString('utf16le').replace(/^﻿/, '');
  return buf.toString('latin1');
}

function attrs(tag) {
  const o = {};
  for (const m of tag.matchAll(/([\w:]+)\s*=\s*(?:"([^"]*)"|(-?[\w.]+))/g)) o[m[1]] = m[2] ?? m[3];
  return o;
}

/** Parses a CURV file: control points, then a pixel-sampled polyline with tunnel flags. */
export function parseCurve(buf) {
  if (buf.toString('latin1', 0, 4) !== 'CURV') throw new Error('not a CURV file');
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  const version = dv.getInt32(4, true);
  let pos = 12;
  const controlCount = dv.getInt32(pos + 4, true);
  pos += 8;
  const controls = [];
  for (let i = 0; i < controlCount; i++) {
    controls.push([dv.getInt32(pos, true), dv.getInt32(pos + 4, true)]);
    pos += 10;
  }
  const count = dv.getInt32(pos, true);
  let x = dv.getFloat32(pos + 4, true);
  let y = dv.getFloat32(pos + 8, true);
  pos += 12;
  const points = [[round2(x), round2(y), 0]];
  for (let i = 1; i < count; i++) {
    const under = dv.getUint8(pos);
    const hidden = dv.getUint8(pos + 1);
    x += dv.getInt8(pos + 2) / 100;
    y += dv.getInt8(pos + 3) / 100;
    pos += 4;
    points.push([round2(x), round2(y), (under ? 1 : 0) | (hidden ? 2 : 0)]);
  }
  return { version, controls, points };
}

const round2 = v => Math.round(v * 100) / 100;

/** Case-insensitive lookup by stem; `exts` (lower-case, with dot) restricts the accepted extensions. */
function findFile(dir, baseName, exts = null) {
  if (!fs.existsSync(dir)) return null;
  const want = baseName.toLowerCase();
  for (const f of fs.readdirSync(dir)) {
    const stem = f.replace(/\.[^.]+$/, '').toLowerCase();
    if (stem !== want) continue;
    if (exts && !exts.includes(path.extname(f).toLowerCase())) continue;
    return path.join(dir, f);
  }
  return null;
}

/** True when an `ffmpeg` binary answers on PATH (used for the optional AAC transcode). */
function hasFfmpeg() {
  try {
    execFileSync('ffmpeg', ['-version'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

function findDir(parent, name) {
  if (!fs.existsSync(parent)) return null;
  const hit = fs.readdirSync(parent).find(f => f.toLowerCase() === name.toLowerCase());
  return hit ? path.join(parent, hit) : null;
}

function copyImage(fromDir, name, toDir, targetStem = name.toLowerCase()) {
  const file = fromDir ? findFile(fromDir, name, IMAGE_EXTS) : null;
  if (!file) return null;
  fs.mkdirSync(toDir, { recursive: true });
  const target = targetStem + path.extname(file).toLowerCase();
  fs.copyFileSync(file, path.join(toDir, target));
  return target;
}

/**
 * @param {string} srcDir extracted original install
 * @param {string} outDir generated pack (wiped first)
 * @param {{ transcode?: boolean }} [options] `transcode: false` (or ZUMA_NO_TRANSCODE=1) skips the AAC step
 */
export function importOriginal(srcDir = 'private_assets/original', outDir = 'private_assets/pack', { transcode = true } = {}) {
  const src = path.resolve(srcDir);
  const out = path.resolve(outDir);
  if (!fs.existsSync(path.join(src, 'levels', 'levels.xml'))) {
    throw new Error(`no original install under ${src} (expected levels/levels.xml)`);
  }
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });

  // ---------------------------------------------------------------- levels.xml
  const xml = readText(path.join(src, 'levels', 'levels.xml')).replace(/<!--[\s\S]*?-->/g, '');
  const graphics = {};
  for (const m of xml.matchAll(/<Graphics\b([^>]*)>([\s\S]*?)<\/Graphics>/g)) {
    const a = attrs(m[1]);
    const body = m[2];
    graphics[a.id] = {
      id: a.id,
      name: a.dispname ?? a.id,
      image: a.image ?? a.id,
      curves: [a.curve, a.curve2].filter(Boolean),
      frog: { x: Number(a.gx), y: Number(a.gy) },
      skullRotation: a.skullrot !== undefined ? Number(a.skullrot) : null,
      cutouts: [...body.matchAll(/<Cutout\b([^>]*)\/>/g)].map(c => {
        const o = attrs(c[1]);
        return { image: o.image, x: Number(o.x), y: Number(o.y), priority: Number(o.pri ?? 0) };
      }),
      overlays: [...body.matchAll(/<BackgroundAlpha\b([^>]*)\/>/g)].map(c => {
        const o = attrs(c[1]);
        return { image: o.image, x: Number(o.x), y: Number(o.y), vx: Number(o.vx ?? 0), vy: Number(o.vy ?? 0) };
      }),
      treasure: [...body.matchAll(/<TreasurePoint\b([^>]*)\/>/g)].map(c => {
        const o = attrs(c[1]);
        return { x: Number(o.x), y: Number(o.y), curve: o.dist2 !== undefined ? 1 : 0, dist: Number(o.dist1 ?? o.dist2 ?? 0) };
      }),
    };
  }
  const settings = {};
  for (const m of xml.matchAll(/<Settings\b([^>]*)\/>/g)) {
    const a = attrs(m[1]);
    const s = { id: a.id };
    for (const [k, v] of Object.entries(a)) if (k !== 'id') s[k] = Number.isNaN(Number(v)) ? v : Number(v);
    settings[a.id] = s;
  }
  const progressions = {};
  for (const m of xml.matchAll(/<LevelProgression\b([^>]*)\/>/g)) {
    const a = attrs(m[1]);
    progressions[a.id] = { settings: a.settings.split(','), difficulty: a.difficulty.split(',').map(Number) };
  }
  const levelOrder = [...xml.matchAll(/<Level\b([^>]*)\/>/g)].map(m => attrs(m[1])).map(a => ({ graphics: a.graphics, progression: a.progression }));
  const stages = [];
  const sp = xml.match(/<StageProgression\b([\s\S]*?)\/>/);
  if (sp) {
    const a = attrs(sp[1]);
    for (let i = 1; a[`stage${i}`]; i++) stages.push({ levels: a[`stage${i}`].split(','), settings: a[`diffi${i}`].split(',') });
  }

  // -------------------------------------------------------------------- curves
  const curveDir = path.join(out, 'levels');
  fs.mkdirSync(curveDir, { recursive: true });
  let curveCount = 0;
  for (const g of Object.values(graphics)) {
    const levelSrc = findDir(path.join(src, 'levels'), g.id);
    const files = levelSrc ? fs.readdirSync(levelSrc) : [];
    g.curveFiles = [];
    for (const curve of g.curves) {
      const dat = files.find(f => f.toLowerCase() === `${curve.toLowerCase()}.dat`);
      if (!dat) { console.warn(`missing curve ${curve} for ${g.id}`); continue; }
      const parsed = parseCurve(fs.readFileSync(path.join(levelSrc, dat)));
      const target = `${curve.toLowerCase()}.json`;
      fs.writeFileSync(path.join(curveDir, target), JSON.stringify(parsed));
      g.curveFiles.push(`levels/${target}`);
      curveCount++;
    }
    const bgDir = path.join(out, 'levels', g.id);
    const bg = copyImage(levelSrc, g.image, bgDir);
    g.background = bg ? `levels/${g.id}/${bg}` : null;
    g.layers = {};
    for (const c of [...g.cutouts, ...g.overlays]) {
      const alpha = copyImage(levelSrc, `_${c.image}`, bgDir);
      const color = copyImage(levelSrc, c.image, bgDir);
      g.layers[c.image] = { alpha: alpha ? `levels/${g.id}/${alpha}` : null, color: color ? `levels/${g.id}/${color}` : null };
    }
    // The 320×240 thumbnail lives beside the 640×480 background under its own name,
    // so it can never overwrite `<id>.jpg`.
    const thumb = copyImage(path.join(src, 'levels', 'perm_thumbnails'), g.id, bgDir, 'thumb');
    g.thumbnail = thumb ? `levels/${g.id}/${thumb}` : null;
  }

  // -------------------------------------------------------------------- sounds
  const soundDir = path.join(out, 'sounds');
  fs.mkdirSync(soundDir, { recursive: true });
  const sounds = [];
  const formats = {};
  const useFfmpeg = transcode && process.env.ZUMA_NO_TRANSCODE !== '1' && hasFfmpeg();
  let m4aCount = 0;
  let warnedTranscode = false;
  for (const [key, original] of Object.entries(SOUND_MAP)) {
    const file = findFile(path.join(src, 'sounds'), original);
    if (!file || path.extname(file).toLowerCase() !== '.ogg') continue;
    const oggPath = path.join(soundDir, `${key}.ogg`);
    fs.copyFileSync(file, oggPath);
    sounds.push(key);
    formats[key] = ['ogg'];
    if (!useFfmpeg) continue;
    // AAC twin for browsers without a Vorbis decoder (Safari). Never a shell: argv array only.
    const m4aPath = path.join(soundDir, `${key}.m4a`);
    try {
      execFileSync('ffmpeg', ['-y', '-v', 'error', '-i', oggPath, '-c:a', 'aac', '-b:a', '96k', '-movflags', '+faststart', m4aPath], { stdio: 'ignore' });
      formats[key].push('m4a');
      m4aCount++;
    } catch {
      fs.rmSync(m4aPath, { force: true });
      if (!warnedTranscode) { console.warn(`ffmpeg could not transcode ${key}.ogg (keeping .ogg only)`); warnedTranscode = true; }
    }
  }
  fs.writeFileSync(path.join(soundDir, 'manifest.json'), JSON.stringify({ format: 2, sounds: formats }));
  const music = findFile(path.join(src, 'music'), 'zuma');
  if (music) fs.copyFileSync(music, path.join(out, 'zuma' + path.extname(music).toLowerCase()));

  // -------------------------------------------------------------------- images
  const images = {};
  for (const name of IMAGES) {
    const copied = copyImage(path.join(src, 'images'), name, path.join(out, 'images'));
    if (copied) images[name.toLowerCase()] = `images/${copied}`;
  }
  // Extras produced by the other importers (tools/import-r212-stats.mjs → stats_bg.png):
  // every image under original/extra/ is registered under its lower-cased stem.
  const extraDir = path.join(src, 'extra');
  if (fs.existsSync(extraDir)) {
    for (const f of fs.readdirSync(extraDir).sort()) {
      if (!IMAGE_EXTS.includes(path.extname(f).toLowerCase())) continue;
      const stem = f.replace(/\.[^.]+$/, '');
      const copied = copyImage(extraDir, stem, path.join(out, 'images'));
      if (copied) images[stem.toLowerCase()] = `images/${copied}`;
    }
  }

  const pack = {
    format: 1,
    generatedAt: new Date().toISOString(),
    graphics,
    settings,
    progressions,
    levelOrder,
    stages,
    sounds,
    images,
    music: music ? 'zuma' + path.extname(music).toLowerCase() : null,
  };
  fs.writeFileSync(path.join(out, 'pack.json'), JSON.stringify(pack, null, 1));
  const audioNote = useFfmpeg ? `${m4aCount} m4a` : '0 m4a (ffmpeg absent : .ogg seuls)';
  console.log(`pack written to ${out}: ${Object.keys(graphics).length} levels, ${curveCount} curves, ${sounds.length} sounds, ${audioNote}, ${Object.keys(images).length} images`);
  return pack;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    importOriginal(process.argv[2], process.argv[3], {});
  } catch (err) {
    console.error(err instanceof Error ? err.message : err);
    process.exit(1);
  }
}
