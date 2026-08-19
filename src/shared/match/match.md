# match

`MatchConfig` is frozen at room Start. Seed, D, slots, map id + revision. SP `localMatch` uses D=1 (in-process Room). MP `COMMAND_DELAY` is 8 ticks / 200 ms — MATCH_HOST London RTT from the west coast is ~150 ms. Confirm `through` this far ahead of `tickIndex` so the clock is not 1 tick per RTT.
