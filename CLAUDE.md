<!-- GSD:project-start source:PROJECT.md -->
## Project

**Zuma PWA**

Reconstruction web/PWA de Zuma Deluxe (PopCap) : le joueur, grenouille au centre du plateau, tire des billes colorées dans une chaîne qui roule vers un crâne et détruit des groupes de trois ou plus. Le dépôt public contient le moteur, le rendu et les outils ; les ressources originales (niveaux, sprites, sons) sont importées localement depuis la copie légale de l'utilisateur et ne sont jamais publiées.

**Core Value:** Retrouver les sensations du Zuma original dans un navigateur : même géométrie de niveaux, mêmes règles de chaîne (insertion, attraction, enchaînements, power-ups), même lecture visuelle et sonore.

### Constraints

- **Légal**: aucune ressource originale commitée ou publiée — `npm run guard` et la CI bloquent ; le pack vit dans `private_assets/`
- **Tech stack**: TypeScript strict, zéro dépendance runtime, canvas 2D, Node 22 pour l'outillage — garder le projet léger et auditable
- **Compatibilité**: 640×480 natif mis à l'échelle, souris + tactile, fonctionnement hors ligne
- **Qualité**: toute règle de jeu modifiée est verrouillée par un test dans `tests/`
<!-- GSD:project-end -->

<!-- GSD:stack-start source:codebase/STACK.md -->
## Technology Stack

## Languages
- TypeScript 5.8 (strict, `noUnusedLocals`/`noUnusedParameters`) - tout le code applicatif dans `src/`
- JavaScript ESM (`.mjs`) - outils de build (`tools/`) et tests (`tests/`)
- Python 3 - `tools/extract_installer.py` (extraction du CAB de l'installeur original)
## Runtime
- Navigateur moderne (Canvas 2D, ES modules, WebAudio, Service Worker) - cible PWA 640×480 mise à l'échelle
- Node.js ≥ 22 - build, tests, serveur local
- npm 10.x - lockfile `package-lock.json` présent
## Frameworks
- Aucun framework UI : canvas natif + DOM minimal pour les panneaux (menu, STATS)
- `node:test` + `node:assert/strict` - tests de non-régression sur le code compilé dans `.compiled/`
- Playwright (hors dépôt, installation globale) - captures d'écran manuelles de validation
- `tsc` (TypeScript compiler) - émission ES2022 vers `.compiled/`
- `tools/build.mjs` - assemblage de `dist/` (copie modules + shell), `--local` (pack privé), `--standalone` (fichier unique avec data URLs)
- `tools/serve.mjs` - serveur statique sans dépendance
## Key Dependencies
- `typescript` 5.8.3 (devDependency) - seule dépendance npm
- Aucune dépendance runtime
## Configuration
- Aucune variable d'environnement requise ; `PORT` optionnel pour `tools/serve.mjs`
- `tsconfig.json` (ES2022, moduleResolution Bundler, rootDir `src`, outDir `.compiled`)
- `package.json` scripts : `build`, `test`, `dev`, `check`, `standalone`, `guard`, `import`
## Platform Requirements
- Node 22+, npm ; Python 3 + `libarchive-c` (ou `cabextract`/`7z`) uniquement pour extraire l'installeur original
- Hébergement statique (dist/) servi en HTTPS pour le service worker ; ou fichier standalone ouvert localement
<!-- GSD:stack-end -->

<!-- GSD:conventions-start source:CONVENTIONS.md -->
## Conventions

## Code Style
- TypeScript strict, imports ESM avec extension `.js` (`import ... from './core.js'`)
- Types explicites sur les API publiques ; `readonly` pour les dépendances injectées
- Pas de framework, pas de dépendance runtime : préférer les API navigateur natives
- Commentaires JSDoc courts sur les modules et les règles non évidentes ; langue des commentaires : anglais dans le code, français dans la documentation et l'interface
## Naming
- Classes `PascalCase`, fonctions/variables `camelCase`, constantes de configuration `SCREAMING_CASE` (`CANDIDATE`, `WIDTH`)
- Événements du moteur : `kind` en kebab-case (`power-activate`)
- Paramètres volontairement inutilisés préfixés `_` (`_pos`)
## Patterns
- Moteur sans DOM ; toute interaction via `command()` et `drainEvents()`
- Tout ce qui est aléatoire dans la simulation passe par `engine.rng` ; la présentation utilise des générateurs dérivés (`makeColorBurst`)
- Chargement d'assets : renvoyer `null` et prévoir un repli, jamais lever
- Nouvelles règles de jeu = nouveau test dans `tests/r<version>.test.mjs` + ligne dans les notes de version
## Error Handling
- try/catch autour de `localStorage`, `fetch` du pack, `AudioContext`
- Les outils CLI sortent avec code 1 et message explicite
## Commits & versions
- Baseline = `ENGINE_VERSION` (src/core.ts) == `package.json` version (test `r213`)
- Chaque baseline a `R<xyz>_RELEASE_NOTES.md`
- Ne jamais commiter de média/exécutable/pack issu du jeu original : `npm run guard` et la CI le vérifient
## Localisation
- Interface et textes de jeu en français (alignés sur les chaînes originales : « Balle RALENTIR », « BONUS SAUT », « ENCHAÎNEMENT »)
<!-- GSD:conventions-end -->

<!-- GSD:architecture-start source:ARCHITECTURE.md -->
## Architecture

## Pattern Overview
- `ZumaEngine` (src/core.ts) ne touche jamais au DOM ; il consomme des commandes et émet des événements
- La présentation (`render.ts`, `audio.ts`, `main.ts`) draine `engine.drainEvents()` à chaque tick et traduit en sons/particules/textes via `feedback.ts`
- Deux sources de niveaux interchangeables : pack original (`original.ts`) ou procédural (`levels.ts`)
## Layers
- Purpose: règles du jeu, physique de chaîne, power-ups, score, états de fin
- Contains: `SeededRandom`, `Track`, `Chain`, `ZumaEngine`, `CANDIDATE` (config), types `Ball`/`Projectile`/`Removal`/`GameEvent`
- Depends on: rien
- Used by: tests, `main.ts`, `render.ts`
- Purpose: règles de présentation déterministes (sons par événement, trames d'explosion, particules)
- Depends on: `core.ts` (`SeededRandom`, `GameEvent`)
- Purpose: chargement du pack privé, composition masque alpha PopCap (`_name.gif`), feuilles de sprites, sons
- Depends on: `core.ts` (`Track`, `Point`), `feedback.ts` (`SoundCue`)
- Purpose: dessin canvas 640×480 (fond, trous, chaînes, projectiles, découpes, grenouille, effets, HUD) en mode sprites ou vectoriel
- Depends on: `core.ts`, `feedback.ts`, `original.ts` (types)
- Purpose: cycle de vie (nouvelle partie, niveau suivant, réessai), boucle rAF à accumulateur, entrées, panneaux DOM, mapping des réglages originaux (`configFromSettings`), enregistrement du service worker
## Data Flow
- Pack présent : `stages[stage].levels[i]` + `settings` → `configFromSettings` → `ZumaEngine(tracks[], frog, config, seed)`
- Sinon : `levelFor(index)` → `new Track(def.track)`
## Key Abstractions
## Entry Points
- `index.html` → `js/main.js` (module) → `new Game().start()`
- Tests : `tests/*.test.mjs` importent `.compiled/*.js`
- Outils : `tools/build.mjs`, `tools/import-original.mjs`, `tools/guard.mjs`, `tools/serve.mjs`
## Error Handling
- Chargements d'assets tolérants (retour `null`, repli procédural/synthèse)
- `localStorage` et `AudioContext` protégés
- Le moteur lève uniquement sur usage incorrect (piste vide, index de fixture invalide)
## Cross-Cutting Concerns
<!-- GSD:architecture-end -->

<!-- GSD:skills-start source:skills/ -->
## Project Skills

No project skills found. Add skills to any of: `.claude/skills/`, `.agents/skills/`, `.cursor/skills/`, `.github/skills/`, or `.codex/skills/` with a `SKILL.md` index file.
<!-- GSD:skills-end -->

<!-- GSD:workflow-start source:GSD defaults -->
## GSD Workflow Enforcement

Before using Edit, Write, or other file-changing tools, start work through a GSD command so planning artifacts and execution context stay in sync.

Use these entry points:
- `/gsd-quick` for small fixes, doc updates, and ad-hoc tasks
- `/gsd-debug` for investigation and bug fixing
- `/gsd-execute-phase` for planned phase work

Do not make direct repo edits outside a GSD workflow unless the user explicitly asks to bypass it.
<!-- GSD:workflow-end -->



<!-- GSD:profile-start -->
## Developer Profile

> Profile not yet configured. Run `/gsd-profile-user` to generate your developer profile.
> This section is managed by `generate-claude-profile` -- do not edit manually.
<!-- GSD:profile-end -->
