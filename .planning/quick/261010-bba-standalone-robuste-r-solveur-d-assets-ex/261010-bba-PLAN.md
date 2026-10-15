---
phase: quick-261010-bba
plan: 01
type: execute
wave: 1
depends_on: []
files_modified: [src/original.ts, src/audio.ts, src/main.ts, index.html, public/style.css, tools/build.mjs, tests/r213.test.mjs]
autonomous: true
requirements: [PWA-01]
must_haves:
  truths:
    - "Le standalone ouvert dans un navigateur avec JavaScript lance le jeu et masque l'écran de chargement"
    - "Sans JavaScript (aperçu de fichier), la page affiche un message lisible au lieu d'un canvas noir"
    - "Si l'initialisation échoue, le message d'erreur est affiché à l'écran et en console"
  artifacts:
    - path: src/original.ts
      provides: "assetUrl() résolveur unique (window.__ZUMA_ASSETS__ ou base + chemin)"
    - path: tools/build.mjs
      provides: "injection de window.__ZUMA_ASSETS__ sans monkeypatch de fetch/Image"
  key_links:
    - from: src/audio.ts
      to: src/original.ts
      via: "import assetUrl"
---

<objective>
Rendre le build standalone (`tools/build.mjs --standalone`) robuste et auto-explicatif : l'utilisateur ne voit qu'un écran noir alors que Chromium headless l'affiche. Supprimer le monkeypatching de `fetch` et `HTMLImageElement.prototype.src` au profit d'un résolveur d'URL explicite, afficher un état de chargement HTML visible sans JavaScript, et remonter les erreurs d'initialisation à l'écran.
</objective>

<context>
@.planning/STATE.md
@CLAUDE.md
@tools/build.mjs
@src/original.ts
@src/audio.ts
@src/main.ts
@index.html
</context>

<tasks>

<task type="auto">
  <name>Task 1: Résolveur d'assets explicite</name>
  <files>src/original.ts, src/audio.ts, tools/build.mjs</files>
  <action>
    Ajouter dans `src/original.ts` une fonction exportée `assetUrl(path, base = 'assets/')` qui renvoie `window.__ZUMA_ASSETS__[path]` quand la carte existe et contient le chemin, sinon `base + path` ; déclarer le global `__ZUMA_ASSETS__` (Record string→string, optionnel). Faire passer `OriginalPack.load`, le chargement des courbes et `image()` par `assetUrl`. Faire de même dans `src/audio.ts` pour `manifest.json` et les `.ogg`. Dans `tools/build.mjs`, le bloc standalone n'injecte plus que `window.__ZUMA_ASSETS__ = {...}` (clés relatives à `assets/`) et ne touche plus à `fetch` ni à `HTMLImageElement`.
  </action>
  <verify>`npm run check` passe ; `grep -c 'HTMLImageElement' tools/build.mjs` renvoie 0.</verify>
  <done>Toutes les URL d'assets passent par `assetUrl` ; le standalone n'a plus de monkeypatch.</done>
</task>

<task type="auto">
  <name>Task 2: Écran de chargement et remontée d'erreur</name>
  <files>index.html, public/style.css, src/main.ts</files>
  <action>
    Ajouter dans `index.html` un bloc `#boot` (texte « Chargement… » + consigne « ouvrez ce fichier dans un navigateur avec JavaScript activé ») visible par défaut au-dessus du canvas ; styles dans `public/style.css` avant le marqueur `R2.0.11` (pas de `url(`). Dans `src/main.ts`, `Game.start()` masque `#boot` juste avant de lancer la boucle, et l'entrée du module entoure `start()` d'un `catch` qui écrit le message d'erreur dans `#boot` (classe `error`) et le journalise.
  </action>
  <verify>Playwright : avec JavaScript désactivé, le texte « Chargement… » est visible ; avec JavaScript, `#boot` est masqué et le badge de build est renseigné.</verify>
  <done>Plus d'écran noir muet : soit le jeu, soit un message explicite.</done>
</task>

<task type="auto">
  <name>Task 3: Verrou de test et régénération</name>
  <files>tests/r213.test.mjs</files>
  <action>
    Étendre le test du shell PWA : `dist/index.html` contient `id="boot"`, `dist/js/main.js` référence `boot`, `tools/build.mjs` ne contient plus `HTMLImageElement`. Lancer `npm test`, `node tools/build.mjs --standalone`, puis le contrôle Playwright sur `file:///home/user/zuma/standalone/zuma-standalone.html` (badge affiché, aucune erreur console).
  </action>
  <verify>`npm test` vert ; capture Playwright du standalone identique au rendu servi.</verify>
  <done>Standalone régénéré et vérifié.</done>
</task>

</tasks>

<verification>
- `npm test` (31+ tests, garde-fou)
- `node tools/build.mjs --standalone` puis script Playwright file:// (JS activé / désactivé)
</verification>

<success_criteria>
- Aucune référence à `window.fetch =` ni `HTMLImageElement.prototype` dans `tools/build.mjs`
- `#boot` visible sans JS, masqué une fois le jeu lancé, affiche l'erreur en cas d'échec
</success_criteria>

<output>
After completion, create `.planning/quick/261010-bba-standalone-robuste-r-solveur-d-assets-ex/261010-bba-SUMMARY.md`
</output>
