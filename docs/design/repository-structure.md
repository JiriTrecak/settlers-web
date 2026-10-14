# Repository structure

Status: proposal, 2026-10-14. Companion to the [native renderer](native-renderer.md) proposal. The restructure happens in one pass, before the Rust work starts, and targets the end state rather than the current TypeScript layout.

## 1. Current structure and its problems

### 1.1 Repository size

- `.git` is **7.3 GB** (7.0 GB packed). There is no Git LFS.
- Tracked binaries: `art/` about **5.9 GB**, `assets/` about **1.9 GB**. Code is small by comparison: `src/` 3.5 MB, `tests/` 3.2 MB.
- Each unit has a 35–56 MB `source.blend`. Every saved change adds the full file to history.
- `assets/library/` holds a published copy of all 317 asset folders in `art/assets/`, so every publish commits each runtime binary a second time.

This is the largest structural problem: clone, fetch and push times grow with every art iteration, and agents working in fresh checkouts pay for it.

### 1.2 Names

Three product identities coexist: `settlers` (npm package, bundle id `com.jiritrecak.settlers`, the folder name, the match-host service), **Under the Canopy** (the game) and **Forest Empire Tools** (`com.jiritrecak.forest-empire.tools`). `.gitignore` still carries Settlers III rules (`/original/`, `assets/graphics/*`, `Settlers.app`).

### 1.3 Editors are spread across the repository

| Editor | Where its code lives today |
|---|---|
| Map editor | `src/editor/`, `src/app/game/editorScreen.ts` (inside the game), `src/shared/authoring/`, `src/shared/control/`, `mcp/editor/`, `src/editor/import/warcraft/`, `content/import/warcraft/` |
| Asset workbench | `tooling/src/asset-editor/`, `tooling/asset-studio/`, `tooling/src-tauri/` (shared "Forest Empire Tools" app), `scripts/assets/` (14 files), `experiments/building-studio/` (the production Blender pipeline, in Python), `art/profiles/` |
| Spell editor | `tooling/spell-editor/` (own Vite config, its own nested `agent-app` with `node_modules`), `mcp/spells/`, `tooling/content/`, `tooling/scripting/` |

The map editor ships inside the game. The asset workbench and spell editor share a "tools" Tauri shell.

### 1.4 Editors cannot be distributed

Editor services run as Vite dev-server plugins (`tooling/asset-studio/server/plugin.ts`, `tooling/spell-editor/server/plugin.ts`); the map editor's definition editing also "requires the development server". A packaged editor has no backend to save, validate or publish with.

### 1.5 Module boundaries

- `src/shared/` (119 files) is a grab bag. It mixes cross-cutting contracts (map format, network protocol, save envelope, match config) with editor-only authoring (procedural layers, history, scene commands) and presentation data (environment, landscape, atmosphere).
- The game depends on editor code: `src/app/game/GameApp.ts` imports from `src/editor/`. The simulation imports `src/shared/authoring` (`src/sim/game/spatial.ts`, `src/sim/ai/briefing.ts`), as do about 20 render files.
- Tools reach deep into the game: `tooling/` and `mcp/` import `src/content` (about 50 imports), `src/shared` (about 55), `src/render` (20) and `src/sim` (12) through `../../../src/` paths.
- Data contracts are defined only in TypeScript and Zod. Once the engine is Rust, the formats need one cross-language source of truth.

### 1.6 Content layout

- `content/game.json` is a 183 KB monolith with 128 definitions, behaviour sets, actions and rules. Abilities and effects, by contrast, are already one folder per item.
- `content/import/warcraft/` is importer configuration, not game content.
- `assets/authoring/published.json` (the publication registry) and `assets/maps/` live in the runtime assets folder.

### 1.7 Everything else

- One root `package.json` holds every dependency: game, editors, AI SDKs (`@mastra/core`, `@ai-sdk/openai`, `eve`), Tauri, three, VitePress.
- The repository root holds four HTML entry pages (`index.html`, `combat-lab.html`, `reference-stage.html`, `vegetation-gallery.html`), plus `components.json`, a tracked `output/`, and the `experiments/building-studio/` review page.
- `scripts/` has 157 files. `scripts/bench/` alone has 75 entries, many of them one-off probes.
- `wiki/` (the VitePress site) sits apart from `docs/` and `scripts/wiki/`.
- `tests/` mirrors the source tree separately (506 files).
- Module notes drift. For example, `src/render/index.md` still describes "cubes from players".

### 1.8 Release risk outside the code

The map editor contains a third-party map importer (`src/editor/import/warcraft/`). Confirm the provenance and naming of the shipped skirmish maps (Echo Isles, Turtle Rock), their imported terrain textures, and ability names such as Holy Light before a commercial Steam release.

## 2. Principles

1. **One app, one folder.** Each shipped program — the game, every editor, the match server — owns its folder: UI, native host, packaging config, MCP server, its own tests and its documentation.
2. **Libraries don't depend on apps.** Apps depend on libraries; editors never import from the game app, and the game never imports editor code.
3. **One source of truth per data format**, defined in Rust (`serde`), with JSON Schema and TypeScript types generated for editors.
4. **Source in Git, binaries in LFS, build output nowhere.** Editable art goes in Git LFS. Cooked runtime assets are produced by the build and never committed. The publication registry stays tracked.
5. **Tests live with the code they test.** In Rust that means unit tests inline and integration tests in each crate's `tests/`; TypeScript packages get their own test folders.
6. **No disposable files in tracked folders.** Experiments, captures and probes go to ignored `tmp/` or are deleted.

## 3. Target layout

```
canopy/
├─ Cargo.toml                 Rust workspace
├─ package.json               npm workspaces (editors, packages, docs)
├─ crates/                    engine and game libraries (Rust)
│  ├─ content/                data model, validation, schema generation (source of truth)
│  ├─ sim/                    deterministic simulation; no I/O, no rendering
│  ├─ net/                    lockstep protocol and client
│  ├─ assets/                 runtime asset format and loader
│  ├─ cook/                   offline asset cooker (library + CLI)
│  ├─ render/                 wgpu renderer
│  ├─ scene/                  snapshot → render world
│  ├─ ui/                     game UI toolkit
│  ├─ audio/
│  ├─ platform/               window, input, Steam, settings
│  └─ web/                    wasm facade for editor viewports
├─ game/                      the game binary: wiring, packaging, Steam config, icons
├─ server/                    match host
├─ editors/
│  ├─ shared/                 editor shell UI, viewport component, project services, shared Tauri plugin
│  ├─ map/                    app/ (React UI), src-tauri/, mcp/, importers/
│  ├─ assets/                 app/, src-tauri/, mcp/, pipeline/ (Blender adapters, Python)
│  └─ spells/                 app/, src-tauri/, mcp/, agent/
├─ packages/                  TypeScript libraries for editors and docs
│  ├─ formats/                types generated from crates/content
│  └─ web-engine/             the current TypeScript game engine, kept as reference and editor viewport until replaced
├─ content/                   gameplay data, one file per definition
│  ├─ rules.json  races/  units/  buildings/  items/  abilities/  effects/  camps/
│  └─ assets.json             publication registry (from assets/authoring/published.json)
├─ maps/                      authored .utcmap files and generated previews
├─ art/                       editable sources (Git LFS)
├─ docs/                      documentation and the wiki site
├─ tools/                     repository CLIs: release, bench, docs check, map previews
├─ infrastructure/            deployment, Nginx, systemd
└─ releases/
```

### Where today's code goes

| Today | Target |
|---|---|
| `src/sim`, `src/session`, `src/net`, `src/content`, `src/render`, `src/presentation`, `src/ui`, `src/app` | `packages/web-engine/` now; replaced by `crates/*` and `game/` |
| `src/editor`, `src/shared/authoring`, `src/shared/control`, `src/app/game/editorScreen.ts`, `mcp/editor` | `editors/map/` |
| `src/editor/import/warcraft`, `content/import/warcraft` | `editors/map/importers/warcraft/` (or removed; see §1.8) |
| `tooling/src/asset-editor`, `tooling/asset-studio`, `scripts/assets`, `experiments/building-studio`, `art/profiles` | `editors/assets/` |
| `tooling/spell-editor`, `mcp/spells`, `tooling/content`, `tooling/scripting` | `editors/spells/` |
| `tooling/src-tauri`, `tooling/src/app` (shared tools shell) | split into one `src-tauri/` per editor, common code in `editors/shared/` |
| `src/shared/map`, `net`, `save`, `match` | contracts in `crates/content` and `crates/net`; TypeScript types generated into `packages/formats` |
| `src-tauri/` | `game/` (the Tauri shell is retired when the native game ships) |
| `server/` | `server/` (TypeScript now; Rust once `crates/net` exists) |
| `assets/library/` | cooked build output, not tracked |
| `assets/authoring/published.json` | `content/assets.json` |
| `assets/maps/` | `maps/` |
| `scripts/releases`, `docs`, `maps`, `wiki` | `tools/` |
| `scripts/bench` | the useful benchmarks move beside their crate; one-off probes are deleted |
| `wiki/`, `scripts/wiki` | `docs/` |
| `src/dev/combatLab.ts`, `reference-stage`, `vegetation-gallery`, `experiments/building-studio` review page | deleted; kept capabilities become editor or debug features |
| `tests/` | beside the code each test covers |

## 4. Decisions (agreed 2026-10-14)

1. **Fresh repository.** A new repository uses Git LFS for `art/` from the first commit. The current `settlers-web` repository becomes a read-only archive with the full history; no history is rewritten.
2. **Editor viewports use WebAssembly + WebGPU.** The Rust renderer (`crates/web`) runs in a canvas inside each editor's React UI. Until it exists, editors use `packages/web-engine`.
3. **Editor backends.** File access, validation and publication move from Vite middleware into each editor's Tauri Rust side. AI assistants (Mastra, eve, image providers) run in a Node sidecar bundled with the editors that need them.
4. **Names.** Repository, crates and packages are `canopy`; the product is **Under the Canopy**. Bundle ids use the `com.jt.canopy` prefix (game `com.jt.canopy`, editors `com.jt.canopy.map-editor`, `com.jt.canopy.asset-editor`, `com.jt.canopy.spell-editor`). Existing test installs reinstall once; the old updater channel is not migrated.
