// R2.0.16 — présentation : alerte, roulement, ZUMA, décompte, STATS (plan 05-06)
// Alerte `warning1` à 600 px avec l'intervalle original et un gain constant (U15, §5) ; roulement binaire
// à gain constant avec fondu (U18, D-17) ; bannière ZUMA (U20, D-16) ; décompte « +100 » + étincelles + pops
// indépendants (U16, §7) ; compte à rebours du bonus de temps dans l'écran STATS (U17, §8) ; couleurs, titre
// doré, interligne et valeurs des STATS épinglées de bout en bout (U19, D-18) ; TEMPS depuis « PARTEZ » (D-13).
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as audio from '../.compiled/audio.js';

const { WARNING_DISTANCE, WARNING_GAIN, warningLevel, warningIntervalAt, warningInterval, warningGain, loopLevels, ROLLING_GAIN, ROLLING_MIN_SPEED, ROLLING_FADE_SECONDS } = audio;
const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);

// ---------------------------------------------------------------- alerte (U15, §5)

test('warningLevel: 0 at 600 px (the original `danger` setting), 1 at the skull, cut while draining', () => {
  assert.equal(WARNING_DISTANCE, 600);
  assert.equal(warningLevel(600, true), 0, 'threshold');
  assert.equal(warningLevel(0, true), 1, 'at the skull');
  assert.equal(warningLevel(300, true), 0.5, 'half-way');
  assert.equal(warningLevel(10, false), 0, 'cut while draining / paused');
  assert.equal(warningLevel(null, true), 0, 'no ball → no warning');
});

test('warningIntervalAt: max(0.1 + 4·rem/600, (rem/11 + 60)/100) s — 4.1 s at 600 px, 0.6 s at the skull, monotone', () => {
  assert.equal(warningIntervalAt(600), 4.1);
  assert.equal(warningIntervalAt(300), 2.1);
  near(warningIntervalAt(100), 0.1 + 4 * 100 / 600, 1e-9, '100 px');
  near(warningIntervalAt(100), 0.7667, 5e-5, '≈ 0.7667 s');
  near(warningIntervalAt(50), (50 / 11 + 60) / 100, 1e-9, 'the trail light term wins near the skull');
  near(warningIntervalAt(50), 0.6455, 5e-5, '≈ 0.6455 s');
  assert.equal(warningIntervalAt(0), 0.6);
  assert.equal(warningIntervalAt(-20), 0.6, 'clamped past the skull');
  assert.equal(warningIntervalAt(900), 4.1, 'clamped at WARNING_DISTANCE');
  assert.equal(warningIntervalAt(NaN), 0.6, 'non-finite → skull');
  // Shrinks as the chain approaches: non-decreasing in the remaining distance, 0..600 by steps of 10.
  let previous = -Infinity;
  for (let rem = 0; rem <= 600; rem += 10) {
    const v = warningIntervalAt(rem);
    assert.ok(v >= previous - 1e-12, `non-decreasing in rem (${rem} px: ${v} < ${previous})`);
    assert.ok(v >= 0.6 && v <= 4.1, 'within [0.6, 4.1]');
    previous = v;
  }
  assert.equal(warningInterval(0), 4.1, 'level 0 = entering the zone');
  assert.equal(warningInterval(1), 0.6, 'level 1 = at the skull');
  assert.equal(warningInterval(0.5), 2.1);
});

test('warningGain is constant (the original does not modulate the volume); FAR / NEAR constants are gone', () => {
  assert.equal(WARNING_GAIN, 1);
  assert.equal(warningGain(0), 1);
  assert.equal(warningGain(1), 1);
  assert.equal(warningGain(), 1);
  for (const name of ['WARNING_GAIN_FAR', 'WARNING_GAIN_NEAR', 'WARNING_INTERVAL_FAR', 'WARNING_INTERVAL_NEAR']) {
    assert.equal(audio[name], undefined, `${name} no longer exported`);
  }
});

// ---------------------------------------------------------------- roulement (U18, D-17)

test('loopLevels: rolling is binary — on above ROLLING_MIN_SPEED while playing, off otherwise', () => {
  // R2.0.18 (D-29): gain 0.35 and a 500 ms linear fade (the original fades 0.02 per update, ≈ 0.5 s, 0x402880).
  assert.equal(ROLLING_GAIN, 0.35);
  assert.equal(ROLLING_MIN_SPEED, 2);
  assert.equal(ROLLING_FADE_SECONDS, 0.5);
  assert.equal(loopLevels({ speed: 0, playing: true }).rolling, 0);
  assert.equal(loopLevels({ speed: 2, playing: true }).rolling, 0, 'threshold is exclusive');
  assert.equal(loopLevels({ speed: 2.01, playing: true }).rolling, 1);
  assert.equal(loopLevels({ speed: 900, playing: true }).rolling, 1);
  assert.equal(loopLevels({ speed: 50, playing: false }).rolling, 0, 'silent when not playing');
  assert.equal(loopLevels({ speed: NaN, playing: true }).rolling, 0, 'non-finite → silent');
  assert.deepEqual(Object.keys(loopLevels({ speed: 50, playing: true })), ['rolling']);
});

test('audio.js: setLoop fades with linearRampToValueAtTime / ROLLING_FADE_SECONDS at pitch 1; main.js no longer feeds feedSpeed', () => {
  const src = fs.readFileSync('.compiled/audio.js', 'utf8');
  const start = src.indexOf('setLoop(key, level)');
  assert.ok(start > 0, 'AudioManager.setLoop compiled');
  const end = src.indexOf('pulse(key, level)', start);
  const body = src.slice(start, end);
  assert.match(body, /linearRampToValueAtTime/, 'ramps (attack and fade) are linear');
  // R2.0.17: the ramp is planned by rampPlan (armed once per target change, deferred-items 05-07); the constants live there.
  assert.match(body, /rampPlan\(/, 'ramp planned by rampPlan');
  const plan = src.slice(src.indexOf('export function rampPlan('), src.indexOf('\n}\n', src.indexOf('export function rampPlan(')));
  assert.match(plan, /ROLLING_FADE_SECONDS/, 'fade-out length is the constant');
  assert.match(plan, /ROLLING_GAIN/, 'the loop plays at ROLLING_GAIN');
  assert.doesNotMatch(body, /playbackRate\.value =/, 'pitch stays at 1');
  assert.doesNotMatch(src, /LOOP_BASE/, 'LOOP_BASE replaced by ROLLING_GAIN');
  const main = fs.readFileSync('.compiled/main.js', 'utf8');
  assert.doesNotMatch(main, /feedSpeed/, 'no feedSpeed in main.js');
  assert.match(main, /loopLevels\(\{ speed: moved \/ seconds, playing \}\)/, 'measured displacement drives the loop');
});

// ---------------------------------------------------------------- ZUMA / décompte (U16, U20, D-16, §7)
import { soundCues, makeSparks } from '../.compiled/feedback.js';

test('cues: the tally step is silent, cleanup-pop plays bonuspop at 0.5 without pitch, zuma / won keep chant4 / chant5', () => {
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup', progress: 0.5 }), [], 'the « +100 » step makes no sound (0x421550)');
  assert.deepEqual(soundCues({ tick: 1, kind: 'cleanup-pop', index: 3, progress: 0.4 }), [{ key: 'bonuspop', gain: 0.5, rate: 1 }]);
  assert.deepEqual(soundCues({ tick: 1, kind: 'zuma', coverage: 0.6, pushback: true }), [{ key: 'zuma', gain: 1, rate: 1 }]);
  assert.equal(soundCues({ tick: 1, kind: 'won' })[0].key, 'levelwin');
  assert.deepEqual(soundCues({ tick: 1, kind: 'clearing', x: 0, y: 0, chain: 0, levelBonus: 10000 }), []);
});

test('makeSparks: 5 white sparkles within ± 10 px of the step, deterministic from (step, tick), no Math.random', () => {
  const burst = makeSparks(100, 200, 3, 500);
  assert.equal(burst.particles.length, 5);
  assert.equal(burst.color, 5, 'white');
  assert.equal(burst.start, 500);
  assert.equal(burst.id, 3);
  for (const p of burst.particles) {
    assert.ok(Math.abs(p.x - 100) <= 10, `|x − 100| ≤ 10 (${p.x})`);
    assert.ok(Math.abs(p.y - 200) <= 10, `|y − 200| ≤ 10 (${p.y})`);
    assert.ok(p.size === 1 || p.size === 2, 'size 1 or 2');
    assert.ok(Number.isFinite(p.vx) && Number.isFinite(p.vy));
  }
  assert.deepEqual(makeSparks(100, 200, 3, 500), burst, 'deterministic');
  assert.notDeepEqual(makeSparks(100, 200, 4, 500).particles, burst.particles, 'another step → other sparkles');
  const src = fs.readFileSync('.compiled/feedback.js', 'utf8');
  const start = src.indexOf('export function makeSparks(');
  assert.ok(start > 0, 'makeSparks compiled');
  const body = src.slice(start, src.indexOf('\n}\n', start));
  assert.doesNotMatch(body, /Math\.random/, 'presentation RNG only (SeededRandom)');
  assert.match(body, /SeededRandom/, 'seeded from step and tick');
});

test('main.js: ZUMA banner, sparkles and « +100 » per tally step, STATS at won, TEMPS from the level clock; render.js pulses the full gauge', () => {
  const main = fs.readFileSync('.compiled/main.js', 'utf8');
  assert.match(main, /'ZUMA !'/, 'built-in banner label (strings.json has no ZUMA key)');
  assert.match(main, /makeSparks\(/, 'sparkles pushed into fx.bursts');
  assert.doesNotMatch(main, /Niveau terminé/, 'D-15 message replaced by the STATS count-up');
  assert.doesNotMatch(main, /Bonus de temps/, 'no separate time bonus announcement');
  assert.doesNotMatch(main, /Videz la chaîne/, 'no sub-line under ZUMA !');
  assert.match(main, /Math\.floor\(engine\.levelTicks \/ engine\.config\.tickHz\)/, 'TEMPS = ⌊levelTicks / tickHz⌋ (D-13)');
  assert.doesNotMatch(main, /engine\.tick \/ engine\.config\.tickHz/, 'the raw tick is not the level clock');
  assert.match(main, /engine\.state === 'won' \? 0 :/, 'the STATS open at won without extra delay (the engine already waited 50 updates)');
  assert.match(main, /'#ffff00'/, 'the « +100 » is yellow (0xffff00)');
  const render = fs.readFileSync('.compiled/render.js', 'utf8');
  assert.equal((render.match(/0\.55 \+ 0\.45 \* Math\.sin\(frame \/ 4\)/g) || []).length, 2, 'gauge pulse amplitude ≥ 0.4 in both HUD branches');
});

// ---------------------------------------------------------------- STATS (U19, D-18, §8)
import { STATS_COLORS, STATS_LAYOUT, STATS_LINE_RATIO, statsRows, bonusCountUp, bonusPopRate, statsValues } from '../.compiled/statsdialog.js';

test('STATS_COLORS: the original colours (0x4525f0) and the gold title multiplier (D-18)', () => {
  assert.deepEqual(STATS_COLORS, { label: '#f5d65b', value: '#fcf4d0', time: '#ffff00', objective: '#ffa500', bonus: '#2aff03', noBonus: '#9dcba2', record: '#fcdc80', title: '#f0c040' });
  assert.equal(STATS_LINE_RATIO, 1.65);
});

test('statsRows: baselines from the line height (1.65 × cap height), right column on the left grid', () => {
  // R2.0.17 (D-20): the right column follows the left grid — TEMPS = POINTS, OBJECTIF = COMBOS, rule in the PIÈCES row,
  // BONUS = SAUTS, RECORD = ENCH. MAX. — instead of the R2.0.12 proportions (0.63 / 1.63 / 1.26 lines).
  const rows = statsRows(19);
  assert.deepEqual(rows.left, [219, 238, 257, 276, 295, 314]);
  assert.deepEqual(rows.right, { time: 219, objective: 238, rule: 250, bonus: 276, record: 295 });
  assert.equal(statsRows(20).left[5], 319);
  assert.equal(statsRows(19, 200).left[0], 200);
  for (const lh of [16, 18, 19, 20]) {
    const r = statsRows(lh);
    assert.equal(r.right.time, r.left[0], `time for ${lh}`);
    assert.equal(r.right.objective, r.left[1], `objective for ${lh}`);
    assert.equal(r.right.rule, r.left[2] - Math.round(0.35 * lh), `rule for ${lh}`);
    assert.equal(r.right.bonus, r.left[3], `bonus for ${lh}`);
    assert.equal(r.right.record, r.left[4], `record for ${lh}`);
    for (const y of r.left) assert.ok(y < STATS_LAYOUT.tip.box.y, `left rows above the tip box (lh ${lh}: ${y})`);
    assert.ok(r.right.record < STATS_LAYOUT.tip.box.y, 'RECORD above the tip box');
  }
  assert.equal(STATS_LAYOUT.left.first, 219);
  assert.equal(STATS_LAYOUT.right.first, 219);
  assert.equal(STATS_LAYOUT.left.baselines, undefined, 'static baselines replaced by statsRows');
  assert.equal(STATS_LAYOUT.right.baselines, undefined);
  assert.equal(STATS_LAYOUT.ok.x + STATS_LAYOUT.ok.w / 2, 320, 'OK centred');
});

test('bonusCountUp: nothing before 1 s, then +100 every 100 ms up to the total (0x440b00)', () => {
  assert.equal(bonusCountUp(1100, 0), 0);
  assert.equal(bonusCountUp(1100, 999), 0);
  assert.equal(bonusCountUp(1100, 1000), 100);
  assert.equal(bonusCountUp(1100, 1099), 100);
  assert.equal(bonusCountUp(1100, 1100), 200);
  assert.equal(bonusCountUp(1100, 2000), 1100);
  assert.equal(bonusCountUp(1100, 99999), 1100);
  assert.equal(bonusCountUp(0, 5000), 0);
  assert.equal(bonusCountUp(250, 1150), 200);
  assert.equal(bonusCountUp(250, 1250), 250, 'last partial step');
  assert.equal(bonusCountUp(-5, 3000), 0);
  assert.equal(bonusCountUp(NaN, 3000), 0);
  assert.equal(bonusCountUp(1100, NaN), 0);
});

test('bonusPopRate: pitch rises from 1 to 1.5 with the shown share of the bonus (hypothesis A5)', () => {
  assert.equal(bonusPopRate(0, 1100), 1);
  assert.equal(bonusPopRate(550, 1100), 1.25);
  assert.equal(bonusPopRate(1100, 1100), 1.5);
  assert.equal(bonusPopRate(100, 0), 1, 'no total → base pitch');
  assert.equal(bonusPopRate(2000, 1100), 1.5, 'clamped');
});

const base = { levelScore: 1230, combos: 2, coins: 3, gaps: 1, maxStreak: 6, maxCombo: 2, seconds: 20, parTime: 25, timeBonus: 1100, won: true, bestSeconds: 20, noBonusLabel: 'PAS DE BONUS' };

test('statsValues: BONUS shows the counted-up share (timeBonusShown), the total by default, the label without bonus', () => {
  assert.equal(statsValues({ ...base, timeBonusShown: 300 }).bonus, '+300');
  assert.equal(statsValues(base).bonus, '+1100');
  assert.equal(statsValues({ ...base, timeBonusShown: 0 }).bonus, '+0', 'the count-up starts at +0');
  assert.equal(statsValues({ ...base, timeBonus: 0 }).bonus, 'PAS DE BONUS');
  assert.equal(statsValues({ ...base, won: false }).bonus, 'PAS DE BONUS');
  assert.equal(statsValues({ ...base, timeBonusShown: 300 }).objective, '25 s');
});

test('statsdialog.js composes the title by multiplication, derives the line height from capHeight, tints « PAS DE BONUS »; bitmapfont.js supports multiply and capHeight', () => {
  const dialog = fs.readFileSync('.compiled/statsdialog.js', 'utf8');
  assert.match(dialog, /multiply: C\.title/, 'gold title');
  assert.match(dialog, /capHeight/, 'line height from the cap height');
  assert.match(dialog, /STATS_LINE_RATIO \* /, 'ratio applied');
  assert.match(dialog, /C\.noBonus/, 'no-bonus tint');
  assert.match(dialog, /statsRows\(/, 'rows computed');
  const font = fs.readFileSync('.compiled/bitmapfont.js', 'utf8');
  assert.match(font, /options\.multiply/, 'DrawOptions.multiply read');
  assert.match(font, /this\.capHeight = /, 'capHeight defined');
  assert.match(font, /\|mult\|/, 'multiplied atlas cached under its own key');
});

// ---------------------------------------------------------------- bout en bout : valeurs STATS d'une fixture connue (U19, D-18)
import { Track, ZumaEngine, CANDIDATE, aceTimeBonus } from '../.compiled/core.js';

test('end to end: the STATS values of the r215 cleared level are the expected literals, then the count-up credits the bonus', () => {
  // Straight 2000 px track, no slow zone, no pusher, no power-ups; two colour-0 balls at 320 / 352 and a colour-0 shot
  // at (336, 240): the run of three explodes, `total` is raised so no ball follows, the board is cleared and tallied.
  const g = new ZumaEngine(new Track([[0, 240], [2000, 240]]), { x: 320, y: 400 }, { ...CANDIDATE, endSlowFactor: 1, speed: 0, powerChance: 0, target: 30, total: 2, levelBonus: 500, parTime: 25 }, 5);
  g.feeding = false;
  g.loadFixture({ balls: [{ color: 0, s: 320 }, { color: 0, s: 352 }], current: 0, next: 0, stream: true });
  g.command({ kind: 'shoot', x: 336, y: 240 });
  const stepUntil = (kind, limit) => {
    for (let i = 0; i < limit; i++) {
      const before = g.events.length;
      g.step();
      const e = g.events.slice(before).find(ev => ev.kind === kind);
      if (e) return e;
    }
    throw new Error(`no ${kind} within ${limit} ticks`);
  };
  const destroy = stepUntil('destroy', 60);
  g.config.total = 99;
  stepUntil('clearing', 60);
  stepUntil('won', 400);
  assert.equal(g.state, 'won');
  // Derivation of every number below:
  //   points  = 30 (run of three: 3 × 10) + 500 (levelBonus × 1 curve at clearing) + 100 × 28 steps = 3330,
  //             steps = ⌈(2000 − 352) / 60⌉ = 28 (the last destruction sits at s = 352 → x = 352 on the straight track);
  //   combos / coins / gaps = 0 (a direct destruction, no coin, no gap), chain = comboMax = 1 (one match, depth 1);
  //   time    = formatSeconds(⌊levelTicks / 60⌋) with levelTicks = clearTick − goTick = 46 − 0 (feeding off → go at tick 0) → « 0 s »;
  //   R2.0.19 (D-34): the run is removed 24 ticks after the match (40 maj), no longer 40 — 22 + 24 = 46 (was 62, « 1 s »);
  //   objective = « 25 s » (parTime); bonus = aceTimeBonus(0, 25) = ⌊250 × 25 / 25⌋ × 100 + 100 = 25100 → « +25100 »;
  //   record  = the current time when no best time is stored → « 0 s ».
  assert.equal(destroy.x, 352);
  assert.equal(g.levelTicks, 46);
  assert.equal(g.timeBonus, aceTimeBonus(0, 25));
  const input = {
    levelScore: g.levelScore, combos: g.stats.combos, coins: g.stats.coins, gaps: g.stats.gaps, maxStreak: g.stats.maxStreak, maxCombo: g.stats.maxCombo,
    seconds: Math.floor(g.levelTicks / 60), parTime: 25, timeBonus: g.timeBonus, won: true, bestSeconds: null, noBonusLabel: 'PAS DE BONUS',
  };
  assert.deepEqual(statsValues(input), {
    points: '3330', combos: '0', coins: '0', gaps: '0', chain: '1', comboMax: '1', time: '0 s', objective: '25 s', bonus: '+25100', record: '0 s',
  });
  // The dialog opens on « +0 » and counts the bonus into the level score (creditBonus); the final frame shows everything.
  assert.equal(statsValues({ ...input, timeBonusShown: 0 }).bonus, '+0');
  // R2.0.17 (D-21): above 2 000 the step is the multiple of 100 ≥ total / 20 — 1 300 for 25 100 (≈ 2 s instead of 25 s).
  assert.equal(statsValues({ ...input, timeBonusShown: bonusCountUp(g.timeBonus, 1000) }).bonus, '+1300');
  assert.equal(g.timeBonusCredited, 0, 'nothing credited before the count-up');
  g.creditBonus(g.timeBonus);
  assert.equal(g.levelScore, 3330 + 25100);
  assert.equal(g.timeBonusCredited, g.timeBonus);
  assert.equal(statsValues({ ...input, levelScore: g.levelScore, timeBonusShown: g.timeBonus }).points, String(3330 + 25100));
  assert.equal(statsValues({ ...input, levelScore: g.levelScore, timeBonusShown: g.timeBonus }).bonus, '+25100');
});

test('main.js counts the time bonus up inside the STATS dialog through creditBonus and credits the rest on close (U17, T-05-15)', () => {
  const main = fs.readFileSync('.compiled/main.js', 'utf8');
  assert.match(main, /engine\.creditBonus\(/, 'the engine credits the bonus');
  // R2.0.17 (D-21): the timer chain applies bonusCountStep(total) (or BONUS_FAST_STEP) per 100 ms; bonusCountUp stays the pure model of the schedule.
  assert.match(main, /bonusCountStep\(/, 'step from the pure function');
  assert.match(main, /bonusPopRate\(/, 'rising pop pitch');
  assert.match(main, /key: 'bonuspop'/, 'endoflevelpop1 on each step');
  assert.match(main, /timeBonusShown/, 'the shown share goes to statsValues');
  assert.match(main, /engine\.timeBonus - engine\.timeBonusCredited/, 'total bounded by what is still uncredited');
  const closeStart = main.indexOf('async closeStats()');
  assert.ok(closeStart > 0, 'Game.closeStats compiled');
  const close = main.slice(closeStart, main.indexOf('\n  }\n', closeStart));
  assert.match(close, /creditBonus\(/, 'the remainder is credited when the dialog closes');
  assert.match(close, /statsBonus = null/, 'credited once only');
  assert.match(main, /Math\.floor\(engine\.levelTicks/, 'TEMPS from the level clock');
});
