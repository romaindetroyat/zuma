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
