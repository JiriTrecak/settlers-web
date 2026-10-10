# Warcraft ground texture source import

The supplied Rebirth replacement directory is an overlay. Missing diffuse,
normal, or ORM channels resolve independently against the locally installed
Reforged `_hd.w3mod` archive. The import does not modify Warcraft or read its
account settings. No installed game or source directory is needed at runtime.

Build the optional offline reader with:

```sh
python3 scripts/assets/warcraft/build-extractor.py
```

It builds pinned MIT [CascLib](https://github.com/ladislav-zezula/CascLib) in
`.asset-work/tools/casc-reader`, enforcing read-only local stream access.
Alternatively supply an executable implementing the three-argument interface
in `casc-extract.cpp`.

Import the materials used by the supplied test maps:

```sh
node --import tsx scripts/assets/import-warcraft-terrain.ts \
  --replacement '/path/to/HOTS MODE' \
  --installed '/Applications/Warcraft III/.build.info' \
  --extractor .asset-work/tools/casc-reader/casc-extract \
  --tiles Ldrt,Ldro,Ldrg,Lrok,Lgrs,Lgrd,Zsan
```

Omit `--tiles` to import all ground definitions touched by the replacement
directory. Names and source paths come from the installed `terrain.slk`.
Missing channels, differing atlas dimensions and unsupported formats fail
before publication. Publication uses the existing asset transaction and write
lock; it preserves unrelated definitions.

Each ground texture is one `terrain-material` asset. Its definition declares
the image references, world tile size, full-tile variants, and sixteen corner
transitions. Atlas coordinates use row-major top-left image coordinates and
corner bits NW=1, NE=2, SW=4, SE=8. Source tile IDs are import lookup metadata.
The full diffuse atlas and alpha are retained, normals retain their directions,
and ORM is separated into occlusion, roughness and metalness images. BC5 XY
normal maps reconstruct the positive Z component. No height is invented from
color. The thumbnail shows a complete ground tile, not the transition atlas.

Three compressed RGBA resources supply uniform-resolution GPU arrays: albedo
with roughness, normal with transition opacity, and occlusion with metalness.
Channels are resized independently to avoid alpha premultiplication. Full-size
PNG and DDS sources remain intact. The declared linear reflectance scale (.25
for these imports) matches the existing scene lighting without recoloring source
pixels. Terrain rendering uses the declared atlas corners; the editor shows the
declared thumbnail beside the texture name.

Source DDS files are retained as numbered `source.bin` resources; `source_4.json`
records per-channel origin, content hashes, packing and the source terrain
definition. PNG runtime resources and thumbnails use the normal asset manifest.
There is no runtime pack object or dependency on generator output caches.

Atlas numbering follows the source implementation in
[mdx-m3-viewer](https://github.com/flowtsohg/mdx-m3-viewer/blob/master/src/viewer/handlers/w3x/map.ts)
(`getVariation`) and its ground vertex shader. The original images retain their
respective ownership; they are imported sources, not generated original art.
