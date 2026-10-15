// R2.0.19 — présentation : sons du power-up, du contact et de l'impact, compteur de vies et barre du haut
// (spike 04, D-32 / D-33 / D-34).
// Aucun son quand une bille devient power-up ; le contact entre deux segments joue `ballclick1` à 0,8 au plus une fois
// toutes les 250 ms, l'impact d'un projectile sur la chaîne `ballclick2` ; la barre du haut montre vies − 1 grenouilles
// (trois au plus, puis une et « xN »), clignotantes 1,5 s après une vie gagnée, et ses éléments sont recalés sur les
// ovales de `Menubar.jpg`.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { soundCues, cueAllowed, CUE_GUARD_MS } from '../.compiled/feedback.js';
import { SOUND_MAP } from '../tools/import-original.mjs';

const read = file => fs.readFileSync(file, 'utf8');
/** Body of a compiled method / function from its signature up to the next line starting at the same indent with `}`. */
const body = (src, signature) => {
  const start = src.indexOf(signature);
  assert.ok(start >= 0, `${signature} compiled`);
  const indent = src.slice(src.lastIndexOf('\n', start) + 1, start).match(/^\s*/)[0];
  const end = src.indexOf(`\n${indent}}`, start);
  return src.slice(start, end > 0 ? end : undefined);
};
const ev = (kind, extra = {}) => ({ tick: 1, kind, ...extra });

// ---------------------------------------------------------------- sons (D-32, D-34)

test('power-spawn plays nothing (0x40ae70 → 0x401430 read no SOUND_*); the activation keeps its sound', () => {
  assert.deepEqual(soundCues(ev('power-spawn', { power: 'slow' })), []);
  assert.deepEqual(soundCues(ev('power-activate', { power: 'slow' })), [{ key: 'powerslow', gain: 1, rate: 1 }]);
  assert.deepEqual(soundCues(ev('power-activate', { power: 'bomb' })), [{ key: 'powerbomb', gain: 1, rate: 1 }]);
});

test('contact = merge at 0.8 (BALLCLICK1 volume 0.80), impact = insert at 1, ball-exit silent', () => {
  assert.deepEqual(soundCues(ev('merge', { leftId: 1, rightId: 2, chain: 0 })), [{ key: 'merge', gain: 0.8, rate: 1 }]);
  assert.deepEqual(soundCues(ev('insert', { id: 3 })), [{ key: 'insert', gain: 1, rate: 1 }]);
  assert.deepEqual(soundCues(ev('ball-exit', { chain: 0, id: 4, color: 1 })), []);
});

test('SOUND_MAP: insert → ballclick2 (projectile impact, 0x42203c), merge → ballclick1 (contact, 0x42196b), no powerup; nothing else moves', () => {
  assert.equal(SOUND_MAP.insert, 'ballclick2');
  assert.equal(SOUND_MAP.merge, 'ballclick1');
  assert.equal('powerup' in SOUND_MAP, false);
  // R2.0.18 map without `powerup`, insert / merge swapped.
  const expected = {
    fire: 'fireball1', insert: 'ballclick2', merge: 'ballclick1', swap: 'pop', zuma: 'chant4',
    levelwin: 'chant5', lose: 'chant14', gameover: 'chant8', destroy1: 'ballsdestroyed1',
    destroy2: 'ballsdestroyed2', destroy3: 'ballsdestroyed3', destroy4: 'ballsdestroyed4',
    destroy5: 'ballsdestroyed5', combo: 'chime1', streak: 'chain1', gap: 'gapbonus1',
    powerbomb: 'bombexplode', powerslow: 'slowdown1', powerback: 'reverse1',
    poweraccuracy: 'accuracy3', gamestart: 'chant1', levelup: 'chant2', warning: 'warning1',
    rolling: 'rolling', extralife: 'extralife', bonuspop: 'endoflevelpop1', button: 'button1',
    button2: 'button2', coin: 'coingrab', frogland: 'frogland2', earthquake: 'earthquake',
    lighttrail: 'lighttrail2', trailend: 'chant3', templecomplete: 'chant6', choral: 'choral1', ufo: 'ufo1',
    coinappear: 'jewelappear', coinvanish: 'gemvanishes', pop: 'pop',
  };
  assert.deepEqual({ ...SOUND_MAP }, expected);
});

test('cueAllowed: merge at most once per 250 ms (0x401c70), other keys always, non-finite clock allowed without state', () => {
  assert.deepEqual({ ...CUE_GUARD_MS }, { merge: 250 });
  const m = new Map();
  assert.equal(cueAllowed(m, 'merge', 1000), true);
  assert.equal(cueAllowed(m, 'merge', 1100), false);
  assert.equal(cueAllowed(m, 'merge', 1249), false);
  assert.equal(cueAllowed(m, 'merge', 1250), true);
  assert.equal(cueAllowed(m, 'merge', 1300), false, 'the guard restarts from the last play');
  for (let t = 0; t < 1000; t += 10) assert.equal(cueAllowed(m, 'insert', t), true, 'insert has no guard');
  const n = new Map();
  assert.equal(cueAllowed(n, 'merge', NaN), true);
  assert.equal(n.size, 0, 'nothing recorded for a non-finite clock');
  assert.equal(cueAllowed(n, 'merge', 5), true);
});

test('main.js plays every cue through cueAllowed; audio.js has no powerup fallback', () => {
  const main = read('.compiled/main.js');
  const handle = body(main, 'handleEvents(events, engine) {');
  assert.match(handle, /soundCues\(e\)\)[\s{]*this\.playCue\(cue\)/, 'event cues go through playCue');
  assert.doesNotMatch(handle, /this\.audio\.play\(/, 'no direct play in handleEvents');
  const play = body(main, 'playCue(cue) {');
  const guard = play.indexOf('cueAllowed(');
  assert.ok(guard > 0 && guard < play.indexOf('this.audio.play(cue)'), 'cueAllowed before audio.play');
  assert.match(play, /performance\.now\(\)/);
  const audio = read('.compiled/audio.js');
  assert.doesNotMatch(audio, /\bpowerup\s*:/, 'no powerup synth');
});

test('local pack (when present): insert.ogg is ballclick2, merge.ogg is ballclick1, no powerup in the manifest', { skip: !fs.existsSync('private_assets/pack/sounds/manifest.json') }, () => {
  const pack = 'private_assets/pack/sounds/';
  const original = 'private_assets/original/sounds/';
  if (fs.existsSync(original + 'ballclick2.ogg')) {
    assert.ok(fs.readFileSync(pack + 'insert.ogg').equals(fs.readFileSync(original + 'ballclick2.ogg')), 'insert.ogg = ballclick2.ogg');
    assert.ok(fs.readFileSync(pack + 'merge.ogg').equals(fs.readFileSync(original + 'ballclick1.ogg')), 'merge.ogg = ballclick1.ogg');
  }
  const manifest = JSON.parse(read(pack + 'manifest.json'));
  assert.equal('powerup' in manifest.sounds, false);
});

// ---------------------------------------------------------------- vies et barre du haut (D-33, 0x40fa90)
import { lifeIcons, livesHidden, HUD_LAYOUT, Renderer } from '../.compiled/render.js';

test('lifeIcons: N = lives − 1 in reserve (lives while dying); up to 3 icons, beyond one icon and « xN »', () => {
  assert.deepEqual(lifeIcons(3), { icons: 2, count: 2, label: null });
  assert.deepEqual(lifeIcons(4), { icons: 3, count: 3, label: null });
  assert.deepEqual(lifeIcons(5), { icons: 1, count: 4, label: 'x4' });
  assert.deepEqual(lifeIcons(6), { icons: 1, count: 5, label: 'x5' });
  assert.deepEqual(lifeIcons(1), { icons: 0, count: 0, label: null });
  assert.deepEqual(lifeIcons(0), { icons: 0, count: 0, label: null });
  assert.deepEqual(lifeIcons(2, true), { icons: 2, count: 2, label: null }, 'state 2 (0x428391): the frog in play is counted');
  assert.deepEqual(lifeIcons(4, true), { icons: 1, count: 4, label: 'x4' });
  for (const bad of [-2, NaN, Infinity, -Infinity]) assert.deepEqual(lifeIcons(bad), { icons: 0, count: 0, label: null }, String(bad));
  assert.deepEqual(lifeIcons(13.7), { icons: 1, count: 12, label: 'x12' }, 'fractions truncated');
});

test('livesHidden: 1.5 s blink after an extra life, hidden while ⌊left × 5 / 3⌋ & 16 (board+0x178 = 150 maj)', () => {
  const formula = left => left > 0 && (Math.floor((left * 5) / 3) & 16) !== 0;
  const table = Array.from({ length: 91 }, (_, left) => livesHidden(left));
  assert.deepEqual(table, Array.from({ length: 91 }, (_, left) => formula(left)));
  assert.equal(livesHidden(0), false);
  assert.equal(livesHidden(90), true, '150 maj: 150 & 16 = 16');
  assert.equal(livesHidden(80), false, '133 maj: 133 & 16 = 0');
  let flips = 0;
  for (let i = 1; i < table.length; i++) if (table[i] !== table[i - 1]) flips++;
  assert.ok(flips >= 8, `alternates every ≈ 10 ticks (${flips} flips over 90 ticks)`);
  for (const bad of [NaN, Infinity, -5]) assert.equal(livesHidden(bad), false, String(bad));
});

test('HUD_LAYOUT: the original slots (0x40fbe7–0x40fca2, 0x41c9a6), inside the band, disjoint and in their ovals', () => {
  assert.deepEqual(HUD_LAYOUT, {
    lives: { x: 28, y: 3, step: 35, max: 3, label: { x: 67, baseline: 22 } },
    level: { cx: 200, baseline: 15 },
    score: { right: 360, baseline: 17 },
    gauge: { x: 409, y: 2 },
    menu: { x: 519, y: 3, w: 99, h: 25 },
  });
  const L = HUD_LAYOUT;
  const boxes = {
    lives: { x: L.lives.x, y: L.lives.y, w: L.lives.step * (L.lives.max - 1) + 24, h: 23 },
    level: { x: L.level.cx - 30, y: 3, w: 60, h: 16 },
    score: { x: L.score.right - 88, y: 3, w: 88, h: 18 },
    gauge: { x: L.gauge.x, y: L.gauge.y, w: 62, h: 18 },
    menu: { ...L.menu },
  };
  const list = Object.entries(boxes);
  for (const [name, b] of list) assert.ok(b.x >= 0 && b.y >= 0 && b.x + b.w <= 640 && b.y + b.h <= 44, `${name} inside 640 × 44`);
  for (let i = 0; i < list.length; i++) for (let j = i + 1; j < list.length; j++) {
    const [na, a] = list[i];
    const [nb, b] = list[j];
    assert.ok(a.x + a.w <= b.x || b.x + b.w <= a.x || a.y + a.h <= b.y || b.y + b.h <= a.y, `${na} / ${nb} disjoint`);
  }
  // Ovals of Menubar.jpg measured in shots-r219/hud-measure.log: green 22–125, red 168–230, black 272–368, red 408–470, green 518–615.
  const inside = (b, lo, hi, tol = 0) => b.x >= lo - tol && b.x + b.w <= hi + tol;
  assert.ok(inside(boxes.lives, 22, 125), 'frogs in the left green oval');
  assert.ok(L.lives.label.x > L.lives.x + 24 && L.lives.label.x < 125, '« xN » after the first frog, in the green oval');
  assert.ok(L.level.cx > 168 && L.level.cx < 230, 'level label centred in the left red oval');
  assert.ok(L.score.right > 272 && L.score.right <= 368, 'score in the black oval');
  assert.ok(inside(boxes.gauge, 408, 470, 1), 'gauge in the right red oval');
  assert.ok(inside(boxes.menu, 518, 615, 3), 'MENU in the right green oval');
});

test('hitTest on the original bar: MENU at (568, 15), nothing where MENU used to be; STATS unchanged', () => {
  const canvas = { width: 0, height: 0, getContext: () => ({}) };
  const bar = new Renderer(canvas, { menubar: {} });
  assert.equal(bar.hitTest(568, 15), 'menu');
  assert.equal(bar.hitTest(520, 4), 'menu');
  assert.equal(bar.hitTest(74, 15), null);
  assert.equal(bar.hitTest(640 - 86 + 30, 480 - 30 + 10), 'stats');
  const vector = new Renderer(canvas, null);
  assert.equal(vector.hitTest(40, 20), 'menu', 'vector HUD unchanged');
});

test('render.js: both HUDs use lifeIcons(hud.lives, hud.dying) and livesHidden; « xN » in the float font tinted yellow; gauge and MENU at their slots', () => {
  const hud = body(read('.compiled/render.js'), '    drawHud(hud, frame) {');
  assert.equal((hud.match(/lifeIcons\(hud\.lives, hud\.dying\)/g) || []).length, 2);
  assert.doesNotMatch(hud, /lifeIcons\(hud\.lives, [36]\)/);
  assert.match(hud, /livesHidden\(hud\.livesBlink\)/);
  assert.match(hud, /fonts\?\.float/);
  assert.match(hud, /#ffff00/);
  assert.doesNotMatch(hud, /fillText\('MENU', 74/);
  assert.doesNotMatch(hud, /`\+\$\{/, 'no « +N » for the lives');
  assert.match(hud, /HUD_LAYOUT\.gauge/);
  assert.match(hud, /HUD_LAYOUT\.menu/);
  assert.match(hud, /menuButton/);
});

test('main.js: hud() passes dying and livesBlink; extra-life arms a 90-tick blink without text; loss message on lives > 0; menubutton loaded', () => {
  const main = read('.compiled/main.js');
  const hud = body(main, '    hud(engine) {');
  assert.match(hud, /dying: /);
  assert.match(hud, /'draining'/);
  assert.match(hud, /'lost'/);
  assert.match(hud, /'gameover'/);
  assert.match(hud, /livesBlink: /);
  const start = main.indexOf("case 'extra-life'");
  assert.ok(start > 0, "case 'extra-life' compiled");
  const block = main.slice(start, main.indexOf('break;', start));
  assert.match(block, /livesBlinkUntil = engine\.tick \+ 90/, '150 maj × 0.6');
  assert.doesNotMatch(block, /this\.float\(/, 'no text (spike 03 Q3)');
  assert.match(main, /engine\.lives > 0 \?/);
  assert.match(main, /masked\('menubutton'\)/);
});
