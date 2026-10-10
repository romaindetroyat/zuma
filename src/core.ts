/**
 * Zuma R2 simulation core.
 *
 * Deterministic, DOM-free and tick based. Every rule that the regression suite
 * locks lives here: stable ball identities, insertion without replacement or
 * recolouring, progressive insertion over mergeTicks (run detection deferred
 * until the slot is fully open), 40-tick destruction persistence, local recoil
 * propagated from segment to segment, attraction that only reconnects after
 * physical contact, immutable projectile colour and the four power-up families.
 *
 * A level may run several chains at once (the original "dual" boards); the
 * first chain is exposed through `balls`, `removals` and `track` for the
 * single-chain regression fixtures.
 */
export const ENGINE_VERSION = '2.0.14';

/** mulberry32: small, fast, reproducible. */
export class SeededRandom {
  private state: number;
  constructor(seed: number) {
    this.state = (seed >>> 0) || 0x9e3779b9;
  }
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

export interface Point { x: number; y: number }
/** `[x, y]` or `[x, y, layer]`; layer bit 1 = passes under a cutout, bit 2 = hidden. */
export type TrackPoint = Point | [number, number] | [number, number, number];

/** Polyline track parameterised by arc length `s` (0 at the spawn hole). */
export class Track {
  readonly points: Point[];
  readonly layers: number[];
  readonly cumulative: number[] = [0];
  readonly length: number;

  constructor(points: TrackPoint[]) {
    const pts: Point[] = [];
    const layers: number[] = [];
    for (const p of points) {
      if (Array.isArray(p)) {
        pts.push({ x: p[0], y: p[1] });
        layers.push(p[2] ?? 0);
      } else {
        pts.push({ x: p.x, y: p.y });
        layers.push(0);
      }
    }
    if (pts.length < 2) throw new Error('Track needs at least two points');
    this.points = pts;
    this.layers = layers;
    let acc = 0;
    for (let i = 1; i < pts.length; i++) {
      acc += Math.hypot(pts[i].x - pts[i - 1].x, pts[i].y - pts[i - 1].y);
      this.cumulative.push(acc);
    }
    this.length = acc;
  }

  private locate(s: number): { i: number; t: number } {
    const last = this.points.length - 2;
    if (s <= 0) {
      const seg = this.cumulative[1];
      return { i: 0, t: seg > 0 ? s / seg : 0 };
    }
    if (s >= this.length) {
      const seg = this.cumulative[last + 1] - this.cumulative[last];
      return { i: last, t: seg > 0 ? 1 + (s - this.length) / seg : 1 };
    }
    let lo = 0;
    let hi = this.cumulative.length - 1;
    while (hi - lo > 1) {
      const mid = (lo + hi) >> 1;
      if (this.cumulative[mid] <= s) lo = mid;
      else hi = mid;
    }
    const seg = this.cumulative[lo + 1] - this.cumulative[lo];
    return { i: lo, t: seg > 0 ? (s - this.cumulative[lo]) / seg : 0 };
  }

  /** Position for `s`; values outside [0,length] are extrapolated along the end segments. */
  pointAt(s: number): Point {
    const { i, t } = this.locate(s);
    const a = this.points[i];
    const b = this.points[i + 1];
    return { x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t };
  }

  tangentAt(s: number): Point {
    const { i } = this.locate(s);
    const a = this.points[i];
    const b = this.points[i + 1];
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const l = Math.hypot(dx, dy) || 1;
    return { x: dx / l, y: dy / l };
  }

  /** Layer flags of the segment containing `s` (0 = ordinary surface). */
  layerAt(s: number): number {
    if (s < 0 || s > this.length) return 0;
    const { i, t } = this.locate(s);
    return this.layers[t < 0.5 ? i : Math.min(i + 1, this.layers.length - 1)];
  }

  /** Closest arc-length parameter to an arbitrary point, with the distance to the track. */
  nearest(p: Point): { s: number; dist: number } {
    let best = { s: 0, dist: Infinity };
    for (let i = 0; i + 1 < this.points.length; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const len2 = dx * dx + dy * dy;
      const t = len2 > 0 ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len2)) : 0;
      const x = a.x + dx * t;
      const y = a.y + dy * t;
      const dist = Math.hypot(p.x - x, p.y - y);
      if (dist < best.dist) best = { s: this.cumulative[i] + Math.sqrt(len2) * t, dist };
    }
    return best;
  }
}

export type PowerKind = 'bomb' | 'slow' | 'backwards' | 'accuracy';
export const POWER_KINDS: readonly PowerKind[] = ['bomb', 'slow', 'backwards', 'accuracy'];

export interface Ball {
  id: number;
  color: number;
  s: number;
  /**
   * Share of the slot the ball occupies, 0..1. A shot ball lands at 0 and grows by
   * 1 / mergeTicks per tick, pushing its neighbours apart progressively; every
   * other ball is created at 1. Spacing constraints weigh neighbours by width.
   */
  width: number;
  /** Landing point of a shot ball while it is still opening its slot (width < 1). */
  enterFrom?: Point;
  /** Tick at which the logical removal is due. Present only while the ball is exploding. */
  destroyingUntil?: number;
  power?: PowerKind;
  powerUntil?: number;
  /** Combo depth inherited from the destruction that opened the gap next to this ball. */
  comboDepth?: number;
}

export interface Projectile {
  id: number;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  gaps: number;
  gapKeys: string[];
}

export interface Removal {
  ids: number[];
  leftId: number | null;
  rightId: number | null;
  shotId: number;
  depth: number;
  due: number;
}

export interface GameEvent {
  tick: number;
  kind: string;
  [key: string]: unknown;
}

export type Command =
  | { kind: 'shoot'; x: number; y: number }
  | { kind: 'swap' }
  | { kind: 'aim'; x: number; y: number };

export type EngineState = 'playing' | 'draining' | 'lost' | 'gameover' | 'won';

export interface EngineConfig {
  /** Simulation rate. Timings below are expressed in ticks or in px/s. */
  tickHz: number;
  width: number;
  height: number;
  ballRadius: number;
  ballSpacing: number;
  /** Number of colours in play (indexes 0..colors-1). */
  colors: number;
  /** Balls fed at the fast intro speed before the chain settles to `speed`. */
  start: number;
  /** Total balls streamed per chain (Infinity streams until ZUMA mode). */
  total: number;
  /** Destroyed balls needed to enter ZUMA mode (feed stops). */
  target: number;
  /** Probability that a streamed ball repeats the previous colour (original `repeat` %, 0..1). */
  repeatChance: number;
  /** Probability that a streamed ball is isolated — different from both its neighbours (original `single` %, 0..1). */
  singleChance: number;
  speed: number;
  feedSpeed: number;
  drainSpeed: number;
  /** Projectile speed in px per tick. */
  projectileSpeed: number;
  /** Distance from the frog centre to the projectile start point (the mouth), in px. */
  muzzleOffset: number;
  /** Ticks a landed ball takes to open its slot (original mergespeed 0.05 at 100 Hz = 0.2 s). */
  mergeTicks: number;
  accuracySpeedFactor: number;
  fireCooldownTicks: number;
  destroyTicks: number;
  attractSpeed: number;
  recoilSpeed: number;
  recoilTicks: number;
  slowFactor: number;
  slowTicks: number;
  backwardsSpeed: number;
  backwardsTicks: number;
  accuracyTicks: number;
  bombRadius: number;
  /** Per-tick probability of a power appearing once the guard has elapsed. */
  powerChance: number;
  /** Minimum interval between two power-up appearances. */
  powerGuardTicks: number;
  /** How long a power stays attached to its ball before fading. */
  powerVisibleTicks: number;
  lives: number;
  levelBonus: number;
}

export const CANDIDATE: EngineConfig = {
  tickHz: 60,
  width: 640,
  height: 480,
  ballRadius: 16,
  ballSpacing: 32,
  colors: 4,
  start: 20,
  total: 60,
  target: 40,
  repeatChance: 0.5,
  singleChance: 0,
  speed: 24,
  feedSpeed: 360,
  drainSpeed: 520,
  projectileSpeed: 12,
  muzzleOffset: 16,
  mergeTicks: 12,
  accuracySpeedFactor: 1.5,
  fireCooldownTicks: 8,
  destroyTicks: 40,
  attractSpeed: 240,
  recoilSpeed: 90,
  recoilTicks: 8,
  slowFactor: 4,
  slowTicks: 600,
  backwardsSpeed: 120,
  backwardsTicks: 240,
  accuracyTicks: 600,
  bombRadius: 72,
  powerChance: 0.004,
  powerGuardTicks: 150,
  powerVisibleTicks: 480,
  lives: 3,
  levelBonus: 1000,
};

export interface Fixture {
  balls: Array<{ color: number; s: number; power?: PowerKind }>;
  current?: number;
  next?: number;
  stream?: boolean;
}

export interface Stats {
  shots: number;
  hits: number;
  misses: number;
  matches: number;
  destroyed: number;
  maxCombo: number;
  maxStreak: number;
  gaps: number;
  /** Destructions caused by a previous destruction (combo depth > 1) — the STATS « COMBOS » line. */
  combos: number;
  powers: Record<PowerKind, number>;
}

/** One ball chain rolling along one track. */
export class Chain {
  balls: Ball[] = [];
  removals: Removal[] = [];
  recoils: Array<{ id: number; ticks: number }> = [];
  spawned = 0;
  lastSpawnColor = -1;
  /** Armed after a `single`: the next streamed ball must differ from the isolated one. */
  forceDifferent = false;
  constructor(readonly track: Track, readonly index: number) {}
}

const CONTACT_EPS = 0.5;

export class ZumaEngine {
  readonly config: EngineConfig;
  readonly rng: SeededRandom;
  readonly chains: Chain[];
  tick = 0;
  state: EngineState = 'playing';
  projectiles: Projectile[] = [];
  events: GameEvent[] = [];
  current: number;
  next: number;
  /** Fast intro feed in progress. */
  feeding = true;
  /** New balls are streamed from the spawn holes. */
  stream = true;
  destroyedCount = 0;
  zumaMode = false;
  score = 0;
  lives: number;
  streak = 0;
  slowTicks = 0;
  backwardsTicks = 0;
  accuracyTicks = 0;
  aim: Point;
  stats: Stats = {
    shots: 0, hits: 0, misses: 0, matches: 0, destroyed: 0, maxCombo: 0, maxStreak: 0, gaps: 0, combos: 0,
    powers: { bomb: 0, slow: 0, backwards: 0, accuracy: 0 },
  };

  private commands: Command[] = [];
  private nextId = 1;
  private lastShotTick = -Infinity;
  private lastPowerTick = -Infinity;

  constructor(track: Track | Track[], readonly frog: Point, config: Partial<EngineConfig> = {}, seed = 1) {
    const tracks = Array.isArray(track) ? track : [track];
    if (tracks.length === 0) throw new Error('at least one track is required');
    this.chains = tracks.map((t, i) => new Chain(t, i));
    this.config = { ...CANDIDATE, ...config };
    this.rng = new SeededRandom(seed);
    this.lives = this.config.lives;
    this.aim = { x: frog.x, y: frog.y - 1 };
    this.current = this.rng.int(this.config.colors);
    this.next = this.rng.int(this.config.colors);
  }

  // ------------------------------------------------- first-chain conveniences

  get track(): Track {
    return this.chains[0].track;
  }
  get balls(): Ball[] {
    return this.chains[0].balls;
  }
  set balls(value: Ball[]) {
    this.chains[0].balls = value;
  }
  get removals(): Removal[] {
    return this.chains[0].removals;
  }
  set removals(value: Removal[]) {
    this.chains[0].removals = value;
  }
  get spawned(): number {
    return this.chains.reduce((n, c) => n + c.spawned, 0);
  }

  // ----------------------------------------------------------------- queries

  /** Balls that still take part in the chain (not exploding), rear to front. */
  alive(chain: Chain = this.chains[0]): Ball[] {
    return chain.balls.filter(b => b.destroyingUntil === undefined);
  }

  ballPosition(ball: Ball, chain: Chain = this.chains[0]): Point {
    return chain.track.pointAt(ball.s);
  }

  /** All balls of every chain. */
  allBalls(): Ball[] {
    return this.chains.flatMap(c => c.balls);
  }

  presentColors(): number[] {
    const set = new Set<number>();
    for (const c of this.chains) for (const b of c.balls) if (b.destroyingUntil === undefined) set.add(b.color);
    return [...set].sort((a, b) => a - b);
  }

  /** Returns and clears the pending events (presentation layer drain). */
  drainEvents(): GameEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  // ---------------------------------------------------------------- commands

  command(cmd: Command): void {
    this.commands.push(cmd);
  }

  loadFixture(fixture: Fixture, chain: Chain = this.chains[0]): void {
    chain.balls = fixture.balls.map(b => ({ id: this.nextId++, color: b.color, s: b.s, width: 1, ...(b.power ? { power: b.power } : {}) }));
    chain.spawned = chain.balls.length;
    chain.removals = [];
    chain.recoils = [];
    if (fixture.current !== undefined) this.current = fixture.current;
    if (fixture.next !== undefined) this.next = fixture.next;
    this.stream = fixture.stream ?? true;
    this.projectiles = [];
    this.events = [];
  }

  /**
   * Inserts `ball` at chain index `index` with arc parameter `s`, then pushes the
   * balls in front of it forward until nothing overlaps. Existing balls keep their
   * identity, colour and relative order; nothing is replaced or recoloured.
   */
  insert(index: number, ball: { id: number; color: number; power?: PowerKind }, _pos: Point, s: number, chain: Chain = this.chains[0]): Ball {
    const idx = Math.max(0, Math.min(chain.balls.length, index));
    const inserted: Ball = { id: ball.id, color: ball.color, s, width: 1 };
    if (ball.power) inserted.power = ball.power;
    chain.balls.splice(idx, 0, inserted);
    this.resolveForward(this.alive(chain));
    return inserted;
  }

  /**
   * Gameplay insertion: the ball lands with `width` 0 and opens its slot over
   * `mergeTicks`, pushing the balls ahead a little further each tick. Same splice
   * and identity guarantees as `insert`; the run check happens in `settle`.
   */
  private insertGrowing(index: number, ball: { id: number; color: number }, from: Point, s: number, chain: Chain): Ball {
    const idx = Math.max(0, Math.min(chain.balls.length, index));
    const inserted: Ball = { id: ball.id, color: ball.color, s, width: 0, enterFrom: { x: from.x, y: from.y } };
    chain.balls.splice(idx, 0, inserted);
    this.resolveForward(this.alive(chain));
    return inserted;
  }

  /** Test hook: attaches `power` to the ball at `index` and triggers it immediately. */
  activatePowerForTest(power: PowerKind, index = 0, chain: Chain = this.chains[0]): void {
    const ball = chain.balls[index];
    if (!ball) throw new Error(`no ball at index ${index}`);
    ball.power = power;
    this.activatePower(ball, chain);
  }

  // -------------------------------------------------------------------- step

  step(): void {
    this.tick++;
    this.processCommands();
    this.tickPowers();
    for (const chain of this.chains) this.spawnBalls(chain);
    for (const chain of this.chains) this.moveChain(chain);
    this.moveProjectiles();
    this.processRemovals();
    this.maybeSpawnPower();
    this.checkEnd();
  }

  private emit(kind: string, data: Record<string, unknown> = {}): void {
    this.events.push({ tick: this.tick, kind, ...data });
  }

  private processCommands(): void {
    const queue = this.commands;
    this.commands = [];
    for (const cmd of queue) {
      if (cmd.kind === 'aim') {
        this.aim = { x: cmd.x, y: cmd.y };
      } else if (cmd.kind === 'swap') {
        if (this.state !== 'playing') continue;
        [this.current, this.next] = [this.next, this.current];
        this.emit('swap');
      } else if (cmd.kind === 'shoot') {
        this.aim = { x: cmd.x, y: cmd.y };
        this.shoot(cmd.x, cmd.y);
      }
    }
  }

  private shoot(x: number, y: number): void {
    if (this.state !== 'playing') return;
    if (this.tick - this.lastShotTick < this.config.fireCooldownTicks) return;
    const dx = x - this.frog.x;
    const dy = y - this.frog.y;
    const len = Math.hypot(dx, dy);
    if (len === 0) return;
    const speed = this.config.projectileSpeed * (this.accuracyTicks > 0 ? this.config.accuracySpeedFactor : 1);
    const projectile: Projectile = {
      id: this.nextId++,
      color: this.current,
      x: this.frog.x + (dx / len) * this.config.muzzleOffset,
      y: this.frog.y + (dy / len) * this.config.muzzleOffset,
      vx: (dx / len) * speed,
      vy: (dy / len) * speed,
      gaps: 0,
      gapKeys: [],
    };
    this.projectiles.push(projectile);
    this.lastShotTick = this.tick;
    this.stats.shots++;
    this.current = this.next;
    this.next = this.nextAmmo();
    this.emit('fire', { color: projectile.color });
  }

  /** Ammo colour filtering: only colours still present in the chains are offered. */
  private nextAmmo(): number {
    const present = this.presentColors();
    if (present.length === 0) return this.rng.int(this.config.colors);
    return present[this.rng.int(present.length)];
  }

  private tickPowers(): void {
    if (this.slowTicks > 0) this.slowTicks--;
    if (this.backwardsTicks > 0) this.backwardsTicks--;
    if (this.accuracyTicks > 0) this.accuracyTicks--;
    for (const b of this.allBalls()) {
      if (b.power && b.powerUntil !== undefined && b.powerUntil <= this.tick) {
        delete b.power;
        delete b.powerUntil;
      }
    }
  }

  private spawnBalls(chain: Chain): void {
    if (!this.stream || this.zumaMode || this.state !== 'playing') return;
    while (chain.spawned < this.config.total) {
      let rear: Ball | undefined;
      for (const b of chain.balls) if (!rear || b.s < rear.s) rear = b;
      const s = rear ? rear.s - this.config.ballSpacing : 0;
      if (rear && s < -this.config.ballSpacing) break;
      const ball: Ball = { id: this.nextId++, color: this.spawnColor(chain), s, width: 1 };
      chain.balls.unshift(ball);
      chain.spawned++;
    }
    if (this.feeding && this.chains.every(c => c.spawned >= this.config.start)) this.feeding = false;
  }

  /**
   * Streamed colour, driven by the original `repeat` / `single` settings: a ball repeats the
   * previous colour with `repeatChance` (runs of any length can appear), or is isolated with
   * `singleChance` (differs from the previous ball and forces the next one to differ too).
   * The first ball of a chain is uniformly random.
   */
  private spawnColor(chain: Chain): number {
    const n = this.config.colors;
    const prev = chain.lastSpawnColor;
    const differentFromPrev = (): number => {
      let c = this.rng.int(n);
      if (n > 1 && c === prev) c = (c + 1 + this.rng.int(n - 1)) % n;
      return c;
    };
    let c: number;
    if (prev < 0) {
      c = this.rng.int(n);
    } else if (chain.forceDifferent) {
      chain.forceDifferent = false;
      c = differentFromPrev();
    } else if (this.rng.next() < this.config.singleChance) {
      chain.forceDifferent = true;
      c = differentFromPrev();
    } else if (this.rng.next() < this.config.repeatChance) {
      c = prev;
    } else {
      c = differentFromPrev();
    }
    chain.lastSpawnColor = c;
    return c;
  }

  // ------------------------------------------------------------------ chain

  /** Arc distance two neighbours need between their centres, weighted by their widths. */
  private gap(a: Ball, b: Ball): number {
    return this.config.ballSpacing * (a.width + b.width) / 2;
  }

  private componentIds(alive: Ball[]): number[] {
    const ids = new Array<number>(alive.length);
    let c = 0;
    for (let i = 0; i < alive.length; i++) {
      if (i > 0 && alive[i].s - alive[i - 1].s > this.gap(alive[i - 1], alive[i]) + CONTACT_EPS) c++;
      ids[i] = c;
    }
    return ids;
  }

  /** Pushes overlapping balls forward (towards the skull), propagating through contacts. */
  private resolveForward(alive: Ball[]): void {
    for (let i = 1; i < alive.length; i++) {
      const min = alive[i - 1].s + this.gap(alive[i - 1], alive[i]);
      if (alive[i].s < min) alive[i].s = min;
    }
  }

  /** Pushes balls behind `from` backwards while they overlap; returns the lowest index moved. */
  private resolveBackward(alive: Ball[], from: number): number {
    let lowest = from;
    for (let i = from - 1; i >= 0; i--) {
      const max = alive[i + 1].s - this.gap(alive[i], alive[i + 1]);
      if (alive[i].s > max) {
        alive[i].s = max;
        lowest = i;
      } else break;
    }
    return lowest;
  }

  private moveChain(chain: Chain): void {
    const dt = 1 / this.config.tickHz;
    if (this.state === 'draining') {
      for (const b of chain.balls) b.s += this.config.drainSpeed * dt;
      chain.balls = chain.balls.filter(b => b.s <= chain.track.length + this.config.ballSpacing);
      return;
    }
    if (this.state !== 'playing') return;
    const alive = this.alive(chain);
    const n = alive.length;
    if (n === 0) return;
    // Landed balls open their slot a little more each tick; the rest of the tick
    // (components, recoil, pusher, attraction, contacts) sees the updated widths.
    const settled: Ball[] = [];
    for (const b of alive) {
      if (b.width >= 1) continue;
      b.width = Math.min(1, b.width + 1 / this.config.mergeTicks);
      if (b.width > 1 - 1e-9) {
        b.width = 1;
        delete b.enterFrom;
        settled.push(b);
      }
    }
    const before = this.componentIds(alive);
    const first: number[] = [];
    const last: number[] = [];
    for (let i = 0; i < n; i++) {
      if (first[before[i]] === undefined) first[before[i]] = i;
      last[before[i]] = i;
    }
    const compCount = before[n - 1] + 1;
    const shift = (c: number, d: number): void => {
      for (let i = first[c]; i <= last[c]; i++) alive[i].s += d;
    };

    if (this.backwardsTicks > 0) {
      for (const b of alive) b.s -= this.config.backwardsSpeed * dt;
    } else {
      // Local recoil: the segment behind a fresh gap rolls back and pushes whatever it touches.
      const recoiling = new Set<number>();
      for (const r of chain.recoils) {
        const idx = alive.findIndex(b => b.id === r.id);
        if (idx >= 0) recoiling.add(before[idx]);
        r.ticks--;
      }
      chain.recoils = chain.recoils.filter(r => r.ticks > 0);
      let pusherBlocked = recoiling.has(0);
      for (const c of recoiling) {
        shift(c, -this.config.recoilSpeed * dt);
        if (this.resolveBackward(alive, first[c]) === 0) pusherBlocked = true;
      }
      if (!pusherBlocked) {
        let v = this.feeding ? this.config.feedSpeed : this.config.speed;
        if (this.slowTicks > 0) v /= this.config.slowFactor;
        shift(0, v * dt);
      }
      // Attraction: a segment whose rear colour matches the front colour of the segment
      // behind it rolls back; it only reconnects once the balls physically touch.
      for (let c = 1; c < compCount; c++) {
        if (recoiling.has(c)) continue;
        const rear = alive[first[c]];
        const prevFront = alive[last[c - 1]];
        if (rear.color !== prevFront.color) continue;
        const room = rear.s - (prevFront.s + this.gap(prevFront, rear));
        const d = Math.min(room, this.config.attractSpeed * dt);
        if (d > 0) shift(c, -d);
      }
    }

    this.resolveForward(alive);

    const after = this.componentIds(alive);
    for (let i = 1; i < n; i++) {
      if (after[i] === after[i - 1] && before[i] !== before[i - 1]) this.onJunction(chain, alive, i);
    }

    // Balls whose slot just opened are evaluated for a match only now.
    for (const ball of settled) this.settle(chain, ball);
  }

  /** Two segments just came into contact between alive[i-1] and alive[i]. */
  private onJunction(chain: Chain, alive: Ball[], i: number): void {
    const left = alive[i - 1];
    const right = alive[i];
    const depth = Math.max(left.comboDepth ?? 0, right.comboDepth ?? 0);
    delete left.comboDepth;
    delete right.comboDepth;
    this.emit('merge', { leftId: left.id, rightId: right.id, chain: chain.index });
    // A ball still opening its slot does not take part in a run; `settle` will check it.
    if (left.width < 1 || right.width < 1) return;
    if (left.color !== right.color) return;
    const run = this.runAround(alive, i);
    if (run.length < 3) return;
    this.destroyRun(chain, alive, run, depth > 0 ? depth + 1 : 1, 0);
  }

  /**
   * A shot ball has finished opening its slot (width = 1): this is where the
   * match it may complete is evaluated, hits/streak accounted and the run destroyed.
   */
  private settle(chain: Chain, ball: Ball): void {
    if (ball.destroyingUntil !== undefined) return;
    const alive = this.alive(chain);
    const index = alive.indexOf(ball);
    if (index < 0) return;
    const run = this.runAround(alive, index);
    if (run.length >= 3) {
      this.stats.hits++;
      this.streak++;
      this.stats.maxStreak = Math.max(this.stats.maxStreak, this.streak);
      this.destroyRun(chain, alive, run, 1, ball.id);
      if (this.streak >= 5) {
        const pos = this.ballPosition(ball, chain);
        this.score += 50 * (this.streak - 4);
        this.emit('streak', { streak: this.streak, x: pos.x, y: pos.y });
      }
    } else {
      this.streak = 0;
    }
  }

  /** Same-colour balls in contact around `index`; balls still opening their slot end the run. */
  private runAround(alive: Ball[], index: number): Ball[] {
    const color = alive[index].color;
    const touching = (a: Ball, b: Ball): boolean => b.s - a.s <= this.gap(a, b) + CONTACT_EPS;
    let lo = index;
    let hi = index;
    while (lo > 0 && alive[lo - 1].color === color && alive[lo - 1].width >= 1 && touching(alive[lo - 1], alive[lo])) lo--;
    while (hi + 1 < alive.length && alive[hi + 1].color === color && alive[hi + 1].width >= 1 && touching(alive[hi], alive[hi + 1])) hi++;
    return alive.slice(lo, hi + 1);
  }

  private destroyRun(chain: Chain, alive: Ball[], run: Ball[], depth: number, shotId: number): void {
    const until = this.tick + this.config.destroyTicks;
    const lo = alive.indexOf(run[0]);
    const hi = alive.indexOf(run[run.length - 1]);
    const left = lo > 0 ? alive[lo - 1] : null;
    const right = hi + 1 < alive.length ? alive[hi + 1] : null;
    for (const b of run) b.destroyingUntil = until;
    if (left) left.comboDepth = depth;
    if (right) right.comboDepth = depth;
    chain.removals.push({ ids: run.map(b => b.id), leftId: left?.id ?? null, rightId: right?.id ?? null, shotId, depth, due: until });
    if (left) chain.recoils.push({ id: left.id, ticks: this.config.recoilTicks });

    const centre = this.ballPosition(run[Math.floor(run.length / 2)], chain);
    const points = 10 * run.length + 10 * Math.max(0, run.length - 3) + (depth > 1 ? 100 * (depth - 1) : 0);
    this.score += points;
    this.stats.matches++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, depth);
    if (depth > 1) this.stats.combos++;
    this.emit('destroy', { depth, count: run.length, color: run[0].color, x: centre.x, y: centre.y, points, ids: run.map(b => b.id), chain: chain.index });
    this.registerDestroyed(run.length);
    for (const b of run) if (b.power) this.activatePower(b, chain);
  }

  private registerDestroyed(count: number): void {
    this.destroyedCount += count;
    this.stats.destroyed += count;
    if (!this.zumaMode && this.destroyedCount >= this.config.target) {
      this.zumaMode = true;
      this.emit('zuma');
    }
  }

  // ------------------------------------------------------------- power-ups

  private maybeSpawnPower(): void {
    if (this.state !== 'playing') return;
    if (this.tick - this.lastPowerTick < this.config.powerGuardTicks) return;
    if (this.allBalls().some(b => b.power)) return;
    if (this.rng.next() >= this.config.powerChance) return;
    const candidates: Array<{ ball: Ball; chain: Chain }> = [];
    for (const chain of this.chains) {
      for (const ball of this.alive(chain)) if (ball.s > 0 && ball.s < chain.track.length) candidates.push({ ball, chain });
    }
    if (candidates.length === 0) return;
    const { ball, chain } = candidates[this.rng.int(candidates.length)];
    const roll = this.rng.next();
    ball.power = roll < 0.3 ? 'bomb' : roll < 0.6 ? 'slow' : roll < 0.85 ? 'backwards' : 'accuracy';
    ball.powerUntil = this.tick + this.config.powerVisibleTicks;
    this.lastPowerTick = this.tick;
    this.emit('power-spawn', { power: ball.power, id: ball.id, chain: chain.index });
  }

  private activatePower(ball: Ball, chain: Chain): void {
    const power = ball.power;
    if (!power) return;
    delete ball.power;
    delete ball.powerUntil;
    const pos = this.ballPosition(ball, chain);
    this.stats.powers[power]++;
    this.emit('power-activate', { power, x: pos.x, y: pos.y });
    switch (power) {
      case 'bomb':
        this.blast(pos);
        break;
      case 'slow':
        this.slowTicks = this.config.slowTicks;
        break;
      case 'backwards':
        this.backwardsTicks = this.config.backwardsTicks;
        break;
      case 'accuracy':
        this.accuracyTicks = this.config.accuracyTicks;
        break;
    }
  }

  private blast(centre: Point): void {
    const until = this.tick + this.config.destroyTicks;
    let total = 0;
    const chained: Array<{ ball: Ball; chain: Chain }> = [];
    for (const chain of this.chains) {
      const victims = this.alive(chain).filter(b => {
        const p = this.ballPosition(b, chain);
        return Math.hypot(p.x - centre.x, p.y - centre.y) <= this.config.bombRadius;
      });
      if (victims.length === 0) continue;
      for (const b of victims) {
        b.destroyingUntil = until;
        if (b.power) chained.push({ ball: b, chain });
      }
      chain.removals.push({ ids: victims.map(b => b.id), leftId: null, rightId: null, shotId: 0, depth: 1, due: until });
      total += victims.length;
    }
    if (total > 0) {
      this.score += 10 * total;
      this.registerDestroyed(total);
    }
    this.emit('power-bomb', { x: centre.x, y: centre.y, count: total });
    for (const { ball, chain } of chained) this.activatePower(ball, chain);
  }

  // ------------------------------------------------------------ projectiles

  private moveProjectiles(): void {
    const { width, height, ballRadius, ballSpacing } = this.config;
    const margin = ballSpacing * 2;
    const keep: Projectile[] = [];
    for (const p of this.projectiles) {
      p.x += p.vx;
      p.y += p.vy;
      if (p.x < -margin || p.y < -margin || p.x > width + margin || p.y > height + margin) {
        this.streak = 0;
        this.stats.misses++;
        this.emit('miss', { id: p.id });
        continue;
      }
      let hit: Ball | undefined;
      let hitChain: Chain | undefined;
      let bestDist = Infinity;
      for (const chain of this.chains) {
        const alive = this.alive(chain);
        this.trackGap(p, chain, alive);
        for (const b of alive) {
          if (b.s < 0 || b.s > chain.track.length) continue;
          const bp = chain.track.pointAt(b.s);
          const d = Math.hypot(p.x - bp.x, p.y - bp.y);
          if (d < 2 * ballRadius && d < bestDist) {
            bestDist = d;
            hit = b;
            hitChain = chain;
          }
        }
      }
      if (hit && hitChain) this.land(p, hit, hitChain);
      else keep.push(p);
    }
    this.projectiles = keep;
  }

  /** Counts the gaps between separated segments a projectile flies through. */
  private trackGap(p: Projectile, chain: Chain, alive: Ball[]): void {
    const near = chain.track.nearest(p);
    if (near.dist > this.config.ballRadius) return;
    let prev: Ball | undefined;
    let next: Ball | undefined;
    for (const b of alive) {
      if (b.s <= near.s) prev = b;
      else { next = b; break; }
    }
    if (!prev || !next) return;
    const spacing = this.config.ballSpacing;
    if (next.s - prev.s <= 2 * spacing) return;
    if (near.s - prev.s < spacing * 0.75 || next.s - near.s < spacing * 0.75) return;
    const key = `${chain.index}:${prev.id}`;
    if (p.gapKeys.includes(key)) return;
    p.gapKeys.push(key);
    p.gaps++;
  }

  private land(p: Projectile, hit: Ball, chain: Chain): void {
    const bp = chain.track.pointAt(hit.s);
    const t = chain.track.tangentAt(hit.s);
    const ahead = (p.x - bp.x) * t.x + (p.y - bp.y) * t.y >= 0;
    const globalIdx = chain.balls.indexOf(hit);
    const index = ahead ? globalIdx + 1 : globalIdx;
    // A zero-width ball sits half a spacing from the hit ball; it grows into a full slot.
    const half = this.config.ballSpacing / 2;
    const s = ahead ? hit.s + half : hit.s - half;
    const ball = this.insertGrowing(index, { id: p.id, color: p.color }, { x: p.x, y: p.y }, s, chain);
    this.emit('insert', { id: ball.id, color: ball.color, x: bp.x, y: bp.y, chain: chain.index });
    if (p.gaps > 0) {
      this.stats.gaps += p.gaps;
      this.score += 100 * p.gaps;
      this.emit('gap', { count: p.gaps, x: bp.x, y: bp.y });
    }
    // The run check is deferred to `settle`, once the slot is fully open (mergeTicks later).
  }

  // --------------------------------------------------------------- removals

  private processRemovals(): void {
    let changed = false;
    for (const chain of this.chains) {
      if (chain.removals.length === 0) continue;
      const due = chain.removals.filter(r => r.due <= this.tick);
      if (due.length === 0) continue;
      chain.removals = chain.removals.filter(r => r.due > this.tick);
      const gone = new Set<number>();
      for (const r of due) for (const id of r.ids) gone.add(id);
      chain.balls = chain.balls.filter(b => !(gone.has(b.id) && b.destroyingUntil !== undefined));
      changed = true;
    }
    if (changed) this.refreshAmmo();
  }

  /** Ammo whose colour vanished from the chains is replaced by one that is still present. */
  private refreshAmmo(): void {
    const present = this.presentColors();
    if (present.length === 0) return;
    if (!present.includes(this.current)) {
      this.current = present[this.rng.int(present.length)];
      this.emit('recolor', { slot: 'current', color: this.current });
    }
    if (!present.includes(this.next)) {
      this.next = present[this.rng.int(present.length)];
      this.emit('recolor', { slot: 'next', color: this.next });
    }
  }

  // -------------------------------------------------------------- end states

  private checkEnd(): void {
    if (this.state === 'playing') {
      for (const chain of this.chains) {
        for (const b of chain.balls) {
          if (b.destroyingUntil === undefined && b.s >= chain.track.length) {
            this.lives--;
            this.state = 'draining';
            this.projectiles = [];
            for (const c of this.chains) c.recoils = [];
            this.emit('lost', { lives: this.lives, chain: chain.index });
            return;
          }
        }
      }
      const empty = this.chains.every(c => c.balls.length === 0 && c.removals.length === 0);
      if (this.zumaMode && empty) {
        this.state = 'won';
        this.score += this.config.levelBonus;
        this.emit('won', { score: this.score });
      }
    } else if (this.state === 'draining' && this.chains.every(c => c.balls.length === 0)) {
      this.state = this.lives < 0 ? 'gameover' : 'lost';
      this.emit(this.state);
    }
  }
}
