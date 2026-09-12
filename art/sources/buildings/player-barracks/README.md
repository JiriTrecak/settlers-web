# Player Barracks

Editable reference-based asset with four octagonal watchtowers, layered red shingle roof, reinforced gate, crossed swords, lanterns, spear/shield rack and ownership flag. Rear construction is inferred.

- `player-barracks.blend`: editable source, named parts, packed reference, render stage.
- `model.glb`: evaluated model with baked vertex colors, 16,652 triangles.
- `model.py` / `asset.json`: deterministic recipe and configuration.
- `reference.png`, `samples.json`, `samples.png`, `palette.json`: reference and color measurements.
- `render.png` / `comparison.png`: full-resolution Cycles preview.
- `runtime-validation.json`: GLB triangle and player-color verification.

Only the flag uses `TC_TeamColor`. Default sRGB is #b72e21; neutral white vertex colors permit replacing the material base color at runtime. Red shingles and parapets are permanent building materials. The viewer provides eight preview colors without modifying the asset.

Run from project root:

    node experiments/building-studio/launch.mjs serve player-barracks --port 8775

This is a building asset, not yet wired into game placement, training or simulation logic. The source has 406 separate editable meshes; the studio export joins geometry. Procedural grain is baked to vertex colors, so fine reference brushwork is simplified in GLB and realtime lighting differs from Cycles.
