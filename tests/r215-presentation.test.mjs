// R2.0.15 — écran STATS natif (plan 05-03) : mise en page, valeurs, record de temps, retrait du mode image R2.0.12.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { STATS_LAYOUT, STATS_COLORS, STATS_ORDER, statsValues, bestTime, bestTimeKey, formatSeconds, wrapText } from '../.compiled/statsdialog.js';
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
  const b = STATS_LAYOUT.left.baselines;
  assert.equal(b.length, 6);
  for (let i = 1; i < b.length; i++) {
    const d = b[i] - b[i - 1];
    assert.ok(d >= 18 && d <= 20, `left baselines 18–20 px apart (${b[i - 1]} → ${b[i]})`);
  }
  const r = STATS_LAYOUT.right.baselines;
  assert.ok(r.time < r.objective && r.objective < r.rule && r.rule < r.bonus && r.bonus < r.record, 'right column order');
  assert.deepEqual(STATS_LAYOUT.ok, { x: 260, y: 382, w: 120, h: 48 }, 'OK = one DialogButton state, centred');
  assert.equal(STATS_LAYOUT.ok.x + STATS_LAYOUT.ok.w / 2, 320);
  assert.equal(STATS_LAYOUT.head.x, 320 - 78, 'GodHead (156 px) centred');
  assert.ok(STATS_LAYOUT.head.y < f.y, 'the head overlaps the top edge');
  assert.ok(STATS_LAYOUT.inset > 0 && STATS_LAYOUT.inset * 2 < Math.min(f.w, f.h), '9-slice inset');
  assert.equal(STATS_LAYOUT.title.x, 320);
  assert.ok(STATS_LAYOUT.tip.maxWidth <= f.w - 2 * STATS_LAYOUT.inset, 'tip fits inside the frame');
});

test('STATS_COLORS and STATS_ORDER (D-02, D-05)', () => {
  assert.deepEqual(STATS_COLORS, { label: '#f5d65b', value: '#fcf4d0', time: '#58d828', objective: '#f0962c', bonus: '#58d828', record: '#fcdc80', title: null });
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
  assert.equal(bestTimeKey('Été/1'), 'zuma.best.-t-1');
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
