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
  // R2.0.21 (D-01): welcome comes between progress and main (plan 06-03).
  assert.match(fs.readFileSync('tools/build.mjs', 'utf8'), /'menudialog', 'progress', 'welcome', 'main'/);
  assert.ok(fs.existsSync('dist/js/progress.js'), 'dist/js/progress.js produced by the build');
  const src = fs.readFileSync('src/progress.ts', 'utf8');
  assert.doesNotMatch(src, /localStorage|window\.|document\./);
  assert.doesNotMatch(fs.readFileSync('.compiled/progress.js', 'utf8'), /^import /m, 'no import: the module stands alone');
});

// ------------------------------------------------------------ meilleurs scores (Q4, 0x427d60, 0x426f20)

const entry = (name, score, extra = {}) => ({ name, score, stage: 0, level: 0, date: '', ...extra });
const full = () => Array.from({ length: 10 }, (_, i) => entry(`J${i}`, 20000 - i * 2000)); // 20 000 … 2 000

test('high-score constants: key, ten entries (0x427d8d cmp …, 0xa), profile and save keys', () => {
  assert.equal(P.HIGHSCORE_KEY, 'zuma.highscores.v1');
  assert.equal(P.HIGHSCORE_MAX, 10);
  assert.equal(P.PROFILE_KEY, 'zuma.profile.v1');
  assert.equal(P.SAVE_KEY, 'zuma.save.v1');
});

test('defaultScores: three demonstration entries 10 000 / 5 000 / 1 000 with the planner names (no PopCap name)', () => {
  const d = P.defaultScores();
  assert.deepEqual(d.map(e => e.score), [10000, 5000, 1000]);
  assert.deepEqual(d.map(e => e.name), ['Zuma', 'Grenouille', 'Têtard']);
  for (const e of d) assert.deepEqual([e.stage, e.level, e.date], [0, 0, '']);
  d[0].score = 1;
  assert.equal(P.defaultScores()[0].score, 10000, 'a fresh copy each call');
});

test('insertScore: sorted insertion, rank, after equal scores, at most 10, input never mutated', () => {
  const base = P.defaultScores();
  const frozen = structuredClone(base);
  const a = P.insertScore(base, entry('Romain', 7000));
  assert.equal(a.rank, 1);
  assert.deepEqual(a.list.map(e => e.score), [10000, 7000, 5000, 1000]);
  assert.deepEqual(base, frozen, 'input untouched');
  const tie = P.insertScore(base, entry('Romain', 5000));
  assert.equal(tie.rank, 2, 'after the existing 5 000');
  assert.deepEqual(tie.list.map(e => e.name), ['Zuma', 'Grenouille', 'Romain', 'Têtard']);
  const last = P.insertScore(base, entry('Romain', 0));
  assert.equal(last.rank, 3, 'a short list always takes the entry');
  const f = full();
  const out = P.insertScore(f, entry('Romain', 1000));
  assert.equal(out.rank, null, 'fell out of a full table');
  assert.equal(out.list.length, 10);
  assert.deepEqual(out.list, f);
  const equalLast = P.insertScore(f, entry('Romain', 2000));
  assert.equal(equalLast.rank, null, 'equal to the 10th: placed after it, so out');
  const top = P.insertScore(f, entry('Romain', 50000));
  assert.equal(top.rank, 0);
  assert.equal(top.list.length, 10);
  assert.equal(top.list[0].name, 'Romain');
  assert.ok(!top.list.some(e => e.score === 2000), 'the smallest one left');
  assert.equal(f.length, 10, 'input untouched');
  let list = [];
  for (let i = 0; i < 25; i++) list = P.insertScore(list, entry(`n${i}`, i * 100)).list;
  assert.equal(list.length, 10);
  assert.deepEqual(list.map(e => e.score), [2400, 2300, 2200, 2100, 2000, 1900, 1800, 1700, 1600, 1500]);
});

test('parseScores: defaults for missing / corrupt data, empty list kept, invalid entries dropped, 10 at most, names sanitised', () => {
  const defaults = P.defaultScores();
  for (const raw of [null, '', '{', '[]', '{"adventure":"x"}', 'null', '42']) assert.deepEqual(P.parseScores(raw), defaults, String(raw));
  assert.deepEqual(P.parseScores('{"adventure":[]}'), []);
  const raw = '{"adventure":[' + [
    '{"name":"Ana","score":3000,"stage":2,"level":1,"date":"2026-10-11"}',
    '{"name":"Neg","score":-5,"stage":0,"level":0,"date":""}',
    '{"name":"Big","score":1e309,"stage":0,"level":0,"date":""}',
    '{"name":"Nan","score":null,"stage":0,"level":0,"date":""}',
    '{"name":42,"score":100,"stage":0,"level":0,"date":""}',
    '{"name":"Str","score":"100","stage":0,"level":0,"date":""}',
    '"junk"',
    'null',
    '{"name":"  Bo  b ","score":9000,"stage":500,"level":-2,"date":"far too long a date"}',
    '{"name":"","score":10,"stage":1,"level":1}',
  ].join(',') + ']}';
  const list = P.parseScores(raw);
  assert.deepEqual(list, [
    { name: 'Bo b', score: 9000, stage: 99, level: 0, date: '' },
    { name: 'Ana', score: 3000, stage: 2, level: 1, date: '2026-10-11' },
    { name: 'Joueur', score: 10, stage: 1, level: 1, date: '' },
  ]);
  const many = { adventure: Array.from({ length: 15 }, (_, i) => entry(`p${i}`, (i + 1) * 100)) };
  const parsed = P.parseScores(JSON.stringify(many));
  assert.equal(parsed.length, 10);
  assert.deepEqual(parsed.map(e => e.score), [1500, 1400, 1300, 1200, 1100, 1000, 900, 800, 700, 600]);
});

// ------------------------------------------------------------ profil et sauvegarde (PROG-02)

test('sanitizeName: trimmed, inner spaces collapsed, control characters dropped, 16 characters, empty → null', () => {
  assert.equal(P.sanitizeName('  Romain  '), 'Romain');
  assert.equal(P.sanitizeName('a\u0000b'), 'ab');
  assert.equal(P.sanitizeName('x'.repeat(40)), 'x'.repeat(16));
  assert.equal(P.sanitizeName('Zoé  Dupont'), 'Zoé Dupont');
  assert.equal(P.sanitizeName('tab\there\nnew'), 'tab here new');
  assert.equal(P.sanitizeName('​‮Ro\u0007main‬'), 'Romain', 'format and control characters dropped');
  assert.equal([...P.sanitizeName('🐸'.repeat(20))].length, 16, 'counted in characters, never a broken surrogate');
  for (const bad of ['', '   ', '\u0000\u0001', 42, null, undefined, {}, ['a']]) assert.equal(P.sanitizeName(bad), null, String(bad));
  assert.equal(P.sanitizeName('<img src=x>'), '<img src=x>', 'inert string: the name is only drawn on the canvas');
});

test('parseProfile: name and maxStage, bounded 0..12, invalid name → null', () => {
  assert.deepEqual(P.parseProfile('{"name":"Romain","maxStage":4}'), { name: 'Romain', maxStage: 4 });
  assert.deepEqual(P.parseProfile('{"name":"Romain","maxStage":40}'), { name: 'Romain', maxStage: 12 });
  assert.deepEqual(P.parseProfile('{"name":"Romain","maxStage":-1}'), { name: 'Romain', maxStage: 0 });
  assert.deepEqual(P.parseProfile('{"name":"Romain","maxStage":1e309}'), { name: 'Romain', maxStage: 0 }, 'non-finite → 0');
  assert.deepEqual(P.parseProfile('{"name":"Romain"}'), { name: 'Romain', maxStage: 0 });
  assert.deepEqual(P.parseProfile('{"name":" Ro ","maxStage":2.7}'), { name: 'Ro', maxStage: 2 });
  for (const raw of [null, '', '{', '[]', '{"name":""}', '{"name":5,"maxStage":1}', '{"maxStage":3}']) assert.equal(P.parseProfile(raw), null, String(raw));
});

test('parseSave: a run inside the stage sizes, lives 1..99, finite non-negative score; anything else → null', () => {
  const ok = { stage: 2, level: 3, score: 15000, lives: 2 };
  assert.deepEqual(P.parseSave(JSON.stringify(ok), SIZES), ok);
  assert.deepEqual(P.parseSave(JSON.stringify({ stage: 12, level: 0, score: 0, lives: 99 }), SIZES), { stage: 12, level: 0, score: 0, lives: 99 });
  const bad = [
    { ...ok, level: 5 }, { ...ok, stage: 13 }, { ...ok, stage: -1 }, { ...ok, lives: 0 }, { ...ok, lives: 100 },
    { ...ok, score: -1 }, { ...ok, score: 'x' }, { ...ok, level: 1.5 }, { stage: 2, level: 3, score: 15000 },
  ];
  for (const b of bad) assert.equal(P.parseSave(JSON.stringify(b), SIZES), null, JSON.stringify(b));
  assert.equal(P.parseSave('{"stage":2,"level":3,"score":1e309,"lives":2}', SIZES), null, 'non-finite score');
  for (const raw of [null, '', '{', '[]', 'null']) assert.equal(P.parseSave(raw, SIZES), null, String(raw));
  assert.equal(P.parseSave(JSON.stringify(ok), []), null, 'no stages (procedural): no save');
});

/** In-memory storage; `failing` throws on every call like a forbidden or full localStorage. */
const memory = () => {
  const map = new Map();
  return { map, getItem: k => (map.has(k) ? map.get(k) : null), setItem: (k, v) => { map.set(k, String(v)); }, removeItem: k => { map.delete(k); } };
};
const failing = { getItem() { throw new Error('denied'); }, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('denied'); } };

test('readJson / writeJson: injected storage, null or throwing storage tolerated, null removes the key', () => {
  assert.equal(P.readJson(null, 'k'), null);
  assert.equal(P.writeJson(null, 'k', { a: 1 }), false);
  assert.doesNotThrow(() => P.readJson(failing, 'k'));
  assert.equal(P.readJson(failing, 'k'), null);
  assert.equal(P.writeJson(failing, 'k', { a: 1 }), false);
  assert.equal(P.writeJson(failing, 'k', null), false);
  const s = memory();
  assert.equal(P.readJson(s, 'k'), null);
  assert.equal(P.writeJson(s, 'k', { a: 1 }), true);
  assert.equal(P.readJson(s, 'k'), '{"a":1}');
  assert.equal(P.writeJson(s, 'k', null), true);
  assert.equal(s.map.has('k'), false, 'removeItem called');
  const scores = P.insertScore(P.defaultScores(), entry('Romain', 7000, { stage: 3, level: 2, date: '2026-10-11' })).list;
  assert.equal(P.writeJson(s, P.HIGHSCORE_KEY, { adventure: scores }), true);
  assert.deepEqual(P.parseScores(P.readJson(s, P.HIGHSCORE_KEY)), scores, 'round trip');
  const save = { stage: 4, level: 1, score: 22000, lives: 3 };
  P.writeJson(s, P.SAVE_KEY, save);
  assert.deepEqual(P.parseSave(P.readJson(s, P.SAVE_KEY), SIZES), save);
  P.writeJson(s, P.PROFILE_KEY, { name: 'Romain', maxStage: 4 });
  assert.deepEqual(P.parseProfile(P.readJson(s, P.PROFILE_KEY)), { name: 'Romain', maxStage: 4 });
});

// ------------------------------------------------------------ machine d'états (D-01..D-04, D-10, D-11, PROG-01..03)

const ROMAIN = { name: 'Romain', maxStage: 4 };
const boot = (o = {}) => P.initialApp({ profile: ROMAIN, save: null, scores: P.defaultScores(), sizes: SIZES, startLives: 3, review: null, ...o });
const kinds = effects => effects.map(e => e.kind);
const effect = (effects, kind) => effects.find(e => e.kind === kind);
const WRITES = ['save-run', 'save-profile', 'save-scores'];
/** Applies events in order; returns the last { state, effects } and every effect seen. */
const play = (state, events) => {
  let r = { state, effects: [] };
  const all = [];
  for (const ev of events) { r = P.reduceApp(r.state, ev); all.push(...r.effects); }
  return { ...r, all };
};
/** State on a level of `run`, entered through the adventure screen. */
const onLevel = (run, profile = ROMAIN, extra = {}) => {
  const { state } = boot({ profile, save: run, ...extra });
  return P.reduceApp(P.reduceApp(state, { kind: 'adventure' }).state, { kind: 'continue' }).state;
};

test('boot: welcome screen, no level before the player chooses (D-01); name prompt without profile; ?level= review starts the level', () => {
  const first = P.initialApp({ profile: null, save: null, scores: P.defaultScores(), sizes: SIZES, startLives: 3, review: null });
  assert.equal(first.state.screen, 'welcome');
  assert.equal(first.state.prompt, 'name');
  assert.deepEqual(first.effects, []);
  assert.equal(first.state.review, false);
  const known = boot();
  assert.equal(known.state.prompt, null);
  assert.equal(known.state.screen, 'welcome');
  assert.deepEqual(known.effects, []);
  const review = boot({ review: run(2, 1) });
  assert.equal(review.state.screen, 'level');
  assert.equal(review.state.review, true);
  assert.deepEqual(review.effects, [{ kind: 'start-level', run: run(2, 1) }]);
});

test('name dialog: saved profile, empty name → « Joueur », renaming keeps maxStage', () => {
  const first = P.initialApp({ profile: null, save: null, scores: [], sizes: SIZES, startLives: 3, review: null }).state;
  const named = P.reduceApp(first, { kind: 'name', name: '  Romain ' });
  assert.equal(named.state.prompt, null);
  assert.deepEqual(named.effects, [{ kind: 'save-profile', profile: { name: 'Romain', maxStage: 0 } }]);
  const empty = P.reduceApp(first, { kind: 'name', name: '   ' });
  assert.equal(empty.state.profile.name, 'Joueur');
  assert.equal(empty.state.profile.source, 'default', 'a fallback name, replaceable by the platform name');
  const renamed = P.reduceApp(boot().state, { kind: 'name', name: 'Zoé' });
  assert.deepEqual(effect(renamed.effects, 'save-profile').profile, { name: 'Zoé', maxStage: 4 });
  assert.equal(P.reduceApp(first, { kind: 'adventure' }).state, first, 'Aventure waits for the name');
});

test('Aventure: adventure screen on maxStage without a save; continue prompt with one; Continuer / Rejouer', () => {
  const none = P.reduceApp(boot().state, { kind: 'adventure' });
  assert.equal(none.state.screen, 'adventure');
  assert.equal(none.state.selected, 4);
  assert.deepEqual(none.effects, []);
  const saved = boot({ save: run(3, 2, 15000, 2) }).state;
  const ask = P.reduceApp(saved, { kind: 'adventure' });
  assert.equal(ask.state.prompt, 'continue');
  assert.equal(ask.state.screen, 'welcome');
  const cont = P.reduceApp(ask.state, { kind: 'continue' });
  assert.equal(cont.state.screen, 'level');
  assert.equal(cont.state.prompt, null);
  assert.deepEqual(effect(cont.effects, 'start-level').run, run(3, 2, 15000, 2), 'score and lives kept');
  assert.deepEqual(effect(cont.effects, 'save-run').run, run(3, 2, 15000, 2));
  const fresh = P.reduceApp(ask.state, { kind: 'new-game' });
  assert.equal(fresh.state.run, null);
  assert.equal(fresh.state.screen, 'adventure');
  assert.equal(fresh.state.selected, 4);
  assert.deepEqual(fresh.effects, [{ kind: 'save-run', run: null }]);
});

test('without stages (procedural): Aventure starts 0-0, wins chain levels endlessly, leave returns to the welcome screen', () => {
  const s0 = P.initialApp({ profile: ROMAIN, save: null, scores: [], sizes: [], startLives: 3, review: null }).state;
  const go = P.reduceApp(s0, { kind: 'adventure' });
  assert.equal(go.state.screen, 'level');
  assert.deepEqual(effect(go.effects, 'start-level').run, run(0, 0, 0, 3));
  const screens = new Set([s0.screen, go.state.screen]);
  let st = go.state;
  for (let i = 1; i <= 15; i++) {
    const w = P.reduceApp(st, { kind: 'won', score: i * 1000, lives: 3, date: '2026-10-11' });
    assert.deepEqual(effect(w.effects, 'start-level').run, run(0, i, i * 1000, 3));
    st = w.state;
    screens.add(st.screen);
  }
  const left = P.reduceApp(st, { kind: 'leave' });
  assert.equal(left.state.screen, 'welcome');
  const over = play(P.reduceApp(left.state, { kind: 'adventure' }).state, [{ kind: 'gameover', score: 500, date: '' }, { kind: 'leave' }]);
  for (const s of [left.state.screen, over.state.screen]) screens.add(s);
  assert.deepEqual([...screens].sort(), ['level', 'welcome'], 'never adventure, temple nor ending');
});

test('doors and buttons: unlocked doors only, Jouer resumes the run of that stage or starts a new one, Menu principal', () => {
  const adv = P.reduceApp(boot({ save: run(2, 3, 9000, 2) }).state, { kind: 'adventure' });
  const screen = P.reduceApp(adv.state, { kind: 'new-game' }).state;
  const withRun = { ...screen, run: run(2, 3, 9000, 2) };
  const sel = P.reduceApp(withRun, { kind: 'select', stage: 2 });
  assert.equal(sel.state.selected, 2);
  assert.deepEqual(sel.effects, []);
  for (const bad of [5, 12, -1, NaN, 1.5, Infinity]) assert.equal(P.reduceApp(withRun, { kind: 'select', stage: bad }).state, withRun, `door ${bad} ignored`);
  const resume = P.reduceApp(sel.state, { kind: 'play' });
  assert.equal(resume.state.screen, 'level');
  assert.deepEqual(effect(resume.effects, 'start-level').run, run(2, 3, 9000, 2));
  assert.deepEqual(effect(resume.effects, 'save-run').run, run(2, 3, 9000, 2));
  const other = P.reduceApp(P.reduceApp(withRun, { kind: 'select', stage: 1 }).state, { kind: 'play' });
  assert.deepEqual(effect(other.effects, 'start-level').run, run(1, 0, 0, 3), 'new game at the chosen stage');
  assert.deepEqual(effect(other.effects, 'save-run').run, run(1, 0, 0, 3));
  const menu = P.reduceApp(withRun, { kind: 'main-menu' });
  assert.equal(menu.state.screen, 'welcome');
  assert.deepEqual(menu.effects, []);
});

test('victory: next level, stage done (door opening, maxStage raised), temple dialogue, final, ending, back to welcome', () => {
  const mid = P.reduceApp(onLevel(run(0, 1, 1000, 3)), { kind: 'won', score: 2500, lives: 3, date: '2026-10-11' });
  assert.equal(mid.state.screen, 'level');
  assert.deepEqual(effect(mid.effects, 'start-level').run, run(0, 2, 2500, 3));
  assert.deepEqual(effect(mid.effects, 'save-run').run, run(0, 2, 2500, 3));
  const first = { name: 'Romain', maxStage: 0 };
  const end = P.reduceApp(onLevel(run(0, 4, 8000, 2), first), { kind: 'won', score: 9000, lives: 2, date: '2026-10-11' });
  assert.equal(end.state.screen, 'adventure');
  assert.equal(end.state.opening, 1);
  assert.equal(end.state.selected, 1);
  assert.deepEqual(effect(end.effects, 'save-run').run, run(1, 0, 9000, 2));
  assert.deepEqual(effect(end.effects, 'save-profile').profile, { name: 'Romain', maxStage: 1 });
  assert.equal(effect(end.effects, 'start-level'), undefined, 'the player presses Jouer');
  const temple = P.reduceApp(onLevel(run(2, 4, 30000, 3), { name: 'Romain', maxStage: 2 }), { kind: 'won', score: 31000, lives: 3, date: '' });
  assert.equal(temple.state.screen, 'temple');
  assert.equal(temple.state.temple, 1);
  assert.deepEqual(effect(temple.effects, 'sound'), { kind: 'sound', key: 'templecomplete' });
  assert.deepEqual(effect(temple.effects, 'save-run').run, run(3, 0, 31000, 3));
  assert.equal(effect(temple.effects, 'save-profile').profile.maxStage, 3);
  const after = P.reduceApp(temple.state, { kind: 'temple-done' });
  assert.equal(after.state.screen, 'adventure');
  assert.equal(after.state.opening, 3);
  assert.equal(after.state.selected, 3);
  assert.equal(after.state.temple, null);
  const t4 = P.reduceApp(onLevel(run(11, 6, 150000, 3), { name: 'Romain', maxStage: 11 }), { kind: 'won', score: 160000, lives: 3, date: '' });
  assert.equal(t4.state.temple, 4);
  assert.equal(P.reduceApp(t4.state, { kind: 'temple-done' }).state.selected, 12, 'the last stage follows temple 4');
  const final = P.reduceApp(onLevel(run(12, 0, 200000, 2), { name: 'Romain', maxStage: 12 }), { kind: 'won', score: 23000 * 10, lives: 2, date: '2026-10-11' });
  assert.equal(final.state.screen, 'temple');
  assert.equal(final.state.temple, 5);
  assert.deepEqual(effect(final.effects, 'sound'), { kind: 'sound', key: 'templecomplete' });
  assert.deepEqual(effect(final.effects, 'save-run'), { kind: 'save-run', run: null });
  const scores = effect(final.effects, 'save-scores').scores;
  assert.deepEqual(scores[0], { name: 'Romain', score: 230000, stage: 12, level: 0, date: '2026-10-11' });
  assert.deepEqual(final.state.ending, { score: 230000, rank: 0 });
  assert.equal(final.state.run, null);
  assert.equal(effect(final.effects, 'start-level'), undefined, 'never back to 1-1');
  const ending = P.reduceApp(final.state, { kind: 'temple-done' });
  assert.equal(ending.state.screen, 'ending');
  const back = P.reduceApp(ending.state, { kind: 'ending-done' });
  assert.equal(back.state.screen, 'welcome');
  assert.equal(back.state.run, null);
  assert.equal(back.state.ending, null);
});

test('defeat: retry the same level with the level-start score; game over submits the score, clears the save, then the adventure screen', () => {
  const lv = onLevel(run(3, 2, 15000, 3));
  const retry = P.reduceApp(lv, { kind: 'retry', lives: 2 });
  assert.equal(retry.state.screen, 'level');
  assert.deepEqual(effect(retry.effects, 'start-level').run, run(3, 2, 15000, 2));
  assert.deepEqual(effect(retry.effects, 'save-run').run, run(3, 2, 15000, 2));
  for (const bad of [0, -1, NaN, 100]) assert.equal(P.reduceApp(lv, { kind: 'retry', lives: bad }).state, lv, `lives ${bad}`);
  const over = P.reduceApp(retry.state, { kind: 'gameover', score: 23000, date: '2026-10-11' });
  assert.equal(over.state.screen, 'level', 'the game-over STATS is still shown');
  assert.equal(over.state.run, null);
  assert.deepEqual(effect(over.effects, 'save-run'), { kind: 'save-run', run: null });
  const list = effect(over.effects, 'save-scores').scores;
  assert.deepEqual(list[0], { name: 'Romain', score: 23000, stage: 3, level: 2, date: '2026-10-11' });
  const left = P.reduceApp(over.state, { kind: 'leave' });
  assert.equal(left.state.screen, 'adventure');
  assert.equal(left.state.selected, 4);
  const anon = { ...onLevel(run(0, 0)), profile: null }; // no profile at submission time (D-04 fallback)
  const anonOver = P.reduceApp(anon, { kind: 'gameover', score: 1500, date: '' });
  assert.equal(effect(anonOver.effects, 'save-scores').scores.find(e => e.score === 1500).name, 'Joueur');
});

test('leaving a level: adventure screen on its stage, the level start saved; Aventure later offers to continue', () => {
  const lv = onLevel(run(5, 3, 40000, 2));
  const left = P.reduceApp(lv, { kind: 'leave' });
  assert.equal(left.state.screen, 'adventure');
  assert.equal(left.state.selected, 5);
  assert.deepEqual(left.effects, [{ kind: 'save-run', run: run(5, 3, 40000, 2) }]);
  const again = play(left.state, [{ kind: 'main-menu' }, { kind: 'adventure' }]);
  assert.equal(again.state.prompt, 'continue');
});

test('review (?level=): no save-run, save-profile nor save-scores on any transition; start-level and sounds stay', () => {
  const r1 = boot({ review: run(0, 4, 8000, 3), profile: { name: 'Romain', maxStage: 0 } }).state;
  const end = P.reduceApp(r1, { kind: 'won', score: 9000, lives: 3, date: '' });
  assert.equal(end.state.screen, 'adventure');
  assert.deepEqual(end.effects.filter(e => WRITES.includes(e.kind)), []);
  const r2 = boot({ review: run(2, 4, 8000, 3) }).state;
  const temple = P.reduceApp(r2, { kind: 'won', score: 9000, lives: 3, date: '' });
  assert.deepEqual(kinds(temple.effects), ['sound']);
  const over = P.reduceApp(boot({ review: run(1, 1) }).state, { kind: 'gameover', score: 99999, date: '' });
  assert.deepEqual(over.effects, []);
  const fin = P.reduceApp(boot({ review: run(12, 0, 1, 3) }).state, { kind: 'won', score: 300000, lives: 3, date: '' });
  assert.deepEqual(kinds(fin.effects), ['sound']);
  const next = P.reduceApp(boot({ review: run(0, 0) }).state, { kind: 'won', score: 100, lives: 3, date: '' });
  assert.deepEqual(kinds(next.effects), ['start-level']);
  const retry = P.reduceApp(boot({ review: run(0, 0) }).state, { kind: 'retry', lives: 2 });
  assert.deepEqual(kinds(retry.effects), ['start-level']);
});

test('out-of-place events change nothing; reduceApp never mutates the state it receives', () => {
  const welcome = boot().state;
  for (const ev of [{ kind: 'play' }, { kind: 'won', score: 1, lives: 1, date: '' }, { kind: 'continue' }, { kind: 'temple-done' }, { kind: 'ending-done' }, { kind: 'leave' }, { kind: 'select', stage: 1 }, { kind: 'bogus' }]) {
    const r = P.reduceApp(welcome, ev);
    assert.equal(r.state, welcome, ev.kind);
    assert.deepEqual(r.effects, []);
  }
  const adv = P.reduceApp(welcome, { kind: 'adventure' }).state;
  for (const ev of [{ kind: 'won', score: 1, lives: 1, date: '' }, { kind: 'adventure' }, { kind: 'gameover', score: 1, date: '' }, { kind: 'name', name: 'X' }]) {
    assert.equal(P.reduceApp(adv, ev).state, adv, ev.kind);
  }
  const script = [
    { kind: 'adventure' }, { kind: 'select', stage: 2 }, { kind: 'play' }, { kind: 'won', score: 100, lives: 3, date: '' },
    { kind: 'retry', lives: 2 }, { kind: 'leave' }, { kind: 'main-menu' }, { kind: 'adventure' }, { kind: 'continue' },
    { kind: 'gameover', score: 300, date: '' }, { kind: 'leave' }, { kind: 'profile-detected', name: 'Ana' },
  ];
  let st = boot({ profile: { name: 'Romain', maxStage: 12 } }).state;
  for (const ev of script) {
    const before = structuredClone(st);
    const next = P.reduceApp(st, ev).state;
    assert.deepEqual(st, before, `${ev.kind} did not mutate its input`);
    st = next;
  }
});

// ------------------------------------------------------------ prénom fourni par la plateforme (demande de l'utilisateur, hébergement privé)

test('platform name at boot: used (sanitised) and persisted, no name prompt; absent → planned behaviour', () => {
  const r = P.initialApp({ profile: null, save: null, scores: [], sizes: SIZES, startLives: 3, review: null, platformName: '  Romain\u0000 ' });
  assert.equal(r.state.prompt, null, 'no name dialog');
  assert.deepEqual(r.state.profile, { name: 'Romain', maxStage: 0, source: 'platform' });
  assert.deepEqual(r.effects, [{ kind: 'save-profile', profile: { name: 'Romain', maxStage: 0, source: 'platform' } }]);
  for (const absent of [undefined, null, '', '   ', 42]) {
    const a = P.initialApp({ profile: null, save: null, scores: [], sizes: SIZES, startLives: 3, review: null, platformName: absent });
    assert.equal(a.state.prompt, 'name', `platformName ${String(absent)}: prompt as planned`);
    assert.deepEqual(a.effects, []);
  }
});

test('platform name never replaces a name typed on this device, replaces the « Joueur » fallback and an older platform name', () => {
  const typed = boot({ platformName: 'Ana' });
  assert.deepEqual(typed.state.profile, ROMAIN, 'typed name kept');
  assert.deepEqual(typed.effects, []);
  const fallback = boot({ profile: { name: 'Joueur', maxStage: 6, source: 'default' }, platformName: 'Ana' });
  assert.deepEqual(fallback.state.profile, { name: 'Ana', maxStage: 6, source: 'platform' }, 'progress kept');
  assert.deepEqual(kinds(fallback.effects), ['save-profile']);
  const older = boot({ profile: { name: 'Ana', maxStage: 2, source: 'platform' }, platformName: 'Anabelle' });
  assert.deepEqual(older.state.profile, { name: 'Anabelle', maxStage: 2, source: 'platform' });
  const same = boot({ profile: { name: 'Ana', maxStage: 2, source: 'platform' }, platformName: 'Ana' });
  assert.deepEqual(same.effects, [], 'unchanged: nothing written');
  const review = boot({ profile: null, review: run(0, 0), platformName: 'Ana' });
  assert.equal(review.state.profile.name, 'Ana');
  assert.deepEqual(kinds(review.effects), ['start-level'], 'review: nothing written');
});

test('profile-detected event (identity answered after boot): closes the name prompt, same replacement rules', () => {
  const first = P.initialApp({ profile: null, save: null, scores: [], sizes: SIZES, startLives: 3, review: null }).state;
  const got = P.reduceApp(first, { kind: 'profile-detected', name: 'Romain' });
  assert.equal(got.state.prompt, null);
  assert.deepEqual(got.effects, [{ kind: 'save-profile', profile: { name: 'Romain', maxStage: 0, source: 'platform' } }]);
  const typed = boot().state;
  const kept = P.reduceApp(typed, { kind: 'profile-detected', name: 'Ana' });
  assert.equal(kept.state, typed, 'a typed name wins');
  assert.deepEqual(kept.effects, []);
  const lv = onLevel(run(4, 1, 20000, 3), { name: 'Joueur', maxStage: 4, source: 'default' });
  const swap = P.reduceApp(lv, { kind: 'profile-detected', name: 'Ana' });
  assert.equal(swap.state.screen, 'level', 'any screen');
  assert.deepEqual(swap.state.profile, { name: 'Ana', maxStage: 4, source: 'platform' });
  const over = P.reduceApp(swap.state, { kind: 'gameover', score: 21000, date: '' });
  assert.equal(effect(over.effects, 'save-scores').scores[0].name, 'Ana', 'scores carry the platform name');
  assert.equal(P.reduceApp(first, { kind: 'profile-detected', name: '  ' }).state, first, 'empty name ignored');
  const renamed = P.reduceApp(P.reduceApp(first, { kind: 'profile-detected', name: 'Ana' }).state, { kind: 'name', name: 'Zoé' });
  assert.deepEqual(renamed.state.profile, { name: 'Zoé', maxStage: 0 }, 'renaming by hand makes it a typed name');
});

test('parseProfile keeps the profile source (platform / default), absent or unknown = typed', () => {
  assert.deepEqual(P.parseProfile('{"name":"Ana","maxStage":3,"source":"platform"}'), { name: 'Ana', maxStage: 3, source: 'platform' });
  assert.deepEqual(P.parseProfile('{"name":"Joueur","maxStage":0,"source":"default"}'), { name: 'Joueur', maxStage: 0, source: 'default' });
  assert.deepEqual(P.parseProfile('{"name":"Ana","maxStage":3,"source":"hacker"}'), { name: 'Ana', maxStage: 3 });
});
