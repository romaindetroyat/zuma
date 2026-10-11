// R2.0.22 — records partagés, règles client (06.1-CONTEXT D-02, D-03, D-07, D-08, D-10).
// Module pur `records.ts` : copie du serveur, file d'envois « le meilleur gagne », bornes, lecture défensive,
// vues « Tous » / « Moi », reprise de l'existant, client d'échange `api/records` avec un fetch simulé.
// Données de démonstration uniquement (« Alice », « Bruno ») : aucun prénom ni aucune adresse réels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../.compiled/records.js';
import { bestTimeKey } from '../.compiled/statsdialog.js';
import * as P from '../.compiled/progress.js';

const { defaultScores } = P;

const ID = n => n.toString(16).padStart(16, '0');
const S = (score, extra = {}) => ({ score, stage: 0, level: 0, day: '', ...extra });
const rs = (name, score, extra = {}) => ({ name, score, stage: 0, level: 0, day: '', ...extra });
const state = (o = {}) => ({
  shared: { scores: [], times: {}, ...(o.shared ?? {}) },
  mine: { scores: [], times: {}, ...(o.mine ?? {}) },
});
const withCache = (cache, extra = {}) => ({ ...R.emptyRecordsStore(), cache, ...extra });

// ------------------------------------------------------------ bornes et identifiant de niveau (D-10)

test('RECORD_BOUNDS: the exact values shared with the worker (tools/recordsapi.mjs RECORDS_LIMITS)', () => {
  assert.deepEqual(R.RECORD_BOUNDS, {
    scoreMax: 99999999, stageMax: 99, levelMax: 99,
    secondsMin: 1, secondsMax: 3600,
    levelId: '^[a-z0-9-]{1,40}$', sid: '^[0-9a-f]{16}$', day: '^(\\d{4}-\\d{2}-\\d{2})?$',
    scoresPerPost: 10, timesPerPost: 40, listMax: 10, nameMax: 20, bodyMax: 4096,
  });
  assert.equal(R.RECORDS_KEY, 'zuma.records.v1');
  assert.deepEqual(R.RECORD_SCOPE_LABEL, { shared: 'TOUS', mine: 'MOI' });
});

test('recordLevelId: the local best-time key without « zuma.best. » (same level id on both sides)', () => {
  assert.equal(R.recordLevelId('Spiral 2'), 'spiral-2');
  for (const id of ['spiral', 'Spiral 2', 'TRIANGLE', 'a_b', 'déjà vu', 'loop-3', '', '42', 'x.y/z']) {
    assert.equal(R.recordLevelId(id), bestTimeKey(id).slice('zuma.best.'.length), id);
  }
});

test('emptyRecordsStore: no cache, nothing pending, not migrated; a fresh object per call', () => {
  const a = R.emptyRecordsStore();
  assert.deepEqual(a, { cache: null, pending: { scores: [], times: {} }, migrated: false });
  assert.notEqual(a, R.emptyRecordsStore());
  assert.notEqual(a.pending, R.emptyRecordsStore().pending);
});

// ------------------------------------------------------------ file « le meilleur gagne » (D-03, D-07)

test('queueScore: out-of-bounds values are never queued (the same store object)', () => {
  const s = R.emptyRecordsStore();
  for (const bad of [S(-1), S(100000000), S(1.5), S(NaN), S(Infinity), S('500'), S(10, { stage: 100 }), S(10, { level: -1 }),
    S(10, { stage: 1.5 }), S(10, { day: '2026-1-1' }), S(10, { day: 20261011 })]) {
    assert.equal(R.queueScore(s, bad, ID(1)), s, JSON.stringify(bad));
  }
  for (const id of ['xyz', '', ID(1).toUpperCase().replace(/0/g, 'A'), ID(1) + '0', 7]) {
    assert.equal(R.queueScore(s, S(10), id), s, String(id));
  }
  const ok = R.queueScore(s, S(99999999, { stage: 99, level: 99, day: '2026-10-11' }), ID(1));
  assert.notEqual(ok, s);
  assert.deepEqual(ok.pending.scores, [{ id: ID(1), score: 99999999, stage: 99, level: 99, day: '2026-10-11' }]);
  assert.deepEqual(R.queueScore(s, S(0), ID(2)).pending.scores, [{ id: ID(2), ...S(0) }]);
});

test('queueScore: the 10 best pending kept (score desc, the earlier first on ties); the received store never mutated', () => {
  let s = R.emptyRecordsStore();
  const snapshots = [];
  const scores = [500, 900, 100, 700, 900, 300, 1200, 50, 800, 600, 400, 200];
  scores.forEach((score, i) => {
    const before = JSON.stringify(s);
    snapshots.push([s, before]);
    s = R.queueScore(s, S(score), ID(i + 1));
  });
  for (const [obj, json] of snapshots) assert.equal(JSON.stringify(obj), json, 'never mutated');
  assert.equal(s.pending.scores.length, 10);
  assert.deepEqual(s.pending.scores.map(e => e.score), [1200, 900, 900, 800, 700, 600, 500, 400, 300, 200]);
  assert.deepEqual(s.pending.scores.filter(e => e.score === 900).map(e => e.id), [ID(2), ID(5)], 'earlier first on ties');
  // An 11th that does not make the cut leaves the queue as it was (same object).
  assert.equal(R.queueScore(s, S(10), ID(99)), s);
});

test('queueTime: bounds and level id checked; a time replaces the pending one only when better', () => {
  const s = R.emptyRecordsStore();
  for (const [level, seconds] of [['spiral', 0], ['spiral', 3601], ['spiral', 2.5], ['spiral', NaN], ['spiral', '80'],
    ['Spiral', 80], ['a_b', 80], ['', 80], ['__proto__', 80], ['x'.repeat(41), 80], [7, 80]]) {
    assert.equal(R.queueTime(s, level, seconds), s, `${level} ${seconds}`);
  }
  const a = R.queueTime(s, 'spiral', 90);
  assert.deepEqual(a.pending.times, { spiral: 90 });
  assert.deepEqual(s.pending.times, {}, 'never mutated');
  const b = R.queueTime(a, 'spiral', 80);
  assert.deepEqual(b.pending.times, { spiral: 80 });
  assert.equal(R.queueTime(b, 'spiral', 90), b, '80 then 90 → 80 stays (same object)');
  assert.equal(R.queueTime(b, 'spiral', 80), b, 'equal time → same object');
  assert.deepEqual(R.queueTime(b, 'loop-3', 3600).pending.times, { spiral: 80, 'loop-3': 3600 });
  assert.deepEqual(R.queueTime(s, 'x'.repeat(40), 1).pending.times, { ['x'.repeat(40)]: 1 });
  // Object.prototype names are ordinary level ids: an own property, never the inherited one.
  assert.deepEqual(R.queueTime(s, 'constructor', 70).pending.times, { constructor: 70 });
});

test('postBody: null when nothing is pending; ≤ 10 scores, ≤ 40 times in level order; never a name', () => {
  assert.equal(R.postBody(R.emptyRecordsStore()), null);
  let s = R.emptyRecordsStore();
  for (let i = 0; i < 50; i++) s = R.queueTime(s, `lvl-${String(49 - i).padStart(2, '0')}`, 100 + i);
  for (let i = 0; i < 12; i++) s = R.queueScore(s, S(1000 + i), ID(i + 1));
  const body = R.postBody(s);
  assert.equal(body.scores.length, 10);
  assert.equal(body.times.length, 40);
  assert.deepEqual(body.times.map(t => t.level), Array.from({ length: 40 }, (_, i) => `lvl-${String(i).padStart(2, '0')}`));
  assert.deepEqual(body.times[0], { level: 'lvl-00', seconds: 149 });
  assert.deepEqual(Object.keys(body).sort(), ['scores', 'times']);
  assert.doesNotMatch(JSON.stringify(body), /"name"/);
  const only = R.postBody(R.queueTime(R.emptyRecordsStore(), 'spiral', 83));
  assert.deepEqual(only, { scores: [], times: [{ level: 'spiral', seconds: 83 }] });
});

test('afterPost: sent scores removed by id, a score queued meanwhile kept; a pending time removed only when ≥ the sent one', () => {
  let s = R.emptyRecordsStore();
  s = R.queueScore(s, S(500), ID(1));
  s = R.queueScore(s, S(400), ID(2));
  s = R.queueTime(s, 'spiral', 80);
  s = R.queueTime(s, 'loop-3', 120);
  const sent = R.postBody(s);
  // Meanwhile: a new score and a better time for loop-3.
  let current = R.queueScore(s, S(450), ID(3));
  current = R.queueTime(current, 'loop-3', 110);
  const answer = state({ shared: { scores: [rs('Bruno', 9000)], times: { spiral: { seconds: 60, name: 'Bruno' } } } });
  const after = R.afterPost(current, sent, answer);
  assert.deepEqual(after.pending.scores.map(e => e.id), [ID(3)]);
  assert.deepEqual(after.pending.times, { 'loop-3': 110 }, 'spiral 80 sent and pending 80 → removed; loop-3 110 < 120 sent → kept');
  assert.deepEqual(after.cache, answer);
  assert.equal(after.migrated, current.migrated);
  assert.equal(current.pending.scores.length, 3, 'never mutated');
  const dropped = R.afterDrop(withCache(answer, { pending: current.pending }), sent);
  assert.deepEqual(dropped.pending.scores.map(e => e.id), [ID(3)]);
  assert.deepEqual(dropped.pending.times, { 'loop-3': 110 });
  assert.deepEqual(dropped.cache, answer, 'afterDrop: cache unchanged');
  const noCache = R.afterDrop(current, sent);
  assert.equal(noCache.cache, null);
});

// ------------------------------------------------------------ lecture défensive de la réponse du serveur (T-061-01)

test('parseRecordsState: a valid answer normalised (lists sorted, ≤ 10); wrong shapes → null', () => {
  const many = Array.from({ length: 13 }, (_, i) => rs(`J${i}`, 1000 + i * 10));
  const got = R.parseRecordsState({
    shared: { scores: many, times: { spiral: { seconds: 60, name: 'Bruno' } } },
    mine: { scores: [rs('Alice', 300), rs('Alice', 900, { stage: 3, level: 2, day: '2026-10-11' })], times: { spiral: 75 } },
  });
  assert.equal(got.shared.scores.length, 10);
  assert.deepEqual(got.shared.scores.map(e => e.score), many.map(e => e.score).sort((a, b) => b - a).slice(0, 10));
  assert.deepEqual(got.mine.scores, [rs('Alice', 900, { stage: 3, level: 2, day: '2026-10-11' }), rs('Alice', 300)]);
  assert.deepEqual(got.shared.times, { spiral: { seconds: 60, name: 'Bruno' } });
  assert.deepEqual(got.mine.times, { spiral: 75 });
  for (const bad of [null, undefined, 42, 'x', [], [1], {}, { shared: {} }, { shared: [], mine: {} },
    { shared: { scores: [], times: {} } }, { shared: { scores: {}, times: {} }, mine: { scores: [], times: {} } },
    { shared: { scores: [], times: [] }, mine: { scores: [], times: {} } }]) {
    assert.equal(R.parseRecordsState(bad), null, JSON.stringify(bad));
  }
});

test('parseRecordsState: names sanitised (≤ 20 code points, control characters dropped, empty → « Joueur »), bounds enforced', () => {
  const got = R.parseRecordsState(state({
    shared: {
      scores: [
        rs('A'.repeat(30), 900), rs('', 800), rs(42, 700), rs('Al\u0000i\u0007ce‮', 600), rs('   ', 500),
        rs('Bruno', -1), rs('Bruno', 100000000), rs('Bruno', 1.5), rs('Bruno', 50, { stage: 100 }), rs('Bruno', 50, { level: 2.5 }),
        'nope', null, rs('Bruno', 40, { day: 'hier' }),
      ],
      times: {},
    },
  }));
  assert.deepEqual(got.shared.scores.map(e => e.name), ['A'.repeat(20), 'Joueur', 'Joueur', 'Alice', 'Joueur', 'Bruno']);
  assert.deepEqual(got.shared.scores.map(e => e.score), [900, 800, 700, 600, 500, 40]);
  assert.equal(got.shared.scores[5].day, '', 'an invalid day becomes empty');
  const emoji = R.parseRecordsState(state({ shared: { scores: [rs('😀'.repeat(25), 1)], times: {} } }));
  assert.equal(emoji.shared.scores[0].name, '😀'.repeat(20), 'code points, never a broken surrogate');
});

test('parseRecordsState: time keys checked before being copied (no prototype pollution), bad seconds dropped', () => {
  const raw = JSON.parse('{"shared":{"scores":[],"times":{"__proto__":{"seconds":5,"name":"x"},"A B":{"seconds":5,"name":"x"},'
    + '"zero":{"seconds":0,"name":"x"},"big":{"seconds":3601,"name":"x"},"frac":{"seconds":2.5,"name":"x"},"ok":{"seconds":9,"name":""},'
    + '"constructor":{"seconds":7,"name":"Bruno"},"bare":12}},'
    + '"mine":{"scores":[],"times":{"__proto__":5,"ok":9,"neg":-3,"str":"9"}}}');
  const got = R.parseRecordsState(raw);
  assert.deepEqual(got.shared.times, { ok: { seconds: 9, name: 'Joueur' }, constructor: { seconds: 7, name: 'Bruno' } });
  assert.deepEqual(got.mine.times, { ok: 9 });
  assert.equal(Object.getPrototypeOf(got.shared.times), Object.prototype, 'prototype untouched');
  assert.equal(Object.getPrototypeOf(got.mine.times), Object.prototype);
  assert.equal({}.seconds, undefined, 'Object.prototype not polluted');
  assert.equal(Object.hasOwn(got.shared.times, '__proto__'), false);
});

// ------------------------------------------------------------ lecture défensive de zuma.records.v1

test('parseRecordsStore: null, corrupt JSON or wrong shape → emptyRecordsStore()', () => {
  for (const raw of [null, '', '{', 'null', '42', '"x"', '[]', '[1,2]']) {
    assert.deepEqual(R.parseRecordsStore(raw), R.emptyRecordsStore(), String(raw));
  }
  assert.deepEqual(R.parseRecordsStore('{"cache":7,"pending":"x","migrated":"yes"}'), R.emptyRecordsStore());
});

test('parseRecordsStore: a valid store read back identically; out-of-bounds pending entries removed', () => {
  let s = R.emptyRecordsStore();
  s = R.queueScore(s, S(1200, { stage: 2, level: 1, day: '2026-10-11' }), ID(1));
  s = R.queueScore(s, S(300), ID(2));
  s = R.queueTime(s, 'spiral', 80);
  s = { ...s, migrated: true, cache: state({ shared: { scores: [rs('Bruno', 9000)], times: { spiral: { seconds: 60, name: 'Bruno' } } }, mine: { scores: [rs('Alice', 1200)], times: { spiral: 80 } } }) };
  assert.deepEqual(R.parseRecordsStore(JSON.stringify(s)), s);
  const tampered = JSON.parse(JSON.stringify(s));
  tampered.pending.scores.push({ id: 'xyz', score: 5, stage: 0, level: 0, day: '' }, { id: ID(3), score: -5, stage: 0, level: 0, day: '' });
  tampered.pending.times['A B'] = 9;
  tampered.pending.times.loop = 0;
  tampered.cache = { shared: 1 };
  const back = R.parseRecordsStore(JSON.stringify(tampered));
  assert.deepEqual(back.pending, s.pending);
  assert.equal(back.cache, null, 'a cache of the wrong shape is dropped');
  assert.equal(back.migrated, true);
  // More than 10 pending scores in storage: the 10 best kept.
  const big = { ...R.emptyRecordsStore(), pending: { scores: Array.from({ length: 14 }, (_, i) => ({ id: ID(i + 1), ...S(i * 100) })), times: {} } };
  assert.deepEqual(R.parseRecordsStore(JSON.stringify(big)).pending.scores.map(e => e.score), [1300, 1200, 1100, 1000, 900, 800, 700, 600, 500, 400]);
});

// ------------------------------------------------------------ module et bundle

test('bundle: records after progress in MODULES, precached by the worker shell, copied to dist/js, no global I/O', () => {
  assert.match(fs.readFileSync('tools/build.mjs', 'utf8'), /const MODULES = \['core', 'feedback', 'levels', 'audio', 'upscale', 'original', 'pwa', 'bitmapfont', 'statsdialog', 'render', 'menudialog', 'progress', 'records', 'welcome', 'adventure', 'main'\]/);
  assert.match(fs.readFileSync('public/sw.js', 'utf8'), /'\.\/js\/progress\.js', '\.\/js\/records\.js', '\.\/js\/welcome\.js'/);
  assert.ok(fs.existsSync('dist/js/records.js'), 'dist/js/records.js produced by the build');
  const js = fs.readFileSync('.compiled/records.js', 'utf8');
  assert.doesNotMatch(js, /\b(document|window|localStorage|location)\b/);
});

// ------------------------------------------------------------ entrées de démonstration et reprise de l'existant (D-08)

const hs = (name, score, extra = {}) => ({ name, score, stage: 0, level: 0, date: '', ...extra });

test('isDemoScore: the three defaultScores() entries; the same name and score with a date is a real score', () => {
  for (const e of defaultScores()) assert.equal(R.isDemoScore(e), true, e.name);
  assert.equal(R.isDemoScore(hs('Zuma', 10000, { date: '2026-10-11' })), false);
  assert.equal(R.isDemoScore(hs('Zuma', 10001)), false);
  assert.equal(R.isDemoScore(hs('Alice', 10000)), false);
});

test('migrationItems: local entries named after the player (no demo, no other name) and the valid local best times; never a name', () => {
  const local = [
    hs('Alice', 23000, { stage: 3, level: 2, date: '2026-10-11' }), ...defaultScores(), hs('Bruno', 7000),
    hs('Alice', 1500), hs('Alice', 100000000), hs('Zuma', 10000, { name: 'Alice' }),
  ];
  const got = R.migrationItems(local, { spiral: 83, x: 0, 'A B': 9, 'loop-3': 2.5, big: 3601, ok: 3600 }, 'Alice');
  assert.deepEqual(got.scores, [
    { score: 23000, stage: 3, level: 2, day: '2026-10-11' },
    { score: 1500, stage: 0, level: 0, day: '' },
    { score: 10000, stage: 0, level: 0, day: '' },
  ]);
  assert.deepEqual(got.times, { spiral: 83, ok: 3600 });
  assert.doesNotMatch(JSON.stringify(got), /Alice|Bruno|"name"/);
  assert.deepEqual(R.migrationItems(defaultScores(), {}, 'Zuma'), { scores: [], times: {} }, 'demo entries never sent, even under that name');
});

// ------------------------------------------------------------ vues « Tous » / « Moi » (D-09)

test('scoresView with a server copy: server list ∪ pending (named after the player), sorted, ≤ 10, date = day', () => {
  const cache = state({
    shared: { scores: [rs('Bruno', 9000, { day: '2026-10-10' }), rs('Alice', 5000), rs('Bruno', 4000)], times: {} },
    mine: { scores: [rs('Alice', 5000)], times: {} },
  });
  let s = withCache(cache);
  s = R.queueScore(s, S(5000, { stage: 2, level: 1, day: '2026-10-11' }), ID(1));
  s = R.queueScore(s, S(6000), ID(2));
  const all = R.scoresView(s, 'shared', defaultScores(), 'Alice');
  assert.deepEqual(all, [
    hs('Bruno', 9000, { date: '2026-10-10' }), hs('Alice', 6000), hs('Alice', 5000),
    hs('Alice', 5000, { stage: 2, level: 1, date: '2026-10-11' }), hs('Bruno', 4000),
  ], 'server entries before pending ones on equal scores');
  const mine = R.scoresView(s, 'mine', defaultScores(), 'Alice');
  assert.deepEqual(mine, [hs('Alice', 6000), hs('Alice', 5000), hs('Alice', 5000, { stage: 2, level: 1, date: '2026-10-11' })]);
  const full = withCache(state({ shared: { scores: Array.from({ length: 10 }, (_, i) => rs('Bruno', 10000 - i * 100)), times: {} } }));
  const view = R.scoresView(R.queueScore(full, S(9950), ID(3)), 'shared', [], 'Alice');
  assert.equal(view.length, 10);
  assert.deepEqual(view[1], hs('Alice', 9950));
  assert.equal(view[9].score, 9200);
});

test('scoresView without a server copy: « Tous » = the local table as is, « Moi » = local non-demo entries of the player', () => {
  const local = [hs('Alice', 23000), ...defaultScores(), hs('Bruno', 7000), hs('Alice', 300)];
  const store = R.emptyRecordsStore();
  const all = R.scoresView(store, 'shared', local, 'Alice');
  assert.deepEqual(all, local);
  assert.notEqual(all, local, 'a copy');
  assert.deepEqual(R.scoresView(store, 'mine', local, 'Alice'), [hs('Alice', 23000), hs('Alice', 300)]);
  assert.deepEqual(R.scoresView(R.queueScore(store, S(500), ID(1)), 'mine', local, 'Alice'), [hs('Alice', 23000), hs('Alice', 300)],
    'the pending score is already in the local table');
});

test('levelRecord: the best time with its holder, the personal best only when it differs', () => {
  const cache = state({ shared: { times: { spiral: { seconds: 60, name: 'Bruno' } } }, mine: { times: { spiral: 75 } } });
  const s = withCache(cache);
  assert.deepEqual(R.levelRecord(s, 'spiral', null, 'Alice'), { best: { seconds: 60, name: 'Bruno' }, personal: 75 });
  assert.deepEqual(R.levelRecord(s, 'spiral', 55, 'Alice'), { best: { seconds: 55, name: 'Alice' }, personal: null });
  assert.deepEqual(R.levelRecord(s, 'spiral', 90, 'Alice'), { best: { seconds: 60, name: 'Bruno' }, personal: 75 });
  const tie = withCache(state({ shared: { times: { spiral: { seconds: 60, name: 'Bruno' } } }, mine: { times: { spiral: 60 } } }));
  assert.deepEqual(R.levelRecord(tie, 'spiral', null, 'Alice'), { best: { seconds: 60, name: 'Bruno' }, personal: null });
  assert.deepEqual(R.levelRecord(R.emptyRecordsStore(), 'spiral', 83, 'Alice'), { best: { seconds: 83, name: 'Alice' }, personal: null }, 'standalone');
  assert.deepEqual(R.levelRecord(R.emptyRecordsStore(), 'spiral', null, 'Alice'), { best: null, personal: null });
  assert.deepEqual(R.levelRecord(s, 'loop-3', null, 'Alice'), { best: null, personal: null });
  const queued = R.queueTime(s, 'spiral', 70);
  assert.deepEqual(R.levelRecord(queued, 'spiral', null, 'Alice'), { best: { seconds: 60, name: 'Bruno' }, personal: 70 }, 'a pending time counts as personal');
  assert.deepEqual(R.levelRecord(R.queueTime(s, 'spiral', 50), 'spiral', 52, 'Alice'), { best: { seconds: 50, name: 'Alice' }, personal: null });
  assert.deepEqual(R.levelRecord(s, 'constructor', null, 'Alice'), { best: null, personal: null }, 'never an inherited member');
});

test('rankOf: 0-based row of the first entry with that name and score, else null', () => {
  const list = [hs('Bruno', 9000), hs('Alice', 5000), hs('Alice', 5000), hs('Alice', 300)];
  assert.equal(R.rankOf(list, 'Alice', 5000), 1);
  assert.equal(R.rankOf(list, 'Alice', 300), 3);
  assert.equal(R.rankOf(list, 'Bruno', 5000), null);
  assert.equal(R.rankOf([], 'Alice', 1), null);
});

test('recordsEnabled: hosted build only (http(s), not a loopback host, pack present) — D-01', () => {
  assert.equal(R.recordsEnabled({ protocol: 'https:', hostname: 'zuma-x.pages.dev', hasPack: true }), true);
  assert.equal(R.recordsEnabled({ protocol: 'http:', hostname: 'zuma.example.org', hasPack: true }), true);
  for (const where of [
    { protocol: 'file:', hostname: '', hasPack: true },
    { protocol: 'http:', hostname: 'localhost', hasPack: true },
    { protocol: 'http:', hostname: '127.0.0.1', hasPack: true },
    { protocol: 'http:', hostname: '[::1]', hasPack: true },
    { protocol: 'http:', hostname: '::1', hasPack: true },
    { protocol: 'https:', hostname: 'zuma-x.pages.dev', hasPack: false },
    { protocol: 'data:', hostname: 'zuma-x.pages.dev', hasPack: true },
  ]) {
    assert.equal(R.recordsEnabled(where), false, JSON.stringify(where));
  }
});

// ------------------------------------------------------------ machine d'états : effet record-score (D-07)

const SIZES = [5, 5, 5, 6, 6, 6, 7, 7, 7, 7, 7, 7, 1];
const run = (stage, level, score = 0, lives = 3) => ({ stage, level, score, lives });
const ALICE = { name: 'Alice', maxStage: 12 };
const boot = (o = {}) => P.initialApp({ profile: ALICE, save: null, scores: defaultScores(), sizes: SIZES, startLives: 3, review: null, ...o });
const onLevel = (r, profile = ALICE) => {
  const { state: s } = boot({ profile, save: r });
  return P.reduceApp(P.reduceApp(s, { kind: 'adventure' }).state, { kind: 'continue' }).state;
};
const kindsOf = effects => effects.map(e => e.kind);

test('record-score: emitted at a game over right after save-scores, with the inserted entry', () => {
  const over = P.reduceApp(onLevel(run(3, 2, 15000, 1)), { kind: 'gameover', score: 23000, date: '2026-10-11' });
  assert.deepEqual(kindsOf(over.effects), ['save-scores', 'record-score', 'save-run']);
  const entry = { name: 'Alice', score: 23000, stage: 3, level: 2, date: '2026-10-11' };
  assert.deepEqual(over.effects[1], { kind: 'record-score', entry });
  assert.deepEqual(over.effects[0].scores[0], entry);
  const anon = P.reduceApp({ ...onLevel(run(0, 0)), profile: null }, { kind: 'gameover', score: 1500, date: '' });
  assert.equal(anon.effects.find(e => e.kind === 'record-score').entry.name, 'Joueur');
});

test('record-score: emitted by the final route of won (after the final STATS), right after save-scores', () => {
  const fin = P.reduceApp(onLevel(run(12, 0, 200000, 2)), { kind: 'won', score: 230000, lives: 2, date: '2026-10-11' });
  assert.deepEqual(kindsOf(fin.effects), ['save-scores', 'record-score', 'save-run', 'sound']);
  assert.deepEqual(fin.effects[1], { kind: 'record-score', entry: { name: 'Alice', score: 230000, stage: 12, level: 0, date: '2026-10-11' } });
});

test('record-score: no other transition emits it; dropped in review sessions (?level=)', () => {
  const events = [
    [onLevel(run(0, 0)), { kind: 'won', score: 100, lives: 3, date: '' }],
    [onLevel(run(0, 4)), { kind: 'won', score: 100, lives: 3, date: '' }],
    [onLevel(run(2, 4)), { kind: 'won', score: 100, lives: 3, date: '' }],
    [onLevel(run(1, 1)), { kind: 'retry', lives: 2 }],
    [onLevel(run(1, 1)), { kind: 'leave' }],
  ];
  for (const [s, ev] of events) {
    assert.ok(!kindsOf(P.reduceApp(s, ev).effects).includes('record-score'), JSON.stringify(ev));
  }
  const over = P.reduceApp(boot({ review: run(1, 1) }).state, { kind: 'gameover', score: 99999, date: '' });
  assert.deepEqual(over.effects, []);
  const fin = P.reduceApp(boot({ review: run(12, 0, 1, 3) }).state, { kind: 'won', score: 300000, lives: 3, date: '' });
  assert.deepEqual(kindsOf(fin.effects), ['sound']);
  assert.match(fs.readFileSync('src/progress.ts', 'utf8'), /new Set\(\[[^\]]*'record-score'[^\]]*\]\)/, 'record-score in WRITE_EFFECTS');
});

// ------------------------------------------------------------ client d'échange api/records (D-06, D-07), fetch simulé

const VALID = state({ shared: { scores: [rs('Bruno', 9000)], times: { spiral: { seconds: 60, name: 'Bruno' } } }, mine: { scores: [], times: { spiral: 75 } } });
const reply = (status, data = VALID, o = {}) => ({
  ok: status >= 200 && status < 300,
  status,
  type: o.type ?? 'basic',
  headers: { get: name => (name.toLowerCase() === 'content-type' ? (o.contentType ?? 'application/json; charset=utf-8') : null) },
  json: async () => { if (o.badJson) throw new SyntaxError('Unexpected token <'); return data; },
});
/** Fake transport: answers in order (a function answer is called with the init), every call logged. */
function fakeIo(answers, timeoutMs) {
  const calls = [];
  const queue = [...answers];
  const io = {
    calls,
    fetch(url, init) {
      calls.push({ url, init });
      const next = queue.length > 0 ? queue.shift() : reply(200);
      if (typeof next === 'function') return next(init);
      return next instanceof Error ? Promise.reject(next) : Promise.resolve(next);
    },
  };
  if (timeoutMs !== undefined) io.timeoutMs = timeoutMs;
  return io;
}

test('exchangeRecords: GET without a body, POST JSON with one; same-origin relative path, no-store, manual redirect, never a name', async () => {
  const io = fakeIo([reply(200), reply(200)]);
  const got = await R.exchangeRecords(io, null);
  assert.deepEqual(got, { kind: 'ok', state: R.parseRecordsState(VALID) });
  assert.equal(io.calls[0].url, 'api/records');
  const get = io.calls[0].init;
  assert.equal(get.method, 'GET');
  assert.equal(get.credentials, 'same-origin');
  assert.equal(get.cache, 'no-store');
  assert.equal(get.redirect, 'manual');
  assert.deepEqual(get.headers, { Accept: 'application/json' });
  assert.equal(get.body, undefined);
  let s = R.queueScore(R.emptyRecordsStore(), S(5000, { day: '2026-10-11' }), ID(1));
  s = R.queueTime(s, 'spiral', 80);
  const body = R.postBody(s);
  await R.exchangeRecords(io, { ...body, name: 'Alice', scores: body.scores.map(e => ({ ...e, name: 'Alice' })) });
  const post = io.calls[1].init;
  assert.equal(io.calls[1].url, 'api/records');
  assert.equal(post.method, 'POST');
  assert.deepEqual(post.headers, { Accept: 'application/json', 'Content-Type': 'application/json' });
  assert.equal(post.body, JSON.stringify(body));
  assert.doesNotMatch(post.body, /name|Alice/, 'D-04: the client never sends a name');
  assert.ok(post.signal === undefined || typeof post.signal.aborted === 'boolean');
});

test('exchangeRecords: 400 / 413 / 415 → drop; every other failure → retry; never rejects', async () => {
  for (const status of [400, 413, 415]) assert.deepEqual(await R.exchangeRecords(fakeIo([reply(status, {})]), null), { kind: 'drop' }, String(status));
  for (const status of [401, 403, 404, 405, 429, 500, 502, 503]) {
    assert.deepEqual(await R.exchangeRecords(fakeIo([reply(status, {})]), null), { kind: 'retry' }, String(status));
  }
  const retries = [
    reply(0, null, { type: 'opaqueredirect' }),
    reply(200, VALID, { type: 'opaqueredirect' }),
    reply(302, null),
    reply(200, VALID, { contentType: 'text/html; charset=utf-8' }),
    reply(200, null, { badJson: true }),
    reply(200, { shared: 1 }),
    reply(200, [1, 2]),
    new TypeError('Failed to fetch'),
    () => { throw new Error('synchronous'); },
    () => Promise.resolve(null),
  ];
  for (const answer of retries) assert.deepEqual(await R.exchangeRecords(fakeIo([answer]), null), { kind: 'retry' });
});

test('exchangeRecords: no answer within timeoutMs → retry, the request signal aborted', async () => {
  const io = fakeIo([() => new Promise(() => {})], 20);
  const t0 = Date.now();
  assert.deepEqual(await R.exchangeRecords(io, null), { kind: 'retry' });
  assert.ok(Date.now() - t0 < 2000, 'gave up quickly');
  assert.equal(io.calls[0].init.signal.aborted, true);
  // A slow body read is bounded too.
  const slow = fakeIo([{ ...reply(200), json: () => new Promise(() => {}) }], 20);
  assert.deepEqual(await R.exchangeRecords(slow, null), { kind: 'retry' });
});

// ------------------------------------------------------------ synchronisation (D-07, D-08)

/** In-memory access to zuma.records.v1; `onSet` sees every persisted store. */
function memory(initial) {
  let current = initial;
  const sets = [];
  return { sets, get: () => current, set: s => { current = s; sets.push(s); }, poke: f => { current = f(current); } };
}
const NO_MIGRATION = () => ({ scores: [], times: {} });
let idSeq = 100;
const makeId = () => ID(idSeq++);

test('syncRecords: nothing pending → one GET, the server copy persisted', async () => {
  const mem = memory({ ...R.emptyRecordsStore(), migrated: true });
  const io = fakeIo([reply(200)]);
  assert.equal(await R.syncRecords(mem, io, NO_MIGRATION, makeId), true);
  assert.equal(io.calls.length, 1);
  assert.equal(io.calls[0].init.method, 'GET');
  assert.equal(mem.sets.length, 1);
  assert.deepEqual(mem.get().cache, R.parseRecordsState(VALID));
});

test('syncRecords: pending items POSTed, the answer applied to the CURRENT store (a score queued meanwhile stays pending)', async () => {
  let s = { ...R.emptyRecordsStore(), migrated: true };
  s = R.queueScore(s, S(5000), ID(1));
  s = R.queueTime(s, 'spiral', 80);
  const mem = memory(s);
  const io = fakeIo([
    init => { mem.poke(cur => R.queueScore(cur, S(700), ID(2))); return Promise.resolve(reply(200)); },
    reply(200),
  ]);
  assert.equal(await R.syncRecords(mem, io, NO_MIGRATION, makeId), true);
  assert.equal(io.calls[0].init.method, 'POST');
  assert.deepEqual(JSON.parse(io.calls[0].init.body), { scores: [{ id: ID(1), ...S(5000) }], times: [{ level: 'spiral', seconds: 80 }] });
  assert.deepEqual(JSON.parse(io.calls[1].init.body), { scores: [{ id: ID(2), ...S(700) }], times: [] }, 'the queued-meanwhile score sent next');
  assert.equal(mem.sets.length, 2, 'set after each successful exchange');
  assert.deepEqual(mem.sets[0].pending.scores.map(e => e.id), [ID(2)]);
  assert.deepEqual(mem.get().pending, { scores: [], times: {} });
  assert.deepEqual(mem.get().cache, R.parseRecordsState(VALID));
});

test('syncRecords: drop removes the refused send with the cache unchanged; retry leaves the store untouched and resolves false', async () => {
  let s = { ...R.emptyRecordsStore(), migrated: true, cache: R.parseRecordsState(VALID) };
  s = R.queueScore(s, S(5000), ID(1));
  const dropped = memory(s);
  assert.equal(await R.syncRecords(dropped, fakeIo([reply(415, {}), reply(200, state())]), NO_MIGRATION, makeId), true);
  assert.deepEqual(dropped.sets[0].pending.scores, []);
  assert.deepEqual(dropped.sets[0].cache, R.parseRecordsState(VALID), 'cache unchanged by a drop');
  assert.equal(dropped.sets.length, 2, 'then the GET refreshes the copy');
  const offline = memory(s);
  assert.equal(await R.syncRecords(offline, fakeIo([new TypeError('offline')]), NO_MIGRATION, makeId), false);
  assert.equal(offline.sets.length, 0);
  assert.equal(offline.get(), s);
  const onlyDrop = memory(s);
  assert.equal(await R.syncRecords(onlyDrop, fakeIo([reply(400, {}), new TypeError('offline')]), NO_MIGRATION, makeId), false);
  assert.equal(onlyDrop.sets.length, 1);
});

test('syncRecords: D-08 import once, after the first success, persisted with migrated in the same set, then sent', async () => {
  const mem = memory(R.emptyRecordsStore());
  let calls = 0;
  const migrate = () => {
    calls++;
    return { scores: [{ score: 23000, stage: 3, level: 2, day: '2026-10-11' }], times: { spiral: 83, 'loop-3': 120 } };
  };
  const failing = await R.syncRecords(mem, fakeIo([new TypeError('offline')]), migrate, makeId);
  assert.equal(failing, false);
  assert.equal(calls, 0, 'not before a successful exchange');
  assert.equal(mem.get().migrated, false);
  const io = fakeIo([reply(200), reply(200)]);
  assert.equal(await R.syncRecords(mem, io, migrate, makeId), true);
  assert.equal(calls, 1);
  assert.deepEqual(kindsOf(io.calls.map(c => ({ kind: c.init.method }))), ['GET', 'POST']);
  const first = mem.sets[0];
  assert.equal(first.migrated, true);
  assert.equal(first.pending.scores.length, 1, 'queued in the same set as migrated: true');
  assert.deepEqual(first.pending.times, { 'loop-3': 120, spiral: 83 });
  const sent = JSON.parse(io.calls[1].init.body);
  assert.match(sent.scores[0].id, /^[0-9a-f]{16}$/);
  assert.deepEqual({ ...sent.scores[0], id: 'x' }, { id: 'x', score: 23000, stage: 3, level: 2, day: '2026-10-11' });
  assert.doesNotMatch(io.calls[1].init.body, /name/);
  assert.deepEqual(mem.get().pending, { scores: [], times: {} });
  await R.syncRecords(mem, fakeIo([reply(200)]), migrate, makeId);
  assert.equal(calls, 1, 'never again on this device');
});

test('syncRecords: at most 3 exchanges per call; never rejects', async () => {
  let s = { ...R.emptyRecordsStore(), migrated: true };
  s = R.queueScore(s, S(5000), ID(1));
  const mem = memory(s);
  let n = 0;
  // Every answer comes with a fresh score queued meanwhile: the queue never empties.
  const io = fakeIo(Array.from({ length: 10 }, () => () => { mem.poke(cur => R.queueScore(cur, S(100 + n), ID(500 + n++))); return Promise.resolve(reply(200)); }));
  assert.equal(await R.syncRecords(mem, io, NO_MIGRATION, makeId), true);
  assert.equal(io.calls.length, 3);
  const broken = { get: () => { throw new Error('storage'); }, set: () => { throw new Error('storage'); } };
  assert.equal(await R.syncRecords(broken, fakeIo([reply(200)]), NO_MIGRATION, makeId), false);
});

test('records.js: one fetch call (io.fetch), no console, no randomUUID, no global I/O', () => {
  const js = fs.readFileSync('.compiled/records.js', 'utf8');
  assert.equal((js.match(/fetch\(/g) ?? []).length, 1);
  assert.match(js, /io\.fetch\(/);
  assert.doesNotMatch(js, /\b(document|window|localStorage|location|console|randomUUID)\b/);
});
