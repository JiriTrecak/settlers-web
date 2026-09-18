# Spell effects layer studio

Open **Effects** in the world editor toolbar. The studio previews the same `SpellEffects` renderer used in matches. Select an ability and rank, choose cast, impact or the complete sequence, then pause and scrub the timeline. The map behind the modal stops rendering while the studio is open.

## Authoring layers

A visual supports up to eight named, ordered layers. Add, duplicate, reorder, remove or disable each layer independently. Each layer has a cast/impact phase, origin/target anchor, start delay, duration and repeat count. One tick is 25 milliseconds. Impact layers must finish within the visual's lifetime; invalid declarations cannot be saved.

Shapes are rings, textured ground discs, spheres and instanced particles. Particle motion supports bursts, rising mist, falling shards and orbiting motes. Tune start/end colour and size, opacity, fade-in/out, height, spread, rotation, spin and normal/additive blending. Shape size multiplies the ability radius; particle size is in world units. Texture masks currently include soft falloff, runes, cracks and sparks. These are small shared procedural textures; importing arbitrary textures and mesh emitters is not part of this version.

**Earthquake**, **Ice storm**, **Guardian aura** and **Heavy impact** are visual starting points. They do not create new damage, channeling, slow or aura gameplay mechanics. Current cues have finite lifetimes and fixed world anchors; persistent effects that follow a buff recipient need an explicit lifecycle extension. Faultline now uses contact flash, shockwave and chips; Crownfall uses fractures, expanding wave, debris and dust. Rally and Carapace use variants of the aura layers.

The preview fits tall effects automatically. The layer strips show timing against the maximum 200-tick authoring window. Hover the time readout for live layer, particle and draw-call counts. The preview is an isolated neutral stage, so final colour and visibility still need checking under the destination map's lighting and atmosphere.

## Drafts and saving

The JSON pane is the same declarative visual being edited by the controls. Switching abilities retains every draft, including incomplete JSON. Apply JSON validates the selected visual for preview. Validate & save validates all retained drafts plus the complete content graph and atomically writes `content/game.json`. A concurrent content revision causes a conflict rather than overwriting it. Closing discards unsaved drafts.

Reload the game/editor after saving to use the new declarations. Authoring never changes an active multiplayer match or executes spell mechanics in the preview. Cast-only previews retain a default telegraph if the selected preset only declares impact layers.

## Cost and correctness

Geometry and texture masks are shared within each renderer. Particles use one instanced draw per layer, reuse transform scratch objects and cache terrain offsets at creation. Active materials and instance buffers are disposed when cues expire or the timeline rewinds. Live budgets cap 32 cues, 64 layers and 2,048 particles across both layered and simple effects. Excess presentation is skipped and counted in telemetry; simulation results are unchanged.

Validation includes deterministic timeline scrubbing, expiry/disposal, authoring limits, mixed-effect budgets and retained cast telegraphs. Live checks covered Ice storm and Crownfall, tall-effect framing, layer duplication/removal, draft retention and Validate & save. Saved test drafts were discarded; the shipped spell definitions retain their intended presets.

### Ability cooldown presentation

The renderer-neutral command binding exposes remaining and total cooldown ticks for learned abilities. The HTML HUD draws a dark radial sweep and rounded-up seconds over the icon; unlearned abilities have no timer. Times use the shared simulation tick duration. Timers are derived only from the local observer's spell state, never private enemy records.

Cooldown, enabled-state and reason changes update existing buttons rather than reconstructing the grid. Click handlers resolve the current binding so a retained button cannot issue a stale command. Live verification: learned Rally, cast with W, observed the 25-second icon timer, cast ring and mana consumption. Ability/presentation tests cover expiration, unavailable abilities and enemy-state privacy.
