# Ant interface icons

Each icon is declared as an asset with an `image` PNG path in `content/game.json`. Definitions, command categories, actions, selection portraits and tooltip costs all resolve the same icon IDs. Build and Advanced Build have independent icons: a hammer over oak boards and a hammer over iron plates. Back reuses the red cancel symbol through its existing declaration.

Runtime images live in `assets/ui/icons/ants-v1/`. They are square 128 × 128 PNGs; Vite bundles only these small copies. The authoring validator rejects non-square images or dimensions above 128. No names or hotkeys are painted into the art; tooltips and input bindings remain declarative.

Artwork is generated individually using the built-in image_gen tool. `icon-generation.json` records the exact prompt set. Full-resolution originals are archived outside the runtime assets directory. Runtime derivatives are resized with macOS `sips`, without creative image processing. The old shared atlas and fallback SVG illustrations are no longer used by commandArt.

## Selection details

The selection panel displays the definition's optional `level`, combat damage and body armor. `rules.armorTypes` maps armor IDs to display names and icons (leather light, steel heavy, stone-wall structure). Warriors and ogres use heavy armor with the same current damage multiplier as light armor; other units retain light armor. Buildings use structure armor. Portrait HP uses the same pure `presentation/health.ts` threshold calculation as battlefield pips. Empty selection has no explanatory text. Current jobs, status and inventories are omitted from this panel; multi-selection cards and recruitment queues remain available.

The three armor images were generated with built-in image_gen; exact prompts are in `armor-icon-generation.json`, originals in `icon-originals/`, and 128px runtime PNGs in `assets/ui/icons/ants-v1/`.
