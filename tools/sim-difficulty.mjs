#!/usr/bin/env node
/**
 * Headless difficulty simulation (research 06 Q5c, D-06 / D-09).
 *
 * Replays a fixed bot on each level, without a browser and deterministically, and measures how long the pusher stays
 * stopped and how fast the chain really moves compared with its nominal speed — level by level — so that any future
 * rule change can be judged on numbers. The bot is not a player (research hypothesis A7): only relative comparisons
 * between rule variants are meaningful, not the absolute values.
 *
 * Bot (same as the research): it aims at the most advanced ball of its colour (pairs first, a free line of fire, out
 * of tunnels and on screen), swaps when the next ball makes a pair, shoots every `shotTicks` and, with probability
 * `missRate`, aims at a ball of another colour instead. Its own LCG `rng = (rng × 1103515245 + 12345) >>> 0` is
 * seeded by `seed`; the engine gets the same seed. Measures run until ZUMA mode or the first life lost.
 *
 * Variants: 'original' = the engine as is (R2.0.21: the pusher stops only when the rear ball is removed);
 * 'legacy-insert' = the same engine plus the R2.0.20 insertion stop emulated after each step (comparison only).
 *
 * Levels come from the private pack (`private_assets/pack/pack.json`, read only: nothing is written or copied, the
 * report holds percentages and counters only) or, without it, from the procedural catalogue.
 *
 * CLI: node tools/sim-difficulty.mjs [--levels=1-1,2-3] [--seeds=6] [--horizon=240] [--shot=40] [--miss=0.4]
 *      [--compare] [--pack=<folder>|none]
 */
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = fileURLToPath(new URL('..', import.meta.url));
const DEFAULT_PACK = `${ROOT}private_assets/pack`;
/** Pusher stop of the R2.0.20 engine on insertion into the rear segment, ticks (40 maj × 0.6). */
const LEGACY_STOP_TICKS = 24;

/** Compiled modules (`node tools/build.mjs` or `npx tsc`), or null when `.compiled/` is missing. */
async function loadEngine() {
  try {
    const core = await import(new URL('../.compiled/core.js', import.meta.url).href);
    const main = await import(new URL('../.compiled/main.js', import.meta.url).href);
    const levels = await import(new URL('../.compiled/levels.js', import.meta.url).href);
    return { ZumaEngine: core.ZumaEngine, Track: core.Track, configFromSettings: main.configFromSettings, LEVELS: levels.LEVELS };
  } catch {
    return null;
  }
}

const ENGINE = await loadEngine();

function requireEngine() {
  if (!ENGINE) throw new Error('modules compilés absents (.compiled/) : lancez d\'abord node tools/build.mjs');
  return ENGINE;
}

/** Reads the pack index, or null when absent / unreadable (never throws). */
function readPack(dir) {
  if (!dir) return null;
  try {
    const data = JSON.parse(fs.readFileSync(`${dir}/pack.json`, 'utf8'));
    return Array.isArray(data?.stages) && data.stages.length > 0 ? { dir, data } : null;
  } catch {
    return null;
  }
}

/** Procedural level `index` (0-based) with the fields `resolveLevel` (main.ts) gives the engine. */
function proceduralLevel(index) {
  const { LEVELS, Track } = requireEngine();
  const def = LEVELS[index];
  return {
    label: `P${index + 1}`,
    tracks: [new Track(def.track)],
    frog: { ...def.frog },
    config: { colors: def.colors, startFraction: def.startFraction, total: def.total, target: def.target, speed: def.speed, lives: 3 },
    treasure: [],
  };
}

/** Pack level `stage`-`level` (0-based), or null when it does not exist or its curves cannot be read. */
function packLevel(pack, stage, level) {
  const { Track, configFromSettings } = requireEngine();
  const st = pack.data.stages[stage];
  if (!st || level < 0 || level >= st.levels.length) return null;
  try {
    const graphics = pack.data.graphics[st.levels[level]];
    const settings = pack.data.settings[st.settings[level]];
    if (!graphics || !Array.isArray(graphics.curveFiles) || graphics.curveFiles.length === 0) return null;
    const tracks = graphics.curveFiles.map(f => new Track(JSON.parse(fs.readFileSync(`${pack.dir}/${f}`, 'utf8')).points));
    // Same settings as the game (main.ts resolveLevel) and the research: configFromSettings, three lives.
    const config = { ...configFromSettings(settings, stage, tracks.length), lives: 3 };
    return { label: `${stage + 1}-${level + 1}`, tracks, frog: { ...graphics.frog }, config, treasure: [] };
  } catch {
    return null;
  }
}

/**
 * Levels to simulate: the pack's stage levels when `pack.json` exists (labels « S-L »), else the procedural LEVELS
 * (labels « P1 », « P2 »…). `only` keeps the listed labels in that order (a « P » label always means a procedural
 * level, an « S-L » label a pack level); unknown labels are skipped. `pack: null` forces the procedural levels; a
 * missing or unreadable pack falls back to them silently.
 */
export function simulationLevels(options = {}) {
  const { LEVELS } = requireEngine();
  const pack = readPack(options.pack === undefined ? DEFAULT_PACK : options.pack);
  if (options.only) {
    const out = [];
    for (const label of options.only) {
      const p = /^P(\d+)$/.exec(label);
      if (p) {
        const i = Number(p[1]) - 1;
        if (i >= 0 && i < LEVELS.length) out.push(proceduralLevel(i));
        continue;
      }
      const sl = /^(\d+)-(\d+)$/.exec(label);
      if (sl && pack) {
        const level = packLevel(pack, Number(sl[1]) - 1, Number(sl[2]) - 1);
        if (level) out.push(level);
      }
    }
    return out;
  }
  if (pack) {
    const out = [];
    pack.data.stages.forEach((st, s) => st.levels.forEach((_, l) => {
      const level = packLevel(pack, s, l);
      if (level) out.push(level);
    }));
    if (out.length > 0) return out;
  }
  return LEVELS.map((_, i) => proceduralLevel(i));
}

/** True when a ball (other than `targetBall`) lies across the line of fire from `from` to `target`. */
function blocked(engine, from, target, targetBall) {
  const dx = target.x - from.x;
  const dy = target.y - from.y;
  const len = Math.hypot(dx, dy);
  const ux = dx / len;
  const uy = dy / len;
  for (const chain of engine.chains) {
    for (const b of engine.alive(chain)) {
      if (b === targetBall) continue;
      const p = engine.ballPosition(b, chain);
      const t = (p.x - from.x) * ux + (p.y - from.y) * uy;
      if (t <= 20 || t >= len - 8) continue;
      if (Math.abs((p.x - from.x) * uy - (p.y - from.y) * ux) < 30) return true;
    }
  }
  return false;
}

/** Best target of `color`: pairs first, then the most advanced ball; visible, out of tunnels, free line of fire. */
function pick(engine, color) {
  let best = null;
  for (const chain of engine.chains) {
    const alive = engine.alive(chain);
    const length = chain.track.length;
    alive.forEach((b, i) => {
      if (b.color !== color || b.s < 16 || chain.track.tunnelAt(b.s)) return;
      const prev = alive[i - 1];
      const next = alive[i + 1];
      const pair = (prev?.color === color && Math.abs(prev.s - b.s) < 40) || (next?.color === color && Math.abs(next.s - b.s) < 40);
      const p = engine.ballPosition(b, chain);
      if (p.x < 0 || p.x > 640 || p.y < 0 || p.y > 480) return;
      if (blocked(engine, engine.frog, p, b)) return;
      const score = (pair ? 10 : 0) + b.s / length;
      if (!best || score > best.score) best = { score, p, pair };
    });
  }
  return best;
}

/**
 * One deterministic run. Returns { label, variant, seed, seconds, stoppedRatio, speedRatio, rearStops, insertStops,
 * shots, outcome } with outcome ∈ 'zuma' | 'won' | 'lost' | 'running'. `stoppedRatio` = share of chain-ticks of play
 * with a pusher stop running (rear removal, recoil contact or emulated insertion); `speedRatio` = mean pusher speed /
 * nominal `speed` (the end-of-track slow zone and the stops lower it).
 */
export function simulateLevel(level, { seed = 7919, variant = 'original', horizonSeconds = 240, shotTicks = 40, missRate = 0.4 } = {}) {
  if (variant !== 'original' && variant !== 'legacy-insert') throw new Error(`variante inconnue : ${variant}`);
  const { ZumaEngine } = requireEngine();
  const engine = new ZumaEngine(level.tracks, level.frog, level.config, seed);
  engine.setTreasure(level.treasure ?? []);
  const stopTicks = engine.config.pusherStopTicks;
  const horizon = Math.round(horizonSeconds * engine.config.tickHz);
  let rng = seed >>> 0;
  let nextShot = 0;
  let played = 0;
  let stopped = 0;
  let speedSum = 0;
  let targetSum = 0;
  let rearStops = 0;
  let insertStops = 0;
  let outcome = 'running';
  for (let t = 0; t < horizon; t++) {
    if (!engine.feeding && engine.state === 'playing' && t >= nextShot) {
      rng = (rng * 1103515245 + 12345) >>> 0;
      const miss = rng / 2 ** 32 < missRate;
      let choice = miss ? (pick(engine, engine.current === 0 ? 1 : 0) ?? pick(engine, engine.current)) : pick(engine, engine.current);
      if (!choice?.pair) {
        const alt = pick(engine, engine.next);
        if (alt?.pair) {
          // Swap and shot in the same tick (commands run in order); the research spent an extra unmeasured step.
          engine.command({ kind: 'swap' });
          choice = alt;
        }
      }
      if (choice) {
        engine.command({ kind: 'shoot', x: choice.p.x, y: choice.p.y });
        nextShot = t + shotTicks;
      }
    }
    const rears = engine.chains.map(ch => ch.balls[0] ?? null);
    engine.step();
    const events = engine.drainEvents();
    engine.chains.forEach((ch, i) => {
      // updatePusher decrements first, a recoil contact arms max(…, 12): a counter at exactly pusherStopTicks after
      // the step was armed this tick by the engine's own pusher stop. Removal of the rear ball → original rule.
      if (ch.stopTicks === stopTicks && ch.speed === 0) {
        const rear = rears[i];
        if (rear && !ch.balls.includes(rear)) rearStops++;
        else insertStops++; // an engine that would still stop on insertion (R2.0.20) lands here
      }
    });
    if (variant === 'legacy-insert') {
      // R2.0.20 rule emulated outside the engine: an insertion into component 0 (the segment the pusher drives) stops
      // the pusher 24 ticks. componentIds is private in TypeScript, reachable from JavaScript. Applied at the end of
      // the step instead of inside land(): only processRemovals and checkEnd ran in between, and the next moveChain
      // sees the stop either way — no effect on the comparison.
      for (const e of events) {
        if (e.kind !== 'insert' || engine.state !== 'playing') continue;
        const ch = engine.chains[e.chain ?? 0];
        const alive = engine.alive(ch);
        const idx = alive.findIndex(b => b.id === e.id);
        if (idx >= 0 && engine.componentIds(alive)[idx] === 0) {
          ch.stopTicks = Math.max(ch.stopTicks, LEGACY_STOP_TICKS);
          ch.speed = 0;
          insertStops++;
        }
      }
    }
    if (!engine.feeding && engine.state === 'playing' && !engine.zumaMode) {
      played++;
      for (const ch of engine.chains) {
        if (ch.stopTicks > 0) stopped++;
        speedSum += ch.speed ?? 0;
      }
      targetSum += engine.config.speed * engine.chains.length;
    }
    if (engine.zumaMode) { outcome = 'zuma'; break; }
    if (engine.state === 'won' || engine.state === 'clearing') { outcome = 'won'; break; }
    if (engine.state !== 'playing') { outcome = 'lost'; break; }
  }
  const n = engine.chains.length;
  return {
    label: level.label,
    variant,
    seed,
    seconds: Math.round((played / engine.config.tickHz) * 10) / 10,
    stoppedRatio: played > 0 ? stopped / (played * n) : 0,
    speedRatio: targetSum > 0 ? speedSum / targetSum : 0,
    rearStops,
    insertStops,
    shots: engine.stats.shots,
    outcome,
  };
}

const pad = (v, n) => String(v).padEnd(n);
const lpad = (v, n) => String(v).padStart(n);
const pct = v => `${(100 * v).toFixed(1)} %`;

/** Aligned French table, one line per (level, variant), means over the seeds. */
export function formatReport(results) {
  const groups = new Map();
  for (const r of results) {
    const key = `${r.label}\u0000${r.variant}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(r);
  }
  const header = `${pad('niveau', 7)}${pad('variante', 15)}${lpad('arrêt', 9)}${lpad('vitesse', 10)}${lpad('arrêts arrière', 16)}${lpad('arrêts insertion', 18)}${lpad('tirs', 7)}${lpad('temps', 9)}  issues (graines)`;
  const lines = [header];
  for (const rs of groups.values()) {
    const mean = k => rs.reduce((a, r) => a + r[k], 0) / rs.length;
    const count = o => rs.filter(r => r.outcome === o).length;
    lines.push(
      `${pad(rs[0].label, 7)}${pad(rs[0].variant, 15)}${lpad(pct(mean('stoppedRatio')), 9)}${lpad(pct(mean('speedRatio')), 10)}` +
      `${lpad(mean('rearStops').toFixed(1), 16)}${lpad(mean('insertStops').toFixed(1), 18)}${lpad(mean('shots').toFixed(0), 7)}` +
      `${lpad(`${mean('seconds').toFixed(1)} s`, 9)}  ZUMA ${count('zuma') + count('won')} · perdu ${count('lost')} · en cours ${count('running')} (${rs.length} graines)`,
    );
  }
  return `${lines.join('\n')}\n`;
}

/** Parses the CLI arguments; throws with a French message on an unknown or invalid option. */
function parseArgs(argv) {
  const opts = { levels: null, seeds: 6, horizon: 240, shot: 40, miss: 0.4, compare: false, pack: undefined };
  const positive = (name, v, integer) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0 || (integer && !Number.isInteger(n))) throw new Error(`valeur invalide pour --${name} : ${v}`);
    return n;
  };
  for (const arg of argv) {
    const m = /^--([a-z]+)(?:=(.*))?$/.exec(arg);
    const [name, value] = m ? [m[1], m[2]] : [null, null];
    if (name === 'compare' && value === undefined) opts.compare = true;
    else if (name === 'levels' && value) opts.levels = value.split(',').map(s => s.trim()).filter(Boolean);
    else if (name === 'seeds' && value) opts.seeds = positive(name, value, true);
    else if (name === 'horizon' && value) opts.horizon = positive(name, value, false);
    else if (name === 'shot' && value) opts.shot = positive(name, value, true);
    else if (name === 'miss' && value !== undefined && value !== '') {
      const miss = Number(value);
      if (!Number.isFinite(miss) || miss < 0 || miss > 1) throw new Error(`valeur invalide pour --miss : ${value}`);
      opts.miss = miss;
    } else if (name === 'pack' && value) opts.pack = value === 'none' ? null : value;
    else throw new Error(`argument inconnu : ${arg} (options : --levels=1-1,2-3 --seeds=6 --horizon=240 --shot=40 --miss=0.4 --compare --pack=<dossier>|none)`);
  }
  return opts;
}

function main(argv) {
  let opts;
  try {
    opts = parseArgs(argv);
  } catch (err) {
    console.error(`sim-difficulty : ${err.message}`);
    return 1;
  }
  if (!ENGINE) {
    console.error('sim-difficulty : modules compilés absents (.compiled/) — lancez d\'abord node tools/build.mjs');
    return 1;
  }
  let levels = simulationLevels({ pack: opts.pack, only: opts.levels ?? undefined });
  if (opts.levels) {
    const found = new Set(levels.map(l => l.label));
    const missing = opts.levels.filter(l => !found.has(l));
    if (missing.length > 0) {
      console.error(`sim-difficulty : niveau(x) introuvable(s) : ${missing.join(', ')}`);
      return 1;
    }
  } else if (readPack(opts.pack === undefined ? DEFAULT_PACK : opts.pack)) {
    // Default with the pack: the first level of every stage.
    levels = levels.filter(l => /-1$/.test(l.label));
  }
  const variants = opts.compare ? ['original', 'legacy-insert'] : ['original'];
  const results = [];
  for (const level of levels) {
    for (const variant of variants) {
      for (let k = 1; k <= opts.seeds; k++) {
        results.push(simulateLevel(level, { seed: k * 7919, variant, horizonSeconds: opts.horizon, shotTicks: opts.shot, missRate: opts.miss }));
      }
    }
  }
  console.log(`Simulation de difficulté — ${levels.length} niveau(x), ${opts.seeds} graine(s), horizon ${opts.horizon} s, tir toutes les ${opts.shot} ticks, ${Math.round(opts.miss * 100)} % de tirs sur une autre couleur`);
  process.stdout.write(formatReport(results));
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main(process.argv.slice(2));
}
