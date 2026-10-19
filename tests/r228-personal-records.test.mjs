// R2.0.28 — records personnels (demande utilisateur : « Il faudrait que les temps records affichés soient les temps des
// joueurs. Pas la peine de mutualiser les records »). Every record shown is the player's own: the STATS RECORD row is
// the player's best time for the board (« mine » on the hosted build, the local best in the standalone) on a single
// line with no holder name and no « MOI » row (the R2.0.21 dialog); the RECORDS plaques of the adventure and ending
// screens show the player's own scores with no « TOUS » / « MOI » label nor toggle. The synchronisation of the
// player's own records through api/records (GET « mine », POST queue, D-08 import) stays, so the same player finds
// the same records on every device; the worker and its database are unchanged (the shared part is no longer shown).
// Demo first names and example.org addresses only.
import test from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import vm from 'node:vm';
import { SCORES_BINDING } from '../tools/recordsapi.mjs';
import { D1_BINDING, generateWorker } from '../tools/d1worker.mjs';
import { fakeScoresD1 } from './fake-scores-d1.mjs';

const R = () => import('../.compiled/records.js');
const S = () => import('../.compiled/statsdialog.js');
const A = () => import('../.compiled/adventure.js');
const P = () => import('../.compiled/progress.js');
const read = file => fs.readFileSync(new URL(`../${file}`, import.meta.url), 'utf8');

const ID = n => n.toString(16).padStart(16, '0');
const rs = (name, score, extra = {}) => ({ name, score, stage: 0, level: 0, day: '', ...extra });
const hs = (name, score, extra = {}) => ({ name, score, stage: 0, level: 0, date: '', ...extra });
const state = (o = {}) => ({
  shared: { scores: [], times: {}, ...(o.shared ?? {}) },
  mine: { scores: [], times: {}, ...(o.mine ?? {}) },
});

// ------------------------------------------------------------ records.ts: personal views only

test('records.js: no « TOUS » / « MOI » scope any more, no shared best time helper', async () => {
  const mod = await R();
  assert.equal(mod.RECORD_SCOPE_LABEL, undefined, 'scope labels removed');
  assert.equal(mod.levelRecord, undefined, 'the shared best time with its holder is no longer computed');
  assert.equal(typeof mod.personalTime, 'function');
  assert.equal(typeof mod.scoresView, 'function');
});

test('personalTime: the player\'s own best of the board = min(server « mine », pending, local); the shared best is ignored', async () => {
  const { personalTime, emptyRecordsStore, queueTime } = await R();
  const s = { ...emptyRecordsStore(), cache: state({ shared: { times: { spiral: { seconds: 60, name: 'Bruno' } } }, mine: { times: { spiral: 75 } } }) };
  assert.equal(personalTime(s, 'spiral', null), 75, 'Bruno holds 60 but Alice sees her own 75');
  assert.equal(personalTime(s, 'spiral', 90), 75);
  assert.equal(personalTime(s, 'spiral', 55), 55, 'the win just made');
  assert.equal(personalTime(queueTime(s, 'spiral', 70), 'spiral', null), 70, 'a pending time counts');
  assert.equal(personalTime(emptyRecordsStore(), 'spiral', 83), 83, 'standalone: the local best');
  assert.equal(personalTime(emptyRecordsStore(), 'spiral', null), null);
  const sharedOnly = { ...emptyRecordsStore(), cache: state({ shared: { times: { claw: { seconds: 40, name: 'Bruno' } } } }) };
  assert.equal(personalTime(sharedOnly, 'claw', null), null, 'another player\'s time is never shown as the record');
  assert.equal(personalTime(s, 'constructor', null), null, 'never an inherited member');
  assert.equal(personalTime(s, 'Spiral', null), 75, 'level id normalised like bestTimeKey');
});

test('scoresView: the player\'s own scores only (server « mine » ∪ pending, under the player\'s name), never the shared table', async () => {
  const { scoresView, emptyRecordsStore, queueScore } = await R();
  const { defaultScores } = await P();
  const cache = state({
    shared: { scores: [rs('Bruno', 9000), rs('Alice', 5000), rs('Bruno', 4000)], times: {} },
    mine: { scores: [rs('Joueur', 5000, { day: '2026-10-10' })], times: {} },
  });
  let s = { ...emptyRecordsStore(), cache };
  s = queueScore(s, { score: 6000, stage: 2, level: 1, day: '2026-10-11' }, ID(1));
  assert.deepEqual(scoresView(s, defaultScores(), 'Alice'), [
    hs('Alice', 6000, { stage: 2, level: 1, date: '2026-10-11' }), hs('Alice', 5000, { date: '2026-10-10' }),
  ], 'own rows carry the player\'s name (the server may have stamped « Joueur »)');
  // Without a server copy: the local non-demo entries of the player (the pending score is already in the local table).
  const local = [hs('Alice', 23000), ...defaultScores(), hs('Bruno', 7000), hs('Alice', 300)];
  const view = scoresView(emptyRecordsStore(), local, 'Alice');
  assert.deepEqual(view, [hs('Alice', 23000), hs('Alice', 300)]);
  view[0].score = 1;
  assert.equal(local[0].score, 23000, 'a copy');
  const full = { ...emptyRecordsStore(), cache: state({ mine: { scores: Array.from({ length: 10 }, (_, i) => rs('Alice', 10000 - i * 100)), times: {} } }) };
  const ten = scoresView(queueScore(full, { score: 9950, stage: 0, level: 0, day: '' }, ID(2)), [], 'Alice');
  assert.equal(ten.length, 10);
  assert.equal(ten[1].score, 9950);
});

// ------------------------------------------------------------ STATS: the R2.0.21 single RECORD line

/** Canvas 2D stand-in recording every call (as in r222-display). */
function recorder() {
  const calls = [];
  const st = { globalCompositeOperation: 'source-over', globalAlpha: 1, fillStyle: '#000', strokeStyle: '#000', font: '10px sans-serif', textAlign: 'left', textBaseline: 'alphabetic', lineWidth: 1, imageSmoothingEnabled: true };
  const stack = [];
  return new Proxy({}, {
    get(_t, prop) {
      if (prop === 'calls') return calls;
      if (prop in st) return st[prop];
      if (prop === 'save') return () => { stack.push({ ...st }); calls.push({ op: 'save' }); };
      if (prop === 'restore') return () => { Object.assign(st, stack.pop() ?? {}); calls.push({ op: 'restore' }); };
      if (prop === 'measureText') return s => ({ width: String(s).length * 8 });
      if (prop === 'createLinearGradient' || prop === 'createRadialGradient') return () => ({ addColorStop() {} });
      return (...args) => { calls.push({ op: prop, args, alpha: st.globalAlpha, fill: st.fillStyle }); };
    },
    set(_t, prop, value) {
      st[prop] = value;
      calls.push({ op: 'set', prop, value });
      return true;
    },
  });
}
const digest = calls => crypto.createHash('sha256').update(JSON.stringify(calls)).digest('hex');
const pic = (name, width, height) => ({ name, width, height });
const fakeFont = (name, perChar = 9.6, cap = 11) => ({
  name, pixelScale: 1, ascent: 14, height: 17, capHeight: cap,
  measure: s => perChar * [...String(s)].length,
  draw(ctx, text, x, y, options = {}) { ctx.calls.push({ op: 'font', font: name, text, x, y, options }); return perChar * [...String(text)].length; },
});
const statsKit = () => ({
  frame: pic('dialogbox', 243, 242), head: pic('godhead', 156, 140), button: pic('dialogbutton', 360, 48),
  fonts: { title: fakeFont('title', 12), text: fakeFont('text'), tip: fakeFont('tip', 7), tipSmall: fakeFont('small', 6) },
  strings: { TIP: 'ASTUCE', BEST_TIME: 'RECORD' }, pixelScale: 1,
});
const statsFixture = { points: '12340', combos: '3', coins: '1', gaps: '2', chain: '14', comboMax: '4', time: '1:23', objective: '1:40', bonus: '+1700', record: '1:23' };
const TIP = 'Tirez sur les pièces pour gagner des points en plus.';
/** R2.0.21 call sequences of composeStatsDialog (captured before 06.1-04, see r222-display). */
const STATS_R221 = {
  revealed10: 'd9c23ac07d6a74c9cca87679be5a11f1a0a0d2f648674a10bf003a3d60b9c534',
  revealed9: '39f08e9be7e822d3ffeddf98d91fa176fc0add18d0bc6a02ba0eff594d2678a7',
};
function composeCalls(compose, options) {
  const ctx = recorder();
  compose(statsKit(), statsFixture, { button: 'normal', tip: TIP, ...options }, { width: 0, height: 0, getContext: () => ctx }, 1);
  return ctx.calls;
}

test('STATS: one RECORD line (the R2.0.21 dialog), no holder name, no « MOI » row, whatever a caller passes', async () => {
  const mod = await S();
  assert.equal(mod.recordLabel, undefined, 'no « 1:23 (Sophie) » label any more');
  assert.equal(mod.layoutRecordRow, undefined, 'no sixth right row');
  assert.equal(digest(composeCalls(mod.composeStatsDialog, { revealed: 10 })), STATS_R221.revealed10);
  assert.equal(digest(composeCalls(mod.composeStatsDialog, { revealed: 9 })), STATS_R221.revealed9);
  const legacy = composeCalls(mod.composeStatsDialog, { revealed: 10, record: { name: 'SOPHIE', personal: '1:30' } });
  assert.equal(digest(legacy), STATS_R221.revealed10, 'an old `record` option draws nothing');
  assert.ok(!legacy.some(c => c.op === 'font' && /SOPHIE|^MOI$/.test(c.text)));
  const src = read('src/statsdialog.ts');
  assert.doesNotMatch(src, /StatsRecordCells|layoutRecordRow|recordLabel|options\.record/);
});

test('STATS values: RECORD = the personal best handed in, else the current time', async () => {
  const { statsValues } = await S();
  const base = { levelScore: 0, combos: 0, coins: 0, gaps: 0, maxStreak: 0, maxCombo: 0, seconds: 83, parTime: 0, timeBonus: 0, won: true, noBonusLabel: '—' };
  assert.equal(statsValues({ ...base, bestSeconds: 75 }).record, '1:15');
  assert.equal(statsValues({ ...base, bestSeconds: null }).record, '1:23');
});

// ------------------------------------------------------------ RECORDS plaques: no scope label, no toggle

const advFont = name => fakeFont(name, 7, 8);
const DOOR_W = [62, 60, 57, 64, 57, 51, 45, 44, 56, 61, 64, 62];
const DOOR_H = [58, 90, 56, 57, 43, 35, 34, 38, 41, 50, 49, 49];
function fakeAdvKit() {
  return {
    sky: pic('advsky', 640, 116), back: pic('advback', 640, 250), title: pic('advtitle', 185, 73), plaque: pic('advhighscore', 184, 65), stage: pic('advstage', 76, 16),
    temples: {
      advtemple1: pic('advtemple1', 640, 292), advtemple2: pic('advtemple2', 228, 208), advtemple2v: pic('advtemple2v', 228, 208), advtemple3: pic('advtemple3', 245, 194),
      advtemple3v: pic('advtemple3v', 245, 194), advtemple4: pic('advtemple4', 291, 249), advmiddle: pic('advmiddle', 640, 185),
    },
    doors: DOOR_W.map((w, i) => pic(`door${i}`, w * 4, DOOR_H[i])),
    doorMasks: null,
    play: pic('play', 291, 39), mainMenu: pic('mainmenu', 375, 42), happyEnding: pic('happyending', 640, 480),
    fonts: { brown: advFont('brown'), message: advFont('message'), score: advFont('score'), number: advFont('number'), huge: advFont('huge'), title: advFont('title') },
    dialog: null, pixelScale: 1,
  };
}
function endingKit() {
  const kit = fakeAdvKit();
  kit.dialog = { frame: pic('dialogbox', 243, 242), head: null, button: pic('dialogbutton', 360, 48), fonts: { title: advFont('t'), text: advFont('x'), tip: null, tipSmall: null }, strings: {}, pixelScale: 1 };
  return kit;
}
const plaqueScores = [{ name: 'Zuma', score: 10000 }, { name: 'Grenouille', score: 5000 }, { name: 'Têtard', score: 1000 }];
const advView = { c: 8, maxStage: 4, selected: 4, hover: 3, button: { hover: 'play', pressed: null }, reveal: null, shake: [0, 0, 0, 0], scores: plaqueScores, strings: null };
const endingScores = Array.from({ length: 10 }, (_, i) => ({ name: `N${i}`, score: 90000 - i * 5000, stage: 12, level: 0, date: '' }));
const endingView = { score: 80000, rank: 2, scores: endingScores, hover: false, pressed: false, strings: { CONGRATULATIONS: 'FÉLICITATIONS !', SCORE: 'Score :' } };
const drawn = (draw, kit, view) => { const ctx = recorder(); draw(ctx, kit, view); return ctx.calls; };
/** R2.0.21 call sequences of drawAdventure / drawEnding (captured before 06.1-04, see r222-display). */
const SCREENS_R221 = {
  adventure: '7776c90274781d78162bcd9805feb66924b574a354b04ea74741077f879c9e74', adventureVector: '41e1745f2db7e5b7caa213f18076179d1c4a035836154ada4195f674637c4b29',
  ending: '3ddb86e84f807764512a51baa908ae4310df9664b2ebcb100f28e4df95888289', endingVector: '1690fa8a29249c68397cc5eda28e9d75eb6e178ff4f47547190026c2ae0e7187',
};

test('RECORDS plaques: the R2.0.21 screens, no « TOUS » / « MOI » label even when a caller passes one; no plaque hit tests', async () => {
  const mod = await A();
  const { drawAdventure, drawEnding } = mod;
  assert.equal(digest(drawn(drawAdventure, fakeAdvKit(), advView)), SCREENS_R221.adventure);
  assert.equal(digest(drawn(drawAdventure, null, advView)), SCREENS_R221.adventureVector);
  assert.equal(digest(drawn(drawEnding, endingKit(), endingView)), SCREENS_R221.ending);
  assert.equal(digest(drawn(drawEnding, null, endingView)), SCREENS_R221.endingVector);
  assert.equal(digest(drawn(drawAdventure, fakeAdvKit(), { ...advView, scope: 'TOUS' })), SCREENS_R221.adventure, 'a scope is never drawn');
  assert.equal(digest(drawn(drawEnding, endingKit(), { ...endingView, scope: 'MOI' })), SCREENS_R221.ending, 'a scope is never drawn');
  assert.equal(mod.ADV_SCOPE, undefined);
  assert.equal(mod.advPlaqueAt, undefined);
  assert.equal(mod.endingPlaqueAt, undefined);
  assert.doesNotMatch(read('src/adventure.ts'), /view\.scope|scope:|PlaqueAt/);
});

// ------------------------------------------------------------ main.ts wiring

const MAIN = read('src/main.ts');

test('main.ts: personal records on screen, no scope state nor toggle, the own-records synchronisation kept', () => {
  for (const gone of ['recordScope', 'toggleRecordScope', 'recordsScopeLabel', 'recordPlaquePressed', 'PlaqueAt(', 'RECORD_SCOPE_LABEL', 'recordLabel(', 'statsRecord', 'levelRecord(', 'StatsRecordCells', 'TOUS']) {
    assert.ok(!MAIN.includes(gone), `main.ts no longer contains ${gone}`);
  }
  for (const kept of [
    'recordsEnabled(', 'syncRecords(', "addEventListener('online'", 'queueScore(', 'queueTime(', 'migrationItems(', "case 'record-score'",
    'personalTime(', 'scoresView(this.records, this.app.scores, this.recordsPlayer())', 'rankOf(',
  ]) {
    assert.ok(MAIN.includes(kept), `main.ts contains ${kept}`);
  }
  assert.match(MAIN, /bestSeconds: personalTime\(/, 'the STATS RECORD is the personal best');
});

// ------------------------------------------------------------ end to end: same player on two devices, another player

const TEAM = 'equipe-test.cloudflareaccess.com';
const ISS = `https://${TEAM}`;
const CERTS = `${ISS}/cdn-cgi/access/certs`;
const AUD = 'c0ffee'.repeat(10) + 'c0de';
const HOST = 'https://zuma-x.pages.dev';
const subtle = globalThis.crypto.subtle;
const RSA = { name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' };
const { privateKey, publicKey } = await subtle.generateKey(RSA, true, ['sign', 'verify']);
const { n, e } = await subtle.exportKey('jwk', publicKey);
const JWKS = { keys: [{ kid: 'k1', kty: 'RSA', alg: 'RS256', use: 'sig', n, e }] };
const b64u = x => Buffer.from(JSON.stringify(x)).toString('base64url');
const ALICE = 'alice@example.org';
const BRUNO = 'bruno@example.org';

async function jwt(email) {
  const t = Math.floor(Date.now() / 1000);
  const head = b64u({ alg: 'RS256', kid: 'k1', typ: 'JWT' });
  const body = b64u({ aud: [AUD], exp: t + 3600, iat: t - 5, nbf: t - 5, iss: ISS, type: 'app', sub: 'u', email });
  const sig = Buffer.from(await subtle.sign('RSASSA-PKCS1-v1_5', privateKey, new TextEncoder().encode(`${head}.${body}`))).toString('base64url');
  return `${head}.${body}.${sig}`;
}

/** The generated worker (unchanged) over fakeScoresD1; `browser(email)` = the RecordsIo of a page of that player. */
function server() {
  const manifest = { '/index.html': { key: 'sha256:00', contentType: 'text/html; charset=utf-8', size: 0 } };
  const source = generateWorker(manifest, { build: '2.0.28+T', access: { team: TEAM, aud: AUD }, players: { [ALICE]: 'Alice', [BRUNO]: 'Bruno' }, levels: ['claw', 'spiral'] });
  const jwksFetch = async url => {
    assert.equal(String(url), CERTS);
    return new Response(JSON.stringify(JWKS), { headers: { 'content-type': 'application/json' } });
  };
  const context = vm.createContext({ Response, Headers, URL, atob, crypto: globalThis.crypto, fetch: jwksFetch, TextEncoder, TextDecoder });
  vm.runInContext(source.replace(/^export default /m, 'globalThis.worker = '), context, { filename: '_worker.js' });
  const env = { [D1_BINDING]: { prepare: () => { throw new Error('content database touched'); } }, [SCORES_BINDING]: fakeScoresD1().binding };
  const browser = email => ({
    timeoutMs: 2000,
    async fetch(url, init) {
      const headers = { ...init.headers, 'cf-access-jwt-assertion': await jwt(email) };
      if (init.method === 'POST') {
        headers.origin = HOST;
        headers['content-length'] = String(Buffer.byteLength(init.body));
      }
      const req = new Request(new URL(url, HOST + '/').href, { method: init.method, headers, body: init.body, signal: init.signal });
      return context.worker.fetch(req, env, {});
    },
  });
  return { browser };
}

async function device() {
  const { RECORDS_KEY, parseRecordsStore } = await R();
  const storage = new Map();
  let store = parseRecordsStore(null);
  const access = { get: () => store, set: s => { store = s; storage.set(RECORDS_KEY, JSON.stringify(s)); } };
  let next = 0;
  return { access, makeId: () => ID(++next), reload: () => parseRecordsStore(storage.get(RECORDS_KEY) ?? null) };
}
const noMigration = () => ({ scores: [], times: {} });

test('bout en bout: Bruno beats Alice\'s time → Alice still sees her own 83 and her own scores; her second device gets the same records', async () => {
  const { syncRecords, queueScore, queueTime, personalTime, scoresView, rankOf } = await R();
  const { browser } = server();
  const phone = await device();
  const tablet = await device();
  const bruno = await device();
  phone.access.set({ ...queueTime(queueScore(phone.access.get(), { score: 5000, stage: 0, level: 2, day: '' }, phone.makeId()), 'spiral', 83), migrated: true });
  assert.equal(await syncRecords(phone.access, browser(ALICE), noMigration, phone.makeId), true);
  bruno.access.set({ ...queueTime(queueScore(bruno.access.get(), { score: 7000, stage: 1, level: 0, day: '' }, bruno.makeId()), 'spiral', 80), migrated: true });
  assert.equal(await syncRecords(bruno.access, browser(BRUNO), noMigration, bruno.makeId), true);
  // Alice's second device: nothing local, one GET of her own records.
  tablet.access.set({ ...tablet.access.get(), migrated: true });
  assert.equal(await syncRecords(tablet.access, browser(ALICE), noMigration, tablet.makeId), true);
  for (const store of [phone.reload(), tablet.reload()]) {
    assert.equal(personalTime(store, 'spiral', null), 83, 'her own time, not Bruno\'s 80');
    const table = scoresView(store, [], 'Alice');
    assert.deepEqual(table.map(r => [r.name, r.score]), [['Alice', 5000]], 'her own scores only');
    assert.equal(rankOf(table, 'Alice', 5000), 0);
  }
  const b = bruno.reload();
  assert.equal(personalTime(b, 'spiral', null), 80);
  assert.equal(personalTime(b, 'claw', null), null);
  assert.deepEqual(scoresView(b, [], 'Bruno').map(r => [r.name, r.score]), [['Bruno', 7000]]);
});
