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
