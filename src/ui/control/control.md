# control

`GameControlPanel` is the bottom chrome: minimap well + mode-strip scaffold, selection facts, 4×3 command grid.

Session mounts `Minimap` into `minimapHost` and pushes `CommandPage` / `SelectionView`. Clicks emit `onCommand(id)` only — no World, no place-tool.
