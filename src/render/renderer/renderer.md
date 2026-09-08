# renderer

Owns the Three.js scene: Sky, terrain, water, grid, scenery, declared gameplay models and camera application. `SettlementLayer` consumes the observation projection; resources use the batched scenery adapter. The editor and reference stage use the same declarative model path. There is no player-cube fallback. `pickGround` raycasts terrain, `pickStamp` scenery, and `pickGameEntity` selectable entity models.
