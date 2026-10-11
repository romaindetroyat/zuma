/**
 * D1 file store + Pages project binding + worker deployment (R2.0.20, plan 05-17, option B, D-42). Everything goes
 * through the account API token (no Pages upload JWT): `api(method, path, { body, form })` is injected by
 * tools/deploy.mjs (tests and --dry-run inject a simulated one). No dependency, no network of its own.
 *
 * D1 REST limits honoured (cloudflare-docs, d1/platform/limits + workers d1-pricing, 2026-10-11): ≤ 100 000 bytes per
 * statement (each statement of a batch), ≤ 100 bound parameters, ≤ 2 MB per row, ≤ 30 s per API call; free plan:
 * 100 000 rows written per day, an index adding one written row (our composite primary key → 2 rows per chunk).
 * Statements: one `INSERT OR IGNORE` per 60 000-character chunk (3 string parameters), batches < 900 KB of JSON.
 *
 * Two databases (R2.0.22, plan 06.1-03, D-05): `zuma-assets` (ASSETS_DB, the game files written here) and
 * `zuma-scores` (SCORES_DB, the shared records written only by the worker). The deployment only creates the records
 * database and applies its idempotent schema (`CREATE TABLE IF NOT EXISTS scores / times`): it never writes a row
 * there. One PATCH binds both databases on production and preview.
 */
import crypto from 'node:crypto';
import fs from 'node:fs';
import { chunks, CHUNK_CHARS, D1_BINDING } from './d1worker.mjs';
import { pollDeployment } from './pagesupload.mjs';
import { SCORES_BINDING, SCORES_TABLES } from './recordsapi.mjs';

export const DATABASE_NAME = 'zuma-assets';
/** Refusal threshold on the estimated rows written by one run (half of the free 100 000 per day). */
export const ROW_BUDGET = 50000;
/** Rows written per inserted chunk: the table row and its primary-key index entry. */
export const ROWS_PER_CHUNK = 2;
/** Cap on the JSON body of one query request (900 000 bytes, below 900 KB in either unit). */
export const MAX_BODY_BYTES = 900000;
/** Fixed compatibility date of the Pages worker (production and preview). */
export const COMPATIBILITY_DATE = '2025-09-01';
export const SCHEMA = 'CREATE TABLE IF NOT EXISTS blobs (key TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (key, part))';
export const INSERT = 'INSERT OR IGNORE INTO blobs (key, part, data) VALUES (?, ?, ?)';
const TABLE_SQL = "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'blobs'";
const STATE_SQL = 'SELECT key, COUNT(*) AS parts, SUM(LENGTH(data)) AS chars FROM blobs GROUP BY key';
/** The only read of the records database by the deployment: which of its tables exist. */
export const SCORES_TABLES_SQL = "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('scores', 'times')";
const ATTEMPTS = 4;

/** Path of the query endpoint of database `uuid`. */
export const queryPath = (A, uuid) => `${A}/d1/database/${uuid}/query`;

/** Rows of the first statement of a query response. */
const firstResults = res => (Array.isArray(res) ? res[0]?.results : res?.results) ?? [];

/** The database named exactly `name`, or null (GET only). */
export async function findDatabase(api, A, name) {
  const list = await api('GET', `${A}/d1/database?name=${encodeURIComponent(name)}&per_page=100`);
  const found = (list ?? []).filter(d => d.name === name);
  if (found.length > 1) throw new Error(`plusieurs bases D1 « ${name} ».`);
  return found[0] ? { uuid: found[0].uuid, name: found[0].name } : null;
}

/** { table, present: Map key → { parts, chars } } — SELECT statements only. */
export async function readBlobs(api, A, uuid) {
  const tables = firstResults(await api('POST', queryPath(A, uuid), { body: { sql: TABLE_SQL } }));
  if (tables.length === 0) return { table: false, present: new Map() };
  const rows = firstResults(await api('POST', queryPath(A, uuid), { body: { sql: STATE_SQL } }));
  return { table: true, present: new Map(rows.map(r => [r.key, { parts: Number(r.parts), chars: Number(r.chars) }])) };
}

/** Set of the records tables present in database `uuid` (one SELECT on sqlite_master, nothing else). */
export async function readScoresTables(api, A, uuid) {
  const rows = firstResults(await api('POST', queryPath(A, uuid), { body: { sql: SCORES_TABLES_SQL } }));
  return new Set(rows.map(r => r.name).filter(n => SCORES_TABLES.includes(n)));
}

/** Expected rows of a file of `size` bytes: { parts, chars } of its base64. */
export function expected(size) {
  const chars = 4 * Math.ceil(size / 3);
  return { parts: Math.max(1, Math.ceil(chars / CHUNK_CHARS)), chars };
}

/** `worker:<16 hex>` — the sha256 of the worker source, recorded in the deployment's commit message. */
export function workerMarker(source) {
  return `worker:${crypto.createHash('sha256').update(source).digest('hex').slice(0, 16)}`;
}

/** Binding body of PATCH /pages/projects/:p: ASSETS_DB and SCORES_DB on production and preview, fixed date. */
export function bindingBody(assetsUuid, scoresUuid) {
  const env = () => ({ d1_databases: { [D1_BINDING]: { id: assetsUuid }, [SCORES_BINDING]: { id: scoresUuid } }, compatibility_date: COMPATIBILITY_DATE });
  return { deployment_configs: { production: env(), preview: env() } };
}

/** True when both environments bind `binding` to `uuid` with the fixed compatibility date. */
export function boundTo(project, binding, uuid) {
  const cfg = project?.deployment_configs;
  if (!cfg || !uuid) return false;
  return ['production', 'preview'].every(e => cfg[e]?.d1_databases?.[binding]?.id === uuid && cfg[e]?.compatibility_date === COMPATIBILITY_DATE);
}

/** True when both environments bind ASSETS_DB to `assetsUuid` and SCORES_DB to `scoresUuid` with the fixed date. */
export function bindingOk(project, assetsUuid, scoresUuid) {
  return boundTo(project, D1_BINDING, assetsUuid) && boundTo(project, SCORES_BINDING, scoresUuid);
}

/** The production deployment of `project` (canonical, else latest when it is production), or null. */
export function productionDeployment(project) {
  if (project?.canonical_deployment) return project.canonical_deployment;
  const latest = project?.latest_deployment;
  return latest && (latest.environment ?? 'production') === 'production' ? latest : null;
}

/** True when the production deployment already runs the worker `marker` and its deploy stage succeeded. */
export function deployedOk(project, marker) {
  const dep = productionDeployment(project);
  const message = dep?.deployment_trigger?.metadata?.commit_message ?? '';
  const stage = dep?.latest_stage ?? {};
  return message.split(/\s+/).includes(marker) && stage.name === 'deploy' && stage.status === 'success';
}

/**
 * Pure D1 plan: { createDatabase, createTable, missing (one file per absent or incomplete key), chunks, rows,
 * createScoresDatabase, createScoresTables, bind, deploy }. `blobs` = readBlobs() (null when the database does not
 * exist yet); `scores` = { database, tables } of the records database (readScoresTables; database null when absent);
 * `marker` = workerMarker(source). `rows` counts the chunks only: the records schema writes no row.
 */
export function planD1({ files, database, blobs, project, marker, scores = null }) {
  const present = blobs?.present ?? new Map();
  const seen = new Set();
  const missing = [];
  for (const f of files) {
    if (seen.has(f.key)) continue;
    seen.add(f.key);
    const want = expected(f.size);
    const have = present.get(f.key);
    if (!have || have.parts !== want.parts || have.chars !== want.chars) missing.push(f);
  }
  const count = missing.reduce((n, f) => n + expected(f.size).parts, 0);
  const scoresDb = scores?.database ?? null;
  const tables = scores?.tables ?? new Set();
  const bind = !database || !scoresDb || !bindingOk(project, database.uuid, scoresDb.uuid);
  return {
    createDatabase: !database,
    createTable: !blobs?.table,
    missing,
    chunks: count,
    rows: ROWS_PER_CHUNK * count,
    createScoresDatabase: !scoresDb,
    createScoresTables: !scoresDb || !SCORES_TABLES.every(t => tables.has(t)),
    bind,
    deploy: bind || !deployedOk(project, marker),
  };
}

/** Statements grouped so each `{ batch }` body stays under MAX_BODY_BYTES; order kept, each statement once. */
export function insertBatches(statements, maxBytes = MAX_BODY_BYTES) {
  const out = [];
  let current = [];
  let size = Buffer.byteLength('{"batch":[]}');
  for (const st of statements) {
    const n = Buffer.byteLength(JSON.stringify(st)) + 1;
    if (current.length > 0 && size + n >= maxBytes) {
      out.push(current);
      current = [];
      size = Buffer.byteLength('{"batch":[]}');
    }
    current.push(st);
    size += n;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Throws unless every statement of the response succeeded. */
function checkResults(res, count) {
  const list = Array.isArray(res) ? res : [res];
  if (list.length !== count || list.some(r => !r || r.success === false)) throw new Error(`D1 : réponse incomplète (${list.length} résultat(s) pour ${count} instruction(s)).`);
}

/**
 * Inserts the chunks of `plan.missing` (INSERT OR IGNORE, bound string parameters). Refuses before any call when
 * `plan.rows` exceeds ROW_BUDGET. Sends `{ batch }` requests under 900 KB; a 400 on the very first request switches
 * to one `{ sql, params }` request per statement; 429 / 5xx / network errors are retried (4 attempts); 401 / 403 and
 * any other error stop the run (error keeps its `status`). Returns { files, statements, requests }.
 */
export async function uploadBlobs(api, { A, uuid, plan, log = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (plan.rows > ROW_BUDGET) {
    throw new Error(`D1 : ${plan.rows} lignes écrites estimées, au-delà du budget de ${ROW_BUDGET.toLocaleString('fr-FR').replace(/\s/g, ' ')} lignes par passage (plan gratuit : 100 000 par jour) ; rien n'est écrit.`);
  }
  if (plan.missing.length === 0) return { files: 0, statements: 0, requests: 0 };
  const statements = [];
  for (const f of plan.missing) {
    chunks(fs.readFileSync(f.abs)).forEach((data, part) => statements.push({ sql: INSERT, params: [f.key, String(part), data] }));
  }
  const path = queryPath(A, uuid);
  let requests = 0;
  const send = async body => {
    for (let attempt = 1; ; attempt++) {
      try {
        requests++;
        return await api('POST', path, { body });
      } catch (e) {
        const status = e?.status ?? 0;
        const transient = status === 0 || status === 429 || status >= 500;
        if (!transient || attempt >= ATTEMPTS) throw e;
        await sleep(2 ** (attempt - 1) * 1000);
      }
    }
  };
  const batches = insertBatches(statements);
  let single = false;
  for (const [i, batch] of batches.entries()) {
    if (!single) {
      try {
        checkResults(await send({ batch }), batch.length);
        continue;
      } catch (e) {
        if (!(i === 0 && e?.status === 400)) throw e;
        single = true;
        log('D1 : lot refusé (400) au premier envoi ; envoi instruction par instruction.');
      }
    }
    for (const st of batch) checkResults(await send(st), 1);
  }
  log(`D1 : ${plan.missing.length} fichier(s), ${statements.length} instructions en ${requests} requête(s)`);
  return { files: plan.missing.length, statements: statements.length, requests };
}

/**
 * Production deployment of the worker on `main` (refused otherwise, before any call): multipart `manifest` = {},
 * `branch`, `commit_message` (+ worker marker), `commit_dirty`, `_worker.js`. Returns { id, url, environment, ready }.
 */
export async function deployWorker(api, { A, project, worker, branch, message, log = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (branch !== 'main') throw new Error(`branche « ${branch ?? ''} » refusée : le déploiement se fait toujours sur main (jamais d'aperçu).`);
  const base = `${A}/pages/projects/${project}`;
  const form = new FormData();
  form.append('manifest', '{}');
  form.append('branch', 'main');
  form.append('commit_message', `${message ?? ''} ${workerMarker(worker)}`.trim());
  form.append('commit_dirty', 'true');
  form.append('_worker.js', new File([worker], '_worker.js', { type: 'application/javascript' }));
  const created = await api('POST', `${base}/deployments`, { form });
  const { dep, ready } = await pollDeployment(api, base, created, { sleep, log });
  return { id: created.id, url: dep.url ?? created.url, environment: dep.environment ?? created.environment, ready };
}
