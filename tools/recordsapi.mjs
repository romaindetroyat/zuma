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
 * Source fragment inlined by generateWorker: the records constants (top-level names prefixed `records` / `RECORDS_`
 * so they never clash with the worker's). Deterministic: same levels → same text. Throws (French) on an invalid
 * level id.
 */
export function recordsWorkerSource({ levels = [] } = {}) {
  const list = checkedLevels(levels);
  return `// Shared records (phase 6.1, tools/recordsapi.mjs): database bound as ${SCORES_BINDING}.
const RECORDS_SQL = ${literal(RECORDS_SQL)};
const RECORDS_LIMITS = ${literal(RECORDS_LIMITS)};
const RECORDS_RATE = ${literal(RECORDS_RATE)};
const RECORDS_LEVELS = new Set(${literal(list)});
`;
}
