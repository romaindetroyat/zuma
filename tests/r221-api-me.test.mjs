/**
 * D-12 (phase 6): the hosted worker names the player — `api/me` answers the first name of the Access identity from the
 * private `players` table of private_assets/deploy.json; only SHA-256 hashes of the addresses reach the worker source.
 */
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import vm from 'node:vm';
import { generateWorker, playerKey, playerNames } from '../tools/d1worker.mjs';

const TEAM = 'equipe-test.cloudflareaccess.com';
const ISS = `https://${TEAM}`;
const AUD = 'c0ffee'.repeat(10) + 'c0de';
const subtle = globalThis.crypto.subtle;
const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const { privateKey, publicKey } = await subtle.generateKey(RSA, true, ['sign', 'verify']);
const { n, e } = await subtle.exportKey('jwk', publicKey);
const JWKS = { keys: [{ kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n, e }] };
const b64u = x => Buffer.from(JSON.stringify(x)).toString('base64url');

async function jwt(email) {
  const t = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64u({ aud: [AUD], email, exp: t + 3600, iat: t - 5, nbf: t - 5, iss: ISS, type: 'app', sub: 'u' });
  const sig = Buffer.from(await subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`))).toString('base64url');
  return `${head}.${body}.${sig}`;
}

const PLAYERS = { 'romain@example.org': 'Romain', 'sophie@example.fr': 'Sophie' };

function load(players = PLAYERS) {
  const source = generateWorker({ '/index.html': { key: 'sha256:00', contentType: 'text/html; charset=utf-8', size: 0 } }, { build: 't', access: { team: TEAM, aud: AUD }, players });
  const fetch = async () => new Response(JSON.stringify(JWKS), { headers: { 'content-type': 'application/json' } });
  const context = vm.createContext({ Response, Headers, URL, atob, crypto: globalThis.crypto, fetch, TextEncoder, TextDecoder });
  vm.runInContext(source.replace(/^export default /m, 'globalThis.worker = '), context);
  const worker = context.worker;
  const call = (p, init = {}) => worker.fetch(new Request(`https://zuma-x.pages.dev${p}`, init), { ASSETS_DB: null }, {});
  return { source, call };
}

test('api/me: the first name of the authenticated address, JSON no-store; address case and spaces ignored', async () => {
  const { call } = load();
  for (const [email, name] of [['romain@example.org', 'Romain'], ['Sophie@Example.FR', 'Sophie'], [' romain@example.org ', 'Romain']]) {
    const res = await call('/api/me', { headers: { 'cf-access-jwt-assertion': await jwt(email) } });
    assert.equal(res.status, 200, email);
    assert.match(res.headers.get('content-type'), /^application\/json/);
    assert.equal(res.headers.get('cache-control'), 'no-store');
    assert.deepEqual(await res.json(), { name });
  }
  const head = await call('/api/me', { method: 'HEAD', headers: { 'cf-access-jwt-assertion': await jwt('romain@example.org') } });
  assert.equal(head.status, 200);
  assert.equal(await head.text(), '');
});

test('api/me: unknown address or empty table → 404; no token → 403; other methods → 405', async () => {
  const { call } = load();
  assert.equal((await call('/api/me', { headers: { 'cf-access-jwt-assertion': await jwt('autre@example.org') } })).status, 404);
  assert.equal((await load({}).call('/api/me', { headers: { 'cf-access-jwt-assertion': await jwt('romain@example.org') } })).status, 404);
  const anon = await call('/api/me');
  assert.equal(anon.status, 403);
  assert.equal(await anon.text(), 'Accès refusé.');
  assert.equal((await call('/public/../api/me')).status, 403, 'no way around the token');
  const post = await call('/api/me', { method: 'POST', headers: { 'cf-access-jwt-assertion': await jwt('romain@example.org') } });
  assert.equal(post.status, 405);
});

test('worker source carries hashes and names only, never an address; same table → same source', () => {
  const { source } = load();
  assert.doesNotMatch(source, /@example\./, 'no address in the worker');
  assert.ok(source.includes(playerKey('romain@example.org')) && source.includes('"Sophie"'));
  assert.equal(load().source, source, 'deterministic');
  assert.equal(playerKey(' Romain@Example.org'), playerKey('romain@example.org'));
});

test('playerNames refuses malformed tables, addresses and names (French), accepts accents, spaces and hyphens', () => {
  assert.deepEqual(Object.values(playerNames({ 'a@b.fr': 'Zoé', 'c@d.fr': 'Jean-Luc', 'e@f.fr': "Anne Marie" })).sort(), ['Anne Marie', 'Jean-Luc', 'Zoé']);
  for (const bad of [[], null, 'x', { 'pas-une-adresse': 'Romain' }, { 'a@b.fr': '' }, { 'a@b.fr': '<script>' }, { 'a@b.fr': 'x'.repeat(21) }, { 'a@b.fr': 3 }, { 'a@b.fr': 'A', 'A@B.fr': 'B' }]) {
    assert.throws(() => playerNames(bad), /^Error: players : /, JSON.stringify(bad));
  }
});

test('deploy config: every players address is allowed (no duplicate); a bad table stops before any call, no address printed', async () => {
  const { readConfig, run } = await import('../tools/deploy.mjs');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'zuma-me-'));
  fs.mkdirSync(path.join(dir, 'private_assets'));
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({ version: '0.0.0' }));
  const cfg = file => fs.writeFileSync(path.join(dir, 'private_assets', 'deploy.json'), JSON.stringify(file));
  cfg({ project: 'zuma', allow: ['romain@example.org'], players: { 'romain@example.org': 'Romain', 'nouveau@example.org': 'Léa' } });
  const ok = readConfig(dir);
  assert.deepEqual(ok.allow, ['romain@example.org', 'nouveau@example.org']);
  assert.deepEqual(ok.players, { 'romain@example.org': 'Romain', 'nouveau@example.org': 'Léa' });
  cfg({ project: 'zuma', players: { 'nouveau@example.org': 'Léa' } });
  assert.deepEqual(readConfig(dir).allow, ['nouveau@example.org'], 'players alone is enough');
  cfg({ project: 'zuma', allow: ['romain@example.org'] });
  assert.deepEqual(readConfig(dir).players, {}, 'no table → no names');

  cfg({ project: 'zuma', allow: ['romain@example.org'], players: { 'nouveau@example.org': '<b>' } });
  const lines = [];
  let calls = 0;
  const code = await run(['--plan'], { root: dir, log: m => lines.push(m), fetch: async () => { calls++; throw new Error('no network'); }, api: async () => { calls++; throw new Error('no api'); } });
  assert.equal(code, 1);
  assert.equal(calls, 0, 'refused before any call');
  assert.match(lines.join('\n'), /players : prénom invalide/);
  assert.doesNotMatch(lines.join('\n'), /@example/, 'no address printed');
});
