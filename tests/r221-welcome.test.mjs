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
  assert.match(read('tools/build.mjs'), /'progress', 'records', 'welcome', 'adventure', 'main'/); // R2.0.22: records after progress (plan 06.1-01); R2.0.21 (D-02/D-03): adventure after welcome (plan 06-04)
  assert.match(read('public/sw.js'), /'\.\/js\/progress\.js', '\.\/js\/records\.js', '\.\/js\/welcome\.js', '\.\/js\/adventure\.js', '\.\/js\/main\.js'/); // R2.0.22: records after progress (plan 06.1-01); R2.0.21 (D-02/D-03): adventure after welcome (plan 06-04)
  assert.ok(fs.existsSync('dist/js/welcome.js'));
  const src = read('.compiled/welcome.js');
  assert.doesNotMatch(src, /^[^\s}][^\n(]*\b(document|window)\./m, 'no top-level DOM access');
  assert.doesNotMatch(src, /localStorage/, 'no storage in the drawing module');
  assert.doesNotMatch(src, /innerHTML/);
});

// ---------------------------------------------------------------- composition: welcome, dialogs, OPTIONS out of game, drawScene
/** Canvas 2D stand-in that records every call and property write (Node has no canvas). */
function recorder() {
  const calls = [];
  const state = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, imageSmoothingEnabled: true };
  const stack = [];
  const ctx = new Proxy({}, {
    get(_t, prop) {
      if (prop === 'calls') return calls;
      if (prop in state) return state[prop];
      if (prop === 'save') return () => { stack.push({ ...state }); calls.push({ op: 'save' }); };
      if (prop === 'restore') return () => { Object.assign(state, stack.pop() ?? {}); calls.push({ op: 'restore' }); };
      if (prop === 'measureText') return s => ({ width: String(s).length * 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push({ op: prop, args, composite: state.globalCompositeOperation, alpha: state.globalAlpha }); };
    },
    set(_t, prop, value) {
      state[prop] = value;
      calls.push({ op: 'set', prop, value });
      return true;
    },
  });
  return ctx;
}
const pic = (name, width, height) => ({ name, width, height });
function fakeKit(pixelScale = 1) {
  const k = pixelScale;
  return {
    sky: pic('sky', 520 * k, 161 * k), back: pic('back', 640 * k, 480 * k), eyeLeft: pic('eyeLeft', 21 * k, 21 * k), eyeRight: pic('eyeRight', 14 * k, 17 * k),
    eyeLids: pic('eyeLids', 105 * k, 54 * k), glow: pic('glow', 229 * k, 227 * k), sun: pic('sun', 87 * k, 92 * k),
    stones: {
      adventure: pic('adventure', 489 * k, 92 * k), gauntlet: pic('gauntlet', 540 * k, 83 * k), options: pic('options', 609 * k, 74 * k),
      moregames: pic('moregames', 627 * k, 83 * k), quit: pic('quit', 660 * k, 100 * k),
    },
    ufo: pic('ufo', 175 * k, 504 * k), font: null, dialog: null, pixelScale,
  };
}
const baseView = { c: 0, hover: null, pressed: null, focus: null, eyes: 'rest', target: null, ufo: { phase: 'idle', t0: 0 }, name: 'Romain', strings: null };
const images = ctx => ctx.calls.filter(c => c.op === 'drawImage');

test('drawWelcome: 0x43d1a0 order — sky ×3, back, pupils, lids, additive glow, sun, stones (column = state; inactive always 0), UFO last', async () => {
  const { drawWelcome, MM } = await W();
  const ctx = recorder();
  drawWelcome(ctx, fakeKit(), { ...baseView, c: 16, hover: 'gauntlet', pressed: 'options', focus: null });
  const order = images(ctx).map(c => c.args[0].name);
  assert.deepEqual(order.slice(0, 4), ['sky', 'sky', 'sky', 'back'], 'the sky is drawn before the holed screen');
  assert.deepEqual(order.slice(4, 9), ['eyeLeft', 'eyeRight', 'eyeLids', 'glow', 'sun']);
  assert.deepEqual(order.slice(9), ['adventure', 'gauntlet', 'options', 'moregames', 'quit'], 'no UFO while idle');
  const sky = images(ctx).slice(0, 3).map(c => c.args[1]);
  assert.deepEqual(sky, [2 - 520, 2, 2 + 520], 'o = (16 >> 3) mod 520 = 2');
  const glow = images(ctx).find(c => c.args[0].name === 'glow');
  assert.equal(glow.composite, 'lighter', 'additive glow');
  assert.equal(glow.alpha, (await W()).mmGlow(16).alpha, 'glow alpha from mmGlow');
  const col = name => images(ctx).find(c => c.args[0].name === name).args[1];
  const stone = id => MM.stones.find(s => s.id === id);
  assert.equal(col('gauntlet'), 0, 'a disabled stone ignores the hover');
  assert.equal(col('options'), 2 * stone('options').w, 'pressed = column 2');
  assert.equal(col('adventure'), 0);
  const eyeLeft = images(ctx).find(c => c.args[0].name === 'eyeLeft');
  assert.deepEqual(eyeLeft.args.slice(1), [219 - 10.5, 368 - 10.5, 21, 21], 'pupil centred on its rest position');
  const lids = images(ctx).find(c => c.args[0].name === 'eyeLids');
  assert.deepEqual(lids.args.slice(1, 3), [191, 331]);
  const sun = images(ctx).find(c => c.args[0].name === 'sun');
  assert.deepEqual(sun.args.slice(1, 3), [0, 2]);
});

test('drawWelcome: focus lights an enabled stone (column 1); a 2 × kit is cut at 2 × and drawn at the logical size; the UFO frame follows mmUfo', async () => {
  const { drawWelcome, mmUfo } = await W();
  const ctx = recorder();
  const ufo = { phase: 'in', t0: 0 };
  drawWelcome(ctx, fakeKit(2), { ...baseView, c: 150, focus: 'adventure', ufo });
  const adv = images(ctx).find(c => c.args[0].name === 'adventure');
  assert.deepEqual(adv.args.slice(1), [163 * 2, 0, 163 * 2, 92 * 2, 452, 64, 163, 92]);
  const u = images(ctx).at(-1);
  assert.equal(u.args[0].name, 'ufo', 'the UFO is drawn last');
  const at = mmUfo(ufo, 150);
  assert.deepEqual(u.args.slice(1), [0, at.frame * 84 * 2, 175 * 2, 84 * 2, at.x, at.y, 175, 84]);
  const back = images(ctx).find(c => c.args[0].name === 'back');
  assert.deepEqual(back.args.slice(1), [0, 0, 640, 480]);
});

test('drawWelcome: kit null → vector welcome with the same zones (title, readable Aventure / Options, others greyed), never throws', async () => {
  const { drawWelcome } = await W();
  const ctx = recorder();
  assert.doesNotThrow(() => drawWelcome(ctx, null, baseView));
  const texts = ctx.calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(texts.includes('Zuma'), 'title');
  assert.ok(texts.some(t => /AVENTURE/i.test(t)) && texts.some(t => /OPTIONS/i.test(t)), texts.join(' | '));
  assert.ok(texts.some(t => t === 'Bienvenue dans Zuma, Romain!'), 'welcome line');
  assert.doesNotThrow(() => drawWelcome(recorder(), null, { ...baseView, c: NaN, name: null }));
});

test('welcome line: WELCOME_TO_ZUMA + « , » + name + « ! » (original concatenation), without a profile « Bienvenue dans Zuma ! »', async () => {
  const { welcomeLine } = await W();
  assert.equal(welcomeLine({ WELCOME_TO_ZUMA: 'Bienvenue dans Zuma' }, 'Romain'), 'Bienvenue dans Zuma, Romain!');
  assert.equal(welcomeLine(null, 'Romain'), 'Bienvenue dans Zuma, Romain!');
  assert.equal(welcomeLine(null, null), 'Bienvenue dans Zuma !');
});

test('menuWidgets: OPTIONS out of game (0x445310, inGame = 0) — no « Retour au menu principal », footer DONE « Terminé », Aide kept; default unchanged', async () => {
  const { menuWidgets } = await import('../.compiled/menudialog.js');
  const out = menuWidgets('menu', null, { inGame: false });
  assert.ok(!out.some(w => w.id === 'main-menu'));
  const back = out.find(w => w.id === 'back');
  assert.equal(back.label, 'Terminé');
  assert.equal(menuWidgets('menu', { DONE: 'Fini' }, { inGame: false }).find(w => w.id === 'back').label, 'Fini', 'pack string DONE');
  assert.ok(out.some(w => w.id === 'help'));
  assert.deepEqual(menuWidgets('menu', null), menuWidgets('menu', null, { inGame: true }), 'inGame defaults to true');
  assert.ok(menuWidgets('menu', null).some(w => w.id === 'main-menu'));
  assert.equal(menuWidgets('menu', null).find(w => w.id === 'back').label, 'Retour à la partie');
  const src = read('.compiled/menudialog.js');
  assert.match(src, /options\?\.inGame === false/, 'composeMenuDialog reads options.inGame for the title');
  assert.match(src, /'OPTIONS'/);
});

test('name / continue dialogs: widgets inside the menu frame; Continuer left, Rejouer right with the confirm width', async () => {
  const { nameDialogWidgets, continueDialogWidgets } = await W();
  const { MENU_LAYOUT } = await import('../.compiled/menudialog.js');
  const F = MENU_LAYOUT.frame;
  const inside = r => r.x >= F.x && r.y >= F.y && r.x + r.w <= F.x + F.w && r.y + r.h <= F.y + F.h;
  const name = nameDialogWidgets(null);
  assert.deepEqual(name.map(w => w.id), ['name-field', 'name-ok']);
  assert.equal(name[1].label, 'OK');
  for (const w of name) assert.ok(inside(w.rect), `${w.id} inside the frame`);
  const strings = { SM_CONTINUE: 'Continuer', NEW_GAME: 'Rejouer' };
  const cont = continueDialogWidgets(strings);
  assert.deepEqual(cont.map(w => [w.id, w.label]), [['continue', 'Continuer'], ['new-game', 'Rejouer']]);
  assert.ok(cont[0].rect.x < cont[1].rect.x, 'Continuer on the left');
  for (const w of cont) {
    assert.equal(w.rect.w, MENU_LAYOUT.confirm.buttonW);
    assert.ok(inside(w.rect));
  }
  assert.deepEqual(continueDialogWidgets(null).map(w => w.label), ['Continuer', 'Rejouer'], 'fallbacks');
});

test('prompt texts: &cr; of the continue question removed; the profile text wrapped inside the content width', async () => {
  const { welcomePromptLayout } = await W();
  const { MENU_LAYOUT } = await import('../.compiled/menudialog.js');
  const strings = {
    'DO_YOU_WANT_TO_CONTINUE_YOUR_LAST_GAME_?': 'Voulez-vous continuer la dernière partie ?&cr;&cr;&cr;&cr;',
    ENTER_YOUR_NAME_TO_CREATE_A_NEW_USER_PROFILE: "Entrez votre nom pour créer un nouveau profil d'utilisateur, afin de sauvegarder vos records et votre progression.",
    NEW_USER: 'NOUVEL UTILISATEUR', RENAME_USER: "RENOMMER L'UTILISATEUR", 'CONTINUE_?': 'CONTINUER ?',
  };
  const measure = s => s.length * 7;
  const cont = welcomePromptLayout('continue', strings, measure);
  assert.equal(cont.title, 'CONTINUER ?');
  assert.deepEqual(cont.lines, ['Voulez-vous continuer la dernière partie ?']);
  assert.ok(cont.lines.every(l => !l.includes('&cr;')));
  const name = welcomePromptLayout('name', strings, measure);
  assert.equal(name.title, 'NOUVEL UTILISATEUR');
  assert.ok(name.lines.length >= 3, 'wrapped');
  assert.ok(name.lines.every(l => measure(l) <= MENU_LAYOUT.content.w), 'inside the content width');
  assert.equal(welcomePromptLayout('rename', strings, measure).title, "RENOMMER L'UTILISATEUR");
  assert.equal(welcomePromptLayout('name', null, measure).title, 'NOUVEL UTILISATEUR', 'fallback');
});

test('drawNameDialog / drawContinueDialog: vector fallback without a kit, the typed name drawn on the canvas, caret only when asked', async () => {
  const { drawNameDialog, drawContinueDialog } = await W();
  const ctx = recorder();
  drawNameDialog(ctx, null, { kind: 'name', text: 'Romain', caret: true, hover: null, pressed: null, focus: 'name-ok' }, null);
  const texts = ctx.calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(texts.includes('Romain'), 'typed name on the canvas');
  assert.ok(texts.includes('OK'));
  const noCaret = recorder();
  drawNameDialog(noCaret, null, { kind: 'name', text: 'Romain', caret: false, hover: null, pressed: null, focus: null }, null);
  assert.ok(ctx.calls.filter(c => c.op === 'fillRect').length > noCaret.calls.filter(c => c.op === 'fillRect').length, 'the caret is one more fill');
  const c2 = recorder();
  drawContinueDialog(c2, null, { kind: 'continue', text: '', caret: false, hover: 'continue', pressed: null, focus: null }, null);
  const t2 = c2.calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(t2.includes('Continuer') && t2.includes('Rejouer'));
});

test('source locks: welcome.js glow additive, no innerHTML; render.js drawScene sets the store scale then paints', () => {
  const welcome = read('.compiled/welcome.js');
  assert.match(welcome, /globalCompositeOperation = 'lighter'/);
  assert.doesNotMatch(welcome, /innerHTML|textContent/);
  assert.match(welcome, /export function drawWelcome\(ctx, kit, view\)/);
  const render = read('.compiled/render.js');
  const start = render.indexOf('    drawScene(paint) {');
  assert.ok(start > 0, 'Renderer.drawScene compiled');
  const scene = render.slice(start, render.indexOf('\n    }', start));
  const set = scene.indexOf('setTransform(this.storeScale');
  assert.ok(set > 0 && scene.indexOf('paint(') > set, 'setTransform(storeScale) then paint(ctx)');
  assert.match(scene, /restore\(\)/);
});

// ---------------------------------------------------------------- wiring in main.js / audio.js (D-01, D-11, D-12)
/** Body of a compiled method, up to the closing brace at its indentation. */
const method = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature.trim()} compiled`);
  const end = src.indexOf('\n    }', start);
  return src.slice(start, end > 0 ? end : undefined);
};

test('main.js: boot through initialApp, every transition through reduceApp, the welcome screen first (R2.0.21, D-01: the app opens on the main menu)', () => {
  const main = read('.compiled/main.js');
  assert.match(main, /initialApp\(/);
  assert.match(main, /reduceApp\(/);
  const start = method(main, '    async start() {');
  assert.doesNotMatch(start, /newGame\(\)/, 'no unconditional new game at boot');
  assert.match(main, /parseProfile\(readJson\(/);
  assert.match(main, /parseSave\(readJson\(/);
  assert.match(main, /parseScores\(readJson\(/);
  assert.match(main, /levels\.length\)/, 'stage sizes from the pack');
  const loop = method(main, '    loop(time) {');
  assert.match(loop, /drawWelcomeFrame\(time\)/);
  assert.match(method(main, '    drawWelcomeFrame(time) {'), /drawScene\([\s\S]*drawWelcome\(/, 'the welcome frame is painted through drawScene');
  const branch = loop.indexOf("screen !== 'level'");
  const engineExit = loop.indexOf('!engine');
  assert.ok(branch > 0 && engineExit > branch, 'the welcome is drawn before the engine early exit');
  // Effects: storage only through writeJson; scores stored as { adventure: scores }.
  assert.match(main, /writeJson\([^)]*SAVE_KEY/);
  assert.match(main, /writeJson\([^)]*PROFILE_KEY/);
  assert.match(main, /writeJson\([^)]*HIGHSCORE_KEY, \{ adventure: /);
  // R2.0.21 (D-02/D-03): the adventure, temple and ending screens are drawn (plan 06-04); their widgets send these events.
  assert.match(main, /kind: 'temple-done'/);
  assert.match(main, /kind: 'ending-done'/);
  assert.match(main, /kind: 'play'/);
  // The end of a level goes through the machine (saved run kept in step): won / retry / gameover / leave.
  for (const kind of ['won', 'retry', 'gameover', 'leave']) assert.match(main, new RegExp(`kind: '${kind}'`), kind);
  assert.doesNotMatch(main, /this\.progress = \{ stage: 0, level: 0 \}/, 'no wrap-around from 13-1 to 1-1');
  assert.doesNotMatch(main, /nextLevel\(|retryLevel\(|newGame\(/, 'the old lifecycle is gone');
});

test('main.js: OPTIONS out of game from the welcome, hover sounds choral at 0.2 transposed, click button1, UFO loop, keyboard on the stones', () => {
  const main = read('.compiled/main.js');
  assert.match(main, /inGame: false/);
  assert.match(main, /key: 'choral', gain: 0\.2, rate: 2 \*\* \(/);
  assert.match(main, /key: 'button', gain: 1, rate: 1/);
  assert.match(main, /setLoop\('ufo'/);
  assert.match(main, /mmHoverSequence\(/);
  assert.match(main, /welcomeHit\(/);
  assert.match(main, /mmUfo\(/);
  const keys = method(main, '    welcomeKey(code) {');
  for (const k of ['ArrowUp', 'ArrowDown', 'Tab', 'Enter', 'Space', 'Escape']) assert.match(keys, new RegExp(`'${k}'`), k);
  assert.match(main, /enabled\)/, 'disabled stones are filtered');
  // The pointer hover clears the keyboard focus (a stone left by the mouse goes dark again).
  assert.match(method(main, '    hoverStone(stone) {'), /this\.welcome\.focus = null/);
  assert.doesNotMatch(method(main, '    hoverStone(stone) {'), /this\.welcome\.focus = hover/);
});

test('main.js: the profile name is never injected into the DOM — hidden input read through sanitizeName only, canvas rendering', () => {
  const main = read('.compiled/main.js');
  assert.doesNotMatch(main, /innerHTML/);
  assert.doesNotMatch(main, /textContent\s*=[^;\n]*(profile|name|prompt)/i);
  assert.match(main, /maxLength = 16/);
  assert.match(main, /sanitizeName\([^)]*\.value\)/);
  assert.match(main, /drawNameDialog\(/);
  assert.match(main, /drawContinueDialog\(/);
});

test('main.js: platform first name (D-12) — api/me same-origin with a short timeout, never on file://, late answers → profile-detected', () => {
  const main = read('.compiled/main.js');
  assert.match(main, /fetch\('api\/me', \{[^}]*credentials: 'same-origin'/);
  assert.match(main, /PLATFORM_NAME_TIMEOUT = 1500/);
  assert.match(main, /protocol !== 'http:' && [^;]*protocol !== 'https:'/);
  assert.match(main, /kind: 'profile-detected'/);
  assert.match(main, /platformName/);
  // Only the private host has the endpoint: no request without the pack (public build) nor on a loopback host (local
  // server), where it would only log a 404 in the console.
  assert.match(main, /'localhost'[^;]*'127\.0\.0\.1'/);
  assert.match(method(main, '    async start() {'), /this\.pack \? fetchPlatformName\(\) : Promise\.resolve\(null\)/);
});

test('audio.js: the ufo loop has its own gain and is cut by stopLoops like rolling', async () => {
  const audio = read('.compiled/audio.js');
  assert.match(audio, /ufo: UFO_GAIN/);
  const { rampPlan, UFO_GAIN, ROLLING_GAIN, LOOP_KEYS } = await import('../.compiled/audio.js');
  assert.deepEqual(LOOP_KEYS, ['rolling', 'ufo']);
  assert.equal(UFO_GAIN, 0.8);
  assert.deepEqual(rampPlan(0, 1), { to: ROLLING_GAIN, seconds: 0.05 }, 'rolling unchanged');
  assert.deepEqual(rampPlan(0, 1, UFO_GAIN), { to: 0.8, seconds: 0.05 });
  assert.match(method(audio, '    stopLoops() {'), /this\.loops/);
});

test('bitmap fonts: all layers share one pen that advances by the widest layer (ImageFont::DrawStringEx) — the NativeAlienExtended16 shadow (space 15 vs 11) stays under its letter', async () => {
  const { parseFontScript, layoutText, measureText } = await import('../.compiled/bitmapfont.js');
  const script = [
    "Define CharList ('A', 'B');", 'Define WidthList (10, 12);', 'Define RectList ((0, 0, 10, 20), (10, 0, 12, 20));',
    "CreateLayer Main; LayerSetImage Main 'F16'; LayerSetAscent Main 25; LayerSetCharWidths Main CharList WidthList; LayerSetCharWidths Main (' ') (11); LayerSetImageMap Main CharList RectList;",
    "CreateLayer Shadow; LayerSetImage Shadow 'F16'; LayerSetAscent Shadow 25; LayerSetCharWidths Shadow CharList WidthList; LayerSetCharWidths Shadow (' ') (15); LayerSetImageMap Shadow CharList RectList;",
    'LayerSetOffset Shadow (-1, -1); LayerSetColorMult Shadow (0, 0, 0, 0.75); LayerSetBaseOrder Shadow -1;',
  ].join('\n');
  const font = parseFontScript(script);
  const layout = layoutText(font, 'A B A');
  const shadow = layout.glyphs.filter(g => g.layer === 0);
  const main = layout.glyphs.filter(g => g.layer === 1);
  assert.equal(shadow.length, 3);
  assert.equal(main.length, 3);
  main.forEach((g, i) => assert.equal(shadow[i].dx, g.dx - 1, `glyph ${i}: the shadow sits 1 px left of its letter`));
  assert.deepEqual(main.map(g => g.dx), [0, 25, 52], 'A (10) + space (max 15) → B at 25; B (12) + space (15) → A at 52');
  assert.equal(layout.width, 62);
  assert.equal(measureText(font, 'A B A'), 62);
});
