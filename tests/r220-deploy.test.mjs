// R2.0.20 — hébergement privé (plan 05-16, D-42) : BLAKE3 (clé de contenu de l'API Pages), bibliothèque de
// téléversement direct Pages et CLI de déploiement `tools/deploy.mjs`. Tout est vérifié hors réseau : API Cloudflare
// et `fetch` simulés, dossiers temporaires, aucune construction lancée depuis le test.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { blake3Hex } from '../tools/blake3.mjs';
import {
  checkArtifact, listFiles, contentType, assetKey, buckets, pagesManifest, uploadAndDeploy,
} from '../tools/pagesupload.mjs';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-r220-deploy-'));
const write = (root, rel, data) => {
  const file = path.join(root, ...rel.split('/'));
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
};
const b64url = obj => Buffer.from(JSON.stringify(obj)).toString('base64url');
const makeJwt = payload => `${b64url({ alg: 'HS256', typ: 'JWT' })}.${b64url(payload)}.c2lnbmF0dXJl`;
const noSleep = async () => undefined;

// ------------------------------------------------------------ BLAKE3

/** Official vectors (BLAKE3-team/BLAKE3 test_vectors.json): input bytes i % 251, first 32 bytes of the hash. */
const VECTORS = {
  0: 'af1349b9f5f9a1a6a0404dea36dcc9499bcb25c9adc112b7cc9a93cae41f3262',
  1: '2d3adedff11b61f14c886e35afa036736dcd87a74d27b5c1510225d0f592e213',
  1024: '42214739f095a406f3fc83deb889744ac00df831c10daa55189b5d121c855af7',
  1025: 'd00278ae47eb27b34faecf67b4fe263f82d5412916c1ffd97c8cb7fb814b8444',
  2049: '5f4d72f40d7a5f82b15ca2b2e44b1de3c2ef86c426c95c1af0b6879522563030',
  8193: 'bab6c09cb8ce8cf459261398d2e7aef35700bf488116ceb94a36d0f5f1b7bc3b',
  102400: 'bc3e3d41a1146b069abffad3c0d44860cf664390afce4d9661f7902e7943e085',
};
const vectorInput = n => Uint8Array.from({ length: n }, (_, i) => i % 251);

test('blake3Hex matches the seven official vectors (32-byte hash, hex)', () => {
  for (const [n, want] of Object.entries(VECTORS)) {
    assert.equal(blake3Hex(vectorInput(Number(n))), want, `length ${n}`);
  }
});

test('blake3Hex accepts Uint8Array, Buffer and UTF-8 strings alike', () => {
  const text = 'Zuma « ENCHAÎNEMENT »';
  const bytes = new TextEncoder().encode(text);
  assert.equal(blake3Hex(text), blake3Hex(bytes));
  assert.equal(blake3Hex(Buffer.from(text, 'utf8')), blake3Hex(bytes));
  assert.equal(blake3Hex(''), VECTORS[0]);
  assert.match(blake3Hex('x'), /^[0-9a-f]{64}$/);
});

// ------------------------------------------------------------ clés, types, liste, lots, manifeste

test('assetKey = blake3(base64(content) + extension).slice(0, 32), like the Pages hashFile', () => {
  const buf = Buffer.from('console.log(1);\n');
  const key = assetKey(buf, 'js');
  assert.match(key, /^[0-9a-f]{32}$/);
  assert.equal(key, blake3Hex(buf.toString('base64') + 'js').slice(0, 32));
  assert.notEqual(assetKey(buf, 'txt'), key, 'the extension is part of the key');
  assert.equal(assetKey(buf, ''), blake3Hex(buf.toString('base64')).slice(0, 32), 'no extension');
});

test('contentType covers the artefact file types; unknown and mo3 are octet-stream', () => {
  const want = {
    'index.html': 'text/html', 'js/main.js': 'application/javascript', 'x.mjs': 'application/javascript',
    'public/style.css': 'text/css', 'version.json': 'application/json',
    'public/manifest.webmanifest': 'application/manifest+json', 'public/icon.svg': 'image/svg+xml',
    'a.png': 'image/png', 'b.gif': 'image/gif', 'c.jpg': 'image/jpeg', 'd.jpeg': 'image/jpeg', 'E.PNG': 'image/png',
    's.ogg': 'audio/ogg', 's.m4a': 'audio/mp4', 'r.txt': 'text/plain',
    'music/zuma.mo3': 'application/octet-stream', 'noext': 'application/octet-stream', 'x.bin': 'application/octet-stream',
  };
  for (const [file, type] of Object.entries(want)) assert.equal(contentType(file), type, file);
});

test('listFiles: relative / paths, sorted, without the Pages exclusions', () => {
  const dir = tmp();
  for (const f of ['index.html', 'sw.js', 'js/main.js', 'assets/pack.json', 'assets/images/a.gif', 'public/icon.svg',
    '_worker.js', '_redirects', '_headers', '_routes.json', 'functions/api/x.js', '.DS_Store', 'assets/.DS_Store',
    'node_modules/m/index.js', 'assets/node_modules/y', '.git/HEAD', '.wrangler/cache.json']) write(dir, f, 'x');
  assert.deepEqual(listFiles(dir), ['assets/images/a.gif', 'assets/pack.json', 'index.html', 'js/main.js', 'public/icon.svg', 'sw.js']);
});

test('listFiles refuses a file over 25 MiB and more files than allowed (French messages)', () => {
  const dir = tmp();
  write(dir, 'a.txt', 'a');
  write(dir, 'b.txt', 'b');
  write(dir, 'c.txt', 'c');
  assert.throws(() => listFiles(dir, { maxFiles: 2 }), /fichiers/);
  assert.deepEqual(listFiles(dir, { maxFiles: 3 }), ['a.txt', 'b.txt', 'c.txt']);
  const big = path.join(dir, 'big.bin');
  const fd = fs.openSync(big, 'w');
  fs.ftruncateSync(fd, 25 * 1024 * 1024 + 1);
  fs.closeSync(fd);
  assert.throws(() => listFiles(dir), /25 Mio/);
});

test('buckets: ≤ 40 MiB and ≤ 2 000 files each, every file in exactly one bucket', () => {
  const MiB = 1024 * 1024;
  const many = Array.from({ length: 4500 }, (_, i) => ({ path: `f${i}`, size: 10 }));
  const big = Array.from({ length: 7 }, (_, i) => ({ path: `big${i}`, size: 15 * MiB }));
  const files = [...many, ...big];
  const out = buckets(files);
  for (const b of out) {
    assert.ok(b.length > 0, 'no empty bucket');
    assert.ok(b.length <= 2000, 'at most 2 000 files');
    assert.ok(b.reduce((s, f) => s + f.size, 0) <= 40 * MiB, 'at most 40 MiB');
  }
  const seen = out.flat().map(f => f.path).sort();
  assert.deepEqual(seen, files.map(f => f.path).sort(), 'each file exactly once');
  assert.deepEqual(buckets([]), []);
});

test('pagesManifest maps "/<path>" to the asset key', () => {
  assert.deepEqual(pagesManifest([{ path: 'index.html', key: 'k1' }, { path: 'assets/pack.json', key: 'k2' }]),
    { '/index.html': 'k1', '/assets/pack.json': 'k2' });
});

// ------------------------------------------------------------ artefact --deploy

/** A minimal `--deploy` artefact: version.json, pack.json, sw.js naming the pack cache. */
function artefact({ version = '2.0.20', hash = 'abcdef012345', assets = 2, pack = true, sw = null, versionJson = true } = {}) {
  const dir = tmp();
  write(dir, 'index.html', '<!doctype html>');
  write(dir, 'sw.js', sw ?? `const ASSETS_CACHE = 'zuma-assets-${hash}';`);
  if (pack) write(dir, 'assets/pack.json', '{}');
  write(dir, 'assets/images/a.gif', 'GIF89a');
  if (versionJson) write(dir, 'version.json', JSON.stringify({ version, build: `${version}+T`, assetsHash: hash, assets }));
  return dir;
}

test('checkArtifact accepts a --deploy build and refuses everything else with a French message', () => {
  assert.equal(checkArtifact(artefact(), '2.0.20'), null);
  const cases = {
    'dist absent': path.join(tmp(), 'nope'),
    'public build (no version.json)': artefact({ versionJson: false }),
    'version.json without pack': artefact({ pack: false, assets: 1 }),
    'asset count differs': artefact({ assets: 5 }),
    'sw.js of another pack': artefact({ sw: "const ASSETS_CACHE = 'zuma-assets-000000000000';" }),
    'other version': artefact({ version: '2.0.19' }),
    'no pack hash': artefact({ hash: null, sw: "const ASSETS_CACHE = 'zuma-assets-none';" }),
  };
  for (const [name, dir] of Object.entries(cases)) {
    const err = checkArtifact(dir, '2.0.20');
    assert.equal(typeof err, 'string', name);
    assert.match(err, /dist\/ n'est pas un build --deploy/, name);
    assert.match(err, /npm run deploy/, name);
  }
});

// ------------------------------------------------------------ uploadAndDeploy (API simulée)

/**
 * Simulated Cloudflare API: records every call; `missing` = keys reported missing (default: all);
 * `assetStatus` = HTTP status thrown by every /pages/assets/* call; `stages` = successive latest_stage values.
 */
function fakePagesApi({ missing = null, assetStatus = null, environment = 'production', stages = null, payload = {} } = {}) {
  const calls = [];
  const jwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600, ...payload });
  let polls = 0;
  const seq = stages ?? [{ name: 'deploy', status: 'active' }, { name: 'deploy', status: 'success' }];
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const api = async (method, p, opts = {}) => {
    calls.push({ method, path: p, opts });
    if (p.startsWith('/pages/assets/') && assetStatus) throw fail(assetStatus, 'Authentication error');
    if (method === 'GET' && p.endsWith('/upload-token')) return { jwt };
    if (p === '/pages/assets/check-missing') return missing ?? opts.body.hashes;
    if (p === '/pages/assets/upload' || p === '/pages/assets/upsert-hashes') return true;
    if (method === 'POST' && p.endsWith('/deployments')) {
      return { id: 'dep-1', short_id: 'abc12345', url: 'https://abc12345.zuma-x.pages.dev', environment, latest_stage: { name: 'queued', status: 'active' }, aliases: [] };
    }
    if (method === 'GET' && p.endsWith('/deployments/dep-1')) {
      const stage = seq[Math.min(polls++, seq.length - 1)];
      return { id: 'dep-1', url: 'https://abc12345.zuma-x.pages.dev', environment, latest_stage: stage };
    }
    throw fail(404, `unexpected ${method} ${p}`);
  };
  return { api, calls, jwt };
}
const opts = dir => ({ accountId: 'acc', project: 'zuma', dir, branch: 'main', message: 'R2.0.20 test', sleep: noSleep });

test('uploadAndDeploy chains upload-token → check-missing → upload (missing only) → upsert → deployment → poll', async () => {
  const dir = artefact();
  const files = listFiles(dir);
  const keyOf = rel => assetKey(fs.readFileSync(path.join(dir, rel)), path.extname(rel).slice(1));
  const missingKey = keyOf('assets/pack.json');
  const { api, calls, jwt } = fakePagesApi({ missing: [missingKey] });
  const logs = [];
  const res = await uploadAndDeploy(api, { ...opts(dir), log: m => logs.push(m) });
  assert.deepEqual(calls.map(c => `${c.method} ${c.path}`), [
    'GET /accounts/acc/pages/projects/zuma/upload-token',
    'POST /pages/assets/check-missing',
    'POST /pages/assets/upload',
    'POST /pages/assets/upsert-hashes',
    'POST /accounts/acc/pages/projects/zuma/deployments',
    'GET /accounts/acc/pages/projects/zuma/deployments/dep-1',
    'GET /accounts/acc/pages/projects/zuma/deployments/dep-1',
  ]);
  for (const c of calls.filter(c => c.path.startsWith('/pages/assets/'))) assert.equal(c.opts.bearer, jwt, 'upload JWT as bearer');
  for (const c of calls.filter(c => c.path.startsWith('/accounts/'))) assert.equal(c.opts.bearer, undefined, 'API token (proxy) elsewhere');
  assert.deepEqual([...calls[1].opts.body.hashes].sort(), files.map(keyOf).sort());
  const payload = calls[2].opts.body;
  assert.equal(payload.length, 1, 'only the missing key is uploaded');
  assert.deepEqual(payload[0], { key: missingKey, value: Buffer.from('{}').toString('base64'), metadata: { contentType: 'application/json' }, base64: true });
  assert.equal(calls[3].opts.body.hashes.length, files.length, 'upsert all hashes');
  const form = calls[4].opts.form;
  assert.ok(form instanceof FormData);
  assert.equal(form.get('branch'), 'main');
  assert.equal(form.get('commit_dirty'), 'true');
  assert.equal(form.get('commit_message'), 'R2.0.20 test');
  const manifest = JSON.parse(form.get('manifest'));
  assert.deepEqual(Object.keys(manifest).sort(), files.map(f => `/${f}`).sort());
  assert.equal(manifest['/assets/pack.json'], missingKey);
  assert.deepEqual(res, { id: 'dep-1', url: 'https://abc12345.zuma-x.pages.dev', environment: 'production', files: files.length, uploaded: 1, ready: true });
  assert.ok(!logs.join('\n').includes(jwt), 'the JWT never appears in the log');
});

test('uploadAndDeploy refuses any branch but main before calling the API', async () => {
  const { api, calls } = fakePagesApi();
  for (const branch of ['preview', 'claude/x', '', undefined]) {
    await assert.rejects(uploadAndDeploy(api, { ...opts(artefact()), branch }), /main/);
  }
  assert.equal(calls.length, 0);
});

test('uploadAndDeploy: 401 / 403 on /pages/assets/* → French « proxy » error, JWT never in the message', async () => {
  for (const status of [401, 403]) {
    const { api, calls, jwt } = fakePagesApi({ assetStatus: status });
    const logs = [];
    let error;
    try { await uploadAndDeploy(api, { ...opts(artefact()), log: m => logs.push(m) }); } catch (e) { error = e; }
    assert.ok(error, `${status} rejects`);
    assert.match(error.message, /le proxy a remplacé l'autorisation d'envoi \?/);
    assert.ok(!error.message.includes(jwt) && !String(error.stack).includes(jwt), 'no JWT in the error');
    assert.ok(!logs.join('\n').includes(jwt), 'no JWT in the log');
    assert.ok(!calls.some(c => c.path.endsWith('/deployments')), 'no deployment after a refused upload');
  }
});

test('uploadAndDeploy honours max_file_count_allowed from the upload JWT', async () => {
  const { api, calls } = fakePagesApi({ payload: { max_file_count_allowed: 2 } });
  await assert.rejects(uploadAndDeploy(api, opts(artefact())), /fichiers/);
  assert.ok(!calls.some(c => c.path === '/pages/assets/upload'));
});

test('uploadAndDeploy: a failed build stage rejects; a slow one returns ready: false after 5 polls', async () => {
  const failed = fakePagesApi({ stages: [{ name: 'deploy', status: 'failure' }] });
  await assert.rejects(uploadAndDeploy(failed.api, opts(artefact())), /échec/);
  const slow = fakePagesApi({ stages: [{ name: 'deploy', status: 'active' }] });
  const res = await uploadAndDeploy(slow.api, opts(artefact()));
  assert.equal(res.ready, false);
  assert.equal(slow.calls.filter(c => c.method === 'GET' && c.path.endsWith('/deployments/dep-1')).length, 5);
});

test('uploadAndDeploy retries a transient upload failure (5 attempts) and reloads an expired JWT', async () => {
  const base = fakePagesApi();
  let failures = 2;
  const flaky = async (method, p, o) => {
    if (p === '/pages/assets/upload' && failures-- > 0) throw Object.assign(new Error('Bad gateway'), { status: 502 });
    return base.api(method, p, o);
  };
  const res = await uploadAndDeploy(flaky, opts(artefact()));
  assert.equal(res.ready, true);
  assert.equal(base.calls.filter(c => c.path === '/pages/assets/upload').length, 1, 'succeeded on the third try');
  // Expired JWT: a new one is requested before the asset calls.
  const expired = fakePagesApi();
  let first = true;
  const withExpired = async (method, p, o) => {
    if (p.endsWith('/upload-token') && first) { first = false; await expired.api(method, p, o); return { jwt: makeJwt({ exp: 1 }) }; }
    return expired.api(method, p, o);
  };
  await uploadAndDeploy(withExpired, opts(artefact()));
  assert.ok(expired.calls.filter(c => c.path.endsWith('/upload-token')).length >= 2, 'JWT reloaded');
  const bearers = expired.calls.filter(c => c.path.startsWith('/pages/assets/')).map(c => c.opts.bearer);
  assert.ok(bearers.every(b => b === expired.jwt), 'asset calls use the fresh JWT');
});

// ============================================================ tools/deploy.mjs (CLI, hors réseau)

const { planProvision, isAccessRedirect, redact, run } = await import('../tools/deploy.mjs');

const ACC = '0123456789abcdef0123456789abcdef';
const A = `/accounts/${ACC}`;
const AUTH = 'team.cloudflareaccess.com';
const ME = 'joueur@example.org';
const HOST = 'zuma-x.pages.dev';
const ALLOW = 'Zuma — joueurs';
const BYPASS = 'Zuma — fichiers publics';

/** An existing app of the account (shape of GET /access/apps), with the shared reusable policy expanded. */
const otherApp = (name, uri, extra = {}) => ({
  id: `app-${name}`, uid: `app-${name}`, type: 'self_hosted', name, aud: 'f'.repeat(64), created_at: '2026-09-17T12:27:22Z',
  updated_at: '2026-09-17T12:27:22Z', domain: uri, self_hosted_domains: [uri], destinations: [{ type: 'public', uri }],
  app_launcher_visible: true, allowed_idps: [], tags: [], auto_redirect_to_identity: false,
  policies: [{ id: 'pol-shared', name: 'Partagée', decision: 'allow', include: [{ email: { email: ME } }], exclude: [], require: [], reusable: true, precedence: 1 }],
  session_duration: '24h', enable_binding_cookie: false, http_only_cookie_attribute: false, options_preflight_bypass: false, ...extra,
});

/**
 * Simulated Cloudflare account (Pages + Access + direct upload) over an in-memory state; records every call.
 * Shapes follow the real GET responses (ids, expanded policies with precedence, app_count on reusable policies).
 */
function fakeCloud({ accounts = 1, project = null, idps = [{ id: 'idp-cf', type: 'cloudflare', name: '' }], policies = [], apps = [], environment = 'production', errorWith = null } = {}) {
  const s = { project, idps: structuredClone(idps), policies: structuredClone(policies), apps: structuredClone(apps), n: 0 };
  const calls = [];
  const jwt = makeJwt({ exp: Math.floor(Date.now() / 1000) + 3600 });
  const fail = (status, message) => Object.assign(new Error(message), { status });
  const expand = app => ({ ...app, policies: app.policies.map(p => ({ ...(s.policies.find(q => q.id === p.id) ?? p), precedence: p.precedence })) });
  const api = async (method, p, o = {}) => {
    calls.push({ method, path: p, body: o.body, form: o.form, bearer: o.bearer });
    if (errorWith && errorWith.method === method && p.startsWith(errorWith.prefix)) throw fail(errorWith.status, `Authentication error on ${p} with Authorization: Bearer secret-token-123456`);
    if (p === '/user/tokens/verify') return { status: 'active' };
    if (p === '/accounts') return Array.from({ length: accounts }, (_, i) => ({ id: i === 0 ? ACC : `${i}`.repeat(32), name: `Compte ${i}` }));
    if (p === `${A}/access/organizations`) return { auth_domain: AUTH, name: 'team' };
    if (p === `${A}/pages/projects/zuma` && method === 'GET') { if (!s.project) throw fail(404, 'Project not found'); return s.project; }
    if (p === `${A}/pages/projects` && method === 'POST') {
      s.project = { name: o.body.name, subdomain: HOST, production_branch: o.body.production_branch, latest_deployment: null };
      return s.project;
    }
    if (p === `${A}/access/identity_providers`) {
      if (method === 'GET') return s.idps;
      const idp = { id: 'idp-otp', ...o.body };
      s.idps.push(idp);
      return idp;
    }
    if (p === `${A}/access/policies`) {
      if (method === 'GET') return s.policies.map(q => ({ ...q, app_count: s.apps.filter(a => a.policies.some(x => x.id === q.id)).length }));
      const pol = { id: `pol-${++s.n}`, reusable: true, exclude: [], require: [], ...o.body };
      s.policies.push(pol);
      return pol;
    }
    if (p === `${A}/access/apps`) {
      if (method === 'GET') return s.apps.map(expand);
      const uri = o.body.destinations[0].uri;
      const app = { id: `app-new-${++s.n}`, uid: 'u', aud: 'e'.repeat(64), created_at: 'now', updated_at: 'now', domain: uri, self_hosted_domains: o.body.destinations.map(d => d.uri), tags: [], ...o.body };
      s.apps.push(app);
      return expand(app);
    }
    const one = p.match(new RegExp(`^${A}/access/apps/([^/]+)$`));
    if (one) {
      const i = s.apps.findIndex(a => a.id === one[1]);
      if (i < 0) throw fail(404, 'no app');
      if (method === 'GET') return expand(s.apps[i]);
      if (method === 'PUT') {
        const { id, uid, aud, created_at } = s.apps[i];
        s.apps[i] = { ...o.body, id, uid, aud, created_at, updated_at: 'later', self_hosted_domains: o.body.destinations.map(d => d.uri) };
        return expand(s.apps[i]);
      }
    }
    if (p === `${A}/pages/projects/zuma/upload-token`) return { jwt };
    if (p === '/pages/assets/check-missing') return o.body.hashes;
    if (p === '/pages/assets/upload' || p === '/pages/assets/upsert-hashes') return true;
    if (p === `${A}/pages/projects/zuma/deployments` && method === 'POST') {
      s.project.latest_deployment = { id: 'dep-1', url: `https://abc12345.${HOST}` };
      return { id: 'dep-1', url: `https://abc12345.${HOST}`, environment, latest_stage: { name: 'queued', status: 'active' } };
    }
    if (p === `${A}/pages/projects/zuma/deployments/dep-1`) return { id: 'dep-1', url: `https://abc12345.${HOST}`, environment, latest_stage: { name: 'deploy', status: 'success' } };
    throw fail(404, `unexpected ${method} ${p}`);
  };
  return { api, calls, s, jwt };
}

/** Temporary project root: package.json, private_assets/deploy.json, a --deploy dist/. */
function root({ config = { project: 'zuma', allow: [ME] }, dist = true } = {}) {
  const dir = tmp();
  write(dir, 'package.json', JSON.stringify({ version: '2.0.20' }));
  if (config) write(dir, 'private_assets/deploy.json', JSON.stringify(config));
  if (dist) fs.cpSync(artefact(), path.join(dir, 'dist'), { recursive: true });
  return dir;
}

/** Simulated network for --verify: every protected URL redirects to Access, /public/ answers 200. */
function protectedFetch({ exposed = [], unreachable = false } = {}) {
  const seen = [];
  const fetch = async (url, init = {}) => {
    seen.push({ url: String(url), redirect: init.redirect });
    if (unreachable) throw new TypeError('fetch failed', { cause: new Error('CONNECT tunnel failed, response 403') });
    const u = new URL(url);
    if (exposed.some(x => u.pathname === x)) return new Response('{"stages":[]}', { status: 200, headers: { 'content-type': 'application/json' } });
    if (u.pathname.startsWith('/public/') && !u.pathname.includes('..')) return new Response('{"name":"Zuma"}', { status: 200, headers: { 'content-type': 'application/manifest+json' } });
    return new Response(null, { status: 302, headers: { location: `https://${AUTH}/cdn-cgi/access/login/${u.host}?redirect_url=${encodeURIComponent(u.pathname)}` } });
  };
  return { fetch, seen };
}

async function exec(argv, cloud, { dir = root(), fetch = protectedFetch().fetch, env = {} } = {}) {
  const out = [];
  const code = await run(argv, { api: cloud.api, fetch, log: m => out.push(m), env, root: dir, sleep: noSleep });
  return { code, out: out.join('\n'), lines: out.join('\n').split('\n') };
}

const writes = calls => calls.filter(c => c.method !== 'GET' && !c.path.startsWith('/pages/assets/') && !c.path.endsWith('/deployments'));

test('planProvision: empty state → the six actions in order; complete state → none', () => {
  const empty = planProvision({ project: null, idps: [{ id: 'idp-cf', type: 'cloudflare' }], policies: [], apps: [] }, { project: 'zuma', allow: [ME], host: 'zuma.pages.dev' });
  assert.deepEqual(empty.conflict, []);
  assert.deepEqual(empty.actions.map(a => a.kind), ['create-project', 'add-otp', 'create-allow-policy', 'create-allow-app', 'create-bypass-policy', 'create-bypass-app']);
  const state = {
    project: { name: 'zuma', subdomain: HOST, production_branch: 'main' },
    idps: [{ id: 'idp-cf', type: 'cloudflare' }, { id: 'idp-otp', type: 'onetimepin' }],
    policies: [
      { id: 'p1', name: ALLOW, decision: 'allow', include: [{ email: { email: ME } }], exclude: [], require: [] },
      { id: 'p2', name: BYPASS, decision: 'bypass', include: [{ everyone: {} }], exclude: [], require: [] },
    ],
    apps: [
      { id: 'a1', name: 'Zuma', domain: HOST, destinations: [{ type: 'public', uri: HOST }, { type: 'public', uri: `*.${HOST}` }], session_duration: '730h', allowed_idps: ['idp-otp'], policies: [{ id: 'p1', precedence: 1 }] },
      { id: 'a2', name: BYPASS, domain: `${HOST}/public`, destinations: [{ type: 'public', uri: `${HOST}/public` }], policies: [{ id: 'p2', precedence: 1 }] },
    ],
  };
  const done = planProvision(state, { project: 'zuma', allow: [ME], host: HOST });
  assert.deepEqual(done, { actions: [], conflict: [] });

  const variants = {
    'production branch': s => { s.project.production_branch = 'dev'; },
    'session': s => { s.apps[0].session_duration = '24h'; },
    'policy include': s => { s.policies[0].include.push({ email: { email: 'autre@example.org' } }); },
    'policy exclude': s => { s.policies[0].exclude = [{ everyone: {} }]; },
    'app policy': s => { s.apps[0].policies = [{ id: 'p2', precedence: 1 }]; },
    'idps without OTP': s => { s.apps[0].allowed_idps = ['idp-cf']; },
    'bypass outside /public': s => { s.apps[1].destinations = [{ type: 'public', uri: `${HOST}/assets` }]; s.apps[1].domain = `${HOST}/assets`; },
    'main app on one host only': s => { s.apps[0].destinations = [{ type: 'public', uri: HOST }]; },
  };
  for (const [name, mutate] of Object.entries(variants)) {
    const st = structuredClone(state);
    mutate(st);
    const res = planProvision(st, { project: 'zuma', allow: [ME], host: HOST });
    assert.ok(res.conflict.length > 0, `${name} → conflict`);
    assert.deepEqual(res.actions, [], `${name} → no action`);
  }
});

test('planProvision (D-43): existing apps with empty allowed_idps are pinned to the current providers before OTP, only when listed', () => {
  const state = { project: null, idps: [{ id: 'idp-cf', type: 'cloudflare' }], policies: [], apps: [otherApp('Prisme', 'app.example.org'), otherApp('ssh', 'ssh.example.org')] };
  const listed = planProvision(state, { project: 'zuma', allow: [ME], host: 'zuma.pages.dev', pinIdpApps: ['Prisme', 'ssh'] });
  assert.deepEqual(listed.conflict, []);
  assert.deepEqual(listed.actions.map(a => a.kind), ['create-project', 'pin-idp', 'pin-idp', 'add-otp', 'create-allow-policy', 'create-allow-app', 'create-bypass-policy', 'create-bypass-app']);
  assert.deepEqual(listed.actions[1], { kind: 'pin-idp', id: 'app-Prisme', name: 'Prisme', idps: ['idp-cf'] });
  const unlisted = planProvision(state, { project: 'zuma', allow: [ME], host: 'zuma.pages.dev' });
  assert.ok(unlisted.conflict.length > 0 && unlisted.actions.length === 0, 'unlisted apps → conflict, nothing written');
  const pinned = structuredClone(state);
  pinned.apps[1].allowed_idps = ['idp-cf'];
  const differs = planProvision(pinned, { project: 'zuma', allow: [ME], host: 'zuma.pages.dev', pinIdpApps: ['Prisme', 'ssh'] });
  assert.ok(differs.conflict.length > 0 && differs.actions.length === 0, 'an app no longer empty → conflict');
  const withOtp = structuredClone(state);
  withOtp.idps.push({ id: 'idp-otp', type: 'onetimepin' });
  assert.ok(!planProvision(withOtp, { project: 'zuma', allow: [ME], host: 'zuma.pages.dev' }).actions.some(a => a.kind === 'pin-idp'), 'OTP present → no pin');
});

test('run --plan: GET only, « actions prévues : N » then one « - <action> » line per action', async () => {
  const cloud = fakeCloud();
  const { code, lines } = await exec(['--plan'], cloud);
  assert.equal(code, 0);
  assert.ok(cloud.calls.every(c => c.method === 'GET'), 'GET only');
  const i = lines.indexOf('actions prévues : 6');
  assert.ok(i >= 0, lines.join('\n'));
  assert.deepEqual(lines.slice(i + 1, i + 7), ['- create-project', '- add-otp', '- create-allow-policy', '- create-allow-app', '- create-bypass-policy', '- create-bypass-app']);
});


test('run (full) on an empty account: project → OTP → policies → apps → upload; no content call before the main app is read back', async () => {
  const cloud = fakeCloud();
  const { code, out } = await exec([], cloud);
  assert.equal(code, 0, out);
  const sig = c => `${c.method} ${c.path}`;
  const idx = pred => cloud.calls.findIndex(pred);
  const project = idx(c => sig(c) === `POST ${A}/pages/projects`);
  const otp = idx(c => sig(c) === `POST ${A}/access/identity_providers`);
  const allowPol = idx(c => sig(c) === `POST ${A}/access/policies` && c.body.decision === 'allow');
  const mainApp = idx(c => sig(c) === `POST ${A}/access/apps` && c.body.name === 'Zuma');
  const bypassPol = idx(c => sig(c) === `POST ${A}/access/policies` && c.body.decision === 'bypass');
  const bypassApp = idx(c => sig(c) === `POST ${A}/access/apps` && c.body.name === BYPASS);
  const readBack = cloud.calls.findIndex((c, i) => i > mainApp && c.method === 'GET' && c.path.startsWith(`${A}/access/apps`));
  const content = idx(c => c.path.startsWith('/pages/assets/') || c.path.includes('/deployments') || c.path.endsWith('/upload-token'));
  assert.ok(project >= 0 && project < otp && otp < allowPol && allowPol < mainApp && mainApp < bypassPol && bypassPol < bypassApp, 'write order');
  assert.ok(readBack > mainApp && content > readBack && content > bypassApp, 'content only after the Access apps are created and read back');
  // Exact bodies (shape of the GET of an existing app).
  assert.deepEqual(cloud.calls[project].body, { name: 'zuma', production_branch: 'main' });
  assert.deepEqual(cloud.calls[otp].body, { name: 'One-time PIN', type: 'onetimepin', config: {} });
  assert.deepEqual(cloud.calls[allowPol].body, { name: ALLOW, decision: 'allow', include: [{ email: { email: ME } }], exclude: [], require: [], session_duration: '730h' });
  assert.deepEqual(cloud.calls[mainApp].body, {
    type: 'self_hosted', name: 'Zuma', domain: HOST,
    destinations: [{ type: 'public', uri: HOST }, { type: 'public', uri: `*.${HOST}` }],
    session_duration: '730h', allowed_idps: ['idp-otp'], auto_redirect_to_identity: true, app_launcher_visible: false,
    policies: [{ id: cloud.calls[allowPol] && cloud.s.policies.find(p => p.name === ALLOW).id, precedence: 1 }],
  });
  assert.deepEqual(cloud.calls[bypassPol].body, { name: BYPASS, decision: 'bypass', include: [{ everyone: {} }], exclude: [], require: [] });
  assert.deepEqual(cloud.calls[bypassApp].body, {
    type: 'self_hosted', name: BYPASS, domain: `${HOST}/public`, destinations: [{ type: 'public', uri: `${HOST}/public` }],
    app_launcher_visible: false, policies: [{ id: cloud.s.policies.find(p => p.name === BYPASS).id, precedence: 1 }],
  });
  const deploy = cloud.calls.find(c => sig(c) === `POST ${A}/pages/projects/zuma/deployments`);
  assert.equal(deploy.form.get('branch'), 'main');
  assert.match(deploy.form.get('commit_message'), /^R2\.0\.20 /);
  assert.match(out, new RegExp(`https://${HOST.replace(/\./g, '\\.')}`), 'production URL in the log');
  assert.match(out, /abc12345\.zuma-x\.pages\.dev/, 'deployment URL in the log');
  assert.match(out, /abcdef012345/, 'pack fingerprint in the log');

  // Second run on the resulting state: no provisioning write, and --plan announces nothing.
  const before = cloud.calls.length;
  const again = await exec([], cloud);
  assert.equal(again.code, 0, again.out);
  assert.deepEqual(writes(cloud.calls.slice(before)), [], 'no provisioning write the second time');
  assert.match(again.out, /déjà présent/);
  const plan = await exec(['--plan'], cloud);
  assert.ok(plan.lines.includes('actions prévues : 0'), plan.out);
});

test('run (D-43): listed existing apps get allowed_idps = [cloudflare] before OTP, nothing else changes, previous value logged', async () => {
  const prisme = otherApp('Prisme', 'app.example.org', { session_duration: '730h' });
  const cloud = fakeCloud({ apps: [prisme, otherApp('ssh', 'ssh.example.org'), otherApp('label', 'label.example.org')], policies: [prisme.policies[0]] });
  const dir = root({ config: { project: 'zuma', allow: [ME], pinIdpApps: ['Prisme', 'ssh', 'label'] } });
  const beforeApps = structuredClone(cloud.s.apps);
  const { code, out } = await exec([], cloud, { dir });
  assert.equal(code, 0, out);
  const puts = cloud.calls.filter(c => c.method === 'PUT');
  assert.deepEqual(puts.map(c => c.path), ['Prisme', 'ssh', 'label'].map(n => `${A}/access/apps/app-${n}`));
  const otp = cloud.calls.findIndex(c => c.method === 'POST' && c.path === `${A}/access/identity_providers`);
  assert.ok(cloud.calls.lastIndexOf(puts[2]) < otp, 'pinned before the One-time PIN is added');
  for (const [i, put] of puts.entries()) {
    const was = beforeApps[i];
    assert.deepEqual(put.body.allowed_idps, ['idp-cf']);
    assert.deepEqual(put.body.policies, [{ id: 'pol-shared', precedence: 1 }]);
    for (const k of ['id', 'uid', 'aud', 'created_at', 'updated_at', 'self_hosted_domains']) assert.ok(!(k in put.body), `${k} not sent`);
    for (const k of ['name', 'type', 'domain', 'destinations', 'session_duration', 'app_launcher_visible', 'auto_redirect_to_identity', 'tags', 'enable_binding_cookie', 'http_only_cookie_attribute', 'options_preflight_bypass']) {
      assert.deepEqual(put.body[k], was[k], `${was.name}.${k} unchanged`);
    }
    const now = cloud.s.apps.find(a => a.id === was.id);
    assert.deepEqual({ ...now, allowed_idps: [], updated_at: was.updated_at }, was, `${was.name}: only allowed_idps changed`);
  }
  assert.match(out, /Prisme.*allowed_idps \[\] → \[/);
  assert.match(out, /remettre \[\]/);
  // Idempotent: nothing to pin any more.
  const plan = await exec(['--plan'], cloud, { dir });
  assert.ok(plan.lines.includes('actions prévues : 0'), plan.out);
  // Without the explicit list: conflict, nothing written.
  const fresh = fakeCloud({ apps: [otherApp('Prisme', 'app.example.org')] });
  const refused = await exec([], fresh);
  assert.equal(refused.code, 1);
  assert.deepEqual(writes(fresh.calls), []);
  assert.match(refused.out, /pinIdpApps/);
});

test('no mode ever sends DELETE / PATCH; PUT only on listed existing Access apps', async () => {
  const cloud = fakeCloud({ apps: [otherApp('Prisme', 'app.example.org')] });
  const dir = root({ config: { project: 'zuma', allow: [ME], pinIdpApps: ['Prisme'] } });
  for (const argv of [['--plan'], [], ['--verify'], ['--rollback-plan'], ['--plan']]) await exec(argv, cloud, { dir });
  assert.ok(!cloud.calls.some(c => c.method === 'DELETE' || c.method === 'PATCH'));
  const puts = cloud.calls.filter(c => c.method === 'PUT');
  assert.deepEqual(puts.map(c => c.path), [`${A}/access/apps/app-Prisme`], 'one PUT, on the listed app only');
});

test('run --rollback-plan: GET only, prints the ordered removal (project first) with DELETE endpoints and dashboard paths', async () => {
  const cloud = fakeCloud();
  await exec([], cloud);
  const n = cloud.calls.length;
  const { code, out, lines } = await exec(['--rollback-plan'], cloud);
  assert.equal(code, 0);
  assert.ok(cloud.calls.slice(n).every(c => c.method === 'GET'));
  const at = prefix => lines.findIndex(l => l.startsWith(prefix));
  assert.ok(at('1. supprimer le projet Pages (contenu retiré d\'abord)') >= 0, out);
  assert.ok(at('2. supprimer l\'application principale et l\'application Bypass') > at('1. '));
  assert.ok(at(`3. supprimer les politiques « ${ALLOW} » / « ${BYPASS} » si app_count = 0`) > at('2. '));
  assert.ok(at('4. garder la méthode « One-time PIN » (facultatif : la retirer)') > at('3. '));
  assert.match(out, /DELETE \/accounts\/\{compte\}\/pages\/projects\/zuma/);
  assert.match(out, /DELETE \/accounts\/\{compte\}\/access\/apps\//);
  assert.match(out, /Workers & Pages › zuma › Settings › Delete project/);
  assert.match(out, /Zero Trust › Access › Applications › Zuma › Delete/);
});

test('run: missing or empty private config, several accounts, non --deploy dist → code 1 before any write', async () => {
  for (const config of [null, { project: 'zuma', allow: [] }, { project: 'zuma' }]) {
    const cloud = fakeCloud();
    const { code, out } = await exec([], cloud, { dir: root({ config }) });
    assert.equal(code, 1);
    assert.match(out, /private_assets\/deploy\.json/);
    assert.deepEqual(writes(cloud.calls), []);
  }
  const multi = fakeCloud({ accounts: 2 });
  const r = await exec(['--plan'], multi);
  assert.equal(r.code, 1);
  assert.match(r.out, /CLOUDFLARE_ACCOUNT_ID/);
  const chosen = await exec(['--plan'], fakeCloud({ accounts: 2 }), { env: { CLOUDFLARE_ACCOUNT_ID: ACC } });
  assert.equal(chosen.code, 0, chosen.out);
  const publicBuild = fakeCloud();
  const dir = root({ dist: false });
  write(dir, 'dist/index.html', 'x');
  const p = await exec([], publicBuild, { dir });
  assert.equal(p.code, 1);
  assert.match(p.out, /n'est pas un build --deploy/);
  assert.deepEqual(writes(publicBuild.calls), [], 'the artefact is checked before any write');
});

test('run: a 403 on the first write stops with the missing permission named; a preview environment is refused', async () => {
  const cloud = fakeCloud({ errorWith: { method: 'POST', prefix: `${A}/pages/projects`, status: 403 } });
  const { code, out } = await exec([], cloud);
  assert.equal(code, 1);
  assert.match(out, /Cloudflare Pages.*Edit/);
  assert.equal(cloud.calls.filter(c => c.method !== 'GET').length, 1, 'stopped at the first refused write');
  assert.ok(!out.includes('secret-token-123456'), 'the Authorization value is masked');
  assert.ok(!out.includes(ACC), 'the account id is masked');
  const preview = fakeCloud({ environment: 'preview' });
  const r = await exec([], preview);
  assert.equal(r.code, 1);
  assert.match(r.out, /production/);
});

test('the whole output of a run never contains the upload JWT, the token or the account id', async () => {
  const cloud = fakeCloud();
  const outputs = [];
  for (const argv of [['--plan'], [], ['--verify'], ['--rollback-plan']]) outputs.push((await exec(argv, cloud)).out);
  const all = outputs.join('\n');
  assert.ok(!all.includes(cloud.jwt), 'no JWT');
  assert.doesNotMatch(all, /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\./);
  assert.ok(!all.includes(ACC), 'no account id');
});

test('redact masks JWTs, Authorization values and 32+ hex identifiers, keeping the last 4 characters', () => {
  const jwt = makeJwt({ exp: 1 });
  const text = `jwt=${jwt} Authorization: Bearer abcdefghijklmnop1234 compte ${ACC} aud ${'a1'.repeat(32)} short 0123abcd`;
  const r = redact(text);
  assert.ok(!r.includes(jwt) && !r.includes('abcdefghijklmnop1234') && !r.includes(ACC) && !r.includes('a1'.repeat(32)));
  assert.match(r, /\[masqué\]cdef/, 'account id: last 4 kept');
  assert.match(r, /Authorization: \[masqué\]1234/);
  assert.match(r, /short 0123abcd/, 'short hex untouched');
  assert.equal(redact('rien à masquer'), 'rien à masquer');
});

test('isAccessRedirect: 301/302/303/307/308 to exactly the team domain', () => {
  for (const s of [301, 302, 303, 307, 308]) assert.equal(isAccessRedirect(s, `https://${AUTH}/cdn-cgi/access/login/x`, AUTH), true, String(s));
  assert.equal(isAccessRedirect(200, `https://${AUTH}/`, AUTH), false);
  assert.equal(isAccessRedirect(302, 'https://evil.example/?team.cloudflareaccess.com', AUTH), false);
  assert.equal(isAccessRedirect(302, `https://x.${AUTH}/`, AUTH), false);
  assert.equal(isAccessRedirect(302, '/', AUTH), false, 'relative redirect (Pages /index.html → /) is not Access');
  assert.equal(isAccessRedirect(302, null, AUTH), false);
});

test('run --verify: API configuration then HTTP (redirect manual); 0 protected, 1 exposed, 2 unreachable', async () => {
  const cloud = fakeCloud();
  await exec([], cloud);
  const ok = protectedFetch();
  const r0 = await exec(['--verify'], cloud, { fetch: ok.fetch });
  assert.equal(r0.code, 0, r0.out);
  const urls = ok.seen.map(s => s.url);
  for (const p of ['/', '/index.html', '/sw.js', '/assets/pack.json', '/public/manifest.webmanifest', '/public/..%2Fassets/pack.json']) {
    assert.ok(urls.includes(`https://${HOST}${p}`), p);
  }
  assert.ok(urls.includes(`https://abc12345.${HOST}/`), 'deployment URL checked');
  assert.ok(ok.seen.every(s => s.redirect === 'manual'));
  const r1 = await exec(['--verify'], cloud, { fetch: protectedFetch({ exposed: ['/assets/pack.json'] }).fetch });
  assert.equal(r1.code, 1);
  assert.match(r1.out, /EXPOSÉ/);
  const r2 = await exec(['--verify'], cloud, { fetch: protectedFetch({ unreachable: true }).fetch });
  assert.equal(r2.code, 2);
  assert.match(r2.out, /injoignable/);
  // Configuration not conforming (main app session changed in the console) → 1 even if HTTP looks protected.
  cloud.s.apps.find(a => a.name === 'Zuma').session_duration = '24h';
  const bad = await exec(['--verify'], cloud);
  assert.equal(bad.code, 1);
  assert.match(bad.out, /730h/);
});

test('importing tools/deploy.mjs runs nothing', async () => {
  const { spawnSync } = await import('node:child_process');
  const res = spawnSync(process.execPath, ['-e', "import('./tools/deploy.mjs').then(() => console.log('imported'))"], { encoding: 'utf8', env: { ...process.env, HTTPS_PROXY: '', https_proxy: '' } });
  assert.equal(res.status, 0, res.stderr);
  assert.equal(res.stdout.trim(), 'imported');
});
