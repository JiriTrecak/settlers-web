# Layered walk surfaces

Maps containing declared decks use `WalkSurfaces` in the live simulation. Ground retains its original height and cell IDs. Each deck adds sparse nodes in stable stamp-ID order. Entities, fixed-point positions, queued destinations, missiles and saves retain the surface stamp ID; an omitted surface always means ground.

## Authoring

The asset catalogue declares `deck` width, depth, edge height, cosine arch, optional linear rise, slab thickness, numeric level and endpoint connections. Ground is level 0; raised surfaces use levels 1–31. A level identifies a navigation stratum, not a constant elevation: a ramp can rise along its length. There is currently no global table of level heights.

A map stamp can override `walk.level`, absolute `walk.height` at the center of its deck, and `walk.connections.start/end`. Missing connections do not permit a transition to another level. Matching levels can join at adjacent cells if their heights are traversable. Different levels connect only near a declared longitudinal endpoint and within the existing 0.9 m step limit. Side rails do not become ramps. The editor selection dock exposes these properties, and `editor_walk_surface` reads, changes or resets them through MCP.

Surface geometry and visible model placement share `bridgePlacementHeight`. The query mesh used for mouse picking follows the same arch/rise profile. Decorative geometry must be authored to match the declared floor. Pillars, abutments and hollow landmark walls use separate composite ground blockers; empty space beneath a deck remains traversable where there is 2 m of body clearance.

## Navigation and combat

The map builds static same-level regions and a graph of cross-level connections once. This quickly rejects disconnected destinations without repeatedly searching every plane. A same-surface straight route is the fast path. A blocked direct route can still use another level, including when both endpoints are on ground across a river. A* reuses search arrays, quantizes costs and breaks ties deterministically. Dynamic buildings and occupancy participate in detailed routing.

Smoothing preserves portals. Fixed-point movement changes surface identity at the portal cell boundary, checks body width and allows footprint corners to straddle a valid landing. Unit collision accounts for vertical separation; overlapping horizontal coordinates do not collide across a sufficiently high deck. Coplanar seams still collide.

Rendering, command previews, effects and projectile endpoints sample the selected surface. Dropped loot keeps its floor identity; pickup requires vertical reach rather than horizontal proximity alone. Revival adopts the sanctuary landing surface, clearing the old bridge identity when returning to ground. Terrain and solid deck slabs intercept straight fire, including thin planks between ray samples. Archers can shoot down past a deck edge. Melee retains its vertical reach limit. Lower observers retain the existing 1.2 m sight allowance. Player and neutral-camp visibility checks the actual surface, so a revealed horizontal fog cell alone does not reveal a unit on another floor. Remembered objects are cleared only when their own floor is visible.

## Fog on stacked floors

Exploration is stored on the same stable sparse node IDs as movement: ground first, then deck cells. Save/restore and checksums include each floor's knowledge independently. The minimap and atmospheric mask receive a union, while ordinary materials sample the fog for the highest floor below the fragment. An ant below a root can reveal the lower passage while leaving the crown hidden; one standing above it cannot reveal the space blocked by the solid deck.

The renderer packs visibility, height and coverage into a single RGBA atlas. Tiles represent overlapping heights, rather than allocating a map-sized texture for every bridge. Non-overlapping bridges share a tile. Height and coverage use exact cell-center samples; light is blurred within connected deck footprints so narrow decks remain readable and nearby disconnected floors do not leak light into each other. The ground retains its incremental separable blur. Debug reveal can switch back to one unlayered tile without mutating knowledge, and cinematic staging reveals only its authored area on all participating floors.

This is a surface-aware presentation mask, not full volumetric visibility. Decorative geometry outside an authored deck footprint uses the underlying floor mask. The atmosphere still uses a flat union; enemy entities remain filtered by their actual line of sight.

AI map briefings retain the authored ground and deck declarations. Their geography connectivity uses the same topology and includes it in the map fingerprint. Building placement remains ground-only and excludes deck footprints.

## Evidence and remaining checks

- `tests/shared/walk-surfaces.test.ts`: over/under routes, explicit links, arbitrary level 3→4 ramp, wrong heights, water, headroom, occupancy, solid slabs, visibility and stable routing.
- `tests/game/layered-movement.test.ts`: live movement, interruption, body clearance, queued commands, mid-climb save/restore, firing down, fog memory across floors, loot pickup and revival.
- `tests/ai/layered-geography.test.ts`: authorized map topology, same-ground-endpoint bridge routes, disconnected decks and observed surface identity.
- `tests/render/layered-fog.test.ts`: stacked sight and heights, compact atlas allocation, isolated blur, narrow decks and reveal-mode switching.

The Hollow Gate and Heartwood Vault now exercise published root/timber/stone floors in authored levels. Eight-unit traffic tests cover the outdoor stone bridge and the indoor gallery. Live inspection verified the outdoor bridge, simultaneous ground/deck occupancy, and separate fog from above and below the root crown. A 512² topology benchmark exists in `scripts/bench/`; these local checks do not establish final gameplay feel or broad hardware performance. Richer landing diagnostics and multiplayer campaign transition UI remain further work.

Map placements may share horizontal cells on vertically separated floors. Unknown surface IDs, placements outside a declared deck and coplanar overlaps are rejected. Buildings and resource entities currently require ground; units and dropped items retain their surface identity.
