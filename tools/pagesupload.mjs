/**
 * Cloudflare Pages direct upload through the REST API (R2.0.20, plan 05-16, D-42). No dependency, no network of its
 * own: `uploadAndDeploy` receives the API layer `api(method, path, { body, form, bearer })` from tools/deploy.mjs
 * (tests inject a simulated one). Mirrors the Pages CLI direct-upload sequence:
 *   1. GET  /accounts/{a}/pages/projects/{p}/upload-token      → short-lived upload JWT (never logged)
 *   2. POST /pages/assets/check-missing   (Bearer JWT)          → keys the platform does not have yet
 *   3. POST /pages/assets/upload          (Bearer JWT)          → missing files, base64, ≤ 40 MiB / 2 000 per bucket
 *   4. POST /pages/assets/upsert-hashes   (Bearer JWT)          → every key (failure = warning)
 *   5. POST /accounts/{a}/pages/projects/{p}/deployments        → multipart: manifest, branch=main, commit_dirty
 *   6. GET  …/deployments/{id} until the deploy stage succeeds.
 * Asset key = blake3(base64(content) + extension without dot), first 32 hex digits.
 */
import fs from 'node:fs';
import path from 'node:path';
import { blake3Hex } from './blake3.mjs';

const MiB = 1024 * 1024;
export const MAX_FILE_SIZE = 25 * MiB;
export const MAX_FILES = 20000;
const MAX_BUCKET_SIZE = 40 * MiB;
const MAX_BUCKET_FILES = 2000;
const CONCURRENCY = 3;
const UPLOAD_ATTEMPTS = 5;
const STATUS_ATTEMPTS = 5;
const STATUS_WAIT_MS = 3000;

const TYPES = {
  html: 'text/html', js: 'application/javascript', mjs: 'application/javascript', css: 'text/css',
  json: 'application/json', webmanifest: 'application/manifest+json', svg: 'image/svg+xml', png: 'image/png',
  gif: 'image/gif', jpg: 'image/jpeg', jpeg: 'image/jpeg', ogg: 'audio/ogg', m4a: 'audio/mp4', txt: 'text/plain',
};

/** MIME type sent as upload metadata; mo3 and unknown extensions are application/octet-stream. */
export function contentType(file) {
  const ext = path.extname(file).slice(1).toLowerCase();
  return TYPES[ext] ?? 'application/octet-stream';
}

/** Pages content key: blake3(base64(buf) + ext).slice(0, 32), `ext` without the dot ('' without extension). */
export function assetKey(buf, ext) {
  return blake3Hex(Buffer.from(buf).toString('base64') + ext).slice(0, 32);
}

/** Root-level names the Pages CLI never uploads as assets. */
const ROOT_EXCLUDED = new Set(['_worker.js', '_redirects', '_headers', '_routes.json', 'functions', '.wrangler']);
/** Names excluded at any depth. */
const ANY_EXCLUDED = new Set(['.DS_Store', 'node_modules', '.git']);

/**
 * Files to upload under `dir`: relative, `/`-separated, sorted, without the Pages exclusions. Throws (French) for a
 * file over 25 MiB or more than `maxFiles` files.
 */
export function listFiles(dir, { maxFiles = MAX_FILES } = {}) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (ANY_EXCLUDED.has(e.name) || (!rel && ROOT_EXCLUDED.has(e.name))) continue;
      const r = rel ? `${rel}/${e.name}` : e.name;
      const abs = path.join(d, e.name);
      if (e.isDirectory()) walk(abs, r);
      else if (e.isFile()) {
        const size = fs.statSync(abs).size;
        if (size > MAX_FILE_SIZE) throw new Error(`${r} : ${(size / MiB).toFixed(1)} Mio, au-delà de la limite de 25 Mio par fichier de Pages.`);
        out.push(r);
      }
    }
  };
  walk(dir, '');
  if (out.length > maxFiles) throw new Error(`${out.length} fichiers à envoyer : au-delà de la limite de ${maxFiles} fichiers de Pages.`);
  return out.sort();
}

/** Upload buckets: every file (objects with `size`) in exactly one bucket of ≤ 40 MiB and ≤ 2 000 files. */
export function buckets(files) {
  const out = [];
  let current = [];
  let size = 0;
  for (const f of [...files].sort((a, b) => b.size - a.size)) {
    if (current.length > 0 && (current.length >= MAX_BUCKET_FILES || size + f.size > MAX_BUCKET_SIZE)) {
      out.push(current);
      current = [];
      size = 0;
    }
    current.push(f);
    size += f.size;
  }
  if (current.length > 0) out.push(current);
  return out;
}

/** Deployment manifest: { "/<path>": key }. */
export function pagesManifest(files) {
  return Object.fromEntries(files.map(f => [`/${f.path}`, f.key]));
}

const DEPLOY_HINT = "dist/ n'est pas un build --deploy : lancez « npm run deploy »";

/**
 * null when `distDir` is a `--deploy` artefact of version `pkgVersion` (version.json with that version, a pack
 * fingerprint, an asset count equal to the files of dist/assets/ and > 0, dist/assets/pack.json, dist/sw.js naming
 * `zuma-assets-<fingerprint>`), else a French message.
 */
export function checkArtifact(distDir, pkgVersion) {
  const why = reason => `${DEPLOY_HINT} (${reason}).`;
  const versionFile = path.join(distDir, 'version.json');
  if (!fs.existsSync(distDir)) return why(`${distDir} absent`);
  if (!fs.existsSync(versionFile)) return why('version.json absent : build public ou --local');
  let info;
  try { info = JSON.parse(fs.readFileSync(versionFile, 'utf8')); } catch { return why('version.json illisible'); }
  if (info.version !== pkgVersion) return why(`version ${info.version} au lieu de ${pkgVersion}`);
  if (!info.assetsHash) return why('empreinte du pack absente');
  if (!fs.existsSync(path.join(distDir, 'assets', 'pack.json'))) return why('assets/pack.json absent');
  const count = fs.existsSync(path.join(distDir, 'assets')) ? listFiles(path.join(distDir, 'assets')).length : 0;
  if (!(count > 0) || info.assets !== count) return why(`${count} fichiers dans assets/ au lieu de ${info.assets}`);
  const sw = fs.existsSync(path.join(distDir, 'sw.js')) ? fs.readFileSync(path.join(distDir, 'sw.js'), 'utf8') : '';
  if (!sw.includes(`zuma-assets-${info.assetsHash}`)) return why(`sw.js ne correspond pas au pack ${info.assetsHash}`);
  return null;
}

/** Payload claims of a JWT (no verification: only `exp` and `max_file_count_allowed` are read); {} if unreadable. */
function claims(jwt) {
  try { return JSON.parse(Buffer.from(String(jwt).split('.')[1], 'base64url').toString('utf8')); } catch { return {}; }
}
const expired = jwt => {
  const exp = claims(jwt).exp;
  return typeof exp === 'number' && exp * 1000 <= Date.now() + 5000;
};

/** Error without any trace of the upload JWT (message and stack). */
function scrubbed(message, jwt, status) {
  const clean = jwt ? String(message).split(jwt).join('[masqué]') : String(message);
  const err = new Error(clean);
  err.stack = `Error: ${clean}`;
  if (status) err.status = status;
  return err;
}

/**
 * Uploads `dir` and creates a production deployment on `main`. Returns { id, url, environment, files, uploaded,
 * ready }. Refuses any other branch before the first call; 401 / 403 on /pages/assets/* (with an unexpired JWT)
 * stops with a French message: in the cloud session the proxy may replace the upload authorisation.
 */
export async function uploadAndDeploy(api, { accountId, project, dir, branch, message, log = () => {}, sleep = ms => new Promise(r => setTimeout(r, ms)) }) {
  if (branch !== 'main') throw new Error(`branche « ${branch ?? ''} » refusée : le déploiement se fait toujours sur main (jamais d'aperçu).`);
  const base = `/accounts/${accountId}/pages/projects/${project}`;
  let jwt = null;
  const fetchJwt = async () => {
    const res = await api('GET', `${base}/upload-token`);
    if (!res || typeof res.jwt !== 'string') throw new Error("jeton d'envoi Pages absent de la réponse upload-token.");
    jwt = res.jwt;
  };
  await fetchJwt();
  const limit = claims(jwt).max_file_count_allowed;

  const rel = listFiles(dir, { maxFiles: typeof limit === 'number' ? limit : MAX_FILES });
  const files = rel.map(p => {
    const abs = path.join(dir, ...p.split('/'));
    const size = fs.statSync(abs).size;
    return { path: p, abs, size, key: assetKey(fs.readFileSync(abs), path.extname(p).slice(1)), type: contentType(p) };
  });

  /** A call with the upload JWT: reloads an expired JWT, retries transient failures, stops on 401 / 403. */
  const assetCall = async (p, body, attempts = UPLOAD_ATTEMPTS) => {
    for (let attempt = 1; ; attempt++) {
      if (expired(jwt)) await fetchJwt();
      try {
        return await api('POST', p, { body, bearer: jwt });
      } catch (e) {
        if (e && (e.status === 401 || e.status === 403)) {
          if (expired(jwt) && attempt < attempts) continue;
          throw scrubbed(`${p} : ${e.status} — le proxy a remplacé l'autorisation d'envoi ? (déployer depuis le Mac avec CLOUDFLARE_API_TOKEN)`, jwt, e.status);
        }
        if (attempt >= attempts) throw scrubbed(`${p} : échec après ${attempts} tentatives (${e && e.message})`, jwt, e && e.status);
        await sleep(2 ** (attempt - 1) * 1000);
      }
    }
  };

  const allKeys = files.map(f => f.key);
  const missing = new Set(await assetCall('/pages/assets/check-missing', { hashes: allKeys }));
  const toSend = files.filter(f => missing.has(f.key));
  const queue = buckets(toSend);
  log(`fichiers : ${files.length}, à envoyer : ${toSend.length} en ${queue.length} lot(s)`);
  const workers = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
    while (queue.length > 0) {
      const bucket = queue.shift();
      const payload = bucket.map(f => ({ key: f.key, value: fs.readFileSync(f.abs).toString('base64'), metadata: { contentType: f.type }, base64: true }));
      await assetCall('/pages/assets/upload', payload);
    }
  });
  await Promise.all(workers);
  try {
    await assetCall('/pages/assets/upsert-hashes', { hashes: allKeys }, 2);
  } catch (e) {
    log(`avertissement : mise à jour des empreintes refusée (${e.message}) ; le prochain envoi sera seulement plus long.`);
  }

  const form = new FormData();
  form.append('manifest', JSON.stringify(pagesManifest(files)));
  form.append('branch', 'main');
  form.append('commit_message', message ?? '');
  form.append('commit_dirty', 'true');
  const created = await api('POST', `${base}/deployments`, { form });
  let dep = created;
  let ready = false;
  for (let i = 0; i < STATUS_ATTEMPTS; i++) {
    if (i > 0) await sleep(STATUS_WAIT_MS);
    dep = await api('GET', `${base}/deployments/${created.id}`);
    const stage = dep.latest_stage ?? {};
    if (stage.status === 'failure' || stage.status === 'canceled') throw new Error(`déploiement ${created.id} : échec de l'étape ${stage.name}.`);
    if (stage.name === 'deploy' && stage.status === 'success') { ready = true; break; }
  }
  if (!ready) log(`déploiement ${created.id} encore en cours après ${STATUS_ATTEMPTS} relectures.`);
  return { id: created.id, url: dep.url ?? created.url, environment: dep.environment ?? created.environment, files: files.length, uploaded: toSend.length, ready };
}
