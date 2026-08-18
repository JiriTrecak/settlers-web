# Assets

Loads pictures (and later sounds). The engine never sees original `.dat` / `.map`.

Dumped graphics answer: given a catalog key, give me a Pixi `Texture` + offset. Conversion lives in `original_conv/`. Shipping uses our atlas. Same keys.

Never commit `GFX/`, `SND/`, or original `MAP/` binaries. `src` never imports `original_conv`.

## Now

- Landscape atlas + UV table (`landscape-atlas.png`, `atlasPositions.ts`)
- Catalog JSON → decoration / building / settler sheets
- Maps as dumped JSON (`heights`, `landscape`, `trees`, `stones`, `starts`)

Decoder, DAT pointer tables, dump scripts: `original_conv/`. Tests there use **hand-authored** mini buffers, not ripped game files.

## Later

- GUI PNGs for HTML (don't draw GUI in Pixi)
- `SND/` / music (Web Audio). Separate from this pipeline. Not P2.

## Refusals

- Shipping original pixels in git or a public build.
- CPU-blitting DAT every frame. Decode once → GPU texture.
- A new addressing scheme that doesn't round-trip the existing atlas / catalog keys.
