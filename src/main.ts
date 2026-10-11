/** Browser entry point: game flow, input, HUD/STATS panels and PWA wiring. */
import { CANDIDATE, ENGINE_VERSION, SeededRandom, Track, ZumaEngine, defaultParTime, type EngineConfig, type GameEvent, type Point } from './core.js';
import { EXPLOSION_RGB, ballCss, cueAllowed, makeColorBurst, makeSparks, soundCues, type ColorBurst, type SoundCue } from './feedback.js';
import { LEVELS, levelFor, type LevelDef } from './levels.js';
import { AudioManager, loopLevels, warningLevel } from './audio.js';
import { OriginalPack, tintSheet, upscaleSheet, type Bitmap, type PackGraphics, type PackSettings } from './original.js';
import { loadBitmapFont, type BitmapFont } from './bitmapfont.js';
import { upscaleBitmap } from './upscale.js';
import { applyUpdate, fitArea, formatSize, installGuidance, needsRotation, offlineStatus, readInstallEnv, registerServiceWorker, type InstallGuidance, type Insets } from './pwa.js';
import { BONUS_FAST_STEP, STATS_ORDER, TIP_KEYS, bestTime, bestTimeKey, bonusCountStep, bonusPopRate, composeStatsDialog, loadStatsKit, statsValues, upscaleStatsKit, type ButtonState, type StatsInput, type StatsKit, type StatsValues } from './statsdialog.js';
import { FROG_FRONT, HD_MIN_SCALE, HUD_HEIGHT, LONG_PRESS_IDLE, LONG_PRESS_MS, Renderer, WIDTH, HEIGHT, fitScale, frogHit, longPress, stagePoint, type FloatingText, type LongPressInput, type LongPressState, type Fx, type HudState, type LevelView, type RenderAssets } from './render.js';
import { composeMenuDialog, hitMenu, loadMenuKit, menuWidgets, sliderValue, upscaleMenuKit, type MenuKit, type MenuOptions, type MenuState, type MenuWidgetId } from './menudialog.js';
import { HIGHSCORE_KEY, PROFILE_KEY, SAVE_KEY, initialApp, parseProfile, parseSave, parseScores, readJson, reduceApp, sanitizeName, writeJson, type AppEffect, type AppEvent, type AppScreen, type AppState, type RunState, type StorageLike } from './progress.js';
import { ADV, advArrivalMaj, advButtonAt, advDoorOpaque, advDoorSizes, advShakeStep, doorAt, drawAdventure, drawEnding, drawGodDialog, endingWidgets, godDialogWidgets, godPages, loadAdventureKit, revealProgress, revealTemple, upscaleAdventureKit, type AdvButtonId, type AdvTempleId, type AdventureKit, type AdventureView } from './adventure.js';
import { MM, continueDialogWidgets, drawContinueDialog, drawNameDialog, drawWelcome, loadWelcomeKit, mmHoverSequence, mmUfo, nameDialogWidgets, upscaleWelcomeKit, welcomeHit, welcomeLineWidth, type EyeMode, type MmStone, type MmStoneId, type PromptView, type UfoState, type WelcomeKit, type WelcomeView } from './welcome.js';

declare const __BUILD__: string;
/** `beforeinstallprompt` (Chromium, Edge, Android): kept to show « Installer Zuma » (D-38 §1). */
interface InstallPromptEvent extends Event { prompt(): Promise<unknown>; userChoice?: Promise<{ outcome: string }> }
/** localStorage key set when the player closes the install card on the start screen. */
const INSTALL_HIDDEN_KEY = 'zuma.install.hidden';
const BUILD = typeof __BUILD__ === 'string' ? __BUILD__ : 'dev';
/** D-12: the welcome screen waits at most this long (ms) for the platform first name before showing the name prompt. */
const PLATFORM_NAME_TIMEOUT = 1500;
/** D-12: the identity request itself is abandoned after this long; an answer between the two arrives as `profile-detected`. */
const PLATFORM_NAME_ABORT = 8000;

interface ResolvedLevel {
  /** Stable identifier for per-level persistence (pack graphics id, or `proc-N`). */
  id: string;
  label: string;
  name: string;
  tracks: Track[];
  frog: Point;
  config: Partial<EngineConfig>;
  graphics: PackGraphics | null;
  parTime: number | null;
}

interface Progress { stage: number; level: number }

/** Presentation state of the main menu: hover / press / keyboard focus, eyes, UFO and the hover-order counter. */
interface WelcomeUi {
  hover: MmStoneId | null;
  /** Enabled stone or 'welcome-line' pressed by the pointer (activation when released over it). */
  pressed: string | null;
  focus: MmStoneId | null;
  eyes: EyeMode;
  target: Point | null;
  ufo: UfoState;
  seq: { expect: number; laps: number };
  /** Last stone entered for the hover sequence (moving across the empty space between two stones is not a new entry). */
  lastSeqStone: MmStoneId | null;
}

/**
 * Presentation state of the adventure screen: hovered door (0x440d50), hovered / pressed button, and the arrival after
 * a finished stage (0x43e3f0: reveal of the opening temple, doors locked for advArrivalMaj, temple 4 shaking).
 */
interface AdventureUi {
  hover: number | null;
  button: { hover: AdvButtonId | null; pressed: AdvButtonId | null };
  arrival: { temple: AdvTempleId | null; lock: number } | null;
  shake: number[];
  /** Last maj whose shake step was applied, and whether the earthquake sounded. */
  shakeAt: number;
  quake: boolean;
  rng: SeededRandom;
}

function freshWelcomeUi(): WelcomeUi {
  return { hover: null, pressed: null, focus: null, eyes: 'rest', target: null, ufo: { phase: 'idle', t0: 0 }, seq: { expect: 0, laps: 0 }, lastSeqStone: null };
}

const TIPS = [
  'Les balles de même couleur s\'attirent et créent des réactions en chaîne.',
  'Tirez à travers un trou dans la chaîne pour un bonus saut.',
  'Clic droit pour échanger la balle courante et la suivante.',
  'La balle RALENTIR divise la vitesse de la chaîne par quatre.',
  'La balle RETOUR fait reculer toutes les portions de chaîne.',
  'La balle VISÉE trace votre tir et accélère le projectile.',
  'Détruisez une balle BOMBE pour souffler ses voisines.',
  'Ne laissez pas les balles atteindre le crâne !',
];

class Game {
  private readonly canvas: HTMLCanvasElement;
  private readonly renderer: Renderer;
  private readonly audio = new AudioManager();
  private pack: OriginalPack | null = null;
  /** Original strings (`strings.json`) for the in-game messages (GET_READY / GO); null without the pack. */
  private strings: Record<string, string> | null = null;
  /** 1 × assets of the pack and their 2 × EPX copy, built once on demand (D-19); the renderer points at one of them. */
  private baseAssets: RenderAssets | null = null;
  private hdAssets: RenderAssets | null = null;
  /** Native STATS (D-01): original pieces + fonts + strings; null → vector STATS panel. `statsKit` = the 1 × or 2 × kit in use. */
  private statsKitBase: StatsKit | null = null;
  private statsKitHd: StatsKit | null = null;
  private statsKit: StatsKit | null = null;
  /** The composed dialog, shown as the first child of `.zuma-stats` while the STATS are open (D-19). */
  private statsCanvas: HTMLCanvasElement | null = null;
  private statsRevealed = 0;
  private statsButton: ButtonState = 'normal';
  private statsTip = '';
  private statsValues: StatsValues | null = null;
  private statsTimers: number[] = [];
  /** Count-up timers (one armed at a time), purged with `statsTimers`. */
  private countTimers: number[] = [];
  /** In-game MENU kit (D-24): the STATS kit + slider / check-box pictures, 1 × or 2 × like the STATS; null → vector dialog. */
  private menuKitBase: MenuKit | null = null;
  private menuKitHd: MenuKit | null = null;
  private menuKit: MenuKit | null = null;
  /** The composed MENU, child canvas of #menu while the menu is open. */
  private menuCanvas: HTMLCanvasElement | null = null;
  private menuState: MenuState = { view: 'menu', music: 0, sfx: 1, fullscreen: false, pixelated: false, hover: null, pressed: null, focus: 'back', tips: [], badge: '' };
  /** Slider dragged with the pointer captured (only `sfx` is active). */
  private menuDrag: MenuWidgetId | null = null;
  /** Kept `beforeinstallprompt` (one use), the install card state and the callback that ends its wait (R2.0.20, D-38). */
  private installPrompt: InstallPromptEvent | null = null;
  private installOpen = false;
  private installDone: (() => void) | null = null;
  /** « Tournez votre appareil » shown (phone in portrait, D-38 §5) and whether the pause is its own. */
  private rotateOpen = false;
  private pausedByRotation = false;
  /** Build badge (shown in the help view of the menu). */
  private badge = `R${ENGINE_VERSION} · ${BUILD}`;
  private engine: ZumaEngine | null = null;
  private level: ResolvedLevel | null = null;
  private progress: Progress = { stage: 0, level: 0 };
  private levelIndex = 0;
  private lives = CANDIDATE.lives;
  /** Last start (performance.now ms) of each guarded cue key (cueAllowed). */
  private readonly cueLast = new Map<string, number>();
  private carriedScore = 0;
  private paused = false;
  private statsOpen = false;
  private menuOpen = false;
  private frame = 0;
  private accumulator = 0;
  private lastTime = 0;
  private fx: Fx = { bursts: [], floats: [], tongueStart: -Infinity, threat: 0 };
  private message: { text: string; sub: string | null; until: number } | null = null;
  private endAt: number | null = null;
  /** The game over of the current level was submitted (T-06-14: once per level). */
  private gameoverSent = false;
  /** Engine tick until which the reserve frogs blink after an extra life (150 maj × 0.6 = 90 ticks, board+0x178). */
  private livesBlinkUntil = 0;
  private seed = Date.now() >>> 0;
  private pointer: Point = { x: WIDTH / 2, y: HEIGHT };
  /** Long press on the HUD MENU button (quick 261011): state, pointer type, stage point of the press, timer. */
  private menuPress: LongPressState = LONG_PRESS_IDLE;
  private menuPressType = '';
  private menuPressPoint: Point = { x: 0, y: 0 };
  private menuPressTimer = 0;
  private loading = true;
  /** « Pixels nets »: integer CSS scale with image-rendering: pixelated (persisted as zuma.pixelated). */
  private pixelated = false;
  /** Ball id → arc position at the previous frame, to measure the chain speed for the rolling loop. */
  private lastPositions = new Map<number, number>();
  /**
   * R2.0.21 (D-01): application state of plan 06-02 (screen, prompt, profile, scores, saved run). Replaced at boot by
   * initialApp; every transition goes through reduceApp and its effects are performed by `applyEffect`.
   */
  private app: AppState = initialApp({ profile: null, save: null, scores: [], sizes: [], startLives: CANDIDATE.lives, review: null }).state;
  /** performance.now() when the current screen was entered: the welcome counter counts 10 ms maj from it. */
  private screenT0 = 0;
  /** Browser storage (null when unavailable); only read / written through readJson / writeJson (T-06-06). */
  private readonly storage: StorageLike | null = openStorage();
  /** Main-menu kit (1 × and its 2 × EPX copy, like the STATS); null → vector welcome. */
  private welcomeKitBase: WelcomeKit | null = null;
  private welcomeKitHd: WelcomeKit | null = null;
  private welcomeKit: WelcomeKit | null = null;
  private welcome: WelcomeUi = freshWelcomeUi();
  /** Adventure screen kit (1 × and its 2 × EPX copy, like the welcome kit); null → vector adventure screen. */
  private adventureKitBase: AdventureKit | null = null;
  private adventureKitHd: AdventureKit | null = null;
  private adventureKit: AdventureKit | null = null;
  private adventure: AdventureUi = this.freshAdventureUi();
  /** God dialogue (temple screen): current page and the reply button state; ending screen: its OK button state. */
  private god = { page: 0, hover: false, pressed: false };
  private endingUi = { hover: false, pressed: false };
  /** Rename dialog opened from the welcome line (the machine's prompt stays null). */
  private renaming = false;
  /** Dialog shown last (to reset its hover / focus when another opens) and its widget state; `text` = sanitised field. */
  private shownPrompt: PromptView['kind'] | null = null;
  private promptUi: { hover: string | null; pressed: string | null; focus: string | null; text: string } = { hover: null, pressed: null, focus: null, text: '' };
  /** Invisible text field over the name box: brings up the mobile keyboard; its value is only read through sanitizeName. */
  private nameInput: HTMLInputElement | null = null;

  constructor() {
    const canvas = document.getElementById('game');
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error('missing #game canvas');
    this.canvas = canvas;
    this.renderer = new Renderer(canvas, null);
    try { this.pixelated = localStorage.getItem('zuma.pixelated') === '1'; } catch { /* storage unavailable */ }
    // « Sons » volume of the menu (T-05-31): bounded 0..1 by setVolume, absent → 1.
    try {
      const raw = localStorage.getItem('zuma.sfx');
      if (raw !== null) this.audio.setVolume(Number(raw));
    } catch { /* storage unavailable */ }
    this.bindInput();
    this.bindPanels();
    this.bindMenu();
    this.bindPrompt();
    this.bindInstall();
    this.bindScaling();
    this.applyScaling();
    this.checkRotation();
  }

  // ---------------------------------------------------------------- scaling

  /**
   * D-25: the stage fills the window in 4:3 (`--k` = fitScale CSS px per logical px, both modes). « Pixels nets »
   * keeps the 640 × 480 store enlarged without smoothing by a scale that lands on whole device pixels; otherwise
   * the backing store follows the displayed size × devicePixelRatio.
   */
  private applyScaling(): void {
    const stage = this.canvas.parentElement;
    const dpr = window.devicePixelRatio || 1;
    // R2.0.20 (D-38 §3): the 4:3 stage fits inside the safe areas (notch, home indicator) the body pads.
    const area = fitArea(window.innerWidth, window.innerHeight, safeInsets());
    const k = fitScale(area.w, area.h, dpr, this.pixelated);
    stage?.style.setProperty('--k', String(k));
    stage?.classList.add('sized');
    stage?.classList.toggle('pixelated', this.pixelated);
    this.renderer.resize(WIDTH * k, dpr, this.pixelated);
    this.applyHd();
    // The open dialogs follow the new scale and assets (D-19).
    if (this.statsOpen) this.renderStats();
    if (this.menuOpen) this.renderMenu();
  }

  /**
   * D-19: from HD_MIN_SCALE backing-store pixels per logical pixel — and never in « Pixels nets »,
   * whose integer CSS scale keeps the 1 × store — the renderer and the STATS use the 2 × EPX assets,
   * built once and kept; below it, the 1 × pictures. Nothing happens without the pack.
   */
  private applyHd(): void {
    const hd = !this.pixelated && this.renderer.scale >= HD_MIN_SCALE;
    const base = this.baseAssets;
    if (base) this.renderer.assets = hd ? (this.hdAssets ??= buildHdAssets(base)) : base;
    const kit = this.statsKitBase;
    this.statsKit = kit && hd ? (this.statsKitHd ??= upscaleStatsKit(kit)) : kit;
    const menu = this.menuKitBase;
    const statsHd = this.statsKitHd;
    this.menuKit = menu && hd && statsHd ? (this.menuKitHd ??= upscaleMenuKit(menu, statsHd)) : menu;
    const welcome = this.welcomeKitBase;
    this.welcomeKit = welcome && hd ? (this.welcomeKitHd ??= upscaleWelcomeKit(welcome, this.statsKitHd)) : welcome;
    const adventure = this.adventureKitBase;
    this.adventureKit = adventure && hd ? (this.adventureKitHd ??= upscaleAdventureKit(adventure, this.statsKitHd)) : adventure;
  }

  private bindScaling(): void {
    window.addEventListener('resize', () => { this.applyScaling(); this.checkRotation(); });
    window.addEventListener('orientationchange', () => { this.applyScaling(); this.checkRotation(); });
    const stage = this.canvas.parentElement;
    if (typeof ResizeObserver !== 'undefined' && stage) new ResizeObserver(() => this.applyScaling()).observe(stage);
    // devicePixelRatio has no change event: re-arm a one-shot media query at each new ratio.
    const watchDpr = (): void => {
      if (typeof matchMedia !== 'function') return;
      matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', () => { this.applyScaling(); watchDpr(); }, { once: true });
    };
    watchDpr();
  }

  /**
   * R2.0.20 (D-38 §5): a phone in portrait shows « Tournez votre appareil » and pauses a running game; back in
   * landscape, only a pause the overlay set itself is lifted. A tablet in portrait keeps the 4:3 stage with bands.
   */
  private checkRotation(): void {
    let coarse = false;
    try { coarse = typeof matchMedia === 'function' && matchMedia('(pointer: coarse)').matches; } catch { /* no media queries */ }
    const shortSide = Math.min(screen?.width ?? Number.NaN, screen?.height ?? Number.NaN);
    const show = needsRotation({ width: window.innerWidth, height: window.innerHeight, coarse, shortSide });
    const changed = show !== this.rotateOpen;
    this.rotateOpen = show;
    document.getElementById('rotate')?.classList.toggle('open', show);
    if (show) {
      if (!this.paused && this.engine) {
        this.togglePause();
        this.pausedByRotation = this.paused;
      }
    } else if (changed && this.pausedByRotation) {
      this.pausedByRotation = false;
      if (this.paused) this.togglePause();
    }
  }

  private togglePixels(): void {
    this.pixelated = !this.pixelated;
    try { localStorage.setItem('zuma.pixelated', this.pixelated ? '1' : '0'); } catch { /* storage unavailable */ }
    this.menuState.pixelated = this.pixelated;
    this.applyScaling();
  }

  async start(): Promise<void> {
    this.pack = await OriginalPack.load();
    // D-12: the platform first name is asked as soon as the pack is known (only the private host, which always ships
    // the pack, has the endpoint); the boot waits for it at most PLATFORM_NAME_TIMEOUT.
    const deadline = performance.now() + PLATFORM_NAME_TIMEOUT;
    const platformName = this.pack ? fetchPlatformName() : Promise.resolve(null);
    await this.audio.discover();
    if (this.pack) {
      this.strings = await this.pack.strings();
      this.baseAssets = await this.loadAssets(this.pack);
      this.applyHd();
      // R2.0.21: the main menu and its dialogs are the first screen, so their pieces are awaited; the in-game menu
      // kit still loads in the background (a menu opened before it is ready uses its vector dialog).
      const pack = this.pack;
      const kit = await loadStatsKit(pack);
      this.statsKitBase = kit;
      // R2.0.21 (D-02): the adventure screen kit loads with the welcome kit (after the STATS kit: its dialog pieces).
      const [welcomeKit, adventureKit] = await Promise.all([loadWelcomeKit(pack, kit), loadAdventureKit(pack, kit)]);
      this.welcomeKitBase = welcomeKit;
      this.adventureKitBase = adventureKit;
      this.applyHd();
      if (kit) {
        void loadMenuKit(pack, kit).then(menu => {
          this.menuKitBase = menu;
          this.applyHd();
          if (this.menuOpen) this.renderMenu();
        });
      }
    }
    this.badge = `R${ENGINE_VERSION} · ${BUILD}${this.pack ? ' · ressources originales' : ' · rendu vectoriel'}`;
    // R2.0.20 (D-38 §2): storage kept for offline play, its size shown in the help view.
    void offlineStatus().then(status => {
      if (!status) return;
      this.badge += ` · hors ligne : ${formatSize(status.bytes)}`;
      if (this.menuOpen) this.renderMenu();
    });
    // R2.0.20 (D-38 §1): install guide on the start screen unless installed, without instruction or closed for good.
    const guidance = this.installGuidance();
    let hidden = false;
    try { hidden = localStorage.getItem(INSTALL_HIDDEN_KEY) === '1'; } catch { /* storage unavailable */ }
    if (guidance !== 'installed' && guidance !== 'none' && !hidden) await this.showInstallCard('start');
    const early = await Promise.race([platformName, bootDelay(deadline - performance.now()).then(() => undefined)]);
    this.loading = false;
    // R2.0.21 (D-01): the app opens on the main menu (or directly on the ?level= review level).
    this.boot(early ?? null);
    if (early === undefined) void platformName.then(name => { if (name) this.dispatch({ kind: 'profile-detected', name }); });
    document.getElementById('boot')?.classList.add('hidden');
    requestAnimationFrame(t => this.loop(t));
  }

  /**
   * Builds the application state from the storage (defensive parsers of plan 06-02) and the pack's stage sizes, then
   * performs the boot effects: the welcome screen with the one-time name prompt when there is no profile, or the
   * review level of `?level=` (no write effect).
   */
  private boot(platformName: string | null): void {
    const sizes = this.pack?.hasStages ? this.pack.data.stages.map(s => s.levels.length) : [];
    const { state, effects } = initialApp({
      profile: parseProfile(readJson(this.storage, PROFILE_KEY)),
      save: parseSave(readJson(this.storage, SAVE_KEY), sizes),
      scores: parseScores(readJson(this.storage, HIGHSCORE_KEY)),
      sizes,
      startLives: CANDIDATE.lives,
      review: this.requestedRun(),
      platformName,
    });
    this.app = state;
    this.enterScreen(state.screen);
    for (const effect of effects) this.applyEffect(effect);
    this.syncPrompt();
  }

  /** Read-only view for review (`?debug=1`, T-05-10): the running engine and the resolved level. */
  debugState(): { engine: ZumaEngine | null; level: ResolvedLevel | null; app: AppState } {
    return { engine: this.engine, level: this.level, app: this.app };
  }

  // ----------------------------------------------------------------- assets

  private async loadAssets(pack: OriginalPack): Promise<RenderAssets> {
    const [balls, ballShadow, bomb, slow, backwards, accuracy, hole, pitcover, grey, frogPad, tongue, eyeblink, menubar, gauge, gaugeGreen, lives, menuButton, coin, sparkle, titleFont, textFont, floatFont] = await Promise.all([
      pack.ballSheets(),
      pack.shadow('_ballshadow'),
      pack.powerIcons('bomb'),
      pack.powerIcons('slow'),
      pack.powerIcons('backwards'),
      pack.powerIcons('accuracy'),
      pack.masked('hole'),
      pack.sheet('pitcover', 88, '_pitcover'),
      pack.sheet('grayplosion', 86),
      pack.masked('smallfrogonpad'),
      pack.masked('tongue'),
      pack.keyed('eyeblink'),
      pack.masked('menubar'),
      pack.masked('gauge'),
      pack.masked('gaugegreen', '_gauge'),
      pack.masked('toadlives'),
      pack.masked('menubutton'),
      pack.sheet('coin', 36, '_coin'),
      pack.image('sparkle'),
      loadBitmapFont(pack, 'nativealienextended18'),
      loadBitmapFont(pack, 'cancun12'),
      loadBitmapFont(pack, 'cancunfloat14'),
    ]);
    const explosions = grey ? EXPLOSION_RGB.map(rgb => tintSheet(grey, rgb)) : EXPLOSION_RGB.map(() => null);
    const fonts = titleFont || textFont || floatFont ? { title: titleFont, text: textFont, float: floatFont } : null;
    return { balls, ballShadow, powers: { bomb, slow, backwards, accuracy }, hole, pitcover, explosions, frogPad, tongue, eyeblink, menubar, gauge, gaugeGreen, lives, menuButton, coin, sparkle, fonts, pixelScale: 1 };
  }

  // ----------------------------------------------------------------- levels

  private async resolveLevel(): Promise<ResolvedLevel> {
    if (this.pack?.hasStages) {
      const stages = this.pack.data.stages;
      const stage = stages[Math.min(this.progress.stage, stages.length - 1)];
      const idx = Math.min(this.progress.level, stage.levels.length - 1);
      const graphics = this.pack.graphics(stage.levels[idx]);
      const settings = this.pack.settings(stage.settings[idx]);
      if (graphics && graphics.curveFiles.length > 0) {
        const tracks = await this.pack.tracks(graphics);
        const config = configFromSettings(settings, this.progress.stage, tracks.length);
        return {
          id: graphics.id,
          label: `${this.progress.stage + 1}-${idx + 1}`,
          name: graphics.name,
          tracks,
          frog: graphics.frog,
          config,
          graphics,
          parTime: config.parTime ?? null,
        };
      }
    }
    const def: LevelDef = levelFor(this.levelIndex);
    return {
      id: `proc-${this.levelIndex + 1}`,
      label: `${this.levelIndex + 1}`,
      name: def.name,
      tracks: [new Track(def.track)],
      frog: def.frog,
      config: { colors: def.colors, startFraction: def.startFraction, total: def.total, target: def.target, speed: def.speed },
      graphics: null,
      parTime: null,
    };
  }

  /**
   * `?level=S-L` (e.g. `1-3`) opens a pack level directly for review: a run at its start with the default lives, or
   * null (the welcome screen) without a pack, when malformed or out of the pack's stage/level bounds (T-04-10).
   */
  private requestedRun(): RunState | null {
    if (!this.pack?.hasStages) return null;
    let raw: string | null = null;
    try { raw = new URLSearchParams(location.search).get('level'); } catch { return null; }
    if (!raw || !/^\d+-\d+$/.test(raw)) return null;
    const [stage, level] = raw.split('-').map(Number);
    const stages = this.pack.data.stages;
    if (stage < 1 || stage > stages.length) return null;
    if (level < 1 || level > stages[stage - 1].levels.length) return null;
    return { stage: stage - 1, level: level - 1, score: 0, lives: CANDIDATE.lives };
  }

  /** `start-level` effect: the run's position, lives and score at the start of its level, then the level itself. */
  private async beginRun(run: RunState): Promise<void> {
    this.progress = { stage: run.stage, level: run.level };
    this.levelIndex = run.level;
    this.lives = run.lives;
    this.carriedScore = run.score;
    await this.startLevel();
  }

  private async startLevel(): Promise<void> {
    this.audio.stopLoops();
    this.lastPositions.clear();
    this.level = await this.resolveLevel();
    this.seed = (this.seed * 1664525 + 1013904223) >>> 0;
    // With the original sprite the projectile leaves from the measured mouth offset (ROADMAP SC2).
    const engine = new ZumaEngine(this.level.tracks, this.level.frog, {
      ...this.level.config,
      lives: this.lives,
      muzzleOffset: this.renderer.assets?.frogPad ? FROG_FRONT : CANDIDATE.muzzleOffset,
    }, this.seed);
    engine.score = this.carriedScore;
    // Coin spots of the pack level (D-07); an empty list keeps the engine free of extra RNG draws.
    engine.setTreasure(this.level.graphics?.treasure ?? []);
    this.engine = engine;
    this.livesBlinkUntil = 0;
    this.fx = { bursts: [], floats: [], tongueStart: -Infinity, threat: 0 };
    this.endAt = null;
    this.gameoverSent = false;
    this.paused = false;
    // A level starting under « Tournez votre appareil » stays paused until the device is turned (D-38 §5).
    this.pausedByRotation = this.rotateOpen;
    if (this.rotateOpen) this.paused = true;
    const art = this.pack && this.level.graphics ? await this.pack.levelArt(this.level.graphics) : null;
    const view: LevelView = { name: this.level.name, tracks: this.level.tracks, frog: this.level.frog, art, skullRotation: this.level.graphics?.skullRotation ?? null };
    this.renderer.setLevel(view);
    // « Attention » (D-11) stays up for the whole fast feed; the `go` event replaces it with « PARTEZ ».
    this.showMessage(this.strings?.GET_READY ?? 'Attention', `${this.level.name} — Niveau ${this.level.label}`, 100000);
    this.audio.play({ key: 'gamestart', gain: 0.7, rate: 1 });
  }

  // ------------------------------------------------------------------- loop

  private loop(time: number): void {
    requestAnimationFrame(t => this.loop(t));
    // R2.0.21 (D-01, D-02, D-03): off the level screen the main menu, the adventure screen, the god dialogue over the
    // frozen board or the ending is drawn; no engine steps.
    if (this.app.screen !== 'level') {
      this.lastTime = time;
      if (this.app.screen === 'adventure') this.drawAdventureFrame(time);
      else if (this.app.screen === 'temple') this.drawTempleFrame();
      else if (this.app.screen === 'ending') this.drawEndingFrame();
      else this.drawWelcomeFrame(time);
      return;
    }
    const engine = this.engine;
    if (!engine || !this.level) return;
    const dt = this.lastTime ? Math.min(0.1, (time - this.lastTime) / 1000) : 0;
    this.lastTime = time;
    const tickLength = 1 / engine.config.tickHz;
    if (!this.paused && !this.statsOpen && !this.menuOpen) {
      this.accumulator += dt;
      let steps = 0;
      while (this.accumulator >= tickLength && steps < 6) {
        engine.step();
        this.handleEvents(engine.drainEvents(), engine);
        this.accumulator -= tickLength;
        steps++;
      }
      this.checkOutcome(engine);
      if (steps > 0) this.updateLoops(engine, steps);
    } else {
      this.accumulator = 0;
      this.audio.setLoop('rolling', 0);
      this.audio.pulse('warning', 0);
    }
    if (this.menuPress.phase === 'pending') this.menuPressStep({ kind: 'tick', t: performance.now() });
    this.frame++;
    this.fx.bursts = this.fx.bursts.filter(b => engine.tick - b.start < 40);
    this.fx.floats = this.fx.floats.filter(f => engine.tick - f.start < 70);
    this.renderer.draw(engine, this.fx, this.hud(engine), this.frame);
  }

  /**
   * Rolling loop on whenever the fastest ball moved more than ROLLING_MIN_SPEED since the
   * previous frame (D-17), warning beat from the head ball's distance to the skull (D-08;
   * the original interval since 05-06: 4.1 s at 600 px down to 0.6 s). The pit cover opens
   * over the same 600 px (`fx.threat`). Recoil adds no sound (D-09).
   */
  private updateLoops(engine: ZumaEngine, steps: number): void {
    const seconds = steps / engine.config.tickHz;
    const positions = new Map<number, number>();
    let moved = 0;
    let headDistance: number | null = null;
    for (const chain of engine.chains) {
      let head = -Infinity;
      for (const ball of engine.alive(chain)) {
        positions.set(ball.id, ball.s);
        const last = this.lastPositions.get(ball.id);
        if (last !== undefined) moved = Math.max(moved, Math.abs(ball.s - last));
        head = Math.max(head, ball.s);
      }
      if (head > -Infinity) {
        const d = chain.track.length - head;
        headDistance = headDistance === null ? d : Math.min(headDistance, d);
      }
    }
    this.lastPositions = positions;
    const playing = engine.state === 'playing';
    const lv = loopLevels({ speed: moved / seconds, playing });
    this.audio.setLoop('rolling', lv.rolling);
    // The lid follows the chain's proximity even while it drains into the pit; the beat only plays live (D-08).
    this.fx.threat = warningLevel(headDistance, true);
    this.audio.pulse('warning', playing ? this.fx.threat : 0);
  }

  private hud(engine: ZumaEngine): HudState {
    const msg = this.message && this.frame < this.message.until ? this.message : null;
    return {
      levelLabel: this.level?.label ?? '',
      lives: Math.max(0, engine.lives),
      // plateau+0xf4 = 2 from the loss (0x428391): the frog in play is counted with the reserve while the chain drains.
      dying: engine.state === 'draining' || engine.state === 'lost' || engine.state === 'gameover',
      livesBlink: Math.max(0, this.livesBlinkUntil - engine.tick),
      score: engine.score,
      progress: engine.zumaMode ? 1 : Math.min(1, engine.levelScore / engine.config.target),
      zuma: engine.zumaMode,
      message: this.paused && !msg ? 'PAUSE' : msg?.text ?? null,
      subMessage: msg?.sub ?? null,
      menuPressed: this.menuPress.phase === 'pending',
    };
  }

  private showMessage(text: string, sub: string | null, frames: number): void {
    this.message = { text, sub, until: this.frame + frames };
  }

  /** Plays an event cue unless its anti-burst guard holds it (merge: once per 250 ms, 0x401c70). */
  private playCue(cue: SoundCue): void {
    if (!cueAllowed(this.cueLast, cue.key, performance.now())) return;
    this.audio.play(cue);
  }

  private handleEvents(events: GameEvent[], engine: ZumaEngine): void {
    for (const e of events) {
      for (const cue of soundCues(e)) this.playCue(cue);
      switch (e.kind) {
        case 'fire':
          this.fx.tongueStart = engine.tick;
          break;
        case 'destroy': {
          const ids = e.ids as number[];
          const chain = engine.chains[Number(e.chain) || 0];
          for (const id of ids) {
            const ball = chain.balls.find(b => b.id === id);
            if (!ball) continue;
            const p = chain.track.pointAt(ball.s);
            // D-23: the burst is drawn in the pass of its ball (0x40b4d0), under a cutout when the ball is.
            const burst: ColorBurst = makeColorBurst({ id: ball.id, x: p.x, y: p.y, color: ball.color }, engine.tick);
            burst.layer = chain.track.ballPriority(ball.s);
            this.fx.bursts.push(burst);
          }
          // 0x420b80 (spike 02): « +total » in the colour of the ball (ballCss, hypothesis: table 0x587408
          // not extracted), then « COMBO x{combo + 1} » for a chain reaction; the texts stack upwards
          // from the ball (0x412b10 not read) — gap and chain texts follow at −32 / −48.
          const depth = Number(e.depth);
          const x = Number(e.x);
          const y = Number(e.y);
          this.float(`+${e.points}`, x, y, ballCss(Number(e.color)), engine.tick);
          if (depth > 1) this.float(`${this.strings?.COMBO ?? 'COMBO'} x${depth}`, x, y - 16, '#ffd166', engine.tick);
          break;
        }
        case 'gap': {
          // « BONUS SAUT / BONUS DOUBLE SAUT / BONUS TRIPLE SAUT » (GAP_BONUS strings, 0x420da8–0x420ec4), no amount: it is in the « +N ».
          const n = Number(e.count);
          const s = this.strings;
          const label = n >= 3 ? s?.TRIPLE_GAP_BONUS ?? 'BONUS TRIPLE SAUT' : n === 2 ? s?.DOUBLE_GAP_BONUS ?? 'BONUS DOUBLE SAUT' : s?.GAP_BONUS ?? 'BONUS SAUT';
          this.float(label, Number(e.x), Number(e.y) - 32, '#7ee8fa', engine.tick);
          break;
        }
        case 'streak':
          // « ENCHAÎNEMENT x{chain} » (CHAIN_BONUS, 0x420f12–0x420f5a) for the consecutive hits.
          this.float(`${this.strings?.CHAIN_BONUS ?? 'ENCHAÎNEMENT'} x${e.streak}`, Number(e.x), Number(e.y) - 48, '#ff9f68', engine.tick);
          break;
        case 'power-activate': {
          const names: Record<string, string> = { bomb: 'BOMBE', slow: 'Balle RALENTIR', backwards: 'Balle RETOUR', accuracy: 'Balle VISÉE' };
          this.float(names[String(e.power)] ?? String(e.power), Number(e.x), Number(e.y) - 24, '#c3f584', engine.tick);
          break;
        }
        case 'go':
          this.showMessage(this.strings?.GO ?? 'PARTEZ', null, 45);
          break;
        case 'coin':
          this.float(`+${e.points}`, Number(e.x), Number(e.y) - 20, '#ffd45a', engine.tick);
          break;
        case 'cleanup': {
          // End-of-level tally (§7, D-30): one event per marker and per step — a yellow « +100 » (0xffff00;
          // CancunFloat14 gold with the pack) and 5 sparkles on the marker of chain `e.chain`, in the pass of its
          // point; the seed mixes the chain so two markers at the same step differ. Pops: `cleanup-pop` cues.
          const chain = Math.max(0, Math.min(engine.chains.length - 1, Number(e.chain) || 0));
          const track = engine.chains[chain].track;
          this.float(`+${e.points}`, Number(e.x), Number(e.y) - 16, '#ffff00', engine.tick);
          const sparks = makeSparks(Number(e.x), Number(e.y), (Number(e.step) || 0) * 4 + chain, engine.tick);
          sparks.layer = track.ballPriority(Number(e.s) || 0);
          this.fx.bursts.push(sparks);
          break;
        }
        case 'zuma':
          // D-16: « ZUMA ! » banner (strings.json has no ZUMA key) for 120 ticks; the gauge pulses, chant4 plays.
          this.showMessage(this.strings?.ZUMA ?? 'ZUMA !', null, 120);
          break;
        case 'lost':
          this.showMessage('Perdu…', engine.lives > 0 ? 'La chaîne a atteint le crâne' : 'Partie terminée', 180);
          break;
        case 'extra-life':
          // No text (spike 03 Q3: the original only plays `extralife` three times); the reserve frogs blink 1.5 s
          // (board+0x178 = 150 maj at each life, 0x4173e8 → 90 ticks) and the HUD reads engine.lives at the next frame.
          this.livesBlinkUntil = engine.tick + 90;
          break;
        // `won`: no message — the time bonus is counted up inside the STATS dialog (D-15 → count-up, §8).
      }
    }
  }

  private float(text: string, x: number, y: number, color: string, tick: number): void {
    const f: FloatingText = { text, x: Math.max(60, Math.min(WIDTH - 60, x)), y: Math.max(HUD_HEIGHT + 20, y), start: tick, color };
    this.fx.floats.push(f);
  }

  private checkOutcome(engine: ZumaEngine): void {
    if (engine.state === 'playing' || engine.state === 'clearing' || engine.state === 'draining') return;
    // R2.0.21 (D-04): the last life lost enters the high-score table and clears the saved run at once (0x4283c4),
    // once per level; the game-over STATS follows and its OK leads to the adventure screen.
    if (engine.state === 'gameover' && !this.gameoverSent) {
      this.gameoverSent = true;
      this.dispatch({ kind: 'gameover', score: engine.score, date: localDate() });
    }
    // The STATS open at `won` (the engine already waited 50 updates after the last step, §7), 90 frames after a loss.
    if (this.endAt === null) this.endAt = this.frame + (engine.state === 'won' ? 0 : 90);
    if (this.frame < this.endAt) return;
    this.endAt = Infinity;
    this.openStats(engine.state === 'won' ? 'won' : engine.state === 'gameover' ? 'gameover' : 'lost');
  }

  // ------------------------------------------------------------ pause, sound

  private togglePause(): void {
    if (this.statsOpen || this.menuOpen) return;
    this.paused = !this.paused;
    if (this.paused) this.audio.stopLoops();
  }

  private toggleSound(): void {
    this.audio.enabled = !this.audio.enabled;
  }

  // ----------------------------------------------------------------- panels

  private bindPanels(): void {
    const on = (id: string, handler: () => void): void => {
      document.getElementById(id)?.addEventListener('click', () => { this.audio.unlock(); handler(); });
    };
    on('result-continue', () => {
      if (this.statsKit) this.audio.play({ key: 'button', gain: 1, rate: 1 });
      void this.closeStats();
    });
    // Painted OK states (D-05): the transparent control only reports hover / press.
    const ok = document.getElementById('result-continue');
    if (ok) {
      const set = (state: ButtonState) => (): void => {
        if (!this.statsKit || !this.statsOpen || this.statsButton === state) return;
        this.statsButton = state;
        this.renderStats();
      };
      ok.addEventListener('mouseenter', set('hover'));
      ok.addEventListener('mouseleave', set('normal'));
      ok.addEventListener('mousedown', set('pressed'));
      ok.addEventListener('mouseup', set('hover'));
      ok.addEventListener('touchstart', set('pressed'), { passive: true });
      ok.addEventListener('touchend', set('normal'), { passive: true });
    }
    // Fast count-up (D-21, deliberate deviation — the original has no acceleration, research 02 Q3): a press on
    // the dialog outside OK switches the running count-up to BONUS_FAST_STEP per step; OK settles the remainder.
    document.querySelector<HTMLElement>('#stats .zuma-stats')?.addEventListener('pointerdown', ev => {
      const onOk = ev.target instanceof Element && ev.target.closest('#result-continue') !== null;
      if (onOk || !this.statsOpen || !this.statsBonus || this.statsBonus.shown >= this.statsBonus.total) return;
      this.statsBonus.fast = true;
    }, { passive: true });
  }

  // ------------------------------------------------------------------ input

  /**
   * Inputs (D-26): the aim follows the pointer over the whole window (stagePoint, clamped to the stage) and a left
   * click shoots anywhere, the HUD band and the page frame included; right click swaps (hypothesis C1). The HUD
   * MENU / STATS buttons only answer a touch (without a keyboard the menu would be unreachable — deviation from
   * D-26 limited to touch). UAT 9 (quick 261011): a press held LONG_PRESS_MS on MENU opens the menu with any pointer
   * (longPress); released earlier, a mouse / pen press shoots on release (D-26) and a touch opens the menu. Keys: Space / Enter / Escape open and close the menu (the original pauses on Space, and
   * the menu pauses: converging), Tab opens the STATS, P pauses, M mutes. Open dialogs handle their own pointer.
   */
  private bindInput(): void {
    window.addEventListener('contextmenu', ev => ev.preventDefault());
    // R2.0.20 (D-38 §3): no pinch (Safari gesture events) and no double-tap zoom on the stage.
    const stage = this.canvas.parentElement;
    stage?.addEventListener('gesturestart', ev => ev.preventDefault());
    stage?.addEventListener('dblclick', ev => ev.preventDefault());
    this.audio.bindUnlock();
    window.addEventListener('pointermove', ev => {
      if (this.menuPress.phase === 'pending') this.menuPressStep({ kind: 'move', id: ev.pointerId, x: ev.clientX, y: ev.clientY, inside: this.overMenuButton(ev) });
      if (this.menuOpen || this.statsOpen || this.installOpen) return;
      this.pointer = stagePoint(ev.clientX, ev.clientY, this.canvas.getBoundingClientRect());
      if (this.app.screen !== 'level') {
        this.screenMove(this.pointer, ev.pointerType === 'touch');
        return;
      }
      this.engine?.command({ kind: 'aim', ...this.pointer });
    });
    window.addEventListener('pointerdown', ev => {
      this.audio.unlock();
      if (this.loading || this.menuOpen || this.statsOpen || this.installOpen || this.rotateOpen) return;
      if (ev.target === this.nameInput) return; // the name field keeps its native focus (mobile keyboard)
      if (ev.pointerType === 'mouse') ev.preventDefault(); // no text selection while playing
      const p = stagePoint(ev.clientX, ev.clientY, this.canvas.getBoundingClientRect());
      if (this.app.screen !== 'level') {
        this.screenDown(p, ev.button);
        return;
      }
      if (ev.button === 2) { this.engine?.command({ kind: 'swap' }); return; }
      if (ev.button !== 0) return;
      const button = this.renderer.hitTest(p.x, p.y);
      if (button === 'menu') {
        // Any pointer on MENU arms the long press; the outcome (menu, shot or nothing) is decided by menuPressStep.
        const step = longPress(this.menuPress, { kind: 'down', id: ev.pointerId, x: ev.clientX, y: ev.clientY, t: performance.now(), inside: true });
        if (step.action === 'start') {
          this.menuPress = step.state;
          this.menuPressType = ev.pointerType;
          this.menuPressPoint = p;
          this.pointer = p;
          if (ev.pointerType !== 'touch') this.engine?.command({ kind: 'aim', ...p });
          window.clearTimeout(this.menuPressTimer);
          this.menuPressTimer = window.setTimeout(() => this.menuPressStep({ kind: 'tick', t: performance.now() }), LONG_PRESS_MS + 5);
          return;
        }
      }
      if (ev.pointerType === 'touch') {
        if (button === 'stats') { this.openStats('live'); return; }
        // R2.0.20 (D-38 §4): touching the frog swaps the balls (no aim, no shot), as in the mobile versions.
        if (this.engine && frogHit(p, this.engine.frog)) {
          if (this.paused) { this.togglePause(); return; }
          this.engine.command({ kind: 'swap' });
          return;
        }
      }
      this.pressShoot(p);
    });
    window.addEventListener('pointerup', ev => {
      if (this.menuPress.phase !== 'idle') this.menuPressStep({ kind: 'up', id: ev.pointerId, t: performance.now(), inside: this.overMenuButton(ev) });
      if (this.app.screen === 'level' || this.loading || this.menuOpen || this.installOpen || this.rotateOpen || ev.target === this.nameInput) return;
      this.screenUp(stagePoint(ev.clientX, ev.clientY, this.canvas.getBoundingClientRect()));
    });
    window.addEventListener('pointercancel', ev => {
      if (this.menuPress.phase !== 'idle') this.menuPressStep({ kind: 'cancel', id: ev.pointerId });
    });
    window.addEventListener('keydown', ev => {
      if (ev.repeat) return;
      if (this.installOpen) {
        if (ev.code === 'Escape') { ev.preventDefault(); this.closeInstallCard(false); }
        return;
      }
      if (this.rotateOpen) return;
      if (this.menuOpen) {
        if (this.menuKey(ev.code)) ev.preventDefault();
        return;
      }
      if (this.app.screen !== 'level') {
        if (this.screenKey(ev.code)) ev.preventDefault();
        return;
      }
      const dialogKey = ev.code === 'Space' || ev.code === 'Enter' || ev.code === 'NumpadEnter' || ev.code === 'Escape' || ev.code === 'Tab';
      if (this.statsOpen) {
        // The live STATS (Tab) closes like OK; an end-of-level STATS only closes through OK.
        if (dialogKey && this.statsOutcome === 'live') {
          ev.preventDefault();
          if (this.statsKit) this.audio.play({ key: 'button', gain: 1, rate: 1 });
          void this.closeStats();
        }
        return;
      }
      switch (ev.code) {
        case 'Space':
        case 'Enter':
        case 'NumpadEnter':
        case 'Escape':
          ev.preventDefault();
          this.toggleMenu();
          break;
        case 'Tab':
          ev.preventDefault();
          this.openStats('live');
          break;
        case 'KeyP':
          this.togglePause();
          break;
        case 'KeyM':
          this.toggleSound();
          break;
      }
    });
  }

  /** The ordinary press of the stage: aim at `p` and shoot (a paused game resumes instead, D-26). */
  private pressShoot(p: Point): void {
    if (this.loading || this.menuOpen || this.statsOpen || this.installOpen || this.rotateOpen) return;
    this.pointer = p;
    this.engine?.command({ kind: 'aim', ...p });
    if (this.paused) { this.togglePause(); return; }
    this.engine?.command({ kind: 'shoot', x: p.x, y: p.y });
  }

  /** True when the pointer event lies over the HUD MENU button. */
  private overMenuButton(ev: PointerEvent): boolean {
    const p = stagePoint(ev.clientX, ev.clientY, this.canvas.getBoundingClientRect());
    return this.renderer.hitTest(p.x, p.y) === 'menu';
  }

  /**
   * Long press on MENU (quick 261011): `fire` opens the menu (the release is then swallowed: no shot); `tap` keeps
   * today's press — a touch opens the menu, a mouse / pen shoots at the press point (D-26); `slip` (moved 12 px or
   * left the button) is an ordinary press: the mouse / pen shoots, a touch does nothing; `cancel` does nothing.
   */
  private menuPressStep(input: LongPressInput): void {
    const { state, action } = longPress(this.menuPress, input);
    this.menuPress = state;
    if (state.phase !== 'pending') window.clearTimeout(this.menuPressTimer);
    const touch = this.menuPressType === 'touch';
    switch (action) {
      case 'fire':
        if (!this.installOpen && !this.rotateOpen) this.openMenu();
        break;
      case 'tap':
        if (touch) {
          if (!this.installOpen && !this.rotateOpen) this.openMenu();
        } else {
          this.pressShoot(this.menuPressPoint);
        }
        break;
      case 'slip':
        if (!touch) this.pressShoot(this.menuPressPoint);
        break;
      default:
        break;
    }
  }

  // ------------------------------------------------- application state and main menu (R2.0.21, D-01, D-11)

  /**
   * One transition of the state machine (plan 06-02): the new state, the screen entry, the effects, the dialogs. Every
   * screen is drawn (R2.0.21, plan 06-04): welcome, adventure, level, the god dialogue (temple) and the ending.
   */
  private dispatch(event: AppEvent): void {
    const before = this.app;
    const { state, effects } = reduceApp(before, event);
    if (state === before) return;
    this.app = state;
    if (state.screen !== before.screen) this.enterScreen(state.screen);
    for (const effect of effects) this.applyEffect(effect);
    this.syncPrompt();
  }

  /** Effects of the machine: level start, storage (T-06-06: writeJson never throws), sounds. */
  private applyEffect(effect: AppEffect): void {
    switch (effect.kind) {
      case 'start-level':
        void this.beginRun(effect.run);
        break;
      case 'save-run':
        writeJson(this.storage, SAVE_KEY, effect.run);
        break;
      case 'save-profile':
        writeJson(this.storage, PROFILE_KEY, effect.profile);
        break;
      case 'save-scores':
        writeJson(this.storage, HIGHSCORE_KEY, { adventure: effect.scores });
        break;
      case 'sound':
        this.audio.play({ key: effect.key, gain: 1, rate: 1 });
        break;
    }
  }

  /** Screen change: the counter restarts and the loops stop; off the level no engine is kept (D-01) and the menu is fresh. */
  private enterScreen(screen: AppScreen): void {
    this.screenT0 = performance.now();
    this.audio.stopLoops();
    if (screen === 'level') {
      this.canvas.style.cursor = '';
      return;
    }
    // The god dialogue is drawn over the last board, frozen (no engine step off the level screen).
    if (screen !== 'temple') {
      this.engine = null;
      this.level = null;
    }
    this.god = { page: 0, hover: false, pressed: false };
    this.endingUi = { hover: false, pressed: false };
    this.paused = false;
    this.pausedByRotation = false;
    this.message = null;
    this.endAt = null;
    this.welcome = freshWelcomeUi();
    this.adventure = this.freshAdventureUi();
    this.renaming = false;
    this.canvas.style.cursor = 'default';
  }

  /** Adventure screen state at its entry: an arrival animation when a finished stage opened a door (app.opening). */
  private freshAdventureUi(): AdventureUi {
    const opening = this.app?.screen === 'adventure' ? this.app.opening : null;
    const temple = revealTemple(opening);
    return {
      hover: null, button: { hover: null, pressed: null },
      arrival: opening === null ? null : { temple, lock: advArrivalMaj(temple) },
      shake: [0, 0, 0, 0], shakeAt: -1, quake: false, rng: new SeededRandom(this.seed ^ 0x5a1018),
    };
  }

  /** Welcome counter c in maj of 10 ms (the original updates at 100 Hz). */
  private welcomeCounter(now = performance.now()): number {
    return Math.max(0, Math.floor((now - this.screenT0) / 10));
  }

  private promptStrings(): Record<string, string> | null {
    return this.statsKit?.strings ?? this.strings;
  }

  /** Dialog over the welcome: the machine's name / continue prompt, or the rename dialog of the welcome line. */
  private promptKind(): PromptView['kind'] | null {
    if (this.app.screen !== 'welcome') return null;
    if (this.app.prompt === 'continue') return 'continue';
    if (this.app.prompt === 'name') return 'name';
    return this.renaming ? 'rename' : null;
  }

  /**
   * Shows the invisible name field while a name dialog is open (empty: the stored name is never written into the
   * DOM, T-06-08), hides it otherwise; resets the dialog widgets when another dialog opens.
   */
  private syncPrompt(): void {
    const kind = this.promptKind();
    const naming = kind === 'name' || kind === 'rename';
    const input = this.nameInput;
    if (input && naming && input.hidden) {
      input.value = '';
      input.hidden = false;
      this.promptUi.text = '';
      this.focusNameInput();
    } else if (input && !naming && !input.hidden) {
      input.blur();
      input.hidden = true;
    }
    if (kind !== this.shownPrompt) {
      this.shownPrompt = kind;
      // A modal dialog: the stones behind it are no longer lit or pressed.
      if (kind) {
        this.welcome.hover = null;
        this.welcome.pressed = null;
        this.welcome.focus = null;
      }
      this.promptUi = { hover: null, pressed: null, focus: kind === 'continue' ? 'continue' : kind ? 'name-field' : null, text: naming ? this.promptUi.text : '' };
    }
  }

  private focusNameInput(): void {
    try { this.nameInput?.focus({ preventScroll: true }); } catch { /* not focusable */ }
  }

  /** The invisible text field, laid over the name box of the dialog (percentages of the stage). */
  private bindPrompt(): void {
    const stage = this.canvas.parentElement;
    if (!stage) return;
    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 16;
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.hidden = true;
    input.className = 'name-input';
    input.setAttribute('autocapitalize', 'words');
    input.setAttribute('enterkeyhint', 'done');
    input.setAttribute('aria-label', 'Nom du joueur');
    const r = nameDialogWidgets(null)[0].rect;
    const pct = (v: number, of: number): string => `${(v / of) * 100}%`;
    Object.assign(input.style, { position: 'absolute', left: pct(r.x, WIDTH), top: pct(r.y, HEIGHT), width: pct(r.w, WIDTH), height: pct(r.h, HEIGHT), opacity: '0', fontSize: '16px', border: '0', padding: '0', margin: '0', zIndex: '2' });
    input.style.setProperty('user-select', 'text');
    input.style.setProperty('-webkit-user-select', 'text');
    input.addEventListener('input', () => { this.promptUi.text = sanitizeName(input.value) ?? ''; });
    input.addEventListener('keydown', ev => {
      ev.stopPropagation();
      if (ev.isComposing) return;
      if (ev.key === 'Enter') {
        ev.preventDefault();
        this.promptActivate('name-ok');
      } else if (ev.key === 'Escape' && this.renaming) {
        ev.preventDefault();
        this.renaming = false;
        this.syncPrompt();
      }
    });
    stage.append(input);
    this.nameInput = input;
  }

  /** Dialog widget under a logical point. */
  private promptWidgetAt(kind: PromptView['kind'], p: Point): string | null {
    const widgets = kind === 'continue' ? continueDialogWidgets(this.promptStrings()) : nameDialogWidgets(this.promptStrings());
    const hit = widgets.find(w => p.x >= w.rect.x && p.x <= w.rect.x + w.rect.w && p.y >= w.rect.y && p.y <= w.rect.y + w.rect.h);
    return hit?.id ?? null;
  }

  /** Dialog buttons: OK of the name dialog, « Continuer » / « Rejouer » of the continue question. */
  private promptActivate(id: string): void {
    if (id !== 'name-ok' && id !== 'continue' && id !== 'new-game') return;
    this.audio.play({ key: 'button', gain: 1, rate: 1 });
    if (id === 'continue') {
      this.dispatch({ kind: 'continue' });
      return;
    }
    if (id === 'new-game') {
      this.dispatch({ kind: 'new-game' });
      return;
    }
    const name = sanitizeName(this.nameInput?.value ?? '');
    if (this.renaming) {
      // Rename: an empty field keeps the current name.
      this.renaming = false;
      if (name !== null) this.dispatch({ kind: 'name', name });
      this.syncPrompt();
      return;
    }
    // First launch: an empty field gives the « Joueur » profile (plan 06-02 rule).
    this.dispatch({ kind: 'name', name: name ?? '' });
  }

  private welcomeLineW(): number {
    return welcomeLineWidth(this.welcomeKit, this.promptStrings(), this.app.profile?.name ?? null);
  }

  /**
   * Pointer over the welcome: the eyes' target, the cursor, the hover of the enabled stones with `choral1` at 0.2
   * transposed by the stone's semitones (0x43ed30, once per entry), the hover-order counter of the UFO (every stone,
   * no feedback on the disabled ones). A finger has no hover: press = pressed state, release inside = activation.
   */
  private welcomeMove(p: Point, touch: boolean): void {
    if (this.loading) return;
    this.welcome.target = p;
    const kind = this.promptKind();
    if (kind) {
      if (!touch) this.promptUi.hover = this.promptWidgetAt(kind, p);
      return;
    }
    const zone = welcomeHit(p.x, p.y, this.welcomeLineW());
    const stone = MM.stones.find(s => s.id === zone) ?? null;
    this.canvas.style.cursor = stone?.enabled || zone === 'welcome-line' || zone === 'frog' ? 'pointer' : 'default';
    if (!touch) this.hoverStone(stone);
  }

  private hoverStone(stone: MmStone | null): void {
    if (stone && stone.id !== this.welcome.lastSeqStone) {
      this.welcome.lastSeqStone = stone.id;
      const step = mmHoverSequence(this.welcome.seq, MM.stones.indexOf(stone));
      this.welcome.seq = step.seq;
      // Three ordered laps launch the UFO (0x43d880); clicking it leads nowhere (D-10: no credits).
      if (step.launch && this.welcome.ufo.phase === 'idle') this.welcome.ufo = { phase: 'in', t0: this.welcomeCounter() };
    }
    const hover = stone && stone.enabled ? stone.id : null;
    if (hover === this.welcome.hover) return;
    this.welcome.hover = hover;
    if (!hover || !stone) return;
    this.welcome.focus = null; // one lit stone at a time: the pointer takes over from the keyboard focus
    this.audio.play({ key: 'choral', gain: 0.2, rate: 2 ** (stone.semitones / 12) });
  }

  /** Press on the welcome: dialog widgets, enabled stones, the welcome line; the frog toggles « eyes follow » (0x43c430). */
  private welcomeDown(p: Point, button: number): void {
    if (button !== 0) return;
    this.welcome.target = p;
    const kind = this.promptKind();
    if (kind) {
      const id = this.promptWidgetAt(kind, p);
      this.promptUi.pressed = id;
      if (id === 'name-field') this.focusNameInput();
      return;
    }
    const zone = welcomeHit(p.x, p.y, this.welcomeLineW());
    if (zone === 'frog') {
      this.welcome.eyes = this.welcome.eyes === 'follow' ? 'rest' : 'follow';
      return;
    }
    const stone = MM.stones.find(s => s.id === zone);
    if (stone && !stone.enabled) return; // D-11: Gauntlet, Plus de jeux, Quitter do nothing
    this.welcome.pressed = zone;
  }

  /** Release: activation when it happens over the pressed stone / line / dialog button. */
  private welcomeUp(p: Point): void {
    const kind = this.promptKind();
    if (kind) {
      const pressed = this.promptUi.pressed;
      this.promptUi.pressed = null;
      const id = this.promptWidgetAt(kind, p);
      if (pressed && id === pressed) this.promptActivate(id);
      return;
    }
    const pressed = this.welcome.pressed;
    this.welcome.pressed = null;
    if (!pressed || welcomeHit(p.x, p.y, this.welcomeLineW()) !== pressed) return;
    if (pressed === 'welcome-line') {
      this.audio.play({ key: 'button', gain: 1, rate: 1 });
      this.openRename();
      return;
    }
    this.activateStone(pressed as MmStoneId);
  }

  /** AVENTURE → the machine (continue question or the run); OPTIONS → the dialog out of game (0x44ac50). */
  private activateStone(id: MmStoneId): void {
    const stone = MM.stones.find(s => s.id === id);
    if (!stone || !stone.enabled) return;
    this.audio.play({ key: 'button', gain: 1, rate: 1 });
    if (id === 'adventure') this.dispatch({ kind: 'adventure' });
    else if (id === 'options') this.openMenu();
  }

  /** The welcome line stands for « Si ce n'est pas vous, cliquez ici » (Q1 / Q4): it reopens the name dialog. */
  private openRename(): void {
    if (this.app.screen !== 'welcome' || this.app.prompt !== null) return;
    this.renaming = true;
    this.syncPrompt();
  }

  /**
   * Keys on the welcome: in the name dialog Enter = OK (the field takes the other keys), Escape closes a rename; in the
   * continue question Left / Right / Tab move between « Continuer » and « Rejouer », Enter / Space activate, Escape
   * closes it without any change; otherwise Up / Down / Tab move the focus over the enabled stones (drawn as hovered)
   * and Enter / Space activate. Returns true when the key was handled.
   */
  private welcomeKey(code: string): boolean {
    const kind = this.promptKind();
    const enter = code === 'Enter' || code === 'NumpadEnter';
    if (kind === 'name' || kind === 'rename') {
      if (code === 'Escape' && kind === 'rename') {
        this.renaming = false;
        this.syncPrompt();
        return true;
      }
      if (enter) {
        this.promptActivate('name-ok');
        return true;
      }
      this.focusNameInput(); // a key typed elsewhere goes to the field
      return false;
    }
    if (kind === 'continue') {
      if (code === 'Escape') {
        // Closing the question changes nothing: the saved run stays (presentation-only dismiss).
        this.app = { ...this.app, prompt: null };
        this.syncPrompt();
        return true;
      }
      if (code === 'ArrowLeft' || code === 'ArrowRight' || code === 'ArrowUp' || code === 'ArrowDown' || code === 'Tab') {
        this.promptUi.focus = this.promptUi.focus === 'continue' ? 'new-game' : 'continue';
        return true;
      }
      if (enter || code === 'Space') {
        this.promptActivate(this.promptUi.focus ?? 'continue');
        return true;
      }
      return false;
    }
    const active = MM.stones.filter(s => s.enabled);
    if (code === 'ArrowUp' || code === 'ArrowDown' || code === 'Tab') {
      const i = active.findIndex(s => s.id === this.welcome.focus);
      const step = code === 'ArrowUp' ? -1 : 1;
      const next = i < 0 ? active[step > 0 ? 0 : active.length - 1] : active[(i + step + active.length) % active.length];
      this.welcome.focus = next.id;
      this.welcome.hover = null;
      this.audio.play({ key: 'choral', gain: 0.2, rate: 2 ** (next.semitones / 12) });
      return true;
    }
    if (enter || code === 'Space') {
      if (this.welcome.focus) this.activateStone(this.welcome.focus);
      else this.welcome.focus = active[0].id;
      return true;
    }
    if (code === 'KeyM') this.toggleSound();
    return false;
  }

  // ------------------------------------------------- screens off the level: pointer and keyboard routing

  private screenMove(p: Point, touch: boolean): void {
    switch (this.app.screen) {
      case 'adventure': this.adventureMove(p, touch); break;
      case 'temple': this.dialogMove(p, touch, 'god'); break;
      case 'ending': this.dialogMove(p, touch, 'ending'); break;
      default: this.welcomeMove(p, touch);
    }
  }

  private screenDown(p: Point, button: number): void {
    switch (this.app.screen) {
      case 'adventure': this.adventureDown(p, button); break;
      case 'temple': if (button === 0) this.god.pressed = this.dialogHit(p, 'god'); break;
      case 'ending': if (button === 0) this.endingUi.pressed = this.dialogHit(p, 'ending'); break;
      default: this.welcomeDown(p, button);
    }
  }

  private screenUp(p: Point): void {
    switch (this.app.screen) {
      case 'adventure': this.adventureUp(p); break;
      case 'temple': {
        const pressed = this.god.pressed;
        this.god.pressed = false;
        if (pressed && this.dialogHit(p, 'god')) this.godNext();
        break;
      }
      case 'ending': {
        const pressed = this.endingUi.pressed;
        this.endingUi.pressed = false;
        if (pressed && this.dialogHit(p, 'ending')) this.endingDone();
        break;
      }
      default: this.welcomeUp(p);
    }
  }

  /** Keys off the level: welcome, adventure; Enter / Space = the reply of the god dialogue; Enter / Space / Escape = OK of the ending. */
  private screenKey(code: string): boolean {
    const activate = code === 'Enter' || code === 'NumpadEnter' || code === 'Space';
    switch (this.app.screen) {
      case 'adventure': return this.adventureKey(code);
      case 'temple':
        if (activate) this.godNext();
        return activate;
      case 'ending':
        if (activate || code === 'Escape') this.endingDone();
        return activate || code === 'Escape';
      default: return this.welcomeKey(code);
    }
  }

  /** The single button of the god dialogue / of the ending under a logical point. */
  private dialogHit(p: Point, which: 'god' | 'ending'): boolean {
    const temple = this.app.temple ?? 1;
    const r = which === 'god' ? godDialogWidgets(this.promptStrings(), temple)[0].rect : endingWidgets()[0].rect;
    return p.x >= r.x && p.x <= r.x + r.w && p.y >= r.y && p.y <= r.y + r.h;
  }

  private dialogMove(p: Point, touch: boolean, which: 'god' | 'ending'): void {
    const over = this.dialogHit(p, which);
    this.canvas.style.cursor = over ? 'pointer' : 'default';
    if (touch) return;
    if (which === 'god') this.god.hover = over;
    else this.endingUi.hover = over;
  }

  /** The frog's reply: the next page of the god's speech, then the end of the dialogue (temple-done). */
  private godNext(): void {
    if (this.app.screen !== 'temple') return;
    this.audio.play({ key: 'button', gain: 1, rate: 1 });
    const temple = this.app.temple ?? 1;
    if (this.god.page + 1 < godPages(temple)) {
      this.god = { page: this.god.page + 1, hover: this.god.hover, pressed: false };
      return;
    }
    this.dispatch({ kind: 'temple-done' });
  }

  /** OK of the ending → the welcome screen (0x44b3e0); the run is over. */
  private endingDone(): void {
    if (this.app.screen !== 'ending') return;
    this.audio.play({ key: 'button', gain: 1, rate: 1 });
    this.dispatch({ kind: 'ending-done' });
  }

  /** God dialogue over the last board, frozen: the board as it was at the end of the level, then the dialogue. */
  private drawTempleFrame(): void {
    const engine = this.engine;
    if (engine && this.level) this.renderer.draw(engine, this.fx, this.hud(engine), this.frame);
    const temple = this.app.temple ?? 1;
    const view = { temple, page: this.god.page, hover: this.god.hover, pressed: this.god.pressed };
    this.renderer.drawScene(ctx => {
      if (!engine) {
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
      }
      drawGodDialog(ctx, this.statsKit, view, this.promptStrings());
    });
  }

  /** Ending: happyending, FÉLICITATIONS, the final score and the table with the run's rank (D-10). */
  private drawEndingFrame(): void {
    const ending = this.app.ending;
    const view = { score: ending?.score ?? 0, rank: ending?.rank ?? null, scores: this.app.scores, hover: this.endingUi.hover, pressed: this.endingUi.pressed, strings: this.promptStrings(), scope: null };
    this.renderer.drawScene(ctx => drawEnding(ctx, this.adventureKit, view));
  }

  // ----------------------------------------------------- adventure screen (R2.0.21, D-02, research 06 Q2)

  /** Doors ignore the pointer during the arrival animation (+0x204, 0x440d65 / 0x440dc9). */
  private adventureLocked(): boolean {
    const a = this.adventure.arrival;
    return a !== null && this.welcomeCounter() < a.lock;
  }

  private adventureMaxStage(): number {
    return this.app.profile?.maxStage ?? 0;
  }

  /** Unlocked door under a logical point: cel rectangle, then the alpha of cel 0 (0x440c90). */
  private adventureDoorAt(p: Point): number | null {
    const kit = this.adventureKit;
    const { widths, heights } = advDoorSizes(kit);
    return doorAt(p.x, p.y, this.adventureMaxStage(), widths, heights, (i, lx, ly) => advDoorOpaque(kit, i, lx, ly));
  }

  /** Pointer over the adventure screen: hovered door (hand cursor) and button; a finger has no hover. */
  private adventureMove(p: Point, touch: boolean): void {
    const door = this.adventureLocked() ? null : this.adventureDoorAt(p);
    const button = advButtonAt(p.x, p.y);
    this.canvas.style.cursor = door !== null || button ? 'pointer' : 'default';
    if (touch) return;
    this.adventure.hover = door;
    this.adventure.button.hover = button;
  }

  /**
   * Press on the adventure screen (0x440db0): a button is pressed (activation on release); an unlocked door other than
   * the selected one is selected, silently; the selected door again plays it (ButtonDepress(1), 0x440e06).
   */
  private adventureDown(p: Point, button: number): void {
    if (button !== 0) return;
    const id = advButtonAt(p.x, p.y);
    if (id) {
      this.adventure.button.pressed = id;
      return;
    }
    if (this.adventureLocked()) return;
    const door = this.adventureDoorAt(p);
    if (door === null) return;
    if (door === this.app.selected) this.adventureButton('play', false);
    else this.dispatch({ kind: 'select', stage: door });
  }

  private adventureUp(p: Point): void {
    const pressed = this.adventure.button.pressed;
    this.adventure.button.pressed = null;
    if (pressed && advButtonAt(p.x, p.y) === pressed) this.adventureButton(pressed);
  }

  /** « Jouer » → the selected stage (resumed when it is the saved run's); « Menu principal » → the welcome screen. */
  private adventureButton(id: AdvButtonId, sound = true): void {
    if (sound) this.audio.play({ key: 'button', gain: 1, rate: 1 });
    if (id === 'play') this.dispatch({ kind: 'play' });
    else this.dispatch({ kind: 'main-menu' });
  }

  /**
   * Keys on the adventure screen (the original has none): Left / Right walk the unlocked doors, Enter / Space = « Jouer »,
   * Escape = « Menu principal », M mutes. Returns true when the key was handled.
   */
  private adventureKey(code: string): boolean {
    if (code === 'ArrowLeft' || code === 'ArrowRight') {
      const last = Math.max(0, Math.min(this.adventureMaxStage(), 11, this.app.sizes.length - 1));
      const current = Math.min(this.app.selected, last);
      const step = code === 'ArrowRight' ? 1 : -1;
      const next = this.app.selected > last && step < 0 ? last : (current + step + last + 1) % (last + 1);
      this.dispatch({ kind: 'select', stage: next });
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      this.adventureButton('play');
      return true;
    }
    if (code === 'Escape') {
      this.adventureButton('main-menu');
      return true;
    }
    if (code === 'KeyM') this.toggleSound();
    return false;
  }

  /**
   * One frame of the adventure screen: the arrival animation advances with the counter (temple 2 / 3 crossfade, temple 4
   * rising with the earthquake once at n = 1 and the shake every 4 maj, 0x43e470), then the screen is painted.
   */
  private drawAdventureFrame(time: number): void {
    const c = Math.max(0, Math.floor((time - this.screenT0) / 10));
    const ui = this.adventure;
    const temple = ui.arrival?.temple ?? null;
    let reveal: AdventureView['reveal'] = null;
    if (temple !== null && c < advArrivalMaj(temple)) reveal = { temple, progress: revealProgress(c, temple) };
    if (temple === 4) {
      const delay = ADV.reveal.delayMaj;
      if (!ui.quake && c - delay >= 1) {
        ui.quake = true;
        this.audio.play({ key: 'earthquake', gain: 1, rate: 1 });
      }
      const end = Math.min(c, delay + ADV.reveal.riseMaj + 4);
      for (let m = Math.max(ui.shakeAt + 1, delay); m <= end; m++) {
        if (m % 4 === 0) ui.shake = advShakeStep(ui.shake, m - delay, () => ui.rng.next());
      }
      ui.shakeAt = Math.max(ui.shakeAt, c);
    }
    const locked = this.adventureLocked();
    const view: AdventureView = {
      c, maxStage: this.adventureMaxStage(), selected: this.app.selected, hover: locked ? null : ui.hover, button: { ...ui.button },
      reveal, shake: ui.shake, scores: this.app.scores, strings: this.promptStrings(), scope: null,
    };
    this.renderer.drawScene(ctx => drawAdventure(ctx, this.adventureKit, view));
  }

  /**
   * One frame of the main menu (counter c from the screen entry): the UFO state advances (its `ufo1` loop plays while
   * it flies and waits, cut under the OPTIONS dialog), then the menu and the open dialog are drawn at the store scale.
   */
  private drawWelcomeFrame(time: number): void {
    const c = Math.max(0, Math.floor((time - this.screenT0) / 10));
    const ufoState = this.welcome.ufo;
    const ufo = mmUfo(ufoState, c);
    this.welcome.ufo = ufo.next;
    this.audio.setLoop('ufo', ufo.sound && !this.menuOpen ? 1 : 0);
    const strings = this.promptStrings();
    const view: WelcomeView = {
      c, hover: this.welcome.hover, pressed: this.welcome.pressed, focus: this.welcome.focus, eyes: this.welcome.eyes,
      target: this.welcome.target, ufo: ufoState, name: this.app.profile?.name ?? null, strings,
    };
    const kind = this.promptKind();
    const ui = this.promptUi;
    this.renderer.drawScene(ctx => {
      drawWelcome(ctx, this.welcomeKit, view);
      if (!kind) return;
      const prompt: PromptView = { kind, text: ui.text, caret: kind !== 'continue' && Math.floor(time / 530) % 2 === 0, hover: ui.hover, pressed: ui.pressed, focus: ui.focus };
      if (kind === 'continue') drawContinueDialog(ctx, this.statsKit, prompt, strings);
      else drawNameDialog(ctx, this.statsKit, prompt, strings);
    });
  }

  // ---------------------------------------------------------------- install

  /** Current install instruction (pure rule in pwa.ts over the live navigator). */
  private installGuidance(): InstallGuidance {
    return installGuidance(readInstallEnv(this.installPrompt !== null));
  }

  /** Platform widgets of the menu: « Installer » in the help view while there is something to show. */
  private menuOptions(): MenuOptions {
    const g = this.installGuidance();
    // R2.0.20 (D-38 §4): without the Fullscreen API (iPhone) the « Plein écran » check is not offered.
    const fullscreen = document.fullscreenEnabled === true && typeof document.documentElement.requestFullscreen === 'function';
    // R2.0.21: from the main menu the dialog is the OPTIONS out of game (title OPTIONS, footer « Terminé »).
    return { install: g !== 'installed' && g !== 'none', fullscreen, ...(this.app.screen === 'level' ? {} : { inGame: false }) };
  }

  /** Fills and opens the install card; resolves when it is closed (« Jouer », « × », Escape, or installed). */
  private showInstallCard(from: 'start' | 'menu'): Promise<void> {
    const card = document.getElementById('install-card');
    if (!card) return Promise.resolve();
    this.updateInstallCard();
    card.dataset.from = from;
    card.classList.add('open');
    this.installOpen = true;
    return new Promise(resolve => { this.installDone = resolve; });
  }

  /** Shows the line of the current platform only (the browser button needs a kept prompt). */
  private updateInstallCard(): void {
    const g = this.installGuidance();
    const show = (id: string, visible: boolean): void => { const el = document.getElementById(id); if (el) el.hidden = !visible; };
    show('install-button', g === 'prompt');
    show('install-ios', g === 'ios-share');
    show('install-mac', g === 'mac-safari-dock');
  }

  /** Closes the card; `remember` (« × » on the start screen) stops showing it at launch. */
  private closeInstallCard(remember: boolean): void {
    const card = document.getElementById('install-card');
    if (!card || !this.installOpen) return;
    if (remember && card.dataset.from === 'start') {
      try { localStorage.setItem(INSTALL_HIDDEN_KEY, '1'); } catch { /* storage unavailable */ }
    }
    card.classList.remove('open');
    this.installOpen = false;
    const done = this.installDone;
    this.installDone = null;
    if (this.menuOpen) {
      this.menuState.options = this.menuOptions();
      this.renderMenu();
    }
    done?.();
  }

  /** `beforeinstallprompt` / `appinstalled` and the card buttons. */
  private bindInstall(): void {
    window.addEventListener('beforeinstallprompt', ev => {
      ev.preventDefault();
      this.installPrompt = ev as InstallPromptEvent;
      if (this.installOpen) this.updateInstallCard();
      if (this.menuOpen) { this.menuState.options = this.menuOptions(); this.renderMenu(); }
    });
    window.addEventListener('appinstalled', () => {
      this.installPrompt = null;
      this.closeInstallCard(false);
      if (this.menuOpen) { this.menuState.options = this.menuOptions(); this.renderMenu(); }
    });
    const click = (id: string, handler: () => void): void => {
      document.getElementById(id)?.addEventListener('click', () => { this.audio.unlock(); handler(); });
    };
    click('install-play', () => this.closeInstallCard(false));
    click('install-close', () => this.closeInstallCard(true));
    click('install-button', () => {
      const prompt = this.installPrompt;
      if (!prompt) return;
      this.installPrompt = null; // one use only
      void prompt.prompt().catch(() => undefined);
      void prompt.userChoice?.then(choice => { if (choice.outcome === 'accepted') this.closeInstallCard(false); else this.updateInstallCard(); }).catch(() => undefined);
    });
    // The card swallows its pointer events (no shot, no menu action behind it).
    document.getElementById('install-card')?.addEventListener('pointerdown', ev => ev.stopPropagation());
  }

  // ------------------------------------------------------------------- menu

  /**
   * In-game MENU (D-24): the OPTIONS dialog of the original in « in game » mode, composed on a canvas. Opening
   * pauses the game first (0x44ac50 → 0x44aac0 → Board::Pause 0x4049d0) and cuts the loops; never with the STATS.
   */
  private toggleMenu(): void {
    if (this.menuOpen) this.closeMenu();
    else this.openMenu();
  }

  private openMenu(): void {
    if (this.statsOpen || this.loading || this.menuOpen) return;
    this.menuOpen = true;
    this.audio.stopLoops();
    const strings = this.menuKit?.stats.strings ?? this.strings;
    this.menuState = {
      view: 'menu', music: 0, sfx: this.audio.volume, fullscreen: document.fullscreenElement !== null && document.fullscreenElement !== undefined,
      pixelated: this.pixelated, hover: null, pressed: null, focus: 'back', tips: menuTips(strings),
      badge: this.badge, options: this.menuOptions(),
    };
    this.menuDrag = null;
    this.renderMenu();
    document.getElementById('menu')?.classList.add('open');
  }

  private closeMenu(): void {
    if (!this.menuOpen) return;
    this.menuOpen = false;
    this.menuDrag = null;
    document.getElementById('menu')?.classList.remove('open');
    this.menuCanvas?.remove();
  }

  /** Composes the menu at the renderer scale into the child canvas of #menu (recomposed at every state change and resize). */
  private renderMenu(): void {
    const host = document.getElementById('menu');
    if (!host || !this.menuOpen) return;
    const picture = this.menuCanvas ?? document.createElement('canvas');
    picture.className = 'menu-picture';
    this.menuCanvas = composeMenuDialog(this.menuKit, this.menuState, picture, this.renderer.scale);
    if (picture.parentElement !== host) host.append(picture);
  }

  private menuStrings(): Record<string, string> | null {
    return this.menuKit?.stats.strings ?? this.strings;
  }

  /** Logical 640 × 480 point of a pointer event over the menu (the canvas covers the stage). */
  private menuPoint(ev: PointerEvent): Point {
    const rect = (this.menuCanvas ?? this.canvas).getBoundingClientRect();
    if (!(rect.width > 0) || !(rect.height > 0)) return { x: -1, y: -1 };
    return { x: ((ev.clientX - rect.left) / rect.width) * WIDTH, y: ((ev.clientY - rect.top) / rect.height) * HEIGHT };
  }

  /** Pointer on #menu: hover, press, slider drag (pointer captured), activation on release over the pressed widget. */
  private bindMenu(): void {
    const host = document.getElementById('menu');
    if (!host) return;
    host.addEventListener('contextmenu', ev => ev.preventDefault());
    host.addEventListener('pointermove', ev => {
      if (!this.menuOpen) return;
      const p = this.menuPoint(ev);
      const widgets = menuWidgets(this.menuState.view, this.menuStrings(), this.menuState.options);
      if (this.menuDrag === 'sfx') {
        const sfx = widgets.find(w => w.id === 'sfx');
        if (sfx) this.setSfx(sliderValue(sfx.rect, p.x), false);
      }
      const hover = hitMenu(widgets, p.x, p.y)?.id ?? null;
      if (hover !== this.menuState.hover) {
        this.menuState.hover = hover;
        if (hover) this.menuState.focus = hover; // the focus follows the pointer: one lit widget at a time
        this.renderMenu();
      }
    });
    host.addEventListener('pointerdown', ev => {
      if (!this.menuOpen) return;
      ev.preventDefault();
      this.audio.unlock();
      if (ev.button !== 0) return;
      const p = this.menuPoint(ev);
      const w = hitMenu(menuWidgets(this.menuState.view, this.menuStrings(), this.menuState.options), p.x, p.y);
      if (!w) return;
      this.menuState.pressed = w.id;
      this.menuState.focus = w.id;
      if (w.kind === 'slider') {
        this.menuDrag = w.id;
        try { host.setPointerCapture(ev.pointerId); } catch { /* not capturable */ }
        if (w.id === 'sfx') this.setSfx(sliderValue(w.rect, p.x), false);
      }
      this.renderMenu();
    });
    const release = (ev: PointerEvent): void => {
      if (!this.menuOpen) return;
      const p = this.menuPoint(ev);
      const pressed = this.menuState.pressed;
      const dragged = this.menuDrag;
      this.menuState.pressed = null;
      this.menuDrag = null;
      if (dragged === 'sfx') this.setSfx(this.audio.volume, true);
      const w = hitMenu(menuWidgets(this.menuState.view, this.menuStrings(), this.menuState.options), p.x, p.y);
      if (pressed && w && w.id === pressed && w.kind !== 'slider') this.menuActivate(w.id);
      else this.renderMenu();
    };
    host.addEventListener('pointerup', release);
    host.addEventListener('pointercancel', () => { this.menuState.pressed = null; this.menuDrag = null; if (this.menuOpen) this.renderMenu(); });
    host.addEventListener('pointerleave', () => {
      if (!this.menuOpen || this.menuDrag || this.menuState.hover === null) return;
      this.menuState.hover = null;
      this.renderMenu();
    });
    document.addEventListener('fullscreenchange', () => {
      this.menuState.fullscreen = !!document.fullscreenElement;
      if (this.menuOpen) this.renderMenu();
    });
  }

  /** « Sons »: master volume 0..1, persisted as zuma.sfx when `persist` (T-05-31). */
  private setSfx(value: number, persist: boolean): void {
    this.audio.setVolume(value);
    this.menuState.sfx = this.audio.volume;
    if (persist) {
      try { localStorage.setItem('zuma.sfx', String(this.audio.volume)); } catch { /* storage unavailable */ }
    }
    this.renderMenu();
  }

  /**
   * Action of a menu widget (pointer release or Enter / Space on the focused widget). « Retour au menu principal »
   * asks LEAVE_GAME_? / QUIT_THE_GAME_? then leaves the level (R2.0.21: back to the main menu, the run stays saved at
   * the start of its level); « Terminé » of the OPTIONS out of game comes back to the main menu.
   */
  private menuActivate(id: MenuWidgetId): void {
    const state = this.menuState;
    const button = id === 'help' || id === 'main-menu' || id === 'back' || id === 'help-done' || id === 'leave' || id === 'cancel' || id === 'install';
    if (button) this.audio.play({ key: 'button', gain: 1, rate: 1 });
    switch (id) {
      case 'fullscreen': {
        // Called from a user gesture (pointerup / keydown), guarded (T-05-32).
        try {
          if (document.fullscreenElement) void document.exitFullscreen().catch(() => undefined);
          else void document.documentElement.requestFullscreen?.().catch(() => undefined);
        } catch { /* fullscreen unavailable */ }
        break;
      }
      case 'pixels':
        this.togglePixels();
        break;
      case 'help':
        state.view = 'help';
        state.focus = 'help-done';
        break;
      case 'help-done':
        state.view = 'menu';
        state.focus = 'help';
        break;
      case 'install':
        // The card opens above the menu (game paused); closing it comes back to the help view.
        void this.showInstallCard('menu');
        break;
      case 'main-menu':
        state.view = 'confirm';
        state.focus = 'cancel';
        break;
      case 'cancel':
        state.view = 'menu';
        state.focus = 'main-menu';
        break;
      case 'leave':
        this.closeMenu();
        this.dispatch({ kind: 'leave' });
        return;
      case 'back':
        this.closeMenu();
        return;
      default:
        break; // sliders: driven by the pointer or Left / Right
    }
    state.hover = null;
    this.renderMenu();
  }

  /**
   * Keyboard while the menu is open: Escape closes (or returns to the menu view from help / confirm), Enter / Space
   * activate the focused widget (initial focus « Retour à la partie »), Up / Down move the focus over the enabled
   * widgets, Left / Right change « Sons » by 0.1. Returns true when the key was handled.
   */
  private menuKey(code: string): boolean {
    const state = this.menuState;
    const widgets = menuWidgets(state.view, this.menuStrings(), state.options).filter(w => w.enabled);
    if (code === 'Escape') {
      if (state.view === 'help') this.menuActivate('help-done');
      else if (state.view === 'confirm') this.menuActivate('cancel');
      else this.closeMenu();
      return true;
    }
    if (code === 'Enter' || code === 'NumpadEnter' || code === 'Space') {
      const focus = widgets.find(w => w.id === state.focus) ?? widgets[widgets.length - 1];
      if (focus) this.menuActivate(focus.id);
      return true;
    }
    if (code === 'ArrowUp' || code === 'ArrowDown') {
      const i = widgets.findIndex(w => w.id === state.focus);
      const step = code === 'ArrowDown' ? 1 : -1;
      const next = widgets[((i < 0 ? 0 : i + step) + widgets.length) % widgets.length];
      state.focus = next?.id ?? null;
      this.renderMenu();
      return true;
    }
    if ((code === 'ArrowLeft' || code === 'ArrowRight') && state.view === 'menu') {
      this.setSfx(Math.round((this.audio.volume + (code === 'ArrowRight' ? 0.1 : -0.1)) * 10) / 10, true);
      return true;
    }
    return false;
  }

  private statsOutcome: 'live' | 'won' | 'lost' | 'gameover' = 'live';
  /** Input of the displayed values, kept so the count-up can refresh POINTS / BONUS. */
  private statsInput: StatsInput | null = null;
  /**
   * ACE TIME count-up in the dialog (0x440b00, §8): `total` = the uncredited bonus when the dialog
   * opened, `shown` = the share already credited through engine.creditBonus() (T-05-15), `startedAt`
   * = opening time (performance.now), `steps` = steps applied, `fast` = BONUS_FAST_STEP per step (D-21).
   */
  private statsBonus: { total: number; shown: number; startedAt: number; steps: number; fast: boolean } | null = null;

  /**
   * Opens the STATS dialog. The ten values go to the `strong#result-*` of the structure
   * (vector panel) and, with the kit, into the dialog composed at the canvas scale and shown
   * as a child canvas of `.zuma-stats` (D-01, D-19). The best time per level is persisted under
   * zuma.best.<id> on a win and always displayed as RECORD (D-04).
   */
  private openStats(outcome: 'live' | 'won' | 'lost' | 'gameover'): void {
    const engine = this.engine;
    if (!engine || this.statsOpen) return;
    this.statsOutcome = outcome;
    this.statsOpen = true;
    this.audio.stopLoops();
    const kit = this.statsKit;
    const strings = kit?.strings ?? null;
    const won = outcome === 'won';
    const s = engine.stats;
    const seconds = Math.floor(engine.levelTicks / engine.config.tickHz); // D-13: level clock, started at « PARTEZ », frozen at clearing
    const key = bestTimeKey(this.level?.id ?? 'unknown');
    const stored = readBestTime(key);
    const best = bestTime(stored, seconds, won);
    // A review session (?level=) leaves the storage untouched (plan 06-04).
    if (won && best !== stored && !this.app.review) {
      try { localStorage.setItem(key, String(best)); } catch { /* storage unavailable */ }
    }
    // The time bonus is not in the score at `won`: it is counted up here, bounded by what is still uncredited.
    const total = won ? Math.max(0, engine.timeBonus - engine.timeBonusCredited) : 0;
    this.statsBonus = total > 0 ? { total, shown: 0, startedAt: performance.now(), steps: 0, fast: false } : null;
    this.statsInput = {
      levelScore: engine.levelScore, combos: s.combos, coins: s.coins, gaps: s.gaps, maxStreak: s.maxStreak, maxCombo: s.maxCombo,
      seconds, parTime: this.level?.parTime ?? 0, timeBonus: total, timeBonusShown: 0, won, bestSeconds: best,
      noBonusLabel: strings?.NO_TIME_BONUS ?? 'PAS DE BONUS',
    };
    const values = statsValues(this.statsInput);
    this.statsValues = values;
    const title = document.getElementById('results-title');
    if (title) title.textContent = strings?.STATS ?? 'STATISTIQUES';
    for (const [field, id] of Object.entries(RESULT_IDS)) {
      const el = document.getElementById(id);
      if (el) el.textContent = values[field as keyof StatsValues];
    }
    this.statsTip = pickTip(strings);
    const tip = document.getElementById('stats-tip-text');
    if (tip) tip.textContent = this.statsTip;
    const ok = document.getElementById('result-continue');
    if (ok) ok.textContent = outcome === 'won' ? 'Niveau suivant' : outcome === 'lost' ? 'Réessayer' : 'OK'; // game over: the native STATS has only OK (→ adventure screen)
    const panel = document.getElementById('stats');
    panel?.classList.toggle('stats-original', kit !== null);
    if (kit) {
      this.statsRevealed = 0;
      this.statsButton = 'normal';
      this.renderStats();
      this.revealStats();
    } else {
      this.statsCanvas?.remove();
    }
    this.scheduleBonusCountUp();
    panel?.classList.add('open');
  }

  /**
   * Arms the ACE TIME count-up (U17, §8, D-21): from 1 s after the opening, one step every 100 ms —
   * `bonusCountStep(total)` points, or BONUS_FAST_STEP once the dialog was clicked — with
   * `endoflevelpop1` at a rising pitch, each step credited to the engine so POINTS and the HUD score
   * climb live (the schedule is `bonusCountUp`). One timer is armed at a time (`countTimers`, purged on
   * close): the k-th step is due 1000 + 100 × k ms after the opening.
   */
  private scheduleBonusCountUp(): void {
    this.armBonusTimer();
  }

  private armBonusTimer(): void {
    const bonus = this.statsBonus;
    if (!bonus || !this.statsOpen || bonus.shown >= bonus.total) return;
    const due = 1000 + 100 * bonus.steps;
    const delay = Math.max(0, due - (performance.now() - bonus.startedAt));
    this.countTimers.push(window.setTimeout(() => {
      const b = this.statsBonus;
      if (!b || !this.statsOpen) return;
      b.steps++;
      this.bonusStep(Math.min(b.total, b.shown + (b.fast ? BONUS_FAST_STEP : bonusCountStep(b.total))));
      this.armBonusTimer();
    }, delay));
  }

  /** One count-up step: credits `target − shown` (never more than the remainder), pops, refreshes POINTS / BONUS. */
  private bonusStep(target: number): void {
    const engine = this.engine;
    const bonus = this.statsBonus;
    if (!engine || !bonus || !this.statsOpen) return;
    const step = Math.max(0, Math.min(target, bonus.total) - bonus.shown);
    if (step <= 0) return;
    engine.creditBonus(step);
    // A multiple of 50 000 crossed by the count-up gives a life (AddScore, 0x440b00): its triple `extralife` plays now.
    this.handleEvents(engine.drainEvents(), engine);
    bonus.shown += step;
    this.audio.play({ key: 'bonuspop', gain: 0.5, rate: bonusPopRate(bonus.shown, bonus.total) });
    this.refreshStatsValues(engine.levelScore, bonus.shown);
  }

  /** Recomputes the displayed values after a count-up step (vector panel and composed dialog). */
  private refreshStatsValues(levelScore: number, timeBonusShown: number): void {
    if (!this.statsInput) return;
    this.statsInput = { ...this.statsInput, levelScore, timeBonusShown };
    const values = statsValues(this.statsInput);
    this.statsValues = values;
    for (const field of ['points', 'bonus'] as const) {
      const el = document.getElementById(RESULT_IDS[field]);
      if (el) el.textContent = values[field];
    }
    this.renderStats();
  }

  /**
   * Composes the dialog for the current reveal / button state at the renderer scale, straight into
   * the child canvas of `.zuma-stats` (D-19: no 1 × intermediate, no PNG — at 3 × the ≈ 2000 × 1500
   * picture would cost ~100 ms to encode at every count-up step). The dialog is still composed at run
   * time with one OK and no `url(` in the stylesheet (D-01); only the display element changed.
   */
  private renderStats(): void {
    const kit = this.statsKit;
    const values = this.statsValues;
    const dialog = document.querySelector<HTMLElement>('#stats .zuma-stats');
    if (!kit || !values || !dialog || !this.statsOpen) return;
    const picture = this.statsCanvas ?? document.createElement('canvas');
    picture.className = 'stats-picture';
    this.statsCanvas = composeStatsDialog(kit, values, { revealed: this.statsRevealed, button: this.statsButton, tip: this.statsTip }, picture, this.renderer.scale);
    if (picture.parentElement !== dialog) dialog.prepend(picture);
  }

  /** Reveals the ten values one line every 90 ms with a `pop` (D-05); timers are purged by closeStats(). */
  private revealStats(): void {
    this.clearStatsTimers();
    for (let i = 1; i <= STATS_ORDER.length; i++) {
      this.statsTimers.push(window.setTimeout(() => {
        this.statsRevealed = i;
        this.renderStats();
        this.audio.play({ key: 'pop', gain: 0.8, rate: 1 });
      }, 90 * i));
    }
  }

  private clearStatsTimers(): void {
    for (const t of this.statsTimers) clearTimeout(t);
    for (const t of this.countTimers) clearTimeout(t);
    this.statsTimers = [];
    this.countTimers = [];
  }

  private async closeStats(): Promise<void> {
    document.getElementById('stats')?.classList.remove('open');
    this.clearStatsTimers();
    // OK before the end of the count-up: the remainder is credited at once, exactly once (T-05-15).
    const bonus = this.statsBonus;
    if (bonus && this.engine && bonus.shown < bonus.total) {
      this.engine.creditBonus(bonus.total - bonus.shown);
      this.handleEvents(this.engine.drainEvents(), this.engine); // a life won by the remainder sounds too
      bonus.shown = bonus.total;
    }
    this.statsBonus = null;
    this.statsOpen = false;
    this.statsCanvas?.remove();
    const outcome = this.statsOutcome;
    this.statsOutcome = 'live';
    // R2.0.21: the end of a level goes through the state machine — next level, or the adventure screen / god dialogue
    // / ending after a stage; the same level again; the adventure screen after the game-over STATS (D-02).
    const engine = this.engine;
    if (!engine) return;
    if (outcome === 'won') this.dispatch({ kind: 'won', score: engine.score, lives: engine.lives, date: localDate() });
    else if (outcome === 'lost') this.dispatch({ kind: 'retry', lives: engine.lives });
    else if (outcome === 'gameover') this.dispatch({ kind: 'leave' });
  }
}

/**
 * 2 × EPX copies of the pictures that are drawn at their logical size with smoothing (D-19): the six
 * ball sheets, the shadow, the 24 power icons, the menubar and the three HUD fonts — the level art,
 * cutouts, holes, lid, frog, coin, gauge, lives and explosions keep their 1 × bilinear pictures. All
 * or nothing: when any of them cannot be read, the 1 × assets are returned (T-05-22, ≈ 11 MB at most).
 */
function buildHdAssets(base: RenderAssets): RenderAssets {
  let complete = true;
  const big = (image: Bitmap | null): Bitmap | null => {
    if (!image) return null;
    const out = upscaleBitmap(image);
    if (!out) complete = false;
    return out;
  };
  const icons = (list: Array<Bitmap | null>): Array<Bitmap | null> => list.map(big);
  const balls = base.balls.map(sheet => {
    if (!sheet) return null;
    const out = upscaleSheet(sheet);
    if (out === sheet) complete = false;
    return out;
  });
  const ballShadow = big(base.ballShadow);
  const powers = { bomb: icons(base.powers.bomb), slow: icons(base.powers.slow), backwards: icons(base.powers.backwards), accuracy: icons(base.powers.accuracy) };
  const menubar = big(base.menubar);
  const font = (f: BitmapFont | null): BitmapFont | null => {
    if (!f) return null;
    const out = f.upscaled();
    if (out.pixelScale !== 2) complete = false;
    return out;
  };
  const fonts = base.fonts ? { title: font(base.fonts.title), text: font(base.fonts.text), float: font(base.fonts.float) } : null;
  if (!complete) return base;
  return { ...base, pixelScale: 2, balls, ballShadow, powers, menubar, fonts };
}

/** StatsValues fields → ids of the R2.0.12 STATS structure. */
const RESULT_IDS: Record<keyof StatsValues, string> = {
  points: 'result-points',
  combos: 'result-combo',
  coins: 'result-coins',
  gaps: 'result-gaps',
  chain: 'result-chain',
  comboMax: 'result-combo-max',
  time: 'result-time',
  objective: 'result-objective',
  bonus: 'result-expert',
  record: 'result-record',
};

/** Stored best time (seconds) or null when absent, unreadable or not a positive number (T-05-08). */
function readBestTime(key: string): number | null {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return null;
    const v = Number(raw);
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/** The original tips for the help view of the menu (`&cr;` kept, wrapped as a space), else the built-in ones. */
function menuTips(strings: Record<string, string> | null): string[] {
  const pool = strings ? TIP_KEYS.map(k => strings[k]).filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
  return pool.length > 0 ? pool : TIPS;
}

/** An original tip (strings.json, `&cr;` → space) when the kit is loaded, else one of the built-in tips. */
function pickTip(strings: Record<string, string> | null): string {
  const pool = strings ? TIP_KEYS.map(k => strings[k]).filter((t): t is string => typeof t === 'string' && t.length > 0) : [];
  const list = pool.length > 0 ? pool : TIPS;
  return list[Math.floor(Math.random() * list.length)].replace(/&cr;/g, ' ');
}

export { formatSeconds } from './statsdialog.js';

/**
 * Maps original level settings onto the engine configuration (README « Réglages originaux »).
 * Units: the original simulates at 100 Hz (1 maj = 10 ms); px/maj × 100 = px/s, maj × 0.6 = ticks.
 * `speed` px/maj → px/s; `start` % of the curve length → `startFraction`; `repeat` → `(repeat + 1) / 100`
 * (hypothesis A1: the pack's last duplicated attribute wins); `single` → `singleLimit` (repair
 * threshold, 10 = off); `slowfactor` / `slowspeed` (→ speed / slowspeed) → `endSlowFactor` of the
 * end-of-track slow zone (the SLOW power-up keeps `CANDIDATE.slowFactor`); `danger` / `slowdistance`
 * → px; `zumaback` / `zumaslow` (300 / 1100 maj by default) → ticks; `partime` (s) or, when absent,
 * `defaultParTime(score, curves)` (hypothesis A7); `score` → `target` and `coinPoints` =
 * max(500, 100 × ⌊score / 600⌋); `levelBonus` 10 000 per curve (hypothesis A3).
 * Every value is untrusted pack data (T-05-13): finite, bounded, defaulted.
 */
export function configFromSettings(settings: PackSettings | undefined, stage: number, curves = 1): Partial<EngineConfig> {
  const s: PackSettings = settings ?? { id: 'default' };
  const num = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) ? n : fallback;
  };
  const clamp = (v: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, v));
  /** 100 Hz steps × 0.6 → 60 Hz ticks; absent or non-finite → `fallback` steps, negative → 0. */
  const ticks = (v: unknown, fallback: number): number => {
    const steps = num(v, fallback);
    return steps > 0 ? Math.round(steps * 0.6) : 0;
  };
  const nonNeg = (v: unknown, fallback: number): number => {
    const n = Number(v);
    return Number.isFinite(n) && n >= 0 ? n : fallback;
  };
  const colors = num(s.colors, stage < 3 ? 4 : stage < 6 ? 5 : 6);
  const powerfreq = num(s.powerfreq, 3000);
  const speed = num(s.speed, 0.5); // px/maj
  const target = num(s.score, 1000);
  const slowspeed = num(s.slowspeed, 0);
  const partime = num(s.partime, 0);
  return {
    colors: clamp(Math.trunc(colors), 3, 6),
    startFraction: clamp(num(s.start, 40) / 100, 0, 1),
    total: Number.POSITIVE_INFINITY,
    target,
    repeatChance: clamp((num(s.repeat, 40) + 1) / 100, 0, 1),
    singleLimit: Math.trunc(clamp(num(s.single, 10), 0, 10)),
    speed: speed * 100,
    endSlowFactor: slowspeed > 0 ? Math.max(1, speed / slowspeed) : Math.max(1, num(s.slowfactor, 4)),
    dangerDistance: nonNeg(s.danger, 600),
    slowDistance: nonNeg(s.slowdistance, 500),
    projectileSpeed: (num(s.firespeed, 6) * 100) / 60,
    powerGuardTicks: Math.round(powerfreq * 0.3),
    powerChance: 1 / Math.max(60, powerfreq * 0.3),
    levelBonus: 10000,
    parTime: partime > 0 ? partime : defaultParTime(target, curves),
    coinPoints: Math.max(500, 100 * Math.floor(target / 600)),
    zumaBackTicks: ticks(s.zumaback, 300),
    zumaSlowTicks: ticks(s.zumaslow, 1100),
  };
}

/** Safe-area insets the body pads (CSS `env(safe-area-inset-*)` through `--safe-*`), in CSS px; 0 when unreadable. */
function safeInsets(): Insets {
  try {
    const cs = getComputedStyle(document.body);
    const px = (v: string): number => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
    return { top: px(cs.paddingTop), right: px(cs.paddingRight), bottom: px(cs.paddingBottom), left: px(cs.paddingLeft) };
  } catch {
    return { top: 0, right: 0, bottom: 0, left: 0 };
  }
}

/** The browser storage, or null when it cannot be reached (private mode, sandbox). */
function openStorage(): StorageLike | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage;
  } catch {
    return null;
  }
}

/** Resolves after `ms` (0 when negative or not finite). */
function bootDelay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, Number.isFinite(ms) ? Math.max(0, ms) : 0));
}

/** Local date « YYYY-MM-DD » of a high-score entry (the ISO day of the local clock). */
function localDate(now = new Date()): string {
  return new Date(now.getTime() - now.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
}

/**
 * D-12: the player's first name on the hosted build — `api/me` answers `{ name }` for the Access identity (private
 * table, never committed). Same origin, the Access cookie only. Any failure (no endpoint / 404, offline, not JSON,
 * abort) gives null, and so do the `file:` standalone and a loopback host without asking: the one-time name prompt
 * is used. The value is untrusted: only a string
 * goes on, sanitised by the state machine (sanitizeName) and drawn on the canvas only.
 */
function fetchPlatformName(): Promise<string | null> {
  try {
    if (typeof fetch !== 'function' || (location.protocol !== 'http:' && location.protocol !== 'https:')) return Promise.resolve(null);
    // A local server (npm run dev) has no identity endpoint: no request, no 404 in the console.
    if (['localhost', '127.0.0.1', '[::1]', '::1'].includes(location.hostname)) return Promise.resolve(null);
  } catch {
    return Promise.resolve(null);
  }
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = setTimeout(() => controller?.abort(), PLATFORM_NAME_ABORT);
  return fetch('api/me', { credentials: 'same-origin', cache: 'no-store', headers: { Accept: 'application/json' }, signal: controller?.signal })
    .then(async res => {
      if (!res.ok || !(res.headers.get('content-type') ?? '').includes('json')) return null;
      const data: unknown = await res.json();
      const name = typeof data === 'object' && data !== null ? (data as { name?: unknown }).name : undefined;
      return typeof name === 'string' ? name : null;
    })
    .catch(() => null)
    .finally(() => clearTimeout(timer));
}

/** Shows a fatal initialisation error in the boot overlay instead of leaving a black canvas. */
function reportBootError(error: unknown): void {
  const message = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  console.error('Zuma: échec du démarrage', error);
  const boot = document.getElementById('boot');
  const text = document.getElementById('boot-message');
  if (boot) boot.classList.remove('hidden');
  if (boot) boot.classList.add('error');
  if (text) text.textContent = `Échec du démarrage : ${message}`;
}

if (typeof document !== 'undefined' && document.getElementById('game')) {
  try {
    const game = new Game();
    game.start().catch(reportBootError);
    // `?debug=1` (T-05-10): read-only handle for review scripts, same trust model as `?level=`.
    try {
      if (new URLSearchParams(location.search).get('debug') === '1') (window as unknown as { __zuma?: unknown }).__zuma = { game };
    } catch { /* no location */ }
  } catch (error) {
    reportBootError(error);
  }
  // R2.0.20 (D-42, PWA-02): a new version waits for « Mettre à jour »; « Plus tard » hides the toast until the next launch.
  registerServiceWorker(registration => {
    const toast = document.getElementById('update-toast');
    if (!toast) return;
    toast.hidden = false;
    const apply = document.getElementById('update-apply');
    const later = document.getElementById('update-later');
    if (apply) apply.onclick = () => { apply.setAttribute('disabled', ''); applyUpdate(registration); };
    if (later) later.onclick = () => { toast.hidden = true; };
  });
}

export { LEVELS };
