# graphics

Shared catalog fetch + PNG decode. Nearest, no mips. `px` (texels per world pixel) from `px.json` or catalog — HD sprites draw at `scale 1/px`, offsets stay dump/world pixels.

Match-start loads civ-paged atlases (`graphics/atlases/manifest.json`) then `loadTexture` returns sub-rects. Loose PNGs remain for HUD `<img>` and if the packer has not run. `LoadWatch` counts atlas pages (and any leftover loose files), not every catalog frame.
