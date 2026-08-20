# host

`MatchHost` is the lobby map. `HostedMatch` is one room: waiting → start freezes `MatchConfig` → `ready` from every playing slot → `go` → `Room` commits. Host `load` takes a local save (lobby: `start+save`; live: `load`), overlays current seat names, resumes the mailbox. Spectators may join while playing; `bind` resends `start` with the last save. Host `restart` is a fresh seed + empty mailbox. Room ids are sequential (`1`, `2`, …) for this process. Dropped sockets `Room.drop` so empty confirms are implicit. Hash mismatch → `desync`.
