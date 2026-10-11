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
