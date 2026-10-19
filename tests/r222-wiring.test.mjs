// R2.0.22 — records partagés : contrat client ↔ worker et branchement (06.1-CONTEXT D-01, D-04, D-07, D-08, D-09).
// The pure client of src/records.ts (syncRecords / exchangeRecords) talks to the generated Pages worker
// (tools/d1worker.mjs + tools/recordsapi.mjs) running in node:vm over a real in-memory SQLite (fakeScoresD1): a fetch
// adapter plays the browser behind Access (relative URL resolved on the host, Origin, cf-access-jwt-assertion,
// content-length). Then source locks on src/main.ts check the wiring (non-blocking sync, review never writes, random
// ids without randomUUID, no innerHTML). Demo first names and example.org addresses only.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { SCORES_BINDING } from '../tools/recordsapi.mjs';
import { D1_BINDING, generateWorker } from '../tools/d1worker.mjs';
import { fakeScoresD1 } from './fake-scores-d1.mjs';

const R = () => import('../.compiled/records.js');
const P = () => import('../.compiled/progress.js');

// ------------------------------------------------------------ worker + Access simulation (as tests/r222-api)

const TEAM = 'equipe-test.cloudflareaccess.com';
const ISS = `https://${TEAM}`;
const CERTS = `${ISS}/cdn-cgi/access/certs`;
const AUD = 'c0ffee'.repeat(10) + 'c0de';
const HOST = 'https://zuma-x.pages.dev';
const subtle = globalThis.crypto.subtle;
const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const { privateKey, publicKey } = await subtle.generateKey(RSA, true, ['sign', 'verify']);
const { n, e } = await subtle.exportKey('jwk', publicKey);
const JWKS = { keys: [{ kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n, e }] };
const b64u = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const PLAYERS = { 'alice@example.org': 'Alice', 'bruno@example.org': 'Bruno' };
const ALICE = 'alice@example.org';
const BRUNO = 'bruno@example.org';
const MANIFEST = { '/index.html': { key: 'sha256:00', contentType: 'text/html; charset=utf-8', size: 0 } };

/** Access application token for `email`, valid one hour. */
async function jwt(email) {
  const t = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64u({ aud: [AUD], exp: t + 3600, iat: t - 5, nbf: t - 5, iss: ISS, type: 'app', sub: 'u', email });
  const sig = Buffer.from(await subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`))).toString('base64url');
  return `${head}.${body}.${sig}`;
}

/**
 * Generated worker (levels claw / spiral) in a vm context over fakeScoresD1; `browser(email)` is the fetch a page of
 * that player would use (RecordsIo). `log` lists every request seen by the worker; `offline` makes the adapter reject.
 */
function server() {
  const source = generateWorker(MANIFEST, { build: '2.0.22+T', access: { team: TEAM, aud: AUD }, players: PLAYERS, levels: ['claw', 'spiral'] });
  const jwksFetch = async url => {
    assert.equal(String(url), CERTS);
    return new Response(JSON.stringify(JWKS), { headers: { 'content-type': 'application/json' } });
  };
  const context = vm.createContext({ Response, Headers, URL, atob, crypto: globalThis.crypto, fetch: jwksFetch, TextEncoder, TextDecoder });
  vm.runInContext(source.replace(/^export default /m, 'globalThis.worker = '), context, { filename: '_worker.js' });
  const scores = fakeScoresD1();
  const env = { [D1_BINDING]: { prepare: () => { throw new Error('content database touched'); } }, [SCORES_BINDING]: scores.binding };
  const log = [];
  const net = { offline: false };
  const browser = email => ({
    timeoutMs: 2000,
    async fetch(url, init) {
      if (net.offline) throw new TypeError('Failed to fetch');
      assert.equal(url, 'api/records', 'relative same-origin URL');
      assert.equal(init.credentials, 'same-origin');
      const headers = { ...init.headers, 'cf-access-jwt-assertion': await jwt(email) };
      if (init.method === 'POST') {
        headers.origin = HOST;
        headers['content-length'] = String(Buffer.byteLength(init.body));
      }
      log.push({ email, method: init.method, body: init.body ? JSON.parse(init.body) : null });
      const req = new Request(new URL(url, HOST + '/').href, { method: init.method, headers, body: init.body, signal: init.signal });
      return context.worker.fetch(req, env, {});
    },
  });
  const rows = table => scores.db.prepare(`SELECT * FROM ${table}`).all().map(r => ({ ...r }));
  return { browser, log, net, rows };
}

/** A device: storage (string values, like localStorage) + the access of main.ts over zuma.records.v1. */
async function device() {
  const { RECORDS_KEY, parseRecordsStore } = await R();
  const storage = new Map();
  let store = parseRecordsStore(storage.get(RECORDS_KEY) ?? null);
  const access = {
    get: () => store,
    set: s => { store = s; storage.set(RECORDS_KEY, JSON.stringify(s)); },
  };
  let next = 0;
  const makeId = () => (++next).toString(16).padStart(16, '0');
  const reload = () => parseRecordsStore(storage.get(RECORDS_KEY) ?? null);
  return { storage, access, makeId, reload };
}

const noMigration = () => ({ scores: [], times: {} });

// ------------------------------------------------------------ bout en bout

test('bout en bout (end-to-end): the queue of Alice (one score, one time) is sent, the server stamps « Alice », the queue empties', async () => {
  const { queueScore, queueTime } = await R();
  const { browser, log } = server();
  const d = await device();
  d.access.set({ ...queueTime(queueScore(d.access.get(), { score: 12000, stage: 0, level: 3, day: '2026-10-11' }, d.makeId()), 'spiral', 95), migrated: true });
  const { syncRecords } = await R();
  assert.equal(await syncRecords(d.access, browser(ALICE), noMigration, d.makeId), true);
  const store = d.reload();
  assert.deepEqual(store.pending, { scores: [], times: {} }, 'queue emptied and persisted');
  assert.equal(store.cache.shared.scores[0].name, 'Alice');
  assert.equal(store.cache.shared.scores[0].score, 12000);
  assert.equal(store.cache.mine.times.spiral, 95);
  assert.deepEqual(store.cache.shared.times.spiral, { seconds: 95, name: 'Alice' });
  assert.equal(log.length, 1);
  assert.equal(log[0].method, 'POST');
  assert.doesNotMatch(JSON.stringify(log[0].body), /Alice|name/i, 'D-04: the client never sends a name');
});

test('D-08: first successful exchange imports the local scores named like the player (no demos, not Bruno) and the best times, once', async () => {
  const { syncRecords, migrationItems } = await R();
  const { defaultScores } = await P();
  const { browser, log, rows } = server();
  const d = await device();
  const local = [
    { name: 'Alice', score: 250000, stage: 2, level: 4, date: '2026-10-10' },
    ...defaultScores(),
    { name: 'Bruno', score: 9000, stage: 0, level: 1, date: '2026-10-09' },
  ];
  const migrate = () => migrationItems(local, { spiral: 83 }, 'Alice');
  assert.equal(await syncRecords(d.access, browser(ALICE), migrate, d.makeId), true);
  const scores = rows('scores');
  assert.deepEqual(scores.map(r => [r.name, r.score]), [['Alice', 250000]], 'only the entry named Alice, no demo, not Bruno');
  assert.deepEqual(rows('times').map(r => [r.name, r.level, r.seconds]), [['Alice', 'spiral', 83]]);
  const store = d.reload();
  assert.equal(store.migrated, true);
  assert.deepEqual(store.pending, { scores: [], times: {} });
  assert.deepEqual(log.map(r => r.method), ['GET', 'POST'], 'GET (nothing pending) then the import');
  const before = log.length;
  assert.equal(await syncRecords(d.access, browser(ALICE), migrate, d.makeId), true);
  assert.deepEqual(log.slice(before).map(r => r.method), ['GET'], 'second call: nothing more is sent');
  assert.equal(rows('scores').length, 1);
});

// R2.0.28: records personnels (demande utilisateur) — the « deux joueurs » test (Alice's STATS showing Bruno's time
// with his name, shared table and rank) is replaced by the personal end-to-end test of r228-personal-records.

test('hors ligne (offline) then back: the queue stays persisted while fetch rejects, then leaves', async () => {
  const { syncRecords, queueScore, queueTime } = await R();
  const { browser, net, rows } = server();
  const d = await device();
  net.offline = true;
  d.access.set({ ...queueTime(queueScore(d.access.get(), { score: 4200, stage: 1, level: 2, day: '2026-10-11' }, d.makeId()), 'claw', 140), migrated: true });
  assert.equal(await syncRecords(d.access, browser(ALICE), noMigration, d.makeId), false, 'silent failure');
  let store = d.reload();
  assert.equal(store.pending.scores.length, 1, 'score kept in zuma.records.v1');
  assert.deepEqual(store.pending.times, { claw: 140 });
  assert.equal(store.cache, null);
  assert.equal(rows('scores').length, 0);
  net.offline = false;
  assert.equal(await syncRecords(d.access, browser(ALICE), noMigration, d.makeId), true);
  store = d.reload();
  assert.deepEqual(store.pending, { scores: [], times: {} });
  assert.equal(store.cache.mine.scores[0].score, 4200);
  assert.deepEqual(store.cache.shared.times.claw, { seconds: 140, name: 'Alice' });
  // The last server copy is what the offline display uses.
  net.offline = true;
  assert.equal(await syncRecords(d.access, browser(ALICE), noMigration, d.makeId), false);
  assert.equal(d.reload().cache.mine.scores[0].score, 4200, 'copy kept while offline');
});

// ------------------------------------------------------------ verrous de source du branchement (src/main.ts)

const MAIN = fs.readFileSync(new URL('../src/main.ts', import.meta.url), 'utf8');

test('main.ts wiring: records functions, online listener, random ids', () => {
  // R2.0.28: records personnels (demande utilisateur) — levelRecord(, the plaque hit tests, recordLabel( and
  // RECORD_SCOPE_LABEL[ are gone (r228 locks their absence and personalTime().
  for (const needle of [
    'recordsEnabled(', 'syncRecords(', "addEventListener('online'", 'queueScore(', 'queueTime(', 'scoresView(',
    'getRandomValues', 'rankOf(', 'migrationItems(',
    "case 'record-score'",
  ]) {
    assert.ok(MAIN.includes(needle), `main.ts contains ${needle}`);
  }
  assert.ok(!MAIN.includes('randomUUID'), 'no randomUUID (missing outside secure contexts)');
});

test('main.ts wiring: level times are queued only outside review sessions', () => {
  const at = [...MAIN.matchAll(/queueTime\(/g)].map(m => m.index);
  assert.ok(at.length > 0);
  for (const i of at) {
    const guard = MAIN.lastIndexOf('if (', i);
    assert.ok(guard >= 0 && i - guard < 300, 'queueTime is inside a nearby if');
    assert.match(MAIN.slice(guard, i), /!this\.app\.review/, 'the guarding condition excludes review');
  }
});

test('main.ts wiring: the records synchronisation is never awaited (D-07), no innerHTML', () => {
  assert.doesNotMatch(MAIN, /await\s+(this\.)?syncRecords/);
  assert.doesNotMatch(MAIN, /await\s+this\.syncRecordsNow/);
  const start = MAIN.slice(MAIN.indexOf('async start(): Promise<void> {'), MAIN.indexOf('\n  }\n', MAIN.indexOf('async start(): Promise<void> {')));
  assert.match(start, /syncRecordsNow\(\)/, 'a synchronisation starts after the boot');
  assert.doesNotMatch(start, /await[^;\n]*records/i, 'start() never waits on the records');
  assert.ok(!MAIN.includes('innerHTML'), 'no innerHTML in main.ts');
});

// ------------------------------------------------------------ standalone bundle: module text inserted verbatim

test('standalone build: the bundle, the styles and the assets are inserted by replacer functions (no $-pattern expansion)', () => {
  // R2.0.22 (06.1-05): records.js contains `'^[a-z0-9-]{1,40}$'`; inserted as a replacement STRING, `$'` expanded to the
  // rest of index.html and the single file became a SyntaxError. A replacer function inserts the text as is.
  const records = fs.readFileSync(new URL('../.compiled/records.js', import.meta.url), 'utf8');
  assert.ok(records.includes("$'"), 'the hazard is real: records.js holds a « $\' » sequence');
  assert.notEqual('<s>'.replace('<s>', records), records, 'a replacement string corrupts it');
  assert.equal('<s>'.replace('<s>', () => records), records, 'a replacer function keeps it');
  const build = fs.readFileSync(new URL('../tools/build.mjs', import.meta.url), 'utf8');
  const block = build.slice(build.indexOf('if (standalone) {'), build.indexOf("fs.mkdirSync(path.join(root, 'standalone')"));
  assert.ok(block.length > 0, 'standalone block found');
  for (const needle of ['${js}', '${css}', 'JSON.stringify(inline)']) {
    const at = block.indexOf(needle);
    assert.ok(at > 0, needle);
    const call = block.slice(block.lastIndexOf('.replace(', at), at);
    assert.match(call, /,\s*\(\)\s*=>\s*`/, `${needle} goes through a replacer function`);
  }
});
