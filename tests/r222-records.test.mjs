// R2.0.22 — records partagés, règles client (06.1-CONTEXT D-02, D-03, D-07, D-08, D-10).
// Module pur `records.ts` : copie du serveur, file d'envois « le meilleur gagne », bornes, lecture défensive,
// vues « Tous » / « Moi », reprise de l'existant, client d'échange `api/records` avec un fetch simulé.
// Données de démonstration uniquement (« Alice », « Bruno ») : aucun prénom ni aucune adresse réels.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as R from '../.compiled/records.js';
import { bestTimeKey } from '../.compiled/statsdialog.js';
import { defaultScores } from '../.compiled/progress.js';

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
