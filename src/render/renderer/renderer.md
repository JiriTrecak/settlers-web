# renderer

Owns the Three.js scene: Sky, terrain, water, grid, scenery, declared gameplay models and camera application. `SettlementLayer` consumes the observation projection; resources use the batched scenery adapter. The editor and reference stage use the same declarative model path. There is no player-cube fallback. `pickGround` raycasts terrain, `pickStamp` scenery, and `pickGameEntity` selectable entity models.

Match loading prepares selection rings, declared resource depletion stages and portrait variants as well as world models. Portraits compile under their own two-light, shadow-free setup and HDR target; prepared materials remain alive to retain the program cache. This avoids first-selection and first-depletion shader links after play begins.

Spell preparation resolves published ability presentations, construction dust and shell impacts before play. `EffectPlayer.prepare` holds image leases and animated model examples, decodes sounds without playing them, and supplies actual custom shaders/flipbooks/particle batches to the renderer warm-up. Prepared model examples do not consume the live effect instance budget. Resources are retained until player disposal; an idle-cache eviction must not undo preparation.

Effect lights use four fixed scene-wide point lights, idle at zero intensity, so casts and expiration never change the scene's shader light count. Prepared particle groups share instanced draws while retaining individual transforms, colours, opacity and emission timing. Normal-alpha particles sort within their batch; flipbook particles retain their individual shader state. Simulation and lockstep are unchanged.

Use `scripts/bench/spell-effects/` for first-cast/repeat regression checks. The game debug view also separates spell event/status work from effect animation; these CPU scopes exclude GPU execution and asynchronous asset loading.
