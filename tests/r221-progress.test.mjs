// R2.0.21 — progression d'aventure, meilleurs scores, profil, sauvegarde et machine d'états
// (recherche 06 Q2–Q4, D-01..D-04, D-10, D-11). Module pur `progress.ts`, sans DOM ni localStorage.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as P from '../.compiled/progress.js';

const { afterWin, templeAfter, doorTemple, doorLetter, DOOR_COUNT, DOOR_MESSAGES, GOD_LINES, TEMPLE_NAMES } = P;

/** Shape of the current pack (levels per stage), copied as a test constant: no pack data is read. */
const SIZES = [5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 7, 7, 1];
const run = (stage, level, score = 0, lives = 3) => ({ stage, level, score, lives });

// ------------------------------------------------------------ progression (Q2 / Q3, 0x44f180, 0x44f530)

test('afterWin: next level of the same stage, no screen in between', () => {
  assert.deepEqual(afterWin(run(0, 0), 1200, 3, SIZES), { kind: 'next-level', run: run(0, 1, 1200, 3) });
  assert.deepEqual(afterWin(run(6, 5, 40000, 2), 41000, 4, SIZES), { kind: 'next-level', run: run(6, 6, 41000, 4) });
});

test('afterWin: end of a stage without temple → adventure screen on the next stage', () => {
  assert.deepEqual(afterWin(run(0, 4), 9000, 2, SIZES), { kind: 'stage-done', run: run(1, 0, 9000, 2), completed: 0, temple: null });
  assert.deepEqual(afterWin(run(3, 5), 30000, 3, SIZES), { kind: 'stage-done', run: run(4, 0, 30000, 3), completed: 3, temple: null });
});

test('afterWin: the last stage of each temple (2, 5, 8, 11) → temple 1..4', () => {
  const ends = [[2, 4, 1], [5, 5, 2], [8, 6, 3], [11, 6, 4]];
  for (const [stage, level, temple] of ends) {
    const r = afterWin(run(stage, level), 50000, 3, SIZES);
    assert.equal(r.kind, 'stage-done', `stage ${stage}`);
    assert.equal(r.completed, stage);
    assert.equal(r.temple, temple, `stage ${stage + 1} closes temple ${temple}`);
    assert.deepEqual(r.run, run(stage + 1, 0, 50000, 3));
  }
});

test('afterWin: the last stage of the progression is final (temple 5), never a return to 1-1', () => {
  assert.deepEqual(afterWin(run(12, 0, 200000, 2), 210000, 2, SIZES), { kind: 'final', temple: 5 });
  const short = [2, 2, 2];
  assert.deepEqual(afterWin(run(2, 1), 5000, 3, short), { kind: 'final', temple: 5 }, 'a shorter progression ends on its last stage');
  assert.equal(afterWin(run(2, 0), 5000, 3, short).kind, 'next-level');
  for (let s = 0; s < SIZES.length; s++) {
    for (let l = 0; l < SIZES[s]; l++) {
      const r = afterWin(run(s, l), 1, 1, SIZES);
      if (r.kind !== 'final') assert.ok(r.run.stage > s || r.run.level > l, `${s + 1}-${l + 1} moves forward`);
    }
  }
});

test('afterWin: out-of-range or non-finite positions are bounded, never an exception', () => {
  assert.equal(afterWin(run(99, 99), 0, 3, SIZES).kind, 'final', 'stage clamped to the last one');
  assert.deepEqual(afterWin(run(NaN, Infinity), 10, 3, SIZES), { kind: 'next-level', run: run(0, 1, 10, 3) }, 'non-finite → 0');
  assert.deepEqual(afterWin(run(0, 40), 10, 3, SIZES), { kind: 'stage-done', run: run(1, 0, 10, 3), completed: 0, temple: null }, 'level clamped to the last one');
  assert.deepEqual(afterWin(run(-3, -1), 10, 3, SIZES), { kind: 'next-level', run: run(0, 1, 10, 3) });
});

test('templeAfter: 2 → 1, 5 → 2, 8 → 3, 11 → 4, the last stage → 5, otherwise null (0x4317ec–0x43180e)', () => {
  for (const s of [0, 1, 3, 4, 6, 7, 9, 10]) assert.equal(templeAfter(s, 13), null, `stage ${s}`);
  assert.equal(templeAfter(2, 13), 1);
  assert.equal(templeAfter(5, 13), 2);
  assert.equal(templeAfter(8, 13), 3);
  assert.equal(templeAfter(11, 13), 4);
  assert.equal(templeAfter(12, 13), 5);
  assert.equal(templeAfter(2, 3), 5, 'last stage of a 3-stage progression');
  assert.equal(templeAfter(13, 20), 5, 'a stage index ≥ 12 is final in the original');
  assert.equal(templeAfter(NaN, 13), null);
});

test('doors: ADVDOOR{temple}{letter}, 12 doors, 3 per temple, bounded input', () => {
  assert.equal(DOOR_COUNT, 12);
  assert.deepEqual([doorTemple(0), doorLetter(0)], [1, 'A']);
  assert.deepEqual([doorTemple(4), doorLetter(4)], [2, 'B']);
  assert.deepEqual([doorTemple(8), doorLetter(8)], [3, 'C']);
  assert.deepEqual([doorTemple(11), doorLetter(11)], [4, 'C']);
  assert.deepEqual([doorTemple(12), doorLetter(12)], [4, 'C'], 'clamped to door 11');
  assert.deepEqual([doorTemple(-5), doorLetter(-5)], [1, 'A']);
  assert.deepEqual([doorTemple(NaN), doorLetter(Infinity)], [1, 'A']);
});

test('DOOR_MESSAGES: one key per door in the push order of 0x4422a0–0x442400 (research Q2, line 8)', () => {
  assert.deepEqual([...DOOR_MESSAGES], [
    'DO_YOU_DARE_ENTER_THE_ANCIENT_RUINS', 'THE_2ND_LEVEL_OF_THE_TEMPLE_AWAITS', 'WILL_YOU_DESCEND_TO_THE_THIRD_LEVEL',
    'YOU_HAVE_UNCOVERED_A_HIDDEN_DOOR', 'THE_GOLDEN_SECRETS_OF_ZUMA_AWAIT_YOU', 'DO_YOU_DARE_ENTER_THE_LAST_CHAMBER',
    'ANOTHER_LOST_TEMPLE', 'CAN_YOU_FULFILL_THE_PROPHECY_?', 'THE_LAST_STAGE_?',
    'RUINED_TEMPLE_RISES', 'THE_FINAL_SECRET', 'ENTER_THE_RUINS',
  ]);
});

test('GOD_LINES: god text keys and frog replies for temples 1..5 (A3)', () => {
  assert.deepEqual(Object.keys(GOD_LINES).map(Number).sort(), [1, 2, 3, 4, 5]);
  assert.deepEqual(GOD_LINES[1], { god: ['INTERLOPER_OF_PUNY'], reply: ['RIBBIT', 'I_BEG_TO_DIFFER'] });
  assert.deepEqual(GOD_LINES[2], { god: ['I_SEE_WHAT'], reply: ['RIBBIT', 'NEVER_GIVE_UP'] });
  assert.deepEqual(GOD_LINES[3], { god: ['NOT_POSSIBLE_TO_BELIEVE'], reply: ['RIBBIT', 'FULFILL_THE_PROPHECY'] });
  assert.deepEqual(GOD_LINES[4], { god: ['FINAL_TEMPLE_STRUCK', 'WE_COME_FROM_STAR'], reply: ['RIBBIT_?', 'IN_SPACE'] });
  assert.deepEqual(GOD_LINES[5], { god: ['EXCELLENT_WORK_FROG_ONE'], reply: ['RIBBIT_!', 'WERD'] });
});

test('TEMPLE_NAMES: four temples, non-empty French fallbacks (QUETZAL_QUATL / POPO_POYOLLI absent from the pack)', () => {
  assert.equal(TEMPLE_NAMES.length, 4);
  assert.deepEqual(TEMPLE_NAMES.map(t => t.key), ['TEMPLE_OF_ZUKULKAN', 'QUETZAL_QUATL', 'POPO_POYOLLI', 'SECRET_SHRINE_OF_ZUMA']);
  for (const t of TEMPLE_NAMES) assert.ok(typeof t.fallback === 'string' && t.fallback.trim().length > 0, t.key);
  assert.match(TEMPLE_NAMES[1].fallback, /QUETZAL QUATL/);
  assert.match(TEMPLE_NAMES[2].fallback, /POPO POYOLLI/);
});

test('bundle: progress after menudialog in MODULES, copied to dist/js, pure (no DOM, no storage global)', () => {
  // R2.0.21: progress after menudialog (plan 06-02).
  assert.match(fs.readFileSync('tools/build.mjs', 'utf8'), /'menudialog', 'progress', 'main'/);
  assert.ok(fs.existsSync('dist/js/progress.js'), 'dist/js/progress.js produced by the build');
  const src = fs.readFileSync('src/progress.ts', 'utf8');
  assert.doesNotMatch(src, /localStorage|window\.|document\./);
  assert.doesNotMatch(fs.readFileSync('.compiled/progress.js', 'utf8'), /^import /m, 'no import: the module stands alone');
});
