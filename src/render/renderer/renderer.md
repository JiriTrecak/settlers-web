# renderer

Owns the Three.js scene: Sky, terrain, water, grid, scenery, declared gameplay models and camera application. `SettlementLayer` consumes the observation projection; resources use the batched scenery adapter. The editor and reference stage use the same declarative model path. There is no player-cube fallback. `pickGround` raycasts terrain, `pickStamp` scenery, and `pickGameEntity` selectable entity models.

Match loading prepares selection rings, declared resource depletion stages and portrait variants as well as world models. Portraits compile under their own two-light, shadow-free setup and HDR target; prepared materials remain alive to retain the program cache. This avoids first-selection and first-depletion shader links after play begins.
