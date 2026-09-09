# Ant interface icons

Each icon is declared as an asset with an `image` PNG path in `content/game.json`. Definitions, command categories, actions, selection portraits and tooltip costs all resolve the same icon IDs. Build and Advanced Build have independent icons: a hammer over oak boards and a hammer over iron plates. Back reuses the red cancel symbol through its existing declaration.

Runtime images live in `assets/ui/icons/ants-v1/`. They are square 128 × 128 PNGs; Vite bundles only these small copies. The authoring validator rejects non-square images or dimensions above 128. No names or hotkeys are painted into the art; tooltips and input bindings remain declarative.

Artwork is generated individually using the built-in image_gen tool. `icon-generation.json` records the exact prompt set. Full-resolution originals are archived outside the runtime assets directory. Runtime derivatives are resized with macOS `sips`, without creative image processing. The old shared atlas and fallback SVG illustrations are no longer used by commandArt.

## Selection details

The selection panel displays the definition's optional `level`, combat damage and body armor. `rules.armorTypes` maps armor IDs to display names and icons (leather light, steel heavy, stone-wall structure). Warriors and ogres use heavy armor with the same current damage multiplier as light armor; other units retain light armor. Buildings use structure armor. Portrait HP uses the same pure `presentation/health.ts` threshold calculation as battlefield pips. Empty selection has no explanatory text. Current jobs and status are omitted; heroes now expose six inventory slots; multi-selection cards and recruitment queues remain available.

The three armor images were generated with built-in image_gen; exact prompts are in `armor-icon-generation.json`, originals in `icon-originals/`, and 128px runtime PNGs in `assets/ui/icons/ants-v1/`.

Command icons have no submenu chevrons or Back overlays, and submenu headings are omitted. Build order is authored through action priority overrides: lumberjack, stonemason, sawmill, forester, house; Back keeps its reserved ninth slot. Visible damaged units show battlefield health pips without selection, and healed units return to selection-only pips. Buildings remain selection-only.

Building placement retains the current worker selection. A normal click exits placement mode; Shift-click keeps placement mode active for repeated construction. Network commits never auto-select the new construction site.


### Hero expansion icons

The Marshal portrait, Barkguard Charm, Thornband, Heartseed, Resin Salve, Royal Crest, Moon Dew, and Amber resource were generated individually. Source PNGs are preserved in `docs/art/icon-originals`; runtime icons in `assets/ui/icons/ants-v1` are 128×128. Item art uses a dark teal background with a single large readable object and no baked text, shortcut or frame. Amber depicts golden forest resin rather than coins. Each item definition owns its icon reference.

Faultline, Rally the Colony, Iron Carapace and Crownfall have separate 128px spell icons. Thornspitter has its own neutral portrait. All resolve through asset IDs in the content graph.
