# chrome

The top strip owns the map name and file actions. `SceneToolstrip` owns the persistent bottom icon strip: Select, Place, Terrain, Foliage, Water, Decals, Spawn, Clean, undo/redo, Environment and MCP. Place exposes a second compact strip for units/buildings versus scenery/landmarks. Decals exposes preview, Apply and Discard in a scrollable side panel. Camera presets sit above the viewport.

`ScenePanel` keeps the left side exclusively for `SceneHierarchyView`, a React tree using Headless Tree and TanStack virtualization. The 28-pixel rows group layers by recipe type and objects by asset, with All/Layers/Objects filters and name/ID search. Only visible rows plus overscan are mounted. Selection, keyboard navigation, expansion and search are retained across document notifications; viewport selections reveal their parent groups. Grouping is presentation-only and never changes procedural order or map storage.

The tree, file bar, bottom toolstrip, camera controls and environment panel use shadcn components from `src/components/ui`, configured by the root `components.json`, with scoped Zinc tokens in `src/editor/ui/theme.css`. Their legacy list/toolbar markup and CSS are removed. The remaining inspector and auxiliary docks have not yet migrated. Consecutive model notifications coalesce into one panel refresh; explicit local UI actions can flush immediately. React rendering has its own profiler scope, so deferred work is not hidden by the panel timing. Toolbars skip identical state notifications, and day-cycle controls refresh at displayed-minute resolution instead of every animation frame.

The right side owns contextual settings; generation settings and inspector scrolling persist while editing the same selection. Authored objects expose numeric position, elevation, rotation and scale, with raw data under an advanced disclosure.

Repeated generation warnings are counted under a collapsed notes disclosure; the inspector always stays within the viewport. Environment exposes an editor-only canopy preview checkbox, off by default. This preference never enters map storage or biome settings. Escape from the environment controls closes the panel without reaching map shortcuts.

`PerformanceDebugWindow` in `src/debug/performanceWindow.tsx` is shared with skirmish/campaign matches. The editor supplies opening, world-build and render-benchmark capabilities through `PerformanceSource`; frames, counters, captures, exports and draw census use the shared UI and sampler. Ctrl+F3 opens the dialog, Escape closes it without reaching map shortcuts, polling stops while closed, and sampling restores its previous state. MCP consumes the same reports and commands.

Existing entity, terrain, spawn and selected-scenery docks occupy the same right-hand inspector area. Environment and MCP are mutually exclusive overlays there and close when choosing a tool or hierarchy item. Legacy vertical tools, asset chip and camera hints are hidden in the authoring layout.
