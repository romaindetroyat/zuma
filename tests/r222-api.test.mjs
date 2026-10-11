// R2.0.22 — API des records partagés du worker (06.1-CONTEXT D-04..D-06, D-10, D-11) : base D1 distincte
// `zuma-scores` liée sous SCORES_DB, schéma et SQL fermé vérifiés sur une vraie base SQLite en mémoire (node:sqlite),
// route GET / POST /api/records du worker Pages généré exécutée dans node:vm avec un JWT Access simulé. Prénoms de
// démonstration et adresses example.org uniquement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import {
  SCORES_BINDING, SCORES_DATABASE_NAME, SCORES_SCHEMA, SCORES_TABLES, RECORDS_SQL, RECORDS_LIMITS, RECORDS_RATE,
  recordLevelIds, recordsWorkerSource,
} from '../tools/recordsapi.mjs';
import { D1_BINDING } from '../tools/d1worker.mjs';
import { DATABASE_NAME } from '../tools/d1deploy.mjs';
import { fakeScoresD1 } from './fake-scores-d1.mjs';

/** In-memory SQLite database with the records schema applied `times` times. */
function schemaDb(times = 1) {
  const db = new DatabaseSync(':memory:');
  for (let i = 0; i < times; i++) for (const s of SCORES_SCHEMA) db.exec(s);
  return db;
}

// ------------------------------------------------------------ constantes, schéma, SQL fermé

test('records database: own binding and name, distinct from the content database', () => {
  assert.equal(SCORES_BINDING, 'SCORES_DB');
  assert.notEqual(SCORES_BINDING, D1_BINDING);
  assert.notEqual(SCORES_BINDING, 'ASSETS', 'never the reserved Pages binding');
  assert.equal(SCORES_DATABASE_NAME, 'zuma-scores');
  assert.notEqual(SCORES_DATABASE_NAME, DATABASE_NAME);
  assert.deepEqual(SCORES_TABLES, ['scores', 'times']);
});

test('SCORES_SCHEMA: two idempotent CREATE TABLE IF NOT EXISTS, tables scores and times on a real SQLite', () => {
  assert.equal(SCORES_SCHEMA.length, 2);
  for (const s of SCORES_SCHEMA) assert.match(s, /^CREATE TABLE IF NOT EXISTS (scores|times) \(/);
  const db = schemaDb(2);
  const tables = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name").all().map(r => r.name);
  assert.deepEqual(tables, ['scores', 'times']);
  const cols = t => db.prepare(`PRAGMA table_info(${t})`).all().map(r => r.name);
  assert.deepEqual(cols('scores'), ['id', 'player', 'sid', 'name', 'score', 'stage', 'level', 'day', 'at']);
  assert.deepEqual(cols('times'), ['player', 'level', 'name', 'seconds', 'at']);
});

test('RECORDS_SQL: closed list, every text prepares on the schema, no DELETE / DROP / ALTER', () => {
  assert.deepEqual(Object.keys(RECORDS_SQL).sort(), ['allTimes', 'insertScore', 'mineScores', 'mineTimes', 'sharedScores', 'upsertTime']);
  const db = schemaDb();
  for (const [name, sql] of Object.entries(RECORDS_SQL)) {
    assert.equal(typeof sql, 'string', name);
    assert.doesNotMatch(sql, /\b(delete|drop|alter)\b/i, name);
    assert.doesNotThrow(() => db.prepare(sql), name);
  }
  assert.ok(Object.isFrozen(RECORDS_SQL));
});

test('upsertTime keeps the best: 90 then 80 → 80 (second name); 80 then 90 → 80 (first name)', () => {
  const db = schemaDb();
  const up = db.prepare(RECORDS_SQL.upsertTime);
  const row = (p, l) => ({ ...db.prepare('SELECT name, seconds FROM times WHERE player = ? AND level = ?').get(p, l) });
  up.run('p1', 'spiral', 'Alice', 90, 1);
  up.run('p1', 'spiral', 'Alicia', 80, 2);
  assert.deepEqual(row('p1', 'spiral'), { name: 'Alicia', seconds: 80 });
  up.run('p2', 'claw', 'Bruno', 80, 1);
  up.run('p2', 'claw', 'Bruno2', 90, 2);
  assert.deepEqual(row('p2', 'claw'), { name: 'Bruno', seconds: 80 });
  up.run('p2', 'claw', 'Bruno3', 80, 3);
  assert.deepEqual(row('p2', 'claw'), { name: 'Bruno', seconds: 80 }, 'a tie is not an improvement');
});

test('insertScore is idempotent per (player, sid); reads sort by score then age', () => {
  const db = schemaDb();
  const ins = db.prepare(RECORDS_SQL.insertScore);
  ins.run('p1', '0123456789abcdef', 'Alice', 500, 0, 1, '2026-10-11', 1);
  ins.run('p1', '0123456789abcdef', 'Alice', 500, 0, 1, '2026-10-11', 2);
  ins.run('p2', '0123456789abcdef', 'Bruno', 700, 1, 2, '', 3);
  ins.run('p1', 'fedcba9876543210', 'Alice', 700, 1, 3, '', 4);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM scores').get().n, 3);
  const shared = db.prepare(RECORDS_SQL.sharedScores).all().map(r => `${r.name}:${r.score}`);
  assert.deepEqual(shared, ['Bruno:700', 'Alice:700', 'Alice:500'], 'tie → oldest first');
  assert.deepEqual(db.prepare(RECORDS_SQL.mineScores).all('p1').map(r => r.score), [700, 500]);
  db.prepare(RECORDS_SQL.upsertTime).run('p1', 'spiral', 'Alice', 80, 5);
  db.prepare(RECORDS_SQL.upsertTime).run('p2', 'spiral', 'Bruno', 80, 6);
  assert.deepEqual(db.prepare(RECORDS_SQL.allTimes).all().map(r => r.name), ['Alice', 'Bruno'], 'tie → oldest first');
  assert.deepEqual(db.prepare(RECORDS_SQL.mineTimes).all('p2').map(r => ({ ...r })), [{ level: 'spiral', seconds: 80 }]);
});

test('RECORDS_LIMITS: the D-10 bounds; RECORDS_RATE: 20 POST / 60 s / identity, 512 identities', () => {
  assert.deepEqual(RECORDS_LIMITS, {
    scoreMax: 99999999, stageMax: 99, levelMax: 99, secondsMin: 1, secondsMax: 3600,
    levelId: '^[a-z0-9-]{1,40}$', sid: '^[0-9a-f]{16}$', day: '^(\\d{4}-\\d{2}-\\d{2})?$',
    scoresPerPost: 10, timesPerPost: 40, listMax: 10, nameMax: 20, bodyMax: 4096,
  });
  assert.deepEqual(RECORDS_RATE, { windowMs: 60000, max: 20, identities: 512 });
});

test('RECORDS_LIMITS equals RECORD_BOUNDS of the client (src/records.ts)', async t => {
  const file = new URL('../.compiled/records.js', import.meta.url);
  if (!fs.existsSync(file)) {
    t.skip('records.js absent (plan 06.1-01)');
    return;
  }
  const { RECORD_BOUNDS } = await import(file.href);
  assert.deepEqual({ ...RECORDS_LIMITS }, { ...RECORD_BOUNDS });
});

test('recordLevelIds: pack graphics keys normalised like bestTimeKey, sorted, unique', () => {
  assert.deepEqual(recordLevelIds({ graphics: { Spiral: {}, claw: {}, 'tunnel level': {} } }), ['claw', 'spiral', 'tunnel-level']);
  assert.deepEqual(recordLevelIds({ graphics: { Spiral: {}, spiral: {} } }), ['spiral']);
  assert.deepEqual(recordLevelIds({}), []);
  assert.deepEqual(recordLevelIds(null), []);
  assert.deepEqual(recordLevelIds(undefined), []);
});

test('recordsWorkerSource: deterministic, levels sorted and unique, bad level id refused (French)', () => {
  const a = recordsWorkerSource({ levels: ['b', 'a', 'a'] });
  assert.equal(a, recordsWorkerSource({ levels: ['a', 'b'] }));
  assert.ok(a.includes('["a","b"]'), 'sorted, unique list inlined');
  assert.equal(recordsWorkerSource(), recordsWorkerSource({ levels: [] }));
  for (const sql of Object.values(RECORDS_SQL)) assert.ok(a.includes(JSON.stringify(sql)), sql);
  for (const bad of ['A', 'x'.repeat(41), 'a_b', '', 3]) {
    assert.throws(() => recordsWorkerSource({ levels: [bad] }), /niveau/i, String(bad));
  }
  assert.throws(() => recordsWorkerSource({ levels: 'spiral' }), /niveau/i);
});

test('fakeScoresD1: D1 API over SQLite (prepare / bind / all / run / first / batch), SQL journal, outage switch', async () => {
  const fake = fakeScoresD1();
  const d = fake.binding;
  const r = await d.batch([
    d.prepare(RECORDS_SQL.insertScore).bind('p', '0123456789abcdef', 'Alice', 1, 0, 0, '', 1),
    d.prepare(RECORDS_SQL.upsertTime).bind('p', 'spiral', 'Alice', 9, 1),
  ]);
  assert.equal(r.length, 2);
  assert.equal(r[0].meta.changes, 1);
  const all = await d.prepare(RECORDS_SQL.sharedScores).all();
  assert.equal(all.success, true);
  assert.deepEqual(all.results, [{ name: 'Alice', score: 1, stage: 0, level: 0, day: '' }]);
  assert.deepEqual(await d.prepare(RECORDS_SQL.mineTimes).bind('p').first(), { level: 'spiral', seconds: 9 });
  assert.equal(await d.prepare(RECORDS_SQL.mineTimes).bind('x').first(), null);
  assert.equal(fake.sql.length, 5);
  fake.fail = true;
  await assert.rejects(d.prepare(RECORDS_SQL.sharedScores).all());
  await assert.rejects(d.batch([d.prepare(RECORDS_SQL.mineTimes).bind('p')]));
  fake.fail = false;
  // A failing statement rolls the whole batch back.
  await assert.rejects(d.batch([
    d.prepare(RECORDS_SQL.insertScore).bind('q', '1111111111111111', 'Bruno', 5, 0, 0, '', 2),
    d.prepare(RECORDS_SQL.upsertTime).bind('q', 'spiral', null, 5, 2), // NOT NULL violation
  ]));
  assert.equal(fake.db.prepare('SELECT COUNT(*) AS n FROM scores').get().n, 1, 'rolled back');
});
