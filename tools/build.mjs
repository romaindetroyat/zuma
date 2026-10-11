#!/usr/bin/env node
/**
 * Build pipeline.
 *   node tools/build.mjs              → compile TypeScript to .compiled/ and assemble dist/
 *   node tools/build.mjs --local      → also bundle private_assets/pack into dist/assets/
 *   node tools/build.mjs --standalone → additionally emit standalone/zuma-standalone.html
 *   node tools/build.mjs --deploy     → --local, refused without the pack, plus dist/version.json: the PWA artefact,
 *                                       i.e. exactly the local game (R2.0.20, D-42). It embeds the original assets: it
 *                                       is hosted privately only, never published by this repository or its CI (this
 *                                       tool deploys nothing; private hosting is planned separately).
 *
 * dist/sw.js is generated from public/sw.js (tools/swgen.mjs): build stamp, shell list (MODULES + the files of
 * dist/public) and the list / fingerprint of dist/assets.
 *
 * dist/, .compiled/, standalone/ and private_assets/ are ignored by Git.
 */
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { deployError, packFiles, packHash, swSource } from './swgen.mjs';
import { ICONS, encodePng, renderIcon } from './icons.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = new Set(process.argv.slice(2));
const deploy = args.has('--deploy');
const local = args.has('--local') || args.has('--standalone') || deploy;
const standalone = args.has('--standalone');
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'));
const build = `${pkg.version}+${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}`;

if (deploy) {
  const refusal = deployError(path.join(root, 'private_assets', 'pack'));
  if (refusal) {
    console.error(refusal);
    process.exit(1);
  }
}

const compiled = path.join(root, '.compiled');
const dist = path.join(root, 'dist');

fs.rmSync(compiled, { recursive: true, force: true });
execFileSync(process.execPath, [path.join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', path.join(root, 'tsconfig.json')], { stdio: 'inherit' });

fs.rmSync(dist, { recursive: true, force: true });
fs.mkdirSync(path.join(dist, 'js'), { recursive: true });
fs.mkdirSync(path.join(dist, 'public'), { recursive: true });

const MODULES = ['core', 'feedback', 'levels', 'audio', 'upscale', 'original', 'pwa', 'bitmapfont', 'statsdialog', 'render', 'menudialog', 'progress', 'welcome', 'adventure', 'main'];
for (const name of MODULES) {
  const src = fs.readFileSync(path.join(compiled, `${name}.js`), 'utf8').replace(/__BUILD__/g, JSON.stringify(build));
  fs.writeFileSync(path.join(dist, 'js', `${name}.js`), src);
}
fs.copyFileSync(path.join(root, 'index.html'), path.join(dist, 'index.html'));
for (const f of fs.readdirSync(path.join(root, 'public'))) {
  if (f === 'sw.js') continue;
  fs.copyFileSync(path.join(root, 'public', f), path.join(dist, 'public', f));
}
// R2.0.20 (D-38 §3): PNG icons (192 / 512 « any », 512 maskable, 180 apple-touch-icon) generated, never committed.
for (const icon of ICONS) fs.writeFileSync(path.join(dist, 'public', icon.file), encodePng(icon.size, icon.size, renderIcon(icon.size, icon.options)));

let packed = false;
if (local) {
  const pack = path.join(root, 'private_assets', 'pack');
  if (fs.existsSync(path.join(pack, 'pack.json'))) {
    fs.cpSync(pack, path.join(dist, 'assets'), { recursive: true });
    packed = true;
  } else {
    console.warn('--local: no private_assets/pack found (run tools/import-original.mjs); building without original assets');
  }
}

// Service worker: the shell of this build (never a URL missing from dist/, or addAll fails) and the whole pack.
const shell = ['./', './index.html', ...packFiles(path.join(dist, 'public')).map(f => `./public/${f}`), ...MODULES.map(m => `./js/${m}.js`)];
const assets = packed ? packFiles(path.join(dist, 'assets')) : [];
const assetsHash = packed ? packHash(path.join(dist, 'assets')) : null;
fs.writeFileSync(path.join(dist, 'sw.js'), swSource(fs.readFileSync(path.join(root, 'public', 'sw.js'), 'utf8'), { build, shell, assets, assetsHash }));

if (deploy) {
  fs.writeFileSync(path.join(dist, 'version.json'), JSON.stringify({ version: pkg.version, build, assetsHash, assets: assets.length }, null, 2) + '\n');
  const files = packFiles(dist);
  const bytes = files.reduce((n, f) => n + fs.statSync(path.join(dist, ...f.split('/'))).size, 0);
  console.log(`artefact de déploiement : dist/ (${files.length} fichiers, ${(bytes / 1024 / 1024).toFixed(1)} Mio, empreinte du pack ${assetsHash}) — à héberger uniquement en privé`);
}

if (standalone) {
  // Single-file build: modules are concatenated in dependency order with their
  // import/export statements stripped, styles inlined, assets referenced as data URLs.
  // `export { a } from './x.js';` re-exports must go too: a surviving `from` clause makes the single file fetch a module at runtime (R2.0.15).
  const strip = s => s.replace(/^import[^\n]*\n/gm, '').replace(/^export (?=(const|let|function|class|async function))/gm, '').replace(/^export \{[^}]*\}[^\n]*\n/gm, '');
  const js = MODULES.map(m => strip(fs.readFileSync(path.join(dist, 'js', `${m}.js`), 'utf8'))).join('\n');
  const css = fs.readFileSync(path.join(dist, 'public', 'style.css'), 'utf8');
  let html = fs.readFileSync(path.join(dist, 'index.html'), 'utf8')
    .replace(/<link rel="stylesheet"[^>]*>/, `<style>\n${css}\n</style>`)
    .replace(/<link rel="manifest"[^>]*>\n?/, '')
    .replace(/<link rel="apple-touch-icon"[^>]*>\n?/, '')
    .replace(/<link rel="icon"[^>]*image\/png"[^>]*>\n?/, '')
    .replace(/<script type="module" src="js\/main.js"><\/script>/, `<script type="module">\n${js}\n</script>`);
  if (packed) {
    const assets = {};
    const walk = dir => {
      for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, f.name);
        if (f.isDirectory()) walk(p);
        else assets[path.relative(path.join(dist, 'assets'), p).split(path.sep).join('/')] = p;
      }
    };
    walk(path.join(dist, 'assets'));
    const mime = { '.json': 'application/json', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.png': 'image/png', '.ogg': 'audio/ogg', '.m4a': 'audio/mp4', '.mo3': 'application/octet-stream', '.txt': 'text/plain;charset=utf-8' };
    const inline = Object.fromEntries(Object.entries(assets).map(([k, p]) => [k, `data:${mime[path.extname(p)] ?? 'application/octet-stream'};base64,${fs.readFileSync(p).toString('base64')}`]));
    // src/original.ts resolves every asset path through window.__ZUMA_ASSETS__ when present.
    html = html.replace('<script type="module">', `<script>\nwindow.__ZUMA_ASSETS__=${JSON.stringify(inline)};\n</script>\n<script type="module">`);
  }
  fs.mkdirSync(path.join(root, 'standalone'), { recursive: true });
  fs.writeFileSync(path.join(root, 'standalone', 'zuma-standalone.html'), html);
  console.log(`standalone written to standalone/zuma-standalone.html (${(Buffer.byteLength(html) / 1024 / 1024).toFixed(1)} MiB)`);
}

console.log(`build ${build} → dist/${packed ? ' (with original assets)' : ''}`);
