# room

Mailbox. `confirm(player, through, bundles)` stores actions by tick. When every playing slot has `through >= T`, broadcast `commit { tick: T, slots }` in player order. Does not run sim.
