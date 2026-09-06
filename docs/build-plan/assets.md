# Assets

No dump pipeline. No S3 textures. Destination art is glTF + PBR — [`art.md`](../game/art.md). Author in the [world editor](editor.md).

Catalogue file: [`assets/catalog.json`](../../assets/catalog.json). Default the editor opens. Each entry has `name`, `category`, `type` (`prop`, `water`, or `span`), and a `file` relative to the catalogue. `water` stamps sit on the sea and only land on wet cells. `span` sits on the sea, any cell (bridges).

## Now

Handmade: `pine` / `pine-dark` / `pine-umber` + `boulder` + `rock` / `rock-cleft` / `rock-slab` + `lily` / `lily-white` / `lily-gold` + `bridge-8` / `bridge-16` / `bridge-32`. Plus Synty POLYGON Nature (`synty-*`, 197 meshes) as block-in — lilies/reeds are `water`, the curved bridge is `span`. Re-import with `npm run import:synty`. Catalogue modal to pick / create. Stamp places the selection. `R` yaws 90°.

## First wave

Landscape only. Readable from iso. No units or buildings until the diorama reads.

| Next | Why |
|---|---|
| restyle Synty | Pack is block-in; art canon is AoE4, not low-poly |
| berry | Future resource, still a prop |
| burrow | Race landmark later |

## Refusals

- Shipping original S3 pixels.
- A second dump catalog.
- Starting with units or buildings.
