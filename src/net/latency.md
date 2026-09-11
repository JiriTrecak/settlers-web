# Connection measurements and input buffering

MatchHost sends an opaque `latencyProbe` nonce. WebSocketChannel echoes `latencyReply` immediately, even before App/Session listeners exist, and consumes probes outside the gameplay mailbox. The server measures elapsed monotonic time; it never accepts a client-reported duration. Unknown, duplicate, cross-member and expired replies cannot add samples.

Each connected player warms up with five sequential probes, then is probed at most every two seconds by the server's one-second maintenance pulse. There is only one pending nonce per connection; it expires after five seconds. The estimate is the maximum of the latest five samples that are at most fifteen seconds old, requiring at least three fresh samples. Rebinding clears the old estimate. Spectators do not influence the input buffer.

At start, the host chooses `ceil((worstPlayerRTT + 25) / 25)` ticks, bounded to 2–40. If any player lacks an estimate, the result is at least the former eight-tick default. Already measured slow players still raise it. This protects against using only the fastest known player while another is unmeasured. It is a finite recent-sample budget, not a guarantee against future jitter or suspension.

The delay is frozen in the common MatchConfig. Mid-match probes do not alter it or simulation state. A fresh restart recalculates it; a save load preserves the saved delay because confirmations may already be committed ahead. The lobby displays per-player RTT and the proposed input buffer. Its saved-match view omits the proposed buffer since the file supplies it.

Tests cover spoofed/duplicate replies, freshness, reconnects, spectators, shared start configuration, restart, save continuation, actual WebSocket echo before listeners, and Session movement with several delivery delays. Jitter and suspension tests compare both peers' action logs and checksums. Applying this to a deployed game requires both the updated client and an updated MatchHost process; an unchanged server continues supplying its old delay.
