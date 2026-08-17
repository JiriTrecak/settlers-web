# borderLayer

Occupy rim posts. Catalog `props/border`, player-tinted (torso if present, else the whole sprite). Hidden at sight ≤50. Wave-depth so a tree on the same tile covers the post.

A tile is a post when it is owned, not water, and a hex neighbor is a different owner (also not water).
