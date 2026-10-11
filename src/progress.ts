/**
 * Adventure progression and application state (research 06 Q2–Q4, D-01..D-04, D-10, D-11).
 *
 * Pure rules, tested under Node: no DOM, no storage global, no engine. The presentation (main.ts, plans 06-03 /
 * 06-04) asks this module where a won level leads, which temple dialogue to show, how the high-score table changes,
 * and which screen comes next; it performs the returned effects itself.
 *
 * Original references: ShowAdventureScreen(resume, stageDone) 0x44f180; end of a stage / credits 0x44f530 (stage
 * index ≥ 12 → ending); next level saved after a win 0x41d325; temple index = stage / 3 at 0x4317ec–0x43180e (five
 * cases: the four temples and the final « Espace » stage).
 */

/** A run at the start of a level: stage / level 0-based, score and lives at that moment. */
export interface RunState { stage: number; level: number; score: number; lives: number }

export type WinRoute =
  | { kind: 'next-level'; run: RunState }
  | { kind: 'stage-done'; run: RunState; completed: number; temple: 1 | 2 | 3 | 4 | null }
  | { kind: 'final'; temple: 5 };

/** Stage index from which the original shows the ending instead of the adventure screen (0x44f530: stage ≥ 12). */
const FINAL_STAGE_INDEX = 12;

/** Integer in [lo, hi]; a non-finite or non-number value gives `lo`. */
function progressIndex(v: unknown, lo: number, hi: number): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return lo;
  return Math.max(lo, Math.min(hi, Math.floor(v)));
}

/**
 * Temple whose last stage is `completed`: 2 → 1, 5 → 2, 8 → 3, 11 → 4 (temple index = stage / 3, 0x4317ec–0x43180e);
 * the last stage of the progression (or any stage index ≥ 12, final in the original) → 5; otherwise null.
 */
export function templeAfter(completed: number, stageCount: number): 1 | 2 | 3 | 4 | 5 | null {
  if (typeof completed !== 'number' || !Number.isFinite(completed) || completed < 0) return null;
  const stage = Math.floor(completed);
  if (stage >= FINAL_STAGE_INDEX || stage >= stageCount - 1) return 5;
  if ((stage + 1) % 3 !== 0) return null;
  return ((stage + 1) / 3) as 1 | 2 | 3 | 4;
}

/**
 * Where a won level leads. `sizes` = levels per stage (pack.data.stages[i].levels.length); `score` / `lives` = values at
 * the end of the won level. Inside a stage the next level follows without any screen (the original board chains them);
 * the last level of a stage leads to the adventure screen with the next door opening (0x44f180(0, 1)), after the god
 * dialogue when it closes a temple; the last stage leads to the final dialogue and the ending (0x44f530), never back
 * to 1-1. Positions are bounded (non-finite → 0). Without stages (`sizes` empty: procedural levels) the levels follow
 * one another endlessly.
 */
export function afterWin(run: RunState, score: number, lives: number, sizes: readonly number[]): WinRoute {
  if (sizes.length === 0) {
    return { kind: 'next-level', run: { stage: 0, level: progressIndex(run.level, 0, Number.MAX_SAFE_INTEGER) + 1, score, lives } };
  }
  const stage = progressIndex(run.stage, 0, sizes.length - 1);
  const level = progressIndex(run.level, 0, Math.max(0, sizes[stage] - 1));
  if (level + 1 < sizes[stage]) return { kind: 'next-level', run: { stage, level: level + 1, score, lives } };
  const temple = templeAfter(stage, sizes.length);
  if (temple === 5) return { kind: 'final', temple: 5 };
  return { kind: 'stage-done', run: { stage: stage + 1, level: 0, score, lives }, completed: stage, temple };
}

/** Doors of the adventure screen: stages 1–12, three per temple (0x449cb2–0x449e57). */
export const DOOR_COUNT = 12;

/** Temple of the door image ADVDOOR{temple}{letter}: stage 0..11 → ⌊stage / 3⌋ + 1 (bounded). */
export function doorTemple(stage: number): 1 | 2 | 3 | 4 {
  return (Math.floor(progressIndex(stage, 0, DOOR_COUNT - 1) / 3) + 1) as 1 | 2 | 3 | 4;
}

/** Letter of the door image ADVDOOR{temple}{letter}: 'ABC'[stage % 3] (bounded). */
export function doorLetter(stage: number): 'A' | 'B' | 'C' {
  return (['A', 'B', 'C'] as const)[progressIndex(stage, 0, DOOR_COUNT - 1) % 3];
}

/**
 * Message key shown under the doors, one per door, in the push order of 0x4422a0–0x442400 (research A2, MEDIUM):
 * index = min(stage, 11).
 */
export const DOOR_MESSAGES: readonly string[] = [
  'DO_YOU_DARE_ENTER_THE_ANCIENT_RUINS',
  'THE_2ND_LEVEL_OF_THE_TEMPLE_AWAITS',
  'WILL_YOU_DESCEND_TO_THE_THIRD_LEVEL',
  'YOU_HAVE_UNCOVERED_A_HIDDEN_DOOR',
  'THE_GOLDEN_SECRETS_OF_ZUMA_AWAIT_YOU',
  'DO_YOU_DARE_ENTER_THE_LAST_CHAMBER',
  'ANOTHER_LOST_TEMPLE',
  'CAN_YOU_FULFILL_THE_PROPHECY_?',
  'THE_LAST_STAGE_?',
  'RUINED_TEMPLE_RISES',
  'THE_FINAL_SECRET',
  'ENTER_THE_RUINS',
];

/**
 * God dialogue after each temple (TransitionMgr 0x430320–0x431b10): god text keys shown in order, then the frog's
 * reply = [ribbit key, translation key], used by the presentation as the button label. Text ↔ temple mapping follows
 * the order of the strings (research A3, ASSUMED); temple 5 is the final « Espace » stage.
 */
export const GOD_LINES: Readonly<Record<1 | 2 | 3 | 4 | 5, { god: readonly string[]; reply: readonly [string, string] }>> = {
  1: { god: ['INTERLOPER_OF_PUNY'], reply: ['RIBBIT', 'I_BEG_TO_DIFFER'] },
  2: { god: ['I_SEE_WHAT'], reply: ['RIBBIT', 'NEVER_GIVE_UP'] },
  3: { god: ['NOT_POSSIBLE_TO_BELIEVE'], reply: ['RIBBIT', 'FULFILL_THE_PROPHECY'] },
  4: { god: ['FINAL_TEMPLE_STRUCK', 'WE_COME_FROM_STAR'], reply: ['RIBBIT_?', 'IN_SPACE'] },
  5: { god: ['EXCELLENT_WORK_FROG_ONE'], reply: ['RIBBIT_!', 'WERD'] },
};

/**
 * Temple names 1..4 (string keys tested for existence by the original, 0x403e60). QUETZAL_QUATL and POPO_POYOLLI are
 * absent from the French pack (research Pitfall 9): their fallbacks take the form of TEMPLE_OF_ZUKULKAN (hypothesis).
 */
export const TEMPLE_NAMES: readonly { key: string; fallback: string }[] = [
  { key: 'TEMPLE_OF_ZUKULKAN', fallback: 'TEMPLE DE ZUKULKAN' },
  { key: 'QUETZAL_QUATL', fallback: 'TEMPLE DE QUETZAL QUATL' },
  { key: 'POPO_POYOLLI', fallback: 'TEMPLE DE POPO POYOLLI' },
  { key: 'SECRET_SHRINE_OF_ZUMA', fallback: 'TEMPLE SECRET DE ZUMA' },
];

// ------------------------------------------------------------------ high scores (research Q4)

/** One high-score entry: the profile name, the score and the level reached (D-04); `date` ISO YYYY-MM-DD or ''. */
export interface HighScore { name: string; score: number; stage: number; level: number; date: string }

/** Stored as `{ adventure: HighScore[] }`, the key of the original adventure list (0x428170). */
export const HIGHSCORE_KEY = 'zuma.highscores.v1';
/** Entries kept per list (0x427d8d: cmp …, 0xa, then truncation 0x415010(list, 10)). */
export const HIGHSCORE_MAX = 10;
/** Name used when no profile exists (D-04). */
const DEFAULT_PLAYER = 'Joueur';

/**
 * Demonstration entries of a fresh table: the thresholds of the original defaults (0x426f20: 10 000, 5 000 and 1 000
 * points) under names chosen for this project — the original names are never copied (T-06-07). A fresh copy per call.
 */
export function defaultScores(): HighScore[] {
  return [
    { name: 'Zuma', score: 10000, stage: 0, level: 0, date: '' },
    { name: 'Grenouille', score: 5000, stage: 0, level: 0, date: '' },
    { name: 'Têtard', score: 1000, stage: 0, level: 0, date: '' },
  ];
}

/**
 * Sorted insertion (0x416bc0, score descending; a new entry goes after the existing equal scores) then truncation to
 * HIGHSCORE_MAX (0x415010), as the manager 0x427d60 does. Returns a new list and the 0-based rank of the entry, or null
 * when it fell out. Never mutates `list`.
 */
export function insertScore(list: readonly HighScore[], entry: HighScore): { list: HighScore[]; rank: number | null } {
  const out = list.map(e => ({ ...e }));
  let at = out.findIndex(e => e.score < entry.score);
  if (at < 0) at = out.length;
  out.splice(at, 0, { ...entry });
  const kept = out.slice(0, HIGHSCORE_MAX);
  return { list: kept, rank: at < HIGHSCORE_MAX ? at : null };
}

/** Parses JSON without ever throwing: undefined on any error. */
function progressParse(raw: string | null): unknown {
  if (typeof raw !== 'string' || raw === '') return undefined;
  try {
    return JSON.parse(raw) as unknown;
  } catch {
    return undefined;
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isSafeInteger(v) && v >= 0;

/**
 * Defensive read of the stored table (T-06-04): null / corrupt / wrong shape → defaultScores(); an empty stored list
 * stays empty. Entries need a string name (sanitised, empty → « Joueur ») and a finite non-negative integer score;
 * stage / level are bounded to 0..99 and the date kept when it is a string of at most 10 characters. Sorted (stable),
 * at most HIGHSCORE_MAX.
 */
export function parseScores(raw: string | null): HighScore[] {
  const data = progressParse(raw);
  if (!isRecord(data) || !Array.isArray(data.adventure)) return defaultScores();
  const list: HighScore[] = [];
  for (const e of data.adventure as unknown[]) {
    if (!isRecord(e) || typeof e.name !== 'string' || !isCount(e.score)) continue;
    list.push({
      name: sanitizeName(e.name) ?? DEFAULT_PLAYER,
      score: e.score,
      stage: progressIndex(e.stage, 0, 99),
      level: progressIndex(e.level, 0, 99),
      date: typeof e.date === 'string' && e.date.length <= 10 ? e.date : '',
    });
  }
  return list.sort((a, b) => b.score - a.score).slice(0, HIGHSCORE_MAX);
}

// ------------------------------------------------------------------ profile and saved run (PROG-02)

/** Local player profile: name typed once at the first launch (0x44a8b0), highest unlocked stage index. */
export interface Profile { name: string; maxStage: number }
export const PROFILE_KEY = 'zuma.profile.v1';
/** Longest profile name kept (T-06-05). */
const NAME_MAX = 16;
/** Printable characters only: letters, marks, digits, punctuation, symbols and the plain space. */
const NAME_CHAR = /[\p{L}\p{M}\p{N}\p{P}\p{S} ]/u;

/**
 * Profile name (T-06-05): whitespace runs become one space, control / format / other non-printable characters are
 * dropped, trimmed, at most 16 characters (code points, never a broken surrogate); empty or not a string → null. The
 * result is only ever drawn on the canvas, never injected into the DOM.
 */
export function sanitizeName(raw: unknown): string | null {
  if (typeof raw !== 'string') return null;
  const kept = Array.from(raw.replace(/\s+/gu, ' ')).filter(c => NAME_CHAR.test(c)).join('');
  const name = Array.from(kept.replace(/ {2,}/g, ' ').trim()).slice(0, NAME_MAX).join('').trim();
  return name === '' ? null : name;
}

/** Defensive read of the profile: a valid name is required; maxStage bounded to 0..12 (non-finite → 0). */
export function parseProfile(raw: string | null): Profile | null {
  const data = progressParse(raw);
  if (!isRecord(data)) return null;
  const name = sanitizeName(data.name);
  if (name === null) return null;
  return { name, maxStage: progressIndex(data.maxStage, 0, FINAL_STAGE_INDEX) };
}

/** Saved run: the game at the start of its current level (RunState JSON). */
export const SAVE_KEY = 'zuma.save.v1';

/**
 * Defensive read of the saved run (T-06-04): null when absent, corrupt, outside the stage sizes, with lives outside
 * 1..99 or a negative / non-finite / non-integer score; always null without stages (procedural levels).
 */
export function parseSave(raw: string | null, sizes: readonly number[]): RunState | null {
  if (sizes.length === 0) return null;
  const data = progressParse(raw);
  if (!isRecord(data)) return null;
  const { stage, level, score, lives } = data;
  if (!isCount(stage) || stage >= sizes.length) return null;
  if (!isCount(level) || level >= sizes[stage]) return null;
  if (!isCount(score)) return null;
  if (!isCount(lives) || lives < 1 || lives > 99) return null;
  return { stage, level, score, lives };
}

// ------------------------------------------------------------------ storage (injected)

/** The subset of the Web Storage API this module needs; the caller passes the browser storage (or null). */
export interface StorageLike { getItem(key: string): string | null; setItem(key: string, value: string): void; removeItem(key: string): void }

/** Reads a stored string (T-06-06): missing storage or a throwing call → null, never an exception. */
export function readJson(storage: StorageLike | null, key: string): string | null {
  if (!storage) return null;
  try {
    const v = storage.getItem(key);
    return typeof v === 'string' ? v : null;
  } catch {
    return null;
  }
}

/** Writes `value` as JSON, or removes the key when `value` is null (T-06-06): false when it could not, never throws. */
export function writeJson(storage: StorageLike | null, key: string, value: unknown): boolean {
  if (!storage) return false;
  try {
    if (value === null) storage.removeItem(key);
    else storage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}
