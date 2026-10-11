/**
 * Shared records of the hosted build (phase 6.1, 06.1-CONTEXT D-02..D-10): client rules, pure and tested under Node.
 *
 * Two scopes (D-02): « Tous les joueurs » (`shared`, common to every allowed address) and « Mes records » (`mine`, per
 * Access identity). Data (D-03): the 10 best adventure scores of each scope and the best time of each level (the
 * shared one with its holder's first name, the personal one). The device storage stays the truth of the device (D-07):
 * `zuma.highscores.v1` and `zuma.best.<id>` are still written by main.ts; this module only describes the last server
 * copy, the queue of pending sends and the one-time import of the existing local records (D-08), all in
 * `zuma.records.v1`. The worker contract (GET / POST `api/records`, same bounds) lives in `tools/recordsapi.mjs`.
 *
 * No DOM, no storage, no page address and no global network call here: the caller passes everything in. Names received from
 * the server are untrusted data: bounded, sanitised and only ever drawn on the canvas. The client never sends a name
 * (D-04): the server stamps the first name from the Access identity.
 */

import { defaultScores, type HighScore } from './progress.js';

export const RECORDS_KEY = 'zuma.records.v1';

/**
 * Bounds shared with the worker (tools/recordsapi.mjs RECORDS_LIMITS; equality locked by tests/r222-api). Regexes as
 * source strings. D-10: the server only checks bounds (trusted guests, no anti-cheat).
 */
export const RECORD_BOUNDS = {
  scoreMax: 99999999, stageMax: 99, levelMax: 99,
  secondsMin: 1, secondsMax: 3600,
  levelId: '^[a-z0-9-]{1,40}$', sid: '^[0-9a-f]{16}$', day: '^(\\d{4}-\\d{2}-\\d{2})?$',
  scoresPerPost: 10, timesPerPost: 40, listMax: 10, nameMax: 20, bodyMax: 4096,
} as const;

export type RecordScope = 'shared' | 'mine';

/** Labels of the « Tous » / « Moi » switch (capitals: drawn with the bitmap fonts of the pack). */
export const RECORD_SCOPE_LABEL: Readonly<Record<RecordScope, string>> = { shared: 'TOUS', mine: 'MOI' };

export interface RecordScore { name: string; score: number; stage: number; level: number; day: string }
export interface SharedTime { seconds: number; name: string }

/** Body of GET /api/records and of every POST answer (plan 06.1-02). */
export interface RecordsState {
  shared: { scores: RecordScore[]; times: Record<string, SharedTime> };
  mine: { scores: RecordScore[]; times: Record<string, number> };
}

/** A score waiting to be sent; `id` (16 hex digits) lets the server ignore a resend after a lost answer. */
export interface PendingScore { id: string; score: number; stage: number; level: number; day: string }

/** POST body: numbers, a level id and a random id only — never a name (D-04). */
export interface RecordsPost { scores: PendingScore[]; times: Array<{ level: string; seconds: number }> }

export interface RecordsStore {
  /** Last server copy (offline display), null before the first successful exchange. */
  cache: RecordsState | null;
  pending: { scores: PendingScore[]; times: Record<string, number> };
  /** D-08 done on this device. */
  migrated: boolean;
}

const RECORDS_LEVEL_RE = new RegExp(RECORD_BOUNDS.levelId);
const RECORDS_SID_RE = new RegExp(RECORD_BOUNDS.sid);
const RECORDS_DAY_RE = new RegExp(RECORD_BOUNDS.day);
/** Name of a record whose holder has no first name on the server (D-04). */
const RECORDS_DEFAULT_NAME = 'Joueur';
/** Printable characters only (same filter as sanitizeName in progress.ts). */
const RECORDS_NAME_CHAR = /[\p{L}\p{M}\p{N}\p{P}\p{S} ]/u;

export function emptyRecordsStore(): RecordsStore {
  return { cache: null, pending: { scores: [], times: {} }, migrated: false };
}

const recordsIsObject = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const recordsIsInt = (v: unknown, lo: number, hi: number): v is number =>
  typeof v === 'number' && Number.isInteger(v) && v >= lo && v <= hi;
const recordsIsScore = (v: unknown): v is number => recordsIsInt(v, 0, RECORD_BOUNDS.scoreMax);
const recordsIsSeconds = (v: unknown): v is number => recordsIsInt(v, RECORD_BOUNDS.secondsMin, RECORD_BOUNDS.secondsMax);
const recordsIsLevel = (v: unknown): v is string => typeof v === 'string' && RECORDS_LEVEL_RE.test(v);
const recordsIsDay = (v: unknown): v is string => typeof v === 'string' && RECORDS_DAY_RE.test(v);
const recordsIsSid = (v: unknown): v is string => typeof v === 'string' && RECORDS_SID_RE.test(v);

/** Own entry of a times object (never an inherited Object.prototype member such as `constructor`). */
function recordsOwn<T>(times: Readonly<Record<string, T>>, level: string): T | undefined {
  return Object.hasOwn(times, level) ? times[level] : undefined;
}

/** True when the score entry fits the server bounds (score, stage, level, day). */
function recordsValidEntry(e: { score: unknown; stage: unknown; level: unknown; day: unknown }): boolean {
  return recordsIsScore(e.score) && recordsIsInt(e.stage, 0, RECORD_BOUNDS.stageMax)
    && recordsIsInt(e.level, 0, RECORD_BOUNDS.levelMax) && recordsIsDay(e.day);
}

/** Name received from the server: printable characters, whitespace runs folded, ≤ 20 code points; empty → « Joueur ». */
function recordsName(raw: unknown): string {
  if (typeof raw !== 'string') return RECORDS_DEFAULT_NAME;
  const kept = Array.from(raw.replace(/\s+/gu, ' ')).filter(c => RECORDS_NAME_CHAR.test(c)).join('');
  const name = Array.from(kept.replace(/ {2,}/g, ' ').trim()).slice(0, RECORD_BOUNDS.nameMax).join('').trim();
  return name === '' ? RECORDS_DEFAULT_NAME : name;
}

/** Score descending, stable (the earlier first on ties, as insertScore), at most `max`. */
function recordsSorted<T extends { score: number }>(list: readonly T[], max: number): T[] {
  return list.map((e, i) => ({ e, i })).sort((a, b) => b.e.score - a.e.score || a.i - b.i).slice(0, max).map(x => x.e);
}

/** Level id as sent to the server: bestTimeKey(id) without the « zuma.best. » prefix. */
export function recordLevelId(levelId: string): string {
  return String(levelId).toLowerCase().replace(/[^a-z0-9-]/g, '-');
}

/** Queues a score (invalid → the same store object); keeps the 10 best pending (score desc, the earlier first on ties). Never mutates. */
export function queueScore(store: RecordsStore, entry: { score: number; stage: number; level: number; day: string }, id: string): RecordsStore {
  if (!recordsIsSid(id) || !recordsIsObject(entry) || !recordsValidEntry(entry)) return store;
  if (store.pending.scores.some(e => e.id === id)) return store;
  const item: PendingScore = { id, score: entry.score, stage: entry.stage, level: entry.level, day: entry.day };
  const scores = recordsSorted([...store.pending.scores.map(e => ({ ...e })), item], RECORD_BOUNDS.listMax);
  if (!scores.some(e => e.id === id && e.score === item.score)) return store;
  return { ...store, pending: { scores, times: { ...store.pending.times } } };
}

/** Queues a level time when valid and better than the one pending for that level (else the same store object). */
export function queueTime(store: RecordsStore, level: string, seconds: number): RecordsStore {
  if (!recordsIsLevel(level) || !recordsIsSeconds(seconds)) return store;
  const pending = recordsOwn(store.pending.times, level);
  if (pending !== undefined && pending <= seconds) return store;
  return { ...store, pending: { scores: store.pending.scores.map(e => ({ ...e })), times: { ...store.pending.times, [level]: seconds } } };
}

/** Next POST body (≤ 10 scores, ≤ 40 times in level order) or null when nothing is pending. */
export function postBody(store: RecordsStore): RecordsPost | null {
  const scores = store.pending.scores.slice(0, RECORD_BOUNDS.scoresPerPost).map(e => ({ ...e }));
  const times = Object.keys(store.pending.times).sort()
    .slice(0, RECORD_BOUNDS.timesPerPost)
    .map(level => ({ level, seconds: store.pending.times[level] }));
  if (scores.length === 0 && times.length === 0) return null;
  return { scores, times };
}

/** Pending items once `sent` is settled: scores removed by id; a time removed when ≥ the sent one (a better one stays). */
function recordsWithout(pending: RecordsStore['pending'], sent: RecordsPost): RecordsStore['pending'] {
  const ids = new Set(sent.scores.map(e => e.id));
  const times: Record<string, number> = {};
  for (const level of Object.keys(pending.times)) {
    const seconds = pending.times[level];
    const done = sent.times.find(t => t.level === level);
    if (done && seconds >= done.seconds) continue;
    times[level] = seconds;
  }
  return { scores: pending.scores.filter(e => !ids.has(e.id)).map(e => ({ ...e })), times };
}

/** After a successful POST: cache = state; sent items removed (see recordsWithout). Applied to the CURRENT store. */
export function afterPost(store: RecordsStore, sent: RecordsPost, state: RecordsState): RecordsStore {
  return { cache: state, pending: recordsWithout(store.pending, sent), migrated: store.migrated };
}

/** After a permanent refusal (400 / 413 / 415): the same removal, cache unchanged. */
export function afterDrop(store: RecordsStore, sent: RecordsPost): RecordsStore {
  return { cache: store.cache, pending: recordsWithout(store.pending, sent), migrated: store.migrated };
}

/** Score list of a server answer: entries out of bounds dropped, names sanitised, invalid day → '', sorted, ≤ 10. */
function recordsScoreList(raw: unknown[]): RecordScore[] {
  const list: RecordScore[] = [];
  for (const e of raw) {
    if (!recordsIsObject(e)) continue;
    const day = recordsIsDay(e.day) ? e.day : '';
    if (!recordsValidEntry({ score: e.score, stage: e.stage, level: e.level, day })) continue;
    list.push({ name: recordsName(e.name), score: e.score as number, stage: e.stage as number, level: e.level as number, day });
  }
  return recordsSorted(list, RECORD_BOUNDS.listMax);
}

/** Times object with every key checked against RECORD_BOUNDS.levelId BEFORE being copied (no __proto__). */
function recordsTimes<T>(raw: Record<string, unknown>, read: (v: unknown) => T | null): Record<string, T> {
  const out: Record<string, T> = {};
  for (const level of Object.keys(raw)) {
    if (!recordsIsLevel(level)) continue;
    const v = read(raw[level]);
    if (v !== null) out[level] = v;
  }
  return out;
}

/** Scope part of an answer: `{ scores: [], times: {} }` required, else null. */
function recordsScope(raw: unknown): { scores: unknown[]; times: Record<string, unknown> } | null {
  if (!recordsIsObject(raw) || !Array.isArray(raw.scores) || !recordsIsObject(raw.times)) return null;
  return { scores: raw.scores, times: raw.times };
}

/**
 * Defensive read of a server answer (already JSON-parsed): null when the shape is wrong; lists ≤ 10 sorted by score
 * desc, names sanitised (≤ 20 code points, empty → « Joueur »), out-of-bounds entries dropped, level keys checked
 * against RECORD_BOUNDS.levelId before being copied (no __proto__).
 */
export function parseRecordsState(data: unknown): RecordsState | null {
  if (!recordsIsObject(data)) return null;
  const shared = recordsScope(data.shared);
  const mine = recordsScope(data.mine);
  if (!shared || !mine) return null;
  return {
    shared: {
      scores: recordsScoreList(shared.scores),
      times: recordsTimes(shared.times, v =>
        recordsIsObject(v) && recordsIsSeconds(v.seconds) ? { seconds: v.seconds, name: recordsName(v.name) } : null),
    },
    mine: {
      scores: recordsScoreList(mine.scores),
      times: recordsTimes(mine.times, v => (recordsIsSeconds(v) ? v : null)),
    },
  };
}

/** Defensive read of zuma.records.v1: null / corrupt / wrong shape → emptyRecordsStore(); every part re-validated. */
export function parseRecordsStore(raw: string | null): RecordsStore {
  let data: unknown;
  try {
    data = typeof raw === 'string' && raw !== '' ? JSON.parse(raw) as unknown : undefined;
  } catch {
    data = undefined;
  }
  const store = emptyRecordsStore();
  if (!recordsIsObject(data)) return store;
  store.cache = parseRecordsState(data.cache);
  store.migrated = data.migrated === true;
  const pending = data.pending;
  if (recordsIsObject(pending)) {
    if (Array.isArray(pending.scores)) {
      const scores: PendingScore[] = [];
      for (const e of pending.scores as unknown[]) {
        if (!recordsIsObject(e) || !recordsIsSid(e.id) || !recordsValidEntry({ score: e.score, stage: e.stage, level: e.level, day: e.day })) continue;
        scores.push({ id: e.id, score: e.score as number, stage: e.stage as number, level: e.level as number, day: e.day as string });
      }
      store.pending.scores = recordsSorted(scores, RECORD_BOUNDS.listMax);
    }
    if (recordsIsObject(pending.times)) store.pending.times = recordsTimes(pending.times, v => (recordsIsSeconds(v) ? v : null));
  }
  return store;
}

// ------------------------------------------------------------------ display views and D-08 import

/** Loopback hosts: `npm run dev` stays local (same list as fetchPlatformName in main.ts). */
const RECORDS_LOOPBACK: readonly string[] = ['localhost', '127.0.0.1', '[::1]', '::1'];

/** True for an entry equal to one of defaultScores() (name, score, date ''). */
export function isDemoScore(entry: HighScore): boolean {
  return entry.date === '' && defaultScores().some(d => d.name === entry.name && d.score === entry.score);
}

/**
 * D-08: local entries named `name` that are not demo entries (score items, in the local order) + the valid local best
 * times (keys already in recordLevelId form). Out-of-bounds values are left out; the result never carries a name.
 */
export function migrationItems(
  local: readonly HighScore[],
  bestTimes: Readonly<Record<string, number>>,
  name: string,
): { scores: Array<{ score: number; stage: number; level: number; day: string }>; times: Record<string, number> } {
  const scores = local
    .filter(e => e.name === name && !isDemoScore(e))
    .map(e => ({ score: e.score, stage: e.stage, level: e.level, day: e.date }))
    .filter(recordsValidEntry);
  const times = recordsTimes(bestTimes, v => (recordsIsSeconds(v) ? v : null));
  return { scores, times };
}

/**
 * Table to draw for `scope` (HighScore shape, date = day): server copy ∪ pending (named `myName`), sorted (server
 * entries first on equal scores, as insertScore), ≤ 10; without a server copy: 'shared' → `local` as is, 'mine' → the
 * local non-demo entries named `myName` (pending scores are already in the local table).
 */
export function scoresView(store: RecordsStore, scope: RecordScope, local: readonly HighScore[], myName: string): HighScore[] {
  if (!store.cache) {
    const rows = scope === 'shared' ? local : local.filter(e => e.name === myName && !isDemoScore(e));
    return rows.map(e => ({ ...e }));
  }
  const server = store.cache[scope].scores.map(e => ({ name: e.name, score: e.score, stage: e.stage, level: e.level, date: e.day }));
  const pending = store.pending.scores.map(e => ({ name: myName, score: e.score, stage: e.stage, level: e.level, date: e.day }));
  return recordsSorted([...server, ...pending], RECORD_BOUNDS.listMax);
}

/**
 * Best time of `level` with its holder, and the personal best when it differs (else null). `local` = this device's
 * best (zuma.best.<id>, the win just made included) or null. Personal = min(server « mine », pending, local); the
 * shared holder keeps the record on a tie.
 */
export function levelRecord(store: RecordsStore, level: string, local: number | null, myName: string): { best: SharedTime | null; personal: number | null } {
  const id = recordLevelId(level);
  const shared = store.cache ? recordsOwn(store.cache.shared.times, id) ?? null : null;
  const mine = [
    store.cache ? recordsOwn(store.cache.mine.times, id) : undefined,
    recordsOwn(store.pending.times, id),
    local,
  ].filter((v): v is number => typeof v === 'number' && Number.isFinite(v) && v > 0);
  const personal = mine.length > 0 ? Math.min(...mine) : null;
  if (personal === null) return { best: shared ? { ...shared } : null, personal: null };
  if (!shared || personal < shared.seconds) return { best: { seconds: personal, name: myName }, personal: null };
  return { best: { ...shared }, personal: personal === shared.seconds ? null : personal };
}

/** 0-based row of the first entry named `name` with `score`, or null. */
export function rankOf(list: readonly HighScore[], name: string, score: number): number | null {
  const at = list.findIndex(e => e.name === name && e.score === score);
  return at < 0 ? null : at;
}

/** Shared records only on the hosted build (D-01): http(s), not a loopback host, pack present. */
export function recordsEnabled(where: { protocol: string; hostname: string; hasPack: boolean }): boolean {
  return (where.protocol === 'http:' || where.protocol === 'https:') && !RECORDS_LOOPBACK.includes(where.hostname) && where.hasPack === true;
}

// ------------------------------------------------------------------ exchange with api/records (D-06, D-07)

/** The subset of a fetch Response this module reads. */
export interface RecordsResponse { ok: boolean; status: number; type?: string; headers: { get(name: string): string | null }; json(): Promise<unknown> }

/** Injected transport: the caller passes the browser fetch (or a test double); `timeoutMs` defaults to 5 000 ms. */
export interface RecordsIo {
  fetch(url: string, init: {
    method: 'GET' | 'POST'; credentials: 'same-origin'; cache: 'no-store'; redirect: 'manual';
    headers: Record<string, string>; body?: string; signal?: AbortSignal;
  }): Promise<RecordsResponse>;
  timeoutMs?: number;
}

export type RecordsExchange = { kind: 'ok'; state: RecordsState } | { kind: 'retry' } | { kind: 'drop' };

/** Same-origin relative path of the worker endpoint (behind Access like the rest of the site). */
const RECORDS_URL = 'api/records';
const RECORDS_TIMEOUT_MS = 5000;
/** Permanent refusals: the send is removed from the queue (bad body, too large, not JSON). */
const RECORDS_DROP_STATUS: readonly number[] = [400, 413, 415];

/** Wire copy of a POST body: only the known numeric / id fields, whatever the caller added (D-04: never a name). */
function recordsWire(body: RecordsPost): RecordsPost {
  return {
    scores: body.scores.map(e => ({ id: e.id, score: e.score, stage: e.stage, level: e.level, day: e.day })),
    times: body.times.map(t => ({ level: t.level, seconds: t.seconds })),
  };
}

/**
 * One request to 'api/records' (GET when body is null, else POST JSON); never rejects. D-07: local first, silent
 * failure, nothing waits on the network longer than `timeoutMs` (the request is aborted then). Classes: 2xx with a
 * valid JSON state → ok; 400 / 413 / 415 → drop; anything else (offline, timeout, 401 / 403 / 404 / 429 / 5xx, the
 * opaque redirect of an expired Access session, unreadable answer) → retry, the queue is kept for later.
 */
export async function exchangeRecords(io: RecordsIo, body: RecordsPost | null): Promise<RecordsExchange> {
  const retry: RecordsExchange = { kind: 'retry' };
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<'timeout'>(resolve => {
    timer = setTimeout(() => {
      controller?.abort();
      resolve('timeout');
    }, io.timeoutMs ?? RECORDS_TIMEOUT_MS);
  });
  try {
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (body) headers['Content-Type'] = 'application/json';
    const res = await Promise.race([
      io.fetch(RECORDS_URL, {
        method: body ? 'POST' : 'GET',
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'manual',
        headers,
        ...(body ? { body: JSON.stringify(recordsWire(body)) } : {}),
        ...(controller ? { signal: controller.signal } : {}),
      }),
      expired,
    ]);
    if (res === 'timeout' || !recordsIsObject(res)) return retry;
    if (res.type === 'opaqueredirect' || typeof res.status !== 'number') return retry;
    if (RECORDS_DROP_STATUS.includes(res.status)) return { kind: 'drop' };
    if (!res.ok || res.status < 200 || res.status >= 300) return retry;
    const type = res.headers.get('content-type') ?? '';
    if (!/^application\/json\b/i.test(type.trim())) return retry;
    const data = await Promise.race([res.json(), expired]);
    if (data === 'timeout') return retry;
    const state = parseRecordsState(data);
    return state ? { kind: 'ok', state } : retry;
  } catch {
    return retry;
  } finally {
    clearTimeout(timer);
  }
}

/** Exchanges per synchronisation (T-061-04): the queue, the D-08 import, one more. */
const RECORDS_SYNC_MAX = 3;

/**
 * One synchronisation: POST the pending items (else GET), apply the answer to the CURRENT store (access.get()) and
 * persist it (access.set); after the first success on this device, queue migrationItems (once, migrated = true, in
 * the same set) and send them. At most 3 exchanges per call. Resolves true when at least one exchange succeeded;
 * never rejects (a throwing storage or migrate ends the call quietly).
 */
export async function syncRecords(
  access: { get(): RecordsStore; set(store: RecordsStore): void },
  io: RecordsIo,
  migrate: () => ReturnType<typeof migrationItems>,
  makeId: () => string,
): Promise<boolean> {
  let success = false;
  try {
    for (let i = 0; i < RECORDS_SYNC_MAX; i++) {
      const body = postBody(access.get());
      const result = await exchangeRecords(io, body);
      if (result.kind === 'retry') break;
      if (result.kind === 'drop') {
        if (!body) break;
        access.set(afterDrop(access.get(), body));
        continue;
      }
      success = true;
      const current = access.get();
      let store = body ? afterPost(current, body, result.state) : { ...current, cache: result.state };
      if (!store.migrated) {
        const items = migrate();
        for (const entry of items.scores) store = queueScore(store, entry, makeId());
        for (const level of Object.keys(items.times)) store = queueTime(store, level, items.times[level]);
        store = { ...store, migrated: true };
      }
      access.set(store);
      if (postBody(store) === null) break;
    }
  } catch {
    // Storage or migration failure: whatever was persisted stays; the next call tries again.
  }
  return success;
}
