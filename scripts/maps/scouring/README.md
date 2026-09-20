# Scouring map conversion

The user supplied the installed game assets with permission for reference testing. These tools read the pack as data; they do not execute its binaries. Eldenvale is now reconstructed in `assets/maps/showcase/scouring-eldenvale.utcmap` and can be opened in the reference renderer. It is a visual comparison scene, not a completed gameplay port or a verified pixel-identical match.

## Reproduce

From the repository root:

```sh
python3 scripts/maps/scouring/decode.py
python3 scripts/assets/import-scouring-environment.py
node --import tsx scripts/assets/publish-scouring-environment.ts
node --import tsx scripts/maps/scouring/convert.ts
```

Asset import needs Pillow with BC7 support; skin tests also need NumPy. The default pack location is the installed CrossOver Steam copy; both Python entry points accept `--source`. Decoded files, source hashes and unresolved bytes are retained in `art/references/scouring-maps/eldenvale/`. The import manifest preserves original material attributes and source provenance. Unknown asset references fail conversion instead of falling back to replacements.

Open `/reference-stage.html?map=scouring-eldenvale&x=291&z=254&zoom=0.65&hour=12` on the Vite server. Camera yaw/pitch are optional URL parameters in degrees. The comparison button exports 1920 × 1080 at animation time 12 seconds. For a filesystem artifact with camera metadata, run:

```sh
node --import tsx scripts/maps/scouring/capture.ts
```

Open the localhost URL it prints. The script uses the project's existing inspection API on a temporary localhost port and saves a PNG plus JSON under the decoded map's `comparisons/` directory. It times out if no preview connects and refuses an unexpected scene, camera or hour. These images show our renderer; a matching original-game capture is still needed to validate visual equivalence.

## Preserved map data

- Original 240 × 464 world rectangle: 15 × 29 blocks of 16 units, source origin (-120, -232). UTC translation is (+256, -24, +256).
- All 1,004,353 original uint16 height samples, on a 721 × 1393 grid at 1/3-unit spacing. `UnpackHeight` is UNORM16 × 64; it does not subtract the reference-zero constant.
- Eleven terrain layers, original 361 × 697 masks, and six layer slots for each of sixteen subblocks per block. Original tile textures and material parameters are imported, including inherited attributes.
- 4,847 plants and 87 model instances, including their full XYZ, packed quaternion and scale. Packed quaternion channel order is BGRA; scale is .25 + 3.75 × byte / 255.
- All 46,422 grass records: block X/Z, local X/Z, rotation, scale and two user bytes. Placement is decoded, not procedurally reseeded. Counts are 41,560 messy, 3,775 low, 298 daisies, 247/238 water leaves and 147/157 high grass.
- 73 water blocks. Each 1,540-byte payload contains 16 × 16 BGRA flow/foam records, 16 × 16 uint16 heights and four retained trailing bytes. RG is flow, B is foam; alpha and the trailing bytes remain unresolved. Sampling respects cell centers and the original water-height grid.
- Two original bridge height-helper meshes become walkable decks with ramps and cross-level navigation connections. Rendering uses exact source heights; navigation retains the engine's one-unit grid.
- Fifty neutral entities and two normal-skirmish outposts give 4,986 placed objects in total. Two hero-mode-only dungeon entrances are excluded from this comparison and recorded in the audit.
- Both original Q16.16 player starts, all gameplay grid bytes and settings are retained in `gameplay.json` and binary sidecars. The UTC comparison remains a single-player sandbox with its placeholder start rounded to the engine's integer grid. Neutral units use their first original stand pose; they are not active native AI.

## Rendering reconstruction

Source meshes keep topology, UVs, vertex AO, leaf metadata and material ranges. Their separate shading textures drive metalness (R), roughness (G), and additional backlighting (1−B), rather than being mistaken for glTF ORM textures. Reference assets preserve their authored origins. The reflection cubemap keeps all six faces and all seven authored BC7 mip levels, decoded with source sRGB sampling. The original 64 × 64 linear BRDF lookup is retained byte-for-byte after BGRA decoding, with source row orientation. Imported materials use the supplied direct Cook–Torrance/Schlick formula (including its distribution cap and authored roughness) and ambient cubemap specular weighted by that lookup. Native materials keep their previous lighting. Terrain textures whose alpha stores roughness/height also have raw RGBA payloads to avoid browser premultiplication damage.

The imported path consumes the original layer masks, height blending, ground-color image and macro texture. The stored displacement mask was identified byte-for-byte as rounded rock × (1 − rockgrass) × (1 − darkgrass); it drives original rock displacement, layer height relief and displacement occlusion in color and shadow passes. Source three-corner terrain normals, tangent basis and explicit texture LOD zero are used. Native GPU tessellation is represented by the original 1/3-unit grid, so sub-grid silhouettes can still differ. Grass/tree colors use ground and macro tinting; grass and terrain honor FORCE_LIGHTMAP_OCCLUSION_LEVEL0 by omitting ground-color bounce; the ambient diffuse path uses the original filtered cubemap and vertex AO. Grass follows the original per-vertex roughness-one dielectric lighting, with per-pixel shadows, texture/macro color and the source ground-color application in both stages. Standing grass keeps the source terrain-normal transform; ground-hugging leaves also use slope normals while their geometry follows terrain. Static model occlusion is decoded from the supplied R8 DDS volumes and projected using LightMapCompute.fx height bands. Six bridge/outpost/ruin instances and 2,617 large firs contribute to the current map. Fir sprite intensity/footprint come from active inherited XML, with the original linear red-channel radial texture and source three-band height fading. Commented small-fir settings are ignored. Sprite base-height offsets are preserved in the existing height texture’s spare G channel. The generated RGB bands are packed into unused underlay GBA channels so terrain stays within the 16-fragment-sampler limit; this affects ambient lighting, not direct sunlight. One texel per world unit, minimum overlap blending and model intensity one are explicit choices because their engine values are absent. The tree sprite binding is inferred from executable texture references; transformed geometry bounds provide caster height, and XML intensity is used without the unavailable ObscureInfluence attenuation formula. Sprite offset overlaps use maximum; model/sprite blend priority remains unverified. Existing imported fir stamps now update their ambient shading when removed, moved in X/Z, resized or restored. A shared CPU raster indexes casters in 16 × 16 sectors and rebuilds only affected sectors, then uploads the actually changed texture rows with an interpolation apron. Source heights and the underlay mask stay unchanged. The serialized bake remains immutable. Heights use RGBA float storage so the installed Three.js partial-upload path can update the packed sprite offset; terrain, grass and prop consumers now share one reference-counted texture bundle and one update listener per imported source. Removing a consumer or switching it to native terrain leaves the remaining consumers alive. The last release disposes the bundle, and re-acquisition reads current edited shading. Event cost still needs further optimization. Imported trees remain scenery stamps: harvesting, newly created caster IDs, tilted rotations and moving static model volumes are not yet connected. Dynamic-light and bounce contributions are not yet reconstructed. Original underlay geometry and texture alpha generate a mask that clears grass and weakens terrain layers underneath objects. The source shader formulas are retained, but its underlay render-target resolution and blend state are unavailable: our offline mask explicitly uses three texels per unit and maximum alpha.

Water uses the original heights/flow/foam and wave texture, the source blue preset, depth-checked opaque-scene refraction, filtered cubemap fallback, source screen-space reflection tracing, directional shadows, narrow specular glints and animated caustics. Base lighting follows the source per-vertex white-dielectric calculation, with Fresnel-weighted sunlight, cubemap irradiance and ground-color bounce. Foam blends against untinted refraction before depth tinting the transmitted scene. The caustics generation formula comes from `WaterCompute.fx`; its target size (256) and sun-aligned projection are explicit reconstruction choices because those engine uniforms are absent from the pack. The reflection pass follows WaterCompute.fx: 64 depth samples, 64-unit ray extent, source depth thickness/stride and above-water rejection, followed by wave-distorted composition. Its half-width/half-height buffer is an explicit choice because source RT dimensions are unavailable. Camera-plane and offscreen guards prevent invalid GL projection samples. Capture metadata includes an on-demand reflection-buffer hit/finite-value diagnostic from the live viewport, separate from the fixed-size PNG. Water rendering skips the copy and caustics passes when no water block intersects the camera frustum.

## Remaining verification and reconstruction

- The small auxiliary uint16 grid still has unresolved semantics; tree harvesting/new caster registration, SSAO and remaining material/shader differences need reconstruction. Model volume bytes are verified, but their runtime intensity and overlap blend still need source-frame verification.
- Original underlay render-target/blend settings, ground-color binding, caustics projection and runtime material defaults need verification against a same-camera original frame.
- Dynamic water disturbances are not yet ported; source reflection-buffer resolution needs original-frame verification.
- Source trunk harmonics now use original X/Z phase, height/scale response, shelter attenuation and length-preserving bend in both color and shadow passes. Packed plant B/G/R user bytes are retained; B drives shelter without multiplying albedo or vertex AO. Fir leaf flutter is still the earlier approximation. The generated 3D noise volume, dynamic wind/foliage interaction and full animation behavior remain to be matched.
- Runtime random variant choices are not stored in the map. The converter uses the first declared bandit/wolf-den variant and records that policy.
- Gameplay collision flags, source neutral AI/scripts, both functional player starts, and outpost floor/ladder traversal remain distinct from the completed static placement import.
- Imported terrain retains its original raster; native editor sculpting needs an explicit imported-raster editing policy.

`conversion-audit.json` lists object mappings, exclusions and current unknowns. Do not describe this as a completed 1:1 port until those differences are resolved or independently bounded and original/rendered screenshots are compared.

## Decoder boundaries and checks

The `.tdata` decoder handles the supplied 20250910/20260715 headers, length-prefixed dictionaries, terrain/masks, plant chunks, blocks, grass, model transforms and plant spatial indices. Opaque auxiliary/tail bytes are preserved. Neighbours, Mountain Pass and Valley Ridge also pass structural checks. First Encounter has a different environment header and is intentionally rejected rather than guessed.

The `.gdata` decoder handles the supplied 20260620 header, starts, sites, neutrals and the 150 × 290 gameplay grid. Unknown nonempty sections fail with a descriptive error. Bone animation decoding is independently tested against the original bind pose.

```sh
python3 -m unittest discover -s scripts/maps/scouring -p 'test_*.py'
python3 -m unittest discover -s scripts/assets -p 'test_scouring_skin.py'
python3 -m unittest discover -s scripts/assets -p 'test_scouring_occlusion.py'
npx vitest run tests/shared/scouring-import.test.ts tests/shared/scouring-underlays.test.ts tests/shared/scouring-occlusion.test.ts tests/shared/scouring-live-occlusion.test.ts tests/render/reference-environment.test.ts
npm run build
```

Tests cover source-byte retention and malformed data, transform reconstruction, original height sampling, water channels, bridge paths, underlay projection, geometry winding/UVs, tree fall behavior and cutout shadows.

## Live occlusion verification

`node --import tsx scripts/maps/scouring/capture.ts --occlusion-probe` chooses a visible fir cluster at the fixed comparison camera, temporarily suppresses its ambient contribution while retaining geometry, and restores it in a `finally` block. It saves baseline/without/restored PNGs and fails unless both source bytes and rendered pixels change and then restore exactly. This isolates shader uploads from geometry changes; it does not prove harvesting integration or source-game equivalence.

The 2026-09-20 capture `eldenvale-1789899245850-occlusion.json` records 459 changed AO texels, 72,306 changed rendered pixels and zero restored pixel mismatches. Eight sectors (2,048 texels, 26 caster visits) were rebuilt; CPU event time was 4.9 ms on this run. This is an event measurement, not a frame-time benchmark or a fulfilled performance target. Earlier probes `1789897951571`, `1789898061339`, `1789898309752` and `1789898606796` selected an offscreen caster and showed no rendered change; they are diagnostic attempts, not GPU validation.

The live-occlusion test compares removal, movement/scale and undo against a full source rebake, checks bounded sector work, unchanged terrain heights/underlay masks, immutable serialized data and listener disposal.

`capture.ts --tour` records four fixed-camera views (river crossing, outpost, forest/gold and river monuments), keeps camera metadata with each PNG and restores the starting camera. The texture-sharing change removed three duplicate 20,532,500-byte image bundles (61,597,500 bytes / 58.74 MiB of CPU buffers, plus corresponding redundant GPU texture allocations). Before/after tour folders `eldenvale-1789899533907-tour` and `eldenvale-1789899889183-tour` compare identically in three views; the outpost differs in one of 2,073,600 pixels (maximum channel difference 13). The comparison report is saved beside the latter images. The live probe confirms one update subscriber instead of four and exact restoration; its cold 7 ms event sample is not evidence of a timing improvement over earlier captures.

The source trunk-sway pass is captured in `eldenvale-1789900969145-tour`. Plant data persistence is checked against all 4,847 decoded source instances. Shader-hook checks ensure the same deformation is used for cutout shadows and that the instance shelter channel is excluded from vertex color multiplication. The map parser rejects out-of-range packed bytes. These checks verify the ported analytic branch and data plumbing, not equivalence of the unresolved generated leaf-noise field.

Foliage lighting now applies `PatchPlantNormals` after the instance rotation in world space, including the source tangent adjustment. The extracted `instance-transform.fxh` beside the tree study confirms source normals use quaternion rotation without instance scale. Direct specular is attenuated by `max(1 − backside / .5, 0)` as in `Plants.fxs`; this leaves diffuse and ambient terms separate. Captures are in `eldenvale-1789901729473-tour`. Of 3,488 imported firs, 3,358 tilt by more than one degree (maximum 15.37°), so transform ordering affects this map. Degenerate zero radial/upward vectors get a finite fallback.

The final lighting pass is captured in `eldenvale-1789902435670-tour`; the earlier `1789901729473` set preceded material-family scoping. Imported GLB extras now retain `sourceShader` (`plant`, `model`, or `grass`) so the plant-only specular rule cannot suppress highlights on bridges, buildings or units. Regression coverage composes actual imported fir and bridge materials through the shader hooks and checks this distinction.

Bridge navigation verification now covers both original helper-mesh crossings in both directions. Each route uses its intended deck, has exactly one ground-to-deck and one deck-to-ground transition, and keeps ground nodes on the land mask derived from source terrain/water heights. This verifies the layered navigation graph; source gameplay collision flags and full neutral AI remain separately unresolved.

Underlay terrain snapping now preserves source geometry relief instead of flattening all vertices to terrain + .018. Plant materials use the rotated local-up projection from `Plants.fxs`; model materials use the separate local-height / 2-to-4-unit transition recovered in `model-terrain-snap.fxh` (source and snippet hashes retained beside it). Fallen snag and bandit-tent underlays contain more than .6 units of authored vertical relief, so these branches are not equivalent. The shader-family regression loads those original GLBs and verifies the correct hook is composed. Capture `eldenvale-1789903357311-tour` records the four fixed views after this correction; 16 focused tests and the production build pass. Water reflection diagnostics contain no non-finite values. Terrain cut-map clipping and source render-target details remain separate uncertainties.

The Eldenvale plant user-data audit found zero damage (G) and zero third-channel (R) on all 4,847 plant records. Missing damaged-albedo variants therefore do not explain this static map's current appearance; damaged/felled runtime states still require their own implementation and verification.
