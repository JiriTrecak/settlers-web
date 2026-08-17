# borderLayer

Occupy rim posts. Catalog `props/border`, player-tinted (torso if present, else the whole sprite). Always drawn. Wave-depth so a tree on the same tile covers the post.

A tile is a post when it is owned, not water, and a hex neighbor is a different owner (also not water).
