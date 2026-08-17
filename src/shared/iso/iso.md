# iso

Tile diamond is 16×9 px. Height displaces `(0, 2)` per unit. Y is Pixi-down.

`x' = 16x - 8y`, `y' = 9y - 2h`.

`worldToGrid` / `pickGrid` are the height-0 inverse (minimap frustum). Hover/select use `pickCell`, which tests the same height-displaced triangles as the mesh — otherwise mountains highlight several tiles north (`y' = 9y - 2h`).
