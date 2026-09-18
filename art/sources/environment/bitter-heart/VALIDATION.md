# Bitter Heart validation

Verified September 15, 2026.

- Built-in imagegen concept, root bark and resin albedo; exact prompts retained in `generation.json`. Original images retained beside the runtime-sized copies.
- `samples.png` and `palette.json` inspected. Reference colors include lighting and are not measured physical albedo.
- Deterministic background Blender recipe: 43 editable meshes, six materials, five packed images including the reference. Full 1400 × 1100 Cycles comparison inspected.
- Refined after the first render: irregular spreading roots, higher moss placement, lower light energy and a rougher resin surface to avoid glass-like glare.
- Saved Blender validation and `validate-canopy-blends.py -- bitter-heart` pass: finite geometry, nondegenerate polygons, material assignment and packed image references.
- Exported GLB loaded and orbited from front, rear and elevated views. One mesh, six material primitives, 14,804 triangles, 1,637,980 bytes. No clips or team-color materials.
- The resin material retains `resinShimmer: {strength: 0.4, speed: 0.22}` in glTF extras; the game uses its existing shared-clock visual shader.
- Published through `scripts/assets/publish-heartwood-kit.ts` as `asset.models.environment.structures.bitter-heart`. A 14.2 × 10.5 elliptical blocker and copper-red local light are declarative catalogue data.
- Placed at (166,65), scale 1.3 in The Heartwood Vault, replacing the incidental neutral resource building. The mission is controlled by the hero and army; its living-heart landmark is scenery and does not advertise worker capacity.
- Final chamber inspected in the actual game renderer. Nearby northern amber sconces removed to keep the heart's light distinct. No gameplay path or camp spawn is blocked; the ordinary-order two-chapter combat journey passes.

Known limitations: reconstructed from a single concept; concealed forms inferred. Fine bark relief, moss and fungi simplified. Static geometry, with visual resin shimmer only. The local light shares the four-nearest budget and decorative meshes do not occlude baked terrain-light bounce. The larger level art/balance goal remains open.
