# Day/night lighting

The outdoor clock now samples four authored looks in `src/shared/environment/daytimes.json`.
Original, unchanged XML files are retained in `art/references/daytimes/` (provided by the user with permission for testing).

At the default 600-second cycle:

- Day: 06:36–17:24 (270 seconds), every lighting attribute held constant.
- Dusk: 17:24–18:36 (30 seconds), day → day_to_night → night, source dusk look at 18:00.
- Night: 18:36–05:24 (270 seconds), held constant across midnight.
- Dawn: 05:24–06:36 (30 seconds), night → night_to_day → day, source dawn look at 06:00.

Durations are our chosen schedule: the source files contain no timing information.
Transitions use smoothstep and interpolate RGB in linear light; source multipliers interpolate separately.
Sun direction describes travelling rays, so Three's light position uses its negation.
Canopy/cloud animation remains independent. Sun shadows move as the authored directions blend.
The editor's Light buttons jump to the exact four looks; the full cycle slider supports the default 600 seconds.

## Renderer mapping and limits

- `g(R;G;B[;A])` is interpreted as sRGB bytes with optional alpha; the XML does not define `g()`'s transfer function. HDR multipliers are retained literally.
- Ambient → Three AmbientLight; SunColor → DirectionalLight; SkyColor → background and hemisphere sky fill. Hemisphere ground fill is a neutral, low-intensity adapter, not the XML's Colorize effect.
- Outdoor exposure is a fixed 0.28 for every phase to adapt the source HDR values to our existing ACES output. It does not brighten night dynamically or change any source multipliers. Portrait exposure remains independent.
- Fog uses all supplied fields: color and multiplier, density, distance onset, height onset, and exponential height dispersion. Its analytic height integral and base-2 extinction are ported from the recovered `Common.fxh::ComputeFog`, including its epsilon. The source's optional base-height argument is zero; we use our world units directly.
- Distance fog is composited with depth, stops at the water plane, and is masked by fog of war. It still works when volumetric god rays are disabled. With volumetrics enabled, both effects share the existing composite pass.
- Outdoor environment presets now default to neutral modifiers. The preset storage key is v2 so old tint multipliers cannot silently contaminate imported colors. Optional editor modifiers remain available; fog distance 100 and white tint preserve the source fog settings.
- Interior maps bypass the outdoor cycle and keep their own lighting.

The four actual `TextureColorLUT` volumes are applied in the existing composite pass, with the exact two-volume blend from `PostProcess.fx`. Their source DDS files live beside the XML. `scripts/assets/import-daytime-luts.ts` converts their uncompressed BGRX texels to RGBA losslessly; the runtime loads the tiny volumes synchronously, with linear filtering, clamp addressing, no mipmaps, no texture gamma conversion and no coordinate remap. The source identity volume verifies the axis order: x = red, y = green, z = blue. Grading is masked by our visibility texture to avoid illuminating unexplored terrain; interiors bypass it.

**Color-space adapter:** we feed display RGB (after our ACES and sRGB output conversion) to these LUTs. The source shader itself does not establish the encoding of the input render target. Matching every pixel will also require that render-target format/encoding and the source light/material response; matching the shader formula alone cannot establish that. The fixed exposure above remains an explicit adapter.

## Recovered shader cache (2026-09-19)

The provided `ShaderCache.sdc` has a 12-byte little-endian header (version 20250914, packed size 166168616, decoded size 599998027), followed by a zlib stream. Its decoded records contain HLSL source in addition to compiled shader data. Only the three relevant source files are preserved in `art/references/daytimes/shaders/`; the 600 MB decoded cache is not part of the project.

- `Common.fxh` supplies the height-fog integral and blend functions.
- `PostProcess.fx` supplies LUT sampling, sky-bloom composition, vignette, saturation, contrast and brightness. Sky bloom packs its mask in red and RGB tint in **GBA**, and composes using `lerp(color, BlendSoftLight(color, bloom.gba), bloom.r * 2)`. Its soft-light branch unusually tests the base color, not the blend color; do not silently replace it with a standard library approximation.
- `Colorization.fx` supplies the radial flare/color-dodge formula: `flareFactor = saturate(1 - pow(length((uv-center)*radialScale), radialPow))`; flare is multiplied by the visible-area mask, added with an additive multiplier, then applied with `color/(1-flare)`. There is also a wind-driven smoke overlay and desaturation in obscured regions.

`SkyBloomColor` and `Colorize` (including `RadialFactorScale`) are preserved and interpolate, but **are not applied yet**. The remaining dependencies are runtime bindings, not missing shader math: the radial center, exponent, additive component, smoke intensity, and construction of the sky-bloom mask. XML also omits the radial-scale default outside night (our stored default is 1, awaiting confirmation). The LUT texture dependency is now resolved from the adjacent supplied texture cache. `lightingDiagnostics()` names the two remaining gaps. No invented bloom mask or arbitrary colorization defaults are substituted.

Use `reference-stage.html?map=texture-test-1&x=128&z=128&hour=6` (or 12, 18, 22) for fixed-camera comparisons. The original visual gap in terrain/foliage is independent of this lighting work.
