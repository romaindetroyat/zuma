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
 * absent from the French pack (research Pitfall 9): the original then draws its own literals « QUETZAL QUATL » and
 * « POPO POYOLLI » (0x550504, 0x5504d0, plan 06-04).
 */
export const TEMPLE_NAMES: readonly { key: string; fallback: string }[] = [
  { key: 'TEMPLE_OF_ZUKULKAN', fallback: 'TEMPLE DE ZUKULKAN' },
  { key: 'QUETZAL_QUATL', fallback: 'QUETZAL QUATL' },
  { key: 'POPO_POYOLLI', fallback: 'POPO POYOLLI' },
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

/**
 * Local player profile: name typed once at the first launch (0x44a8b0), highest unlocked stage index. `source` tells
 * where the name came from: absent = typed on this device (never overwritten automatically), 'platform' = provided by
 * the hosting platform (identity of the private host), 'default' = the « Joueur » fallback.
 */
export interface Profile { name: string; maxStage: number; source?: 'platform' | 'default' }
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
  const profile: Profile = { name, maxStage: progressIndex(data.maxStage, 0, FINAL_STAGE_INDEX) };
  if (data.source === 'platform' || data.source === 'default') profile.source = data.source;
  return profile;
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

// ------------------------------------------------------------------ application state machine (D-01..D-04, D-10, D-11)

export type AppScreen = 'welcome' | 'adventure' | 'level' | 'temple' | 'ending';

export interface AppState {
  screen: AppScreen;
  /** Modal dialogs over the welcome screen. */
  prompt: 'name' | 'continue' | null;
  profile: Profile | null;
  scores: HighScore[];
  /** Current run, saved at every level start; null when none. */
  run: RunState | null;
  /** Selected door / stage on the adventure screen. */
  selected: number;
  /** Door opening animation on arrival (stage index), else null. */
  opening: number | null;
  /** God dialogue shown on the 'temple' screen. */
  temple: 1 | 2 | 3 | 4 | 5 | null;
  ending: { score: number; rank: number | null } | null;
  /** ?level= session: no write effects. */
  review: boolean;
  /** Levels per stage ([] without the pack: procedural levels, no adventure screen). */
  sizes: readonly number[];
  /** CANDIDATE.lives. */
  startLives: number;
}

export type AppEvent =
  | { kind: 'name'; name: string }
  | { kind: 'profile-detected'; name: string }
  | { kind: 'adventure' }
  | { kind: 'continue' } | { kind: 'new-game' }
  | { kind: 'select'; stage: number }
  | { kind: 'play' } | { kind: 'main-menu' }
  | { kind: 'won'; score: number; lives: number; date: string }
  | { kind: 'retry'; lives: number }
  | { kind: 'gameover'; score: number; date: string }
  | { kind: 'leave' }
  | { kind: 'temple-done' } | { kind: 'ending-done' };

export type AppEffect =
  | { kind: 'start-level'; run: RunState }
  | { kind: 'save-run'; run: RunState | null }
  | { kind: 'save-profile'; profile: Profile }
  | { kind: 'save-scores'; scores: HighScore[] }
  /** Shared records (phase 6.1): the presentation queues the entry for api/records on the hosted build. */
  | { kind: 'record-score'; entry: HighScore }
  | { kind: 'sound'; key: 'templecomplete' | 'button' };

type AppStep = { state: AppState; effects: AppEffect[] };

/** Effects that write to the storage (record-score: the shared-records queue): dropped in review sessions (?level=) so the table is never polluted. */
const WRITE_EFFECTS: ReadonlySet<AppEffect['kind']> = new Set(['save-run', 'save-profile', 'save-scores', 'record-score']);

/**
 * Profile after the hosting platform reported `raw` as the player's name: used (sanitised) when there is no profile,
 * or when the stored name is the « Joueur » fallback or an older platform name; a name typed on this device is never
 * replaced. Returns null when nothing changes.
 */
function platformProfile(profile: Profile | null, raw: unknown): Profile | null {
  const name = sanitizeName(raw);
  if (name === null) return null;
  if (profile && profile.source === undefined) return null;
  if (profile && profile.source === 'platform' && profile.name === name) return null;
  return { name, maxStage: profile?.maxStage ?? 0, source: 'platform' };
}

/** Default door: the highest unlocked stage, within the progression. */
function progressDefaultStage(state: Pick<AppState, 'profile' | 'sizes'>): number {
  return progressIndex(state.profile?.maxStage ?? 0, 0, Math.max(0, state.sizes.length - 1));
}

/** Entry submitted at a game over (0x4283c4) or after the final STATS (0x440c6a): the profile name or « Joueur ». */
function progressEntry(state: AppState, run: RunState, score: number, date: string): HighScore {
  return { name: state.profile?.name ?? DEFAULT_PLAYER, score, stage: run.stage, level: run.level, date };
}

/**
 * Boot. A review run (from ?level=) opens its level directly (screen 'level' + start-level, no write effect);
 * otherwise the welcome screen — never a level before the player chooses (D-01) — with the name prompt when there is
 * no profile. `platformName`, when the host provides the player's identity, is used instead of the prompt (see
 * platformProfile) and persisted like a typed name.
 */
export function initialApp(input: {
  profile: Profile | null;
  save: RunState | null;
  scores: HighScore[];
  sizes: readonly number[];
  startLives: number;
  review: RunState | null;
  platformName?: unknown;
}): AppStep {
  const effects: AppEffect[] = [];
  let profile = input.profile;
  const detected = platformProfile(profile, input.platformName);
  if (detected) {
    profile = detected;
    effects.push({ kind: 'save-profile', profile: detected });
  }
  const base = {
    profile,
    scores: input.scores,
    opening: null,
    temple: null,
    ending: null,
    sizes: input.sizes,
    startLives: input.startLives,
  };
  if (input.review) {
    const state: AppState = { ...base, screen: 'level', prompt: null, run: input.review, selected: input.review.stage, review: true };
    effects.push({ kind: 'start-level', run: input.review });
    return { state, effects: effects.filter(e => !WRITE_EFFECTS.has(e.kind)) };
  }
  const state: AppState = {
    ...base,
    screen: 'welcome',
    prompt: profile ? null : 'name',
    run: input.save,
    selected: input.save?.stage ?? progressDefaultStage({ profile, sizes: input.sizes }),
    review: false,
  };
  return { state, effects };
}

/** Starts `run` on the level screen: the run is saved first (level start, 0x41d325), except without stages. */
function progressStart(state: AppState, run: RunState, patch: Partial<AppState> = {}): AppStep {
  const effects: AppEffect[] = state.sizes.length > 0 ? [{ kind: 'save-run', run }] : [];
  effects.push({ kind: 'start-level', run });
  return { state: { ...state, ...patch, screen: 'level', prompt: null, run, opening: null, temple: null }, effects };
}

const isLives = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 1 && v <= 99;

function progressReduce(state: AppState, event: AppEvent): AppStep {
  const same: AppStep = { state, effects: [] };
  const staged = state.sizes.length > 0;
  switch (event.kind) {
    case 'name': {
      // Name dialog OK, first launch or rename from the welcome line (Q4: no name entry at record time).
      if (state.screen !== 'welcome' || state.prompt === 'continue') return same;
      const name = sanitizeName(event.name);
      const profile: Profile = name !== null
        ? { name, maxStage: state.profile?.maxStage ?? 0 }
        : { name: DEFAULT_PLAYER, maxStage: state.profile?.maxStage ?? 0, source: 'default' };
      return { state: { ...state, profile, prompt: null }, effects: [{ kind: 'save-profile', profile }] };
    }
    case 'profile-detected': {
      // Identity reported by the host after boot: any screen; closes a pending name prompt.
      const profile = platformProfile(state.profile, event.name);
      if (!profile) return same;
      const prompt = state.prompt === 'name' ? null : state.prompt;
      return { state: { ...state, profile, prompt }, effects: [{ kind: 'save-profile', profile }] };
    }
    case 'adventure': {
      // Welcome: AVENTURE stone → ShowAdventureScreen(resume = 1, stageDone = 0) 0x44f180; a saved run is offered
      // first (0x44ef40, DO_YOU_WANT_TO_CONTINUE_YOUR_LAST_GAME_?). Without stages: straight to the first level (D-02).
      if (state.screen !== 'welcome' || state.prompt !== null) return same;
      if (!staged) return progressStart(state, { stage: 0, level: 0, score: 0, lives: state.startLives });
      if (state.run) return { state: { ...state, prompt: 'continue' }, effects: [] };
      return { state: { ...state, screen: 'adventure', selected: progressDefaultStage(state), opening: null }, effects: [] };
    }
    case 'continue':
      if (state.prompt !== 'continue' || !state.run) return same;
      return progressStart(state, state.run);
    case 'new-game':
      if (state.prompt !== 'continue') return same;
      return {
        state: { ...state, prompt: null, run: null, screen: 'adventure', selected: progressDefaultStage(state), opening: null },
        effects: [{ kind: 'save-run', run: null }],
      };
    case 'select': {
      // Unlocked doors are clickable (research A5, MEDIUM): stage ≤ maxStage, one of the 12 doors.
      if (state.screen !== 'adventure') return same;
      const stage = event.stage;
      if (typeof stage !== 'number' || !Number.isInteger(stage) || stage < 0 || stage >= DOOR_COUNT) return same;
      if (stage >= state.sizes.length || stage > (state.profile?.maxStage ?? 0) || stage === state.selected) return same;
      return { state: { ...state, selected: stage }, effects: [] };
    }
    case 'play': {
      // JOUER: the run of the selected stage goes on; another door starts a new game there.
      if (state.screen !== 'adventure') return same;
      const run = state.run && state.run.stage === state.selected
        ? state.run
        : { stage: state.selected, level: 0, score: 0, lives: state.startLives };
      return progressStart(state, run);
    }
    case 'main-menu':
      if (state.screen !== 'adventure') return same;
      return { state: { ...state, screen: 'welcome', opening: null }, effects: [] };
    case 'won': {
      if (state.screen !== 'level' || !state.run) return same;
      const route = afterWin(state.run, event.score, event.lives, state.sizes);
      if (route.kind === 'next-level') return progressStart(state, route.run);
      if (route.kind === 'final') {
        // Last stage (0x44f530: stage ≥ 12 → ending): score submitted after the final STATS (0x440c6a), save cleared.
        const entry = progressEntry(state, state.run, event.score, event.date);
        const { list, rank } = insertScore(state.scores, entry);
        return {
          state: { ...state, screen: 'temple', temple: 5, run: null, scores: list, ending: { score: event.score, rank }, opening: null },
          effects: [
            { kind: 'save-scores', scores: list }, { kind: 'record-score', entry },
            { kind: 'save-run', run: null }, { kind: 'sound', key: 'templecomplete' },
          ],
        };
      }
      // Stage done (plateau+0x186, A1): next stage saved (0x41d325), next door unlocked, adventure screen with its
      // opening (0x44f180(0, 1)), after the god dialogue when the stage closes a temple (SOUND_TEMPLE_COMPLETE).
      const next = route.run.stage;
      const unlocked = Math.min(next, state.sizes.length - 1, FINAL_STAGE_INDEX);
      const effects: AppEffect[] = [{ kind: 'save-run', run: route.run }];
      let profile = state.profile;
      if (!profile || profile.maxStage < unlocked) {
        profile = profile ? { ...profile, maxStage: unlocked } : { name: DEFAULT_PLAYER, maxStage: unlocked, source: 'default' };
        effects.push({ kind: 'save-profile', profile });
      }
      if (route.temple === null) {
        return { state: { ...state, screen: 'adventure', run: route.run, profile, selected: next, opening: next }, effects };
      }
      effects.push({ kind: 'sound', key: 'templecomplete' });
      return { state: { ...state, screen: 'temple', temple: route.temple, run: route.run, profile, selected: next, opening: null }, effects };
    }
    case 'retry': {
      // A life lost, lives remain: the same level again with the score of its start, saved.
      if (state.screen !== 'level' || !state.run || !isLives(event.lives)) return same;
      return progressStart(state, { ...state.run, lives: event.lives });
    }
    case 'gameover': {
      // Last life lost (0x4283c4): the score enters the table, the saved run is cleared; the STATS stays on screen.
      if (state.screen !== 'level' || !state.run) return same;
      const entry = progressEntry(state, state.run, event.score, event.date);
      const { list } = insertScore(state.scores, entry);
      return {
        state: { ...state, run: null, scores: list, selected: progressDefaultStage(state) },
        effects: [{ kind: 'save-scores', scores: list }, { kind: 'record-score', entry }, { kind: 'save-run', run: null }],
      };
    }
    case 'leave': {
      // Game-over STATS closed, or « Retour au menu principal » confirmed: adventure screen (0x44f180(0, 0)); a run
      // in progress stays saved at the start of its level. Without stages: welcome screen.
      if (state.screen !== 'level') return same;
      if (!staged) return { state: { ...state, screen: 'welcome', run: null }, effects: [] };
      if (state.run) {
        return { state: { ...state, screen: 'adventure', selected: state.run.stage, opening: null }, effects: [{ kind: 'save-run', run: state.run }] };
      }
      return { state: { ...state, screen: 'adventure', selected: progressDefaultStage(state), opening: null }, effects: [] };
    }
    case 'temple-done': {
      if (state.screen !== 'temple') return same;
      if (state.temple === 5) return { state: { ...state, screen: 'ending', temple: null }, effects: [] };
      const next = state.run ? state.run.stage : progressDefaultStage(state);
      return { state: { ...state, screen: 'adventure', temple: null, selected: next, opening: next }, effects: [] };
    }
    case 'ending-done':
      // End of the ending screen → main menu (0x44b3e0); the run is over.
      if (state.screen !== 'ending') return same;
      return { state: { ...state, screen: 'welcome', run: null, ending: null, opening: null }, effects: [] };
    default:
      return same;
  }
}

/**
 * Pure transition: unknown or out-of-place events return the same state object and no effect; the received state is
 * never mutated. In a review session (?level=) the write effects are dropped (start-level and sounds remain).
 */
export function reduceApp(state: AppState, event: AppEvent): AppStep {
  const next = progressReduce(state, event);
  if (next.state === state) return { state, effects: [] };
  return { state: next.state, effects: state.review ? next.effects.filter(e => !WRITE_EFFECTS.has(e.kind)) : next.effects };
}
