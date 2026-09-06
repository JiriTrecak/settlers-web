# Assets

No dump pipeline. No S3 textures. Destination art is glTF + PBR — [`art.md`](../game/art.md). Author in the [world editor](editor.md).

Catalogue file: [`assets/catalog.json`](../../assets/catalog.json). Default the editor opens. Each entry has `name`, `category`, `type` (`prop` or `water`), and a `file` relative to the catalogue. `water` stamps sit on the sea and only land on wet cells.

## Now

`pine` / `pine-dark` / `pine-umber` (foliage) + `boulder` (cell rock) + `rock` / `rock-cleft` / `rock-slab` (block-sized, ~16 cells) + `lily` / `lily-white` / `lily-gold` (water, wet cells only). Catalogue modal to pick / create. Stamp places the selection.

## First wave

Landscape only. Readable from iso. No units or buildings until the diorama reads.

| Next | Why |
|---|---|
| oak | Deciduous contrast |
| fern | Understory |
| mushroom | Insect-world flavor |
| log | Breaks the grid |
| berry | Future resource, still a prop |
| burrow | Race landmark later |

## Refusals

- Shipping original S3 pixels.
- A second dump catalog.
- Starting with units or buildings.
