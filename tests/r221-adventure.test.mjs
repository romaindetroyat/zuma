import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

/**
 * R2.0.21 — écran d'aventure, dieu, fin et routage (recherche 06 Q2 / Q3, D-02, D-03, D-10): pure geometry of the
 * original adventure screen (AdventureScreen: draw 0x441b50, temples 0x43e640 / 0x43e670 / 0x43e790 / 0x43e8b0, doors
 * 0x43e5c0 / 0x440c90, arrival animation 0x43e3f0 / 0x43e470, buttons 0x4414f0), the god dialogue, the ending screen and
 * the source locks of the after-level routing in main.js.
 */
const read = file => fs.readFileSync(file, 'utf8');
const A = () => import('../.compiled/adventure.js');
const P = () => import('../.compiled/progress.js');

// ---------------------------------------------------------------- geometry read in the executable (Task 1)

test('ADV: twelve doors at the positions of 0x449cb2–0x449e57 (anchors kept), temples, plaque, stage, texts, buttons (Resize 0x4414f0)', async () => {
  const { ADV } = await A();
  assert.deepEqual(ADV.doors.map(d => [d.x, d.y, d.anchor.x, d.anchor.y]), [
    [226, 300, 256, 361], [296, 270, 327, 364], [366, 300, 398, 360],
    [0, 164, 56, 218], [69, 159, 116, 201], [120, 155, 167, 188],
    [452, 154, 462, 188], [509, 154, 521, 192], [568, 154, 584, 196],
    [220, 35, 248, 86], [291, 35, 324, 86], [369, 35, 408, 85],
  ]);
  assert.deepEqual(ADV.temples, { 1: { x: 0, y: 188 }, 2: { x: 0, y: 112 }, 3: { x: 395, y: 125 }, 4: { x: 174, y: 1 }, middle: { x: 0, y: 72 } });
  assert.deepEqual(ADV.sky, { w: 640, h: 116 });
  assert.deepEqual(ADV.title, { x: 0, y: 0 });
  assert.deepEqual(ADV.plaque, { x: 456, y: 0, w: 184, h: 65 });
  assert.deepEqual(ADV.scores, { nameX: 470, nameClip: 567, scoreX: 575, top: 70, rows: 3, color: '#ffff4c' });
  assert.deepEqual(ADV.stage, { x: 289, y: 382, numberX: 344, numberBaseline: 396, color: '#fbf1b0' });
  assert.deepEqual(ADV.message, { cx: 326, baseline: 422, second: 456, secondColor: '#ffea01' });
  assert.deepEqual(ADV.hint, { x: 20, y: 60, w: 150, h: 100, lineHeight: 14, color: '#ffff4c' });
  assert.deepEqual(ADV.buttons, { mainMenu: { x: 0, y: 438, w: 125, h: 42 }, play: { x: 542, y: 441, w: 97, h: 39 } });
  assert.deepEqual(ADV.reveal, { delayMaj: 75, fadeMaj: 100, riseMaj: 300, rise: 300, shakeMax: 10 });
});

test('advSkyOffset: (c >> 2) mod 640 — 1 px every 4 maj (25 px/s); non-finite → 0', async () => {
  const { advSkyOffset } = await A();
  assert.equal(advSkyOffset(0), 0);
  assert.equal(advSkyOffset(3), 0);
  assert.equal(advSkyOffset(4), 1);
  assert.equal(advSkyOffset(4 * 640), 0);
  assert.equal(advSkyOffset(4 * 641 + 3), 1);
  assert.equal(advSkyOffset(NaN), 0);
  assert.equal(advSkyOffset(-Infinity), 0);
});

const names = list => list.map(t => t.image);

test('advTemples: back to front (temple 4 + doors 9..11, middle, 3, 2, 1); veiled temples 2v / 3v carry no door (0x43e670 / 0x43e790)', async () => {
  const { advTemples } = await A();
  const fresh = advTemples(0, null);
  assert.deepEqual(names(fresh), ['advmiddle', 'advtemple3v', 'advtemple2v', 'advtemple1']);
  assert.deepEqual(fresh.map(t => [t.x, t.y, t.alpha]), [[0, 72, 1], [395, 125, 1], [0, 112, 1], [0, 188, 1]]);
  assert.deepEqual(fresh.map(t => t.doors), [[0, 0], [6, 6], [3, 3], [0, 3]], 'only the doors of temple 1 are drawn');
  const two = advTemples(3, null);
  assert.deepEqual(names(two), ['advmiddle', 'advtemple3v', 'advtemple2', 'advtemple1']);
  assert.deepEqual(two[2].doors, [3, 6]);
  const three = advTemples(6, null);
  assert.deepEqual(names(three), ['advmiddle', 'advtemple3', 'advtemple2', 'advtemple1']);
  assert.deepEqual(three[1].doors, [6, 9]);
  const four = advTemples(9, null);
  assert.deepEqual(names(four), ['advtemple4', 'advmiddle', 'advtemple3', 'advtemple2', 'advtemple1']);
  assert.deepEqual([four[0].x, four[0].y, four[0].doors], [174, 1, [9, 12]], 'temple 4 at (174, 1) with doors 9..11, under advmiddle');
  assert.deepEqual(names(advTemples(12, null)), names(four), 'the last stage keeps every temple open');
});

test('advTemples: arrival crossfade of temple 2 / 3 (alpha n × 255 / 100), rise of temple 4 ((300 − n)² / 300), x shake of each temple', async () => {
  const { advTemples } = await A();
  const fade = advTemples(3, { temple: 2, progress: 0.4 });
  assert.deepEqual(names(fade), ['advmiddle', 'advtemple3v', 'advtemple2v', 'advtemple2', 'advtemple1']);
  const [veiled, open] = [fade[2], fade[3]];
  assert.ok(Math.abs(veiled.alpha - 0.6) < 1e-9 && Math.abs(open.alpha - 0.4) < 1e-9, 'veiled 0.6, open 0.4');
  assert.deepEqual([veiled.x, veiled.y, open.x, open.y], [0, 112, 0, 112], 'same coordinates');
  assert.deepEqual([veiled.doors, open.doors], [[3, 3], [3, 6]], 'the opening doors fade in with the open temple');
  const fade3 = advTemples(6, { temple: 3, progress: 0 });
  assert.deepEqual(fade3.filter(t => t.image.startsWith('advtemple3')).map(t => [t.image, t.alpha]), [['advtemple3v', 1], ['advtemple3', 0]]);
  const half = advTemples(9, { temple: 4, progress: 0.5 });
  assert.equal(half[0].image, 'advtemple4');
  assert.equal(half[0].y, 1 + 75, '(300 − 150)² / 300 = 75 px below its place at mid-rise');
  assert.equal(advTemples(9, { temple: 4, progress: 1 })[0].y, 1);
  assert.equal(advTemples(9, { temple: 4, progress: 0.01 })[0].y, 1 + Math.floor(297 ** 2 / 300));
  assert.deepEqual(names(advTemples(9, { temple: 4, progress: 0 })), ['advmiddle', 'advtemple3', 'advtemple2', 'advtemple1'], 'before the delay ends only advmiddle');
  const shaken = advTemples(9, { temple: 4, progress: 1 }, [1, -2, 3, -4]);
  assert.deepEqual(shaken.map(t => [t.image, t.x]), [['advtemple4', 170], ['advmiddle', 0], ['advtemple3', 398], ['advtemple2', -2], ['advtemple1', 1]]);
});

test('doorCel (0x43e5c0): 3 selected, 2 hovered, 1 unlocked (door ≤ maxStage), 0 locked; selected wins over hovered', async () => {
  const { doorCel } = await A();
  assert.equal(doorCel(0, 0, null, null), 1);
  assert.equal(doorCel(4, 3, null, null), 0);
  assert.equal(doorCel(2, 5, 2, null), 3);
  assert.equal(doorCel(2, 5, null, 2), 2);
  assert.equal(doorCel(2, 5, 2, 2), 3);
  assert.equal(doorCel(5, 5, 1, 4), 1);
});

test('doorAt (0x440c90): unlocked doors only, cel rectangle (width / 4), optional per-pixel alpha of cel 0; outside → null', async () => {
  const { doorAt, ADV } = await A();
  const widths = [62, 64, 57, 64, 57, 51, 45, 44, 56, 61, 64, 62];
  const heights = [58, 57, 56, 57, 43, 35, 34, 38, 41, 50, 49, 49];
  const d1 = ADV.doors[1];
  const cx = d1.x + widths[1] / 2;
  const cy = d1.y + heights[1] / 2;
  assert.equal(doorAt(cx, cy, 1, widths, heights), 1);
  assert.equal(doorAt(cx, cy, 0, widths, heights), null, 'a locked door is not a target');
  assert.equal(doorAt(5, 5, 11, widths, heights), null);
  assert.equal(doorAt(NaN, cy, 11, widths, heights), null);
  assert.equal(doorAt(cx, cy, 11, widths, heights, () => false), null, 'transparent pixel of the cel');
  const seen = [];
  assert.equal(doorAt(cx, cy, 11, widths, heights, (i, x, y) => { seen.push([i, x, y]); return true; }), 1);
  assert.deepEqual(seen, [[1, widths[1] / 2, heights[1] / 2]], 'the alpha test gets cel-local coordinates');
  assert.equal(doorAt(ADV.doors[11].x + 1, ADV.doors[11].y + 1, 99, widths, heights), 11, 'maxStage beyond 11 keeps the 12 doors');
});

test('advButtonAt: « Menu principal » (0, 438) 125 × 42 and « Jouer » (542, 441) 97 × 39, disjoint, inside 640 × 480', async () => {
  const { advButtonAt, ADV } = await A();
  const { mainMenu, play } = ADV.buttons;
  assert.equal(advButtonAt(mainMenu.x + mainMenu.w / 2, mainMenu.y + mainMenu.h / 2), 'main-menu');
  assert.equal(advButtonAt(play.x + play.w / 2, play.y + play.h / 2), 'play');
  assert.equal(advButtonAt(320, 240), null);
  assert.equal(advButtonAt(NaN, 450), null);
  for (const r of [mainMenu, play]) assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 640 && r.y + r.h <= 480);
  assert.ok(mainMenu.x + mainMenu.w <= play.x, 'disjoint');
});

test('scoreRows (0x44286b): the first three entries only, baseline 70 + i × line spacing, score « %d » without separator, name as is', async () => {
  const { scoreRows } = await A();
  const list = Array.from({ length: 12 }, (_, i) => ({ name: `Joueur ${i}`, score: 120000 - i * 1000, stage: 0, level: 0, date: '' }));
  const rows = scoreRows(list, 12);
  assert.equal(rows.length, 3);
  assert.deepEqual(rows[0], { name: 'Joueur 0', score: '120000', baseline: 70 });
  assert.deepEqual(rows.map(r => r.baseline), [70, 82, 94]);
  assert.deepEqual(scoreRows([], 12), []);
  assert.equal(scoreRows(list.slice(0, 1), NaN)[0].baseline, 70);
});

test('arrival: revealTemple(opening) 3 → 2, 6 → 3, 9 → 4, else null; revealProgress after the 75 maj delay over 100 maj (fade) or 300 maj (rise)', async () => {
  const { revealTemple, revealProgress, advArrivalMaj } = await A();
  assert.deepEqual([3, 6, 9, 1, 4, 12, 0].map(revealTemple), [2, 3, 4, null, null, null, null]);
  assert.equal(revealTemple(null), null);
  assert.equal(revealProgress(0, 2), 0);
  assert.equal(revealProgress(75, 2), 0);
  assert.equal(revealProgress(125, 2), 0.5);
  assert.equal(revealProgress(175, 3), 1);
  assert.equal(revealProgress(900, 3), 1);
  assert.equal(revealProgress(225, 4), 0.5);
  assert.equal(revealProgress(NaN, 4), 0);
  assert.deepEqual([advArrivalMaj(null), advArrivalMaj(2), advArrivalMaj(4)], [175, 175, 375], 'doors locked during the arrival (+0x204)');
});

test('advShakeStep (0x43e4dd): every offset moves by −1, 0 or +1 and stays within ±(10 − n × 10 / 300); zero after the rise', async () => {
  const { advShakeStep } = await A();
  const r = [0, 0.5, 0.99, 0.5];
  let i = 0;
  const rand = () => r[i++ % r.length];
  assert.deepEqual(advShakeStep([0, 0, 0, 0], 0, rand), [-1, 0, 1, 0]);
  assert.deepEqual(advShakeStep([5, -5, 5, 5], 150, () => 0.99), [5, -4, 5, 5], 'amplitude 5 at mid-rise');
  assert.deepEqual(advShakeStep([3, 3, 3, 3], 301, () => 0.99), [0, 0, 0, 0]);
});

test('advLines: temple name of the selected door (line 1, 0x4426ec) and its door message (line 2, 0x44279f); hint box text (0x442b5d)', async () => {
  const { advLines, advHint } = await A();
  const strings = { TEMPLE_OF_ZUKULKAN: 'TEMPLE DE ZUKULKAN', DO_YOU_DARE_ENTER_THE_ANCIENT_RUINS: 'ENTRER DANS LES RUINES ANCIENNES ?', ENTER_THE_RUINS: 'X', SECRET_SHRINE_OF_ZUMA: 'TEMPLE SECRET DE ZUMA', CLICK_ON_A_DOORWAY: 'Cliquez.', UNCOVER_THE_SECRET_TEMPLES: 'Découvrez.' };
  assert.deepEqual(advLines(0, strings), { title: 'TEMPLE DE ZUKULKAN', message: 'ENTRER DANS LES RUINES ANCIENNES ?' });
  assert.equal(advLines(4, strings).title, 'QUETZAL QUATL', 'absent key → the literal of 0x550504');
  assert.equal(advLines(7, null).title, 'POPO POYOLLI');
  assert.deepEqual(advLines(12, strings), { title: 'TEMPLE SECRET DE ZUMA', message: 'X' }, 'the « Espace » stage keeps the last door texts');
  assert.equal(advHint(null, 3, strings), 'Découvrez.');
  assert.equal(advHint(3, 3, strings), 'Découvrez.', 'hovering the selected door changes nothing');
  assert.equal(advHint(2, 3, strings), 'Cliquez.');
  assert.match(advHint(2, 3, null), /porte/);
});

test('bundle: adventure after welcome in MODULES, precached by the worker shell, copied to dist/js, no DOM at module level', () => {
  assert.match(read('tools/build.mjs'), /'welcome', 'adventure', 'main'/);
  assert.match(read('public/sw.js'), /'\.\/js\/welcome\.js', '\.\/js\/adventure\.js', '\.\/js\/main\.js'/);
  assert.ok(fs.existsSync('dist/js/adventure.js'));
  const src = read('.compiled/adventure.js');
  assert.doesNotMatch(src, /^[^\s}][^\n(]*\b(document|window)\./m, 'no top-level DOM access');
  assert.doesNotMatch(src, /localStorage/);
  assert.doesNotMatch(src, /innerHTML/);
});

test('progress: temple name fallbacks are the literals of the executable (0x550504 « QUETZAL QUATL », 0x5504d0 « POPO POYOLLI »)', async () => {
  const { TEMPLE_NAMES } = await P();
  assert.deepEqual(TEMPLE_NAMES.map(t => t.fallback), ['TEMPLE DE ZUKULKAN', 'QUETZAL QUATL', 'POPO POYOLLI', 'TEMPLE SECRET DE ZUMA']);
});

// ---------------------------------------------------------------- composition: adventure screen, god dialogue, ending (Task 2)

/** Canvas 2D stand-in that records every call and property write (Node has no canvas). */
function recorder() {
  const calls = [];
  const state = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, imageSmoothingEnabled: true };
  const stack = [];
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'calls') return calls;
      if (prop in state) return state[prop];
      if (prop === 'save') return () => { stack.push({ ...state }); calls.push({ op: 'save' }); };
      if (prop === 'restore') return () => { Object.assign(state, stack.pop() ?? {}); calls.push({ op: 'restore' }); };
      if (prop === 'measureText') return s => ({ width: String(s).length * 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push({ op: prop, args, alpha: state.globalAlpha, fill: state.fillStyle }); };
    },
    set(_t, prop, value) {
      state[prop] = value;
      calls.push({ op: 'set', prop, value });
      return true;
    },
  });
}
const pic = (name, width, height) => ({ name, width, height });
/** A font stand-in that records its draws into the context's call list. */
const fakeFont = (name, k = 1) => ({
  name, pixelScale: k, ascent: 8, height: 12, capHeight: 8,
  measure: s => String(s).length * 7,
  draw(ctx, text, x, y, options = {}) { ctx.calls.push({ op: 'font', font: name, text, x, y, options }); return String(text).length * 7; },
});
const DOOR_W = [62, 60, 57, 64, 57, 51, 45, 44, 56, 61, 64, 62];
const DOOR_H = [58, 90, 56, 57, 43, 35, 34, 38, 41, 50, 49, 49];
function fakeAdvKit(k = 1, fonts = false) {
  const t = (name, w, h) => pic(name, w * k, h * k);
  const f = name => (fonts ? fakeFont(name, k) : null);
  return {
    sky: t('advsky', 640, 116), back: t('advback', 640, 250), title: t('advtitle', 185, 73), plaque: t('advhighscore', 184, 65), stage: t('advstage', 76, 16),
    temples: {
      advtemple1: t('advtemple1', 640, 292), advtemple2: t('advtemple2', 228, 208), advtemple2v: t('advtemple2v', 228, 208), advtemple3: t('advtemple3', 245, 194),
      advtemple3v: t('advtemple3v', 245, 194), advtemple4: t('advtemple4', 291, 249), advmiddle: t('advmiddle', 640, 185),
    },
    doors: DOOR_W.map((w, i) => t(`door${i}`, w * 4, DOOR_H[i])),
    doorMasks: null,
    play: t('play', 291, 39), mainMenu: t('mainmenu', 375, 42), happyEnding: t('happyending', 640, 480),
    fonts: { brown: f('brown'), message: f('message'), score: f('score'), number: f('number'), huge: f('huge'), title: f('title') },
    dialog: null, pixelScale: k,
  };
}
const advView = { c: 8, maxStage: 4, selected: 4, hover: 3, button: { hover: 'play', pressed: null }, focus: null, reveal: null, shake: [0, 0, 0, 0], scores: [], strings: null };
const imgs = ctx => ctx.calls.filter(c => c.op === 'drawImage');

test('drawAdventure: 0x441b50 order — sky ×3 before advback, title, plaque, temples with their doors (cel from doorCel), stage plaque, buttons', async () => {
  const { drawAdventure } = await A();
  const ctx = recorder();
  drawAdventure(ctx, fakeAdvKit(), advView);
  const order = imgs(ctx).map(c => c.args[0].name);
  assert.deepEqual(order.slice(0, 6), ['advsky', 'advsky', 'advsky', 'advback', 'advtitle', 'advhighscore'], 'advsky before advback (the back is holed)');
  assert.deepEqual(imgs(ctx).slice(0, 3).map(c => c.args[1]), [2 - 640, 2, 2 + 640], 'o = (8 >> 2) mod 640');
  assert.deepEqual(order.slice(6), ['advmiddle', 'advtemple3v', 'advtemple2', 'door3', 'door4', 'door5', 'advtemple1', 'door0', 'door1', 'door2', 'advstage', 'mainmenu', 'play']);
  const door = i => imgs(ctx).find(c => c.args[0].name === `door${i}`).args;
  assert.deepEqual(door(4), [door(4)[0], 3 * 57, 0, 57, 43, 69, 159, 57, 43], 'selected door: cel 3 at its place');
  assert.equal(door(3)[1], 2 * 64, 'hovered door: cel 2');
  assert.equal(door(5)[1], 0, 'door above maxStage: cel 0');
  assert.equal(door(0)[1], 62, 'unlocked door: cel 1');
  const btn = name => imgs(ctx).find(c => c.args[0].name === name).args;
  assert.deepEqual(btn('play'), [btn('play')[0], 97, 0, 97, 39, 542, 441, 97, 39], '« Jouer » hovered: state 1');
  assert.deepEqual(btn('mainmenu').slice(1), [0, 0, 125, 42, 0, 438, 125, 42]);
  assert.deepEqual(btn('advstage').slice(1, 3), [289, 382]);
});

test('drawAdventure: texts — temple name (brown, white, centred 326 / 422), door message (outlined, 0xffea01, 456), stage number, plaque scores through scoreRows, hint', async () => {
  const { drawAdventure } = await A();
  const ctx = recorder();
  const scores = [{ name: 'Zuma', score: 10000 }, { name: 'Grenouille', score: 5000 }, { name: 'Têtard', score: 1000 }, { name: 'Quatre', score: 10 }];
  drawAdventure(ctx, fakeAdvKit(1, true), { ...advView, selected: 0, hover: 1, scores, strings: { TEMPLE_OF_ZUKULKAN: 'TEMPLE DE ZUKULKAN', DO_YOU_DARE_ENTER_THE_ANCIENT_RUINS: 'ENTRER ?', CLICK_ON_A_DOORWAY: 'Cliquez sur une porte.' } });
  const fonts = ctx.calls.filter(c => c.op === 'font');
  const plain = fonts.filter(c => (c.options.tint ?? '').toLowerCase() !== '#000000');
  const title = plain.find(c => c.text === 'TEMPLE DE ZUKULKAN');
  assert.deepEqual([title.font, title.x, title.y, title.options.align], ['brown', 326, 422, 'center']);
  const message = plain.find(c => c.text === 'ENTRER ?');
  assert.deepEqual([message.font, message.x, message.y, message.options.tint], ['message', 326, 456, '#ffea01']);
  assert.ok(fonts.filter(c => c.text === 'ENTRER ?' && c.options.tint === '#000000').length >= 4, 'black 1 px outline under the door message');
  const number = plain.find(c => c.font === 'number');
  assert.deepEqual([number.text, number.x, number.y, number.options.tint], ['1', 344, 396, '#fbf1b0']);
  const score = plain.filter(c => c.font === 'score' && /^\d+$/.test(c.text));
  assert.deepEqual(score.map(c => [c.text, c.x, c.y]), [['10000', 575, 70], ['5000', 575, 82], ['1000', 575, 94]], 'three scores, left-aligned at 575');
  const nameRows = plain.filter(c => c.font === 'score' && ['Zuma', 'Grenouille', 'Têtard', 'Quatre'].includes(c.text));
  assert.deepEqual(nameRows.map(c => [c.text, c.x]), [['Zuma', 470], ['Grenouille', 470], ['Têtard', 470]]);
  assert.ok(ctx.calls.some(c => c.op === 'rect' && c.args[0] + c.args[2] === 567) && ctx.calls.some(c => c.op === 'clip'), 'names clipped to x < 567 (0x463820)');
  const hint = plain.filter(c => c.font === 'score' && /porte/.test(c.text));
  assert.ok(hint.length >= 1 && hint[0].x === 20, 'hint box at x 20 (CLICK_ON_A_DOORWAY while another door is hovered)');
});

test('drawAdventure: arrival — the opening temple fades at the reveal alpha, its doors too; a 2 × kit is cut at 2 × and drawn at the logical size', async () => {
  const { drawAdventure } = await A();
  const ctx = recorder();
  drawAdventure(ctx, fakeAdvKit(2), { ...advView, maxStage: 3, selected: 3, hover: null, reveal: { temple: 2, progress: 0.25 } });
  const veiled = imgs(ctx).find(c => c.args[0].name === 'advtemple2v');
  const open = imgs(ctx).find(c => c.args[0].name === 'advtemple2');
  assert.equal(veiled.alpha, 0.75);
  assert.equal(open.alpha, 0.25);
  assert.deepEqual(open.args.slice(1), [0, 112, 228, 208]);
  const door3 = imgs(ctx).find(c => c.args[0].name === 'door3');
  assert.equal(door3.alpha, 0.25);
  assert.deepEqual(door3.args.slice(1), [3 * 64 * 2, 0, 64 * 2, 57 * 2, 0, 164, 64, 57]);
});

test('drawAdventure: a missing piece is skipped without exception; kit null → a vector adventure screen (doors, texts, buttons)', async () => {
  const { drawAdventure } = await A();
  const kit = fakeAdvKit();
  kit.sky = null;
  kit.temples.advtemple3v = null;
  kit.doors[1] = null;
  kit.stage = null;
  kit.play = null;
  const ctx = recorder();
  assert.doesNotThrow(() => drawAdventure(ctx, kit, advView));
  assert.ok(!imgs(ctx).some(c => c.args[0] === null));
  const vec = recorder();
  assert.doesNotThrow(() => drawAdventure(vec, null, { ...advView, c: NaN }));
  const texts = vec.calls.filter(c => c.op === 'fillText').map(c => c.args[0]);
  assert.ok(texts.some(t => /JOUER/i.test(t)) && texts.some(t => /MENU/i.test(t)), texts.join(' | '));
});

test('godDialogWidgets: one footer button « <RIBBIT> <reply> » (pack strings, built-in fallbacks); temple 4 has two pages, temple 5 « Coâ-coâ ! (Bizarre) ! »', async () => {
  const { godDialogWidgets, godPages } = await A();
  const strings = { RIBBIT: 'Coâ-coâ.', I_BEG_TO_DIFFER: '(Je proteste).', 'RIBBIT_?': 'Coâ-coâ ?', IN_SPACE: "(Dans l'espace) ?", 'RIBBIT_!': 'Coâ-coâ !', WERD: '(Bizarre) !' };
  const one = godDialogWidgets(strings, 1);
  assert.equal(one.length, 1);
  assert.equal(one[0].id, 'god-next');
  assert.equal(one[0].label, 'Coâ-coâ. (Je proteste).');
  assert.equal(godDialogWidgets(null, 1)[0].label, 'Coâ-coâ. (Je proteste).', 'fallback');
  assert.equal(godDialogWidgets(strings, 4)[0].label, "Coâ-coâ ? (Dans l'espace) ?");
  assert.equal(godDialogWidgets(strings, 5)[0].label, 'Coâ-coâ ! (Bizarre) !');
  assert.deepEqual([1, 2, 3, 4, 5].map(godPages), [1, 1, 1, 2, 1]);
  const r = one[0].rect;
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 640 && r.y + r.h <= 480);
});

test('drawGodDialog: frame, GodHead, temple name title (none for temple 5), the page text wrapped, the footer button; never throws without kit', async () => {
  const { drawGodDialog } = await A();
  const fontRec = name => fakeFont(name);
  const kit = { frame: pic('dialogbox', 243, 242), head: pic('godhead', 156, 140), button: pic('dialogbutton', 360, 48), fonts: { title: fontRec('t'), text: fontRec('x'), tip: null, tipSmall: null }, strings: { TEMPLE_OF_ZUKULKAN: 'TEMPLE DE ZUKULKAN', FINAL_TEMPLE_STRUCK: 'Le dernier temple est tombé !', WE_COME_FROM_STAR: 'Nous venons des étoiles.' }, pixelScale: 1 };
  const ctx = recorder();
  drawGodDialog(ctx, kit, { temple: 4, page: 1, hover: false, pressed: false }, null);
  const texts = ctx.calls.filter(c => c.op === 'font').map(c => c.text);
  assert.ok(texts.includes('TEMPLE SECRET DE ZUMA'), 'title = temple name');
  assert.ok(texts.some(t => /étoiles/.test(t)), 'page 2 of temple 4');
  assert.ok(!texts.some(t => /dernier temple/.test(t)));
  assert.ok(imgs(ctx).some(c => c.args[0].name === 'godhead'));
  const final = recorder();
  drawGodDialog(final, kit, { temple: 5, page: 0, hover: true, pressed: false }, null);
  assert.ok(!final.calls.some(c => c.op === 'font' && /TEMPLE/.test(c.text)), 'no title for the final dialogue');
  assert.doesNotThrow(() => drawGodDialog(recorder(), null, { temple: 1, page: 0, hover: false, pressed: true }, null));
});

test('ending: endingWidgets one « OK » inside the table frame; drawEnding happyending at (0, 0), CONGRATULATIONS, advHighscore plaque, rank row in 0xffff4c', async () => {
  const { endingWidgets, drawEnding, ADV_ENDING } = await A();
  const [ok] = endingWidgets();
  assert.equal(ok.id, 'ending-ok');
  assert.equal(ok.label, 'OK');
  const f = ADV_ENDING.frame;
  assert.ok(ok.rect.x >= f.x && ok.rect.y >= f.y && ok.rect.x + ok.rect.w <= f.x + f.w && ok.rect.y + ok.rect.h <= f.y + f.h, 'inside the frame');
  const kit = fakeAdvKit(1, true);
  kit.dialog = { frame: pic('dialogbox', 243, 242), head: null, button: pic('dialogbutton', 360, 48), fonts: { title: fakeFont('t'), text: fakeFont('x'), tip: null, tipSmall: null }, strings: {}, pixelScale: 1 };
  const scores = Array.from({ length: 10 }, (_, i) => ({ name: `N${i}`, score: 90000 - i * 5000, stage: 12, level: 0, date: '' }));
  const ctx = recorder();
  drawEnding(ctx, kit, { score: 80000, rank: 2, scores, hover: false, pressed: false, strings: { CONGRATULATIONS: 'FÉLICITATIONS !', SCORE: 'Score :' } });
  const first = imgs(ctx)[0];
  assert.deepEqual([first.args[0].name, first.args[1], first.args[2]], ['happyending', 0, 0]);
  assert.ok(imgs(ctx).some(c => c.args[0].name === 'advhighscore'), 'the plaque heads the table');
  const fonts = ctx.calls.filter(c => c.op === 'font');
  assert.ok(fonts.some(c => c.text === 'FÉLICITATIONS !' && c.font === 'huge'), 'title in NativeAlien48');
  assert.ok(fonts.some(c => c.text === 'Score : 80000'));
  const rowsOf = name => fonts.filter(c => c.text === name);
  assert.equal(rowsOf('N2')[0].options.tint, '#ffff4c', 'the run’s row is highlighted');
  assert.equal(rowsOf('N3')[0].options.tint, '#ffffff');
  assert.equal(fonts.filter(c => /^N\d$/.test(c.text)).length, 10, 'ten rows');
  assert.doesNotThrow(() => drawEnding(recorder(), null, { score: 5, rank: null, scores: [], hover: true, pressed: true, strings: null }));
});

test('source locks: adventure.js draws doors through doorCel(, the plaque through scoreRows(, the ending through CONGRATULATIONS; no innerHTML; names only from progress.ts', () => {
  const src = read('.compiled/adventure.js');
  assert.match(src, /doorCel\(/);
  assert.match(src, /scoreRows\(/);
  assert.match(src, /CONGRATULATIONS/);
  assert.match(src, /happyEnding/);
  assert.doesNotMatch(src, /innerHTML/);
  assert.doesNotMatch(src, /'(Zuma|Grenouille|Têtard)'/, 'the demonstration names live in progress.ts only');
});

test('loadAdventureKit: null without advback; missing pieces and fonts are null, never an exception', async () => {
  const { loadAdventureKit } = await A();
  const pack = present => ({ base: 'assets/', data: { images: {}, fonts: {} }, masked: async key => (present(key) ? pic(key, 10, 10) : null), image: async key => (present(key) ? pic(key, 10, 10) : null) });
  assert.equal(await loadAdventureKit(pack(() => false), null), null);
  const kit = await loadAdventureKit(pack(key => key !== 'advdoor2b' && key !== 'advtemple4'), null);
  assert.ok(kit);
  assert.equal(kit.back.name, 'advback');
  assert.equal(kit.doors[4], null);
  assert.equal(kit.temples.advtemple4, null);
  assert.equal(kit.fonts.brown, null);
  assert.equal(kit.pixelScale, 1);
});

// ---------------------------------------------------------------- main.js: the adventure screen driven (Task 3)
/** Body of a compiled method, up to the closing brace at its indentation. */
const method = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature.trim()} compiled`);
  const end = src.indexOf('\n    }', start);
  return src.slice(start, end > 0 ? end : undefined);
};

test('main.js: the loop paints the adventure screen through drawScene + drawAdventure; the 06-03 pass-through is gone from dispatch', () => {
  const main = read('.compiled/main.js');
  const loop = method(main, '    loop(time) {');
  assert.match(loop, /drawAdventureFrame\(time\)/);
  assert.match(loop, /drawWelcomeFrame\(time\)/);
  assert.match(method(main, '    drawAdventureFrame(time) {'), /drawScene\([\s\S]*drawAdventure\(/);
  const dispatch = method(main, '    dispatch(event) {');
  assert.doesNotMatch(dispatch, /kind: 'play'|kind: 'temple-done'|kind: 'ending-done'|kind: 'main-menu'/, 'no transitional pass-through');
  assert.doesNotMatch(main, /Transitional until plan 06-04/);
});

test('main.js: doors select (kind: select, stage), the selected door again = Jouer, buttons « Jouer » / « Menu principal », click sound on the buttons only', () => {
  const main = read('.compiled/main.js');
  assert.match(main, /kind: 'select', stage/);
  assert.match(main, /doorAt\(/);
  assert.match(main, /advButtonAt\(/);
  const activate = method(main, '    adventureButton(id, sound = true) {');
  assert.match(activate, /key: 'button', gain: 1, rate: 1/);
  assert.match(activate, /kind: 'play'/);
  assert.match(activate, /kind: 'main-menu'/);
  const down = method(main, '    adventureDown(p, button) {');
  assert.match(down, /adventureButton\('play', false\)/, 'a press on the selected door plays (0x440e06), without the button sound');
  assert.doesNotMatch(down, /key: 'button'/, 'selecting a door is silent (0x440db0)');
});

test('main.js: 2 × adventure kit above HD_MIN_SCALE, loaded after the STATS kit; arrival reveal (revealTemple / revealProgress), earthquake once, doors locked meanwhile', () => {
  const main = read('.compiled/main.js');
  assert.match(method(main, '    applyHd() {'), /upscaleAdventureKit\(/);
  const start = method(main, '    async start() {');
  assert.ok(start.indexOf('loadStatsKit(') < start.indexOf('loadAdventureKit('), 'after the STATS kit');
  assert.match(main, /revealTemple\(/);
  assert.match(main, /revealProgress\(/);
  assert.match(main, /advArrivalMaj\(/);
  assert.match(main, /advShakeStep\(/);
  assert.match(main, /key: 'earthquake'/);
});

test('main.js: keyboard on the adventure screen — Left / Right walk the open doors, Enter / Space = Jouer, Escape = Menu principal; touch press / release', () => {
  const main = read('.compiled/main.js');
  const keys = method(main, '    adventureKey(code) {');
  for (const k of ['ArrowLeft', 'ArrowRight', 'Enter', 'Space', 'Escape']) assert.match(keys, new RegExp(`'${k}'`), k);
  assert.match(keys, /kind: 'select'/);
  assert.match(main, /adventureUp\(/);
  assert.match(main, /adventureMove\(/);
});

// ---------------------------------------------------------------- main.js: routing after a level (Task 4)

test('main.js: closeStats sends won (score, lives, local date) / retry (lives) / leave after the game-over STATS; never a new game or a wrap to 1-1', () => {
  const main = read('.compiled/main.js');
  const close = method(main, '    async closeStats() {');
  assert.match(close, /kind: 'won', score: engine\.score, lives: engine\.lives, date: localDate\(\)/);
  assert.match(close, /kind: 'retry', lives: engine\.lives/);
  assert.match(close, /outcome === 'gameover'\)\s*this\.dispatch\(\{ kind: 'leave' \}\)/);
  assert.doesNotMatch(main, /nextLevel\(|retryLevel\(|newGame\(/);
  assert.doesNotMatch(main, /progress = \{ stage: 0, level: 0 \}/);
  assert.match(method(main, '    menuActivate(id) {'), /this\.closeMenu\(\);\s*this\.dispatch\(\{ kind: 'leave' \}\)/, '« Retour au menu principal » confirmed → leave (D-02)');
});

test('main.js: the game over is submitted by checkOutcome when the engine reaches gameover (0x4283c4), once per level; not by the STATS', () => {
  const main = read('.compiled/main.js');
  const check = method(main, '    checkOutcome(engine) {');
  assert.match(check, /engine\.state === 'gameover' && !this\.gameoverSent/);
  assert.match(check, /this\.gameoverSent = true/);
  assert.match(check, /kind: 'gameover', score: engine\.score, date: localDate\(\)/);
  assert.doesNotMatch(method(main, '    openStats(outcome) {'), /kind: 'gameover'/);
  assert.match(method(main, '    async startLevel() {'), /this\.gameoverSent = false/, 'the guard is armed again at each level start');
});

test('main.js: temple screen = the frozen board under drawGodDialog, pages then temple-done; ending = drawEnding, OK → ending-done → welcome', () => {
  const main = read('.compiled/main.js');
  const temple = method(main, '    drawTempleFrame() {');
  assert.ok(temple.indexOf('this.renderer.draw(') >= 0 && temple.indexOf('this.renderer.draw(') < temple.indexOf('drawGodDialog('), 'board first, dialogue over it');
  assert.doesNotMatch(temple, /\.step\(\)/, 'the engine does not step');
  const next = method(main, '    godNext() {');
  assert.match(next, /godPages\(/);
  assert.match(next, /kind: 'temple-done'/);
  assert.match(method(main, '    drawEndingFrame() {'), /drawScene\([\s\S]*drawEnding\(/);
  assert.match(method(main, '    endingDone() {'), /kind: 'ending-done'/);
  const keys = method(main, '    screenKey(code) {');
  for (const k of ['Enter', 'Space', 'Escape']) assert.match(keys, new RegExp(`'${k}'`));
  assert.match(method(main, '    enterScreen(screen) {'), /screen !== 'temple'/, 'the engine is kept under the god dialogue');
});

test('main.js: vector STATS button after a game over reads « OK » (the native STATS has only OK); a review session (?level=) writes no best time', () => {
  const main = read('.compiled/main.js');
  const open = method(main, '    openStats(outcome) {');
  assert.match(open, /outcome === 'gameover' \? 'OK'/);
  assert.doesNotMatch(open, /'Menu principal'/);
  assert.match(open, /won && best !== stored && !this\.app\.review/, 'review sessions leave the storage untouched');
});
