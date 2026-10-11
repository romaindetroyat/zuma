/**
 * Service worker generation (R2.0.20, plan 05-14, D-42). Pure helpers, no dependency: tools/build.mjs fills
 * public/sw.js (the template) with the build stamp, the shell list and the list / fingerprint of the pack copied into
 * dist/assets/; the tests call them on temporary folders without running a build.
 */
import { createHash } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

/** Every file under `dir`, relative, `/`-separated, sorted; [] when the folder does not exist. */
export function packFiles(dir) {
  const out = [];
  const walk = (d, rel) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const r = rel ? `${rel}/${e.name}` : e.name;
      if (e.isDirectory()) walk(path.join(d, e.name), r);
      else if (e.isFile()) out.push(r);
    }
  };
  if (fs.existsSync(dir) && fs.statSync(dir).isDirectory()) walk(dir, '');
  return out.sort();
}

/**
 * Fingerprint of a pack folder: the first 12 hex digits of a sha256 over (path, size, content) of every file in
 * `packFiles` order; null without files. Same pack → same `zuma-assets-<hash>` cache from one code version to the next.
 */
export function packHash(dir) {
  const files = packFiles(dir);
  if (files.length === 0) return null;
  const h = createHash('sha256');
  for (const f of files) {
    const data = fs.readFileSync(path.join(dir, ...f.split('/')));
    h.update(`${f}\0${data.length}\0`);
    h.update(data);
    h.update('\0');
  }
  return h.digest('hex').slice(0, 12);
}

/** French refusal of `--deploy` when `packDir` has no pack.json (the artefact is the exact local game), else null. */
export function deployError(packDir) {
  if (fs.existsSync(path.join(packDir, 'pack.json'))) return null;
  return `--deploy : pack original introuvable (${path.join(packDir, 'pack.json')}). Lancez d'abord « npm run import » : l'artefact de déploiement est le jeu complet avec ses ressources originales.`;
}

/**
 * Fills the template: `__BUILD__` → build stamp, `__ASSETS_HASH__` → pack fingerprint (`none` without pack),
 * the `SHELL` array → `shell` (when given), `[/* __ASSETS__ *\/]` → the sorted `./assets/<path>` list.
 */
export function swSource(template, { build, shell, assets = [], assetsHash = null }) {
  let src = template.replace(/__BUILD__/g, String(build)).replace(/__ASSETS_HASH__/g, assetsHash ?? 'none');
  if (shell) src = src.replace(/const SHELL = \[[\s\S]*?\];/, `const SHELL = ${JSON.stringify(shell)};`);
  const list = [...assets].sort().map(p => `./assets/${p}`);
  src = src.replace(/const ASSETS = \[\/\* __ASSETS__ \*\/\];/, `const ASSETS = ${JSON.stringify(list)};`);
  return src;
}
