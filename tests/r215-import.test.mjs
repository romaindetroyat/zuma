import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importOriginal, SOUND_MAP, FONTS } from '../tools/import-original.mjs';
import { BANNED } from '../tools/guard.mjs';

/**
 * R2.0.15 — importer lock for the native STATS / game texts: bitmap fonts (latin1 scripts
 * re-encoded in UTF-8 + glyph pictures), original strings from properties/default.xml
 * (UTF-16 LE with BOM) and the three new sound keys. The publication guard must refuse
 * any tracked `fonts/` picture or script.
 */
function makeOriginal({ fonts = true, properties = true } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-import-r215-'));
  const src = path.join(root, 'original');
  const lvl = path.join(src, 'levels', 'foo');
  fs.mkdirSync(lvl, { recursive: true });
  fs.mkdirSync(path.join(src, 'sounds'), { recursive: true });
  fs.mkdirSync(path.join(src, 'images'), { recursive: true });
  const xml = '<Levels>\n<Graphics id="foo" image="foo" curve="foopath" dispname="Foo" gx="10" gy="20">\n</Graphics>\n</Levels>';
  fs.writeFileSync(path.join(src, 'levels', 'levels.xml'), Buffer.from(xml, 'latin1'));
  fs.writeFileSync(path.join(lvl, 'Foo.jpg'), Buffer.from('BG'));
  fs.writeFileSync(path.join(src, 'sounds', 'pop.ogg'), Buffer.from('not really vorbis'));
  if (fonts) {
    fs.mkdirSync(path.join(src, 'fonts'), { recursive: true });
    // latin1: 'É' is the single byte 0xC9.
    const script = "Define CharList ('A', 'É');\nCreateLayer Main;\nLayerSetImage Main 'Foo12';\n";
    fs.writeFileSync(path.join(src, 'fonts', 'Foo12.txt'), Buffer.from(script, 'latin1'));
    fs.writeFileSync(path.join(src, 'fonts', '_Foo12.gif'), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
    // A font with both a colour picture and a mask.
    fs.writeFileSync(path.join(src, 'fonts', 'Bar18.txt'), Buffer.from("CreateLayer Main;\nLayerSetImage Main 'Bar18';\n", 'latin1'));
    fs.writeFileSync(path.join(src, 'fonts', 'Bar18.gif'), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
    fs.writeFileSync(path.join(src, 'fonts', '_Bar18.gif'), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
    // A picture without a script must not be registered.
    fs.writeFileSync(path.join(src, 'fonts', '_Orphan8.gif'), Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]));
  }
  if (properties) {
    fs.mkdirSync(path.join(src, 'properties'), { recursive: true });
    const body = [
      '<?xml version="1.0" encoding="UTF-16"?>',
      '<ResourceManifest>',
      '<StringTable>',
      '<String id="STRING_ID_STATS">STATISTIQUES</String>',
      '<String id="STRING_ID_COINS">PIÈCES</String>',
      '<String id="STRING_ID_QUIT_THE_GAME_?">Voulez-vous vraiment&cr;quitter la partie ?</String>',
      '<String id="DIALOG_BUTTON_OK">OK</String>',
      '</StringTable>',
      '</ResourceManifest>',
    ].join('\r\n');
    fs.writeFileSync(path.join(src, 'properties', 'default.xml'), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(body, 'utf16le')]));
  }
  return { root, src };
}

test('importer copies font scripts (latin1 → UTF-8) and pictures, and extracts the original strings', () => {
  const { root, src } = makeOriginal();
  try {
    const out = path.join(root, 'pack');
    const pack = importOriginal(src, out, { transcode: false, fonts: ['Foo12', 'Bar18', 'Missing9'] });
    assert.deepEqual(pack.fonts.foo12, { script: 'fonts/foo12.txt', image: null, mask: 'fonts/_foo12.gif' });
    assert.deepEqual(pack.fonts.bar18, { script: 'fonts/bar18.txt', image: 'fonts/bar18.gif', mask: 'fonts/_bar18.gif' });
    assert.deepEqual(Object.keys(pack.fonts).sort(), ['bar18', 'foo12'], 'no entry without a script');
    const script = fs.readFileSync(path.join(out, 'fonts', 'foo12.txt'), 'utf8');
    assert.ok(script.includes("'É'"), `latin1 É must be re-encoded in UTF-8, got ${JSON.stringify(script)}`);
    assert.ok(fs.existsSync(path.join(out, 'fonts', '_foo12.gif')));
    assert.ok(!fs.existsSync(path.join(out, 'fonts', '_orphan8.gif')), 'pictures of unknown fonts are not copied');
    assert.equal(pack.strings, 'strings.json');
    const strings = JSON.parse(fs.readFileSync(path.join(out, 'strings.json'), 'utf8'));
    assert.deepEqual(strings, {
      STATS: 'STATISTIQUES',
      COINS: 'PIÈCES',
      'QUIT_THE_GAME_?': 'Voulez-vous vraiment&cr;quitter la partie ?',
      DIALOG_BUTTON_OK: 'OK',
    });
    assert.deepEqual(pack.sounds, ['swap', 'pop'], 'pop.ogg serves both the swap and the pop key');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('importer uses the default FONTS list and survives a tree without fonts/ or properties/', () => {
  const { root, src } = makeOriginal({ fonts: false, properties: false });
  try {
    const out = path.join(root, 'pack');
    const pack = importOriginal(src, out, { transcode: false });
    assert.deepEqual(pack.fonts, {});
    assert.equal(pack.strings, null);
    assert.ok(!fs.existsSync(path.join(out, 'strings.json')));
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
  assert.deepEqual(FONTS, ['NativeAlienExtended18', 'Cancun12', 'Cancun10', 'Arial12Bold', 'CancunFloat14']);
});

test('sound map carries the coin and stats cues', () => {
  assert.equal(SOUND_MAP.coinappear, 'jewelappear');
  assert.equal(SOUND_MAP.coinvanish, 'gemvanishes');
  assert.equal(SOUND_MAP.pop, 'pop');
  assert.equal(SOUND_MAP.coin, 'coingrab');
  assert.equal(SOUND_MAP.bonuspop, 'endoflevelpop1');
  assert.equal(SOUND_MAP.button, 'button1');
});

test('publication guard bans tracked font pictures and scripts', () => {
  const refuses = f => BANNED.some(re => re.test(f));
  assert.ok(refuses('fonts/cancun12.txt'));
  assert.ok(refuses('fonts/_Cancun12.gif'));
  assert.ok(refuses('private_assets/pack/fonts/x.txt'));
  assert.ok(refuses('public/images/foo.png'));
  assert.ok(refuses('sounds/pop.ogg'));
  assert.ok(!refuses('src/bitmapfont.ts'));
  assert.ok(!refuses('tests/r215-font.test.mjs'));
  assert.ok(!refuses('R215_RELEASE_NOTES.md'));
  assert.ok(!refuses('public/manifest.json'));
});
