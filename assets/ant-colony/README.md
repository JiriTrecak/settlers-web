# Ant colony replacement assets

Original geometry authored in Blender through MCP for the approved Ant settlement target:
`assets/visual_tests/ant-base/compare.png`.

These are **work in progress**, not a completed visual match.

## Sources and reproduction

- `scripts/ant-colony/models.py`: fort, woodcutter, sawmill, forester, Ant worker and guard, loose resources and stacks.
- `scripts/ant-colony/forest.py`: layered conifers, ferns, broad leaves, grass, stones, lilies and reeds.
- `Ant-colony-source.blend` and `Ant-forest-source.blend`: editable Blender collections with individual modeling parts.
- `model-manifest.json` and `forest-manifest.json`: geometry counts from successful exports.
- `scripts/ant-colony/blender.mjs`: sends the source script to the running Blender MCP. A client timeout does not necessarily cancel Blender; inspect manifest modification times before retrying.
- `scripts/ant-colony/compose.py`: deterministic scene authoring; writes `assets/maps/showcase/ant-colony-compare.utcmap`, catalog entries and local MCP capture calls.

Assets use metres with Blender Z up, front toward -Y, and an origin at soil level. GLB export converts to glTF Y up (front +Z). Geometry is merged by material for runtime instancing while editable parts remain in the Blender files. Buried conifer roots intentionally extend below zero.

The new buildings, Ant worker and individual resources also replace the gameplay renderer's prototypes. Corresponding older GLBs have been removed; legacy catalog IDs resolve to these replacements. The remaining legacy nature assets and other building types are still pending replacement and removal.

## Live inspection

- Editor: `/?screen=editor&map=ant-colony-compare`
- Comparison: `/visual-compare.html?target=ants`
- Capture camera: perspective, target (128,127), relative game zoom .8, yaw 0°, pitch 42°, aspect 1681/937, fixed animation time 12.
- Map environment: Forest, summer, 10:00, clock paused.

Actual captures are written by editor MCP to `tmp/editor-shot.png`; milestone captures are kept under `tmp/ant-colony/`. The pre-rebuild editor document is preserved at `tmp/ant-colony/editor-recovery.utcmap` (Twinwater Reach, 876 stamps).

## Remaining fidelity work

The first passes establish new geometry, instancing, scene composition, shared Ant material treatment, canopy reflections and a warmer Forest palette. The target still requires substantially more sculpted roof/body detail, better workshop silhouettes, proper root integration, richer ground microdetail, riverbank shaping and water detail. Model and material evaluation must use actual engine captures, not just export success or unit tests.

## Detailed building references

Approved close-ups are saved under `assets/visual_tests/ant-base/buildings/`.
These supersede guesses from the small composition image for the fort,
woodcutter and sawmill. In particular the saw is horizontal and reciprocating,
not circular, and the woodcutter roof has a pronounced pitched silhouette.

The forest cover palette is persisted in the loaded map and available through
editor MCP. Its low curled leaves use an instanced geometry batch; legacy
meadow palettes keep their previous geometry. Map round-trip validation covers
this palette and its building exclusions.

## Latest visual pass

Pass 06 applies the user building close-ups, a low forest cover batch, continuous
warm dry earth, varied river widths and original procedural water normals.
It is still visibly below the target: shell plates remain too regular and thin,
fort roots need more volume, timber and resource stacks need sculpting, and the
stream needs finer pale eddies rather than broad tonal bands. Ground cracking
is too uniform and must be broken into shallow irregular clods. Preserve these
observations for the next pass rather than treating build/test success as completion.

Pass 07 replaces the fort barrel vault with a closed plated dome, resolves band
clearance, strengthens workshop posts/end-grain caps, enlarges the axe, and
repairs staggered physical log piles. Focused Blender scripts `fort.py` and
`workshops.py` preserve the other editable assets and update only their manifest
entries. The roof is still too clean/pillow-like and the roots too angular;
weathered surface detail, plate rims, heavier ant armor and natural water remain
major discrepancies. Fort detail capture: tmp/ant-colony/fort-pass-07.png.

Pass 08 adds original imagegen material detail (`materials/surface-atlas.png`;
exact built-in-tool prompt in `materials/README.md`), per-part Blender grain UVs,
broader armored Ant workers/guards, and precise prototype grounding. The fern
was being raised by an inflated rotated bounding box: its true minimum is about
0.043m and its height 0.775m, not the approximate -0.599m / 2.314m box. The engine
now derives the soil line from actual vertices once per loaded prototype.

`scripts/ant-colony/preview.mjs` runs an isolated headless Chrome scene connected
to the same editor MCP on port 7380, avoiding extra user-facing editor tabs.
It uses a dedicated profile under tmp/ant-colony/chrome-preview. The real-engine
scene currently reports approximately 6.75M triangles / 126 draws, including
12,296 cover instances. No asset load failures. Optimization is still needed.

Pass 09 preserves the supplied water crop in assets/visual_tests/ant-base/water.png
and WATER.md. The stream now uses a cool blue-gray depth palette, original
procedural normals and advected noise-contour silver streaks; shoreline foam
is fragmented rather than a continuous white rim. The authored river flow
field follows the channel. Added original Blender broken hollow driftwood
with splinters, roots and moss at two bank locations. Build and actual editor
capture passed (tmp/ant-colony/pass-09.png). Water is still too flat and its
streaks too wire-like compared with the irregular painted reference: further
lighting/reflection and streak breakup refinement remains. Overall scene
fidelity is not complete.

Pass 10 replaces the forester's flat polygon tiles with individually cupped,
tapered leaf shingles, thin lower skins, central ribs and fine branching veins.
Focused rebuild: scripts/ant-colony/forester.py. Blender export and actual editor
reload/capture passed (tmp/ant-colony/pass-10.png). Upper courses are raised to
reduce intersection; vein contrast was reduced after the first capture. Roof
outline and foliage color are closer, but architectural silhouette/detail and
the broader scene remain unfinished.

Pass 11 rebuilds red workshop roofing with staggered sculpted shell plates,
rounded exposed lips, varying relief, smooth shell normals and three transverse
metal braces. The woodcutter now has a heavy ridge timber, capped ridge posts
and eave logs. Rebuild with scripts/ant-colony/red-workshops.py; Blender export
and in-engine capture verified (tmp/ant-colony/pass-11.png). Shell forms remain
too regular and workshop equipment/stock staging still needs closer matching.

Pass 12 replaces disconnected pine sprays with broad connected scalloped
boughs, randomized tier phases and drooping tips. Adds subtle object-space
needle variation in the shared Ant material shader. Blender forest export,
build and actual editor shader capture passed (tmp/ant-colony/pass-12.png).
The silhouettes are fuller, but needle detail, forest distribution and lighting
still need closer matching; this is not a completion checkpoint.

Pass 13 varies tree height and scale and removes 51 trees through deterministic
cluster gaps (2463 total stamps). Forest default sunlight is 1.45 with #ffedcf
tint, preserving the frozen 10:00 map setting. Actual editor capture saved at
tmp/ant-colony/pass-13.png; build, 7 map roundtrip tests and 2 environment tests
pass. Further lighting fidelity remains unresolved; do not infer an exact match
from these checks. The isolated preview has no saved preset override.

Pass 14 authors irregular 12-log piles with varied radii, lengths and staggered
ends; the comparison wood yard adds four loose pieces (16 total). The sawmill
has sixteen varied boards in four layers, rotated and centered in front of its
feed area. Focused Blender rebuild: scripts/ant-colony/stockpiles.py. Exports and
actual map capture verified (tmp/ant-colony/pass-14.png). Equipment visibility,
log surface detail, building silhouettes and overall fidelity remain unfinished.

Pass 15 projects the sawmill feed mechanism 0.65m beyond the canopy, adds
blade thickness and heavy feed supports, and separates the finished plank pile.
Worn steel keeps a stronger diffuse contribution (metalness .4, #c3c8c7) to
remain legible in forest shadows. Blender export, build and real-editor shader
capture verified (tmp/ant-colony/pass-15.png). The blade is now visible at normal
zoom. Full reference fidelity, including fort/terrain/material depth, is pending.

Pass 16 opens the fort entrance, replacing obstructing door planks with side
reveals and a recessed floor. Root centerlines are smoothly interpolated and
shaded, preserving their buttress shape. The left banner is raised clear of the
roof; entrance canopy uses the revised shell plates. Focused rebuild:
scripts/ant-colony/fort-only.py. Blender export and real-editor capture verified
(tmp/ant-colony/pass-16.png). The main dome remains too regular; target fidelity
is still incomplete.

Pass 17 removes radial crown seams from the fort roof by laying broad panels
across its long axis. Adds heavier capped/banded parapet posts and tapered
modeled flame tongues. Blender export and actual editor capture verified
(tmp/ant-colony/pass-17.png). Main shell is more cohesive, but it still needs
more irregular sculpted edging and material depth to match the approved crop.

Pass 18 adds deterministic Blender BVH hemisphere contact shading on the fort's
export mesh: 16 cosine-distributed rays, 1.15m reach, bounded .42–1 multiplier.
All 20 glTF material groups contain COLOR_0; decoded data verifies .42–1 range
across 84,144 samples. No screen-space runtime pass is added. Editable pieces
remain intact; the export function regenerates the bake. Actual editor capture
verified (tmp/ant-colony/pass-18.png). This improves local depth but does not
resolve the broader target mismatch. Other assets are not yet baked.

Pass 19 extends baked contact shading to lumberjack, sawmill, forester, log-stack
and plank-stack. All 44 exported material groups contain matching vertex-color
and position counts. Real-editor capture verified (tmp/ant-colony/pass-19.png).
63 renderer/shared/grounding tests across 15 files pass. The bake adds local
depth; the scene still falls short of the reference in materials, terrain,
foliage and composition.

Pass 20 adds original worker-carry.glb, with raised forearms and gauntlets
aligned to the cargo anchor. The simulation renderer toggles idle/carry visual
children using existing quantity state, preserving entity identity and all
deterministic economy logic. Comparison map cargo offsets rotate with workers.
Blender export and editor pose capture verified (tmp/ant-colony/pass-20.png);
build and 14 settlement/carrier/lockstep tests pass. A complete gameplay visual
audit and the overall reference match remain unfinished.

Pass 21 lowers upright grass stamps, reduces Forest flower size, and uses
stable spatial noise for cover clusters and correlated color variation. Adds
22 partly embedded small path stones. Authored map now has 2488 stamps. Build
and real-editor capture verified (tmp/ant-colony/pass-21.png). Ground reads lower
and less like lawn, but moss texture/material fidelity remains unfinished.

Pass 22 breaks water contours into variable-width fragments using a second
spatial mask, removing the continuous wire-like loops. Deepens blue-gray base
colors while keeping silver streaks independent. Build and actual shader
capture verified (tmp/ant-colony/pass-22.png). Water still needs more convincing
depth and bank interaction to match water.png.

Pass 23 exposes a copied active lighting diagnostic and verifies Forest really
uses sunStrength 1.45, tint #ffedcf, actual sun intensity 3.574 at 10:00. Scales
the authored fort to 1.95, workshops to 1.45/1.5/1.4 and moves gate guards clear
of the expanded footprint. Comparison map regenerates 2396 stamps. Build and
actual capture verified (tmp/ant-colony/pass-23.png). Larger building proportions
are closer, but modeling/material and overall reference fidelity remain open.

Pass 24 adds original elephant-leaf.glb: three cupped broad leaves, curved
stalks, modeled midribs and lateral veins. Four bank/forest placements establish
insect scale. Blender export and real editor capture verified
(tmp/ant-colony/pass-24.png). The shoreline leaf reads clearly, though overall
foliage shapes and density still differ substantially from the target.

Pass 25 refines stream highlights into smaller, irregular flecks using two
contour frequencies and an additional breakup mask. Rejected the intermediate
continuous squiggles after actual capture; final v10 capture is
tmp/ant-colony/pass-25.png. Shader compiled in the running editor. Water depth,
bank interaction and overall reference fidelity remain unfinished.

Pass 26 replaces flat conifer bough sheets with closed rounded needle masses
and smaller lateral shoots across all three pine variants. The first export
was 40,648 triangles/tree; narrowed shoots plus runtime-only decimation reduce
that to 10,200, with five material batches. Editable Blender geometry retains
its construction detail. Actual final export checked at the locked camera
(tmp/ant-colony/pass-26.png); model script syntax and diff whitespace checks
pass. Earlier intermediate status loaded all 2400 stamps with no failures.
Trees read more volumetrically, but foliage/material fidelity and full scene
matching remain unfinished. No completion claim.

Pass 27 changes Forest meadow distribution from a near-uniform lawn to
multiscale colonies with exposed soil, shifts the foliage toward olive, and
adds per-vertex dark bases / brighter raised folds. Rejects the first overly
round isolated patches in favor of finer connected coverage. Gives shader
variants distinct cache keys so flower and broad-leaf treatments cannot share
the wrong compiled program. Final build and actual editor capture pass
(tmp/ant-colony/pass-27.png). Ground still needs finer material variation and
the full reference match remains incomplete.

Pass 28 replaces the rounded rock primitive with a beveled fractured bank
stone. Moss uses vertex tint on the crown, retaining the stone shader's grain;
the rejected first polygon-cap version is not exported. Banks now contain
overlapped, partly buried groups separated by bare shoreline. Authored map
has 2386 stamps. Focused rebuild: scripts/ant-colony/rock.py; whole forest
rebuild uses the same bank_stone function. Final actual-editor capture verified
(tmp/ant-colony/pass-28.png); seven UTC map tests pass. River depth, forest
fidelity and overall reference matching are still incomplete.

Pass 29 rebuilds the plank item with slight bowing, varied width/thickness,
beveled edges and light cut ends. Stack contains sixteen boards in 5/4/4/3
rows with staggered lengths. Rotates the authored stockpile across the sawmill
frontage instead of pointing it toward the camera. Focused Blender rebuild:
scripts/ant-colony/planks.py. Verified 48 source parts (16 boards), COLOR_0 in
all five stack material groups and actual engine capture
(tmp/ant-colony/pass-29.png). Further material/sculpt detail and the overall
reference match remain incomplete.

Pass 30 removes dead painted-grass code from the terrain shader and removes
three superseded texture files: terrain/grass.png, grass-normal.png and
sand-normal.png. No tracked references remained before removal. Dirt relief
now derives from the same soil atlas sample as color, using screen derivatives
and masking cliffs/submerged ground/snow. Soil seasonal tint is neutral in
summer with mild autumn warmth; vegetation retains its own seasonal system.
Final build, nine map/environment tests, and real editor capture pass
(tmp/ant-colony/pass-30.png). Other legacy assets still require replacement
and the overall visual goal remains incomplete.

Pass 31 changes fort torches from bright yellow droplet silhouettes to layered
orange outer tongues, gold mid-flame and smaller pale cores. Uses emissive
color without an additional sunlit diffuse contribution. Blender export and
actual editor capture checked (tmp/ant-colony/pass-31.png). Flame accents read
more clearly, but local glow/lighting and overall fidelity remain incomplete.
Runtime audit confirms house, tower and stonemason still use legacy GLBs in
settlementLayer.ts and must be replaced before obsolete asset cleanup is done.

Pass 32 adds original house, tower and stonemason GLBs, catalog entries and
gameplay URLs; removes their three superseded assets/props/settlement GLBs
after checking tracked references. Regenerate these with support-buildings.py
after models.py for a full source rebuild; tower-only.py is a focused rebuild.
Verified their actual renderer appearance in pass-32-support.png, then restored
the reference comparison map (pass-32.png). The preview is temporary and does
not change the saved reference layout. Corrects stone atlas projection to
triplanar mapping, removing stretched stripes on horizontal foundation faces.
Final build and all 14 carrier/settlement/lockstep tests pass. Gameplay asset
URLs are integrated, but a full live gameplay visual audit and the overall
reference fidelity remain incomplete. Supporting buildings need further
sculpt/material refinement alongside the main asset set.

Pass 33 adds original generated moss-surface.png (built-in imagegen; exact
prompt/provenance in materials/MOSS.md). It modulates the low foliage meshes
in world coordinates with one shared texture, retaining geometry lighting and
shadows. Actual editor capture and build verified (pass-33.png). The additional
leaf surface variation helps, but overall terrain/foliage and architecture
fidelity remain incomplete.

Pass 34 closes a gameplay integration gap: Ant pine models were not recognized
by resource discovery. A simulation-owned asset mapping now recognizes all
three pines and an explicit ant-stone-deposit catalog alias. Decorative ant-rock
and stored ant-item-stone remain non-resources. Legacy IDs remain readable.
New tests compare a migrated resource layout against the old one over 3000
ticks, verifying identical checksum and successful harvesting; all three pine
variants are covered separately. Build and 16 economy/lockstep tests pass.
Saved-map audit found legacy scenery in every older map; Twinwater-Reach still
uses 474 pine-chunky instances and 30 rock-rounded-cool resource instances.
Those maps still need visual migration with dimensions and resource semantics
preserved. This is not completion of the overall visual goal.

Pass 35 migrates Twinwater Reach's 474 pine and 30 stone resource stamps to
original Ant assets. Migration uses actual mesh bounds to preserve apparent
width/height and retains identifiers/positions. Variant assignment respects
its 180-degree symmetry about (128,128); rerunning is idempotent. All 618
resource nodes remain identical, with matching simulation checksum after
1000 ticks. Original map backup is in tmp/ant-colony for this verification.
Twinwater now owns 38 low forest-cover patches, path/water filtering and
starting-fort clearings, plus paused 10:00 Forest lighting. Session startup
no longer overrides the map's paused clock. Actual gameplay capture:
tmp/ant-colony/pass-35-game.png, no JavaScript exceptions, HUD approximately
40fps. Build and 20 map/settlement/carrier tests pass. Restored isolated
preview to ant-colony-compare afterward. Old broadleaf/flower scenery is
still present in Twinwater and other saved maps; legacy asset removal and
reference fidelity remain unfinished. Ground coverage still looks too
uniform, and architecture needs more sculpted detail.

Pass 36 rebuilds the sawmill working area: shorter canopy, exposed timber
work bed, transverse feed log with iron collars, spoked side crank, axle,
and offcuts. Both red-roof workshops now have solid metal braces projected
onto the actual shingle surface (BVH ray sampling), fixing the floating
fixed-radius bands without intersecting raised shingles. Narrower polished
edges retain the metal silhouette. Rebuilt item-log and log-stack have
irregular longitudinal bark facets and fissures, retaining original counts.
New focused regeneration entry point: scripts/ant-colony/logs.py.
Wood shader grain now follows each part's authored UV direction instead of
crossing rotated beams along a fixed model axis. Verified actual engine
close-up and standard comparison capture (tmp/ant-colony/pass-36.png).
Intermediate fixed-height brace adjustment was rejected after visible
intersections; the final capture uses surface-fitted braces. Architecture,
foliage, terrain, ants and overall reference fidelity remain incomplete.

Pass 37 reshapes the forest understory from upright five-leaf rosettes into
low staggered three-leaf shoots. Broader leaves sit just above the terrain
instead of inheriting the old buried-grass offset. Softer vertex contact
shading and slightly lighter forest material retain green coverage while
showing more dirt between shoots. Runtime clumps drop from 180 to 144
triangles (20% fewer), with the same instancing and authored map patches.
The first flattened attempt buried too many leaves and was rejected after
engine inspection. Final standard-camera capture: tmp/ant-colony/pass-37.png.
The overall visual goal remains incomplete, especially forest arrangement,
architecture detail, lighting depth and bank integration.

Pass 38 reshapes the main fort toward its close-up reference: narrower/lower
recessed gateway, lower entrance canopy, layered log shoulders with iron ties,
flatter main vault and a front transverse iron belt. Dome ribs now ray-project
onto the modeled shell instead of floating on a fixed offset ellipse. Paired
cut stakes and binding straps enrich the parapet crowns. Updated source and
GLB verified by actual GLTF load (22 material meshes) and engine capture
(tmp/ant-colony/pass-38.png). Blender MCP timed out during the second export,
but subsequently written GLB/source/manifest proved completion; no duplicate
rebuild was launched. Final shape remains simpler than the approved image;
roof plate individuality, forest composition and overall fidelity are still
unfinished. Gameplay definitions and loaded-map geometry were not changed.

Pass 39 opens the comparison forest into less continuous groups: 221 pines
instead of 254, narrower crowns and retained varied heights. All authored
terrain, landscape settings, paths, river and player starts remain unchanged.
Map validation: 7 tests pass. Direct isolated-browser capture verified the
updated scene (tmp/ant-colony/direct-39.png). Editor bridge map-load/status
requests timed out; browser Page.reload recovered responsiveness, but the
bridge screenshot connection then closed. A direct CDP screenshot succeeded,
so no duplicate browser or map job was created. That capture includes editor
UI and differs in viewport height from the standard comparison screenshot.
Overall forest fidelity remains incomplete: species variety, ground layering,
canopy shape and the reference's organic composition need further work.

Pass 40 changes river highlights from dense fixed-axis speckles to flow-aligned
sampling with broader quiet regions and fragmented shallow-bank foam. The
first contour-based version produced closed vein-like loops in the real
render and was rejected. Final stream-v12 uses tapered high-value patches
with breakup instead. Direct browser capture verified the changed water
(tmp/ant-colony/pass-40-direct.png); it includes editor UI and uses a different
camera from the standard comparison. Repeated editor screenshot bridge
requests timed out or closed after reconnection, so no standard-camera result
is claimed for this pass. Final build passes. Rock-specific eddies, depth,
reference color balance and overall scene fidelity remain incomplete.

Pass 41 adds reference-stage.html and scripts/ant-colony/capture.mjs: the real
renderer loads the canonical saved map at a fixed camera and animation time,
without editor chrome. Two successful 1681x937 captures (pass-41.png and
pass-41-repeat.png) were visually checked; they are not byte-identical.
Production build passes. The user subsequently reported closing the laptop
through the interrupted session. No underlying renderer timeout bug is claimed.

Pass 42 retires all nine previous project maps, preserving ant-colony-compare,
and creates Mosswater Divide from scripts/ant-colony/mosswater.py. This is a
256-square, 180-degree symmetric battlefield: starts at (210,210)/(46,46),
clear home pads, paired timber/stone, three dry river crossings, forest routes,
and a central expansion clearing. All scenery uses original ant-colony assets;
no decorative forts or units occupy playable space. Forest time is locked at
10:00. The editor default and network validation fixtures now use this map.
The retired local-storage map library is cleared once by moving to v2.

The first full-map render exposed foliage budget starvation. Candidate counts
are now shared proportionally across cover patches; the one-patch comparison
scene retains its original budget. Real-engine wide capture mosswater-wide.png
confirms coverage across the center. Ten map/playability/two-client lockstep
tests pass, including terrain and prop symmetry, spawn clearance, dry crossing
connectivity, construction and population growth. Production build passes.
This is a playable layout, not a claim of final balance or reference fidelity.

Pass 43 prioritizes measured runtime efficiency with user-approved minor detail
tradeoffs. Dense forest moss moves to a terrain texture mask plus sparse leaves;
pines receive baked distant LODs, and props/cover use spatial batches. Fixed
whole-forest rebatching on ordinary economy revisions. Water uses wet-cell
visibility and cached 15 Hz stationary reflections, and shadow coverage follows
zoom. Added persistent F3 profiling and 50/75/100% native render resolution.
See src/debug/performance.md for methodology and benchmark limitations. Latest
uncapped local initial-view benchmark averages ~220 FPS at 1681x850; both CPU
and GPU p95 are below 8.33 ms. Build and 8 targeted tests pass. Final comparison
capture checked visually; the broader art-reference goal remains incomplete.
