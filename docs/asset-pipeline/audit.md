# Asset audit: September 2026

**Working-tree snapshot: 11 September 2026.** This is a structural audit supporting the [Asset Studio proposal](proposal.md), not a declaration that every unreferenced file may be deleted. No assets were moved or removed.

## Scope and evidence

The audit inventoried **168,901 files, 1.95 GiB of logical file data** across the asset/source/reference roots and recognized media elsewhere in the project. Every inventoried file has a SHA-256 hash. This includes ignored legacy files; it is not just a Git inventory.

Reproduce from the project root:

```sh
python3 scripts/assets/audit.py
```

The [audit script](../../scripts/assets/audit.py) produces these local reports in ignored `tmp/asset-audit/`:

- `inventory.jsonl.gz`: every inventoried path, size, hash, extension, Git tracking status; PNG dimensions and GLTF metadata where applicable.
- `references.json`: structured content/catalog/character/model-dependency edges, plus literal source references.
- `duplicates.json`: byte-identical groups, excluding original-install files from deduplication recommendations.
- `model-source-matches.json`: runtime GLBs matched against exact experiment export hashes.
- `summary.json`: counts, findings, map references and limitations.

A small snapshot, `docs/asset-pipeline/audit-summary.json`, is retained with this document. Large file-by-file reports stay out of Git and are reproducible. Counts exclude hidden housekeeping files, symlinks, dependency/build outputs and browser profiles. `original/` is inventoried separately; its contents were not interpreted as reusable game art. Credentials, browser state, `.git`, `node_modules`, packaged applications and generated wiki output were not inspected as asset sources.

The script reads PNG headers throughout the inventory and decodes alpha for supported PNGs under `assets/ui/`. GLTF results describe stored geometry via JSON/accessors, not GPU draw totals. It does not open every Blender scene or render every asset. Literal source scanning is supplementary evidence and can include script output paths; dynamic references still need review.

## What is actually here

`assets/` has **167,647 inventoried files totaling 502.6 MiB**. macOS reports a larger allocated size because of the huge number of tiny sprite files. These numbers are not equivalent to game download size.

- **Legacy graphics:** `assets/graphics/` contains 167,088 files, including 167,085 PNGs, totaling 230.4 MiB. It is Git-ignored reconstructed sprite data, not the modern 3D library. No current source import was found in the scanned game/tooling code. Keep it outside the published asset tree during migration; classify its preservation separately from current art.
- **Ant-era models and sources:** `assets/ant-colony/` has 73 files, 98.1 MiB: 58 GLBs, four Blender masters, material textures, character profiles and documentation. It mixes buildings, units, obsolete replacements, resources and scenery.
- **Current environment packs:** `assets/environment/` has 50 files, 8.5 MiB: 43 GLBs, three images and four grass-LOD JSONs. This includes the purchased coniferous exports and wayfarer structures.
- **Synty imports:** `assets/synty/` has 200 files, 110.5 MiB: 197 glTFs, a texture, look settings and documentation. Some are in the active catalog, others remain available through the archive fallback. Imported does not mean used in current maps.
- **Earlier procedural scenery:** `assets/props/` has 32 files, 16.6 MiB, mixing 27 model exports, Blender documents and a backup. `assets/landscape/` adds 11 glTFs, 0.3 MiB.
- **Interface and icons:** `assets/ui/` has 165 files, 23.7 MiB: 127 PNGs, 32 SVGs, metadata and docs. It mixes current icons, old icon generations, retired HUD sheets, menu artwork, application icons and the current woodland experiment.
- **Terrain textures:** `assets/terrain/` has seven PNGs, 2.8 MiB. Four are 2048² and three are 1024². Other material/ground textures currently live under `ant-colony/materials/` and `environment/wayfarer/`.
- **Maps:** four `.utcmap` files totaling 6.1 MiB, plus map docs/catalog metadata. The shipped maps are Vanguard Prologue, Four Crowns, Terrain Proving Ground and Worldroot Hollow.
- **Reference/test art:** `assets/visual_tests/` has ten files, 5.3 MiB. These are references and comparison material, not ordinary runtime models.
- **Old game data:** `assets/game_data/buildings.json` is 0.3 MiB. No current import was found in the scanned code. Current rules come from `content/game.json`; this file needs explicit legacy classification.

Outside that tree:

- `experiments/`: 593 inventoried files, 367.3 MiB; 24 Blender masters, 21 Blender backups, 35 GLB exports, 230 PNGs, recipes, reports and studio scripts. Much of this is valuable source/provenance, despite the folder name.
- `inspiration/`: 82 files, 54.0 MiB, including references, brush images and swatches.
- `docs/`: 45 media files, 88.2 MiB, including original generated icons, concepts and comparison screenshots.
- `tmp/`: 161 media files, 227.0 MiB, after excluding browser profiles. Includes ten map copies and visual QA captures. These are not canonical assets.
- `original/`: 357 files, 756.9 MiB, comprising original maps/data and 13 Ogg files. Do not fold the original-install audio into a newly curated audio library.
- `src-tauri/`: 15 PNG application-icon derivatives. These need an app-icon generation profile, not the gameplay-icon profile.
- `output/`: one item-icon preview PNG.

There are no existing bee/beetle-named model files in the inspected runtime tree. Treat those faction directories as future structure rather than manufacturing entries now.

## Current references are intact, but inclusion is too broad

`content/game.json` declares **113 asset records**: 37 model records and 76 image records pointing to 75 distinct PNG paths. The active scenery catalog has **208 entries**; the archive catalog has **218**. They overlap on 109 IDs.

All tested structured file references exist: content file/image/harvest paths, active and archived catalogs, the standalone character variant files, and local external glTF image/buffer URIs. All four maps' explicit scenery-stamp IDs and entity-definition IDs resolve against current catalogs/definitions. This is a file/ID integrity result, not a full gameplay or asset-loading test.

The game uses a recursive, eager model URL glob in `src/shared/assets/project.ts`:

```ts
import.meta.glob("../../../assets/**/*.{gltf,glb}", { eager: true, ... })
```

That matches **336 model files, 163.4 MiB**. Only 216 distinct files are linked by current content or active scenery catalog. The other **120 files total 50.5 MiB**, but **109 of those are referenced by the editor's archive catalog**. The remaining eleven include superseded ant models and earlier pine variants. Neither group is an automatic deletion list.

A URL glob establishes build inclusion potential, not that every file is fetched/decoded each match. Nevertheless, published build inputs should be selected by a manifest rather than “every model somewhere under assets”. The current `projectMeshUrl` also resolves by suffix matching rather than an exact manifest key; canonical resolution removes that ambiguity.

`src/editor/assets/store.ts` explicitly merges archived and active catalogs when resolving assets. This explains why simply moving “unlisted” files would break editor behavior. The migration should replace that implicit fallback with deliberate active/archive classification.

## Icons: good dimensions, inconsistent history

All **112 PNG icons are exactly 128×128**. No size violations were found. Existing validation in `tooling/content/plugin.ts` already rejects declared icons that are not square or exceed 128px; preserve and centralize that rule.

Current directories:

- `ants-v1`: 47 PNGs, including units, buildings, resources, commands and older item art.
- `ants-v2`: three PNGs for newer control icons.
- `items-v1`: 30 PNGs and 30 corresponding SVG sources.
- `items-v2`: 30 newer painted PNGs.
- `neutral-v1`: two PNGs.

**37 PNGs are not referenced by current content declarations**: the 30 older item PNGs and seven files in `ants-v1`. Command art uses a recursive icon glob, so leaving prior generations there still enrolls them in the icon file map. Status badges and other consumers also use asset IDs. Classify references across consumers before removing anything.

There are no exact byte-identical duplicate groups with multiple modern runtime asset files. Much of the clutter is *semantic replacement*, not byte duplication. A hash deduplicator cannot decide whether an old icon is the preferred style reference.

`docs/art/icons.md` describes several historical states as current, including retired build ordering and six inventory slots. Metadata in files is not enough if prose disagrees. Generate dimensions, paths, and current asset lists from the future manifest; keep art direction and historical rationale authored.

## The transparency failure is measurable

The current woodland exports provide a concrete acceptance-test case:

- `selection.png`: 1440×480, RGB; **691,200 opaque pixels, zero transparent pixels**.
- `slot.png`: 128×128, RGB; entirely opaque. Its old prompt requested an opaque interior; it does not meet the newer rim-only brief.
- `map-frame.png`: 512×512, RGBA; 228,896 fully transparent pixels, 31,980 partially transparent pixels, 1,268 opaque pixels.
- `satchel.png`: 256×256, RGBA; 10,195 fully transparent pixels, 54,674 partially transparent pixels, 667 opaque pixels.

macOS `sips` independently confirms no alpha on the selection image and alpha on the map frame. Having some transparent pixels still does not prove the correct interior opening is empty. The future rim profile needs region-based checks and actual-size visual review.

`assets/ui/woodland/generation.json` retains prompts and generated filenames, but its originals are identified by external generated-image basenames rather than a complete, content-addressed in-project source record. The approved concept is retained in `docs/art/woodland-hud-reference.png`. A future job should snapshot the master and references before publication.

## Sources and performance contracts need to survive cleanup

There are **seven `.blend` files and one `.blend1` backup inside `assets/`**. They are authoring inputs, even though the current model glob does not itself import `.blend`. Move them into explicit source storage when the migration is approved.

Of 115 runtime GLBs, 23 have a byte-identical GLB export in `experiments/`. This is evidence of known source/export pairs, **not** proof that the other 92 lack sources: purchased packs have a shared master, some assets come from scripts, and optimized runtime derivatives can differ from studio exports.

The coniferous pack is comparatively well documented. Its retained `source.blend`, `source-inventory.json`, `exports.json` and validation describe 38 original meshes. Current grass LOD JSONs are imported directly by `src/render/foliage/meadow.ts`. Preserve those source/export relationships and the palette conversion rather than reorganizing only the visible GLBs.

Measured examples, counted from stored GLTF triangle primitives:

- `tree_primary.glb`: 1,365 triangles, one primitive.
- `tree_secondary.glb`: 740 triangles, one primitive.
- Grass 03 / Grass 06: 504 / 734 triangles, one primitive each.
- Current Rootbound Hall: 76,854 triangles, 29 primitives.
- Great Mound: 58,902 triangles, 30 primitives.
- Player Barracks: 16,652 triangles, 18 primitives.

These are census figures, not a claim about the post-batching renderer. The studio must report materials, instances, textures and animation costs as well as triangles.

Current animated characters use GLB-embedded `characterProfile`, state mappings, contacts and sockets. The standalone `character.json` lists only four variants, while runtime has additional hunter/bombardier/neutral models with their own metadata. Do not rebuild the catalog from that one file and accidentally omit them. `TC_TeamColor`, ground origin, orientations, tree harvest clips and physics-related scenery metadata must survive publication exactly.

The duplicate report contains 23,742 byte-identical groups across the inspected non-original roots, with 100.8 MiB beyond each group's first copy. Most groups belong to legacy sprite data; others are expected master/export pairs or repeated references. This is **not** a promised 100.8 MiB of safe deletion or download savings.

## Existing tooling worth retaining

- **`tooling/`** already is a separate Vite target with a Tauri wrapper and an empty Tools hub. It is the natural place to build Asset Studio.
- **`tooling/content/plugin.ts`** validates content, declared icon dimensions, file paths and map placements; it includes revision checking and single-file atomic replacement. Its service runs in the game Vite target today. Extract reusable validation rather than importing the whole game/server into Studio.
- **`experiments/building-studio/`** supplies Blender modeling/rendering, comparison, palette sampling, editable source handling and character exports. Preserve these as model-processing capabilities behind Studio.
- **`scripts/assets/validate-coniferous-pack.mjs`** verifies pack mappings, geometry, grounding and tree clips. **`grass-lods.mjs`** produces actual runtime derivatives.
- **`scripts/import-synty.ts`** is useful import logic but defaults to an external Downloads folder and wipes its output directory on a full run. It must become a staged import with an explicit input and publication plan before being exposed as a Studio action.
- **Wiki generation** already copies engineering Markdown into the development section. The proposal documents are included there without a separate documentation app.

## Proposed disposition, subject to migration review

1. **Keep active outputs, relocate by role:** current icons, models, terrain/materials, UI pieces and four maps. Preserve IDs, dependency relationships and collision/render values.
2. **Promote real sources:** experiments, retained masters, recipes, purchased pack input/mappings and original icon images move to `art/` with records. Deduplicate shared references through links/hashes without losing attribution or export recipes.
3. **Separate previous generations:** old icons, superseded ant models, previous HUD art and archived Synty entries become explicit archived library records outside runtime inclusion. Confirm whether any current editor workflow still needs them before cutting over.
4. **Separate historical extraction:** `original/`, reconstructed sprite data and old game data stay a distinct archival concern. They are excluded from generation style selection and the canonical runtime manifest.
5. **Treat derivatives as derivatives:** thumbnails, renders, comparisons, Blender backups and QA screenshots have retention policies. Do not delete approved masters because a compressed game copy exists.
6. **Reconcile external dependencies:** recover retained sources referenced only by a Downloads path or generated-image basename where available. Missing sources are marked honestly; do not fabricate provenance. No sweep of the user's entire Downloads or generated-image folder was performed for this audit.

The migration tool should produce a file-by-file old path → proposed path plan, hashes, affected consumers, source links, and keep/archive decisions. Review that dry run before applying it. A blind folder rename would preserve today's ambiguity under nicer names.
