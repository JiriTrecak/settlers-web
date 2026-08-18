# flatten

Target height is the integer mean of the hut's `protected` tiles, stored on the building when the plan drops. Diggers kneel 1s on a cell, step height ±1 toward that mean, and paint `flattened` if every in-bounds neighbor allows it (`flattenedDesert` otherwise).

Already-level plots skip — construction runs as it did before this file. Too-steep refuse is `2.5 × (Σ|h−avg|)^1.5 / n > 127`. Digger count is `ceil(protected / 15)`.

Only defs with `flatten: true` (lumberjack this slice) recruit. Other huts still ignore height.
