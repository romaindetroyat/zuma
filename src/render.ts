/**
 * Canvas renderer, native 640×480. Draws either the original sprites supplied by a
 * local asset pack or a vector fallback with the same geometry, so gameplay and
 * tests never depend on proprietary media.
 */
import { type Ball, type Point, type PowerKind, type Track, type ZumaEngine } from './core.js';
import { EXPLOSION_FRAME_TICKS, EXPLOSION_RGB, PARTICLE_LIFE_TICKS, PARTICLE_RGB, coinFrame, explosionFrame, insertionPose, particleAlpha, particleColor, rollFrame, sparkleFrame, type ColorBurst } from './feedback.js';
import type { Bitmap, DrawableLayer, LevelArt, Sheet } from './original.js';
import type { BitmapFont } from './bitmapfont.js';

export interface RenderAssets {
  balls: Array<Sheet | null>;
  ballShadow: Bitmap | null;
  powers: Record<PowerKind, Array<Bitmap | null>>;
  hole: Bitmap | null;
  /** pitcover: 12 frames 88×88 (closed skull lid → fully open) masked by _pitcover, drawn over the hole by threat level. */
  pitcover: Sheet | null;
  explosions: Array<Sheet | null>;
  frogPad: Bitmap | null;
  tongue: Bitmap | null;
  /** EYEBLINK: two 58×20 frames (half-closed, closed) keyed on the corner colour. */
  eyeblink: Bitmap | null;
  menubar: Bitmap | null;
  gauge: Bitmap | null;
  gaugeGreen: Bitmap | null;
  lives: Bitmap | null;
  /** COIN: 30 frames 36×36 (one every 3 ticks) masked by _COIN (D-08). */
  coin: Sheet | null;
  /** sparkle: 14 horizontal frames 20×20 on black, composited `lighter` over the coin (D-08). */
  sparkle: Bitmap | null;
  /** Original bitmap fonts: title (NativeAlienExtended18) and text (Cancun12) for the HUD messages, float (CancunFloat14) for the floating texts. */
  fonts: { title: BitmapFont | null; text: BitmapFont | null; float: BitmapFont | null } | null;
  /** 2 when balls, shadow, power icons, menubar and fonts are the 2 × EPX copies drawn at their logical size (D-19); 1 otherwise. */
  pixelScale: 1 | 2;
}

/** Backing-store scale from which the 2 × assets are used (below it the bilinear 1 × pictures look fine). */
export const HD_MIN_SCALE = 1.5;

export interface LevelView {
  name: string;
  tracks: Track[];
  frog: Point;
  art: LevelArt | null;
  skullRotation: number | null;
}

export interface FloatingText { text: string; x: number; y: number; start: number; color: string }

/**
 * Presentation state: particle bursts, floating texts, the tick of the last shot (tongue flick)
 * and the threat level 0..1 (head ball near the skull: warning beat + pit cover opening).
 */
export interface Fx { bursts: ColorBurst[]; floats: FloatingText[]; tongueStart: number; threat: number }

export interface HudState {
  levelLabel: string;
  lives: number;
  score: number;
  progress: number;
  zuma: boolean;
  message: string | null;
  subMessage: string | null;
}

export const WIDTH = 640;
export const HEIGHT = 480;
export const HUD_HEIGHT = 44;
/**
 * Measured on SMALLFROGonPAD (108×108, drawn centred, +y = aim direction after
 * `rotate(angle − π/2)`): the mouth band sits 24 px ahead of the centre, the
 * dark hatch on the back 26 px behind it. The projectile leaves from the mouth.
 */
export const FROG_FRONT = 24;
export const FROG_BACK = 26;
/** Ticks the tongue stays out after a shot, and the blink period/length in frames. */
const TONGUE_TICKS = 10;
const BLINK_PERIOD = 240;
const BLINK_FRAMES = 8;
const BALL_CSS = PARTICLE_RGB.map(rgb => `#${rgb.toString(16).padStart(6, '0')}`);
interface HudButtonBox { x: number; y: number; w: number; h: number; label: string }
const VECTOR_BUTTONS: Record<'menu' | 'stats', HudButtonBox> = {
  menu: { x: 8, y: 8, w: 76, h: 28, label: 'MENU' },
  stats: { x: WIDTH - 84, y: 8, w: 76, h: 28, label: 'STATS' },
};
/** Slots of the original menubar artwork (green/red/black ovals along the top edge). */
const ORIGINAL_BUTTONS: Record<'menu' | 'stats', HudButtonBox> = {
  menu: { x: 22, y: 4, w: 104, h: 26, label: 'MENU' },
  stats: { x: WIDTH - 86, y: HEIGHT - 30, w: 76, h: 24, label: 'STATS' },
};
export type HudButton = 'menu' | 'stats';

const POWER_GLYPH: Record<PowerKind, string> = { bomb: '✸', slow: '◐', backwards: '◀', accuracy: '✛' };

/** Number of draw passes of the board (0x40c470: priorities 0..3 of the CURV, plus 4). */
export const DRAW_PASS_COUNT = 5;
/** One pass of the board: the cutouts, then the balls, of priority `layer`. */
export interface DrawPass<B, C> { layer: number; cutouts: C[]; balls: B[] }
/** A ball of the board with its draw priority (Track.ballPriority) and its track. */
interface BoardBall { priority: number; ball: Ball; track: Track }

/** Pass of a priority: integer 0..4, non-finite → 0 (T-05-28). */
function drawPassOf(priority: number | undefined): number {
  const p = Number(priority);
  return Number.isFinite(p) ? Math.max(0, Math.min(DRAW_PASS_COUNT - 1, Math.trunc(p))) : 0;
}

/**
 * Board draw order (0x40c470, spike 03 Q1, D-23): five passes L = 0..4, each made of the cutouts of priority
 * L (0x409210) then the balls of priority L, in their input order. With the pack's cutouts (all `pri` 1):
 * balls of priority 0, the cutouts, then balls of priority ≥ 1. Pure and generic; nothing is dropped.
 */
export function drawPasses<B extends { priority: number }, C extends { priority: number }>(balls: B[], cutouts: C[]): DrawPass<B, C>[] {
  const passes: DrawPass<B, C>[] = Array.from({ length: DRAW_PASS_COUNT }, (_, layer) => ({ layer, cutouts: [], balls: [] }));
  for (const c of cutouts) passes[drawPassOf(c.priority)].cutouts.push(c);
  for (const b of balls) passes[drawPassOf(b.priority)].balls.push(b);
  return passes;
}

export class Renderer {
  private readonly ctx: CanvasRenderingContext2D;
  private view: LevelView | null = null;
  private trackCache: HTMLCanvasElement | null = null;
  /** Backing-store pixels per logical pixel (devicePixelRatio × CSS scale, capped at 4). */
  private storeScale = 1;

  /** Backing-store pixels per logical pixel, as set by `resize` (the STATS dialog is composed at this scale, D-19). */
  get scale(): number {
    return this.storeScale;
  }

  constructor(readonly canvas: HTMLCanvasElement, public assets: RenderAssets | null) {
    canvas.width = WIDTH;
    canvas.height = HEIGHT;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('2D canvas unavailable');
    this.ctx = ctx;
  }

  setLevel(view: LevelView): void {
    this.view = view;
    this.trackCache = null;
  }

  /**
   * Sizes the backing store so text and vectors stay crisp at the displayed size.
   * Game logic, HUD and hit testing keep working in logical 640×480 coordinates;
   * `draw()` applies the scale through `setTransform`. In pixelated mode the store
   * stays 640×480 and the CSS integer scale does the (unsmoothed) enlargement.
   */
  resize(cssWidth: number, dpr: number, pixelated: boolean): void {
    const scale = pixelated ? 1 : Math.min(4, Math.max(1, (cssWidth / WIDTH) * dpr));
    const w = Math.round(WIDTH * scale);
    const h = Math.round(HEIGHT * scale);
    if (w !== this.canvas.width || h !== this.canvas.height) {
      this.canvas.width = w;
      this.canvas.height = h;
    }
    this.storeScale = scale;
  }

  /** Returns the HUD button under canvas coordinates, if any. */
  hitTest(x: number, y: number): HudButton | null {
    const buttons = this.assets?.menubar ? ORIGINAL_BUTTONS : VECTOR_BUTTONS;
    for (const [key, b] of Object.entries(buttons)) {
      if (x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h) return key as HudButton;
    }
    return null;
  }

  draw(engine: ZumaEngine, fx: Fx, hud: HudState, frame: number): void {
    const ctx = this.ctx;
    const view = this.view;
    if (!view) return;
    ctx.save();
    ctx.setTransform(this.storeScale, 0, 0, this.storeScale, 0, 0);
    ctx.imageSmoothingEnabled = true;
    this.drawBackground(view);
    this.drawOverlays(view);
    this.drawHoles(view, fx);
    // D-23 (0x40c470): five passes L = 0..4 — cutouts of priority L (0x409210), bursts of layer L (0x40b4d0),
    // balls of priority L of every chain (settled, then those still opening their slot), then their explosions.
    for (const pass of drawPasses(this.boardBalls(engine), view.art?.cutouts ?? [])) {
      this.drawCutouts(pass.cutouts);
      this.drawBursts(engine, fx, pass.layer);
      for (const item of pass.balls) this.drawBoardBall(engine, item, frame);
      this.drawExplosions(engine, pass.balls);
    }
    this.drawCoin(engine);
    this.drawProjectiles(engine, frame);
    this.drawFrog(engine, view, fx, frame);
    this.drawFloats(engine, fx);
    this.drawHud(hud, frame);
    ctx.restore();
  }

  // ------------------------------------------------------------ background

  /** Original backgrounds are drawn 1:1 (cropped if larger, letterboxed if smaller), never scaled. */
  private drawBackground(view: LevelView): void {
    const ctx = this.ctx;
    const bg = view.art?.background;
    if (bg) {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, WIDTH, HEIGHT);
      if (bg.width >= WIDTH && bg.height >= HEIGHT) ctx.drawImage(bg, 0, 0, WIDTH, HEIGHT, 0, 0, WIDTH, HEIGHT);
      else ctx.drawImage(bg, 0, 0);
      return;
    }
    if (!this.trackCache) this.trackCache = this.paintProceduralBoard(view);
    ctx.drawImage(this.trackCache, 0, 0);
  }

  private paintProceduralBoard(view: LevelView): HTMLCanvasElement {
    const board = document.createElement('canvas');
    board.width = WIDTH;
    board.height = HEIGHT;
    const ctx = board.getContext('2d');
    if (!ctx) return board;
    const sky = ctx.createLinearGradient(0, 0, 0, HEIGHT);
    sky.addColorStop(0, '#2b3b2a');
    sky.addColorStop(1, '#13200f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    // Stone texture: deterministic speckles.
    let seed = 7;
    const rnd = (): number => { seed = (seed * 1103515245 + 12345) & 0x7fffffff; return seed / 0x7fffffff; };
    ctx.fillStyle = 'rgba(255,255,255,0.035)';
    for (let i = 0; i < 900; i++) ctx.fillRect(rnd() * WIDTH, rnd() * HEIGHT, 1 + rnd() * 3, 1 + rnd() * 3);
    for (const track of view.tracks) {
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      this.tracePath(ctx, track);
      ctx.lineWidth = 42;
      ctx.strokeStyle = 'rgba(0,0,0,0.45)';
      ctx.stroke();
      this.tracePath(ctx, track);
      ctx.lineWidth = 34;
      ctx.strokeStyle = '#4a3a26';
      ctx.stroke();
      this.tracePath(ctx, track);
      ctx.lineWidth = 28;
      ctx.strokeStyle = '#5c4a30';
      ctx.stroke();
      // Tunnel sections (CURV byte A, bit 0 of the flags) get a darker lid.
      ctx.lineWidth = 46;
      ctx.strokeStyle = 'rgba(20,12,6,0.55)';
      let open = false;
      ctx.beginPath();
      for (let i = 0; i < track.points.length; i++) {
        const p = track.points[i];
        if (track.layers[i] & 1) {
          if (!open) { ctx.moveTo(p.x, p.y); open = true; } else ctx.lineTo(p.x, p.y);
        } else if (open) {
          ctx.stroke();
          ctx.beginPath();
          open = false;
        }
      }
      if (open) ctx.stroke();
    }
    return board;
  }

  private tracePath(ctx: CanvasRenderingContext2D, track: Track): void {
    ctx.beginPath();
    const pts = track.points;
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
  }

  /** Skull hole at each track end; with the pack, the pit cover frame opens with `fx.threat` (0 = closed lid, 1 = open). */
  private drawHoles(view: LevelView, fx: Fx): void {
    const ctx = this.ctx;
    for (const track of view.tracks) {
      const end = track.pointAt(track.length);
      const t = track.tangentAt(track.length);
      const angle = view.skullRotation !== null ? (view.skullRotation * Math.PI) / 180 : Math.atan2(t.y, t.x);
      if (this.assets?.hole) {
        ctx.save();
        ctx.translate(end.x, end.y);
        ctx.rotate(angle + Math.PI / 2);
        ctx.drawImage(this.assets.hole, -44, -44);
        const cover = this.assets.pitcover;
        if (cover) {
          const frame = pitCoverFrame(fx.threat, cover.frames);
          ctx.drawImage(cover.image, 0, frame * cover.frameHeight, cover.frameWidth, cover.frameHeight, -cover.frameWidth / 2, -cover.frameHeight / 2, cover.frameWidth, cover.frameHeight);
        }
        ctx.restore();
        continue;
      }
      const start = track.pointAt(0);
      ctx.fillStyle = '#0b0906';
      ctx.beginPath();
      ctx.arc(start.x, start.y, 22, 0, Math.PI * 2);
      ctx.fill();
      const g = ctx.createRadialGradient(end.x, end.y, 4, end.x, end.y, 30);
      g.addColorStop(0, '#000');
      g.addColorStop(0.7, '#1a1410');
      g.addColorStop(1, '#6b5a3a');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 30, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#e8dcc0';
      ctx.font = 'bold 26px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('☠', end.x, end.y + 1);
    }
  }

  /**
   * BackgroundAlpha layers (mosaics) are drawn static at (x, y) under the balls; Cutout
   * tunnels stay above them. No drift, no scaling: the previous oscillation read as a
   * zoom of the whole screen on level 1-3 (U11). Their (vx, vy) vector is kept in the data
   * but intentionally unused.
   */
  private drawOverlays(view: LevelView): void {
    if (!view.art) return;
    const ctx = this.ctx;
    for (const o of view.art.overlays) ctx.drawImage(o.image, o.x, o.y);
  }

  /** Cutouts of one pass, drawn 1:1 at their position (stencils of the background, hypothesis C2). */
  private drawCutouts(cutouts: DrawableLayer[]): void {
    const ctx = this.ctx;
    for (const c of cutouts) ctx.drawImage(c.image, c.x, c.y);
  }

  // ----------------------------------------------------------------- balls

  /**
   * Every ball of every chain within [−r, length + r], with its draw priority (Track.ballPriority, 0x405c10):
   * the settled balls first, then those still opening their slot, so a landing ball stays above its
   * neighbours of the same pass. No ball is left out for a layer flag (D-23).
   */
  private boardBalls(engine: ZumaEngine): BoardBall[] {
    const r = engine.config.ballRadius;
    const settled: BoardBall[] = [];
    const growing: BoardBall[] = [];
    for (const chain of engine.chains) {
      const track = chain.track;
      for (const ball of chain.balls) {
        if (ball.s < -r || ball.s > track.length + r) continue;
        const item = { priority: track.ballPriority(ball.s), ball, track };
        if (ball.width < 1 && ball.enterFrom !== undefined) growing.push(item);
        else settled.push(item);
      }
    }
    return settled.concat(growing);
  }

  private drawBoardBall(engine: ZumaEngine, item: BoardBall, frame: number): void {
    const { ball, track } = item;
    const p = track.pointAt(ball.s);
    let x = p.x;
    let y = p.y;
    let alpha = 1;
    let scale = 1;
    if (ball.destroyingUntil !== undefined) {
      const remaining = Math.max(0, ball.destroyingUntil - engine.tick) / engine.config.destroyTicks;
      alpha = remaining;
      scale = 0.6 + 0.4 * remaining;
    }
    if (ball.width < 1 && ball.enterFrom) {
      // D-11: slide from the landing point into the slot that is opening.
      const pose = insertionPose(ball.width, ball.enterFrom, p);
      x = pose.x;
      y = pose.y;
      scale *= pose.scale;
    }
    this.drawBall(ball.color, x, y, ball.s, alpha, scale, ball.power, frame);
  }

  private drawBall(color: number, x: number, y: number, roll: number, alpha: number, scale: number, power: PowerKind | undefined, frame: number): void {
    const ctx = this.ctx;
    const sheet = this.assets?.balls[color] ?? null;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(x, y);
    ctx.scale(scale, scale);
    if (sheet) {
      // 2 × pictures (assets.pixelScale) are drawn at their logical size; the sheet frame already maps to 32 × 32.
      const k = this.assets?.pixelScale ?? 1;
      if (this.assets?.ballShadow) ctx.drawImage(this.assets.ballShadow, -15, -13, this.assets.ballShadow.width / k, this.assets.ballShadow.height / k);
      // D-12: the frame follows the arc length, so recoil visibly rolls the ball backwards.
      const f = rollFrame(roll, sheet.frames);
      ctx.drawImage(sheet.image, 0, f * sheet.frameHeight, sheet.frameWidth, sheet.frameHeight, -16, -16, 32, 32);
      if (power) {
        const icon = this.assets?.powers[power][color] ?? null;
        ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(frame / 5));
        if (icon) ctx.drawImage(icon, -16, -16, icon.width / k, icon.height / k);
        else this.drawPowerGlyph(power);
      }
    } else {
      const base = BALL_CSS[color] ?? '#fff';
      const g = ctx.createRadialGradient(-5, -6, 2, 0, 0, 17);
      g.addColorStop(0, '#ffffff');
      g.addColorStop(0.25, base);
      g.addColorStop(1, shade(base, 0.35));
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.arc(2, 3, 16, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, 16, 0, Math.PI * 2);
      ctx.fill();
      // Rolling stripe so motion reads along the track.
      ctx.save();
      ctx.beginPath();
      ctx.arc(0, 0, 15, 0, Math.PI * 2);
      ctx.clip();
      ctx.rotate(roll / 16);
      ctx.strokeStyle = 'rgba(0,0,0,0.18)';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.ellipse(0, 0, 15, 6, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
      if (power) {
        ctx.globalAlpha = alpha * (0.75 + 0.25 * Math.sin(frame / 5));
        this.drawPowerGlyph(power);
      }
    }
    ctx.restore();
  }

  private drawPowerGlyph(power: PowerKind): void {
    const ctx = this.ctx;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, 10, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px "Trebuchet MS", Verdana, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(POWER_GLYPH[power], 0, 1);
  }

  // ------------------------------------------------------------------ coin

  /**
   * The coin on its treasure point (D-08): COIN frame by `coinFrame(tick)` centred on (x, y),
   * then the periodic sparkle (`sparkleFrame`) added `lighter` on its upper-right edge.
   * Without the sprite: gold disc with a dark ring and a highlight.
   */
  private drawCoin(engine: ZumaEngine): void {
    const coin = engine.coin;
    if (!coin) return;
    const ctx = this.ctx;
    const sheet = this.assets?.coin ?? null;
    if (sheet) {
      const f = coinFrame(engine.tick, sheet.frames);
      ctx.drawImage(sheet.image, 0, f * sheet.frameHeight, sheet.frameWidth, sheet.frameHeight, coin.x - sheet.frameWidth / 2, coin.y - sheet.frameHeight / 2, sheet.frameWidth, sheet.frameHeight);
    } else {
      const g = ctx.createRadialGradient(coin.x - 4, coin.y - 5, 2, coin.x, coin.y, 12);
      g.addColorStop(0, '#fff3b0');
      g.addColorStop(0.5, '#f2c230');
      g.addColorStop(1, '#c48a10');
      ctx.save();
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(coin.x, coin.y, 12, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#8a5a10';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.restore();
    }
    const sparkle = this.assets?.sparkle ?? null;
    const sf = sparkleFrame(engine.tick);
    if (sparkle && sf >= 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      ctx.drawImage(sparkle, sf * 20, 0, 20, 20, coin.x + 8, coin.y - 18, 20, 20);
      ctx.restore();
    }
  }

  private drawProjectiles(engine: ZumaEngine, frame: number): void {
    for (const p of engine.projectiles) this.drawBall(p.color, p.x, p.y, (p.x + p.y) * 0.5, 1, 1, undefined, frame);
  }

  // ------------------------------------------------------------------ frog

  private drawFrog(engine: ZumaEngine, view: LevelView, fx: Fx, frame: number): void {
    const ctx = this.ctx;
    const f = view.frog;
    const angle = Math.atan2(engine.aim.y - f.y, engine.aim.x - f.x);
    const dir = { x: Math.cos(angle), y: Math.sin(angle) };
    if (engine.accuracyTicks > 0 && engine.state === 'playing') this.drawAimRay(engine, f, dir);
    ctx.save();
    ctx.translate(f.x, f.y);
    if (this.assets?.frogPad) {
      // Local frame: +y points along the aim, the sprite is centred on the pad.
      ctx.rotate(angle - Math.PI / 2);
      ctx.drawImage(this.assets.frogPad, -54, -54);
      // Tongue flick: grows out of the mouth then retracts over TONGUE_TICKS (tip of the sprite is at +y).
      const t = engine.tick - fx.tongueStart;
      if (this.assets.tongue && t >= 0 && t < TONGUE_TICKS) {
        const e = Math.sin((Math.PI * t) / TONGUE_TICKS);
        ctx.save();
        ctx.translate(0, FROG_FRONT - 6);
        ctx.scale(1, Math.max(0.05, e));
        ctx.drawImage(this.assets.tongue, -16, 0);
        ctx.restore();
      }
      // Periodic blink: EYEBLINK holds two 58×20 frames, frame 0 (half-closed) matches the eyes at local (−29, −12).
      const blink = frame % BLINK_PERIOD;
      if (this.assets.eyeblink && blink < BLINK_FRAMES) {
        const eb = this.assets.eyeblink;
        const fh = Math.max(1, Math.floor(eb.height / 2));
        const bf = blink < 2 || blink >= BLINK_FRAMES - 2 ? 0 : 1;
        ctx.drawImage(eb, 0, bf * fh, eb.width, fh, -29, -12, eb.width, fh);
      }
    } else {
      ctx.rotate(angle + Math.PI / 2);
      ctx.fillStyle = 'rgba(0,0,0,0.35)';
      ctx.beginPath();
      ctx.ellipse(3, 5, 30, 28, 0, 0, Math.PI * 2);
      ctx.fill();
      const body = ctx.createRadialGradient(-6, -8, 4, 0, 0, 30);
      body.addColorStop(0, '#8fdc5a');
      body.addColorStop(1, '#2f7a24');
      ctx.fillStyle = body;
      ctx.beginPath();
      ctx.ellipse(0, 0, 26, 30, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#1d4d16';
      ctx.lineWidth = 3;
      ctx.stroke();
      for (const side of [-1, 1]) {
        ctx.fillStyle = '#f4f4dc';
        ctx.beginPath();
        ctx.arc(side * 12, -18, 7, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.beginPath();
        ctx.arc(side * 12, -20, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
    ctx.restore();
    // Next ball rides in the hatch on the frog's back; the current one sits in its mouth.
    const back = this.assets?.frogPad ? FROG_BACK : 8;
    const front = this.assets?.frogPad ? FROG_FRONT : 26;
    this.drawBall(engine.next, f.x - dir.x * back, f.y - dir.y * back, frame * 0.2, 1, 0.55, undefined, frame);
    if (engine.state === 'playing') this.drawBall(engine.current, f.x + dir.x * front, f.y + dir.y * front, 0, 1, 1, undefined, frame);
  }

  private drawAimRay(engine: ZumaEngine, from: Point, dir: Point): void {
    const ctx = this.ctx;
    const r = engine.config.ballRadius;
    let end = { x: from.x + dir.x * 900, y: from.y + dir.y * 900 };
    let best = Infinity;
    for (const chain of engine.chains) {
      for (const b of engine.alive(chain)) {
        const p = chain.track.pointAt(b.s);
        const rel = { x: p.x - from.x, y: p.y - from.y };
        const along = rel.x * dir.x + rel.y * dir.y;
        if (along <= 0) continue;
        const perp = Math.abs(rel.x * dir.y - rel.y * dir.x);
        if (perp < 2 * r && along < best) {
          best = along;
          end = { x: from.x + dir.x * (along - 2 * r), y: from.y + dir.y * (along - 2 * r) };
        }
      }
    }
    ctx.save();
    ctx.setLineDash([6, 8]);
    ctx.strokeStyle = 'rgba(255,255,255,0.65)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(from.x + dir.x * 40, from.y + dir.y * 40);
    ctx.lineTo(end.x, end.y);
    ctx.stroke();
    ctx.restore();
  }

  // --------------------------------------------------------------- effects

  /** Explosion sprites of the exploding balls of one pass (above the balls of that pass). */
  private drawExplosions(engine: ZumaEngine, items: BoardBall[]): void {
    const ctx = this.ctx;
    for (const { ball, track } of items) {
      if (ball.destroyingUntil === undefined) continue;
      const counter = engine.config.destroyTicks - (ball.destroyingUntil - engine.tick);
      const frame = explosionFrame(counter);
      if (frame < 0) continue;
      const p = track.pointAt(ball.s);
      const sheet = this.assets?.explosions[ball.color] ?? null;
      if (sheet) {
        const f = Math.min(sheet.frames - 1, Math.floor(frame * sheet.frames / 13));
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.drawImage(sheet.image, 0, f * sheet.frameHeight, sheet.frameWidth, sheet.frameHeight, p.x - sheet.frameWidth / 2, p.y - sheet.frameHeight / 2, sheet.frameWidth, sheet.frameHeight);
        ctx.restore();
      } else {
        const rgb = EXPLOSION_RGB[ball.color] ?? 0xffffff;
        const radius = 10 + frame * 3;
        ctx.save();
        ctx.globalAlpha = Math.max(0, 1 - counter / (13 * EXPLOSION_FRAME_TICKS));
        ctx.strokeStyle = `#${rgb.toString(16).padStart(6, '0')}`;
        ctx.lineWidth = 4;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
      }
    }
  }

  /** Particle bursts of one layer (0x40b4d0); a burst without a layer belongs to the last pass. */
  private drawBursts(engine: ZumaEngine, fx: Fx, layer: number): void {
    const ctx = this.ctx;
    for (const burst of fx.bursts) {
      if (drawPassOf(burst.layer ?? DRAW_PASS_COUNT - 1) !== layer) continue;
      const counter = engine.tick - burst.start;
      const alpha = particleAlpha(counter);
      if (alpha <= 0) continue;
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = particleColor(burst.color);
      for (const q of burst.particles) {
        const size = q.size * 2;
        ctx.fillRect(q.x + q.vx * counter * 2.5 - size / 2, q.y + q.vy * counter * 2.5 - size / 2, size, size);
      }
      ctx.restore();
    }
  }

  /** Floating texts, after the frog (unchanged order). */
  private drawFloats(engine: ZumaEngine, fx: Fx): void {
    const ctx = this.ctx;
    const floatFont = this.assets?.fonts?.float ?? null;
    for (const t of fx.floats) {
      const age = engine.tick - t.start;
      const alpha = Math.max(0, 1 - age / PARTICLE_LIFE_TICKS / 1.5);
      if (alpha <= 0) continue;
      if (floatFont) {
        // Original floating font (CancunFloat14, its own gold colouring); baseline half an ascent below the anchor.
        floatFont.draw(ctx, t.text, t.x, t.y - age * 0.5 + floatFont.ascent / 2, { align: 'center', alpha, tint: t.color });
        continue;
      }
      ctx.save();
      ctx.globalAlpha = alpha;
      ctx.font = 'bold 16px "Trebuchet MS", Verdana, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.lineWidth = 4;
      ctx.strokeStyle = 'rgba(0,0,0,0.7)';
      ctx.strokeText(t.text, t.x, t.y - age * 0.5);
      ctx.fillStyle = t.color;
      ctx.fillText(t.text, t.x, t.y - age * 0.5);
      ctx.restore();
    }
  }

  // ------------------------------------------------------------------- HUD

  private drawHud(hud: HudState, frame: number): void {
    const ctx = this.ctx;
    ctx.save();
    ctx.textBaseline = 'middle';
    const font = (px: number): string => `bold ${px}px "Trebuchet MS", Verdana, sans-serif`;
    if (this.assets?.menubar) {
      // Original artwork: MENU slot, lives slot, score slot, level slot, gauge slot (2 × copy drawn at 640 × 480, D-19).
      const k = this.assets.pixelScale;
      ctx.drawImage(this.assets.menubar, 0, 0, this.assets.menubar.width / k, this.assets.menubar.height / k);
      ctx.fillStyle = '#f3e4b8';
      ctx.font = font(15);
      ctx.textAlign = 'center';
      ctx.fillText('MENU', 74, 18);
      for (let i = 0; i < Math.min(hud.lives, 3); i++) {
        if (this.assets.lives) ctx.drawImage(this.assets.lives, 172 + i * 20, 6, 20, 19);
      }
      if (hud.lives > 3) {
        ctx.font = font(11);
        ctx.fillText(`+${hud.lives - 3}`, 236, 18);
      }
      ctx.font = font(17);
      ctx.textAlign = 'right';
      ctx.fillStyle = '#ffffff';
      ctx.fillText(String(hud.score), 362, 18);
      ctx.textAlign = 'center';
      ctx.font = font(14);
      ctx.fillText(hud.levelLabel, 440, 18);
      const gx = 536;
      const gy = 8;
      if (this.assets.gauge) ctx.drawImage(this.assets.gauge, gx, gy);
      const fill = Math.max(0, Math.min(1, hud.progress));
      if (this.assets.gaugeGreen && fill > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(gx, gy, Math.round(62 * fill), 18);
        ctx.clip();
        ctx.globalAlpha = hud.zuma ? 0.55 + 0.45 * Math.sin(frame / 4) : 1; // D-16: the full gauge pulses in ZUMA mode
        ctx.drawImage(this.assets.gaugeGreen, gx, gy);
        ctx.restore();
      }
      if (hud.zuma) {
        ctx.font = font(11);
        ctx.fillStyle = `hsl(${(frame * 6) % 360},90%,70%)`;
        ctx.fillText('ZUMA !', gx + 31, gy + 9);
      }
      const b = ORIGINAL_BUTTONS.stats;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, b.x, b.y, b.w, b.h, 8);
      ctx.fill();
      ctx.strokeStyle = '#d9b86a';
      ctx.lineWidth = 1.5;
      ctx.stroke();
      ctx.fillStyle = '#f3e4b8';
      ctx.font = font(13);
      ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, HUD_HEIGHT);
      g.addColorStop(0, 'rgba(12,8,4,0.92)');
      g.addColorStop(1, 'rgba(40,28,14,0.85)');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, WIDTH, HUD_HEIGHT);
      ctx.fillStyle = '#c9a85a';
      ctx.fillRect(0, HUD_HEIGHT - 2, WIDTH, 2);
      for (const b of Object.values(VECTOR_BUTTONS)) {
        ctx.fillStyle = 'rgba(0,0,0,0.45)';
        roundRect(ctx, b.x, b.y, b.w, b.h, 8);
        ctx.fill();
        ctx.strokeStyle = '#d9b86a';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.fillStyle = '#f3e4b8';
        ctx.font = font(14);
        ctx.textAlign = 'center';
        ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 1);
      }
      for (let i = 0; i < Math.min(hud.lives, 6); i++) {
        const x = 98 + i * 24;
        ctx.fillStyle = '#6fd34a';
        ctx.beginPath();
        ctx.ellipse(x + 10, 22, 9, 8, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#111';
        ctx.fillRect(x + 6, 17, 2, 2);
        ctx.fillRect(x + 12, 17, 2, 2);
      }
      ctx.fillStyle = '#f7ecc8';
      ctx.font = font(15);
      ctx.textAlign = 'center';
      ctx.fillText(`Niveau ${hud.levelLabel}`, 290, 22);
      ctx.textAlign = 'right';
      ctx.font = font(18);
      ctx.fillText(String(hud.score).padStart(7, '0'), 430, 22);
      const gx = 442;
      const gy = 13;
      const gw = 104;
      const gh = 18;
      ctx.fillStyle = 'rgba(0,0,0,0.5)';
      roundRect(ctx, gx, gy, gw, gh, 9);
      ctx.fill();
      const fill = Math.max(0, Math.min(1, hud.progress));
      if (fill > 0) {
        ctx.save();
        roundRect(ctx, gx, gy, gw, gh, 9);
        ctx.clip();
        ctx.fillStyle = hud.zuma ? `hsl(${(frame * 6) % 360},90%,60%)` : '#f0b429';
        if (hud.zuma) ctx.globalAlpha = 0.55 + 0.45 * Math.sin(frame / 4); // D-16: same pulse as the pack gauge
        ctx.fillRect(gx, gy, gw * fill, gh);
        ctx.restore();
      }
      ctx.strokeStyle = '#d9b86a';
      roundRect(ctx, gx, gy, gw, gh, 9);
      ctx.stroke();
      ctx.fillStyle = '#fff';
      ctx.font = font(11);
      ctx.textAlign = 'center';
      ctx.fillText(hud.zuma ? 'ZUMA !' : 'ZUMA', gx + gw / 2, gy + gh / 2 + 1);
    }
    ctx.restore();

    if (hud.message && this.assets?.fonts?.title) {
      // Original fonts (D-11): NativeAlienExtended18 title, Cancun12 cream sub-line.
      const { title, text } = this.assets.fonts;
      ctx.save();
      title.draw(ctx, hud.message, WIDTH / 2, 230, { align: 'center' });
      if (hud.subMessage) {
        if (text) text.draw(ctx, hud.subMessage, WIDTH / 2, 262, { align: 'center', tint: '#fcf4d0' });
        else {
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
          ctx.lineWidth = 5;
          ctx.strokeStyle = 'rgba(0,0,0,0.75)';
          ctx.strokeText(hud.subMessage, WIDTH / 2, HEIGHT / 2 + 30);
          ctx.fillStyle = '#fff';
          ctx.fillText(hud.subMessage, WIDTH / 2, HEIGHT / 2 + 30);
        }
      }
      ctx.restore();
    } else if (hud.message) {
      ctx.save();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.font = 'bold 44px "Trebuchet MS", Verdana, sans-serif';
      ctx.lineWidth = 8;
      ctx.strokeStyle = 'rgba(0,0,0,0.75)';
      ctx.strokeText(hud.message, WIDTH / 2, HEIGHT / 2 - 10);
      ctx.fillStyle = '#ffe28a';
      ctx.fillText(hud.message, WIDTH / 2, HEIGHT / 2 - 10);
      if (hud.subMessage) {
        ctx.font = 'bold 20px "Trebuchet MS", Verdana, sans-serif';
        ctx.lineWidth = 5;
        ctx.strokeText(hud.subMessage, WIDTH / 2, HEIGHT / 2 + 30);
        ctx.fillStyle = '#fff';
        ctx.fillText(hud.subMessage, WIDTH / 2, HEIGHT / 2 + 30);
      }
      ctx.restore();
    }
  }
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function shade(hex: string, factor: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = Math.round(((n >> 16) & 255) * factor);
  const g = Math.round(((n >> 8) & 255) * factor);
  const b = Math.round((n & 255) * factor);
  return `rgb(${r},${g},${b})`;
}

/**
 * Client coordinates → logical 640 × 480 point, clamped to the stage (D-26: the aim follows the pointer over the
 * whole window, the page frame included). A degenerate rectangle or non-finite input gives the centre.
 */
export function stagePoint(clientX: number, clientY: number, rect: { left: number; top: number; width: number; height: number }): Point {
  const ok = [clientX, clientY, rect.left, rect.top, rect.width, rect.height].every(Number.isFinite) && rect.width > 0 && rect.height > 0;
  if (!ok) return { x: WIDTH / 2, y: HEIGHT / 2 };
  const x = ((clientX - rect.left) * WIDTH) / rect.width;
  const y = ((clientY - rect.top) * HEIGHT) / rect.height;
  return { x: Math.max(0, Math.min(WIDTH, x)), y: Math.max(0, Math.min(HEIGHT, y)) };
}

/**
 * CSS pixels per logical pixel (D-25): the window is filled in 4:3, fit = min(w / 640, h / 480). In « Pixels nets »
 * the scale is rounded down to whole device pixels — max(1, ⌊fit × dpr⌋) / dpr: never less than one device pixel
 * per logical pixel. Non-finite sizes → 1; a non-finite or non-positive dpr counts as 1.
 */
export function fitScale(innerWidth: number, innerHeight: number, dpr: number, pixelated: boolean): number {
  const fit = Math.min(innerWidth / WIDTH, innerHeight / HEIGHT);
  if (!Number.isFinite(fit) || fit <= 0) return 1;
  if (!pixelated) return fit;
  const d = Number.isFinite(dpr) && dpr > 0 ? dpr : 1;
  return Math.max(1, Math.floor(fit * d)) / d;
}

/** Pit cover frame for a threat level 0..1: 0 → closed lid (frame 0), 1 → last frame (open). */
export function pitCoverFrame(threat: number, frames: number): number {
  const t = Number.isFinite(threat) ? Math.max(0, Math.min(1, threat)) : 0;
  return Math.min(frames - 1, Math.max(0, Math.floor(t * (frames - 1))));
}

export function ballPosition(ball: Ball, track: Track): Point {
  return track.pointAt(ball.s);
}
