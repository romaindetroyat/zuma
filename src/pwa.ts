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
