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

Pathing is BFS on that graph. No A* yet.

Hex neighbors are the six diamond steps (ne, e, se, sw, w, nw). Distance is hex: same-sign axes take max, otherwise manhattan.

## Things on tiles

At most one object per cell: tree, stone, or goods stack. All three block walking.

- **Trees** — seven sheets, wind loop. Saplings grow 7 minutes then become adult. Chop plays a fall clip (last 1.5 s of a lumberjack’s 6 s axe). Growing trees are not choppable.
- **Stones** — capacity is remaining cuts (not wired to a stonecutter yet).
- **Stacks** — one material, max **8**. Pickup decrements; 0 removes the pile.

Waves are not objects. They stamp on a 4-hex lattice where all six neighbors are water. Map edges get none (OOB is not water).

## Maps

Playable maps come from dumped JSON (`heights`, `landscape`, `trees`, `stones`, `starts`) or a procedural island preset. Original `.map` files are not parsed at runtime.

Match start uses `starts[0]` as the HQ cell (player clothing color is chosen in the lobby and is independent of slot).
