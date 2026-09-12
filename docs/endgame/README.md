# Endgame content handoff

The shipped content adds 30 declarative hero items and two animated neutral bosses. Select **Worldroot Hollow** in Skirmish or Multiplayer to use the new two-player map. Multiplayer peers and the match host must use the same content fingerprint; this work does not deploy the server.

## Items and status effects

The complete catalog, values, stacking rules and effect vocabulary are documented in [hero-items.md](../declarations/hero-items.md). `content/game.json` is the authoritative content. There are ten items in each tier. T1 supplies modest stats and consumables; T2 provides larger upgrades and support auras; T3 contains the defining powers, limited to legendary camps.

`src/content/items.ts` defines the schema; `src/sim/game/itemEffects.ts` interprets it without item-ID dispatch. Equipment runtime stores remaining charges, cooldown ticks and hit counters. Timed statuses, queued damage and consumed rescue charges survive save/load. `itemValidation.ts` rejects forged runtime metadata. Percentage bonuses are bounded, matching auras do not stack, and triggered attack powers cannot recursively trigger themselves.

Affected units expose statuses through observation. `src/render/settlement/statusBadges.ts` renders recipient badges above units; `src/presentation/itemStatus.ts` supplies center-panel icons and explanatory tooltips. Inventory cards display tier, charges and cooldown. All thirty icons ship as painted 128 × 128 PNGs on black backgrounds in `assets/ui/icons/items-v2/`. High-resolution masters, generation prompts and a contact sheet live in `art/sources/item-icons/painted-v2/`. Re-export with `python3 scripts/items/export-painted.py` (requires Pillow). The older `items-v1` SVG pipeline is retained only as a legacy source; it does not overwrite the painted set.

## Map

`assets/maps/skirmish/worldroot-hollow.utcmap` is the runtime source, exported from the live game editor. `scripts/maps/worldroot-hollow.py` generates its seed; `scripts/maps/author-worldroot.ts` applies roads, terrain and cover through the EditorHub API and exports it. The author script backs up the editor's current document to `tmp/editor-before-worldroot.utcmap` before replacing it. Do not run it against a document being edited by someone else.

- 256 × 256, two players at (42,128) and (214,128).
- Four T1 camps and four T2 camps on paired approaches.
- Staglord at (128,35), Matriarch at (128,221); both have two elder Thornspitter guards.
- Exactly two T3 items total, one per legendary camp, after its last defender dies. Lesser camps cannot roll T3.
- Shared amber root at (128,128), with ten worker slots and 12,000 amber. Each home root has 3,000 amber. Rival workers can use the same neutral root, making access and worker protection the contested objective.
- Central and flank routes remain traversable. The ordinary victory condition remains destruction of the opposing main hall.

The [overview](worldroot-overview.png) was captured through the editor. Both bosses were inspected in a running skirmish. The root is the existing amber-root model and gathering system, not a separate capture-point victory rule.

## Creature assets

Both neutral characters use the existing generic character runtime. Their GLBs embed the profile mapping `idle`, `walk`, `run`, `attack`, `hit`, `death`; the attack contact event is `hit` at normalized time 0.55. The normal 1.5× playback default applies. Idle/walk/run loop; hit and attack return to idle; death holds. Death clips fall onto the side and have a grounded final pose. Neither has `TC_TeamColor`.

**Amberjaw Staglord — animated neutral creature**

- **What it is:** Copper-armored six-legged beetle with articulated amber-edged pincers.
- **Asset folder:** [amberjaw-staglord](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/amberjaw-staglord>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/amberjaw-staglord/amberjaw-staglord.blend>), [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/ant-colony/characters/amberjaw-staglord.glb>), [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/amberjaw-staglord/comparison.png>).
- **Live preview:** http://127.0.0.1:8770/ (restart command below).
- **Geometry:** 4,356 exported triangles. 17 bones; source has 68 editable meshes and 7 materials. Source object counts are not runtime draw counts.
- **Runtime features:** Six states listed above; no team-color surfaces.
- **Validation:** Saved Blender geometry/camera/packed reference validation; actual runtime GLB load; independent instances; finite animation transforms; loop seams; one attack event; grounded, held death; comparison and orbit inspection; visible in the running map.
- **Game integration:** `unit.neutral.amberjaw-staglord`; 2,400 HP, armor 7, melee damage 76, cooldown 64 ticks, level 8. Northern legendary camp.
- **Limitations:** Simplified colored geometry without baked texture detail; unseen anatomy inferred from the concept. Single LOD.

**Thornblade Matriarch — animated neutral creature**

- **What it is:** Leaf-armored mantis with four walking legs and paired serrated scythes.
- **Asset folder:** [thornblade-matriarch](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/thornblade-matriarch>).
- **Files:** [Blender](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/thornblade-matriarch/thornblade-matriarch.blend>), [Game GLB](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/assets/ant-colony/characters/thornblade-matriarch.glb>), [Comparison](</Users/jiritrecak/Documents/Supernova/Development/Settlers 3 Web/art/sources/characters/thornblade-matriarch/comparison.png>).
- **Live preview:** http://127.0.0.1:8771/ (restart command below).
- **Geometry:** 3,680 exported triangles. 16 bones; source has 69 editable meshes and 7 materials. Source object counts are not runtime draw counts.
- **Runtime features:** Six states listed above; no team-color surfaces.
- **Validation:** Saved Blender geometry/camera/packed reference validation; actual runtime GLB load; independent instances; finite animation transforms; loop seams; one attack event; grounded, held death; comparison/orbit and workshop scale inspection; visible in the running map.
- **Game integration:** `unit.neutral.thornblade-matriarch`; 1,850 HP, armor 4, melee damage 58, cooldown 40 ticks, level 8. Southern legendary camp.
- **Limitations:** Simplified colored geometry without baked texture detail; unseen anatomy inferred from the concept. Single LOD.

Each asset folder includes the reference, measured palette, sample coordinates, recipe, configuration, saved scene, exports and comparison. Recipes share `art/sources/characters/endgame_rig.py`. Runtime icons are rendered directly from the saved scenes with `scripts/items/render-neutral-icon.py`; they live under `assets/ui/icons/neutral-v1/`.

```sh
node experiments/building-studio/launch.mjs serve amberjaw-staglord --category characters --port 8770
node experiments/building-studio/launch.mjs serve thornblade-matriarch --category characters --port 8771
```

Saving the asset's Blender file refreshes the studio. Rebuild via `build` instead of `serve` when changing a recipe. After accepting a rebuild, copy its species GLB into `assets/ant-colony/characters/` and run the runtime asset tests; studio files and shipped files are deliberately separate.

## Verification

Final checked run: **220 tests passed across 46 files** (gameplay, player AI, and creature exports); TypeScript and production build passed. Existing bundle-size warnings remain.

Manual visual fixtures are available in the dev server at `/tests/manual/hero-items.html` and `/tests/manual/hero-item-world-badges.html` for the actual HUD and world badge renderer. They use an isolated test simulation.

- `tests/game/hero-items.test.ts`: full catalog, effects, charges, cooldowns, stacks, teams, shields, damage/procs, rescue, status UI data, save/load and replay.
- `tests/game/item-assets.test.ts`: thirty unique square icons and legendary loot restrictions.
- `tests/game/worldroot-hollow.test.ts`: shipped map placement, routes from both starts, actual camp rewards, deterministic restore, shared root assignments and stronger legendary defenders.
- `tests/render/endgame-creatures.test.ts`: shipped GLBs match studio exports; six states, skinning, triangle ceiling, no recolor surfaces, independent instances, finite transforms, seamless loops, attack events and grounded death.
- Broader game/AI suite and production build also run. The build checks declared models and icon dimensions.

Balance values are an initial tuning pass; no claim is made of statistical competitive balance. No server deployment, commits or unrelated army-content rollback were performed as part of this handoff.
