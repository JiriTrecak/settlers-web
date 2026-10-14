# Warcraft ground texture source import

The installed game is the sole source. Mod directories and mixed-source channel
fallbacks are not supported. Definitive Edition is the default reference baseline; Classic and Reforged remain
explicit import options. Each import replaces a complete material set, retaining
its stable asset IDs. The import does not modify Warcraft or read account data.
No game installation is needed at runtime.

Build the optional offline reader:

```sh
python3 scripts/assets/warcraft/build-extractor.py
```

This builds pinned MIT CascLib in `.asset-work/tools/casc-reader` with read-only
local stream access. Alternatively supply an executable implementing the
three-argument interface in `casc-extract.cpp`.

Refresh all existing ground materials from the installed Definitive Edition set:

```sh
node --import tsx scripts/assets/import-warcraft-terrain.ts \
  --installed '/Applications/Warcraft III/.build.info' \
  --extractor .asset-work/tools/casc-reader/casc-extract \
  --graphics definitive
node --import tsx scripts/assets/import-warcraft-cliffs.ts \
  --installed '/Applications/Warcraft III/.build.info' \
  --extractor .asset-work/tools/casc-reader/casc-extract \
  --graphics definitive --cliffs CLdi,CLgr
```

Use `--tiles Ldrt,Ldro,Ldrg,Lrok,Lgrs,Lgrd,Zsan` for a deliberate subset. With
no subset, terrain import refreshes the existing catalogue. Names and paths
come from the installed `terrain.slk`. Unknown IDs, unavailable files, incompatible
channel atlas proportions and unsupported formats fail before publication. Publication
uses the asset transaction and write lock and preserves unrelated definitions.

Classic reads `war3.w3mod:<terrain path>.dds`. Its painted lighting belongs to
the diffuse artwork. The material uses a neutral flat normal, full roughness,
full occlusion visibility and zero metalness; these channels are explicitly
recorded as `neutral-material`, not passed off as extracted textures. The asset
declares `shading: painted`, which suppresses physical specular reflections
without disabling diffuse lighting or shadows. This is a generic material
capability, also available to original painted artwork. Reforged
reads all three channels from `_hd.w3mod:<terrain path>_{diffuse,normal,orm}.dds`.
Definitive Edition reads the same three channels from `_de.w3mod:` instead.
Never borrow channels between sets. Missing files fail the import.

To inspect the installed archive without guessing names:

```sh
.asset-work/tools/casc-reader/casc-extract \
  '/Applications/Warcraft III/.build.info' --list '*lords_grass*'
```

Each texture is a `terrain-material` asset with declared tile dimensions,
full-tile variants and sixteen corner transitions. Coordinates are row-major,
top-left; corner bits are NW=1, NE=2, SW=4, SE=8. Source tile IDs are lookup
metadata. Full-size diffuse pixels and alpha are retained without recoloring.
BC5 normal XY reconstructs positive Z. No height is inferred from diffuse color.

Three compressed RGBA resources supply uniform-resolution GPU arrays: albedo
with roughness, normal with transition opacity, and occlusion with metalness.
Source channels retain their native resolutions (Definitive normals can be twice
the diffuse resolution). Channels are resized independently to avoid alpha premultiplication. The diffuse
source bytes and full-size PNGs remain available; the scalar reflectance is
lighting calibration, not a hue adjustment. The renderer does not multiply
these atlases by an unrelated macro color texture.

The importer extracts each channel's DDS or declared neutral bytes plus a
metadata record (graphics set, per-channel origin, paths, hashes, packing). Only
the diffuse `source.bin` is kept as the package master after import. Existing aliases and map material IDs
survive refresh. Imported images retain their respective ownership.

For visual acceptance, compare source atlas pixels and the live editor first,
then inspect both imported maps at the same camera framing and hour. Keep the
forest post-processing neutral (no LUT, split tint, saturation boost or bloom)
while establishing this baseline. Texture-source fidelity does not by itself
prove equivalence with Warcraft's complete renderer.
