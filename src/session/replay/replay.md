# replay

Match recording for debug (and later, lockstep). File is seed + map id + action log + duration + checksum. `ReplayStore` shelves it on Victory/Defeat and on **Save replay** (in-progress: empty `defeated`).

Playback rebuilds `World` from a pristine grid clone and `replay(log, tick)`. Seeking backward clones again; seeking forward just ticks. The script opponent is not re-run — its Actions are already in the log. Timeline player dropdown retargets `world.view(slot)` (fog, and later goods) and looks at that slot's HQ. Slots come from the file (`players`, or inferred from the log).
