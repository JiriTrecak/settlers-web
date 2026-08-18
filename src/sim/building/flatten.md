# flatten

Target height is the integer mean of the hut's `protected` tiles, stored on the building when the plan drops. Diggers kneel 1s on a cell, step height ±1 toward that mean, and paint `flattened` if every in-bounds neighbor allows it (`flattenedDesert` otherwise).

Already-level plots skip — construction runs as it did before this file. Too-steep refuse is `2.5 × (Σ|h−avg|)^1.5 / n > 127`. That byte is also the construction-mark pip (0 = green/level, 127 = red). Digger count is `ceil(protected / 15)`.

Every hut flattens unless the def sets `flatten: false` (mines). Already-level plots skip.
