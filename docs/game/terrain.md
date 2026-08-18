# Terrain

The map is a square grid (`width × width` for original dumps). Each cell has a landscape type and a height.

## Landscape

Types are the domain names (`grass`, `earth`, `water8`, rivers, …). Water and river are **unwalkable**. Everything else is walkable unless an object or hut wall sits on the tile.

Procedural islands must obey the neighbor-blend table or the mesh will not pick the right diamonds. Dumped maps already do.

## Height

Dump heights are 0–127. Each step lifts the diamond **2 px** up the screen (`y' = 9y - 2h`). Hover/select ray-tests the same height-displaced triangles as the mesh — a flat inverse would highlight tiles north of a mountain.

## Iso

Tile diamond is **16×9 px**. Grid origin is the north corner of the map diamond.

```
x' = 16x - 8y
y' = 9y - 2h
```

Draw order (`isoDepth`): south in front, then east. Bias on the same pixel: waves < units < props < buildings, so a stone covers a settler and a hut covers a prop.

## Walkability

A tile is standable when:

- in bounds
- not water / river
- no tree / stone / stack
- no hut **blocked** tile (the walls, not the protected skirt)
- no other unit occupying it (`inside` units do not occupy)

Pathing is BFS on walkable tiles. Once any occupy disk exists, civilians also refuse tiles they do not own.

Hex neighbors are the six diamond steps (ne, e, se, sw, w, nw). Distance is hex: same-sign axes take max, otherwise manhattan.

## Ownership

Per-tile owner (`-1` unowned) plus a tower-count. A finished occupying building (HQ and extra T1 towers) or debug **claim** click stamps a disk of radius **40** using axial distance (`Y_SCALE` ≈ √3/2), clipped to the map. Same-player overlap extends the blob. Destroying an occupying hut (or a future release) drops that disk; remaining towers keep theirs. Tiles another player already enforces (`towerCount > 0`) stay theirs, except the clicked cell on a **tower** occupy. Pioneers cannot take enforced tiles at all — they flip one unenforced tile after a 1.2 s kneel.

Once any disk exists, new huts must sit entirely on that player's land (`protected` tiles). Foresters plant and lumberjacks chop only on owned tiles (`acceptWork` / plant search). Settlers with `needsPlayersGround` (default true) path and flock on their own ground.

Rim posts: owned, not water, hex neighbor a different owner (not water). Drawn only while that tile's sight is >50 (player-tinted `props/border`). F3 **ownership** is the debug fill on top.

## Fog of war

Per-player sight 0–100 on every tile. Graphics multiply color by `sight/100`. Sim is omniscient — fog is a view layer.

Finished huts and units stamp a padded disk (`radius + 1.5×10`). Inner `radius + 5` is full 100; each ring outside knocks 10 off. Once a tile has been ≥50 it never returns to 0 (explored floor). Sight walks toward that target at 30/s. Match start snaps the colony's circles so the first frame is already fully lit; a tower you finish later still fades in.

| sight | terrain / trees / stacks / huts | units | border posts |
|---|---|---|---|
| 0 | nothing | nothing | nothing |
| 1–50 | dimmed (frozen snapshot if the tile left 51+) | hidden | hidden |
| 51–100 | dim→full | drawn, tinted | drawn |

Snapshots freeze landscape, height, object, and hut origin when sight crosses down through 50. Clear when it goes back above 50. Until flatten exists, the terrain mesh still uses live height — objects and huts are the part you actually notice.

View distance is an attribute on the def: plan/scaffold **0**, empty worker hut **5**, occupied or workerless = `def.viewDistance` (tower **38**, most work huts **0**). Units default **8**. Tweaking the number is enough; the circles, dimmer, and snapshots are already wired.

## Things on tiles

At most one object per cell: tree, stone, or goods stack. All three block walking.

- **Trees** — seven sheets, wind loop. Saplings grow 7 minutes then become adult. Chop plays a fall clip (last 1.5 s of a lumberjack’s 6 s axe). Growing trees are not choppable.
- **Stones** — capacity is remaining cuts (not wired to a stonecutter yet).
- **Stacks** — one material, max **8**. Pickup decrements; 0 removes the pile.

Waves are not objects. They stamp on a 4-hex lattice where all six neighbors are water. Map edges get none (OOB is not water).

## Maps

Playable maps come from dumped JSON (`heights`, `landscape`, `trees`, `stones`, `starts`) or a procedural island preset. Original `.map` files are not parsed at runtime.

Match start uses `starts[0]` as the HQ cell (player clothing color is chosen in the lobby and is independent of slot).
