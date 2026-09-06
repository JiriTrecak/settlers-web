# world

Match sim. Owns `Clock`, rng, square map size, and one `Player` per `MatchConfig` slot. `enqueue` from a Room `commit`. `tick()` applies due actions (none mutate this pass) then increments the clock. `checksum()` mixes tick, rng, size, and each player's id + cell. `view()` is what render draws.
