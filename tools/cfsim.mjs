/**
 * In-memory Cloudflare account for `node tools/deploy.mjs --dry-run` (R2.0.20, plan 05-17). Answers the calls the
 * deployment makes — token check, account, Zero Trust organisation, Pages project / deployments, Access identity
 * providers / policies / apps, D1 databases and queries — with the response shapes of the API v4 `result`, and
 * enforces the documented limits that matter here (D1: 100 000 bytes per statement, 100 bound parameters, string
 * parameters through the REST API; Pages: `ASSETS` is a reserved binding name, `_worker.js` and `_worker.bundle` are
 * mutually exclusive). Records every call. Never touches the network.
 *
 * D1 (R2.0.22, plan 06.1-03): each database has its own vocabulary. `zuma-scores` (the shared records) accepts exactly
 * the two `CREATE TABLE IF NOT EXISTS scores / times` texts of SCORES_SCHEMA (idempotent) and the
 * `sqlite_master … IN ('scores', 'times')` read — any other statement there is refused (400), so a deployment that
 * tried to write a record row would fail. Every other database understands the `blobs` statements of the files store.
 */
import { SCORES_DATABASE_NAME, SCORES_SCHEMA } from './recordsapi.mjs';

const STATEMENT_MAX = 100000;
const SCORES_READ = "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('scores', 'times')";
const PARAMS_MAX = 100;

/** Error shaped like the API layer's (message + HTTP status). */
const fail = (status, message) => Object.assign(new Error(message), { status });

/**
 * `state` = { project, idps, policies, apps } (the account before the run). Returns { api, calls, state }:
 * `api(method, path, { body, form })` resolves to the `result` of the simulated response.
 */
export function simulatedCloudflare({ accountId = 'f'.repeat(32), authDomain = 'equipe.cloudflareaccess.com', state = {} } = {}) {
  const s = {
    project: state.project ? structuredClone(state.project) : null,
    idps: structuredClone(state.idps ?? []),
    policies: structuredClone(state.policies ?? []),
    apps: structuredClone(state.apps ?? []),
    databases: [],
    deployments: [],
    n: 0,
  };
  const calls = [];
  const A = `/accounts/${accountId}`;
  const expand = app => ({ ...app, policies: (app.policies ?? []).map(p => ({ ...(s.policies.find(q => q.id === p.id) ?? p), precedence: p.precedence })) });
  const uuid = () => `5a1e0000-0000-4000-8000-${String(++s.n).padStart(12, '0')}`;

  /** A tiny SQL engine for the statements of tools/d1deploy.mjs. */
  const sql = (db, text, params = []) => {
    if (!Array.isArray(params) || !params.every(p => typeof p === 'string')) throw fail(400, 'D1: params must be strings');
    if (params.length > PARAMS_MAX) throw fail(400, `D1: more than ${PARAMS_MAX} bound parameters`);
    const bytes = Buffer.byteLength(text) + params.reduce((n, p) => n + Buffer.byteLength(p), 0);
    if (bytes > STATEMENT_MAX) throw fail(400, `D1: statement of ${bytes} bytes (limit ${STATEMENT_MAX})`);
    const t = text.trim();
    if (db.name === SCORES_DATABASE_NAME) {
      // Records database: the schema and the table read only (the deployment never writes a row there).
      const i = SCORES_SCHEMA.indexOf(t);
      if (i >= 0) {
        db.tables.add(['scores', 'times'][i]);
        return { results: [], success: true, meta: { changes: 0, rows_written: 0 } };
      }
      if (t === SCORES_READ) return { results: ['scores', 'times'].filter(n => db.tables.has(n)).map(name => ({ name })), success: true, meta: {} };
      throw fail(400, `D1: statement refused on ${SCORES_DATABASE_NAME} in the simulation: ${t.slice(0, 60)}`);
    }
    if (/^CREATE TABLE IF NOT EXISTS blobs \(/.test(t)) {
      db.tables.add('blobs');
      return { results: [], success: true, meta: { changes: 0, rows_written: 0 } };
    }
    if (/^SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'blobs'$/.test(t)) return { results: db.tables.has('blobs') ? [{ name: 'blobs' }] : [], success: true, meta: {} };
    if (!db.tables.has('blobs')) throw fail(400, 'D1_ERROR: no such table: blobs');
    if (/^SELECT key, COUNT\(\*\) AS parts, SUM\(LENGTH\(data\)\) AS chars FROM blobs GROUP BY key$/.test(t)) {
      const by = new Map();
      for (const r of db.rows.values()) {
        const e = by.get(r.key) ?? { key: r.key, parts: 0, chars: 0 };
        e.parts++;
        e.chars += r.data.length;
        by.set(r.key, e);
      }
      return { results: [...by.values()], success: true, meta: { rows_read: db.rows.size } };
    }
    if (t === 'INSERT OR IGNORE INTO blobs (key, part, data) VALUES (?, ?, ?)') {
      if (params.length !== 3) throw fail(400, 'D1: wrong number of bound parameters');
      const [key, part, data] = params;
      const id = `${key}|${Number(part)}`;
      if (db.rows.has(id)) return { results: [], success: true, meta: { changes: 0, rows_written: 0 } };
      db.rows.set(id, { key, part: Number(part), data });
      return { results: [], success: true, meta: { changes: 1, rows_written: 2 } };
    }
    throw fail(400, `D1: unsupported statement in the simulation: ${t.slice(0, 60)}`);
  };

  const api = async (method, p, o = {}) => {
    calls.push({ method, path: p, body: o.body, form: o.form });
    const url = new URL(`https://api.invalid${p}`);
    const route = url.pathname;
    if (route === '/user/tokens/verify') return { status: 'active' };
    if (route === '/accounts') return [{ id: accountId, name: 'Compte simulé' }];
    if (route === `${A}/access/organizations`) return { auth_domain: authDomain, name: 'equipe' };

    // Pages
    const projectRoute = route.match(new RegExp(`^${A}/pages/projects/([^/]+)$`));
    if (route === `${A}/pages/projects` && method === 'POST') {
      s.project = { name: o.body.name, subdomain: `${o.body.name}.pages.dev`, production_branch: o.body.production_branch, deployment_configs: { production: {}, preview: {} }, latest_deployment: null, canonical_deployment: null };
      return structuredClone(s.project);
    }
    if (projectRoute) {
      if (!s.project || s.project.name !== projectRoute[1]) throw fail(404, 'Project not found');
      if (method === 'GET') return structuredClone(s.project);
      if (method === 'PATCH') {
        for (const env of ['production', 'preview']) {
          const patch = o.body?.deployment_configs?.[env];
          if (!patch) continue;
          const cur = s.project.deployment_configs[env] ??= {};
          for (const [k, v] of Object.entries(patch)) {
            if (v && typeof v === 'object' && !Array.isArray(v)) {
              if (k.endsWith('_namespaces') || k.endsWith('_databases') || k.endsWith('_buckets')) {
                if (Object.keys(v).includes('ASSETS')) throw fail(400, 'ASSETS is a reserved binding name in Pages projects');
              }
              cur[k] = { ...(cur[k] ?? {}) };
              for (const [name, x] of Object.entries(v)) { if (x === null) delete cur[k][name]; else cur[k][name] = x; }
            } else cur[k] = v;
          }
        }
        return structuredClone(s.project);
      }
    }
    const deps = route.match(new RegExp(`^${A}/pages/projects/([^/]+)/deployments(?:/([^/]+))?$`));
    if (deps) {
      if (!s.project || s.project.name !== deps[1]) throw fail(404, 'Project not found');
      if (!deps[2] && method === 'GET') return structuredClone(s.deployments);
      if (!deps[2] && method === 'POST') {
        const form = o.form;
        if (!(form instanceof FormData)) throw fail(400, 'multipart body expected');
        try { JSON.parse(form.get('manifest')); } catch { throw fail(400, 'manifest: invalid JSON'); }
        if (form.has('_worker.js') && form.has('_worker.bundle')) throw fail(400, 'Cannot specify both _worker.js and _worker.bundle');
        const branch = form.get('branch') ?? s.project.production_branch;
        const environment = branch === s.project.production_branch ? 'production' : 'preview';
        const id = `sim-${++s.n}`;
        const dep = {
          id, short_id: id.slice(-8), url: `https://${id}.${s.project.subdomain}`, environment,
          latest_stage: { name: 'deploy', status: 'success' },
          deployment_trigger: { type: 'ad_hoc', metadata: { branch, commit_message: form.get('commit_message') ?? '' } },
          env_vars: null, worker_bytes: form.has('_worker.js') ? (await form.get('_worker.js').arrayBuffer()).byteLength : 0,
        };
        s.deployments.unshift(dep);
        s.project.latest_deployment = dep;
        if (environment === 'production') s.project.canonical_deployment = dep;
        return { ...structuredClone(dep), latest_stage: { name: 'queued', status: 'active' } };
      }
      if (deps[2] && method === 'GET') {
        const dep = s.deployments.find(d => d.id === deps[2]);
        if (!dep) throw fail(404, 'Deployment not found');
        return structuredClone(dep);
      }
    }

    // Access
    if (route === `${A}/access/identity_providers`) {
      if (method === 'GET') return structuredClone(s.idps);
      const idp = { id: `idp-${++s.n}`, ...o.body };
      s.idps.push(idp);
      return structuredClone(idp);
    }
    if (route === `${A}/access/policies`) {
      if (method === 'GET') return s.policies.map(q => ({ ...q, app_count: s.apps.filter(a => (a.policies ?? []).some(x => x.id === q.id)).length }));
      const pol = { id: `pol-${++s.n}`, reusable: true, exclude: [], require: [], ...o.body };
      s.policies.push(pol);
      return structuredClone(pol);
    }
    if (route === `${A}/access/apps`) {
      if (method === 'GET') return s.apps.map(expand);
      const app = { id: `app-${++s.n}`, uid: 'u', aud: 'a'.repeat(64), self_hosted_domains: (o.body.destinations ?? []).map(d => d.uri), ...o.body };
      s.apps.push(app);
      return expand(app);
    }
    const app = route.match(new RegExp(`^${A}/access/apps/([^/]+)$`));
    if (app) {
      const i = s.apps.findIndex(a => a.id === app[1]);
      if (i < 0) throw fail(404, 'Application not found');
      if (method === 'GET') return expand(s.apps[i]);
      if (method === 'PUT') {
        const { id, uid, aud } = s.apps[i];
        s.apps[i] = { ...o.body, id, uid, aud };
        return expand(s.apps[i]);
      }
    }

    // D1
    if (route === `${A}/d1/database` && method === 'GET') {
      const name = url.searchParams.get('name');
      return s.databases.filter(d => !name || d.name.includes(name)).map(d => ({ uuid: d.uuid, name: d.name, version: 'production', num_tables: d.tables.size }));
    }
    if (route === `${A}/d1/database` && method === 'POST') {
      if (s.databases.some(d => d.name === o.body?.name)) throw fail(400, 'A database with that name already exists');
      const db = { uuid: uuid(), name: o.body.name, tables: new Set(), rows: new Map() };
      s.databases.push(db);
      return { uuid: db.uuid, name: db.name, version: 'production' };
    }
    const query = route.match(new RegExp(`^${A}/d1/database/([^/]+)/query$`));
    if (query && method === 'POST') {
      const db = s.databases.find(d => d.uuid === query[1]);
      if (!db) throw fail(404, 'Database not found');
      if (Array.isArray(o.body?.batch)) return o.body.batch.map(q => sql(db, q.sql, q.params ?? []));
      return [sql(db, o.body.sql, o.body.params ?? [])];
    }

    throw fail(404, `simulation : ${method} ${route} non prévu`);
  };
  return { api, calls, state: s, accountId };
}
