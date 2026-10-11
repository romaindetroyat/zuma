/**
 * Private hosting of the full game on Cloudflare Pages behind Cloudflare Access (R2.0.20, plan 05-16, D-42, D-43).
 *
 * Modes:
 *   node tools/deploy.mjs                  provision (idempotent) + deploy dist/ on `main` + verify
 *   node tools/deploy.mjs --plan           GET only: prints « actions prévues : N » and one « - <action> » per action
 *   node tools/deploy.mjs --verify         Access configuration through the API, then HTTP: 0 protected, 1 exposed,
 *                                          2 hosts unreachable from here (the HTTP proof is then done in a browser)
 *   node tools/deploy.mjs --rollback-plan  GET only: prints the removal steps (Pages project first, Access next);
 *                                          nothing is ever deleted by this tool
 *
 * Authentication: in the cloud session the egress proxy injects the API token on api.cloudflare.com (no header is
 * sent); elsewhere CLOUDFLARE_API_TOKEN (and CLOUDFLARE_ACCOUNT_ID with several accounts) is read from the environment.
 * Private configuration: private_assets/deploy.json = { "project": "zuma", "allow": [addresses], "pinIdpApps": [names] }
 * (git-ignored; no address, account id or team name lives in the repository).
 *
 * Guarantees: every step reads before writing and reads back after; an existing object that differs is reported as a
 * conflict and never rewritten; the Access applications exist and are read back before any content is uploaded; the
 * deployment always targets `main` (never a preview); the upload JWT, the token and the account id never reach the
 * log (`redact`). The only change ever made to an existing object is D-43: existing Access apps listed in
 * `pinIdpApps`, whose `allowed_idps` is empty, are pinned to the current identity providers before the One-time PIN
 * provider is added, so they keep exactly their current login method (reversible: put `[]` back).
 */
import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { checkArtifact, uploadAndDeploy } from './pagesupload.mjs';

const API = 'https://api.cloudflare.com/client/v4';
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const SESSION = '730h';
const APP_NAME = 'Zuma';
const ALLOW_POLICY = 'Zuma — joueurs';
const BYPASS_NAME = 'Zuma — fichiers publics';
const OTP = { name: 'One-time PIN', type: 'onetimepin', config: {} };
const ACTION_ORDER = ['create-project', 'pin-idp', 'add-otp', 'create-allow-policy', 'create-allow-app', 'create-bypass-policy', 'create-bypass-app'];
const LABELS = {
  'create-project': 'projet Pages',
  'pin-idp': 'fournisseur imposé (D-43)',
  'add-otp': 'méthode « One-time PIN »',
  'create-allow-policy': `politique « ${ALLOW_POLICY} »`,
  'create-allow-app': `application « ${APP_NAME} »`,
  'create-bypass-policy': `politique « ${BYPASS_NAME} »`,
  'create-bypass-app': `application « ${BYPASS_NAME} »`,
};

// ------------------------------------------------------------ pure helpers

/** Masks JWTs, Authorization values and hex identifiers of 32+ digits (account id, AUD), keeping the last 4 chars. */
export function redact(text) {
  const keep = v => `[masqué]${v.slice(-4)}`;
  return String(text)
    .replace(/eyJ[A-Za-z0-9_-]*\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]*/g, keep)
    .replace(/(Authorization:\s*)(?:Bearer\s+)?([^\s,;"']+)/gi, (_, h, v) => h + keep(v))
    .replace(/\b[0-9a-fA-F]{32,}\b/g, keep);
}

/** True for a 301 / 302 / 303 / 307 / 308 whose Location host is exactly the Access team domain. */
export function isAccessRedirect(status, location, authDomain) {
  if (![301, 302, 303, 307, 308].includes(status) || !location) return false;
  try { return new URL(location).host === authDomain; } catch { return false; }
}

const norm = u => String(u).replace(/\/+$/, '').toLowerCase();
/** Every host / path an Access app covers (destinations, plus the older domain / self_hosted_domains forms). */
const uris = app => new Set([...(app.destinations ?? []).map(d => d.uri), app.domain, ...(app.self_hosted_domains ?? [])].filter(Boolean).map(norm));
const sameSet = (a, b) => a.length === b.length && [...a].sort().join('\n') === [...b].sort().join('\n');
const policyIds = app => (app.policies ?? []).map(p => (typeof p === 'string' ? p : p.id));
/** JSON with sorted object keys: GET responses may order fields differently after a PUT. */
const canonical = v => JSON.stringify(v, (_, x) => (x && typeof x === 'object' && !Array.isArray(x) ? Object.fromEntries(Object.keys(x).sort().map(k => [k, x[k]])) : x));
const emailsOf = allow => [...new Set(allow.map(e => String(e).trim()).filter(Boolean))];

/** Differences between a reusable allow policy and « exactly these addresses, nothing else » (no address printed). */
function allowPolicyDiffs(p, emails) {
  const out = [];
  if (p.decision !== 'allow') out.push(`décision « ${p.decision} » au lieu de « allow »`);
  const inc = p.include ?? [];
  const onlyEmails = inc.every(r => r && Object.keys(r).length === 1 && r.email && typeof r.email.email === 'string');
  if (!onlyEmails) out.push('include contient autre chose que des règles e-mail');
  else if (!sameSet(inc.map(r => r.email.email.toLowerCase()), emails.map(e => e.toLowerCase()))) {
    out.push(`include : ${inc.length} adresse(s), différentes de celles de private_assets/deploy.json (${emails.length})`);
  }
  if ((p.exclude ?? []).length) out.push('exclude non vide');
  if ((p.require ?? []).length) out.push('require non vide');
  return out;
}

function bypassPolicyDiffs(p) {
  const out = [];
  if (p.decision !== 'bypass') out.push(`décision « ${p.decision} » au lieu de « bypass »`);
  const inc = p.include ?? [];
  if (!(inc.length === 1 && inc[0] && Object.keys(inc[0]).length === 1 && inc[0].everyone)) out.push('include différent de « everyone »');
  if ((p.exclude ?? []).length || (p.require ?? []).length) out.push('exclude / require non vides');
  return out;
}

/**
 * Pure provisioning plan from the GET responses: { actions, conflict }. Actions, in order: create-project,
 * pin-idp (D-43, one per listed app, only while the One-time PIN provider is absent), add-otp, create-allow-policy,
 * create-allow-app, create-bypass-policy, create-bypass-app. Any existing object that differs → conflict and no action.
 */
export function planProvision(state, { project, allow, host, pinIdpApps = null }) {
  const conflict = [];
  const byKind = Object.fromEntries(ACTION_ORDER.map(k => [k, []]));
  const h = norm(host);
  const pub = `${h}/public`;
  const apps = state.apps ?? [];
  const idps = state.idps ?? [];
  const policies = state.policies ?? [];
  const emails = emailsOf(allow ?? []);

  if (!state.project) byKind['create-project'].push({ kind: 'create-project' });
  else if (state.project.production_branch !== 'main') {
    conflict.push(`projet Pages « ${project} » : branche de production « ${state.project.production_branch} » au lieu de « main »`);
  }

  const onHost = app => [...uris(app)].some(u => u === h || u === `*.${h}` || u.startsWith(`${h}/`) || u.startsWith(`*.${h}/`));
  const otp = idps.find(i => i.type === 'onetimepin');
  if (!otp) {
    // D-43: an app with allowed_idps [] accepts every provider of the organisation, so adding the One-time PIN would
    // change its login. Listed apps are pinned to the current providers first; an unlisted one stops the run.
    const current = idps.map(i => i.id);
    const others = apps.filter(a => !onHost(a));
    const empty = others.filter(a => (a.allowed_idps ?? []).length === 0);
    const listed = pinIdpApps ?? [];
    for (const a of empty) {
      if (!listed.includes(a.name)) conflict.push(`application Access « ${a.name} » sans fournisseur imposé : la méthode One-time PIN s'y ajouterait ; listez-la dans private_assets/deploy.json (pinIdpApps) pour lui garder sa connexion actuelle`);
    }
    for (const name of listed) {
      const found = others.filter(a => a.name === name);
      if (found.length !== 1) { conflict.push(`pinIdpApps : application « ${name} » ${found.length ? 'en plusieurs exemplaires' : 'introuvable'}`); continue; }
      const app = found[0];
      const now = app.allowed_idps ?? [];
      if (now.length === 0) {
        if (current.length === 0) conflict.push(`pinIdpApps : aucun fournisseur d'identité à imposer à « ${name} »`);
        else byKind['pin-idp'].push({ kind: 'pin-idp', id: app.id, name, idps: current });
      } else if (!sameSet(now, current)) {
        conflict.push(`pinIdpApps : « ${name} » a déjà allowed_idps = [${now.join(', ')}] (attendu [] ou [${current.join(', ')}])`);
      }
    }
    byKind['add-otp'].push({ kind: 'add-otp' });
  }

  const allowPols = policies.filter(p => p.name === ALLOW_POLICY);
  if (allowPols.length === 0) byKind['create-allow-policy'].push({ kind: 'create-allow-policy' });
  else if (allowPols.length > 1) conflict.push(`plusieurs politiques « ${ALLOW_POLICY} »`);
  else for (const d of allowPolicyDiffs(allowPols[0], emails)) conflict.push(`politique « ${ALLOW_POLICY} » : ${d}`);

  const mains = apps.filter(a => { const u = uris(a); return u.has(h) || u.has(`*.${h}`); });
  if (mains.length === 0) byKind['create-allow-app'].push({ kind: 'create-allow-app' });
  else if (mains.length > 1) conflict.push(`plusieurs applications Access couvrent ${h}`);
  else {
    const app = mains[0];
    const tag = `application « ${app.name} »`;
    if (!sameSet([...uris(app)], [h, `*.${h}`])) conflict.push(`${tag} : destinations [${[...uris(app)].join(', ')}] au lieu de [${h}, *.${h}]`);
    if (app.session_duration !== SESSION) conflict.push(`${tag} : session ${app.session_duration} au lieu de ${SESSION}`);
    if (!otp || !sameSet(app.allowed_idps ?? [], [otp.id])) conflict.push(`${tag} : allowed_idps sans l'OTP seul`);
    const ids = policyIds(app);
    if (!(ids.length === 1 && allowPols.length === 1 && ids[0] === allowPols[0].id)) conflict.push(`${tag} : politique différente de « ${ALLOW_POLICY} » seule`);
  }

  const bypassPols = policies.filter(p => p.name === BYPASS_NAME);
  if (bypassPols.length === 0) byKind['create-bypass-policy'].push({ kind: 'create-bypass-policy' });
  else if (bypassPols.length > 1) conflict.push(`plusieurs politiques « ${BYPASS_NAME} »`);
  else for (const d of bypassPolicyDiffs(bypassPols[0])) conflict.push(`politique « ${BYPASS_NAME} » : ${d}`);

  for (const a of apps) {
    for (const u of uris(a)) {
      if ((u.startsWith(`${h}/`) || u.startsWith(`*.${h}/`)) && u !== pub) conflict.push(`application « ${a.name} » sur ${u} : seul ${pub} est attendu (Bypass)`);
    }
  }
  const byps = apps.filter(a => uris(a).has(pub));
  if (byps.length === 0) byKind['create-bypass-app'].push({ kind: 'create-bypass-app' });
  else if (byps.length > 1) conflict.push(`plusieurs applications Access sur ${pub}`);
  else {
    const app = byps[0];
    if (!sameSet([...uris(app)], [pub])) conflict.push(`application « ${app.name} » : destinations [${[...uris(app)].join(', ')}] au lieu de [${pub}]`);
    const ids = policyIds(app);
    if (!(ids.length === 1 && bypassPols.length === 1 && ids[0] === bypassPols[0].id)) conflict.push(`application « ${app.name} » : politique différente de « ${BYPASS_NAME} » seule`);
  }

  if (conflict.length) return { actions: [], conflict };
  return { actions: ACTION_ORDER.flatMap(k => byKind[k]), conflict: [] };
}

// ------------------------------------------------------------ API layer

/**
 * `api(method, path, { body, form, bearer })` on the Cloudflare API v4: returns `result`, throws an Error with
 * `status` (message passed through `redact`). Authorization is sent only with `bearer` (upload JWT) or `token`
 * (CLOUDFLARE_API_TOKEN outside the cloud session); otherwise the session proxy adds it. Headers are never logged.
 */
export function makeApi({ fetch = globalThis.fetch, token = null } = {}) {
  return async (method, p, { body, form, bearer } = {}) => {
    const headers = { Accept: 'application/json' };
    const auth = bearer ?? token;
    if (auth) headers.Authorization = `Bearer ${auth}`;
    let payload;
    if (form) payload = form;
    else if (body !== undefined) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
    let res;
    try {
      res = await fetch(API + p, { method, headers, body: payload });
    } catch (e) {
      throw Object.assign(new Error(redact(`${method} ${p} : réseau indisponible (${e?.cause?.message ?? e?.message})`)), { status: 0 });
    }
    const json = await res.json().catch(() => null);
    if (!res.ok || !json || json.success === false) {
      const errs = (json?.errors ?? []).map(x => `${x.code} ${x.message}`).join(' ; ') || res.statusText;
      throw Object.assign(new Error(redact(`${method} ${p} : ${res.status} ${errs}`)), { status: res.status });
    }
    return json.result;
  };
}

/** Token permission most likely missing for a refused write on `p`. */
function permissionFor(p) {
  if (p.includes('/pages/')) return 'Cloudflare Pages : Edit';
  if (p.includes('/access/identity_providers')) return 'Access: Organizations, Identity Providers, and Groups : Edit';
  if (p.includes('/access/')) return 'Access: Apps and Policies : Edit';
  return 'inconnue';
}

// ------------------------------------------------------------ run

/** Private configuration, or { error } (French). */
function readConfig(root) {
  const file = path.join(root, 'private_assets', 'deploy.json');
  const hint = 'private_assets/deploy.json absent ou incomplet : créez { "project": "zuma", "allow": ["votre adresse"] } (dossier ignoré par Git).';
  let cfg;
  try { cfg = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { return { error: hint }; }
  const allow = Array.isArray(cfg.allow) ? emailsOf(cfg.allow) : [];
  if (allow.length === 0 || !allow.every(e => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))) return { error: hint };
  if (typeof cfg.project !== 'string' || !/^[a-z0-9][a-z0-9-]{0,57}$/.test(cfg.project)) return { error: `${hint} (nom de projet invalide)` };
  if (cfg.pinIdpApps !== undefined && !(Array.isArray(cfg.pinIdpApps) && cfg.pinIdpApps.every(n => typeof n === 'string'))) return { error: `${hint} (pinIdpApps : liste de noms)` };
  return { project: cfg.project, allow, pinIdpApps: cfg.pinIdpApps ?? null };
}

const hostOf = (project, name) => {
  const sd = project?.subdomain;
  if (!sd) return `${name}.pages.dev`;
  return sd.endsWith('.pages.dev') ? sd : `${sd}.pages.dev`;
};

/** Runs one mode; resolves to the exit code. Dependencies are injected (tests: simulated API and fetch). */
export async function run(argv, deps = {}) {
  const {
    api, fetch = globalThis.fetch, env = process.env, root = ROOT,
    sleep = ms => new Promise(r => setTimeout(r, ms)),
  } = deps;
  const out = deps.log ?? (m => console.log(m));
  const log = m => out(redact(m));
  const known = ['--plan', '--verify', '--rollback-plan'];
  const unknown = argv.filter(a => !known.includes(a));
  const modes = argv.filter(a => known.includes(a));
  if (unknown.length || modes.length > 1) {
    log(`usage : node tools/deploy.mjs [--plan | --verify | --rollback-plan] (option inconnue : ${unknown.join(' ') || modes.join(' ')})`);
    return 1;
  }
  const mode = { '--plan': 'plan', '--verify': 'verify', '--rollback-plan': 'rollback' }[modes[0]] ?? 'deploy';
  const started = Date.now();

  const cfg = readConfig(root);
  if (cfg.error) { log(cfg.error); return 1; }
  let version;
  try { version = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version; } catch { log('package.json illisible.'); return 1; }
  const dist = path.join(root, 'dist');
  const artefactError = checkArtifact(dist, version);
  if (mode === 'deploy' && artefactError) { log(artefactError); return 1; }

  /** A write: a refusal names the token permission most likely missing. */
  const write = async (method, p, body) => {
    try {
      return await api(method, p, { body });
    } catch (e) {
      if (e && (e.status === 401 || e.status === 403)) {
        throw new Error(`${e.message} — écriture refusée : permission du jeton probablement manquante « ${permissionFor(p)} » ; rien d'autre n'a été tenté.`);
      }
      throw e;
    }
  };

  try {
    // Preflight: token, account, Zero Trust organisation.
    let verified;
    try { verified = await api('GET', '/user/tokens/verify'); } catch (e) { verified = null; log(`jeton : ${e.message}`); }
    if (!verified || verified.status !== 'active') {
      log("jeton Cloudflare absent, expiré ou inactif : dans la session cloud, le proxy l'injecte ; ailleurs, définissez CLOUDFLARE_API_TOKEN.");
      return 1;
    }
    let account = env.CLOUDFLARE_ACCOUNT_ID || null;
    if (!account) {
      const accounts = await api('GET', '/accounts');
      if (!Array.isArray(accounts) || accounts.length !== 1) {
        log(`${Array.isArray(accounts) ? accounts.length : 0} comptes visibles : définissez CLOUDFLARE_ACCOUNT_ID.`);
        return 1;
      }
      account = accounts[0].id;
      log(`compte : ${accounts[0].name} (${account})`);
    } else log(`compte : ${account} (CLOUDFLARE_ACCOUNT_ID)`);
    const A = `/accounts/${account}`;
    const org = await api('GET', `${A}/access/organizations`);
    const team = org?.auth_domain;
    if (!team) { log('organisation Zero Trust absente : créez-la dans le tableau de bord (Zero Trust).'); return 1; }
    log(`organisation Access : ${team}`);

    const readState = async () => {
      let project = null;
      try { project = await api('GET', `${A}/pages/projects/${cfg.project}`); } catch (e) { if (e.status !== 404) throw e; }
      const idps = await api('GET', `${A}/access/identity_providers`);
      const policies = await api('GET', `${A}/access/policies`);
      const apps = await api('GET', `${A}/access/apps`);
      return { project, idps: idps ?? [], policies: policies ?? [], apps: apps ?? [] };
    };
    const plan = state => planProvision(state, { project: cfg.project, allow: cfg.allow, host: hostOf(state.project, cfg.project), pinIdpApps: cfg.pinIdpApps });
    const printConflicts = conflict => {
      log(`conflits : ${conflict.length} (rien n'est réécrit)`);
      for (const c of conflict) log(`! ${c}`);
    };

    if (mode === 'plan') {
      const state = await readState();
      const host = hostOf(state.project, cfg.project);
      log(`sous-domaine : ${host}${state.project ? '' : ' (supposé : projet absent)'}`);
      log(`artefact : ${artefactError ?? 'build --deploy prêt'}`);
      const p = plan(state);
      if (p.conflict.length) { printConflicts(p.conflict); return 1; }
      log(`actions prévues : ${p.actions.length}`);
      for (const a of p.actions) log(`- ${a.kind}${a.kind === 'pin-idp' ? ` ${a.name}` : ''}`);
      return 0;
    }

    if (mode === 'rollback') return await rollbackPlan({ readState, cfg, log });
    if (mode === 'verify') return await verify({ readState, plan, cfg, team, fetch, log });

    // Provisioning: one action at a time, each one read back before the next.
    const done = new Set();
    let last = null;
    let state;
    for (let i = 0; ; i++) {
      state = await readState();
      const p = plan(state);
      if (p.conflict.length) { printConflicts(p.conflict); return 1; }
      if (p.actions.length === 0) break;
      const act = p.actions[0];
      const key = `${act.kind}:${act.id ?? ''}`;
      if (key === last || i > 30) { log(`étape ${act.kind} : effet non constaté à la relecture ; arrêt.`); return 1; }
      last = key;
      await apply(act, { A, state, cfg, host: hostOf(state.project, cfg.project), api, write, log });
      done.add(act.kind);
      if (act.kind !== 'pin-idp') log(`créé : ${LABELS[act.kind]}`);
    }
    for (const kind of ACTION_ORDER) if (kind !== 'pin-idp' && !done.has(kind)) log(`déjà présent : ${LABELS[kind]}`);
    const host = hostOf(state.project, cfg.project);
    const main = state.apps.find(a => uris(a).has(norm(host)) && uris(a).has(`*.${norm(host)}`));
    if (!main) { log(`application « ${APP_NAME} » non relue sur ${host} : aucun contenu envoyé.`); return 1; }
    log(`Access relu : « ${main.name} » couvre ${host} et *.${host} ; « ${BYPASS_NAME} » couvre ${host}/public`);

    // Content: always the production branch.
    const info = JSON.parse(fs.readFileSync(path.join(dist, 'version.json'), 'utf8'));
    const res = await uploadAndDeploy(api, { accountId: account, project: cfg.project, dir: dist, branch: 'main', message: `R${version} ${info.build}`, log, sleep });
    if (res.environment !== 'production') {
      log(`ALERTE : déploiement ${res.id} en environnement « ${res.environment} » au lieu de « production » : vérifiez le projet avant toute autre action.`);
      return 1;
    }
    log(`URL de production : https://${host}`);
    log(`URL du déploiement : ${res.url}`);
    log(`fichiers : ${res.files}, envoyés : ${res.uploaded}, empreinte du pack : ${info.assetsHash}, état : ${res.ready ? 'en ligne' : 'en cours'}`);
    log(`durée : ${Math.round((Date.now() - started) / 1000)} s`);
    return await verify({ readState, plan, cfg, team, fetch, log });
  } catch (e) {
    log(`erreur : ${e && e.message}`);
    return 1;
  }
}

/** Executes one provisioning action (bodies aligned on the GET shape of an existing Access app). */
async function apply(act, { A, state, cfg, host, api, write, log }) {
  const otp = () => state.idps.find(i => i.type === 'onetimepin');
  const pol = name => state.policies.find(p => p.name === name);
  switch (act.kind) {
    case 'create-project':
      return write('POST', `${A}/pages/projects`, { name: cfg.project, production_branch: 'main' });
    case 'pin-idp': {
      const before = await api('GET', `${A}/access/apps/${act.id}`);
      if ((before.allowed_idps ?? []).length !== 0) throw new Error(`« ${act.name} » : allowed_idps n'est plus vide à la relecture ; arrêt.`);
      const { id: _id, uid: _uid, aud: _aud, created_at: _c, updated_at: _u, self_hosted_domains: _s, policies, ...rest } = before;
      const body = { ...rest, allowed_idps: act.idps, policies: (policies ?? []).map(p => ({ id: p.id, precedence: p.precedence })) };
      await write('PUT', `${A}/access/apps/${act.id}`, body);
      const after = await api('GET', `${A}/access/apps/${act.id}`);
      const strip = a => canonical({ ...a, allowed_idps: null, updated_at: null });
      log(`D-43 : « ${act.name} » allowed_idps [] → [${act.idps.join(', ')}] (valeur précédente : [] ; retour : remettre [] par PUT /accounts/{compte}/access/apps/${act.id})`);
      if (strip(after) !== strip(before) || !sameSet(after.allowed_idps ?? [], act.idps)) {
        throw new Error(`« ${act.name} » : la relecture diffère de l'état précédent au-delà de allowed_idps ; arrêt (état précédent consigné ci-dessus).`);
      }
      return after;
    }
    case 'add-otp':
      return write('POST', `${A}/access/identity_providers`, OTP);
    case 'create-allow-policy':
      return write('POST', `${A}/access/policies`, {
        name: ALLOW_POLICY, decision: 'allow', include: cfg.allow.map(email => ({ email: { email } })), exclude: [], require: [], session_duration: SESSION,
      });
    case 'create-allow-app':
      return write('POST', `${A}/access/apps`, {
        type: 'self_hosted', name: APP_NAME, domain: host,
        destinations: [{ type: 'public', uri: host }, { type: 'public', uri: `*.${host}` }],
        session_duration: SESSION, allowed_idps: [otp().id], auto_redirect_to_identity: true, app_launcher_visible: false,
        policies: [{ id: pol(ALLOW_POLICY).id, precedence: 1 }],
      });
    case 'create-bypass-policy':
      return write('POST', `${A}/access/policies`, { name: BYPASS_NAME, decision: 'bypass', include: [{ everyone: {} }], exclude: [], require: [] });
    case 'create-bypass-app':
      return write('POST', `${A}/access/apps`, {
        type: 'self_hosted', name: BYPASS_NAME, domain: `${host}/public`, destinations: [{ type: 'public', uri: `${host}/public` }],
        app_launcher_visible: false, policies: [{ id: pol(BYPASS_NAME).id, precedence: 1 }],
      });
    default:
      throw new Error(`action inconnue ${act.kind}`);
  }
}

/** API configuration, then HTTP from here: 0 protected, 1 exposed or non-conforming, 2 unreachable from the session. */
async function verify({ readState, plan, cfg, team, fetch, log }) {
  const state = await readState();
  const host = hostOf(state.project, cfg.project);
  const p = plan(state);
  let bad = 0;
  if (p.conflict.length || p.actions.length) {
    bad++;
    log('configuration Access NON conforme :');
    for (const c of p.conflict) log(`! ${c}`);
    for (const a of p.actions) log(`! manquant : ${LABELS[a.kind]}${a.name ? ` ${a.name}` : ''}`);
  } else {
    log(`configuration Access conforme : « ${APP_NAME} » sur ${host} et *.${host}, politique « ${ALLOW_POLICY} » (${cfg.allow.length} adresse(s)), One-time PIN seul, session ${SESSION} ; « ${BYPASS_NAME} » sur ${host}/public uniquement`);
  }
  const base = `https://${host}`;
  const deployment = state.project?.latest_deployment?.url ?? state.project?.canonical_deployment?.url ?? null;
  const protectedUrls = ['/', '/index.html', '/sw.js', '/assets/pack.json'].map(x => base + x);
  if (deployment) protectedUrls.push(`${norm(deployment)}/`);
  else log('aucun déploiement relu : URL propre au déploiement non vérifiée');
  let exposed = 0;
  let unreachable = 0;
  const get = async url => {
    try { return await fetch(url, { redirect: 'manual' }); } catch (e) {
      unreachable++;
      log(`injoignable depuis la session : ${url} (${e?.cause?.message ?? e?.message})`);
      return null;
    }
  };
  for (const url of protectedUrls) {
    const res = await get(url);
    if (!res) continue;
    if (isAccessRedirect(res.status, res.headers.get('location'), team)) log(`protégé : ${url} → connexion Access`);
    else { exposed++; log(`EXPOSÉ : ${url} → ${res.status} sans session (redirection Access attendue)`); }
  }
  const manifest = await get(`${base}/public/manifest.webmanifest`);
  if (manifest) {
    if (manifest.status === 200) log(`public (Bypass) : ${base}/public/manifest.webmanifest → 200`);
    else log(`ATTENTION : ${base}/public/manifest.webmanifest → ${manifest.status} (Bypass /public inopérant : installation compromise)`);
  }
  for (const x of ['/public/..%2Fassets/pack.json', '/public/%2e%2e/assets/pack.json']) {
    const url = base + x;
    const res = await get(url);
    if (!res) continue;
    let json = false;
    if (res.status === 200) { try { JSON.parse(await res.text()); json = true; } catch { json = false; } }
    if (json) { exposed++; log(`EXPOSÉ : ${url} → 200 JSON (traversée de /public)`); } else log(`traversée refusée : ${url} → ${res.status}`);
  }
  if (bad || exposed) { log(`résultat : 1 (${exposed} ressource(s) exposée(s), configuration ${bad ? 'non conforme' : 'conforme'})`); return 1; }
  if (unreachable) {
    log(`résultat : 2 (configuration conforme ; ${unreachable} requête(s) injoignable(s) depuis la session : preuve HTTP à faire en navigation privée)`);
    return 2;
  }
  log('résultat : 0 (protection prouvée en HTTP)');
  return 0;
}

/** Prints the removal steps (nothing is called but GET): Pages project first so the pack is never left unprotected. */
async function rollbackPlan({ readState, cfg, log }) {
  const state = await readState();
  const host = hostOf(state.project, cfg.project);
  const h = norm(host);
  const zuma = state.apps.filter(a => [...uris(a)].some(u => u === h || u === `*.${h}` || u.startsWith(`${h}/`)));
  const pols = state.policies.filter(p => p.name === ALLOW_POLICY || p.name === BYPASS_NAME);
  const otp = state.idps.find(i => i.type === 'onetimepin');
  const pinned = (cfg.pinIdpApps ?? []).join(', ') || 'aucune';
  log("plan de retrait (rien n'est exécuté ; ordre : projet Pages d'abord, Access ensuite, pour qu'aucun instant ne laisse le pack sans protection) :");
  log(`1. supprimer le projet Pages (contenu retiré d'abord) : DELETE /accounts/{compte}/pages/projects/${cfg.project}${state.project ? '' : ' (déjà absent)'} — tableau de bord : Workers & Pages › ${cfg.project} › Settings › Delete project`);
  log(`2. supprimer l'application principale et l'application Bypass : ${zuma.map(a => `DELETE /accounts/{compte}/access/apps/${a.id} (« ${a.name} »)`).join(' ; ') || 'aucune trouvée'} — tableau de bord : Zero Trust › Access › Applications › ${APP_NAME} › Delete, puis « ${BYPASS_NAME} »`);
  log(`3. supprimer les politiques « ${ALLOW_POLICY} » / « ${BYPASS_NAME} » si app_count = 0 : ${pols.map(p => `DELETE /accounts/{compte}/access/policies/${p.id} (« ${p.name} », app_count actuel ${p.app_count ?? '?'})`).join(' ; ') || 'aucune trouvée'}`);
  log(`4. garder la méthode « One-time PIN » (facultatif : la retirer) : ${otp ? `DELETE /accounts/{compte}/access/identity_providers/${otp.id}` : 'absente'} — Zero Trust › Integrations › Identity providers`);
  log(`5. D-43, seulement après le retrait de la méthode One-time PIN (facultatif) : remettre allowed_idps = [] sur ${pinned} : PUT /accounts/{compte}/access/apps/<id> avec le corps relu par GET, seul allowed_idps changeant`);
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const proxy = process.env.HTTPS_PROXY || process.env.https_proxy;
  if (proxy && !process.env.NODE_USE_ENV_PROXY) {
    // Node's fetch honours HTTPS_PROXY only with NODE_USE_ENV_PROXY: relaunch once with it.
    const child = spawnSync(process.execPath, ['--disable-warning=UNDICI-EHPA', fileURLToPath(import.meta.url), ...process.argv.slice(2)], {
      stdio: 'inherit', env: { ...process.env, NODE_USE_ENV_PROXY: '1' },
    });
    process.exit(child.status ?? 1);
  }
  const api = makeApi({ token: process.env.CLOUDFLARE_API_TOKEN || null });
  run(process.argv.slice(2), { api }).then(code => { process.exitCode = code; });
}
