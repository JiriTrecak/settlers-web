# Painted banks and mountains

Open `/?screen=editor&map=ridge-and-bank-study`. In Terrain, choose Grassy banks or Rocky mountains, then paint. All three biome menus expose both recipes with biome terrain textures. Existing live layers offer Add/Subtract, size, seed, height, falloff, irregularity, grass/rock coverage and mountain chunk controls.

The compiler raises the base heightfield deterministically, derives surface masks from final slopes, and seats reusable mountain chunks around the lower shoulders. Rivers carve afterward; chunks avoid water, paths and placed objects. Forest generation follows terrain and receives chunk exclusions. Geometry placement remains layer-owned. Terrain recipes cannot be baked through the vegetation-only bake operation.

`before-subtract.jpg` and `after-subtract.jpg` capture a live subtraction without reloading the scratch editor: the original cliff/grass masks disappear from the cut. The scratch map was removed afterward. GPU color/depth uniforms are explicitly rebound when terrain resources change, because Three reuses the compiled shader program.

Validation: 50 tests across authoring, biome and terrain-render suites passed; production build passed (existing large-chunk warning). `landforms.png` is the reference-stage render of the study map.

This uses our existing fixed terrain grid, not the original engine's adaptive tessellation. Grass geometry stays a separate foliage layer; the bank recipe supplies terrain shape and ground materials.
