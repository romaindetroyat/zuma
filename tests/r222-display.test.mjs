import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';

/**
 * R2.0.22 — affichage des records partagés avec les graphismes du jeu (06.1-CONTEXT D-09, D-01): the best time with
 * its holder's first name and the personal best in the original STATS grid (sixth row of the right column, aligned on
 * COMBO MAX.), the « TOUS » / « MOI » scope on the RECORDS plaque of the adventure and ending screens, and the pure
 * hit tests of both plaques. Without records data every screen draws exactly the call sequence of R2.0.21: the
 * reference digests below were captured on the R2.0.21 sources before any change (plan 06.1-04).
 */
const S = () => import('../.compiled/statsdialog.js');
const read = file => fs.readFileSync(file, 'utf8');

/** Canvas 2D stand-in that records every call and property write (Node has no canvas), as in r221-adventure. */
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

/** SHA-256 of a recorded call sequence (the R2.0.21 references are kept as digests). */
const digest = calls => crypto.createHash('sha256').update(JSON.stringify(calls)).digest('hex');

/** Width of the STATS text font measured on the R2.0.20 capture (≈ 9.6 px per capital). */
const PER_CHAR = 9.6;
const m = s => PER_CHAR * [...String(s)].length;

const pic = (name, width, height) => ({ name, width, height });
/** A bitmap font stand-in that records its draws into the context's call list. */
const fakeFont = (name, perChar = PER_CHAR, cap = 11) => ({
  name, pixelScale: 1, ascent: 14, height: 17, capHeight: cap,
  measure: s => perChar * [...String(s)].length,
  draw(ctx, text, x, y, options = {}) { ctx.calls.push({ op: 'font', font: name, text, x, y, options }); return perChar * [...String(text)].length; },
});

// ---------------------------------------------------------------- STATS (Task 1)

const statsKit = () => ({
  frame: pic('dialogbox', 243, 242), head: pic('godhead', 156, 140), button: pic('dialogbutton', 360, 48),
  fonts: { title: fakeFont('title', 12), text: fakeFont('text'), tip: fakeFont('tip', 7), tipSmall: fakeFont('small', 6) },
  strings: { TIP: 'ASTUCE', BEST_TIME: 'RECORD' }, pixelScale: 1,
});
const statsValuesFixture = { points: '12340', combos: '3', coins: '1', gaps: '2', chain: '14', comboMax: '4', time: '1:23', objective: '1:40', bonus: '+1700', record: '1:23' };
const TIP = 'Tirez sur les pièces pour gagner des points en plus.';

function composeCalls(compose, options) {
  const ctx = recorder();
  const canvas = { width: 0, height: 0, getContext: () => ctx };
  compose(statsKit(), statsValuesFixture, { button: 'normal', tip: TIP, ...options }, canvas, 1);
  return ctx.calls;
}

/** Call sequences of composeStatsDialog in R2.0.21 (no `record` option), revealed 10 and 9. */
const STATS_R221 = {
  revealed10: 'd9c23ac07d6a74c9cca87679be5a11f1a0a0d2f648674a10bf003a3d60b9c534',
  revealed9: '39f08e9be7e822d3ffeddf98d91fa176fc0add18d0bc6a02ba0eff594d2678a7',
};

test('composeStatsDialog without records data: the R2.0.21 call sequence, unchanged (references captured before the change)', async () => {
  const { composeStatsDialog } = await S();
  assert.equal(digest(composeCalls(composeStatsDialog, { revealed: 10 })), STATS_R221.revealed10);
  assert.equal(digest(composeCalls(composeStatsDialog, { revealed: 9 })), STATS_R221.revealed9);
  assert.equal(digest(composeCalls(composeStatsDialog, { revealed: 10, record: { name: null, personal: null } })), STATS_R221.revealed10, 'empty cells draw nothing');
  assert.equal(digest(composeCalls(composeStatsDialog, { revealed: 10, record: { name: '', personal: '' } })), STATS_R221.revealed10, 'empty strings draw nothing');
});

test('recordLabel: « 1:23 (Sophie) » for the vector / DOM panel, the time alone without a name', async () => {
  const { recordLabel } = await S();
  assert.equal(recordLabel('1:23', 'Sophie'), '1:23 (Sophie)');
  assert.equal(recordLabel('45 s', null), '45 s');
  assert.equal(recordLabel('45 s', ''), '45 s');
  assert.equal(recordLabel('45 s', '   '), '45 s', 'a blank name is no name');
});

test('layoutRecordRow: the holder alone → « (SOPHIE) » right-aligned on x 489 (valueRight of the right column), no personal cell', async () => {
  const { layoutRecordRow, STATS_LAYOUT } = await S();
  assert.equal(STATS_LAYOUT.right.labelX, 335);
  assert.equal(STATS_LAYOUT.right.valueRight, 489);
  const row = layoutRecordRow({ name: 'SOPHIE', personal: null }, m);
  assert.deepEqual(row, { personal: null, name: { text: '(SOPHIE)', right: 489 } });
  assert.deepEqual(layoutRecordRow({ name: 'Sophie', personal: null }, m).name.text, '(SOPHIE)', 'capitals like every text of the dialog');
  assert.deepEqual(layoutRecordRow({ name: null, personal: null }, m), { personal: null, name: null });
  assert.deepEqual(layoutRecordRow({ name: '', personal: '' }, m), { personal: null, name: null });
});

test('layoutRecordRow: a differing personal best → « MOI » at x 335, its time 6 px after, the holder shortened to the room left (≥ 8 px gap)', async () => {
  const { layoutRecordRow } = await S();
  const row = layoutRecordRow({ name: 'SOPHIE', personal: '1:30' }, m);
  assert.deepEqual(row.personal, { label: 'MOI', labelX: 335, value: '1:30', valueX: 335 + m('MOI') + 6 });
  const left = row.personal.valueX + m('1:30') + 8;
  assert.equal(row.name.right, 489);
  assert.ok(489 - m(row.name.text) >= left, `« ${row.name.text} » fits between ${left} and 489`);
  assert.equal(row.name.text, '(SOPH.)', '« (SOPHIE) » (76.8 px) does not fit in 72.8 px: code points cut, « . » appended');
  assert.deepEqual(layoutRecordRow({ name: null, personal: '1:30' }, m).name, null, 'the personal best alone');
  assert.equal(layoutRecordRow({ name: 'AL', personal: '1:30' }, m).name.text, '(AL)', 'a short name is kept whole');
  assert.equal(layoutRecordRow({ name: 'AL', personal: '1:30' }, m, 'PERSO').personal.label, 'PERSO', 'label override');
});

test('layoutRecordRow: a 20-letter name is shortened (« .) »), never wider than the room; too narrow a room → « (S.) » at least; never left of x 335', async () => {
  const { layoutRecordRow } = await S();
  const long = 'ABCDEFGHIJKLMNOPQRST';
  const alone = layoutRecordRow({ name: long, personal: null }, m);
  assert.match(alone.name.text, /^\(ABCD[A-Z]*\.\)$/);
  assert.ok(489 - m(alone.name.text) >= 335, 'inside the right column');
  assert.ok(m(alone.name.text) + PER_CHAR > 489 - 335, 'as long as the column allows');
  const both = layoutRecordRow({ name: long, personal: '1:30' }, m);
  const left = both.personal.valueX + m('1:30') + 8;
  assert.match(both.name.text, /\.\)$/);
  assert.ok(489 - m(both.name.text) >= left, 'never over the personal time');
  const narrow = layoutRecordRow({ name: 'SOPHIE', personal: '59:59 59:59' }, m);
  assert.equal(narrow.name.text, '(S.)', 'one letter and « . » at least');
  assert.ok(489 - m(narrow.name.text) >= 335);
  const emoji = layoutRecordRow({ name: '😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀😀', personal: null }, m);
  assert.ok(!/[\ud800-\udbff]\.\)$/.test(emoji.name.text), 'cut on code points, never inside a surrogate pair');
});

test('composeStatsDialog with records: the sixth right row (baseline statsRows(lh).left[5], aligned on COMBO MAX.) once RECORD is revealed, nothing else changes', async () => {
  const { composeStatsDialog, statsRows, STATS_COLORS, STATS_LINE_RATIO, STATS_LINE_MIN, STATS_LINE_MAX, layoutRecordRow } = await S();
  const lh = Math.max(STATS_LINE_MIN, Math.min(STATS_LINE_MAX, Math.round(STATS_LINE_RATIO * 11)));
  const baseline = statsRows(lh).left[5];
  const record = { name: 'SOPHIE', personal: '1:30' };
  const calls = composeCalls(composeStatsDialog, { revealed: 10, record });
  const extra = calls.filter(c => c.op === 'font' && c.y === baseline && c.x >= 335);
  const row = layoutRecordRow(record, m);
  assert.deepEqual(extra.map(c => [c.font, c.text, c.x, c.options.tint, c.options.align ?? 'left']), [
    ['text', 'MOI', 335, STATS_COLORS.label, 'left'],
    ['text', '1:30', row.personal.valueX, STATS_COLORS.record, 'left'],
    ['text', row.name.text, 489, STATS_COLORS.record, 'right'],
  ]);
  const rest = calls.filter(c => !extra.includes(c));
  assert.equal(digest(rest), STATS_R221.revealed10, 'every other call is the R2.0.21 one, in the same order');
  const comboMax = calls.find(c => c.op === 'font' && c.text === 'COMBO MAX.');
  assert.equal(comboMax.y, baseline, 'aligned on COMBO MAX.');
  assert.ok(baseline < 320, 'above the tip inset (y 320)');
  // Revealed with the RECORD value only.
  assert.equal(digest(composeCalls(composeStatsDialog, { revealed: 9, record })), STATS_R221.revealed9, 'hidden before RECORD');
  const nameOnly = composeCalls(composeStatsDialog, { revealed: 10, record: { name: 'SOPHIE', personal: null } }).filter(c => c.op === 'font' && c.y === baseline && c.x >= 335);
  assert.deepEqual(nameOnly.map(c => [c.text, c.x, c.options.tint, c.options.align]), [['(SOPHIE)', 489, STATS_COLORS.record, 'right']]);
  // The RECORD row itself keeps « RECORD » + the time (never replaced by « 1:23 (SOPHIE) »).
  const recordRow = calls.filter(c => c.op === 'font' && c.y === statsRows(lh).right.record && c.x >= 335).map(c => c.text);
  assert.deepEqual(recordRow, ['RECORD', '1:23']);
});

test('source locks: statsdialog.js draws the sixth row through layoutRecordRow(; no DOM text injection in the drawing modules', () => {
  const src = read('.compiled/statsdialog.js');
  assert.match(src, /layoutRecordRow\(/);
  assert.match(src, /export function recordLabel/);
  for (const file of ['src/statsdialog.ts', 'src/adventure.ts']) assert.doesNotMatch(read(file), /innerHTML|textContent|insertAdjacentHTML/, file);
});
