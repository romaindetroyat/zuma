import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importOriginal } from '../tools/import-original.mjs';

/**
 * R2.0.14 — importer lock on a synthetic original tree: the 640×480 background must
 * survive next to the thumbnail, no `.dat` curve may be mistaken for an image, and the
 * sound manifest must use format 2 (per-key formats) whether or not ffmpeg is present.
 */
function makeOriginal() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-import-'));
  const src = path.join(root, 'original');
  const lvl = path.join(src, 'levels', 'foo');
  fs.mkdirSync(lvl, { recursive: true });
  fs.mkdirSync(path.join(src, 'levels', 'perm_thumbnails'), { recursive: true });
  fs.mkdirSync(path.join(src, 'sounds'), { recursive: true });
  fs.mkdirSync(path.join(src, 'images'), { recursive: true });
  const xml = [
    '<Levels>',
    '<Graphics id="foo" image="foo" curve="foopath" dispname="Foo" gx="10" gy="20">',
    '<BackgroundAlpha image="foo01" x="0" y="0" vx=1 vy=0 />',
    '</Graphics>',
    '<Settings id="lvl11" speed=".5" />',
    '</Levels>',
  ].join('\n');
  fs.writeFileSync(path.join(src, 'levels', 'levels.xml'), Buffer.from(xml, 'latin1'));
  // Same stem as the level id: the old importer picked this up as the "background".
  fs.writeFileSync(path.join(lvl, 'foo.dat'), Buffer.from([0x43, 0x55, 0x52, 0x56, 1, 2, 3]));
  fs.writeFileSync(path.join(lvl, 'Foo.jpg'), Buffer.from('BG-640x480'));
  fs.writeFileSync(path.join(lvl, '_foo01.gif'), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
  fs.writeFileSync(path.join(src, 'levels', 'perm_thumbnails', 'foo.jpg'), Buffer.from('THUMB'));
  fs.writeFileSync(path.join(src, 'sounds', 'fireball1.ogg'), Buffer.from('not really vorbis'));
  return { root, src };
}

const walkStrings = (value, acc = []) => {
  if (typeof value === 'string') acc.push(value);
  else if (Array.isArray(value)) value.forEach(v => walkStrings(v, acc));
  else if (value && typeof value === 'object') Object.values(value).forEach(v => walkStrings(v, acc));
  return acc;
};

test('importer keeps the full-size background, stores the thumbnail as thumb.jpg and writes manifest format 2', () => {
  const { root, src } = makeOriginal();
  try {
    const out = path.join(root, 'pack');
    const pack = importOriginal(src, out, { transcode: false });
    const g = pack.graphics.foo;
    assert.equal(g.background, 'levels/foo/foo.jpg');
    assert.equal(fs.readFileSync(path.join(out, g.background), 'utf8'), 'BG-640x480', 'background must not be overwritten by the thumbnail');
    assert.equal(g.thumbnail, 'levels/foo/thumb.jpg');
    assert.equal(fs.readFileSync(path.join(out, g.thumbnail), 'utf8'), 'THUMB');
    assert.equal(g.layers.foo01.alpha, 'levels/foo/_foo01.gif');
    assert.equal(g.layers.foo01.color, null);
    for (const s of walkStrings(g)) assert.ok(!/\.dat$/i.test(s), `curve file leaked into graphics: ${s}`);
    assert.ok(!fs.existsSync(path.join(out, 'levels', 'foo', 'foo.dat')), '.dat must not be copied as an image');
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'sounds', 'manifest.json'), 'utf8'));
    assert.deepEqual(manifest, { format: 2, sounds: { fire: ['ogg'] } });
    assert.deepEqual(pack.sounds, ['fire']);
    assert.ok(fs.existsSync(path.join(out, 'sounds', 'fire.ogg')));
    assert.ok(!fs.existsSync(path.join(out, 'sounds', 'fire.m4a')), 'transcode: false must not produce m4a');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('importer degrades gracefully when a sound cannot be transcoded (with or without ffmpeg)', () => {
  const { root, src } = makeOriginal();
  try {
    const out = path.join(root, 'pack2');
    const pack = importOriginal(src, out, { transcode: true });
    const manifest = JSON.parse(fs.readFileSync(path.join(out, 'sounds', 'manifest.json'), 'utf8'));
    assert.equal(manifest.format, 2);
    assert.deepEqual(manifest.sounds.fire, ['ogg'], 'undecodable ogg keeps the ogg-only entry');
    assert.ok(!fs.existsSync(path.join(out, 'sounds', 'fire.m4a')), 'partial m4a must be removed');
    assert.deepEqual(pack.sounds, ['fire']);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});
