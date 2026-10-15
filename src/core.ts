/**
 * Zuma R2 simulation core.
 *
 * Deterministic, DOM-free and tick based. Every rule that the regression suite
 * locks lives here: stable ball identities, insertion without replacement or
 * recolouring, progressive insertion over mergeTicks (run detection deferred
 * until the slot is fully open), immutable projectile colour, the four power-up families,
 * coins on the treasure points (one at a time, free once the chain head passed `dist` %, grabbed by a
 * projectile without breaking the streak), and — from R2.0.16, transcribed from
 * the original executable (05-RESEARCH.md) — the pusher kinematics (±50 / 1000
 * px/s² ramp, 24-tick pusher stop, end-of-track slow zone), the computed fast feed from `start` % with « PARTEZ » on the speed
 * condition and the level clock from `go`, the `repeat` / `single` colour
 * generation, the per-tick ammo refresh, the conditional ZUMA rollback (> 50 %
 * coverage) and the end-of-level tally (60 px / 2.4 ticks / +100, level bonus per
 * curve at clearing, ACE TIME bonus credited by the STATS count-up). From R2.0.17
 * (05-RESEARCH-02.md, D-22): the gap bonus is computed at the insertion from the
 * narrowest gap crossed (`gapBonusPoints`), armed on the ball and paid by the match
 * that destroys it (kept while the ball waits across a gap from its colour, cleared
 * otherwise — R2.0.24); a match scores 10 × n + 100 × combo + gap bonus, plus (chain + 5) × 10
 * from the 5th consecutive hit on a direct match. From R2.0.18 (05-RESEARCH-03.md, D-23 / D-27 / D-28 /
 * D-30): CURV byte A marks tunnel points (a ball there cannot be hit, the nearest-point search skips
 * them) and byte B the draw priority 0..3; one life per multiple of `extraLifeEvery` (50 000) crossed,
 * with no cap; coins stay 10 s and are attempted at 1/180 per tick from 780 ticks after the previous
 * appearance, never in ZUMA mode, on points whose chain head passed `dist` % of the curve; the
 * end-of-level tally walks one marker per chain, all together. From R2.0.24 (scoring audit, 0x414c60 / 0x421d55 /
 * 0x408e30): the gap detector samples the curve every 32 px (radius 16) on the updates without collision, measures
 * the gap between the CENTRES of the two list neighbours (exploding balls included) and drops the gap the ball lands
 * in; a ball landing without a match across a gap from its colour (centres ≥ 42 px apart) is « waiting »: it keeps
 * its gap bonus and the chain, adds 1 to the chain when destroyed (the contact match then pays the chain bonus), and
 * a contact that leaves it alive resets the chain. From R2.0.19 (05-RESEARCH-04.md, D-34): a
 * destroyed ball stays 40 maj (24 ticks) and nothing moves meanwhile; when it is removed between two balls of one
 * colour the front segment is attracted back by a counter v (⌊v/8⌋ px per maj, then v + 1, no cap), also armed
 * (v = 1) by a shot ball that lands without a match against a gap of its colour; only the contact of an attraction
 * makes the chain recoil (the most advanced ball of the arrived segment rolls back for 30 maj at max(0.5, 1.5 ×
 * depth) px/maj, pushing the whole chain behind it and stopping the pusher) — no recoil at match time. D-35: at
 * ZUMA mode only the chains whose head covers more than half of their track roll back — the head at 100 px/s for
 * 300 maj at most, pushing the balls behind it, the pusher stopped, a ×0.25 slowdown per chain, all reset once the
 * head is under 50 px — and in ZUMA mode a ball passing below s = 1 is deleted (`ball-exit`). D-31: a coin is
 * grabbed within 36 px and consumes the projectile. A game has `lives` frogs: a loss does lives − 1 and the game is
 * over at 0. From R2.0.21 (06-RESEARCH.md Q5c, D-09): the 24-tick pusher stop (40 maj) is armed only when the
 * rearmost ball of a chain — the one the pusher pushes — is removed at the end of its destruction (0x423a10), never
 * by an insertion.
 *
 * Units: the original runs at 100 Hz (1 maj = 10 ms); the engine at `tickHz` 60.
 * maj × 0.6 = ticks, px/maj × 100 = px/s, px/maj² × 10 000 = px/s².
 *
 * A level may run several chains at once (the original "dual" boards); the
 * first chain is exposed through `balls`, `removals` and `track` for the
 * single-chain regression fixtures.
 */
export const ENGINE_VERSION = '2.0.26';

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
/**
 * `[x, y]` or `[x, y, flags]`; flags bit 0 = tunnel (CURV byte A: unplayable, never hit nor targeted),
 * bits 1–2 = draw priority 0..3 (CURV byte B), spike 03 Q1.
 */
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

  /** Raw flags of the vertex nearest to `s` (0 outside [0, length]). */
  layerAt(s: number): number {
    if (s < 0 || s > this.length) return 0;
    const { i, t } = this.locate(s);
    return this.layers[t < 0.5 ? i : Math.min(i + 1, this.layers.length - 1)];
  }

  /** Tunnel point (CURV byte A, 0x405cb0 / 0x405d00): no projectile contact, no nearest point. */
  tunnelAt(s: number): boolean {
    return (this.layerAt(s) & 1) === 1;
  }

  /** Draw priority 0..3 at `s` (CURV byte B, 0x405bc0); 0 outside the track. */
  priorityAt(s: number): number {
    return (this.layerAt(s) >> 1) & 3;
  }

  /**
   * Draw priority of a ball centred at `s` (0x405c10): the max of the priorities read at its two edges,
   * `s − radius` and `s + radius` (radius 16, 0x401720) — the ball changes pass as soon as one edge
   * enters the zone. Only the two edges are read, not a window.
   */
  ballPriority(s: number, radius = 16): number {
    return Math.max(this.priorityAt(s - radius), this.priorityAt(s + radius));
  }

  /**
   * Closest arc-length parameter to an arbitrary point, with the distance to the track. With
   * `skipTunnel` (0x414d6e) a segment whose two vertices are tunnel points is ignored; `{ s: 0, dist:
   * Infinity }` when nothing is left.
   */
  nearest(p: Point, skipTunnel = false): { s: number; dist: number } {
    let best = { s: 0, dist: Infinity };
    for (let i = 0; i + 1 < this.points.length; i++) {
      if (skipTunnel && (this.layers[i] & 1) === 1 && (this.layers[i + 1] & 1) === 1) continue;
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
  /**
   * Gap bonus armed at the insertion (0x421d27, `ball+0x5c`), paid by the match that destroys the
   * ball; cleared when the ball lands without a match beside no ball of its colour (0x421dbc).
   */
  gapBonus?: number;
  /** Number of gaps the shot crossed (0x421d2b, `ball+0x5e`), armed and cleared with `gapBonus`. */
  gapCount?: number;
  /**
   * « Waiting » shot ball (`ball+0x32`, 0x421d70 / 0x421da3): landed without a match across a gap from a ball of its
   * colour. It keeps its gap bonus and does not reset the chain; destroyed in a match it adds 1 to the chain
   * (0x4212d4–0x4212e1); a contact that leaves it alive clears it and resets the chain (0x408e30).
   */
  waiting?: boolean;
  /**
   * Attraction counter v (`ball+0x3c`): the segment led by this ball (it and the balls ahead in contact) rolls back
   * ⌊v/8⌋ px per maj towards the alive ball behind it, then v += 1 (0x421800); cleared at the contact.
   */
  attract?: number;
}

export interface Projectile {
  id: number;
  color: number;
  x: number;
  y: number;
  vx: number;
  vy: number;
  /** Number of gaps in the list (projectile+0x9c). */
  gaps: number;
  /** One key per gap, `chain:frontBallId` (AddGap 0x414660 dedups on the id of the ball ahead of the gap, ball+4). */
  gapKeys: string[];
  /** Width of each gap of `gapKeys`, same order (node+0xc). */
  gapWidths: number[];
  /**
   * Narrowest gap in the list (0x40a810), px of track between the CENTRES of the two balls bordering the gap
   * (`next.s − prev.s`, 0x414e19, truncated); Infinity while the list is empty.
   */
  gapMinWidth: number;
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

/** `clearing` = board emptied in ZUMA mode, end-of-level tally running along the track (D-10). */
export type EngineState = 'playing' | 'clearing' | 'draining' | 'lost' | 'gameover' | 'won';

/**
 * A coin spot from the original `levels.xml` (`TreasurePoint`): `curve` = chain index, `dist` = percentage of
 * its curve the chain head must have passed for the point to be free (0 = always free; spike 03 Q4, 0x40a900).
 */
export interface TreasurePoint { x: number; y: number; curve: number; dist: number }
/** The single coin currently on the board; `until` = tick at which it vanishes. */
export interface Coin { id: number; x: number; y: number; curve: number; until: number }
/**
 * One tally marker (0x421550): `s` walks `cleanupStepPx` every `cleanupStepTicks` from its aligned start up
 * to the skull of chain `chain`; `step` / `steps` = steps done / to do for this marker.
 */
export interface CleanupMarker { chain: number; s: number; step: number; steps: number }
/**
 * End-of-level tally (D-30): one marker per chain, all stepping together on a shared clock — `step` / `steps`
 * = shared steps done / steps of the longest marker; `nextTick` / `popNext` are fractional tick deadlines,
 * `endTick` is set once the last step of the longest marker (or none) has fired.
 */
export interface Cleanup {
  markers: CleanupMarker[];
  step: number;
  steps: number;
  nextTick: number;
  popNext: number;
  popIndex: number;
  /** Nominal tick of the last step: pops are scheduled while `popNext` ≤ this. */
  lastStepTick: number;
  endTick: number | null;
}

export interface EngineConfig {
  /** Simulation rate. Timings below are expressed in ticks or in px/s. */
  tickHz: number;
  width: number;
  height: number;
  ballRadius: number;
  ballSpacing: number;
  /** Number of colours in play (indexes 0..colors-1). */
  colors: number;
  /** Share of the track length filled by the fast intro feed (original `start` %, 0..1). */
  startFraction: number;
  /** « PARTEZ » guard: feeding ends at the latest after this many ticks (500 maj × 0.6 = 300). */
  feedMaxTicks: number;
  /** « PARTEZ » when every chain is within this margin of `speed`, px/s (0.1 px/maj × 100 = 10). */
  goMargin: number;
  /** Total balls streamed per chain (Infinity streams until ZUMA mode). */
  total: number;
  /** Points scored in the level needed to enter ZUMA mode (feed stops) — original `score` setting. */
  target: number;
  /** Probability that a streamed ball repeats the previous colour (original `repeat` %, 0..1). */
  repeatChance: number;
  /** Isolated-group repair threshold (original `single`, 0..10): 10 = disabled; see spawnColor. */
  singleLimit: number;
  /** Pusher target speed, px/s (original `speed` in px per 100 Hz update × 100). */
  speed: number;
  /** Pusher acceleration towards a higher target, px/s² (0.005 px/maj² at 100 Hz × 10 000 = 50). */
  chainAccel: number;
  /** Pusher deceleration towards a lower target, px/s² (0.1 px/maj² × 10 000 = 1000). */
  chainDecel: number;
  /** Pusher stop when the rearmost ball (first node of the chain, the one the pusher pushes) is removed at the end of
   *  its destruction (0x423a10 → 0x423ac7–0x423ad6), ticks: 40 maj × 0.6 = 24. Never armed by an insertion. */
  pusherStopTicks: number;
  /** End-of-track slow zone: `slowDistance` px of interpolation before the danger line, itself `dangerDistance` px before the skull (original `slowdistance` 500, `danger` 600). */
  slowDistance: number;
  dangerDistance: number;
  /** Target divisor at and beyond the danger line (original `slowfactor`, default 4). Not the SLOW power-up (`slowFactor`). */
  endSlowFactor: number;
  /** ZUMA: rollback / slowdown only on the chains whose head covers more than this share of their track (original: > 50 %). */
  zumaCoverage: number;
  /** ZUMA pushback speed of the head of a chain, px/s (0x40abde: 1 px/maj × 100); distinct from `backwardsSpeed` (power-up). */
  zumaBackSpeed: number;
  /** ZUMA pushback, slowdown and pusher stop of a chain reset once its head is under this many px (0x54c690, 0x423c73). */
  zumaBackMinHead: number;
  /** Target multiplier while the ZUMA slowdown runs (original 0.25). */
  zumaSlowFactor: number;
  drainSpeed: number;
  /** Projectile speed in px per tick. */
  projectileSpeed: number;
  /** Distance from the frog centre to the projectile start point (the mouth), in px. */
  muzzleOffset: number;
  /** Ticks a landed ball takes to open its slot (original mergespeed 0.05 at 100 Hz = 0.2 s). */
  mergeTicks: number;
  accuracySpeedFactor: number;
  fireCooldownTicks: number;
  /** Destruction persistence before the removal, ticks (0x423a62 `cmp 0x28`: 40 maj × 0.6 = 24). */
  destroyTicks: number;
  /**
   * Attraction counter v given to the front edge when a destruction ends between two balls of one colour
   * (0x423a95). The segment led by that ball rolls back ⌊v/8⌋ px per maj, then v += 1, without cap (0x421800):
   * 100 px/s at first, +100 px/s every 8 maj (≈ 1 250 px/s²).
   */
  attractStartAfterMatch: number;
  /** Attraction counter v given when a shot ball without a match borders a gap of its colour (0x421d74 / 0x421dae). */
  attractStartAfterShot: number;
  /** Contact recoil of the most advanced ball of the arrived segment, ticks (0x4219a6: 30 maj × 0.6 = 18). */
  contactRecoilTicks: number;
  /** Contact recoil speed without a match at the junction, px/s (0x54c85c: 0.5 px/maj × 100 = 50). */
  contactRecoilMin: number;
  /** Contact recoil speed per combo depth, px/s (0x54cde8: 1.5 px/maj × 100 = 150): max(min, perDepth × depth). */
  contactRecoilPerDepth: number;
  /** Pusher stop while a recoil moves balls and after it, ticks (0x40ad04–0x40ad15: 20 maj × 0.6 = 12). */
  contactPusherStopTicks: number;
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
  /**
   * One life per multiple of this score crossed (0x417380: ⌊new / 50 000⌋ − ⌊old / 50 000⌋, several at
   * once, no cap); 0 disables. Only the gauntlet mode (`board+0x187`, absent here) turns it off.
   */
  extraLifeEvery: number;
  /** Level bonus per curve, credited when the board is cleared: (100 − coverage) × 100 with coverage 0 (0x428705, hypothesis A3). */
  levelBonus: number;
  /** Points for a grabbed coin (0x4233fb: max(500, 100 × ⌊score / 600⌋), computed by configFromSettings). */
  coinPoints: number;
  /** Ticks a coin stays on its treasure point (0x4177cf: 1 000 maj × 0.6 = 600). */
  coinVisibleTicks: number;
  /** First coin attempt possible this many ticks after the level start (300 maj × 0.6 = 180: the original deadline starts at 0). */
  coinFirstTicks: number;
  /** Attempts resume this many ticks after the previous appearance, grabbed or not (0x41760d: 1 300 maj × 0.6 = 780). */
  coinRetryTicks: number;
  /** Per-tick probability of an attempt (`Rand() % treasurefreq == 0`: 1/300 per maj ≈ 1/180 per tick). */
  coinChance: number;
  /** Projectile centre to coin centre distance that grabs the coin (0x4233b6–0x4233e5: ball radius 16 + 20 = 36). */
  coinRadius: number;
  /**
   * The original destroys the grabbing projectile and removes it from the list (0x4236a9–0x4236eb): no insertion,
   * no miss. false keeps the R2.0.18 fly-on behaviour (the projectile goes on to the chain or off the board).
   */
  coinConsumesShot: boolean;
  /** End-of-level tally (0x421550): step length, px. */
  cleanupStepPx: number;
  /** Ticks between two tally steps (4 maj × 0.6 = 2.4). */
  cleanupStepTicks: number;
  /** Ticks from the clearing to the first step (20 maj × 0.6 = 12). */
  cleanupStartTicks: number;
  /** Ticks from the last step to `won` (50 maj × 0.6 = 30). */
  cleanupEndTicks: number;
  /** Ticks between two `cleanup-pop` cues (10 maj × 0.6 = 6), from the first step + 1 maj. */
  cleanupPopTicks: number;
  /** Points credited at each step. */
  cleanupPoints: number;
  /** Expert time in seconds (original `partime`); 0 = no time bonus. */
  parTime: number;
  /** Ticks a chain rolls back when ZUMA mode starts with its head past `zumaCoverage` (original `zumaback` 300 maj × 0.6 = 180). */
  zumaBackTicks: number;
  /** Ticks the target is multiplied by `zumaSlowFactor` after such a ZUMA (original `zumaslow` 1100 maj × 0.6 = 660). */
  zumaSlowTicks: number;
}

export const CANDIDATE: EngineConfig = {
  tickHz: 60,
  width: 640,
  height: 480,
  ballRadius: 16,
  ballSpacing: 32,
  colors: 4,
  startFraction: 0.35,
  feedMaxTicks: 300, // 500 maj × 0.6
  goMargin: 10, // 0.1 px/maj × 100
  total: 60,
  target: 400,
  repeatChance: 0.5,
  singleLimit: 10,
  speed: 24,
  chainAccel: 50, // 0.005 px/maj² × 10 000
  chainDecel: 1000, // 0.1 px/maj² × 10 000
  pusherStopTicks: 24, // 40 maj × 0.6
  slowDistance: 500,
  dangerDistance: 600,
  endSlowFactor: 4,
  zumaCoverage: 0.5,
  zumaSlowFactor: 0.25,
  zumaBackSpeed: 100, // 1 px/maj × 100, 0x40abde
  zumaBackMinHead: 50, // px, 0x54c690
  drainSpeed: 520,
  projectileSpeed: 12,
  muzzleOffset: 16,
  mergeTicks: 12,
  accuracySpeedFactor: 1.5,
  fireCooldownTicks: 8,
  destroyTicks: 24, // 40 maj × 0.6, 0x423a62
  attractStartAfterMatch: 10, // v, 0x423a95
  attractStartAfterShot: 1, // v, 0x421d74 / 0x421dae
  contactRecoilTicks: 18, // 30 maj × 0.6, 0x4219a6
  contactRecoilMin: 50, // 0.5 px/maj × 100, 0x54c85c
  contactRecoilPerDepth: 150, // 1.5 px/maj × 100, 0x54cde8
  contactPusherStopTicks: 12, // 20 maj × 0.6, 0x40ad04–0x40ad15
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
  extraLifeEvery: 50_000,
  levelBonus: 10000,
  coinPoints: 500,
  coinVisibleTicks: 600, // 1 000 maj × 0.6
  coinFirstTicks: 180, // 300 maj × 0.6
  coinRetryTicks: 780, // 1 300 maj × 0.6
  coinChance: 1 / 180, // 1/300 per maj ≈ 1/180 per tick
  coinRadius: 36, // 16 + 20, 0x4233b6–0x4233e5
  coinConsumesShot: true, // 0x4236a9–0x4236eb
  cleanupStepPx: 60,
  cleanupStepTicks: 2.4, // 4 maj × 0.6
  cleanupStartTicks: 12, // 20 maj × 0.6
  cleanupEndTicks: 30, // 50 maj × 0.6
  cleanupPopTicks: 6, // 10 maj × 0.6
  cleanupPoints: 100,
  parTime: 0,
  zumaBackTicks: 180, // 300 maj × 0.6
  zumaSlowTicks: 660, // 1100 maj × 0.6
};

/**
 * End-of-track slow zone (0x4187ef–0x418832): target multiplier for a head at `headS` on a
 * track of `length`. The danger line sits `dangerDistance` px before the skull; over the
 * `slowDistance` px before it the multiplier goes linearly from 1 to 1 / `endSlowFactor` and
 * stays there up to the skull. A factor ≤ 1 disables the zone; `slowDistance` ≤ 0 is a hard step.
 */
export function endZoneFactor(headS: number, length: number, slowDistance: number, dangerDistance: number, endSlowFactor: number): number {
  if (!(endSlowFactor > 1)) return 1;
  const dangerStart = Math.max(0, length - dangerDistance);
  const zoneStart = dangerStart - slowDistance;
  const f = slowDistance > 0 ? Math.max(0, Math.min(1, (headS - zoneStart) / slowDistance)) : headS >= dangerStart ? 1 : 0;
  return (1 - f) + f / endSlowFactor;
}

/**
 * Initial speed of the fast intro feed (0x4050e7–0x405144), px/s, for a cruise `speed` (px/s)
 * and a burst `distance` (px = original `start` % × curve length). In 100 Hz units with
 * v = speed / 100 px/maj: V = v + 0.1 × ⌊18 + 0.5 × (√((v + 20)² + 80 d) − (v + 20))⌋, chosen so
 * that decelerating at 0.1 px/maj² brings the chain to v after about `distance`. Never below
 * `speed`; a non-finite or negative distance gives 0 (T-05-14).
 */
export function feedSpeed(speed: number, distance: number): number {
  if (!Number.isFinite(distance) || distance < 0 || !Number.isFinite(speed)) return 0;
  const v = speed / 100;
  const V = v + 0.1 * Math.floor(18 + 0.5 * (Math.sqrt((v + 20) * (v + 20) + 80 * distance) - (v + 20)));
  return Math.max(speed, V * 100);
}

/**
 * Distance of the fast intro feed, in curve units (0x405088–0x40509c: d = ⌊points × start / 100⌋, the curve's point
 * count, 0x404ed0). The pack's CURV polylines are sampled every pixel (≈ 1.005 px per point): their point count is
 * used, as in the original; a sparse polyline (procedural levels, several px per vertex) uses its length in px.
 */
export function feedDistance(track: Track, startFraction: number): number {
  const segments = track.points.length - 1;
  const units = segments > 0 && track.length / segments <= 1.5 ? track.points.length : track.length;
  return Math.floor(units * startFraction + 1e-7);
}

/**
 * Original ACE TIME bonus (0x401cb0): with t = ⌊seconds⌋, 0 when t > parTime, otherwise
 * 100 × (1 + ⌊250 × (1 − t / parTime)⌋) — 1-1 (par 25 s): 24 s → 1100, 20 s → 5100, 0 s → 25100.
 * 0 without a par time. The ratio is computed as (par − t) / par so that exact fractions stay exact.
 */
export function aceTimeBonus(seconds: number, parTime: number): number {
  if (!(parTime > 0) || !Number.isFinite(seconds)) return 0;
  const t = Math.floor(seconds);
  if (t > parTime) return 0;
  return 100 * (1 + Math.floor((250 * (parTime - t)) / parTime));
}

/**
 * Par time (s) when `partime` is absent (0x42ad12–0x42ad86): ⌈score × 35 / 1000⌉ to the next
 * multiple of 5, × 0.95 × curves when the level has several curves (hypothesis A7 on that factor).
 * 0 for a non-finite or non-positive score.
 */
export function defaultParTime(score: number, curves: number): number {
  if (!Number.isFinite(score) || score <= 0) return 0;
  let base = (score * 35) / 1000;
  if (curves > 1) base *= 0.95 * curves;
  return Math.ceil(base / 5) * 5;
}

/**
 * Original gap bonus (0x421cac–0x421d2b) for a shot that crossed `gaps` gaps, the narrowest being
 * `minWidth` px of track between the CENTRES of its two balls (0x414e19; curve points are 1.005 px apart in the
 * pack, so points ≈ px): w' = max(0, w − 64) — 500 up to one free ball slot —, base 500 (250 is
 * the gauntlet mode `board+0x187`, ignored), pts = ⌊500 × (300 − w') / 300 / 10⌋ × 10, at least 10,
 * × gaps when gaps > 1. 0 when gaps < 1; a NaN or negative width counts as 0 (→ 500), an infinite
 * one falls to the floor of 10.
 */
export function gapBonusPoints(minWidth: number, gaps: number): number {
  if (!(gaps >= 1)) return 0;
  const w = Number.isNaN(minWidth) || minWidth < 0 ? 0 : minWidth;
  const narrowed = Math.max(0, w - 64);
  const pts = Math.floor((500 * (300 - narrowed)) / 300 / 10) * 10;
  return Math.max(10, pts) * Math.trunc(gaps);
}

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
  /** Coins grabbed by a projectile — the STATS « PIÈCES » line. */
  coins: number;
  powers: Record<PowerKind, number>;
}

/** One ball chain rolling along one track. */
export class Chain {
  balls: Ball[] = [];
  removals: Removal[] = [];
  /**
   * Contact recoils (0x4219a6 → 0x40ab60): ball `id` rolls back `speed` px/s for `ticks` ticks and pushes every ball
   * behind it that it overlaps (exploding balls included); one entry per ball.
   */
  recoils: Array<{ id: number; ticks: number; speed: number }> = [];
  spawned = 0;
  lastSpawnColor = -1;
  /**
   * Id of the ball last fed through the entrance (R2.0.23). While it is the rearmost ball the next one is placed right
   * behind it; once it is gone (destroyed with the rear group, bombed) the next ball enters behind the entrance.
   */
  fedId: number | null = null;
  /** Current pusher speed, px/s (original `mSpeed`); null until the chain's first moveChain (lazy: v0 of the fast feed, or the target). */
  speed: number | null = null;
  /** Ticks left of the pusher stop (original counter curve+0x54): armed when the rear ball is removed (≥ 40 maj) or by a recoil contact (≥ 20 maj). */
  stopTicks = 0;
  /** Ticks of ZUMA pushback left (curve+0x5c): the head rolls back `zumaBackSpeed` px/s. */
  zumaBackLeft = 0;
  /** Ticks of ZUMA slowdown left (curve+0x58): the pusher target × `zumaSlowFactor`. */
  zumaSlowLeft = 0;
  constructor(readonly track: Track, readonly index: number) {}
}

const CONTACT_EPS = 0.5;

/** Gap detector samples per track (0x414c60 walks the curve points every 2 × radius). */
const GAP_SAMPLES = new WeakMap<Track, Array<{ s: number; x: number; y: number }>>();

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
  /** Tick of the `go` event (0 when feeding was never on). */
  goTick = 0;
  /** Tick the board was cleared (start of the tally); null while playing. */
  clearTick: number | null = null;
  /** New balls are streamed from the spawn holes. */
  stream = true;
  /** Balls destroyed in the level (statistics only; the gauge is driven by `levelScore`). */
  destroyedCount = 0;
  zumaMode = false;
  /**
   * Fractional maj clock (1 maj = 10 ms): += 100 / tickHz at the start of each step; the step runs ⌊majClock⌋ whole
   * maj steps of the attraction (1 or 2 at 60 Hz, 5 for 3 ticks), which keeps the original integer ⌊v/8⌋ px
   * integration exact. The original runs the attraction at 100 Hz.
   */
  majClock = 0;
  score = 0;
  /** Points scored since the start of the level; the score carried over from previous levels is excluded. */
  levelScore = 0;
  lives: number;
  streak = 0;
  slowTicks = 0;
  backwardsTicks = 0;
  accuracyTicks = 0;
  aim: Point;
  /** Coin spots of the level (empty = no coins, no extra RNG draws). */
  treasure: readonly TreasurePoint[] = [];
  /** The coin on the board, if any (one at a time, D-07). */
  coin: Coin | null = null;
  /** End-of-level tally in progress while `state === 'clearing'`. */
  cleanup: Cleanup | null = null;
  /** Expert time bonus computed at `won` (0 until then), NOT added to the score: the STATS count-up credits it. */
  timeBonus = 0;
  /** Points of the time bonus already credited through creditBonus(). */
  timeBonusCredited = 0;
  /** Points scored by the end-of-level tally. */
  cleanupScore = 0;
  stats: Stats = {
    shots: 0, hits: 0, misses: 0, matches: 0, destroyed: 0, maxCombo: 0, maxStreak: 0, gaps: 0, combos: 0, coins: 0,
    powers: { bomb: 0, slow: 0, backwards: 0, accuracy: 0 },
  };

  private commands: Command[] = [];
  /** Whole maj steps of the current tick (see majClock). */
  private majSteps = 0;
  private nextId = 1;
  private lastShotTick = -Infinity;
  private lastPowerTick = -Infinity;
  /** Tick of the previous coin appearance (grabbed or not); attempts resume `coinRetryTicks` later (0x41760d). */
  private lastCoinTick: number;
  /** Per chain, where its last explosion happened: its tally marker starts there (D-10, D-30); null → its track start. */
  private lastDestroy: Array<number | null>;
  /** Chain of the most recent explosion (the `clearing` point). */
  private lastDestroyChain: number | null = null;

  constructor(track: Track | Track[], readonly frog: Point, config: Partial<EngineConfig> = {}, seed = 1) {
    const tracks = Array.isArray(track) ? track : [track];
    if (tracks.length === 0) throw new Error('at least one track is required');
    this.chains = tracks.map((t, i) => new Chain(t, i));
    this.config = { ...CANDIDATE, ...config };
    this.lastDestroy = this.chains.map(() => null);
    this.lastCoinTick = this.config.coinFirstTicks - this.config.coinRetryTicks;
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

  /** Ticks of the level clock (D-13): from « PARTEZ » to the clearing of the board, then frozen. */
  get levelTicks(): number {
    return (this.clearTick ?? this.tick) - this.goTick;
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
    // The fixture's rearmost ball counts as fed: the stream goes on right behind it.
    let rear: Ball | undefined;
    for (const b of chain.balls) if (!rear || b.s < rear.s) rear = b;
    chain.fedId = rear?.id ?? null;
    chain.removals = [];
    chain.recoils = [];
    chain.speed = null;
    chain.stopTicks = 0;
    chain.zumaBackLeft = 0;
    chain.zumaSlowLeft = 0;
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

  /**
   * Declares the coin spots of the level (pack `treasure[]`). Points with a non-numeric position are
   * dropped, `curve` is clamped to an existing chain and `dist` (a percentage) to 0..100, non-finite → 0.
   * The first attempt is possible `coinFirstTicks` after this call (made at the level start). An empty
   * list never touches the RNG (tickCoin returns at once).
   */
  setTreasure(points: TreasurePoint[]): void {
    const last = this.chains.length - 1;
    const clean: TreasurePoint[] = [];
    for (const p of points) {
      if (!p || !Number.isFinite(p.x) || !Number.isFinite(p.y)) continue;
      const curve = Number.isFinite(p.curve) ? Math.max(0, Math.min(last, Math.trunc(p.curve))) : 0;
      const dist = Number.isFinite(p.dist) && p.dist > 0 ? Math.min(100, p.dist) : 0;
      clean.push({ x: p.x, y: p.y, curve, dist });
    }
    this.treasure = clean;
    this.coin = null;
    this.lastCoinTick = this.tick + this.config.coinFirstTicks - this.config.coinRetryTicks;
  }

  /**
   * Presentation-driven bonus points (STATS count-up of the ACE TIME bonus, 0x440b00): added to
   * `score`, `levelScore` and `timeBonusCredited`. No RNG, no event, no ZUMA check (the level is
   * over); non-finite or non-positive points are ignored (T-05-15).
   */
  creditBonus(points: number): void {
    if (!Number.isFinite(points) || points <= 0) return;
    const old = this.score;
    this.score += points;
    this.levelScore += points;
    this.timeBonusCredited += points;
    // The original counts the STATS bonus up through AddScore (0x440b00): a multiple crossed there gives a life too.
    this.grantLives(old);
  }

  /** Test hook: places the coin of `treasure[index]` right now (same event as a natural appearance). */
  spawnCoinForTest(index: number): void {
    const point = this.treasure[index];
    if (!point) throw new Error(`no treasure point at index ${index}`);
    this.placeCoin(point);
  }

  // -------------------------------------------------------------------- step

  step(): void {
    this.tick++;
    this.majClock += 100 / this.config.tickHz;
    this.majSteps = Math.floor(this.majClock + 1e-9);
    this.majClock = Math.max(0, this.majClock - this.majSteps);
    this.processCommands();
    this.tickPowers();
    for (const chain of this.chains) this.spawnBalls(chain);
    for (const chain of this.chains) this.moveChain(chain);
    this.checkGo();
    this.moveProjectiles();
    this.tickCoin();
    this.exitBalls();
    this.tickCleanup();
    this.processRemovals();
    if (this.state === 'playing') this.refreshAmmo(); // D-14: every tick, from the tick a destruction is marked
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
      gapWidths: [],
      gapMinWidth: Infinity,
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

  /**
   * Streams balls in from the entrance: a new ball is placed right behind the rearmost ball while that one is the last
   * ball fed (several per tick when the fast feed outruns a spacing per tick, the chain stays contiguous). When the fed
   * ball is gone — destroyed with the rear group, bombed — the next one enters behind the entrance (s = −spacing), never
   * mid-track: the original only ever puts a pending ball on the curve at its start (0x418510, waypoint 1). R2.0.23:
   * refilling from the next ball down to the entrance created up to 25 balls along the track in one frame.
   */
  private spawnBalls(chain: Chain): void {
    if (!this.stream || this.zumaMode || this.state !== 'playing') return;
    const spacing = this.config.ballSpacing;
    while (chain.spawned < this.config.total) {
      let rear: Ball | undefined;
      for (const b of chain.balls) if (!rear || b.s < rear.s) rear = b;
      let s = rear ? rear.s - spacing : 0;
      if (rear && s < -spacing) break;
      if (rear && s > 0 && rear.id !== chain.fedId) s = -spacing;
      const ball: Ball = { id: this.nextId++, color: this.spawnColor(chain), s, width: 1 };
      chain.balls.unshift(ball);
      chain.fedId = ball.id;
      chain.spawned++;
    }
  }

  /**
   * « PARTEZ » (0x402070 / 0x428a03–0x428a5c): the fast intro feed is over once every chain has
   * decelerated to within `goMargin` of `speed` (mSpeed − speed ≤ 0.1 px/maj), or after
   * `feedMaxTicks` (500 maj) whatever happens. Starts the level clock (D-13).
   */
  private checkGo(): void {
    if (!this.feeding) return;
    const limit = this.config.speed + this.config.goMargin;
    const settled = this.chains.every(c => c.speed !== null && c.speed <= limit);
    if (!settled && this.tick < this.config.feedMaxTicks) return;
    this.feeding = false;
    this.goTick = this.tick;
    this.emit('go');
  }

  /**
   * Streamed colour, transcription of 0x414b20: the first ball of a chain is uniformly random;
   * then with `repeatChance` (original `Rand() % 100 <= repeat`, hence (repeat + 1) / 100) the
   * ball repeats the last generated colour; otherwise, when `singleLimit` < 10 and the rear group
   * is a single ball, that ball is repaired (same colour) if `singleLimit` is 0 or if at most
   * `singleLimit` of the ten rear groups are singles; otherwise the colour differs from the last
   * one. No other RNG draw (the former `singleChance` draw is gone).
   */
  private spawnColor(chain: Chain): number {
    const n = this.config.colors;
    const prev = chain.lastSpawnColor;
    const differentFromPrev = (): number => {
      let c = this.rng.int(n);
      if (n > 1 && c === prev) c = (c + 1 + this.rng.int(n - 1)) % n;
      return c;
    };
    const { singleLimit } = this.config;
    let c: number;
    if (prev < 0) {
      c = this.rng.int(n);
    } else if (this.rng.next() < this.config.repeatChance) {
      c = prev;
    } else if (singleLimit < 10 && this.rearGroupSize(chain) === 1) {
      c = singleLimit <= 0 || this.isolatedGroups(chain, 10) <= singleLimit ? prev : differentFromPrev();
    } else {
      c = differentFromPrev();
    }
    chain.lastSpawnColor = c;
    return c;
  }

  /**
   * Lengths of the contiguous colour runs of the alive balls, rear to front. Physical gaps are
   * ignored: the original walks its linked list (0x40aa50 / 0x402040).
   */
  private colourRuns(chain: Chain): number[] {
    const runs: number[] = [];
    let color = -1;
    for (const b of this.alive(chain)) {
      if (b.color === color) runs[runs.length - 1]++;
      else { runs.push(1); color = b.color; }
    }
    return runs;
  }

  /** Size of the rear colour group (0 without alive balls). */
  private rearGroupSize(chain: Chain): number {
    return this.colourRuns(chain)[0] ?? 0;
  }

  /** Number of single-ball groups among the `k` rear groups. */
  private isolatedGroups(chain: Chain, k: number): number {
    return this.colourRuns(chain).slice(0, k).filter(l => l === 1).length;
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

  /**
   * Pusher target (0x418780): `speed`, × zumaSlowFactor while the chain's ZUMA slowdown runs, ÷ slowFactor
   * under the SLOW power-up, × the end-of-track slow zone for `slowZoneHead` (R2.0.27: the front of the rear
   * segment, no longer the most advanced ball of the whole chain).
   */
  private pusherTarget(chain: Chain): number {
    const { speed, slowFactor, slowDistance, dangerDistance, endSlowFactor, zumaSlowFactor } = this.config;
    let target = speed;
    if (chain.zumaSlowLeft > 0) target *= zumaSlowFactor;
    if (this.slowTicks > 0) target /= slowFactor;
    return target * endZoneFactor(this.slowZoneHead(chain), chain.track.length, slowDistance, dangerDistance, endSlowFactor);
  }

  /**
   * Head of the slow zone (curve+0x68, 0x418a28–0x418a77): the first ball from the rear whose link to the next ball
   * (ball+0x30) is clear — the front of the rear run, the one the pusher pushes — or the last ball when every link
   * is set. A link is set by contact and cleared for the ball behind a removed ball (0x423970 → 0x408760(0)), so it
   * survives the destruction delay: the curve list is walked with its exploding balls, links emulated by contact.
   * A segment parked ahead (gap) therefore does not slow the rear segment down (debug slowdown-full-chain).
   */
  private slowZoneHead(chain: Chain): number {
    const list = chain.balls;
    if (list.length === 0) return -Infinity;
    for (let i = 0; i + 1 < list.length; i++) {
      if (list[i + 1].s - list[i].s > this.gap(list[i], list[i + 1]) + CONTACT_EPS) return list[i].s;
    }
    return list[list.length - 1].s;
  }

  /**
   * Original pusher kinematics (0x4188a7–0x4188e6, 0x418905–0x41890e): the speed is created lazily
   * on the chain's first move — the fast-feed v0 of `feedSpeed` for `feedDistance` (start % of the curve's points)
   * (hypothesis A2: computed once at the start, the natural `chainDecel` deceleration does the rest)
   * or the target — held at 0 while a pusher stop runs, otherwise updated once per whole maj of the
   * tick like the original: above the target it loses `chainDecel` / 100 px/s (0.1 px/maj) WITHOUT
   * clamping (0x4188b3), then, below the target, it gains `chainAccel` / 100 px/s (0.005 px/maj)
   * clamped on the target (0x4188cb–0x4188e6). Under a target that keeps decreasing (the slow-zone
   * band) the speed runs a sawtooth up to 0.1 px/maj under it (R2.0.24, debug level-settings-audit).
   * Always computed, even while a rollback or a recoil keeps the pusher from advancing.
   */
  private updatePusher(chain: Chain): void {
    const target = this.pusherTarget(chain);
    if (chain.speed === null) {
      chain.speed = this.feeding ? feedSpeed(this.config.speed, feedDistance(chain.track, this.config.startFraction)) : target;
      return;
    }
    if (chain.stopTicks > 0) {
      chain.stopTicks--;
      chain.speed = 0;
      return;
    }
    // px/s per maj (1 maj = 10 ms); a float residue of the feed (V − v = n × 0.1 px/maj) lands on the target.
    const down = this.config.chainDecel / 100;
    const up = this.config.chainAccel / 100;
    for (let m = 0; m < this.majSteps; m++) {
      if (chain.speed > target + 1e-6) chain.speed -= down;
      else if (chain.speed > target) chain.speed = target;
      if (chain.speed < target) chain.speed = Math.min(target, chain.speed + up);
    }
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
    if (n === 0) {
      this.zumaEarlyStop(chain, alive);
      return;
    }
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

    this.updatePusher(chain);

    if (this.backwardsTicks > 0) {
      for (const b of alive) b.s -= this.config.backwardsSpeed * dt;
    } else {
      // Order of one curve update (0x423c50): attraction 0x421800 → pusher 0x418780 → recoil / ZUMA pushback 0x40ab60.
      this.attractSegments(alive, before, first, last, compCount);
      // The pusher does not advance on a tick where a recoil or the pushback moves balls: they stop it (0x40ad04).
      const pushback = chain.zumaBackLeft > 0;
      const recoiling = !pushback && chain.recoils.some(r => chain.balls.some(b => b.id === r.id));
      if (!pushback && !recoiling) shift(0, (chain.speed ?? 0) * dt);
      if (pushback) this.zumaPushback(chain, alive);
      else if (recoiling) this.applyRecoils(chain);
    }
    // ZUMA counters, once per tick (0x423cc7: 300 maj = 180 ticks of pushback, 1 100 maj = 660 ticks of slowdown).
    if (chain.zumaBackLeft > 0) chain.zumaBackLeft--;
    if (chain.zumaSlowLeft > 0) chain.zumaSlowLeft--;
    this.zumaEarlyStop(chain, alive);

    this.resolveForward(alive);

    const after = this.componentIds(alive);
    for (let i = 1; i < n; i++) {
      if (after[i] === after[i - 1] && before[i] !== before[i - 1]) this.onJunction(chain, alive, i);
    }

    // Balls whose slot just opened are evaluated for a match only now.
    for (const ball of settled) this.settle(chain, ball);
  }

  /**
   * Attraction (0x421800), once per whole maj of the tick: the rear ball of each segment that carries a counter v
   * pulls its segment (it and the balls ahead in contact) ⌊v/8⌋ px back, bounded by the exact contact with the alive
   * ball in front of the segment behind, then v += 1 — no cap. A counter that does not lead a segment with an alive
   * ball behind it is dropped (T-05-37).
   */
  private attractSegments(alive: Ball[], comp: number[], first: number[], last: number[], compCount: number): void {
    for (let i = 0; i < alive.length; i++) {
      if (alive[i].attract !== undefined && (comp[i] === 0 || first[comp[i]] !== i)) delete alive[i].attract;
    }
    for (let m = 0; m < this.majSteps; m++) {
      for (let c = 1; c < compCount; c++) {
        const rear = alive[first[c]];
        const v = rear.attract;
        if (v === undefined || !(v > 0)) continue;
        const prevFront = alive[last[c - 1]];
        const room = Math.max(0, rear.s - (prevFront.s + this.gap(prevFront, rear)));
        const d = Math.min(room, Math.floor(v / 8));
        if (d > 0) for (let i = first[c]; i <= last[c]; i++) alive[i].s -= d;
        rear.attract = v + 1;
      }
    }
  }

  /**
   * Contact recoils (0x40ab60), front to back: each recoiling ball rolls back `speed` × dt and pushes every ball
   * behind it that it overlaps back to contact — exploding balls included, they keep their place on the curve until
   * their removal in the original. Anything moved stops the pusher for at least `contactPusherStopTicks`.
   */
  private applyRecoils(chain: Chain): void {
    const dt = 1 / this.config.tickHz;
    const list = chain.balls;
    const entries = chain.recoils
      .map(r => ({ r, idx: list.findIndex(b => b.id === r.id) }))
      .sort((a, b) => b.idx - a.idx);
    let moved = false;
    for (const { r, idx } of entries) {
      if (idx >= 0) {
        list[idx].s -= r.speed * dt;
        this.pushBehind(list, idx, r.speed * dt);
        moved = true;
      }
      r.ticks--;
    }
    chain.recoils = chain.recoils.filter(r => r.ticks > 0 && list.some(b => b.id === r.id));
    if (moved) this.stopPusher(chain);
  }

  /**
   * ZUMA pushback (0x40ab60 with the head's recoil forced to 1 px/maj, 0x40abde): the most advanced alive ball rolls
   * back `zumaBackSpeed` px/s at a constant speed and pushes the balls behind it it overlaps — a gap closes from the
   * front before the rear segment moves; the pusher is stopped every tick. Contact recoils only count down meanwhile.
   */
  private zumaPushback(chain: Chain, alive: Ball[]): void {
    let head: Ball | undefined;
    for (const b of alive) if (!head || b.s > head.s) head = b;
    if (!head) return;
    const list = chain.balls;
    const back = this.config.zumaBackSpeed / this.config.tickHz;
    head.s -= back;
    this.pushBehind(list, list.indexOf(head), back);
    this.stopPusher(chain);
    for (const r of chain.recoils) r.ticks--;
    chain.recoils = chain.recoils.filter(r => r.ticks > 0);
  }

  /**
   * Early end of the ZUMA phases (0x423c73–0x423cd8, 50.0 at 0x54c690): while a pushback or a slowdown runs, an empty
   * chain or a head under `zumaBackMinHead` px resets the pushback, the slowdown and the pusher stop of the chain.
   * (Applied only while a ZUMA phase runs, so an ordinary pusher stop near the entrance is left alone.)
   */
  private zumaEarlyStop(chain: Chain, alive: Ball[]): void {
    if (chain.zumaBackLeft <= 0 && chain.zumaSlowLeft <= 0) return;
    let head = -Infinity;
    for (const b of alive) if (b.s > head) head = b.s;
    if (alive.length > 0 && head >= this.config.zumaBackMinHead) return;
    chain.zumaBackLeft = 0;
    chain.zumaSlowLeft = 0;
    chain.stopTicks = 0;
  }

  /** Pusher stop of a recoil or of the ZUMA pushback (0x40ad04–0x40ad15): ≥ 20 maj, then restarting from 0. */
  private stopPusher(chain: Chain): void {
    chain.stopTicks = Math.max(chain.stopTicks, this.config.contactPusherStopTicks);
    chain.speed = 0;
  }

  /**
   * Pushes the balls behind `list[idx]` (curve order, exploding balls included) back while they overlap it, after
   * `list[idx]` rolled back `moved` px. A ball is never pushed further than the ball in front of it moved (R2.0.23): an
   * overlap that predates this push — alive balls that rolled into exploding ones left in place, the list then out of
   * curve order — is not resolved in one tick, which shifted the whole rear chain back by up to ~100 px (1-1, seed
   * 16838, tick 370). Without such an overlap the result is unchanged.
   */
  private pushBehind(list: Ball[], idx: number, moved: number): void {
    let step = moved;
    for (let i = idx - 1; i >= 0 && step > 0; i--) {
      const max = list[i + 1].s - this.gap(list[i], list[i + 1]);
      if (!(list[i].s > max)) break;
      const d = Math.min(list[i].s - max, step);
      list[i].s -= d;
      step = d;
    }
  }

  /**
   * Two segments just came into contact between alive[i-1] and alive[i] (0x421928–0x4219f1). When the front segment
   * was attracted (`right.attract`), the most advanced ball of that arrived segment — taken before the junction match
   * marks anything — gets a recoil of `contactRecoilTicks` at max(contactRecoilMin, contactRecoilPerDepth × d), d =
   * the depth carried by the edges when the junction destroys a run, else 0; if the junction destroys that ball, the
   * most advanced ball of the segment left alive takes it; a ball that already recoils keeps its recoil. The pusher
   * catching a still segment only merges (0x418a0d).
   */
  private onJunction(chain: Chain, alive: Ball[], i: number): void {
    const left = alive[i - 1];
    const right = alive[i];
    const depth = Math.max(left.comboDepth ?? 0, right.comboDepth ?? 0);
    delete left.comboDepth;
    delete right.comboDepth;
    this.emit('merge', { leftId: left.id, rightId: right.id, chain: chain.index });
    const attracted = (right.attract ?? 0) > 0;
    delete right.attract;
    const arrived: Ball[] = [];
    if (attracted) {
      let j = i;
      arrived.push(alive[j]);
      while (j + 1 < alive.length && this.touching(alive[j], alive[j + 1])) arrived.push(alive[++j]);
    }
    const destroyed = this.junctionMatch(chain, alive, i, depth);
    if (!attracted) return;
    this.endWaiting(chain, arrived[arrived.length - 1]);
    let pusher: Ball | undefined;
    for (let k = arrived.length - 1; k >= 0 && !pusher; k--) if (arrived[k].destroyingUntil === undefined) pusher = arrived[k];
    if (!pusher || chain.recoils.some(r => r.id === pusher.id)) return;
    const d = destroyed ? depth : 0;
    const speed = Math.max(this.config.contactRecoilMin, this.config.contactRecoilPerDepth * d);
    chain.recoils.push({ id: pusher.id, ticks: this.config.contactRecoilTicks, speed });
  }

  /**
   * 0x408e30, after every attraction contact: from the most advanced ball of the arrived segment backwards through the
   * raw list, every ball still waiting loses that state, its gap bonus and the chain (0x401ac0). The walk crosses
   * linked balls freely; past the first gap it stops at a ball whose attraction is still running (its own wait is
   * not over).
   */
  private endWaiting(chain: Chain, start: Ball): void {
    const list = chain.balls;
    let k = list.indexOf(start);
    let linked = true;
    while (k >= 0) {
      const b = list[k];
      if (b.waiting) {
        delete b.waiting;
        delete b.gapBonus;
        delete b.gapCount;
        this.streak = 0;
      }
      const prev = list[k - 1];
      if (!prev) return;
      if (!this.linked(prev, b)) linked = false;
      if (!linked && (prev.attract ?? 0) > 0) return;
      k--;
    }
  }

  /** Match at a junction (0x421240); returns whether a run was destroyed. */
  private junctionMatch(chain: Chain, alive: Ball[], i: number, depth: number): boolean {
    const left = alive[i - 1];
    const right = alive[i];
    // A ball still opening its slot does not take part in a run; `settle` will check it.
    if (left.width < 1 || right.width < 1) return false;
    if (left.color !== right.color) return false;
    const run = this.runAround(alive, i);
    if (run.length < 3) return false;
    this.destroyRun(chain, alive, run, depth > 0 ? depth + 1 : 1, 0);
    return true;
  }

  /**
   * A shot ball has finished opening its slot (width = 1): this is where the
   * match it may complete is evaluated, hits/streak accounted and the run destroyed.
   * Chain bonus (0x420bee–0x420bfc, computed in destroyRun): (chain + 5) × 10 from the 5th consecutive hit, on
   * a match of combo 0. Without a match, a ball whose neighbour of its colour sits across a gap — centres 42 px
   * apart or more, 0x401820 with tolerance 5 — is « waiting » (0x421d59–0x421db9): it keeps its gap bonus and the
   * chain; any other ball (a touching pair included) loses its bonus and resets the chain (0x421dbc–0x421dd2).
   */
  private settle(chain: Chain, ball: Ball): void {
    if (ball.destroyingUntil !== undefined) return;
    const alive = this.alive(chain);
    const index = alive.indexOf(ball);
    if (index < 0) return;
    const run = this.runAround(alive, index);
    if (run.length >= 3) {
      this.stats.hits++;
      this.streak++; // 0x421d32, before the match test
      this.stats.maxStreak = Math.max(this.stats.maxStreak, this.streak);
      this.destroyRun(chain, alive, run, 1, ball.id, ball);
    } else {
      // 0x421d55–0x421dae: a ball landing without a match next to a gap whose other edge has its colour arms the
      // attraction with v = 1 — on itself when the gap is behind it, on the next ball when the gap is ahead and that
      // ball does not attract already. Neighbours in curve order; an exploding neighbour is no edge.
      const list = chain.balls;
      const k = list.indexOf(ball);
      const behind = list[k - 1];
      const ahead = list[k + 1];
      const edge = (b: Ball | undefined): b is Ball => b !== undefined && b.destroyingUntil === undefined && b.color === ball.color;
      const waiting = (edge(behind) && !this.linked(behind, ball)) || (edge(ahead) && !this.linked(ball, ahead));
      if (waiting) {
        ball.waiting = true; // keeps its gap bonus and the chain
      } else {
        delete ball.gapBonus;
        delete ball.gapCount;
        this.streak = 0; // 0x401ac0
      }
      if (edge(behind) && !this.touching(behind, ball) && !((ball.attract ?? 0) > 0)) ball.attract = this.config.attractStartAfterShot;
      if (edge(ahead) && !this.touching(ball, ahead) && !((ahead.attract ?? 0) > 0)) ahead.attract = this.config.attractStartAfterShot;
    }
  }

  /**
   * The original « touches its next » flag (`ball+0x30`, 0x408700 → 0x401820 with tolerance 5): truncated centres
   * less than 2 × 5 + 32 = 42 px apart. Only used by the waiting rule and its reset walk.
   */
  private linked(a: Ball, b: Ball): boolean {
    return Math.abs(Math.trunc(b.s) - Math.trunc(a.s)) < 2 * 5 + 2 * this.config.ballRadius;
  }

  /** Physical contact between two consecutive alive balls (same criterion as `runAround`). */
  private touching(a: Ball, b: Ball): boolean {
    return b.s - a.s <= this.gap(a, b) + CONTACT_EPS;
  }

  /** Same-colour balls in contact around `index`; balls still opening their slot end the run. */
  private runAround(alive: Ball[], index: number): Ball[] {
    const color = alive[index].color;
    const touching = (a: Ball, b: Ball): boolean => this.touching(a, b);
    let lo = index;
    let hi = index;
    while (lo > 0 && alive[lo - 1].color === color && alive[lo - 1].width >= 1 && touching(alive[lo - 1], alive[lo])) lo--;
    while (hi + 1 < alive.length && alive[hi + 1].color === color && alive[hi + 1].width >= 1 && touching(alive[hi], alive[hi + 1])) hi++;
    return alive.slice(lo, hi + 1);
  }

  /**
   * Match score (0x420b80, 0x421240): every waiting ball of the run first adds 1 to the chain (0x4212d4–0x4212e1),
   * then 10 × n + 100 × (depth − 1) + the gap bonuses armed on the balls of the run (summed, with the largest gap
   * count) + the chain bonus (chain + 5) × 10 when chain ≥ 5 and depth = 1 (0x420bcf–0x420bfc, whatever made the
   * match: shot or attraction contact); the gap fields are cleared (0x4212f0–0x4212ff), SAUTS counts one per match
   * with a gap (0x420c1f–0x420c3a) and the `gap` event is emitted here, never at the insertion (0x420da8–0x420ec4).
   * `anchor` places the ENCHAÎNEMENT text (the shot ball), the run centre otherwise.
   */
  private destroyRun(chain: Chain, alive: Ball[], run: Ball[], depth: number, shotId: number, anchor?: Ball): void {
    const until = this.tick + this.config.destroyTicks;
    const lo = alive.indexOf(run[0]);
    const hi = alive.indexOf(run[run.length - 1]);
    const left = lo > 0 ? alive[lo - 1] : null;
    const right = hi + 1 < alive.length ? alive[hi + 1] : null;
    for (const b of run) b.destroyingUntil = until;
    if (left) left.comboDepth = depth;
    if (right) right.comboDepth = depth;
    chain.removals.push({ ids: run.map(b => b.id), leftId: left?.id ?? null, rightId: right?.id ?? null, shotId, depth, due: until });
    // 0x4219a6 / 0x40abde are the only writers of the recoil counter: no recoil at match time (D-34).

    const middle = run[Math.floor(run.length / 2)];
    const centre = this.ballPosition(middle, chain);
    this.lastDestroy[chain.index] = middle.s;
    this.lastDestroyChain = chain.index;
    for (const b of run) {
      if (!b.waiting) continue;
      delete b.waiting;
      this.streak++;
    }
    this.stats.maxStreak = Math.max(this.stats.maxStreak, this.streak);
    const chainBonus = depth === 1 && this.streak >= 5 ? (this.streak + 5) * 10 : 0;
    let gapPoints = 0;
    let gapCount = 0;
    for (const b of run) {
      gapPoints += b.gapBonus ?? 0;
      gapCount = Math.max(gapCount, b.gapCount ?? 0);
      delete b.gapBonus;
      delete b.gapCount;
    }
    const points = 10 * run.length + 100 * (depth - 1) + gapPoints + chainBonus;
    this.stats.matches++;
    this.stats.maxCombo = Math.max(this.stats.maxCombo, depth);
    if (depth > 1) this.stats.combos++;
    if (gapPoints > 0) this.stats.gaps++;
    const ids = run.map(b => b.id);
    this.emit('destroy', { depth, count: run.length, color: run[0].color, x: centre.x, y: centre.y, points, gapPoints, gapCount, chainBonus, streak: this.streak, ids, chain: chain.index });
    if (gapPoints > 0) this.emit('gap', { count: gapCount, points: gapPoints, x: centre.x, y: centre.y, chain: chain.index });
    if (chainBonus > 0) {
      const pos = anchor ? this.ballPosition(anchor, chain) : centre;
      this.emit('streak', { streak: this.streak, points: chainBonus, x: pos.x, y: pos.y });
    }
    this.registerDestroyed(run.length);
    this.addScore(points);
    for (const b of run) if (b.power) this.activatePower(b, chain);
  }

  private registerDestroyed(count: number): void {
    this.destroyedCount += count;
    this.stats.destroyed += count;
  }

  /** Share of the track covered by the most advanced ball of `chain` (exploding balls included), 0 without balls. */
  private coverage(chain: Chain): number {
    let head = 0;
    for (const b of chain.balls) if (b.s > head) head = b.s;
    return chain.track.length > 0 ? head / chain.track.length : 0;
  }

  /**
   * Every point gained in the level fills the gauge; ZUMA mode starts once, at `target` points
   * (0x428a69–0x428b09). The original then checks each curve (0x40a980, D-35): a chain whose head covers
   * more than `zumaCoverage` of its track gets `zumaBackTicks` of pushback and `zumaSlowTicks` of slowdown,
   * both at once (a longer phase already running is kept); the other chains get nothing. The RECUL power-up
   * (`backwardsTicks`) and the SLOW power-up (`slowTicks`) are never touched. `zuma` carries the maximum
   * coverage and the indices of the chains that roll back.
   */
  private addScore(points: number): void {
    const old = this.score;
    this.score += points;
    this.levelScore += points;
    this.grantLives(old);
    if (!this.zumaMode && this.levelScore >= this.config.target) {
      this.zumaMode = true;
      let coverage = 0;
      const chains: number[] = [];
      for (const chain of this.chains) {
        const c = this.coverage(chain);
        coverage = Math.max(coverage, c);
        if (!(c > this.config.zumaCoverage)) continue;
        chain.zumaBackLeft = Math.max(chain.zumaBackLeft, this.config.zumaBackTicks);
        chain.zumaSlowLeft = Math.max(chain.zumaSlowLeft, this.config.zumaSlowTicks);
        chains.push(chain.index);
      }
      this.emit('zuma', { coverage, pushback: chains.length > 0, chains });
    }
  }

  /**
   * Extra lives (0x417380, spike 03 Q3): ⌊score / every⌋ − ⌊old / every⌋ lives, several at once, no cap
   * (only the gauntlet mode `board+0x187` disables them; the `+0x178 = 150` counter set there has no
   * reader). Emits `extra-life { lives, count }`; the original shows no text, it plays `extralife` three
   * times (presentation).
   */
  private grantLives(old: number): void {
    const every = this.config.extraLifeEvery;
    if (!Number.isFinite(every) || every <= 0) return;
    const gained = Math.floor(this.score / every) - Math.floor(old / every);
    if (!(gained > 0)) return;
    this.lives += gained;
    this.emit('extra-life', { lives: this.lives, count: gained });
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
    let front: { chain: number; s: number } | null = null; // most advanced victim overall: the `clearing` point
    for (const chain of this.chains) {
      const victims = this.alive(chain).filter(b => {
        const p = this.ballPosition(b, chain);
        return Math.hypot(p.x - centre.x, p.y - centre.y) <= this.config.bombRadius;
      });
      if (victims.length === 0) continue;
      let head = -Infinity; // most advanced victim of this chain: its tally marker starts there (D-30)
      for (const b of victims) {
        b.destroyingUntil = until;
        if (b.power) chained.push({ ball: b, chain });
        if (!front || b.s > front.s) front = { chain: chain.index, s: b.s };
        head = Math.max(head, b.s);
      }
      this.lastDestroy[chain.index] = head;
      chain.removals.push({ ids: victims.map(b => b.id), leftId: null, rightId: null, shotId: 0, depth: 1, due: until });
      total += victims.length;
    }
    if (total > 0) {
      if (front) this.lastDestroyChain = front.chain;
      this.registerDestroyed(total);
      this.addScore(10 * total);
    }
    this.emit('power-bomb', { x: centre.x, y: centre.y, count: total });
    for (const { ball, chain } of chained) this.activatePower(ball, chain);
  }

  // ------------------------------------------------------------------ coins

  /** Places the coin (0x4177cf): visible `coinVisibleTicks`; the retry deadline counts from this appearance. */
  private placeCoin(point: TreasurePoint): void {
    this.coin = { id: this.nextId++, x: point.x, y: point.y, curve: point.curve, until: this.tick + this.config.coinVisibleTicks };
    this.lastCoinTick = this.tick;
    this.emit('coin-appear', { id: this.coin.id, x: point.x, y: point.y });
  }

  /** Removes the coin from the board without scoring (timeout, lost chain, level cleared). */
  private dropCoin(): void {
    if (!this.coin) return;
    this.emit('coin-vanish', { id: this.coin.id, x: this.coin.x, y: this.coin.y });
    this.coin = null;
  }

  /**
   * A treasure point is free (0x41765a–0x41777d, 0x40a900) when `dist` is 0, or when the head of its chain —
   * the most advanced ball — has passed `dist` % of the track: ⌊100 × head / length⌋ ≥ dist. No ball → not free.
   */
  private treasureFree(point: TreasurePoint): boolean {
    if (!(point.dist > 0)) return true;
    const chain = this.chains[Math.min(point.curve, this.chains.length - 1)];
    if (chain.balls.length === 0 || !(chain.track.length > 0)) return false;
    let head = -Infinity;
    for (const b of chain.balls) if (b.s > head) head = b.s;
    return Math.floor((100 * head) / chain.track.length) >= point.dist;
  }

  /**
   * Coins (0x417580, spike 03 Q4): a visible coin vanishes at its deadline. Otherwise, before ZUMA mode
   * (score < target, 0x41760d) and once `coinRetryTicks` have passed since the previous appearance, one draw
   * per tick (`Rand() % treasurefreq == 0`: 1/300 per maj ≈ 1/180 per tick); on success up to 2 × n draws of a
   * point with replacement, the first free one gets the coin; none free → nothing, next attempt next tick.
   * Nothing runs (no RNG) without treasure points.
   */
  private tickCoin(): void {
    if (this.treasure.length === 0 || this.state !== 'playing') return;
    if (this.coin) {
      if (this.tick >= this.coin.until) this.dropCoin();
      return;
    }
    if (this.zumaMode) return;
    if (this.tick - this.lastCoinTick < this.config.coinRetryTicks) return;
    if (this.rng.next() >= this.config.coinChance) return;
    const n = this.treasure.length;
    for (let i = 0; i < 2 * n; i++) {
      const point = this.treasure[this.rng.int(n)];
      if (this.treasureFree(point)) {
        this.placeCoin(point);
        return;
      }
    }
  }

  // ------------------------------------------------------------ projectiles

  private moveProjectiles(): void {
    const { width, height, ballRadius, ballSpacing, coinRadius, coinPoints } = this.config;
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
      // Coin grab (0x423330, tested before the chain): scores and keeps the streak; the original then destroys the
      // projectile — no insertion, no miss (D-31, coinConsumesShot) — while `false` lets it fly on (R2.0.18).
      const coin = this.coin;
      if (coin && Math.hypot(p.x - coin.x, p.y - coin.y) < coinRadius) {
        this.coin = null;
        this.stats.coins++;
        this.addScore(coinPoints);
        this.emit('coin', { id: coin.id, x: coin.x, y: coin.y, points: coinPoints, shotId: p.id }); // the retry deadline is not moved (0x4233fb)
        if (this.config.coinConsumesShot) continue;
      }
      let hit: Ball | undefined;
      let hitChain: Chain | undefined;
      let bestDist = Infinity;
      for (const chain of this.chains) {
        const alive = this.alive(chain);
        for (const b of alive) {
          if (b.s < 0 || b.s > chain.track.length) continue;
          // 0x408f52: a ball on a tunnel point is not touchable; the projectile flies on.
          if (chain.track.tunnelAt(b.s)) continue;
          const bp = chain.track.pointAt(b.s);
          const d = Math.hypot(p.x - bp.x, p.y - bp.y);
          if (d < 2 * ballRadius && d < bestDist) {
            bestDist = d;
            hit = b;
            hitChain = chain;
          }
        }
      }
      if (hit && hitChain) {
        this.land(p, hit, hitChain);
        continue;
      }
      // 0x423749–0x4237a5: the gap detector runs on every curve only when no curve was hit this update.
      for (const chain of this.chains) this.trackGap(p, chain);
      keep.push(p);
    }
    this.projectiles = keep;
  }

  /**
   * Original gap detector (0x414c60) for one curve: the first curve sample — every 2 × radius = 32 px from s = 1,
   * tunnel points skipped — closer than the ball radius (16) to the projectile; the gap is between the first ball of
   * the raw list (exploding balls included, they stay in the curve list) beyond that sample and its predecessor;
   * width = truncated centre distance, > 0; one entry per front ball (AddGap 0x414660). No gap before the rearmost
   * ball nor beyond the head.
   */
  private trackGap(p: Projectile, chain: Chain): void {
    const r = this.config.ballRadius;
    let found: number | null = null;
    for (const sample of this.gapSamples(chain.track)) {
      const dx = sample.x - p.x;
      const dy = sample.y - p.y;
      if (dx * dx + dy * dy < r * r) { found = sample.s; break; }
    }
    if (found === null) return;
    const list = chain.balls;
    const k = list.findIndex(b => b.s > found);
    if (k <= 0) return;
    const w = Math.trunc(list[k].s - list[k - 1].s);
    if (!(w > 0)) return;
    const key = `${chain.index}:${list[k].id}`;
    if (p.gapKeys.includes(key)) return;
    p.gapKeys.push(key);
    p.gapWidths.push(w);
    this.refreshGaps(p);
  }

  /** Recomputes the gap count and the narrowest width (0x40a810) from the projectile's list. */
  private refreshGaps(p: Projectile): void {
    p.gaps = p.gapKeys.length;
    p.gapMinWidth = p.gapWidths.length > 0 ? Math.min(...p.gapWidths) : Infinity;
  }

  /** Curve samples of the gap detector, cached per track: s = 1, 33, 65… (2 × radius), tunnel points excluded. */
  private gapSamples(track: Track): Array<{ s: number; x: number; y: number }> {
    let samples = GAP_SAMPLES.get(track);
    if (!samples) {
      samples = [];
      const step = 2 * this.config.ballRadius;
      for (let s = 1; s < track.length; s += step) {
        if (track.tunnelAt(s)) continue;
        const q = track.pointAt(s);
        samples.push({ s, x: q.x, y: q.y });
      }
      GAP_SAMPLES.set(track, samples);
    }
    return samples;
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
    // 0x422001–0x422032: the gap the ball goes into is removed from the list (key = the ball ahead of the slot).
    const front = ahead ? chain.balls[globalIdx + 1] : hit;
    if (front) {
      const at = p.gapKeys.indexOf(`${chain.index}:${front.id}`);
      if (at >= 0) {
        p.gapKeys.splice(at, 1);
        p.gapWidths.splice(at, 1);
        this.refreshGaps(p);
      }
    }
    const ball = this.insertGrowing(index, { id: p.id, color: p.color }, { x: p.x, y: p.y }, s, chain);
    // No pusher stop on insertion: 0x423ac7–0x423ad6 belongs to the end of destruction (0x423a10), see processRemovals.
    this.emit('insert', { id: ball.id, color: ball.color, x: bp.x, y: bp.y, chain: chain.index });
    // Gap bonus armed on the ball (0x421d27–0x421d2b): no score, no event, no statistic here —
    // the match that destroys the ball pays it (destroyRun) or `settle` clears it.
    if (p.gaps > 0) {
      ball.gapBonus = gapBonusPoints(p.gapMinWidth, p.gaps);
      ball.gapCount = p.gaps;
    }
    // The run check is deferred to `settle`, once the slot is fully open (mergeTicks later).
  }

  // --------------------------------------------------------------- removals

  /**
   * Balls leaving through the entrance (0x423b60 → 0x423970): in ZUMA mode every ball — alive or exploding — whose
   * position is below 1 px is deleted, with its pending removal and recoil, and `ball-exit` is emitted: no score, no
   * statistic, no explosion, no sound. The queue of balls not yet in (s < 1) goes at the passage. Outside ZUMA mode
   * the balls rolled below the entrance are kept (the original puts them back in its queue).
   */
  private exitBalls(): void {
    if (!this.zumaMode || this.state !== 'playing') return;
    for (const chain of this.chains) {
      const out = chain.balls.filter(b => b.s < 1);
      if (out.length === 0) continue;
      const ids = new Set(out.map(b => b.id));
      chain.balls = chain.balls.filter(b => !ids.has(b.id));
      for (const r of chain.removals) r.ids = r.ids.filter(id => !ids.has(id));
      chain.removals = chain.removals.filter(r => r.ids.length > 0);
      chain.recoils = chain.recoils.filter(r => !ids.has(r.id));
      for (const b of out) this.emit('ball-exit', { chain: chain.index, id: b.id, color: b.color });
    }
  }

  /**
   * End of destruction (0x423a10): the due balls are removed; for every block of removed balls whose two curve
   * neighbours are alive, not exploding and of one colour, the front one gets the attraction counter
   * `attractStartAfterMatch` (0x423a6b–0x423aa8) — whatever opened the gap (match or bomb). The colour is not
   * checked again afterwards; the depth stays on `comboDepth` (set by destroyRun). When the removed balls include the
   * rearmost ball of the chain while the game is playing, the pusher stops `pusherStopTicks` (D-09).
   */
  private processRemovals(): void {
    for (const chain of this.chains) {
      if (chain.removals.length === 0) continue;
      const due = chain.removals.filter(r => r.due <= this.tick);
      if (due.length === 0) continue;
      chain.removals = chain.removals.filter(r => r.due > this.tick);
      const gone = new Set<number>();
      for (const r of due) for (const id of r.ids) gone.add(id);
      const list = chain.balls;
      const removed = (b: Ball): boolean => gone.has(b.id) && b.destroyingUntil !== undefined;
      // 0x423a10: a ball reaching 40 maj of destruction whose node is the first of the list (0x423abc–0x423ac7) zeroes
      // mSpeed and holds the pusher ≥ 40 maj (0x423ac9–0x423ad6); the pusher restarts from 0 at chainAccel
      // (0x423ca4–0x423caa). `list` is sorted by s: index 0 is the rearmost ball, exploding balls included.
      if (this.state === 'playing' && list.length > 0 && removed(list[0])) {
        chain.stopTicks = Math.max(chain.stopTicks, this.config.pusherStopTicks);
        chain.speed = 0;
      }
      for (let a = 0; a < list.length; a++) {
        if (!removed(list[a])) continue;
        let b = a;
        while (b + 1 < list.length && removed(list[b + 1])) b++;
        const prev = list[a - 1];
        const next = list[b + 1];
        if (prev && next && prev.destroyingUntil === undefined && next.destroyingUntil === undefined && prev.color === next.color) {
          next.attract = this.config.attractStartAfterMatch;
        }
        a = b;
      }
      chain.balls = list.filter(b => !removed(b));
    }
  }

  /**
   * Ammo whose colour is no longer present in the chains is replaced by one that is (D-14):
   * exploding balls do not count from the tick they are marked, `current` and `next` are checked
   * every tick, the projectile in flight keeps its colour (r206). Draws only on a replacement.
   */
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
            this.dropCoin();
            this.emit('lost', { lives: this.lives, chain: chain.index });
            return;
          }
        }
      }
      const empty = this.chains.every(c => c.balls.length === 0 && c.removals.length === 0);
      if (this.zumaMode && empty) this.startClearing();
    } else if (this.state === 'draining' && this.chains.every(c => c.balls.length === 0)) {
      // 0x428383–0x4283a5: lives − 1 at the loss, game over when the count is ≤ 0 — `lives` frogs per game, the one
      // in play included (the HUD shows lives − 1 in reserve, D-33).
      // `lost` was emitted at the loss already (one event per loss, « Perdu… » once): only the game over is new here.
      this.state = this.lives <= 0 ? 'gameover' : 'lost';
      if (this.state === 'gameover') this.emit('gameover');
    }
  }

  /** Tally cadence, guarded against a configuration that would stall it (T-05-14). */
  private cleanupTiming(): { stepPx: number; stepTicks: number; popTicks: number } {
    const { cleanupStepPx, cleanupStepTicks, cleanupPopTicks } = this.config;
    return { stepPx: Math.max(1, cleanupStepPx), stepTicks: Math.max(0.5, cleanupStepTicks), popTicks: Math.max(0.5, cleanupPopTicks) };
  }

  /**
   * Last ball destroyed in ZUMA mode (0x4288e6–0x428923, D-10): no more input, the coin is dropped, every
   * curve pays its level bonus at once — (100 − coverage) × 100 with the board empty, hypothesis A3 — and
   * each chain gets a tally marker (D-30, user choice: all markers together, where research §7 reads a
   * sequential tally with +50 maj between curves) starting from its last explosion — from the start of its
   * track when it had none — aligned so that its `cleanupStepPx` steps land exactly on its skull (0x421550).
   * `steps` is bounded by the track length, so the tally always terminates.
   */
  private startClearing(): void {
    const { stepPx, stepTicks } = this.cleanupTiming();
    const markers: CleanupMarker[] = this.chains.map(chain => {
      const length = chain.track.length;
      const from = Math.max(0, Math.min(length, this.lastDestroy[chain.index] ?? 0));
      const steps = Math.ceil((length - from) / stepPx);
      return { chain: chain.index, s: length - steps * stepPx, step: 0, steps };
    });
    const steps = markers.reduce((m, k) => Math.max(m, k.steps), 0);
    this.state = 'clearing';
    this.clearTick = this.tick;
    this.projectiles = [];
    for (const c of this.chains) c.recoils = [];
    this.dropCoin();
    const bonus = this.config.levelBonus * this.chains.length;
    this.addScore(bonus);
    const { cleanupStartTicks, cleanupEndTicks } = this.config;
    this.cleanup = {
      markers,
      step: 0,
      steps,
      nextTick: this.tick + cleanupStartTicks,
      popNext: this.tick + cleanupStartTicks + 0.6, // first pop 1 maj after the first step
      popIndex: 0,
      lastStepTick: this.tick + cleanupStartTicks + stepTicks * (steps - 1),
      endTick: steps === 0 ? this.tick + cleanupStartTicks + cleanupEndTicks : null,
    };
    const lead = markers[Math.min(this.lastDestroyChain ?? 0, markers.length - 1)];
    const pos = this.chains[lead.chain].track.pointAt(lead.s);
    const list = markers.map(m => {
      const p = this.chains[m.chain].track.pointAt(m.s);
      return { chain: m.chain, x: p.x, y: p.y, steps: m.steps };
    });
    this.emit('clearing', { x: pos.x, y: pos.y, chain: lead.chain, levelBonus: bonus, markers: list });
  }

  /**
   * Tally (0x421550, D-30): at each shared step, every marker with steps left advances `cleanupStepPx`
   * (its last step exactly on its skull) at +`cleanupPoints` and emits its `cleanup`, every `cleanupStepTicks`
   * from `cleanupStartTicks`; one `cleanup-pop` every `cleanupPopTicks` on the shared clock while the longest
   * marker has steps; `won` `cleanupEndTicks` after its last step, with the ACE TIME bonus computed — not credited.
   */
  private tickCleanup(): void {
    const cleanup = this.cleanup;
    if (this.state !== 'clearing' || !cleanup) return;
    const { stepPx, stepTicks, popTicks } = this.cleanupTiming();
    const EPS = 1e-9;
    if (cleanup.step < cleanup.steps && this.tick >= cleanup.nextTick - EPS) {
      cleanup.step++;
      cleanup.nextTick = (this.clearTick ?? this.tick) + this.config.cleanupStartTicks + stepTicks * cleanup.step;
      const points = this.config.cleanupPoints;
      for (const marker of cleanup.markers) {
        if (marker.step >= marker.steps) continue;
        const track = this.chains[marker.chain].track;
        marker.step++;
        marker.s = marker.step === marker.steps ? track.length : marker.s + stepPx;
        this.cleanupScore += points;
        this.addScore(points);
        const pos = track.pointAt(marker.s);
        this.emit('cleanup', { x: pos.x, y: pos.y, s: marker.s, points, step: marker.step, steps: marker.steps, progress: marker.step / marker.steps, chain: marker.chain });
      }
      if (cleanup.step === cleanup.steps) cleanup.endTick = this.tick + this.config.cleanupEndTicks;
    }
    if (cleanup.steps > 0 && cleanup.popNext <= cleanup.lastStepTick + EPS && this.tick >= cleanup.popNext - EPS) {
      this.emit('cleanup-pop', { index: cleanup.popIndex++, progress: cleanup.step / Math.max(1, cleanup.steps) });
      cleanup.popNext += popTicks;
    }
    if (cleanup.endTick === null || this.tick < cleanup.endTick) return;
    const seconds = this.levelTicks / this.config.tickHz; // D-13: level clock, frozen at clearing
    this.timeBonus = aceTimeBonus(seconds, this.config.parTime);
    this.state = 'won';
    this.cleanup = null;
    this.emit('won', { score: this.score, levelBonus: this.config.levelBonus * this.chains.length, timeBonus: this.timeBonus, seconds });
  }
}
