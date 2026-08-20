# command

`CommandBoard` turns selection into a 12-slot `CommandPage`. The widget does not know lumberjack from stop. `CommandBoard.key` fires the enabled slot on that page whose `hotkey` matches — idle **B** is Build; **L F S W H T** only exist on the build page.

Idle: **Tools** (slot 9) + **Recruit** (slot 10) + **Build** (slot 11, B). Build → `PLACEABLE` huts (icons from catalog `built` paths; L lumberjack, F forester, S stonecutter, W sawmill, H house, T tower) + **Industry** (I) → iron mine (I) / gold mine (G). Recruit → Swordsman (click-spawn `spawnUnit` for now; barracks queue later) + Pioneer (**C**) + Geologist (**G**). Pioneer / geologist click converts the closest idle empty-handed bearer and sends them toward the tile (bearers are not selectable). Tools → Fewer / Digger / More and Fewer / Bricklayer / More (±1 each; badges `have → cap` while filling). Empty 0/0 hides; a plan, scaffold, inbound occupy, or blade-equip paints `have → queued` (e.g. `0 → 1`). Hut selected: **Delete** (slot 0, owned + can command) + **Area** (slot 1, outdoor huts with `workRadius` > 0) + **Cancel** (slot 11, same `page.back` as drill Back). Area arms a map click that `send`s `setWorkArea`. Units: empty grid; middle pane shows the name.

Escape: drop the place ghost, then pop the drill (Industry → Build → idle), then the rest of Session deselect.
