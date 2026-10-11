/**
 * Shared records of the hosted version (phase 6.1, plan 06.1-02): constants, schema, closed SQL list and the source
 * fragment that tools/d1worker.mjs inlines in the generated Pages worker for `GET` / `POST /api/records`.
 *
 * - D-05: the records live in their own D1 database `zuma-scores`, bound as `SCORES_DB`; `zuma-assets` / `ASSETS_DB`
 *   stay reserved for the game files. tools/deploy.mjs (plan 06.1-03) creates the database and applies SCORES_SCHEMA.
 * - D-04: the first name is set by the server from the e-mail of the validated Access JWT (the worker's private
 *   `players` table), never taken from the client; an allowed address without a first name becomes « Joueur ». No
 *   address is ever stored: the identity column is the SHA-256 (hex) of the lower-cased, trimmed e-mail (playerKey).
 * - D-06: `GET /api/records` → `{ shared: { scores, times }, mine: { scores, times } }` `no-store`; `POST` (JSON,
 *   same origin, bounded body) is the worker's only write and answers the new state.
 * - D-10: guests are trusted — bounds and a per-identity rate limit only, no anti-cheat.
 *
 * No dependency, no I/O: pure constants and string generation, shared by the deploy tool and the tests.
 */

/** Name of the D1 binding of the records database (never `ASSETS`, the reserved Pages binding). */
export const SCORES_BINDING = 'SCORES_DB';
/** Name of the D1 database holding the shared records (distinct from `zuma-assets`). */
export const SCORES_DATABASE_NAME = 'zuma-scores';
/** Tables of the records database. */
export const SCORES_TABLES = Object.freeze(['scores', 'times']);

/** Schema of the records database: idempotent statements, applied by tools/deploy.mjs (never DELETE / DROP / ALTER). */
export const SCORES_SCHEMA = Object.freeze([
  'CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY, player TEXT NOT NULL, sid TEXT NOT NULL, name TEXT NOT NULL, score INTEGER NOT NULL, stage INTEGER NOT NULL, level INTEGER NOT NULL, day TEXT NOT NULL, at INTEGER NOT NULL, UNIQUE (player, sid))',
  'CREATE TABLE IF NOT EXISTS times (player TEXT NOT NULL, level TEXT NOT NULL, name TEXT NOT NULL, seconds INTEGER NOT NULL, at INTEGER NOT NULL, PRIMARY KEY (player, level))',
]);

/**
 * The closed list of statements the worker may prepare on SCORES_DB (bound parameters only). A score is inserted
 * once per (player, sid) — a resend is ignored; a time only replaces the player's own when strictly shorter.
 */
export const RECORDS_SQL = Object.freeze({
  insertScore: 'INSERT OR IGNORE INTO scores (player, sid, name, score, stage, level, day, at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  upsertTime: 'INSERT INTO times (player, level, name, seconds, at) VALUES (?, ?, ?, ?, ?) ON CONFLICT (player, level) DO UPDATE SET seconds = excluded.seconds, name = excluded.name, at = excluded.at WHERE excluded.seconds < times.seconds',
  sharedScores: 'SELECT name, score, stage, level, day FROM scores ORDER BY score DESC, at ASC, id ASC LIMIT 10',
  mineScores: 'SELECT name, score, stage, level, day FROM scores WHERE player = ? ORDER BY score DESC, at ASC, id ASC LIMIT 10',
  allTimes: 'SELECT level, name, seconds FROM times ORDER BY level, seconds, at',
  mineTimes: 'SELECT level, seconds FROM times WHERE player = ?',
});

/**
 * D-10 bounds checked by the worker; equal to RECORD_BOUNDS of src/records.ts (locked by tests/r222-api). Regular
 * expressions are kept as source strings so both sides compare them as data.
 */
export const RECORDS_LIMITS = Object.freeze({
  scoreMax: 99999999, stageMax: 99, levelMax: 99, secondsMin: 1, secondsMax: 3600,
  levelId: '^[a-z0-9-]{1,40}$', sid: '^[0-9a-f]{16}$', day: '^(\\d{4}-\\d{2}-\\d{2})?$',
  scoresPerPost: 10, timesPerPost: 40, listMax: 10, nameMax: 20, bodyMax: 4096,
});

/** Write rate limit, per worker isolate: at most `max` POST per identity in a sliding `windowMs`, `identities` tracked. */
export const RECORDS_RATE = Object.freeze({ windowMs: 60000, max: 20, identities: 512 });

const LEVEL_ID = new RegExp(RECORDS_LIMITS.levelId);

/** Level id as stored by the client (`bestTimeKey` without its `zuma.best.` prefix). */
const normaliseLevel = id => String(id).toLowerCase().replace(/[^a-z0-9-]/g, '-');

/**
 * Level ids of a pack.json object: the keys of `pack.graphics` normalised like bestTimeKey, sorted, unique. An id
 * outside RECORDS_LIMITS.levelId (empty or longer than 40 characters) is left out: such a level keeps local times only.
 */
export function recordLevelIds(pack) {
  const graphics = pack && typeof pack === 'object' ? pack.graphics : null;
  if (!graphics || typeof graphics !== 'object') return [];
  const ids = new Set(Object.keys(graphics).map(normaliseLevel).filter(id => LEVEL_ID.test(id)));
  return [...ids].sort();
}

/** Checked, sorted, unique level list for the worker; throws (French) on a malformed id. */
function checkedLevels(levels) {
  if (!Array.isArray(levels)) throw new Error('records : liste des niveaux attendue ; worker non généré.');
  for (const id of levels) {
    if (typeof id !== 'string' || !LEVEL_ID.test(id)) throw new Error('records : identifiant de niveau invalide (a-z, 0-9, trait d’union, 40 caractères au plus) ; worker non généré.');
  }
  return [...new Set(levels)].sort();
}

/** JSON as a JS literal (U+2028 / U+2029 escaped for older parsers). */
const literal = value => JSON.stringify(value).replace(/[\u2028\u2029]/g, c => `\\u${c.charCodeAt(0).toString(16)}`);

/**
 * Source fragment inlined by generateWorker (top-level names prefixed `records` / `RECORDS_` so they never clash with
 * the worker's): the records constants, the per-isolate rate table, body validation, state reading and
 * `async function recordsRoute(request, env, claims, method, url)`, which answers every request on `/api/records`
 * once the Access JWT is validated. It relies on the worker's `denied()` and `playerHash(claims)` (SHA-256 hex of the
 * lower-cased e-mail claim, null without one) and on its `PLAYERS` map. Deterministic: same levels → same text.
 * Throws (French) on an invalid level id.
 *
 * Statuses (all `no-store`, `nosniff`, without detail): token without `email` → 403; GET / HEAD → 200 state; POST:
 * `Origin` absent or not the request origin → 403, content-type not JSON → 415, `content-length` absent or above
 * bodyMax (or a longer body) → 413, invalid JSON or any out-of-bounds item → 400 (nothing written), no SCORES_DB or a
 * D1 failure → 503 `retry-after: 60`, rate exceeded → 429 `retry-after: 60`; other methods → 405 `allow: GET, HEAD,
 * POST`. Only requests that would write count against the rate (refused ones never reach the database).
 */
export function recordsWorkerSource({ levels = [] } = {}) {
  const list = checkedLevels(levels);
  return `// Shared records (phase 6.1, tools/recordsapi.mjs): GET / POST /api/records on the D1 database bound as ${SCORES_BINDING}.
// The first name comes from PLAYERS (the token's e-mail hash), never from the body; no address is stored.
const RECORDS_SQL = ${literal(RECORDS_SQL)};
const RECORDS_LIMITS = ${literal(RECORDS_LIMITS)};
const RECORDS_RATE = ${literal(RECORDS_RATE)};
const RECORDS_LEVELS = new Set(${literal(list)});
const RECORDS_SID = new RegExp(RECORDS_LIMITS.sid);
const RECORDS_DAY = new RegExp(RECORDS_LIMITS.day);
const RECORDS_DEFAULT_NAME = 'Joueur';
const recordsHits = new Map(); // identity hash → timestamps of its recent writes (this isolate only)

function recordsText(status, text, extra) {
  const headers = { 'content-type': 'text/plain; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  return new Response(text, { status, headers: Object.assign(headers, extra || {}) });
}

function recordsUnavailable() {
  return recordsText(503, 'Records indisponibles, réessayez dans une minute.', { 'retry-after': '60' });
}

function recordsInvalid() {
  return recordsText(400, 'Requête invalide.');
}

/** True when \`identity\` may write now (and counts this write); sliding window, bounded table. */
function recordsAllow(identity) {
  const now = Date.now();
  const recent = (recordsHits.get(identity) || []).filter(t => now - t < RECORDS_RATE.windowMs);
  recordsHits.delete(identity);
  if (recent.length >= RECORDS_RATE.max) {
    recordsHits.set(identity, recent);
    return false;
  }
  recent.push(now);
  recordsHits.set(identity, recent);
  while (recordsHits.size > RECORDS_RATE.identities) recordsHits.delete(recordsHits.keys().next().value);
  return true;
}

const recordsInt = (v, min, max) => typeof v === 'number' && Number.isInteger(v) && v >= min && v <= max;
const recordsObject = v => v !== null && typeof v === 'object' && !Array.isArray(v);

/** Checked items of a POST body ({ scores, times }), or null when anything is malformed or out of bounds. */
function recordsItems(body) {
  if (!recordsObject(body)) return null;
  const scores = body.scores === undefined ? [] : body.scores;
  const times = body.times === undefined ? [] : body.times;
  if (!Array.isArray(scores) || !Array.isArray(times)) return null;
  if (scores.length + times.length === 0) return null;
  if (scores.length > RECORDS_LIMITS.scoresPerPost || times.length > RECORDS_LIMITS.timesPerPost) return null;
  const outScores = [];
  for (const s of scores) {
    if (!recordsObject(s)) return null;
    if (typeof s.id !== 'string' || !RECORDS_SID.test(s.id)) return null;
    if (!recordsInt(s.score, 0, RECORDS_LIMITS.scoreMax)) return null;
    if (!recordsInt(s.stage, 0, RECORDS_LIMITS.stageMax) || !recordsInt(s.level, 0, RECORDS_LIMITS.levelMax)) return null;
    if (typeof s.day !== 'string' || !RECORDS_DAY.test(s.day)) return null;
    outScores.push({ id: s.id, score: s.score, stage: s.stage, level: s.level, day: s.day });
  }
  const outTimes = [];
  for (const t of times) {
    if (!recordsObject(t)) return null;
    if (typeof t.level !== 'string' || !RECORDS_LEVELS.has(t.level)) return null;
    if (!recordsInt(t.seconds, RECORDS_LIMITS.secondsMin, RECORDS_LIMITS.secondsMax)) return null;
    outTimes.push({ level: t.level, seconds: t.seconds });
  }
  return { scores: outScores, times: outTimes };
}

/** Body text read up to bodyMax bytes: null when longer, undefined when not UTF-8. */
async function recordsBody(request) {
  if (!request.body) return '';
  const reader = request.body.getReader();
  const parts = [];
  let size = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > RECORDS_LIMITS.bodyMax) {
      try {
        await reader.cancel();
      } catch {
        // the rest of the body is dropped anyway
      }
      return null;
    }
    parts.push(value);
  }
  const bytes = new Uint8Array(size);
  let at = 0;
  for (const p of parts) {
    bytes.set(p, at);
    at += p.byteLength;
  }
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return undefined;
  }
}

const recordsScore = r => ({ name: String(r.name), score: Number(r.score), stage: Number(r.stage), level: Number(r.level), day: String(r.day) });

/** { shared: { scores, times }, mine: { scores, times } } for \`player\`; the shared time of a level = its first row. */
async function recordsState(db, player) {
  const [shared, mine, all, own] = await Promise.all([
    db.prepare(RECORDS_SQL.sharedScores).all(),
    db.prepare(RECORDS_SQL.mineScores).bind(player).all(),
    db.prepare(RECORDS_SQL.allTimes).all(),
    db.prepare(RECORDS_SQL.mineTimes).bind(player).all(),
  ]);
  const sharedTimes = Object.create(null);
  for (const r of all.results || []) {
    const level = String(r.level);
    if (!(level in sharedTimes)) sharedTimes[level] = { seconds: Number(r.seconds), name: String(r.name) };
  }
  const mineTimes = Object.create(null);
  for (const r of own.results || []) mineTimes[String(r.level)] = Number(r.seconds);
  return {
    shared: { scores: (shared.results || []).map(recordsScore), times: sharedTimes },
    mine: { scores: (mine.results || []).map(recordsScore), times: mineTimes },
  };
}

function recordsJson(state, method) {
  const headers = { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' };
  return new Response(method === 'HEAD' ? null : JSON.stringify(state), { status: 200, headers });
}

/** /api/records once the Access JWT is valid: GET / HEAD read the state, POST records scores and times. */
async function recordsRoute(request, env, claims, method, url) {
  const player = claims ? await playerHash(claims) : null;
  if (!player) return denied();
  const db = env && env.${SCORES_BINDING};
  if (method === 'GET' || method === 'HEAD') {
    if (!db) return recordsUnavailable();
    try {
      return recordsJson(await recordsState(db, player), method);
    } catch {
      return recordsUnavailable();
    }
  }
  if (method !== 'POST') return recordsText(405, 'Méthode non autorisée.', { allow: 'GET, HEAD, POST' });
  if (request.headers.get('origin') !== url.origin) return denied();
  const type = (request.headers.get('content-type') || '').split(';')[0].trim().toLowerCase();
  if (type !== 'application/json') return recordsText(415, 'Type de contenu non pris en charge.');
  const length = request.headers.get('content-length');
  if (length === null || !/^[0-9]{1,9}$/.test(length) || Number(length) > RECORDS_LIMITS.bodyMax) return recordsText(413, 'Requête trop volumineuse.');
  const text = await recordsBody(request);
  if (text === null) return recordsText(413, 'Requête trop volumineuse.');
  if (text === undefined) return recordsInvalid();
  let body;
  try {
    body = JSON.parse(text);
  } catch {
    return recordsInvalid();
  }
  const items = recordsItems(body);
  if (!items) return recordsInvalid();
  if (!db) return recordsUnavailable();
  if (!recordsAllow(player)) return recordsText(429, 'Trop de requêtes, réessayez dans une minute.', { 'retry-after': '60' });
  const name = PLAYERS.get(player) || RECORDS_DEFAULT_NAME;
  const at = Date.now();
  try {
    const writes = [];
    for (const s of items.scores) writes.push(db.prepare(RECORDS_SQL.insertScore).bind(player, s.id, name, s.score, s.stage, s.level, s.day, at));
    for (const t of items.times) writes.push(db.prepare(RECORDS_SQL.upsertTime).bind(player, t.level, name, t.seconds, at));
    await db.batch(writes);
    return recordsJson(await recordsState(db, player), method);
  } catch {
    return recordsUnavailable();
  }
}
`;
}
