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
