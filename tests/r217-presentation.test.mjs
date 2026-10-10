// R2.0.17 — présentation : textes et sons du score, STATS D-20, compte à rebours D-21, roulement, netteté D-19 (plan 05-08)
// Libellés originaux (« +N » couleur de la bille, COMBO x, BONUS … SAUT sans montant, ENCHAÎNEMENT x), `gapbonus1`
// différé de 0 / 150 / 300 ms, grille du STATS, formateur unique, astuce sur deux lignes, décompte borné avec
// mode rapide, rampe du roulement armée une fois par cible, filtre pixel-art 2 × et composition à l'échelle.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { soundCues, ballCss, PARTICLE_RGB } from '../.compiled/feedback.js';
import { clampDelay } from '../.compiled/audio.js';

const near = (a, b, eps, msg) => assert.ok(Math.abs(a - b) <= eps, `${msg ?? ''} ${a} ≠ ${b} (± ${eps})`);
const read = file => fs.readFileSync(file, 'utf8');
/** Body of a `case '<kind>'` block of the compiled handleEvents, up to the next `case '`. */
const caseBlock = (src, kind) => {
  const start = src.indexOf(`case '${kind}'`);
  assert.ok(start > 0, `case '${kind}' compiled`);
  const end = src.indexOf("case '", start + 8);
  return src.slice(start, end > 0 ? end : undefined);
};

// ---------------------------------------------------------------- sons du score (recherche 02 Q1–Q2)

test('cues: gapbonus1 once per gap up to three, at 0 / 150 / 300 ms (15 / 30 maj) and 0 / +2 / +3 semitones', () => {
  assert.deepEqual(soundCues({ tick: 1, kind: 'gap', count: 1 }), [{ key: 'gap', gain: 1, rate: 1, delay: 0 }]);
  const two = soundCues({ tick: 1, kind: 'gap', count: 2 });
  assert.equal(two.length, 2);
  near(two[1].rate, Math.pow(2, 2 / 12), 1e-12, '+2 semitones');
  assert.equal(two[1].delay, 0.15, '15 maj = 150 ms');
  assert.equal(two[1].key, 'gap');
  const three = soundCues({ tick: 1, kind: 'gap', count: 3 });
  assert.equal(three.length, 3);
  near(three[2].rate, Math.pow(2, 3 / 12), 1e-12, '+3 semitones');
  assert.equal(three[2].delay, 0.3, '30 maj = 300 ms');
  assert.deepEqual(three.map(c => c.delay), [0, 0.15, 0.3]);
  assert.equal(soundCues({ tick: 1, kind: 'gap', count: 7 }).length, 3, 'never more than three');
  assert.ok(three[0].rate < three[1].rate && three[1].rate < three[2].rate, 'rising pitch (r213 lock)');
  for (const c of three) assert.equal(c.gain, 1);
});

test('cues: chain1 at chain − 5 semitones from the 5th hit; BALLDESTROYED1..5 by combo with chime1 at 2 × combo semitones and 0.4 + 0.2 × combo', () => {
  assert.deepEqual(soundCues({ tick: 1, kind: 'streak', streak: 5, points: 100 }), [{ key: 'streak', gain: 1, rate: 1 }]);
  near(soundCues({ tick: 1, kind: 'streak', streak: 7 })[0].rate, Math.pow(2, 2 / 12), 1e-12, 'chain 7 → +2');
  assert.equal(soundCues({ tick: 1, kind: 'streak', streak: 4 })[0].rate, 1, 'bounded at 5');
  assert.deepEqual(soundCues({ tick: 1, kind: 'destroy', depth: 1 }), [{ key: 'destroy1', gain: 1, rate: 1 }, { key: 'combo', gain: 0.4, rate: 1 }]);
  const d3 = soundCues({ tick: 1, kind: 'destroy', depth: 3 });
  assert.equal(d3[0].key, 'destroy3');
  near(d3[1].gain, 0.8, 1e-12, 'combo 2 → 0.4 + 0.4');
  near(d3[1].rate, Math.pow(2, 4 / 12), 1e-12, 'combo 2 → +4 semitones');
  const d6 = soundCues({ tick: 1, kind: 'destroy', depth: 6 });
  assert.equal(d6[0].key, 'destroy5');
  assert.equal(d6[1].gain, 1, 'volume capped at 1');
});

test('audio.play honours SoundCue.delay, clamped to 0..1 s (T-05-24)', () => {
  assert.equal(clampDelay(undefined), 0);
  assert.equal(clampDelay(NaN), 0);
  assert.equal(clampDelay(-1), 0);
  assert.equal(clampDelay(2), 1);
  assert.equal(clampDelay(0.15), 0.15);
  const audio = read('.compiled/audio.js');
  const start = audio.indexOf('play(cue)');
  assert.ok(start > 0, 'AudioManager.play compiled');
  const body = audio.slice(start, audio.indexOf('setLoop(key, level)', start));
  assert.match(body, /cue\.delay/, 'play reads the delay');
  assert.match(body, /start\(now \+ delay\)/, 'the buffer source starts at now + delay');
  assert.match(body, /clampDelay\(/, 'delay clamped');
});

// ---------------------------------------------------------------- textes flottants (recherche 02 Q1–Q2)

test('ballCss: the « +N » takes the colour of the ball (PARTICLE_RGB), white outside the table', () => {
  assert.equal(ballCss(0), '#1980ff');
  assert.equal(ballCss(1), '#ffff00');
  assert.equal(ballCss(2), '#ff0000');
  assert.equal(ballCss(5), '#ffffff');
  assert.equal(ballCss(9), '#ffffff');
  assert.equal(ballCss(-1), '#ffffff');
  assert.equal(ballCss(NaN), '#ffffff');
  for (let c = 0; c < PARTICLE_RGB.length; c++) assert.equal(ballCss(c), '#' + PARTICLE_RGB[c].toString(16).padStart(6, '0'));
});

test('main.js: « +N » in the ball colour, COMBO x{depth} on a reaction, BONUS … SAUT without amount, ENCHAÎNEMENT x{chain} — pack strings first', () => {
  const main = read('.compiled/main.js');
  const destroy = caseBlock(main, 'destroy');
  assert.doesNotMatch(destroy, /ENCHAÎNEMENT/, 'the reaction is a COMBO, not a chain');
  assert.match(destroy, /this\.strings\?\.COMBO \?\? 'COMBO'/, 'COMBO from strings.json');
  assert.match(destroy, /x\$\{depth\}/, 'COMBO x{depth}');
  assert.match(destroy, /ballCss\(/, '« +N » in the ball colour');
  assert.match(destroy, /\+\$\{e\.points\}/, 'the amount is the match total');
  const gap = caseBlock(main, 'gap');
  assert.match(gap, /GAP_BONUS/);
  assert.match(gap, /DOUBLE_GAP_BONUS/);
  assert.match(gap, /TRIPLE_GAP_BONUS/);
  assert.doesNotMatch(gap, /\+\$\{/, 'no amount in the gap text (it is in the « +N »)');
  assert.match(gap, /BONUS SAUT/, 'fallback without the pack');
  const streak = caseBlock(main, 'streak');
  assert.match(streak, /CHAIN_BONUS/);
  assert.match(streak, /x\$\{/, 'ENCHAÎNEMENT x{chain}');
  assert.doesNotMatch(streak, /COMBO/, 'consecutive hits are a chain, not a combo');
});

// ---------------------------------------------------------------- STATS D-20 (U23)
import { STATS_LAYOUT, statsRows, statsValues, layoutTip, formatSeconds } from '../.compiled/statsdialog.js';
import { normalizeGlyphAlpha } from '../.compiled/bitmapfont.js';

test('statsRows: the right column sits on the left grid — TEMPS / POINTS, OBJECTIF / COMBOS, rule on PIÈCES, BONUS / SAUTS, RECORD / ENCH. MAX. (D-20)', () => {
  for (const lh of [16, 18, 19, 20]) {
    const r = statsRows(lh, 219);
    assert.deepEqual(r.left, Array.from({ length: 6 }, (_, i) => Math.round(219 + i * lh)), `left rows for ${lh}`);
    assert.equal(r.right.time, r.left[0], `TEMPS on POINTS (${lh})`);
    assert.equal(r.right.objective, r.left[1], `OBJECTIF on COMBOS (${lh})`);
    assert.ok(r.left[1] < r.right.rule && r.right.rule < r.left[3], `rule between COMBOS and SAUTS (${lh}: ${r.right.rule})`);
    assert.equal(r.right.rule, r.left[2] - Math.round(0.35 * lh), 'rule in the middle of the PIÈCES row');
    assert.equal(r.right.bonus, r.left[3], `BONUS on SAUTS (${lh})`);
    assert.equal(r.right.record, r.left[4], `RECORD on ENCH. MAX. (${lh})`);
    assert.ok(r.right.record <= r.left[5]);
    for (const y of [...r.left, r.right.record]) assert.ok(y < STATS_LAYOUT.tip.box.y, `rows above the tip box (lh ${lh}: ${y})`);
  }
  assert.equal(statsRows(19, 200).right.time, 200);
  // Research 02 Q4: right labels at x0 + 200, values right-aligned inside their column (hypothesis B3), 18 ≤ lh ≤ 20.
  assert.equal(STATS_LAYOUT.right.labelX - STATS_LAYOUT.left.labelX, 200);
  assert.ok(STATS_LAYOUT.left.valueRight <= STATS_LAYOUT.left.labelX + 180);
  assert.ok(STATS_LAYOUT.right.valueRight <= STATS_LAYOUT.right.labelX + 160);
});

test('one time formatter: TEMPS, OBJECTIF and RECORD all go through formatSeconds (« N s » under a minute, « m:ss » beyond)', () => {
  const v = statsValues({ levelScore: 0, combos: 0, coins: 0, gaps: 0, maxStreak: 0, maxCombo: 0, seconds: 34, parTime: 60, timeBonus: 0, won: true, bestSeconds: 130, noBonusLabel: 'PAS DE BONUS' });
  assert.equal(v.time, '34 s');
  assert.equal(v.objective, '1:00');
  assert.equal(v.record, '2:10');
  assert.equal(formatSeconds(60), '1:00');
  assert.equal(formatSeconds(59.6), '1:00', 'rounded');
  assert.equal(formatSeconds(59.4), '59 s');
  assert.equal(formatSeconds(130), '2:10');
  const dialog = read('.compiled/statsdialog.js');
  assert.equal((dialog.match(/padStart\(2, '0'\)/g) || []).length, 1, 'one m:ss formatter in statsdialog.js');
  assert.doesNotMatch(read('.compiled/main.js'), /padStart/, 'main.js formats no time of its own');
});

test('layoutTip: two lines at most, smaller font before the ellipsis, &cr; is a space, empty text → no line', () => {
  const words = n => Array.from({ length: n }, (_, i) => `mot${i % 7}`).join(' ');
  const measure = s => 6 * s.length;
  const short = layoutTip(words(8), 270, measure, null);
  assert.equal(short.lines.length, 1);
  assert.equal(short.small, false);
  const medium = layoutTip(words(16), 270, measure, null); // 79 characters
  assert.equal(medium.lines.length, 2);
  assert.equal(medium.small, false);
  assert.ok(!medium.lines[1].endsWith('…'), 'fits: no ellipsis');
  const long = layoutTip(words(40), 270, measure, null); // 199 characters
  assert.equal(long.lines.length, 2, 'never more than two lines');
  assert.ok(long.lines[1].endsWith('…'), 'second line ellipsised');
  for (const line of long.lines) assert.ok(measure(line) <= 270, `line fits (${line})`);
  assert.equal(long.small, false, 'no small font available');
  const smallMeasure = s => 4 * s.length;
  const reduced = layoutTip(words(40), 270, measure, smallMeasure);
  assert.equal(reduced.lines.length, 2);
  assert.equal(reduced.small, true, 'smaller font tried first');
  for (const line of reduced.lines) assert.ok(smallMeasure(line) <= 270, `small line fits (${line})`);
  const fitsSmall = layoutTip(words(24), 270, measure, smallMeasure); // 119 characters: 3 lines in the text font, 2 in the small one
  assert.equal(fitsSmall.lines.length, 2);
  assert.equal(fitsSmall.small, true);
  assert.ok(!fitsSmall.lines[1].endsWith('…'), 'no ellipsis when the small font fits');
  assert.deepEqual(layoutTip('Un&cr;deux', 270, measure, null).lines, ['Un deux']);
  assert.deepEqual(layoutTip('', 270, measure, null), { lines: [], small: false });
  assert.deepEqual(layoutTip('   ', 270, measure, null).lines, []);
});

test('normalizeGlyphAlpha: a glyph whose alpha peaks under 255 is raised proportionally, per rect; full and empty glyphs and pixels outside the rects stay', () => {
  // 12 × 4 RGBA picture: rect A (x 0..3) peaks at 128, rect B (x 4..7) is already solid, rect C (x 8..9) is empty, x 10..11 belongs to no rect.
  const w = 12, h = 4;
  const data = new Uint8ClampedArray(w * h * 4).fill(255);
  const alpha = (x, y, a) => { data[(y * w + x) * 4 + 3] = a; };
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) alpha(x, y, 0);
  alpha(1, 1, 128); alpha(2, 1, 64); alpha(1, 2, 32);
  alpha(5, 1, 255); alpha(6, 1, 100);
  alpha(10, 1, 128); alpha(11, 2, 64);
  const rects = [{ x: 0, y: 0, w: 4, h: 4 }, { x: 4, y: 0, w: 4, h: 4 }, { x: 8, y: 0, w: 2, h: 4 }];
  const before = Array.from(data);
  normalizeGlyphAlpha(data, w, rects);
  const at = (x, y) => data[(y * w + x) * 4 + 3];
  assert.equal(at(1, 1), 255, 'peak raised to 255');
  assert.equal(at(2, 1), 128, '64 → 128 (× 255 / 128, rounded)');
  assert.equal(at(1, 2), 64, '32 → 64');
  assert.equal(at(0, 0), 0, 'transparent stays transparent');
  assert.equal(at(5, 1), 255, 'solid glyph unchanged');
  assert.equal(at(6, 1), 100, 'solid glyph unchanged (other pixels)');
  assert.equal(at(8, 1), 0, 'empty glyph stays empty');
  assert.equal(at(10, 1), 128, 'outside the rects: unchanged');
  assert.equal(at(11, 2), 64);
  for (let i = 0; i < data.length; i++) if (i % 4 !== 3) assert.equal(data[i], before[i], 'colour channels untouched');
  // Idempotent, and robust to a rect reaching outside the picture.
  const again = Array.from(data);
  normalizeGlyphAlpha(data, w, [...rects, { x: 10, y: 2, w: 10, h: 10 }]);
  assert.deepEqual(Array.from(data).slice(0, 10 * 4), again.slice(0, 10 * 4));
  assert.equal(at(11, 2), 255, 'the partial rect normalises what it covers');
});

test('statsdialog.js: the tip is laid out by layoutTip, left-aligned after « ASTUCE : », on two lines at most; the mask alpha is normalised per glyph', () => {
  const dialog = read('.compiled/statsdialog.js');
  const start = dialog.indexOf('insetBox(ctx, L.tip.box)');
  assert.ok(start > 0, 'tip block compiled');
  const block = dialog.slice(start, dialog.indexOf('kit.button', start));
  assert.match(block, /layoutTip\(/);
  assert.match(block, /align: 'left'/);
  assert.doesNotMatch(block, /align: 'center'/, 'tip lines are not centred any more');
  assert.match(block, /tipSmall/, 'smaller font available to layoutTip');
  assert.match(dialog, /maxLines: 2/);
  assert.equal(STATS_LAYOUT.tip.maxLines, 2);
  assert.equal(STATS_LAYOUT.tip.align, 'left');
  assert.equal(STATS_LAYOUT.tip.x, undefined, 'no centred x any more');
  assert.ok(STATS_LAYOUT.tip.gap > 0, 'gap after the label');
  const font = read('.compiled/bitmapfont.js');
  assert.match(font, /export function normalizeGlyphAlpha\(/);
  const lum = font.slice(font.indexOf('function luminanceToAlpha('), font.indexOf('function multipliedAtlas('));
  assert.match(lum, /normalizeGlyphAlpha\(/, 'applied when the mask becomes an alpha picture');
});

// ---------------------------------------------------------------- compte à rebours D-21 (U24)
import { bonusCountStep, bonusCountUp, bonusPopRate, BONUS_FAST_STEP } from '../.compiled/statsdialog.js';

test('bonusCountStep: 100 up to 2 000, else the multiple of 100 ≥ total / 20 (≈ 2 s of count-up, D-21)', () => {
  assert.equal(bonusCountStep(0), 100);
  assert.equal(bonusCountStep(1000), 100);
  assert.equal(bonusCountStep(2000), 100);
  assert.equal(bonusCountStep(2100), 200);
  assert.equal(bonusCountStep(10900), 600);
  assert.equal(bonusCountStep(24100), 1300);
  assert.equal(bonusCountStep(40000), 2000);
  assert.equal(bonusCountStep(NaN), 100);
  assert.equal(bonusCountStep(-500), 100);
  for (let total = 2100; total <= 60000; total += 100) {
    const step = bonusCountStep(total);
    assert.equal(step % 100, 0, `multiple of 100 (${total} → ${step})`);
    assert.ok(step >= total / 20, `≥ total / 20 (${total} → ${step})`);
    assert.ok(step < total / 20 + 100, `smallest such multiple (${total} → ${step})`);
  }
});

test('bonusCountUp(total, ms, step): nothing before 1 s, then one step every 100 ms, capped; default step = bonusCountStep(total)', () => {
  assert.equal(bonusCountUp(10900, 999), 0);
  assert.equal(bonusCountUp(10900, 1000), 600);
  assert.equal(bonusCountUp(10900, 1950), 6000);
  assert.equal(bonusCountUp(10900, 2900), 10900, 'capped at the total');
  assert.equal(bonusCountUp(1500, 1000), 100, '≤ 2 000: 100 per step as before');
  assert.equal(bonusCountUp(1500, 2400), 1500);
  assert.equal(bonusCountUp(1100, 1100), 200, 'r216 cases hold under 2 000');
  assert.equal(bonusCountUp(250, 1250), 250);
  for (let total = 2100; total <= 60000; total += 100) assert.equal(bonusCountUp(total, 1000 + 1900), total, `≤ 20 steps: done 2.9 s after the opening (${total})`);
  assert.equal(BONUS_FAST_STEP, 2500, '0x440b82–0x440b9b: 2 500 per step');
  assert.equal(bonusCountUp(10900, 1000, BONUS_FAST_STEP), 2500);
  assert.equal(bonusCountUp(10900, 1400, 2500), 10900);
  assert.equal(bonusCountUp(10900, 1000, NaN), 600, 'bad step → default');
  assert.equal(bonusCountUp(10900, 1000, 0), 600);
  assert.equal(bonusPopRate(0, 1100), 1, 'bonusPopRate unchanged');
  assert.equal(bonusPopRate(1100, 1100), 1.5);
});

test('main.js: one timer at a time from bonusCountStep, click outside OK → fast mode, OK still credits the remainder (deliberate deviation)', () => {
  const main = read('.compiled/main.js');
  assert.match(main, /bonusCountStep\(/);
  assert.match(main, /BONUS_FAST_STEP/);
  const start = main.indexOf("addEventListener('pointerdown'");
  assert.ok(start > 0, 'pointerdown handler on the dialog');
  const handler = main.slice(start, main.indexOf('passive: true', start));
  assert.match(handler, /result-continue/, 'OK is excluded from the fast mode');
  assert.match(handler, /fast = true/, 'fast mode armed');
  const closeStart = main.indexOf('async closeStats()');
  const close = main.slice(closeStart, main.indexOf('\n  }\n', closeStart));
  assert.match(close, /creditBonus\(/, 'the remainder is credited on close (r216 lock kept)');
  assert.match(main + read('.compiled/statsdialog.js'), /no acceleration|deliberate deviation/i, 'the deviation from the original is written down');
  assert.doesNotMatch(main, /for \(let k = 1; k <= steps; k\+\+\)/, 'no pre-armed timer per step');
});

// ---------------------------------------------------------------- roulement (deferred-items 05-07)
import { rampPlan, ROLLING_GAIN, ROLLING_FADE_SECONDS } from '../.compiled/audio.js';

test('rampPlan: a ramp only when the loop target changes — 50 ms in to ROLLING_GAIN, ROLLING_FADE_SECONDS out to 0', () => {
  assert.deepEqual(rampPlan(null, 1), { to: ROLLING_GAIN, seconds: 0.05 });
  assert.deepEqual(rampPlan(0, 1), { to: 0.6, seconds: 0.05 });
  assert.deepEqual(rampPlan(1, 0), { to: 0, seconds: ROLLING_FADE_SECONDS });
  assert.deepEqual(rampPlan(1, 0), { to: 0, seconds: 0.15 });
  assert.equal(rampPlan(1, 1), null, 'same target: the running ramp is left alone');
  assert.equal(rampPlan(0, 0), null);
  assert.equal(rampPlan(null, 0), null);
  assert.deepEqual(rampPlan(0.5, 1), { to: 0.6, seconds: 0.05 });
  const audio = read('.compiled/audio.js');
  const start = audio.indexOf('setLoop(key, level)');
  const body = audio.slice(start, audio.indexOf('pulse(key, level)', start));
  assert.match(body, /idleSince: null, target: 0/, 'Loop carries its target');
  assert.match(body, /rampPlan\(loop\.target, target\)/, 'planned from the previous target');
  assert.equal((body.match(/cancelScheduledValues/g) || []).length, 1);
  assert.ok(body.indexOf('if (plan)') > 0 && body.indexOf('if (plan)') < body.indexOf('cancelScheduledValues'), 'the running ramp is cancelled only when a new one is planned');
  assert.match(body, /loop\.target = target/);
});

// ---------------------------------------------------------------- netteté D-19 (U22) — filtre pixel-art et composition à l'échelle
import { upscale2x } from '../.compiled/upscale.js';

/** RGBA image from a list of rows of [r, g, b, a] pixels. */
const image = rows => {
  const height = rows.length;
  const width = rows[0]?.length ?? 0;
  const data = new Uint8ClampedArray(width * height * 4);
  rows.forEach((row, y) => row.forEach((px, x) => data.set(px, (y * width + x) * 4)));
  return { width, height, data };
};
const px = (img, x, y) => Array.from(img.data.slice((y * img.width + x) * 4, (y * img.width + x) * 4 + 4));
const W = [255, 255, 255, 255], K = [0, 0, 0, 255], R = [255, 0, 0, 255];
/** Plain nearest-neighbour 2 × for comparison. */
const nearest2x = src => {
  const out = { width: src.width * 2, height: src.height * 2, data: new Uint8ClampedArray(src.width * src.height * 16) };
  for (let y = 0; y < out.height; y++) for (let x = 0; x < out.width; x++) out.data.set(px(src, x >> 1, y >> 1), (y * out.width + x) * 4);
  return out;
};

test('upscale2x: doubles the size, keeps flat areas and hard edges exactly, never modifies its input', () => {
  const one = upscale2x(image([[R]]));
  assert.deepEqual([one.width, one.height], [2, 2]);
  for (let i = 0; i < 4; i++) assert.deepEqual(px(one, i % 2, i >> 1), R);
  const flat = image(Array.from({ length: 4 }, () => Array.from({ length: 4 }, () => [10, 20, 30, 200])));
  const flat2 = upscale2x(flat);
  assert.deepEqual([flat2.width, flat2.height], [8, 8]);
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) assert.deepEqual(px(flat2, x, y), [10, 20, 30, 200], 'uniform, alpha preserved');
  const empty = upscale2x({ width: 0, height: 0, data: new Uint8ClampedArray(0) });
  assert.deepEqual([empty.width, empty.height, empty.data.length], [0, 0, 0]);
  const half = image(Array.from({ length: 4 }, () => [W, W, K, K]));
  const copy = Array.from(half.data);
  const half2 = upscale2x(half);
  assert.deepEqual(Array.from(half.data), copy, 'input untouched');
  for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) assert.deepEqual(px(half2, x, y), x < 4 ? W : K, `hard edge at (${x}, ${y})`);
  const dot = image(Array.from({ length: 5 }, (_, y) => Array.from({ length: 5 }, (_, x) => (x === 2 && y === 2 ? W : K))));
  const dot2 = upscale2x(dot);
  for (let y = 0; y < 10; y++) for (let x = 0; x < 10; x++) assert.deepEqual(px(dot2, x, y), x >= 4 && x <= 5 && y >= 4 && y <= 5 ? W : K, `isolated pixel → 2 × 2 block (${x}, ${y})`);
});

test('upscale2x: EPX smooths diagonals without inventing colours (differs from nearest neighbour)', () => {
  const diag = image(Array.from({ length: 3 }, (_, y) => Array.from({ length: 3 }, (_, x) => (x === y ? W : K))));
  const out = upscale2x(diag);
  const plain = nearest2x(diag);
  assert.deepEqual([out.width, out.height], [6, 6]);
  let differs = 0;
  for (let y = 0; y < 6; y++) for (let x = 0; x < 6; x++) {
    const p = px(out, x, y);
    assert.ok(p.join() === W.join() || p.join() === K.join(), `only white or black at (${x}, ${y}): ${p}`);
    if (p.join() !== px(plain, x, y).join()) differs++;
  }
  assert.ok(differs > 0, 'corners smoothed');
  // EPX rules on (0, 1): A (up) white, B (right) white, C (left) = P, D (down) black → top-right sub-pixel takes B.
  assert.deepEqual(px(out, 1, 2), W);
  assert.deepEqual(px(out, 0, 2), K);
  // A semi-transparent glyph keeps its alpha values on the flat blocks.
  const soft = image([[[255, 255, 255, 90], [255, 255, 255, 90]], [[255, 255, 255, 90], [255, 255, 255, 90]]]);
  const soft2 = upscale2x(soft);
  for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) assert.equal(px(soft2, x, y)[3], 90);
  const src = read('.compiled/upscale.js');
  assert.doesNotMatch(src, /^\S[^\n]*\bdocument\b/m, 'no DOM access at module level (column-0 statements)');
});

test('composeStatsDialog composes at the backing-store scale; main.js shows it in a child canvas, no PNG, no background image (D-19)', () => {
  const dialog = read('.compiled/statsdialog.js');
  assert.match(dialog, /Math\.round\(STAGE_WIDTH \* s\)/, 'canvas sized by the scale');
  assert.match(dialog, /Math\.round\(STAGE_HEIGHT \* s\)/);
  assert.match(dialog, /ctx\.setTransform\(s, 0, 0, s, 0, 0\)/, 'logical units after the transform');
  assert.match(dialog, /Math\.min\(4,/, 'scale bounded (T-05-22)');
  const main = read('.compiled/main.js');
  assert.match(main, /composeStatsDialog\([^;]*this\.renderer\.scale\)/, 'composed at the renderer scale');
  assert.match(main, /stats-picture/, 'child canvas class');
  assert.match(main, /prepend\(/, 'inserted first in .zuma-stats');
  assert.doesNotMatch(main, /backgroundImage/, 'no inline background any more');
  assert.doesNotMatch(main, /bitmapUrl\(/, 'no PNG encoding');
  assert.doesNotMatch(main, /revokeObjectURL|createObjectURL/);
  assert.match(read('.compiled/render.js'), /get scale\(\)/, 'Renderer.scale readable');
  assert.match(read('.compiled/original.js'), /export function bitmapUrl/, 'bitmapUrl still exported (r215 lock)');
});

test('bundle and shell: upscale.js in MODULES before original, precached with bitmapfont.js and statsdialog.js, .stats-picture rule without url(', () => {
  const build = read('tools/build.mjs');
  const m = build.match(/const MODULES = \[([^\]]*)\]/);
  assert.ok(m, 'MODULES list');
  const modules = m[1].split(',').map(s => s.trim().replace(/'/g, ''));
  assert.ok(modules.includes('upscale'));
  assert.ok(modules.indexOf('upscale') < modules.indexOf('original'), 'upscale before original');
  assert.ok(modules.indexOf('upscale') > modules.indexOf('core'));
  const sw = read('public/sw.js');
  for (const file of ['./js/upscale.js', './js/bitmapfont.js', './js/statsdialog.js']) assert.match(sw, new RegExp(file.replace(/[./]/g, '\\$&')), `${file} precached (offline shell)`);
  for (const name of modules) assert.match(sw, new RegExp(`\\./js/${name}\\.js`), `${name}.js precached`);
  const css = read('public/style.css');
  const tail = css.slice(css.lastIndexOf('R2.0.11'));
  assert.match(tail, /#stats\.stats-original \.stats-picture\{position:absolute;inset:0;width:100%;height:100%;display:block;pointer-events:none\}/);
  assert.doesNotMatch(tail, /url\(/, 'r211: the stylesheet never references the picture');
  assert.equal((read('index.html').match(/id="result-continue"/g) || []).length, 1);
});

// ---------------------------------------------------------------- netteté D-19 (U22) — actifs 2 × à partir de l'échelle 1,5
import { HD_MIN_SCALE } from '../.compiled/render.js';
import { drawNineSlice } from '../.compiled/statsdialog.js';
import { upscaleSheet } from '../.compiled/original.js';

test('HD assets: fonts, dialog pieces, button, balls, shadow, icons and menubar are upscaled 2 × from scale 1.5 (not in « Pixels nets »); the background stays bilinear', () => {
  assert.equal(HD_MIN_SCALE, 1.5);
  const font = read('.compiled/bitmapfont.js');
  assert.match(font, /pixelScale/);
  assert.match(font, /upscaled\(\)/);
  assert.match(font, /g\.sx \* k, g\.sy \* k, g\.sw \* k, g\.sh \* k, ox \+ g\.dx, oy \+ g\.dy, g\.sw, g\.sh/, '2 × source cut, logical destination');
  const original = read('.compiled/original.js');
  assert.match(original, /export function upscaleSheet\(/);
  assert.doesNotMatch(original, /bitmapfont/, 'still no cycle with bitmapfont');
  const dialog = read('.compiled/statsdialog.js');
  assert.match(dialog, /export function upscaleStatsKit\(/);
  assert.match(dialog, /function drawNineSlice\(ctx, image, src, inset, dst, sourceScale = 1\)/);
  assert.match(dialog, /kit\.pixelScale/);
  const render = read('.compiled/render.js');
  assert.match(render, /export const HD_MIN_SCALE = 1\.5/);
  const ball = render.slice(render.indexOf('drawBall(color, x, y, roll, alpha, scale, power, frame) {'), render.indexOf('drawPowerGlyph(power) {'));
  assert.match(ball, /ballShadow, -15, -13, [^)]*\/ k/, 'shadow drawn at its logical size');
  assert.match(ball, /icon, -16, -16, [^)]*\/ k/, 'power icon drawn at its logical size');
  const hud = render.slice(render.indexOf('drawHud(hud, frame) {'));
  assert.match(hud, /menubar, 0, 0, [^)]*\/ k/, 'menubar drawn at 640 × 480');
  const main = read('.compiled/main.js');
  assert.match(main, /HD_MIN_SCALE/);
  assert.match(main, /upscaleStatsKit\(/);
  assert.match(main, /!this\.pixelated/, '« Pixels nets » keeps the 1 × assets');
  const start = main.indexOf('function buildHdAssets(base)');
  assert.ok(start > 0, 'buildHdAssets compiled');
  const block = main.slice(start, main.indexOf('\n}\n', start) > 0 ? main.indexOf('\n}\n', start) : undefined);
  for (const key of ['balls', 'ballShadow', 'powers', 'menubar', 'fonts']) assert.match(block, new RegExp(`\\b${key}\\b`), `${key} upscaled`);
  for (const key of ['hole', 'frogPad', 'pitcover', 'explosions', 'coin', 'background', 'gauge', 'tongue', 'eyeblink']) assert.doesNotMatch(block, new RegExp(`\\b${key}\\b`), `${key} stays 1 ×`);
  assert.match(block, /pixelScale: 2/);
});

test('drawNineSlice with sourceScale 2 doubles the source rectangles and keeps the destination rectangles', () => {
  const calls = [];
  const ctx = { drawImage: (_image, ...rest) => calls.push(rest) };
  const src = { x: 11, y: 0, w: 229, h: 231 };
  const dst = { x: 109, y: 91, w: 422, h: 355 };
  drawNineSlice(ctx, {}, src, 36, dst);
  const one = calls.splice(0);
  drawNineSlice(ctx, {}, src, 36, dst, 2);
  const two = calls.splice(0);
  assert.equal(one.length, 9);
  assert.equal(two.length, 9);
  for (let i = 0; i < 9; i++) {
    assert.deepEqual(two[i].slice(0, 4), one[i].slice(0, 4).map(v => v * 2), `source ${i} doubled`);
    assert.deepEqual(two[i].slice(4), one[i].slice(4), `destination ${i} unchanged`);
  }
  assert.deepEqual(one[0], [11, 0, 36, 36, 109, 91, 36, 36], 'top-left corner');
  assert.deepEqual(two[0], [22, 0, 72, 72, 109, 91, 36, 36]);
});

test('upscaleSheet: picture replaced, frame size doubled, frame count unchanged; no picture → the sheet as is', () => {
  const sheet = { image: { width: 32, height: 1504 }, frameWidth: 32, frameHeight: 32, frames: 47 };
  const big = { width: 64, height: 3008 };
  const up = upscaleSheet(sheet, big);
  assert.equal(up.image, big);
  assert.equal(up.frameWidth, 64);
  assert.equal(up.frameHeight, 64);
  assert.equal(up.frames, 47);
  assert.notEqual(up, sheet);
  assert.deepEqual(sheet, { image: { width: 32, height: 1504 }, frameWidth: 32, frameHeight: 32, frames: 47 }, 'input untouched');
  const same = upscaleSheet(sheet, null);
  assert.equal(same.image, sheet.image);
  assert.equal(same.frameWidth, 32);
  assert.equal(same.frameHeight, 32);
});

test('layoutTip ellipsis: « … » by default, « ... » when the font has no such glyph (no pack font defines U+2026)', () => {
  const words = n => Array.from({ length: n }, (_, i) => `mot${i % 7}`).join(' ');
  const measure = s => 6 * s.length;
  const dots = layoutTip(words(40), 270, measure, null, '...');
  assert.equal(dots.lines.length, 2);
  assert.ok(dots.lines[1].endsWith('...'));
  assert.ok(measure(dots.lines[1]) <= 270);
  const block = read('.compiled/statsdialog.js').slice(read('.compiled/statsdialog.js').indexOf('insetBox(ctx, L.tip.box)'));
  assert.match(block, /measure\('…'\) > 0 \? '…' : '\.\.\.'/, 'the composed dialog falls back to three dots');
});

test('loadBitmapFont is memoised per pack and key: the HUD and the STATS kit share one font instance (2 × atlases counted once, T-05-22)', async () => {
  const { loadBitmapFont } = await import('../.compiled/bitmapfont.js');
  let fetches = 0;
  const savedFetch = globalThis.fetch;
  globalThis.fetch = async () => { fetches++; return { ok: true, text: async () => "CreateLayer Main;\nLayerSetImage Main 'Foo';\nLayerSetAscent Main 10;\nLayerSetImageMap Main ('A') ((0, 0, 5, 8));\n" }; };
  try {
    const pack = { base: 'x/', data: { fonts: { foo: { script: 'fonts/foo.txt', image: null, mask: 'fonts/_foo.gif' } } }, image: async () => ({ width: 10, height: 10 }) };
    const [a, b] = await Promise.all([loadBitmapFont(pack, 'foo'), loadBitmapFont(pack, 'foo')]);
    assert.ok(a, 'font loaded');
    assert.equal(a, b, 'same instance');
    assert.equal(await loadBitmapFont(pack, 'foo'), a, 'still the same later');
    assert.equal(fetches, 1, 'one fetch of the script');
    assert.equal(await loadBitmapFont(pack, 'bar'), null, 'unknown key → null');
    const other = { ...pack };
    assert.notEqual(await loadBitmapFont(other, 'foo'), a, 'another pack → its own font');
  } finally {
    globalThis.fetch = savedFetch;
  }
});
