// R2.0.22 — API des records partagés du worker (06.1-CONTEXT D-04..D-06, D-10, D-11) : base D1 distincte
// `zuma-scores` liée sous SCORES_DB, schéma et SQL fermé vérifiés sur une vraie base SQLite en mémoire (node:sqlite),
// route GET / POST /api/records du worker Pages généré exécutée dans node:vm avec un JWT Access simulé. Prénoms de
// démonstration et adresses example.org uniquement.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { DatabaseSync } from 'node:sqlite';
import vm from 'node:vm';
import {
  SCORES_BINDING, SCORES_DATABASE_NAME, SCORES_SCHEMA, SCORES_TABLES, RECORDS_SQL, RECORDS_LIMITS, RECORDS_RATE,
  recordLevelIds, recordsWorkerSource,
} from '../tools/recordsapi.mjs';
import { D1_BINDING, generateWorker, playerKey } from '../tools/d1worker.mjs';
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

// ------------------------------------------------------------ worker généré : route /api/records (node:vm)

const TEAM = 'equipe-test.cloudflareaccess.com';
const ISS = `https://${TEAM}`;
const CERTS = `${ISS}/cdn-cgi/access/certs`;
const AUD = 'c0ffee'.repeat(10) + 'c0de';
const ACCESS = { team: TEAM, aud: AUD };
const HOST = 'https://zuma-x.pages.dev';
const subtle = globalThis.crypto.subtle;
const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const { privateKey, publicKey } = await subtle.generateKey(RSA, true, ['sign', 'verify']);
const { n, e } = await subtle.exportKey('jwk', publicKey);
const JWKS = { keys: [{ kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n, e }] };
const b64u = x => Buffer.from(JSON.stringify(x)).toString('base64url');

/** Access application token for `email` (null → a service token without `email`), valid one hour at `clock`. */
async function jwt(email, clock = { offset: 0 }) {
  const t = Math.floor((Date.now() + clock.offset) / 1000);
  const head = b64u({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const claims = { aud: [AUD], exp: t + 3600, iat: t - 5, nbf: t - 5, iss: ISS, type: 'app', sub: 'u' };
  if (email !== null) claims.email = email;
  const body = b64u(claims);
  const sig = Buffer.from(await subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`))).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const PLAYERS = { 'alice@example.org': 'Alice', 'bruno@example.org': 'Bruno' };
const LEVELS = ['claw', 'spiral'];
const MANIFEST = { '/index.html': { key: 'sha256:00', contentType: 'text/html; charset=utf-8', size: 0 } };
const workerSource = (opts = {}) => generateWorker(MANIFEST, { build: '2.0.22+T', access: ACCESS, players: PLAYERS, levels: LEVELS, ...opts });

/** Fake content database: records every prepared text (the records route must never touch it). */
function fakeAssets() {
  const sql = [];
  return { sql, prepare(text) { sql.push(text); return { bind: () => ({ all: async () => ({ results: [], success: true, meta: {} }) }) }; } };
}

/** Generated worker in a vm context with the Web globals of a Pages worker, a test clock and a fake JWKS. */
function setup({ source = workerSource(), env } = {}) {
  const clock = { offset: 0 };
  const fetch = async url => {
    assert.equal(String(url), CERTS, 'only the team certs URL is fetched');
    return new Response(JSON.stringify(JWKS), { headers: { 'content-type': 'application/json' } });
  };
  const context = vm.createContext({ Response, Headers, URL, atob, crypto: globalThis.crypto, fetch, TextEncoder, TextDecoder, clock, realNow: Date.now });
  vm.runInContext('Date.now = () => realNow() + clock.offset;', context);
  vm.runInContext(source.replace(/^export default /m, 'globalThis.worker = '), context, { filename: '_worker.js' });
  const scores = fakeScoresD1();
  const assets = fakeAssets();
  const bindings = env ?? { [D1_BINDING]: assets, [SCORES_BINDING]: scores.binding };
  const call = (p, init = {}) => context.worker.fetch(new Request(HOST + p, init), bindings, {});
  const as = async (email, p, init = {}) => call(p, { ...init, headers: { 'cf-access-jwt-assertion': await jwt(email, clock), ...(init.headers ?? {}) } });
  const get = (email, init = {}) => as(email, '/api/records', init);
  /** POST as `email`; `origin` / `length` null → header left out; `type` = content-type. */
  const post = (email, body, { origin = HOST, type = 'application/json', length, path = '/api/records' } = {}) => {
    const text = typeof body === 'string' ? body : JSON.stringify(body);
    const headers = { 'content-type': type };
    if (origin !== null) headers.origin = origin;
    const len = length === undefined ? String(Buffer.byteLength(text)) : length;
    if (len !== null) headers['content-length'] = len;
    return as(email, path, { method: 'POST', body: text, headers });
  };
  const rows = table => scores.db.prepare(`SELECT * FROM ${table}`).all().map(r => ({ ...r }));
  return { source, clock, scores, assets, call, as, get, post, rows };
}

/** A score entry of the client queue (id = 16 hex digits). */
const sc = (n, score, extra = {}) => ({ id: n.toString(16).padStart(16, '0'), score, stage: 0, level: 3, day: '2026-10-11', ...extra });
const EMPTY = { shared: { scores: [], times: {} }, mine: { scores: [], times: {} } };
const ALICE = 'alice@example.org';
const BRUNO = 'bruno@example.org';

async function assertPlain(res, status, what) {
  assert.equal(res.status, status, what);
  assert.equal(res.headers.get('cache-control'), 'no-store', what);
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff', what);
  const text = await res.text();
  assert.doesNotMatch(text, /d1|sqlite|error|stack|constraint/i, `${what}: no detail`);
  return text;
}

test('api/records: no valid Access JWT → 403 « Accès refusé. »; a token without email (service token) → 403', async () => {
  const { call, get, post, rows } = setup();
  for (const method of ['GET', 'POST', 'HEAD']) {
    const res = await call('/api/records', { method, headers: { origin: HOST, 'content-type': 'application/json' } });
    assert.equal(res.status, 403, method);
    if (method !== 'HEAD') assert.equal(await res.text(), 'Accès refusé.');
  }
  assert.equal((await call('/api/records', { headers: { 'cf-access-jwt-assertion': 'x.y.z' } })).status, 403, 'forged token');
  assert.equal((await get(null)).status, 403, 'GET without email');
  assert.equal((await post(null, { scores: [sc(1, 10)] })).status, 403, 'POST without email');
  assert.equal(rows('scores').length, 0);
});

test('api/records GET: empty state as JSON no-store; HEAD → 200 without a body', async () => {
  const { get } = setup();
  const res = await get(ALICE);
  assert.equal(res.status, 200);
  assert.match(res.headers.get('content-type'), /^application\/json; charset=utf-8$/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(await res.json(), EMPTY);
  const head = await get(ALICE, { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(head.headers.get('cache-control'), 'no-store');
  assert.equal(await head.text(), '');
});

test('api/records POST: the server sets the first name from the JWT (a client name is ignored), answers the new state', async () => {
  const { post, rows, scores } = setup();
  const res = await post(ALICE, { scores: [sc(1, 12000)], times: [{ level: 'spiral', seconds: 83 }], name: 'Pirate' });
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('cache-control'), 'no-store');
  const text = await res.text();
  assert.doesNotMatch(text, /Pirate/);
  const state = JSON.parse(text);
  assert.deepEqual(state.shared.scores, [{ name: 'Alice', score: 12000, stage: 0, level: 3, day: '2026-10-11' }]);
  assert.deepEqual(state.mine.scores, state.shared.scores);
  assert.deepEqual(state.shared.times, { spiral: { seconds: 83, name: 'Alice' } });
  assert.deepEqual(state.mine.times, { spiral: 83 });
  assert.doesNotMatch(JSON.stringify([rows('scores'), rows('times')]), /Pirate/, 'never stored');
  assert.ok(scores.sql.includes(RECORDS_SQL.insertScore) && scores.sql.includes(RECORDS_SQL.upsertTime));
});

test('api/records: the best time wins (shared with its author, personal kept); a tie keeps the older record', async () => {
  const { post, get } = setup();
  await post(ALICE, { times: [{ level: 'spiral', seconds: 83 }] });
  let state = await (await post(BRUNO, { times: [{ level: 'spiral', seconds: 80 }] })).json();
  assert.deepEqual(state.shared.times.spiral, { seconds: 80, name: 'Bruno' });
  assert.deepEqual(state.mine.times, { spiral: 80 });
  state = await (await get(ALICE)).json();
  assert.equal(state.mine.times.spiral, 83, 'Alice keeps her own time');
  assert.equal(state.shared.times.spiral.name, 'Bruno');
  state = await (await post(BRUNO, { times: [{ level: 'spiral', seconds: 80 }, { level: 'spiral', seconds: 95 }] })).json();
  assert.deepEqual(state.shared.times.spiral, { seconds: 80, name: 'Bruno' }, 'same or worse time: no change');
  state = await (await post(ALICE, { times: [{ level: 'spiral', seconds: 80 }] })).json();
  assert.deepEqual(state.shared.times.spiral, { seconds: 80, name: 'Bruno' }, 'a tie: the first author keeps the record');
  assert.equal(state.mine.times.spiral, 80);
  state = await (await post(ALICE, { times: [{ level: 'claw', seconds: 200 }] })).json();
  assert.deepEqual(state.shared.times, { claw: { seconds: 200, name: 'Alice' }, spiral: { seconds: 80, name: 'Bruno' } });
});

test('api/records: shared = the 10 best of all players, mine = the requester only; a resent id is stored once', async () => {
  const { post, get, rows } = setup();
  const alice = [9000, 500, 7000, 300, 11000, 100].map((s, i) => sc(i + 1, s));
  const bruno = [8000, 600, 10000, 200, 12000, 50].map((s, i) => sc(i + 1, s, { stage: 1, level: 2, day: '' }));
  await post(ALICE, { scores: alice });
  const mineB = await (await post(BRUNO, { scores: bruno })).json();
  const all = [...alice.map(s => s.score), ...bruno.map(s => s.score)].sort((a, b) => b - a);
  assert.deepEqual(mineB.shared.scores.map(s => s.score), all.slice(0, 10));
  assert.deepEqual(mineB.mine.scores.map(s => s.score), bruno.map(s => s.score).sort((a, b) => b - a));
  assert.ok(mineB.mine.scores.every(s => s.name === 'Bruno' && s.stage === 1 && s.level === 2 && s.day === ''));
  const mineA = await (await get(ALICE)).json();
  assert.ok(mineA.mine.scores.every(s => s.name === 'Alice'));
  assert.equal(mineA.mine.scores.length, 6);
  assert.deepEqual(mineA.shared.scores, mineB.shared.scores);
  await post(ALICE, { scores: [alice[0], alice[0]] });
  assert.equal(rows('scores').length, 12, 'resend ignored (UNIQUE (player, sid))');
  assert.equal(rows('scores').filter(r => r.sid === alice[0].id).length, 2, 'the same id from two players: two scores');
  await post(BRUNO, { scores: [{ ...bruno[0], score: 13000 }] });
  assert.equal(rows('scores').length, 12, 'a resent id keeps its first value');
  assert.ok(!rows('scores').some(r => r.score === 13000));
});

test('api/records: allowed address without a first name → « Joueur »; no address stored, identity = playerKey(email)', async () => {
  const { post, rows } = setup();
  const state = await (await post('Carole@Example.org', { scores: [sc(1, 400)], times: [{ level: 'claw', seconds: 61 }] })).json();
  assert.equal(state.shared.scores[0].name, 'Joueur');
  assert.deepEqual(state.shared.times.claw, { seconds: 61, name: 'Joueur' });
  await post(ALICE, { scores: [sc(2, 500)] });
  const dump = JSON.stringify([rows('scores'), rows('times')]);
  assert.doesNotMatch(dump, /@|example\.org/i, 'no address in the database');
  assert.deepEqual(rows('times').map(r => r.player), [playerKey('carole@example.org')]);
  assert.deepEqual(rows('scores').map(r => r.player).sort(), [playerKey(ALICE), playerKey('carole@example.org')].sort());
});

test('api/records POST refusals: Origin 403, content-type 415, size 413, shape / bounds 400 — nothing written', async () => {
  const { post, rows, scores, as } = setup();
  const ok = { scores: [sc(1, 10)] };
  const cases = [
    ['no Origin', () => post(ALICE, ok, { origin: null }), 403],
    ['foreign Origin', () => post(ALICE, ok, { origin: 'https://evil.example' }), 403],
    ['Origin with another port', () => post(ALICE, ok, { origin: `${HOST}:8443` }), 403],
    ['text/plain', () => post(ALICE, ok, { type: 'text/plain' }), 415],
    ['form', () => post(ALICE, ok, { type: 'application/x-www-form-urlencoded' }), 415],
    ['5 000 bytes', () => post(ALICE, { scores: [sc(1, 10)], pad: 'x'.repeat(5000) }), 413],
    ['no content-length', () => post(ALICE, ok, { length: null }), 413],
    ['content-length lies', () => post(ALICE, { scores: [sc(1, 10)], pad: 'x'.repeat(5000) }, { length: '100' }), 413],
    ['content-length not a number', () => post(ALICE, ok, { length: 'abc' }), 413],
    ['invalid JSON', () => post(ALICE, '{"scores": ['), 400],
    ['JSON array', () => post(ALICE, [sc(1, 10)]), 400],
    ['JSON null', () => post(ALICE, 'null'), 400],
    ['empty object', () => post(ALICE, {}), 400],
    ['empty lists', () => post(ALICE, { scores: [], times: [] }), 400],
    ['scores not a list', () => post(ALICE, { scores: sc(1, 10) }), 400],
    ['11 scores', () => post(ALICE, { scores: Array.from({ length: 11 }, (_, i) => sc(i + 1, 10)) }), 400],
    ['41 times', () => post(ALICE, { times: Array.from({ length: 41 }, () => ({ level: 'claw', seconds: 9 })) }), 400],
    ['score -1', () => post(ALICE, { scores: [sc(1, -1)] }), 400],
    ['score 100 000 000', () => post(ALICE, { scores: [sc(1, 100000000)] }), 400],
    ['score 1.5', () => post(ALICE, { scores: [sc(1, 1.5)] }), 400],
    ['score "12"', () => post(ALICE, { scores: [sc(1, '12')] }), 400],
    ['stage 100', () => post(ALICE, { scores: [sc(1, 10, { stage: 100 })] }), 400],
    ['level -1', () => post(ALICE, { scores: [sc(1, 10, { level: -1 })] }), 400],
    ['id xyz', () => post(ALICE, { scores: [sc(1, 10, { id: 'xyz' })] }), 400],
    ['id upper case', () => post(ALICE, { scores: [sc(1, 10, { id: '0123456789ABCDEF' })] }), 400],
    ['day 11/10/2026', () => post(ALICE, { scores: [sc(1, 10, { day: '11/10/2026' })] }), 400],
    ['day missing', () => post(ALICE, { scores: [{ id: '0000000000000001', score: 1, stage: 0, level: 0 }] }), 400],
    ['seconds 0', () => post(ALICE, { times: [{ level: 'spiral', seconds: 0 }] }), 400],
    ['seconds 3 601', () => post(ALICE, { times: [{ level: 'spiral', seconds: 3601 }] }), 400],
    ['seconds 8.5', () => post(ALICE, { times: [{ level: 'spiral', seconds: 8.5 }] }), 400],
    ['unknown level', () => post(ALICE, { times: [{ level: 'inconnu', seconds: 60 }] }), 400],
    ['level __proto__', () => post(ALICE, { times: [{ level: '__proto__', seconds: 60 }] }), 400],
    ['one bad item among good ones', () => post(ALICE, { scores: [sc(1, 10), sc(2, -5)], times: [{ level: 'spiral', seconds: 60 }] }), 400],
    ['POST on /api/records/', () => post(ALICE, ok, { path: '/api/records/' }), 405],
  ];
  for (const [what, send, status] of cases) {
    const text = await assertPlain(await send(), status, what);
    if (status === 403) assert.equal(text, 'Accès refusé.', what);
    if (status === 400) assert.equal(text, 'Requête invalide.', what);
  }
  assert.equal(rows('scores').length + rows('times').length, 0, 'nothing written');
  assert.ok(!scores.sql.includes(RECORDS_SQL.insertScore) && !scores.sql.includes(RECORDS_SQL.upsertTime), 'no write prepared');
  // The same request, well-formed, is accepted (the refusals above were about the request, not the player).
  assert.equal((await post(ALICE, ok)).status, 200);
  assert.equal((await as(ALICE, '/api/records', { method: 'POST', body: JSON.stringify(ok), headers: { origin: HOST, 'content-type': 'application/json; charset=utf-8', 'content-length': String(JSON.stringify(ok).length) } })).status, 200, 'charset parameter allowed');
});

test('api/records rate limit: 20 POST per identity in 60 s, the 21st → 429 retry-after 60; others unaffected; window slides', async () => {
  const { post, get, clock } = setup();
  for (let i = 1; i <= RECORDS_RATE.max; i++) assert.equal((await post(ALICE, { scores: [sc(i, i)] })).status, 200, `POST ${i}`);
  const limited = await post(ALICE, { scores: [sc(99, 99)] });
  await assertPlain(limited, 429, '21st POST');
  assert.equal(limited.headers.get('retry-after'), '60');
  assert.equal((await get(ALICE)).status, 200, 'reads are not limited');
  assert.equal((await post(BRUNO, { scores: [sc(1, 1)] })).status, 200, 'another identity');
  assert.equal((await post('Alice@Example.org ', { scores: [sc(98, 1)] })).status, 429, 'same identity whatever the case');
  clock.offset += 61000;
  assert.equal((await post(ALICE, { scores: [sc(99, 99)] })).status, 200, 'after the window');
});

test('api/records methods: PUT / DELETE / PATCH → 405 allow GET, HEAD, POST; POST elsewhere → 405 allow GET, HEAD', async () => {
  const { as, post, rows } = setup();
  for (const method of ['PUT', 'DELETE', 'PATCH', 'OPTIONS']) {
    const res = await as(ALICE, '/api/records', { method, headers: { origin: HOST } });
    await assertPlain(res, 405, method);
    assert.equal(res.headers.get('allow'), 'GET, HEAD, POST', method);
  }
  for (const p of ['/index.html', '/api/me', '/api/scores', '/']) {
    const res = await post(ALICE, { scores: [sc(1, 10)] }, { path: p });
    assert.equal(res.status, 405, p);
    assert.equal(res.headers.get('allow'), 'GET, HEAD', p);
  }
  assert.equal(rows('scores').length, 0);
});

test('api/records outages: no SCORES_DB binding or a failing D1 → 503 no-store retry-after 60, without detail', async () => {
  const unbound = setup({ env: { [D1_BINDING]: fakeAssets() } });
  for (const res of [await unbound.get(ALICE), await unbound.post(ALICE, { scores: [sc(1, 10)] })]) {
    await assertPlain(res, 503, 'unbound');
    assert.equal(res.headers.get('retry-after'), '60');
  }
  const down = setup();
  down.scores.fail = true;
  for (const res of [await down.get(ALICE), await down.post(ALICE, { scores: [sc(1, 10)] })]) {
    await assertPlain(res, 503, 'D1 failure');
    assert.equal(res.headers.get('retry-after'), '60');
  }
  down.scores.fail = false;
  assert.deepEqual(await (await down.get(ALICE)).json(), EMPTY, 'nothing half-written');
});

test('api/records SQL: every statement prepared on SCORES_DB is in RECORDS_SQL; none on ASSETS_DB', async () => {
  const { post, get, scores, assets } = setup();
  await get(ALICE);
  await post(ALICE, { scores: [sc(1, 10)], times: [{ level: 'claw', seconds: 30 }] });
  await post(BRUNO, { times: [{ level: 'claw', seconds: 20 }] });
  await get(BRUNO, { method: 'HEAD' });
  const allowed = new Set(Object.values(RECORDS_SQL));
  assert.ok(scores.sql.length >= 12);
  for (const sql of scores.sql) assert.ok(allowed.has(sql), sql);
  assert.deepEqual(assets.sql, [], 'the content database is never queried by /api/records');
});

test('worker source with records: Node-free ES module, one fetch (JWKS), no address, deterministic, levels inlined', async () => {
  const source = workerSource();
  assert.doesNotMatch(source, /^\s*import\s/m, 'no import');
  assert.doesNotMatch(source, /\bconsole\b|\bprocess\b|\bBuffer\b|\beval\b|\brequire\(/, 'never logs, Node-free');
  assert.equal(source.match(/(?<!async )\bfetch\(/g)?.length, 1, 'a single fetch call (the team certs)');
  assert.doesNotMatch(source, /@example\./, 'no address in the worker');
  assert.ok(source.includes(playerKey(ALICE)) && source.includes('"Bruno"'));
  assert.ok(source.includes('new Set(["claw","spiral"])'), 'levels inlined');
  assert.ok(source.includes("if (path === '/api/records') return recordsRoute(request, env, claims, method, url);"));
  assert.equal(workerSource(), source, 'same input → same source');
  assert.equal(workerSource({ levels: ['spiral', 'claw', 'claw'] }), source, 'order and duplicates of levels do not matter');
  const mod = await import(`data:text/javascript;base64,${Buffer.from(source).toString('base64')}`);
  assert.equal(typeof mod.default.fetch, 'function');
  assert.throws(() => workerSource({ levels: ['Spiral'] }), /niveau/);
  // Without levels every time is refused, scores are still accepted.
  const bare = setup({ source: generateWorker(MANIFEST, { access: ACCESS, players: PLAYERS }) });
  assert.equal((await bare.post(ALICE, { times: [{ level: 'spiral', seconds: 60 }] })).status, 400);
  assert.equal((await bare.post(ALICE, { scores: [sc(1, 10)] })).status, 200);
});
