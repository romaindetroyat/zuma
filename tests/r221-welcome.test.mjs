import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { importOriginal, FONTS } from '../tools/import-original.mjs';

/**
 * R2.0.21 — écran d'accueil de l'original (recherche 06 Q1, D-01, D-05, D-11): importer of the menu / adventure /
 * ending pictures, pure geometry and animations of the main menu (sky, sun glow, eyes, stones, hover sounds, UFO),
 * dialogs (name, continue), OPTIONS out of game and the source locks of the wiring in main.js / audio.js / render.js.
 */
const read = file => fs.readFileSync(file, 'utf8');
const GIF = Buffer.from([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]);
const JPG = Buffer.from([0xff, 0xd8, 0xff, 0xe0]);

function makeMenuOriginal() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-import-r221-'));
  const src = path.join(root, 'original');
  fs.mkdirSync(path.join(src, 'levels'), { recursive: true });
  fs.mkdirSync(path.join(src, 'images'), { recursive: true });
  fs.writeFileSync(path.join(src, 'levels', 'levels.xml'), Buffer.from('<Levels>\n</Levels>', 'latin1'));
  const images = {
    'mmsky.jpg': JPG, 'mmARCADEBUTTON.jpg': JPG, '_mmARCADEBUTTON.gif': GIF, '_mmsunglow.jpg': JPG, '_mmeyemask.gif': GIF,
    'advdoor1A.jpg': JPG, '_advdoor1A.gif': GIF, 'happyending.jpg': JPG,
  };
  for (const [name, bytes] of Object.entries(images)) fs.writeFileSync(path.join(src, 'images', name), bytes);
  return { root, src };
}

test('importer: main menu, adventure and ending pictures (lower-case keys, masks included), absent ones omitted', () => {
  const { root, src } = makeMenuOriginal();
  try {
    const out = path.join(root, 'pack');
    const pack = importOriginal(src, out, { transcode: false });
    for (const key of ['mmsky', 'mmarcadebutton', '_mmarcadebutton', '_mmsunglow', '_mmeyemask', 'advdoor1a', '_advdoor1a', 'happyending']) {
      assert.ok(pack.images[key], `${key} imported`);
      assert.ok(fs.existsSync(path.join(out, pack.images[key])), `${key} copied`);
    }
    assert.equal(pack.images._mmsunglow, 'images/_mmsunglow.jpg', 'the glow mask is a JPEG and keeps its extension');
    assert.equal(pack.images.mmufo, undefined, 'a picture absent from the tree is simply omitted');
    assert.equal(pack.images.mmhat, undefined, 'the hat is never imported (it depends on the Gauntlet)');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('importer: the welcome / adventure / ending fonts are in FONTS and the picture list names every screen piece', () => {
  for (const font of ['NativeAlienExtended16', 'NativeAlien48', 'Cancun8']) assert.ok(FONTS.includes(font), font);
  const src = read('tools/import-original.mjs');
  for (const name of [
    'mmsky', '_mmscreen', 'mmsun', '_mmsun', '_mmsunglow', 'mmeyeleft', '_mmeyeleft', 'mmeyeright', '_mmeyeright', '_mmeyemask',
    'mmUFO', '_mmUFO', 'mmARCADEBUTTON', '_mmARCADEBUTTON', 'mmGAUNTLETBUTTON', '_mmGAUNTLETBUTTON', 'mmOPTIONSBUTTON', '_mmOPTIONSBUTTON',
    'mmMOREGAMESBUTTON', '_mmMOREGAMESBUTTON', 'mmQUITBUTTON', '_mmQUITBUTTON',
    'advsky', 'advback', '_advback', 'advmiddle', '_advmiddle', 'advtemple1', 'advtemple4', 'advtemple2v', '_advtemple3v',
    'advdoor1A', 'advdoor4C', '_advdoor4C', 'advTitle', '_advTitle', 'advHighscore', '_advHighscore', 'advstage',
    'advplaybutton', '_advplaybutton', 'advmainmenubutton', '_advmainmenubutton', 'happyending',
  ]) assert.match(src, new RegExp(`'${name}'`), name);
  assert.doesNotMatch(src, /'mmhat'/, 'no hat');
});
