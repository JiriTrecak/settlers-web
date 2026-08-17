# pathLayer

Debug overlay of remaining walk queues. Off until `Renderer.setShowPaths`. Draws on the world container above iso (same stack as ghost / hover) so huts do not bury the lines.

Polyline: interpolated sprite position → current step dest (`pos`) if walking → `MovableView.path`. Skips `inside`. Cyan, stroke inverse to zoom.
