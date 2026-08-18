# match

`MatchConfig` is frozen at room Start. Seed, D, slots, map id + revision. SP `localMatch` uses D=1 (in-process Room). MP starts at `COMMAND_DELAY` (2 ticks / 50 ms) and should follow RTT, not 8.
