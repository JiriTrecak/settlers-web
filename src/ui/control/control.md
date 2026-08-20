# control

`GameControlPanel` is the bottom chrome: minimap well + mode-strip scaffold, selection facts, 4×3 command grid. Slot badges sit top-left in white; in-flight (`queued` ≠ `count`) paints `count → queued`. Slot `hotkey` sits bottom-right.

Session mounts `Minimap` into `minimapHost` and pushes `CommandPage` / `SelectionView`. Hut `needs` / `produces` paint as stacked icon rows; empty sections stay hidden. Clicks emit `onCommand(id)` only — no World, no place-tool. Keys are not handled here; `CommandBoard.key` matches the painted page.
