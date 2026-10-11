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

// ---------------------------------------------------------------- pure geometry and animations (Q1, 0x43d1a0)
const W = () => import('../.compiled/welcome.js');
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps;

test('MM.stones: ids, pack keys, positions (0x43cf60), one-state sizes, hover semitones (0x434dd1), only Aventure / Options enabled', async () => {
  const { MM } = await W();
  assert.deepEqual(MM.stones.map(s => [s.id, s.image, s.x, s.y, s.w, s.h, s.semitones, s.enabled]), [
    ['adventure', 'mmarcadebutton', 452, 64, 163, 92, 12, true],
    ['gauntlet', 'mmgauntletbutton', 436, 153, 180, 83, 14, false],
    ['options', 'mmoptionsbutton', 418, 236, 203, 74, 10, true],
    ['moregames', 'mmmoregamesbutton', 406, 306, 209, 83, -2, false],
    ['quit', 'mmquitbutton', 394, 372, 220, 100, 5, false],
  ]);
  assert.deepEqual(MM.sky, { w: 520, h: 161, pxPerMaj: 0.125 });
  assert.deepEqual(MM.glow, { x: -69, y: -63, w: 229, h: 227, degPerMaj: 0.3, period: 500, min: 75, max: 150 });
  assert.deepEqual(MM.sun, { x: 0, y: 2 });
  assert.deepEqual(MM.eyes.left, { x: 219, y: 368, w: 21, h: 21 });
  assert.deepEqual(MM.eyes.right, { x: 276, y: 355, w: 14, h: 17 });
  assert.deepEqual(MM.eyeMask, { x: 191, y: 331, w: 105, h: 54 });
  assert.deepEqual(MM.frog, { x: 63, y: 276, w: 265, h: 195 });
  assert.deepEqual(MM.welcome, { cx: 320, baseline: 32 });
  assert.equal(MM.ufo.w, 175);
  assert.equal(MM.ufo.h, 84);
  assert.equal(MM.ufo.frames, 6);
});

test('mmSkyOffset: (c >> 3) mod 520, 12.5 px/s to the right; non-finite → 0', async () => {
  const { mmSkyOffset } = await W();
  assert.equal(mmSkyOffset(0), 0);
  assert.equal(mmSkyOffset(7), 0);
  assert.equal(mmSkyOffset(8), 1);
  assert.equal(mmSkyOffset(8 * 520), 0);
  assert.equal(mmSkyOffset(8 * 521), 1);
  assert.equal(mmSkyOffset(100), 12, '100 maj = 1 s → 12.5 px');
  assert.equal(mmSkyOffset(NaN), 0);
  assert.equal(mmSkyOffset(Infinity), 0);
  assert.ok(mmSkyOffset(-9) >= 0 && mmSkyOffset(-9) < 520, 'never negative');
});

test('mmGlow: alpha triangle 75 → 150 → 75 over 500 maj, rotation 0.3° per maj', async () => {
  const { mmGlow } = await W();
  assert.ok(near(mmGlow(0).alpha, 75 / 255));
  assert.equal(mmGlow(0).angle, 0);
  assert.ok(near(mmGlow(250).alpha, 150 / 255));
  assert.ok(near(mmGlow(500).alpha, 75 / 255));
  assert.ok(near(mmGlow(125).alpha, (75 + 37) / 255), '⌊75 × 125 / 250⌋ = 37');
  assert.ok(near(mmGlow(375).alpha, (75 + 37) / 255), 'folded beyond 250');
  assert.ok(near(mmGlow(100).angle, (30 * Math.PI) / 180), '30° after 1 s');
  for (let c = 0; c < 2000; c += 7) {
    const { alpha, angle } = mmGlow(c);
    assert.ok(alpha >= 75 / 255 - 1e-12 && alpha <= 150 / 255 + 1e-12, `alpha at ${c}`);
    assert.ok(Number.isFinite(angle) && angle >= 0 && angle < 2 * Math.PI, `angle at ${c}`);
  }
  assert.ok(near(mmGlow(NaN).alpha, 75 / 255));
});

test('mmEyes: rest centres (219, 368) / (276, 355); follow = rest + 4 px towards the target inside the 6 × 4 ellipse (A8)', async () => {
  const { mmEyes } = await W();
  const rest = { left: { x: 219, y: 368 }, right: { x: 276, y: 355 } };
  assert.deepEqual(mmEyes('rest', null), rest);
  assert.deepEqual(mmEyes('rest', { x: 640, y: 0 }), rest, 'rest ignores the target');
  assert.deepEqual(mmEyes('follow', null), rest);
  assert.deepEqual(mmEyes('follow', { x: 640, y: 368 }).left, { x: 223, y: 368 });
  const up = mmEyes('follow', { x: 219, y: 300 }).left;
  assert.ok(near(up.x, 219) && near(up.y, 364), 'straight up → 4 px (the ellipse bound)');
  assert.deepEqual(mmEyes('follow', { x: 219, y: 368 }).left, rest.left, 'target on the centre → rest');
  for (const t of [{ x: 0, y: 0 }, { x: 640, y: 480 }, { x: 230, y: 360 }, { x: -1e6, y: 3 }, { x: 276, y: 1e6 }]) {
    const e = mmEyes('follow', t);
    for (const side of ['left', 'right']) {
      const dx = e[side].x - rest[side].x;
      const dy = e[side].y - rest[side].y;
      assert.ok(Math.abs(dx) <= 6 + 1e-9 && Math.abs(dy) <= 4 + 1e-9, `${side} bounded for ${JSON.stringify(t)}`);
      assert.ok((dx / 6) ** 2 + (dy / 4) ** 2 <= 1 + 1e-9, 'inside the ellipse');
    }
  }
  assert.deepEqual(mmEyes('follow', { x: NaN, y: 1 }), rest, 'non-finite target → rest');
});

test('mmHoverSequence: stones 0..4 in order three times launch the UFO on the third pass over 4; a skip resets the expectation, keeps the laps', async () => {
  const { mmHoverSequence } = await W();
  let seq = { expect: 0, laps: 0 };
  const launches = [];
  for (let lap = 0; lap < 3; lap++) {
    for (let i = 0; i < 5; i++) {
      const r = mmHoverSequence(seq, i);
      seq = r.seq;
      launches.push(r.launch);
    }
  }
  assert.deepEqual(launches.map((l, i) => (l ? i : -1)).filter(i => i >= 0), [14], 'launch only on the 15th entry');
  assert.deepEqual(seq, { expect: 0, laps: 0 }, 'counter reset after a launch');
  // One lap, then 0 → 2 (skip): expectation back to 0, the lap kept.
  seq = { expect: 0, laps: 0 };
  for (let i = 0; i < 5; i++) seq = mmHoverSequence(seq, i).seq;
  assert.deepEqual(seq, { expect: 0, laps: 1 });
  seq = mmHoverSequence(seq, 0).seq;
  seq = mmHoverSequence(seq, 2).seq;
  assert.deepEqual(seq, { expect: 0, laps: 1 }, 'skip: expectation reset, laps kept');
  assert.deepEqual(mmHoverSequence({ expect: 3, laps: 2 }, 0).seq, { expect: 1, laps: 2 }, 'an out-of-order 0 starts a new pass');
  assert.deepEqual(mmHoverSequence({ expect: 2, laps: 1 }, 9).seq, { expect: 0, laps: 1 }, 'unknown stone = skip');
});

test('mmUfo: idle; in (−50, −50) → (300, 210) in 300 maj; hover 1 000 maj on x = 300 + 40 sin a, y = 210 − 15 cos a; out to (−200, −200) in 50; wait 100; idle', async () => {
  const { mmUfo } = await W();
  const idle = { phase: 'idle', t0: 0 };
  const r0 = mmUfo(idle, 1234);
  assert.equal(r0.visible, false);
  assert.equal(r0.sound, false);
  assert.equal(r0.next, idle, 'idle stays the same object');
  const c0 = 1000;
  const launched = { phase: 'in', t0: c0 };
  const a = mmUfo(launched, c0);
  assert.deepEqual([a.x, a.y, a.visible, a.sound], [-50, -50, true, true]);
  const mid = mmUfo(launched, c0 + 150);
  assert.deepEqual([mid.x, mid.y], [125, 80], 'midway');
  const arrive = mmUfo(launched, c0 + 300);
  assert.deepEqual([arrive.x, arrive.y], [300, 210]);
  assert.deepEqual(arrive.next, { phase: 'hover', t0: c0 + 300 });
  const h = mmUfo(arrive.next, c0 + 390);
  assert.ok(near(h.x, 300 + 40 * Math.sin(Math.PI / 2)) && near(h.y, 210 - 15 * Math.cos(Math.PI / 2)), 'a = 90° after 90 maj');
  assert.equal(h.sound, true);
  const leave = mmUfo(h.next, c0 + 1300);
  assert.equal(leave.next.phase, 'out');
  assert.equal(leave.next.t0, c0 + 1300);
  const gone = mmUfo(leave.next, c0 + 1350);
  assert.deepEqual([gone.x, gone.y], [-200, -200]);
  assert.deepEqual(gone.next, { phase: 'wait', t0: c0 + 1350 });
  const waiting = mmUfo(gone.next, c0 + 1400);
  assert.equal(waiting.visible, false);
  assert.equal(waiting.sound, true, 'the loop keeps playing during the wait');
  const done = mmUfo(waiting.next, c0 + 1450);
  assert.equal(done.next.phase, 'idle');
  assert.equal(done.sound, false);
  assert.equal(done.visible, false);
  // A long jump walks every phase at once (a background tab).
  assert.equal(mmUfo(launched, c0 + 99999).next.phase, 'idle');
  // Frame (c >> 1) mod 5.
  assert.deepEqual([0, 1, 2, 3, 9, 10, 11].map(c => mmUfo(launched, c0 + c).frame), [0, 0, 1, 1, 4, 0, 0].map((f, i) => Math.floor((c0 + [0, 1, 2, 3, 9, 10, 11][i]) / 2) % 5));
  assert.equal(mmUfo(launched, NaN).visible, false, 'non-finite counter → nothing drawn');
});

test('welcomeHit: stone boxes (masks not consulted), the frog, the welcome line, else null', async () => {
  const { welcomeHit } = await W();
  assert.equal(welcomeHit(452 + 80, 64 + 46, 300), 'adventure');
  assert.equal(welcomeHit(436 + 90, 153 + 40, 300), 'gauntlet', 'disabled stones are still located (hover sequence)');
  assert.equal(welcomeHit(418 + 100, 236 + 37, 300), 'options');
  assert.equal(welcomeHit(406 + 100, 306 + 40, 300), 'moregames');
  assert.equal(welcomeHit(394 + 110, 372 + 60, 300), 'quit');
  assert.equal(welcomeHit(100, 400, 300), 'frog');
  assert.equal(welcomeHit(63, 276, 300), 'frog');
  assert.equal(welcomeHit(328, 300, 300), null, 'x 328 is outside [63, 328)');
  assert.equal(welcomeHit(320, 28, 300), 'welcome-line');
  assert.equal(welcomeHit(165, 28, 300), null, 'beyond the line width');
  assert.equal(welcomeHit(20, 470, 300), null);
  assert.equal(welcomeHit(NaN, 3, 300), null);
});

test('bundle: welcome after progress in MODULES, precached by the worker shell, copied to dist/js, no DOM at module level', () => {
  assert.match(read('tools/build.mjs'), /'progress', 'welcome', 'main'/);
  assert.match(read('public/sw.js'), /'\.\/js\/progress\.js', '\.\/js\/welcome\.js', '\.\/js\/main\.js'/);
  assert.ok(fs.existsSync('dist/js/welcome.js'));
  const src = read('.compiled/welcome.js');
  assert.doesNotMatch(src, /^[^\s}][^\n(]*\b(document|window)\./m, 'no top-level DOM access');
  assert.doesNotMatch(src, /localStorage/, 'no storage in the drawing module');
  assert.doesNotMatch(src, /innerHTML/);
});
