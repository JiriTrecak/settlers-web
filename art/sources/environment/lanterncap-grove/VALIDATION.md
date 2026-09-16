# Lanterncap Grove

Verified September 15, 2026.

- Reference generated with built-in imagegen; exact concept and two albedo prompts retained in `generation.json`.
- Reference samples inspected in `samples.png` and `palette.json`. Lit sampled colors are not claimed as measured albedo.
- Deterministic background Blender recipe; 102 named editable mesh objects, six materials, five packed images including the retained reference.
- Full 1200 × 1000 Cycles render and side-by-side comparison inspected. Dome centers, stalk UVs, moss material and underside normals refined after inspection.
- `validate_blend.py` and `validate-canopy-blends.py -- lanterncap-grove` pass. All six open gill sheets explicitly face downward; an additional Blender assertion verifies their area-weighted normals.
- Live exported GLB loaded and orbited from the front, side/rear and elevated angles. Four embedded JPEG albedos; normals, UVs and vertex colors present in every material primitive.
- Runtime export: 12,792 triangles, one mesh, six materials/primitives, 2,004,408 bytes. No animation clips or team-color materials.
- Published as `asset.models.environment.mushrooms.lanterncap-grove`. A 10.5 × 8.5 elliptical blocker and a restrained teal light are declared in the catalogue.
- Two scaled instances dress the optional fungal alcove in The Heartwood Vault. Actual game-renderer inspection confirmed the caps, stalks, moss base and lighting, with no logged shader errors.
- Navigation checks cover every camp spawn, all objectives, upper/lower gallery paths and the new solid landmark bases. The ordinary-order outdoor-to-indoor combat journey passes with the new groves.

Limitations: concealed forms are inferred from one concept. Fine gills and moss simplify to faceted geometry and albedo. Gill relief reads more strongly in Cycles than under the game's restrained indoor lighting. Static geometry; its point light shares the four-nearest-light budget, and scenery does not cast baked local terrain-light shadows. The map remains an art-direction pass, not final campaign balance or visual completion.
