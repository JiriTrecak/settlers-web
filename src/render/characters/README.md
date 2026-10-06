# Character assets

The canonical package is `art/assets/<asset-id>/asset.json`, with role-named
resources (`geometry.glb`, `source.blend`, `reference.png`, and numbered variants).
Publish through the asset workbench or the shared `asset.publish` command. Never
copy a model directly into the runtime library: publication validates its geometry,
triangle budget, skin weights, clips, events, sockets, material slots and hashes.

Run `npm run dev:tools` and open `http://127.0.0.1:5175/`. This is the single asset
workbench. `?asset=<canonical-id>` opens a specific asset. It uses the actual game
renderer, sky, weather, shadows, reflections and grading, both on an inspection
floor and inside a custom map. Animated subjects use `CharacterPlayer`, the game
ownership shader and definition model scale. The model's authored pivot/scale is kept
separate from preview placement. Choose Game camera to check RTS readability.

Canonical `capabilities.animations` defines semantic states, clip names, looping
and event times (seconds). Publication carries these capabilities into the runtime
model catalogue. Game and workbench consume that same contract. Embedded GLB
`characterProfile` is only an import fallback for unregistered provider output.
The simulation controls gameplay impacts; animation contact events control visuals.

`createCharacterInstance` shares geometry/textures but clones skeletons and
materials. Each instance must be disposed. The loaded prototype owns shared
geometry/textures. `TC_TeamColor` opts into recoloring; the ownership-alpha shader
preserves unowned atlas pixels. Do not turn that mask into transparency.

Units and creatures have a 5,000-triangle publication limit, including separately
packaged attachments. Buildings have a 10,000-triangle limit. Texture dimensions,
decoded memory, primitives and bones are also reported for performance review.

Every unit definition declares its gameplay dimensions (radius, height and formation
spacing) and movement speed in world units. Content loading never rescales gameplay
values from assets. `modelScale` is presentation-only: changing it cannot alter
collision, speed, weapon reach or supply. The game and spell preview apply the
selected definition's model scale and the asset binding's scale once. The asset
workbench uses its first geometry binding's game definition; unbound assets retain
their authored size. Placement scale is a temporary preview multiplier.

Blender build/export adapters currently live in `experiments/building-studio` and
provider inputs in canonical `art/assets/<id>/` source roles. Those are authoring inputs, not the runtime
library. Use the canonical workbench for visual acceptance; Blender render lighting
is a source-authoring convenience and does not predict the game's final image.
