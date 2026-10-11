/**
 * PWA plumbing (R2.0.20, plan 05-14, D-42 / D-38): service worker registration and confirmed updates, offline storage
 * status. Nothing runs at module load and nothing here touches the DOM, so the Node tests import the pure helpers.
 * Read-only towards the network: no request is sent from here besides the worker registration.
 */

/** A waiting worker is an update only when a controller already serves the page (the first install activates by itself). */
export function updateReady(hasController: boolean, state: string | null | undefined): boolean {
  return hasController && (state === 'installed' || state === 'waiting');
}

/**
 * Registers `./sw.js` (http(s) only: inert on `file://`, i.e. the standalone) and calls `onUpdateReady` when a new
 * version is installed and waiting. Checks again for an update when the page comes back to the foreground.
 */
export function registerServiceWorker(onUpdateReady: (registration: ServiceWorkerRegistration) => void): void {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator)) return;
    if (!/^https?:$/.test(location.protocol)) return;
    const container = navigator.serviceWorker;
    const watch = (registration: ServiceWorkerRegistration): void => {
      const check = (worker: ServiceWorker | null): void => {
        if (worker && updateReady(container.controller !== null, worker.state)) onUpdateReady(registration);
      };
      check(registration.waiting);
      registration.addEventListener('updatefound', () => {
        const worker = registration.installing;
        worker?.addEventListener('statechange', () => check(worker));
      });
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') registration.update().catch(() => undefined);
      });
    };
    const start = (): void => {
      container.register('./sw.js', { updateViaCache: 'none' }).then(watch).catch(() => undefined);
    };
    if (document.readyState === 'complete') start();
    else window.addEventListener('load', start, { once: true });
  } catch {
    /* no service worker: the game still runs online */
  }
}

/** « Mettre à jour »: the waiting worker takes over, then the page reloads once on the new version. */
export function applyUpdate(registration: ServiceWorkerRegistration): void {
  try {
    const waiting = registration.waiting;
    if (!waiting) {
      location.reload();
      return;
    }
    let reloaded = false;
    navigator.serviceWorker.addEventListener('controllerchange', () => {
      if (reloaded) return;
      reloaded = true;
      location.reload();
    });
    waiting.postMessage({ type: 'skip-waiting' });
  } catch {
    /* keep the current version */
  }
}

/** Persistent storage asked silently where the browser decides by itself (Firefox would prompt: only read there). */
export function shouldRequestPersist(userAgent: string): boolean {
  return !/Firefox\//.test(userAgent);
}

export interface OfflineStatus { persisted: boolean; bytes: number }

/**
 * Once the worker is ready: `navigator.storage.persist()` (D-38 §2, so the cached pack is not evicted) and the storage
 * used; null where unavailable (no worker, `file://`, no StorageManager).
 */
export async function offlineStatus(): Promise<OfflineStatus | null> {
  try {
    if (typeof navigator === 'undefined' || !('serviceWorker' in navigator) || !navigator.storage) return null;
    if (!/^https?:$/.test(location.protocol)) return null;
    await navigator.serviceWorker.ready;
    const storage = navigator.storage;
    const persisted = shouldRequestPersist(navigator.userAgent) && typeof storage.persist === 'function'
      ? await storage.persist()
      : typeof storage.persisted === 'function' ? await storage.persisted() : false;
    const estimate = typeof storage.estimate === 'function' ? await storage.estimate() : null;
    return { persisted, bytes: estimate?.usage ?? 0 };
  } catch {
    return null;
  }
}

/** « 6,1 Mo » (MiB, one decimal, French comma); « 0 Mo » for nothing or a non-finite value. */
export function formatSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return '0 Mo';
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} Mo`;
}

// ------------------------------------------------------------------ install guide (D-38 §1)

/** What the install card says: nothing once installed, the browser prompt, or the platform's manual steps. */
export type InstallGuidance = 'installed' | 'prompt' | 'ios-share' | 'mac-safari-dock' | 'none';

export interface InstallEnv {
  userAgent: string;
  maxTouchPoints: number;
  /** `navigator.standalone` (iOS home-screen app). */
  standalone: boolean;
  /** Matching `display-mode` media query: 'browser', 'standalone', 'fullscreen', 'minimal-ui'. */
  displayMode: string;
  /** A `beforeinstallprompt` event was received and kept. */
  promptAvailable: boolean;
}

/**
 * Pure platform rule: installed (standalone / fullscreen display mode or `navigator.standalone`) → nothing; a kept
 * `beforeinstallprompt` (Chromium, Edge, Android) → « Installer Zuma »; iPhone / iPod / iPad, and iPadOS which
 * announces a Mac but has several touch points → « Partager › Sur l'écran d'accueil »; Safari on macOS → « Fichier ›
 * Ajouter au Dock »; anything else → nothing.
 */
export function installGuidance(env: InstallEnv): InstallGuidance {
  if (env.standalone || env.displayMode === 'standalone' || env.displayMode === 'fullscreen') return 'installed';
  if (env.promptAvailable) return 'prompt';
  const ua = env.userAgent ?? '';
  const mac = /Macintosh/.test(ua);
  if (/iPhone|iPod|iPad/.test(ua) || (mac && env.maxTouchPoints > 1)) return 'ios-share';
  if (mac && /Version\/[\d.]+.*Safari\//.test(ua) && !/Chrome|Chromium|CriOS|Edg|Firefox|FxiOS|OPR/.test(ua)) return 'mac-safari-dock';
  return 'none';
}

/** The live environment for `installGuidance` (guarded: a missing API reads as « not installed »). */
export function readInstallEnv(promptAvailable: boolean): InstallEnv {
  const mode = (m: string): boolean => {
    try { return typeof matchMedia === 'function' && matchMedia(`(display-mode: ${m})`).matches; } catch { return false; }
  };
  const nav = typeof navigator === 'undefined' ? null : navigator as Navigator & { standalone?: boolean };
  return {
    userAgent: nav?.userAgent ?? '',
    maxTouchPoints: nav?.maxTouchPoints ?? 0,
    standalone: nav?.standalone === true,
    displayMode: mode('fullscreen') ? 'fullscreen' : mode('standalone') ? 'standalone' : mode('minimal-ui') ? 'minimal-ui' : 'browser',
    promptAvailable,
  };
}

// ------------------------------------------------------------------ iPhone / iPad (D-38 §3, §5)

export interface ScreenShape { width: number; height: number; coarse: boolean; shortSide: number }

/** A phone held in portrait (coarse pointer, short screen side under 600 px): « Tournez votre appareil ». Tablets get bands. */
export function needsRotation(s: ScreenShape): boolean {
  if (![s.width, s.height, s.shortSide].every(Number.isFinite)) return false;
  return s.height > s.width && s.coarse && s.shortSide < 600;
}

export interface Insets { top: number; right: number; bottom: number; left: number }

/** Room left for the 4:3 stage inside the safe-area insets (unusable inset → 0), never negative. */
export function fitArea(innerW: number, innerH: number, insets: Insets): { w: number; h: number } {
  const v = (n: number): number => (Number.isFinite(n) && n > 0 ? n : 0);
  return { w: Math.max(0, innerW - v(insets.left) - v(insets.right)), h: Math.max(0, innerH - v(insets.top) - v(insets.bottom)) };
}
