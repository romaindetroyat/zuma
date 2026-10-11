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
