# match

`MatchConfig` is frozen at room Start: seed, delay D, slots, map ID and revision. SP `localMatch` uses D=1 (in-process Room). MP chooses D from the worst recent server-measured player round trip plus one 25 ms beat, bounded to 2–40 ticks. Missing measurements retain at least `COMMAND_DELAY` (8 ticks / 200 ms); a measured slower connection can require more. See `src/net/latency.md`.

Confirm `through` D ticks ahead of `tickIndex` so the clock is not limited to one tick per round trip. This buffer is not the complete input-to-display latency: input batching may add a beat, and rendering/turning have their own timing. All peers receive the same chosen delay. Loading preserves the saved delay and mailbox; a fresh restart can choose a new measured value.
