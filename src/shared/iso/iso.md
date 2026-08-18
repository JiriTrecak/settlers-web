# iso

Tile diamond is 16×9 px. Height displaces `(0, 2)` per unit. Y is Pixi-down.

`x' = 16x - 8y`, `y' = 9y - 2h`.

`isoDepth(wx, wy, bias)` is draw order: south (world y) in front, then east. Props use a higher bias than units so a stone on the same pixel covers the settler.

`worldToGrid` / `pickGrid` are the height-0 inverse (minimap frustum). Tile pick uses `pickCell`, which tests the same height-displaced triangles as the mesh — otherwise mountains pick several tiles north (`y' = 9y - 2h`).
