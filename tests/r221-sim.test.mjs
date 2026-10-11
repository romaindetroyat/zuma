// R2.0.21 — simulation de difficulté sans navigateur (recherche 06 Q5c, D-06 / D-09).
// `tools/sim-difficulty.mjs` rejoue un robot fixe sur chaque niveau et mesure la part du temps où le pousseur est
// arrêté et la vitesse effective ; la variante `legacy-insert` émule hors du moteur l'arrêt à l'insertion de R2.0.20.
// Ce test n'utilise que les niveaux procéduraux (aucune donnée du pack).
import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { simulateLevel, simulationLevels, formatReport } from '../tools/sim-difficulty.mjs';
import { LEVELS } from '../.compiled/levels.js';

const TOOL = fileURLToPath(new URL('../tools/sim-difficulty.mjs', import.meta.url));
const ROOT = fileURLToPath(new URL('..', import.meta.url));
const OUTCOMES = ['zuma', 'won', 'lost', 'running'];
const options = (seed, variant) => ({ seed, variant, horizonSeconds: 60, shotTicks: 40, missRate: 0.4 });

test('simulationLevels({ pack: null }) returns the procedural levels, labelled P1…, with the LevelDef fields', () => {
  const levels = simulationLevels({ pack: null });
  assert.equal(levels.length, LEVELS.length);
  levels.forEach((level, i) => {
    assert.equal(level.label, `P${i + 1}`);
    assert.equal(level.tracks.length, 1);
    assert.ok(level.tracks[0].length > 0, 'a Track');
    assert.deepEqual(level.frog, LEVELS[i].frog);
    const def = LEVELS[i];
    for (const k of ['colors', 'startFraction', 'total', 'target', 'speed']) assert.equal(level.config[k], def[k], k);
    assert.deepEqual(level.treasure, []);
  });
  assert.deepEqual(simulationLevels({ pack: null, only: ['P2', 'P3'] }).map(l => l.label), ['P2', 'P3']);
});

test('a missing pack folder falls back to the procedural levels silently', () => {
  const levels = simulationLevels({ pack: '/nonexistent/zuma-pack' });
  assert.deepEqual(levels.map(l => l.label), LEVELS.map((_, i) => `P${i + 1}`));
});

test('determinism: two runs with the same seed give deepEqual results', () => {
  const [p1] = simulationLevels({ pack: null, only: ['P1'] });
  const a = simulateLevel(p1, options(7919, 'original'));
  const b = simulateLevel(p1, options(7919, 'original'));
  assert.deepEqual(a, b);
  assert.equal(a.label, 'P1');
  assert.equal(a.variant, 'original');
  assert.equal(a.seed, 7919);
  assert.ok(a.shots > 0, 'the bot shot');
});

test('original rule: no insertion stop; the emulated R2.0.20 rule stops on insertions and keeps the pusher stopped longer', () => {
  const levels = simulationLevels({ pack: null, only: ['P1', 'P2', 'P3'] });
  assert.equal(levels.length, 3);
  for (const level of levels) {
    const original = [7919, 15838].map(seed => simulateLevel(level, options(seed, 'original')));
    const legacy = [7919, 15838].map(seed => simulateLevel(level, options(seed, 'legacy-insert')));
    for (const r of original) assert.equal(r.insertStops, 0, `${level.label} seed ${r.seed}: the engine never stops on insertion`);
    for (const r of legacy) assert.ok(r.insertStops > 0, `${level.label} seed ${r.seed}: the emulated rule armed stops`);
    const mean = rs => rs.reduce((a, r) => a + r.stoppedRatio, 0) / rs.length;
    assert.ok(mean(legacy) > mean(original), `${level.label}: legacy ${mean(legacy)} > original ${mean(original)}`);
  }
});

test('measures are bounded', () => {
  for (const level of simulationLevels({ pack: null, only: ['P1', 'P4'] })) {
    for (const variant of ['original', 'legacy-insert']) {
      const r = simulateLevel(level, { ...options(31, variant), horizonSeconds: 30 });
      assert.ok(r.stoppedRatio >= 0 && r.stoppedRatio <= 1, `stoppedRatio ${r.stoppedRatio}`);
      assert.ok(Number.isFinite(r.speedRatio) && r.speedRatio >= 0, `speedRatio ${r.speedRatio}`);
      assert.ok(r.seconds >= 0 && r.seconds <= 30, `seconds ${r.seconds}`);
      assert.ok(OUTCOMES.includes(r.outcome), r.outcome);
      assert.ok(Number.isInteger(r.rearStops) && r.rearStops >= 0);
      assert.ok(Number.isInteger(r.insertStops) && r.insertStops >= 0);
    }
  }
});

test('formatReport: one French line per (level, variant) with arrêt %, vitesse % and the stop counts', () => {
  const [p1, p2] = simulationLevels({ pack: null, only: ['P1', 'P2'] });
  const results = [];
  for (const level of [p1, p2]) {
    for (const variant of ['original', 'legacy-insert']) {
      for (const seed of [1, 2]) results.push(simulateLevel(level, { ...options(seed, variant), horizonSeconds: 20 }));
    }
  }
  const text = formatReport(results);
  const lines = text.trim().split('\n');
  assert.match(lines[0], /niveau/i, 'header');
  assert.match(lines[0], /arrêt/);
  assert.match(lines[0], /vitesse/);
  const rows = lines.filter(l => /^P\d/.test(l));
  assert.equal(rows.length, 4, 'one row per (level, variant)');
  for (const label of ['P1', 'P2']) {
    for (const variant of ['original', 'legacy-insert']) {
      const row = rows.find(l => l.startsWith(label + ' ') && l.includes(variant));
      assert.ok(row, `${label} ${variant}`);
      assert.match(row, /\d+(\.\d)? %.*\d+(\.\d)? %/, 'stopped and speed percentages');
    }
  }
  assert.match(text, /graines/, 'French wording');
});

test('CLI: a small run exits 0 with the table; an unknown argument exits 1 with an explicit message', () => {
  const ok = spawnSync(process.execPath, [TOOL, '--levels=P1', '--seeds=1', '--horizon=20', '--pack=none'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /niveau/i);
  assert.match(ok.stdout, /^P1 /m);
  const bad = spawnSync(process.execPath, [TOOL, '--bogus'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(bad.status, 1);
  assert.match(bad.stderr, /--bogus/);
  const level = spawnSync(process.execPath, [TOOL, '--levels=Z9', '--pack=none'], { cwd: ROOT, encoding: 'utf8' });
  assert.equal(level.status, 1, 'unknown level label');
  assert.match(level.stderr, /Z9/);
});
