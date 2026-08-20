# graphics

Shared catalog fetch + PNG decode. Nearest, no mips. `px` (texels per world pixel) from `px.json` or catalog — HD sprites draw at `scale 1/px`, offsets stay dump/world pixels. `loadTexture` caches by path and ticks `LoadWatch` (`done / total` unique PNGs) so the match-start overlay can show which sheet is in flight.
