# Codebase Structure

**Analysis Date:** 2026-10-10

## Directory Layout

```
zuma/
├── src/                # TypeScript applicatif (compilé vers .compiled/)
│   ├── core.ts         # moteur de simulation
│   ├── feedback.ts     # règles de présentation (sons, explosions, particules)
│   ├── levels.ts       # niveaux procéduraux (repli sans pack)
│   ├── original.ts     # chargeur du pack privé, composition alpha, feuilles
│   ├── render.ts       # rendu canvas + HUD
│   ├── audio.ts        # dispatch sonore (originaux ou synthèse)
│   └── main.ts         # cycle de jeu, entrées, panneaux, PWA
├── public/             # shell statique : style.css, manifest, icon.svg, sw.js
├── index.html          # page unique (canvas + overlays menu/STATS)
├── tools/              # build.mjs, serve.mjs, guard.mjs, import-original.mjs, extract_installer.py
├── tests/              # r206, r211 (historiques), r213 (suite R2.0.13)
├── .github/workflows/  # CI
├── .planning/          # artefacts GSD
├── .claude/            # installation GSD locale (commandes, agents, hooks)
├── private_assets/     # (ignoré) original/ et pack/
├── dist/, .compiled/, standalone/   # (ignorés) sorties de build
└── R2*_RELEASE_NOTES.md, README.md
```

## Key Locations

- Règles de jeu : `src/core.ts` (`moveChain`, `land`, `destroyRun`, `blast`)
- Constantes : `CANDIDATE` dans `src/core.ts` ; conversion des réglages originaux : `configFromSettings` dans `src/main.ts`
- Positions HUD originales : `ORIGINAL_BUTTONS` et `drawHud` dans `src/render.ts`
- Mapping sons originaux : `SOUND_MAP` dans `tools/import-original.mjs`
- Décodeur de courbes : `parseCurve` dans `tools/import-original.mjs`

## Naming Conventions

- Fichiers : minuscules, un module par responsabilité
- Tests : `r<version>.test.mjs`, un fichier par baseline
- Clés d'assets du pack : noms originaux en minuscules (`baballblue`, `_ballalpha`)
- Clés sonores : celles de `feedback.ts` (`destroy1..5`, `powerbomb`, …)

## Generated vs source

- `.compiled/`, `dist/`, `standalone/` sont régénérés par `tools/build.mjs` ; ne jamais les éditer
- `CLAUDE.md` sections GSD régénérées par `gsd-sdk query generate-claude-md`

---

*Structure analysis: 2026-10-10*
