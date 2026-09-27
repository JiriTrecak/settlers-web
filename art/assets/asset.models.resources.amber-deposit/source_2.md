# Amber Deposit

Replaces the existing `building.neutral.amber-mine` resource without changing its gathering economy. The original multi-view sheet is retained; `reference.png` isolates its main view for generation.

9,647 runtime triangles, one atlas/material, three 2K surface maps. Editable Blender source has 51 parts and packed 4K maps. Model size: 6.57 × 6.60 ground span, 4.41 high, grounded at zero. Gameplay footprint 7×7, entrance (0,4), construction access lane 3 cells. A 15×15 Main Hall requires 14 cells of center separation along either map axis. The editor validates this before Play; runtime construction and AI share the cell envelope rule. Existing Threewater deposit placements retain their location and now use this asset at its measured scale.

Saved Blender validation and studio front/rear inspection passed. The deposit stays neutral when switching player colors. Checked beside the hall at the minimum separation in the game renderer. The insect inclusions/glow are painted into the source texture, not volumetric transparency. Worker model and carrying animation are still pending.

Rebuild through the shared `prepare_texture.py`, building-studio build command, and `scripts/assets/publish-tripo-building.ts colony-amber-deposit-tripo`.
