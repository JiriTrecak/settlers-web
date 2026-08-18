# hud

In-match overlay: compact fps + cursor always on. FPS on the compact line is sampled once a second (frame count / elapsed); F3 still dumps the live EMA. When sim work is visible, compact also shows `sim Nms Nt`. F3 / ` / the F3 button expands frame cost (sim / draw / snap / mini), per-tick phase timings (flock, fog, matcher, …), entity counts, jobs, stacks. Overlay toggles: **fog** (default on; off = omniscient view), **paths** (walk queues), **ownership** (owned cells, player tint 50%). **claim** arms a click tool that stamps a tower-radius occupy disk. Styles in `styles.css`.

**Exit** (left of the minimap) asks before tearing the match down. Escape deselects (ghost → claim → hut); it does not leave. Speed under the minimap. Replay watch: claim hidden; timeline is bottom-middle.
