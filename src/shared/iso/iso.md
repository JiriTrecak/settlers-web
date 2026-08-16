# iso

Tile diamond is 16×9 px. Height displaces `(0, 2)` per unit. Y is Pixi-down.

`x' = 16x - 8y`, `y' = 9y - 2h`.

`worldToGrid` / `pickGrid` ignore height. Don't invert with height or clicks miss hills.
