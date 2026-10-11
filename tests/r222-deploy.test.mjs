// R2.0.22 — base D1 des records partagés : provisionnement idempotent (06.1-CONTEXT D-05). La base `zuma-scores`
// (liaison `SCORES_DB`) est créée, munie de son schéma et liée à côté de `zuma-assets` / `ASSETS_DB` par
// tools/deploy.mjs ; tout est vérifié hors réseau sur le compte simulé (tools/cfsim.mjs), sans aucun appel réel.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const D = await import('../tools/d1deploy.mjs');
const { simulatedCloudflare } = await import('../tools/cfsim.mjs');
const { SCORES_SCHEMA, SCORES_DATABASE_NAME, SCORES_BINDING } = await import('../tools/recordsapi.mjs');

const A_UUID = '0b1c2d3e-4f50-6172-8394-a5b6c7d8e9f0';
const S_UUID = '1c2d3e4f-5061-7283-94a5-b6c7d8e9f0a1';
const ACC = 'f'.repeat(32);
const SA = `/accounts/${ACC}`;

/** Every SQL text sent to the database `uuid` by the recorded calls. */
const sqlTo = (calls, uuid) => calls.filter(c => c.path.endsWith(`/d1/database/${uuid}/query`)).flatMap(c => (c.body.batch ?? [c.body]).map(q => q.sql));

// ============================================================ contracts of tools/d1deploy.mjs

test('bindingBody(assets, scores): ASSETS_DB and SCORES_DB on production and preview with the fixed date; never ASSETS', () => {
  const body = D.bindingBody('a-uuid', 's-uuid');
  assert.deepEqual(Object.keys(body), ['deployment_configs']);
  for (const env of ['production', 'preview']) {
    assert.deepEqual(body.deployment_configs[env], { d1_databases: { ASSETS_DB: { id: 'a-uuid' }, SCORES_DB: { id: 's-uuid' } }, compatibility_date: D.COMPATIBILITY_DATE });
    assert.ok(!('ASSETS' in body.deployment_configs[env].d1_databases), 'reserved Pages binding name never used');
  }
  assert.equal(SCORES_BINDING, 'SCORES_DB');
});

test('bindingOk(project, assets, scores): true only with both bindings and the date on both environments', () => {
  const ok = { deployment_configs: D.bindingBody(A_UUID, S_UUID).deployment_configs };
  assert.equal(D.bindingOk(ok, A_UUID, S_UUID), true);
  const variants = {
    'SCORES_DB missing': p => { for (const e of ['production', 'preview']) delete p.deployment_configs[e].d1_databases.SCORES_DB; },
    'SCORES_DB elsewhere': p => { p.deployment_configs.preview.d1_databases.SCORES_DB = { id: 'other' }; },
    'ASSETS_DB elsewhere': p => { p.deployment_configs.production.d1_databases.ASSETS_DB = { id: 'other' }; },
    'production only': p => { delete p.deployment_configs.preview; },
    'old date': p => { p.deployment_configs.preview.compatibility_date = '2021-01-01'; },
  };
  for (const [name, mutate] of Object.entries(variants)) {
    const p = structuredClone(ok);
    mutate(p);
    assert.equal(D.bindingOk(p, A_UUID, S_UUID), false, name);
  }
  // The R2.0.21 state: ASSETS_DB alone.
  const legacy = { deployment_configs: { production: { d1_databases: { ASSETS_DB: { id: A_UUID } }, compatibility_date: D.COMPATIBILITY_DATE }, preview: { d1_databases: { ASSETS_DB: { id: A_UUID } }, compatibility_date: D.COMPATIBILITY_DATE } } };
  assert.equal(D.bindingOk(legacy, A_UUID, S_UUID), false);
  assert.equal(D.bindingOk(ok, A_UUID, null), false);
  assert.equal(D.bindingOk(null, A_UUID, S_UUID), false);
});

test('readScoresTables on the simulated account: SELECT on sqlite_master only; new database → {}; after the schema → { scores, times }', async () => {
  assert.equal(D.SCORES_TABLES_SQL, "SELECT name FROM sqlite_master WHERE type = 'table' AND name IN ('scores', 'times')");
  const sim = simulatedCloudflare();
  await sim.api('POST', `${SA}/d1/database`, { body: { name: SCORES_DATABASE_NAME } });
  const db = await D.findDatabase(sim.api, SA, SCORES_DATABASE_NAME);
  assert.ok(db && db.name === SCORES_DATABASE_NAME);
  const mark = sim.calls.length;
  assert.deepEqual([...await D.readScoresTables(sim.api, SA, db.uuid)], []);
  assert.ok(sim.calls.slice(mark).every(c => c.method === 'POST' && c.body.sql === D.SCORES_TABLES_SQL), 'SELECT only');
  await sim.api('POST', D.queryPath(SA, db.uuid), { body: { batch: SCORES_SCHEMA.map(sql => ({ sql })) } });
  assert.deepEqual([...await D.readScoresTables(sim.api, SA, db.uuid)].sort(), ['scores', 'times']);
  // Idempotent schema: applying it again changes nothing.
  await sim.api('POST', D.queryPath(SA, db.uuid), { body: { batch: SCORES_SCHEMA.map(sql => ({ sql })) } });
  assert.deepEqual([...await D.readScoresTables(sim.api, SA, db.uuid)].sort(), ['scores', 'times']);
});

test('planD1 with the records database: absent → createScoresDatabase, createScoresTables, bind; everything present and bound → nothing', () => {
  const assets = { uuid: A_UUID, name: D.DATABASE_NAME };
  const blobs = { table: true, present: new Map() };
  const marker = 'worker:abc';
  const deployed = { latest_stage: { name: 'deploy', status: 'success' }, deployment_trigger: { metadata: { commit_message: `R2.0.22 x ${marker}` } } };
  const legacy = { deployment_configs: { production: { d1_databases: { ASSETS_DB: { id: A_UUID } }, compatibility_date: D.COMPATIBILITY_DATE }, preview: { d1_databases: { ASSETS_DB: { id: A_UUID } }, compatibility_date: D.COMPATIBILITY_DATE } }, canonical_deployment: deployed };
  const absent = D.planD1({ files: [], database: assets, blobs, project: legacy, marker, scores: { database: null, tables: new Set() } });
  assert.equal(absent.createDatabase, false);
  assert.equal(absent.createTable, false);
  assert.equal(absent.createScoresDatabase, true);
  assert.equal(absent.createScoresTables, true);
  assert.equal(absent.bind, true);
  assert.equal(absent.deploy, true, 'a new binding redeploys the worker');
  const scores = { uuid: S_UUID, name: SCORES_DATABASE_NAME };
  const noTables = D.planD1({ files: [], database: assets, blobs, project: legacy, marker, scores: { database: scores, tables: new Set(['scores']) } });
  assert.equal(noTables.createScoresDatabase, false);
  assert.equal(noTables.createScoresTables, true, 'one table missing → the schema is applied');
  const project = { deployment_configs: D.bindingBody(A_UUID, S_UUID).deployment_configs, canonical_deployment: deployed };
  const done = D.planD1({ files: [], database: assets, blobs, project, marker, scores: { database: scores, tables: new Set(['scores', 'times']) } });
  for (const k of ['createDatabase', 'createTable', 'createScoresDatabase', 'createScoresTables', 'bind', 'deploy']) assert.equal(done[k], false, k);
  assert.equal(done.rows, 0, 'the records schema writes no row');
});

test('cfsim: records schema and sqlite_master read accepted on zuma-scores; any other statement refused (400); two-binding PATCH merged; ASSETS refused', async () => {
  const sim = simulatedCloudflare({ state: { project: { name: 'zuma', subdomain: 'zuma.pages.dev', production_branch: 'main', deployment_configs: { production: { d1_databases: { ASSETS_DB: { id: A_UUID } } }, preview: { d1_databases: { ASSETS_DB: { id: A_UUID } } } } } } });
  const created = await sim.api('POST', `${SA}/d1/database`, { body: { name: SCORES_DATABASE_NAME } });
  const q = (body) => sim.api('POST', D.queryPath(SA, created.uuid), { body });
  for (const sql of SCORES_SCHEMA) assert.equal((await q({ sql }))[0].success, true);
  assert.deepEqual((await q({ sql: D.SCORES_TABLES_SQL }))[0].results.map(r => r.name).sort(), ['scores', 'times']);
  for (const sql of [
    "INSERT INTO scores (player, sid, name, score, stage, level, day, at) VALUES ('p', 's', 'n', 1, 1, 1, '', 1)",
    'DELETE FROM scores', 'DROP TABLE times', 'CREATE TABLE IF NOT EXISTS blobs (key TEXT NOT NULL, part INTEGER NOT NULL, data TEXT NOT NULL, PRIMARY KEY (key, part))',
    'CREATE TABLE IF NOT EXISTS scores (id INTEGER PRIMARY KEY)', 'SELECT * FROM scores',
  ]) {
    await assert.rejects(q({ sql }), e => e.status === 400, sql);
  }
  // The search is filtered by name: the records database never answers a search for zuma-assets.
  assert.equal(await D.findDatabase(sim.api, SA, D.DATABASE_NAME), null);
  const project = await sim.api('PATCH', `${SA}/pages/projects/zuma`, { body: D.bindingBody(A_UUID, created.uuid) });
  assert.equal(D.bindingOk(project, A_UUID, created.uuid), true, 'both bindings merged on both environments');
  await assert.rejects(sim.api('PATCH', `${SA}/pages/projects/zuma`, { body: { deployment_configs: { production: { d1_databases: { ASSETS: { id: A_UUID } } } } } }), e => e.status === 400);
});

// ============================================================ tools/deploy.mjs on the simulated account

const { run, provisionedState } = await import('../tools/deploy.mjs');
const ME = 'joueur@example.org';
const FRIEND = 'amie@example.org';
const FRIEND_NAME = 'Camille';
const AUD = 'a'.repeat(64);
const LEVELS_PACK = '{ "graphics": { "Spiral": {}, "claw": {} } }';
const noSleep = async () => undefined;
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-r222-deploy-'));
const put = (dir, rel, data) => {
  const file = path.join(dir, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};

/** Temporary project root: package.json, private_assets/deploy.json, a --deploy dist/ whose pack.json is `pack`. */
function root({ pack = LEVELS_PACK, config = { project: 'zuma', allow: [ME], players: { [FRIEND]: FRIEND_NAME } } } = {}) {
  const dir = tmp();
  const hash = 'abcdef012345';
  put(dir, 'package.json', JSON.stringify({ version: '2.0.22' }));
  if (config) put(dir, 'private_assets/deploy.json', JSON.stringify(config));
  put(dir, 'dist/index.html', '<!doctype html>');
  put(dir, 'dist/sw.js', `const ASSETS_CACHE = 'zuma-assets-${hash}';`);
  put(dir, 'dist/assets/pack.json', pack);
  put(dir, 'dist/assets/images/a.gif', 'GIF89a');
  put(dir, 'dist/version.json', JSON.stringify({ version: '2.0.22', build: '2.0.22+T', assetsHash: hash, assets: 2 }));
  return dir;
}

/** Simulated account with Access already provisioned (state left by 05-16), the « Zuma » app carrying an AUD. */
function account() {
  const state = provisionedState({ project: 'zuma', allow: [ME, FRIEND] });
  state.apps[0].aud = AUD;
  return simulatedCloudflare({ state });
}

/** Simulated network for --verify (and the end of a run): protected URLs redirect to Access, /public/ answers 200. */
const protectedFetch = async url => {
  const u = new URL(url);
  if (u.pathname.startsWith('/public/') && !u.pathname.includes('..')) return new Response('{"name":"Zuma"}', { status: 200 });
  return new Response(null, { status: 302, headers: { location: `https://equipe.cloudflareaccess.com/cdn-cgi/access/login/${u.host}` } });
};

async function exec(argv, sim, { dir = root(), fetch = protectedFetch } = {}) {
  const out = [];
  const code = await run(argv, { api: sim.api, fetch, log: m => out.push(m), env: {}, root: dir, sleep: noSleep });
  return { code, out: out.join('\n'), lines: out.join('\n').split('\n') };
}

/** Calls that change something (D1 SELECT queries are reads). */
const writesOf = calls => calls.filter(c => c.method !== 'GET' && !(c.path.endsWith('/query') && /^SELECT /.test(c.body?.sql ?? '')));
const uuidOf = (sim, name) => sim.state.databases.find(d => d.name === name)?.uuid;
const sig = (sim, c) => {
  const p = sim.state.databases.reduce((t, d) => t.split(d.uuid).join(`{${d.name}}`), c.path.replace(SA, ''));
  if (!c.path.endsWith('/query')) return `${c.method} ${p}`;
  const sql = (c.body.batch ?? [c.body]).map(q => q.sql.split(' (')[0]);
  return `${p} ${[...new Set(sql)].join(' + ')}`;
};

/** The account as R2.0.21 left it: zuma-assets, its rows and ASSETS_DB only, an older worker in production. */
async function r221State(dir) {
  const sim = account();
  assert.equal((await exec([], sim, { dir })).code, 0);
  sim.state.databases = sim.state.databases.filter(d => d.name !== SCORES_DATABASE_NAME);
  for (const env of ['production', 'preview']) delete sim.state.project.deployment_configs[env].d1_databases.SCORES_DB;
  sim.state.project.canonical_deployment.deployment_trigger.metadata.commit_message = 'R2.0.21 2.0.21+T worker:0000000000000000';
  return sim;
}

test('run (default) on a provisioned account: zuma-assets → rows → zuma-scores → schema → one PATCH with both bindings → worker; second run writes nothing', async () => {
  const sim = account();
  const dir = root();
  const first = await exec([], sim, { dir });
  assert.equal(first.code, 0, first.out);
  const w = writesOf(sim.calls).map(c => sig(sim, c));
  const lastInsert = w.findLastIndex(x => x.endsWith('INSERT OR IGNORE INTO blobs'));
  assert.deepEqual(w.slice(0, 2), ['POST /d1/database', '/d1/database/{zuma-assets}/query CREATE TABLE IF NOT EXISTS blobs']);
  assert.ok(lastInsert >= 2);
  assert.deepEqual(w.slice(lastInsert + 1), [
    'POST /d1/database',
    '/d1/database/{zuma-scores}/query CREATE TABLE IF NOT EXISTS scores + CREATE TABLE IF NOT EXISTS times',
    'PATCH /pages/projects/zuma',
    'POST /pages/projects/zuma/deployments',
  ]);
  const raw = writesOf(sim.calls);
  assert.deepEqual(raw[lastInsert + 1].body, { name: 'zuma-scores' });
  assert.deepEqual(raw[lastInsert + 2].body, { batch: SCORES_SCHEMA.map(sql => ({ sql })) });
  const patch = raw[lastInsert + 3].body;
  for (const env of ['production', 'preview']) {
    assert.deepEqual(patch.deployment_configs[env].d1_databases, { ASSETS_DB: { id: uuidOf(sim, 'zuma-assets') }, SCORES_DB: { id: uuidOf(sim, 'zuma-scores') } });
  }
  // Each step is read back before the next one.
  const at = pred => sim.calls.findIndex(pred);
  const scoresCreate = at(c => c.method === 'POST' && c.path === `${SA}/d1/database` && c.body.name === 'zuma-scores');
  const scoresSchema = at(c => c.body?.batch?.[0]?.sql === SCORES_SCHEMA[0]);
  const patchAt = at(c => c.method === 'PATCH');
  assert.ok(sim.calls.slice(scoresCreate + 1, scoresSchema).some(c => c.method === 'GET' && c.path.includes('name=zuma-scores')), 'database read back');
  assert.ok(sim.calls.slice(scoresSchema + 1, patchAt).some(c => c.body?.sql === D.SCORES_TABLES_SQL), 'tables read back');
  assert.match(first.out, /créé : base D1 « zuma-scores »/);
  assert.match(first.out, /créé : tables scores, times/);
  assert.match(first.out, /lié : « ASSETS_DB » → « zuma-assets », « SCORES_DB » → « zuma-scores »/);
  // Second run: not a single write.
  const before = sim.calls.length;
  const again = await exec([], sim, { dir });
  assert.equal(again.code, 0, again.out);
  assert.deepEqual(writesOf(sim.calls.slice(before)), [], 'idempotent');
  assert.match(again.out, /déjà présente : base D1 « zuma-scores »/);
  assert.match(again.out, /déjà présentes : tables scores, times/);
  assert.match(again.out, /déjà lié/);
  const plan = await exec(['--plan'], sim, { dir });
  assert.ok(plan.lines.includes('actions prévues : 0'), plan.out);
});

test('run (default) from the R2.0.21 state: zuma-scores, its schema, one PATCH with both bindings, then the worker (levels inscribed)', async () => {
  const dir = root();
  const sim = await r221State(dir);
  const plan = await exec(['--plan'], sim, { dir });
  const before = sim.calls.length;
  assert.equal(plan.code, 0, plan.out);
  const i = plan.lines.indexOf('actions prévues : 4');
  assert.ok(i >= 0, plan.out);
  assert.deepEqual(plan.lines.slice(i + 1), ['- create-d1-scores-database', '- create-scores-tables', '- bind-d1', '- deploy-worker']);
  const mark = sim.calls.length;
  const res = await exec([], sim, { dir });
  assert.equal(res.code, 0, res.out);
  assert.equal(writesOf(sim.calls.slice(before, mark)).length, 0, '--plan reads only');
  const w = writesOf(sim.calls.slice(mark));
  assert.deepEqual(w.map(c => sig(sim, c)), [
    'POST /d1/database',
    '/d1/database/{zuma-scores}/query CREATE TABLE IF NOT EXISTS scores + CREATE TABLE IF NOT EXISTS times',
    'PATCH /pages/projects/zuma',
    'POST /pages/projects/zuma/deployments',
  ]);
  assert.match(res.out, /déjà présente : base D1 « zuma-assets »/);
  const source = await w[3].form.get('_worker.js').text();
  assert.match(source, /RECORDS_LEVELS = new Set\(\["claw",\s*"spiral"\]\)/);
  assert.match(res.out, /records : 2 niveaux/);
  assert.ok((await exec(['--plan'], sim, { dir })).lines.includes('actions prévues : 0'));
});

test('run (default) with zuma-scores present but without its tables: only the schema, the binding and the redeploy are written', async () => {
  const dir = root();
  const sim = account();
  assert.equal((await exec([], sim, { dir })).code, 0);
  sim.state.databases.find(d => d.name === SCORES_DATABASE_NAME).tables.clear();
  for (const env of ['production', 'preview']) delete sim.state.project.deployment_configs[env].d1_databases.SCORES_DB;
  const mark = sim.calls.length;
  const res = await exec([], sim, { dir });
  assert.equal(res.code, 0, res.out);
  assert.deepEqual(writesOf(sim.calls.slice(mark)).map(c => sig(sim, c)), [
    '/d1/database/{zuma-scores}/query CREATE TABLE IF NOT EXISTS scores + CREATE TABLE IF NOT EXISTS times',
    'PATCH /pages/projects/zuma',
    'POST /pages/projects/zuma/deployments',
  ], 'a new binding only applies to a new deployment');
  assert.match(res.out, /déjà présente : base D1 « zuma-scores »/);
  assert.match(res.out, /créé : tables scores, times/);
});

test('run --dry-run: after the inserts, zuma-scores then its schema; PATCH with both bindings then the worker; second plan 0; no network', async () => {
  for (const config of [{ project: 'zuma', allow: [ME], players: { [FRIEND]: FRIEND_NAME } }, null]) {
    const dir = root({ config });
    const touched = [];
    const api = async (m, p) => { touched.push(`${m} ${p}`); throw new Error('network'); };
    const fetch = async url => { touched.push(String(url)); throw new Error('network'); };
    const out = [];
    const code = await run(['--dry-run'], { api, fetch, log: m => out.push(m), env: {}, root: dir, sleep: noSleep });
    const text = out.join('\n');
    assert.equal(code, 0, text);
    assert.deepEqual(touched, []);
    const lines = text.split('\n');
    const i = lines.findIndex(l => l.startsWith('écritures prévues'));
    const listed = lines.slice(i + 1).filter(l => /^\d+\. /.test(l));
    const lastInsert = listed.findLastIndex(l => /INSERT OR IGNORE/.test(l));
    assert.ok(lastInsert >= 2, text);
    assert.match(listed[lastInsert + 1], /^\d+\. POST \/accounts\/\{compte\}\/d1\/database \{"name":"zuma-scores"\}$/);
    assert.match(listed[lastInsert + 2], /^\d+\. POST \/accounts\/\{compte\}\/d1\/database\/\{base\}\/query batch de 2 CREATE TABLE IF NOT EXISTS scores \+ CREATE TABLE IF NOT EXISTS times/);
    assert.equal(listed.length, lastInsert + 5, text);
    assert.match(listed.at(-2), /PATCH \/accounts\/\{compte\}\/pages\/projects\/zuma .*ASSETS_DB.*SCORES_DB/);
    assert.match(listed.at(-1), /POST \/accounts\/\{compte\}\/pages\/projects\/zuma\/deployments .*_worker\.js/);
    assert.ok(lines.slice(i).includes('actions prévues : 0'), text);
    assert.doesNotMatch(text, /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/, 'no database uuid');
    assert.ok(!text.includes(ME) && !text.includes(FRIEND) && !text.includes(FRIEND_NAME), 'no address, no first name');
  }
});

test('run --rollback-plan: GET only; SCORES_DB removal and the zuma-scores deletion (records lost) described, never executed', async () => {
  const dir = root();
  const sim = account();
  await exec([], sim, { dir });
  const mark = sim.calls.length;
  const { code, out, lines } = await exec(['--rollback-plan'], sim, { dir });
  assert.equal(code, 0, out);
  assert.ok(sim.calls.slice(mark).every(c => c.method === 'GET'), 'GET only');
  const at = prefix => lines.findIndex(l => l.startsWith(prefix));
  assert.ok(at('2. retirer la liaison D1 « ASSETS_DB »') > 0, out);
  assert.ok(at('3. retirer la liaison D1 « SCORES_DB »') > at('2. '), out);
  assert.ok(at('4. supprimer la base D1 « zuma-assets »') > at('3. '), out);
  assert.ok(at('5. supprimer la base D1 « zuma-scores » (les records communs et personnels sont perdus') > at('4. '), out);
  assert.ok(at('6. supprimer le projet Pages') > at('5. '), out);
  assert.match(out, /PATCH \/accounts\/\{compte\}\/pages\/projects\/zuma .*"SCORES_DB":null/);
  assert.match(out, /Storage & Databases › D1 › zuma-scores/);
  assert.ok(sim.state.databases.some(d => d.name === 'zuma-scores'), 'nothing removed');
});

test('run --verify: one records line (database and binding), read only', async () => {
  const dir = root();
  const sim = account();
  const before = await exec(['--verify'], sim, { dir });
  assert.match(before.out, /records : base « zuma-scores » absente ; liaison « SCORES_DB » absente/);
  await exec([], sim, { dir });
  const mark = sim.calls.length;
  const after = await exec(['--verify'], sim, { dir });
  assert.match(after.out, /records : base « zuma-scores » présente ; liaison « SCORES_DB » en place/);
  assert.deepEqual(writesOf(sim.calls.slice(mark)), []);
});

test('worker levels: pack without graphics → 0 levels, deployed anyway; unreadable pack → no level, logged, deployed anyway', async () => {
  for (const [pack, line] of [['{}', /records : 0 niveaux/], ['pas du JSON', /records : niveaux du pack illisibles, temps refusés/]]) {
    const sim = account();
    const res = await exec([], sim, { dir: root({ pack }) });
    assert.equal(res.code, 0, res.out);
    assert.match(res.out, line);
    const dep = sim.calls.find(c => c.method === 'POST' && c.path.endsWith('/deployments'));
    assert.match(await dep.form.get('_worker.js').text(), /RECORDS_LEVELS = new Set\(\[\]\)/);
  }
});

test('guarantees: no DELETE in any mode; PATCH only on the project; SQL limited; no row written to zuma-scores; no secret in the output', async () => {
  const dir = root();
  const sim = account();
  const outputs = [];
  for (const argv of [['--plan'], [], ['--verify'], ['--rollback-plan'], ['--direct'], ['--plan']]) outputs.push((await exec(argv, sim, { dir })).out);
  assert.ok(!sim.calls.some(c => c.method === 'DELETE'));
  assert.deepEqual([...new Set(sim.calls.filter(c => c.method === 'PATCH').map(c => c.path))], [`${SA}/pages/projects/zuma`]);
  const sql = sim.calls.filter(c => c.path.endsWith('/query')).flatMap(c => (c.body.batch ?? [c.body]).map(q => q.sql));
  assert.ok(sql.length > 0 && sql.every(q => /^(SELECT |CREATE TABLE IF NOT EXISTS (blobs|scores|times) |INSERT OR IGNORE INTO blobs )/.test(q)), 'no UPDATE / DELETE / DROP');
  const records = sqlTo(sim.calls, uuidOf(sim, 'zuma-scores'));
  assert.ok(records.length > 0 && records.every(q => q === D.SCORES_TABLES_SQL || SCORES_SCHEMA.includes(q)), 'records database: schema and SELECT only');
  assert.ok(!records.some(q => /INSERT|UPDATE|DELETE|DROP|ALTER/i.test(q)));
  const all = outputs.join('\n');
  assert.ok(!all.includes(ACC), 'no account id');
  for (const d of sim.state.databases) assert.ok(!all.includes(d.uuid), `no uuid of ${d.name}`);
  assert.ok(!all.includes(AUD), 'no AUD');
  assert.ok(!all.includes(ME) && !all.includes(FRIEND), 'no address');
  assert.ok(!all.includes(FRIEND_NAME), 'no first name');
});
