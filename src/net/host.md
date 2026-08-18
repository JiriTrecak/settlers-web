# host

`MatchHost` is the lobby map. `HostedMatch` is one room: waiting → start freezes `MatchConfig` → `ready` from every playing slot → `go` → `Room` commits. Room ids are sequential (`1`, `2`, …) for this process. Dropped sockets `Room.drop` so empty confirms are implicit. Hash mismatch → `desync`.
