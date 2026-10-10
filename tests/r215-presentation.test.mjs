// R2.0.15 — écran STATS natif (plan 05-03) : mise en page, valeurs, record de temps, retrait du mode image R2.0.12.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { STATS_LAYOUT, STATS_COLORS, STATS_ORDER, statsRows, statsValues, bestTime, bestTimeKey, formatSeconds, wrapText } from '../.compiled/statsdialog.js';
import { importOriginal } from '../tools/import-original.mjs';

const inside = (x, r) => x >= r.x && x <= r.x + r.w;

test('STATS_LAYOUT: frame, columns, rules, button and head follow the R2.0.12 reference', () => {
  assert.deepEqual(STATS_LAYOUT.frame, { x: 109, y: 91, w: 422, h: 355 });
  const f = STATS_LAYOUT.frame;
  for (const x of [STATS_LAYOUT.left.labelX, STATS_LAYOUT.left.valueRight, STATS_LAYOUT.right.labelX, STATS_LAYOUT.right.valueRight, STATS_LAYOUT.separator.x, STATS_LAYOUT.rule.x1, STATS_LAYOUT.rule.x2, STATS_LAYOUT.ok.x, STATS_LAYOUT.ok.x + STATS_LAYOUT.ok.w]) {
    assert.ok(inside(x, f), `${x} inside the frame`);
  }
  assert.ok(STATS_LAYOUT.left.labelX < STATS_LAYOUT.left.valueRight && STATS_LAYOUT.left.valueRight < STATS_LAYOUT.separator.x, 'left column left of the separator');
  assert.ok(STATS_LAYOUT.right.labelX > STATS_LAYOUT.separator.x && STATS_LAYOUT.right.labelX < STATS_LAYOUT.right.valueRight, 'right column right of the separator');
  // R2.0.16 (D-18): the baselines come from statsRows(lineHeight) (1.65 × cap height, 19 px with Cancun12) instead of static values.
  const b = statsRows(19).left;
  assert.equal(b.length, 6);
  assert.equal(b[0], STATS_LAYOUT.left.first);
  for (let i = 1; i < b.length; i++) {
    const d = b[i] - b[i - 1];
    assert.ok(d >= 18 && d <= 20, `left baselines 18–20 px apart (${b[i - 1]} → ${b[i]})`);
  }
  const r = statsRows(19).right;
  assert.ok(r.time < r.objective && r.objective < r.rule && r.rule < r.bonus && r.bonus < r.record, 'right column order');
  assert.deepEqual(STATS_LAYOUT.ok, { x: 260, y: 382, w: 120, h: 48 }, 'OK = one DialogButton state, centred');
  assert.equal(STATS_LAYOUT.ok.x + STATS_LAYOUT.ok.w / 2, 320);
  assert.equal(STATS_LAYOUT.head.x, 320 - 78, 'GodHead (156 px) centred');
  assert.ok(STATS_LAYOUT.head.y < f.y, 'the head overlaps the top edge');
  assert.ok(STATS_LAYOUT.inset > 0 && STATS_LAYOUT.inset * 2 < Math.min(f.w, f.h), '9-slice inset');
  assert.equal(STATS_LAYOUT.title.x, 320);
  assert.ok(STATS_LAYOUT.tip.maxWidth <= f.w - 2 * STATS_LAYOUT.inset, 'tip fits inside the frame');
  // R2.0.17 (D-20, research 02 Q4): the right labels sit 200 px right of the left ones (x0 + 200), the values are
  // right-aligned inside their column (hypothesis B3), the tip is left-aligned after its label on two lines at most.
  assert.equal(STATS_LAYOUT.right.labelX - STATS_LAYOUT.left.labelX, 200);
  assert.ok(STATS_LAYOUT.left.valueRight <= STATS_LAYOUT.left.labelX + 180);
  assert.ok(STATS_LAYOUT.right.valueRight <= STATS_LAYOUT.right.labelX + 160);
  assert.equal(STATS_LAYOUT.tip.maxLines, 2);
  assert.equal(STATS_LAYOUT.tip.align, 'left');
});

test('STATS_COLORS and STATS_ORDER (D-02, D-05)', () => {
  // R2.0.16 (D-18, §8): the original colours read in 0x4525f0 (TEMPS 0xffff00, OBJECTIF 0xffa500, BONUS 0x2aff03, NO_TIME_BONUS 0x9dcba2) and the gold title multiplier.
  assert.deepEqual(STATS_COLORS, { label: '#f5d65b', value: '#fcf4d0', time: '#ffff00', objective: '#ffa500', bonus: '#2aff03', noBonus: '#9dcba2', record: '#fcdc80', title: '#f0c040' });
  assert.deepEqual([...STATS_ORDER], ['points', 'combos', 'coins', 'gaps', 'chain', 'comboMax', 'time', 'objective', 'bonus', 'record']);
});

const base = { levelScore: 1230, combos: 2, coins: 3, gaps: 1, maxStreak: 6, maxCombo: 2, seconds: 20, parTime: 25, timeBonus: 100, won: true, bestSeconds: 20, noBonusLabel: 'PAS DE BONUS' };

test('statsValues formats the ten lines (D-04, D-05)', () => {
  assert.deepEqual(statsValues(base), { points: '1230', combos: '2', coins: '3', gaps: '1', chain: '6', comboMax: '2', time: '20 s', objective: '25 s', bonus: '+100', record: '20 s' });
  assert.equal(statsValues({ ...base, won: false }).bonus, 'PAS DE BONUS', 'no bonus on a lost level');
  assert.equal(statsValues({ ...base, timeBonus: 0 }).bonus, 'PAS DE BONUS', 'no bonus when the par time is missed');
  assert.equal(statsValues({ ...base, parTime: 0 }).objective, '—', 'no par time → no objective');
  assert.equal(statsValues({ ...base, bestSeconds: null, seconds: 31 }).record, '31 s', 'first game: the record is the current time');
  assert.equal(statsValues({ ...base, seconds: 102, bestSeconds: 102 }).time, '1:42');
  assert.equal(statsValues({ ...base, seconds: 102, bestSeconds: 102 }).record, '1:42');
  assert.equal(statsValues({ ...base, levelScore: 0, combos: 0, coins: 0 }).points, '0');
});

test('bestTime keeps the best winning time (D-04)', () => {
  assert.equal(bestTime(null, 30, true), 30);
  assert.equal(bestTime(25, 30, true), 25);
  assert.equal(bestTime(40, 30, true), 30);
  assert.equal(bestTime(40, 30, false), 40, 'a lost level never changes the record');
  assert.equal(bestTime(null, 30, false), 30, 'no record yet: show the current time');
});

test('bestTimeKey sanitises the level id (T-05-08)', () => {
  assert.equal(bestTimeKey('spiral'), 'zuma.best.spiral');
  assert.equal(bestTimeKey('Proc 3/x'), 'zuma.best.proc-3-x');
  assert.equal(bestTimeKey('Été/1'), 'zuma.best.-t--1', 'every character outside [a-z0-9-] becomes -');
  assert.match(bestTimeKey('<script>'), /^zuma\.best\.[a-z0-9-]+$/);
});

test('formatSeconds lives in statsdialog (« 29 s », « 1:42 »)', () => {
  assert.equal(formatSeconds(29), '29 s');
  assert.equal(formatSeconds(102), '1:42');
  assert.equal(formatSeconds(-3), '0 s');
});

test('wrapText breaks on words within the width (tip lines)', () => {
  const measure = s => s.length * 10;
  assert.deepEqual(wrapText('Tirez sur les pièces pour des points bonus !', 200, measure), ['Tirez sur les pièces', 'pour des points', 'bonus !']);
  assert.deepEqual(wrapText('', 200, measure), []);
  assert.deepEqual(wrapText('Un&cr;deux', 200, measure), ['Un deux'], '&cr; is a space');
  assert.deepEqual(wrapText('Interminable', 50, measure), ['Interminable'], 'a word longer than the width stays whole');
});

// ---------------------------------------------------------------- picture mode R2.0.12 removed (D-01)
test('the R2.0.12 picture mode is gone: tool, loader methods, importer key', () => {
  assert.equal(fs.existsSync('tools/import-r212-stats.mjs'), false, 'tools/import-r212-stats.mjs deleted');
  const original = fs.readFileSync('.compiled/original.js', 'utf8');
  for (const word of ['cleanStats', 'statsArt', 'statsLayout']) assert.doesNotMatch(original, new RegExp(word), word);
  assert.match(original, /strings\(\)/, 'OriginalPack.strings() exists');
  assert.match(original, /export function bitmapUrl/, 'bitmapUrl exported for the composed dialog');
  assert.doesNotMatch(original, /bitmapfont/, 'original.ts does not import bitmapfont.ts (no cycle)');
  assert.doesNotMatch(fs.readFileSync('tools/import-original.mjs', 'utf8'), /stats_layout|statsLayout|extraDir/, 'importer: no extra/ block');
  assert.match(fs.readFileSync('tools/build.mjs', 'utf8'), /'bitmapfont', 'statsdialog', 'render'/, 'statsdialog in MODULES after bitmapfont');
});

test('the importer no longer emits statsLayout nor copies original/extra/', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-import-r215p-'));
  try {
    const src = path.join(root, 'original');
    const lvl = path.join(src, 'levels', 'foo');
    fs.mkdirSync(lvl, { recursive: true });
    fs.mkdirSync(path.join(src, 'sounds'), { recursive: true });
    fs.mkdirSync(path.join(src, 'images'), { recursive: true });
    fs.mkdirSync(path.join(src, 'extra'), { recursive: true });
    const xml = '<Levels>\n<Graphics id="foo" image="foo" curve="foopath" dispname="Foo" gx="10" gy="20">\n</Graphics>\n</Levels>';
    fs.writeFileSync(path.join(src, 'levels', 'levels.xml'), Buffer.from(xml, 'latin1'));
    fs.writeFileSync(path.join(lvl, 'Foo.jpg'), Buffer.from('BG'));
    fs.writeFileSync(path.join(src, 'sounds', 'pop.ogg'), Buffer.from('not really vorbis'));
    fs.writeFileSync(path.join(src, 'extra', 'stats_bg.png'), Buffer.from('PNG'));
    fs.writeFileSync(path.join(src, 'extra', 'stats_layout.json'), '{}');
    const out = path.join(root, 'pack');
    const pack = importOriginal(src, out, { transcode: false });
    assert.ok(!('statsLayout' in pack), 'no statsLayout key');
    assert.equal(pack.images.stats_bg, undefined, 'extra/ pictures are not imported');
    assert.equal(fs.existsSync(path.join(out, 'stats_layout.json')), false);
    assert.equal(fs.existsSync(path.join(out, 'images', 'stats_bg.png')), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test('main.js opens the native STATS through composeStatsDialog / bestTimeKey and never references the R2.0.12 picture', () => {
  const main = fs.readFileSync('.compiled/main.js', 'utf8');
  assert.match(main, /composeStatsDialog\(/);
  assert.match(main, /bestTimeKey\(/);
  assert.match(main, /key: 'pop'/, 'one pop per revealed line');
  assert.match(main, /key: 'button'/, 'button1 on OK');
  assert.doesNotMatch(main, /stats_bg/);
  assert.doesNotMatch(main, /statsArt|STATS_SLOT_IDS|'zuma\.best'/);
  assert.match(fs.readFileSync('index.html', 'utf8'), /id="result-expert">PAS DE BONUS</);
});

// ---------------------------------------------------------------- configFromSettings (GAME-01, plan 05-04)
import { configFromSettings } from '../.compiled/main.js';

test('configFromSettings: partime, zumaslow/zumaback (×0.6 → ticks), single and the temple colours (lvl35)', () => {
  // R2.0.16: start → startFraction, single → singleLimit (repair threshold), coinPoints derived from score (r216 locks the rest).
  const c = configFromSettings({ id: 'lvl35', speed: 0.6, start: 45, score: 4500, single: 8, zumaslow: 500, zumaback: 200, partime: 130 }, 3);
  assert.equal(c.parTime, 130, 'partime (s) → parTime');
  assert.equal(c.zumaSlowTicks, 300, 'zumaslow 500 steps at 100 Hz → 300 ticks');
  assert.equal(c.zumaBackTicks, 120, 'zumaback 200 steps at 100 Hz → 120 ticks');
  assert.equal(c.singleLimit, 8, 'single 8 → isolated-group repair threshold 8');
  assert.equal(c.target, 4500, 'score → target');
  assert.equal(c.colors, 5, 'temple 4 (stage index 3) → 5 colours');
  assert.equal(c.startFraction, 0.45, 'start 45 % of the track length');
  assert.equal(c.coinPoints, 700, '100 × ⌊4500 / 600⌋');
  assert.ok(Math.abs(c.speed - 60) < 1e-9, 'speed 0.6 px/step → 60 px/s');
});

test('configFromSettings: defaults, bounds and temple colours (T-05-11 / T-05-13)', () => {
  // R2.0.16: partime defaults to defaultParTime(score, curves) = 35 s at 1000 points, zumaslow / zumaback to 1100 / 300 maj (660 / 180 ticks).
  const d = configFromSettings({ id: 'x' }, 0);
  assert.equal(d.colors, 4, 'temple 1 → 4 colours');
  assert.equal(d.parTime, 35);
  assert.equal(d.zumaSlowTicks, 660);
  assert.equal(d.zumaBackTicks, 180);
  assert.equal(d.singleLimit, 10, 'repair disabled by default');
  assert.equal(d.startFraction, 0.4);
  assert.equal(configFromSettings({ id: 'x' }, 6).colors, 6, 'temple 7 → 6 colours');
  assert.equal(configFromSettings({ id: 'x' }, 4).colors, 5, 'temple 5 → 5 colours');
  assert.equal(configFromSettings({ id: 'x', colors: 9 }, 0).colors, 6, 'colors bounded to 6');
  assert.equal(configFromSettings({ id: 'x', colors: 1 }, 0).colors, 3, 'colors bounded to 3');
  assert.equal(configFromSettings({ id: 'x', single: 150 }, 0).singleLimit, 10, 'single bounded to 10');
  assert.equal(configFromSettings({ id: 'x', single: -5 }, 0).singleLimit, 0);
  assert.equal(configFromSettings({ id: 'x', zumaslow: -10, zumaback: Number.NaN }, 0).zumaSlowTicks, 0, 'negative → 0');
  assert.equal(configFromSettings({ id: 'x', zumaslow: -10, zumaback: Number.NaN }, 0).zumaBackTicks, 180, 'NaN → default');
  assert.equal(configFromSettings({ id: 'x', zumaslow: Number.POSITIVE_INFINITY }, 0).zumaSlowTicks, 660, 'non-finite → default');
  assert.equal(configFromSettings({ id: 'x', partime: -3 }, 0).parTime, 35, 'negative partime → default par time');
  assert.equal(configFromSettings(undefined, 0).parTime, 35, 'no settings → defaults');
});

test('render.js draws the coin and its sparkle; main.js shows GET_READY then reacts to go (D-08, D-11)', () => {
  const render = fs.readFileSync('.compiled/render.js', 'utf8');
  assert.match(render, /drawCoin\(/);
  assert.match(render, /sparkleFrame\(/);
  assert.match(render, /coinFrame\(/);
  const main = fs.readFileSync('.compiled/main.js', 'utf8');
  assert.match(main, /GET_READY/);
  assert.match(main, /'go'/);
  assert.match(main, /'cleanup'/);
  assert.match(main, /setTreasure\(/);
});

test('standalone bundle: no top-level identifier is declared by two modules (concatenated module scope)', () => {
  // R2.0.15 regression: `clamp01` (audio/feedback) and `canvasOf` (original/bitmapfont) made the single-file build a SyntaxError.
  const modules = ['core', 'feedback', 'levels', 'audio', 'upscale', 'original', 'bitmapfont', 'statsdialog', 'render', 'main']; // R2.0.17: upscale.js (EPX) added before original
  assert.match(fs.readFileSync('tools/build.mjs', 'utf8'), new RegExp(`const MODULES = \\[${modules.map(m => `'${m}'`).join(', ')}\\]`), 'MODULES list mirrored');
  const owners = new Map();
  for (const m of modules) {
    const src = fs.readFileSync(`.compiled/${m}.js`, 'utf8');
    for (const match of src.matchAll(/^(?:export )?(?:const|let|class|function|async function) +([A-Za-z_$][\w$]*)/gm)) {
      const name = match[1];
      assert.ok(!owners.has(name), `${name} declared in both ${owners.get(name)} and ${m}`);
      owners.set(name, m);
    }
  }
});

test('standalone bundle: the stripped concatenation keeps no import / export / re-export and parses as one script', () => {
  // R2.0.15 regression: `export { formatSeconds } from './statsdialog.js';` survived the strip and made the single file fetch a module (CORS on file://).
  const bundler = fs.readFileSync('tools/build.mjs', 'utf8');
  const m = bundler.match(/const strip = (s => [^\n]*);\n/);
  assert.ok(m, 'strip arrow found in build.mjs');
  const strip = new Function(`return ${m[1]}`)();
  const modules = ['core', 'feedback', 'levels', 'audio', 'upscale', 'original', 'bitmapfont', 'statsdialog', 'render', 'main']; // R2.0.17: upscale.js (EPX) added before original
  const js = modules.map(name => strip(fs.readFileSync(`.compiled/${name}.js`, 'utf8'))).join('\n');
  assert.doesNotMatch(js, /^(import|export) /m, 'no module statement left');
  assert.doesNotMatch(js, /from '\.\/[a-z]+\.js'/, 'no module specifier left');
  assert.doesNotThrow(() => new vm.Script(js, { filename: 'zuma-standalone.js' }), 'the concatenation parses as a single script');
});
