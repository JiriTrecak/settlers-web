# host

`MatchHost` is the lobby map. `HostedMatch` is one room: waiting → start freezes `MatchConfig` → `ready` from every playing slot → `go` → `Room` commits. Host `load` takes a local save (lobby: `start+save`; live: `load`), overlays current seat names, resumes the mailbox. Spectators may join while playing; `bind` resends `start` with the last save. Host `restart` is a fresh seed + empty mailbox. Room ids are sequential (`1`, `2`, …) for this process. Dropped sockets `Room.drop` so empty confirms are implicit. Hash mismatch → `desync`.

Start/restart select a common input pipeline from server-measured player round trips; load preserves the saved pipeline. `MatchHost.pulse()` performs bounded transport probing and must be called by a hosted server. It never commits a game tick. See [latency](latency.md).

Race choices come from `rules.races`; each resolved starting setup supplies its hero choices.
Lobby `selectRace` validates the owned seat and resets its hero to the race default.
Lobby `selectHero` changes only the authenticated player's own seat while waiting;
spectators, undeclared choices and changes after Start cannot alter the match.
Room views publish the available IDs/default and each occupied seat's choice.
`startMatch` uses the same ordered socket as selection; this prevents the host's
Start click from overtaking their last selection through a separate HTTP request.
The existing HTTP start endpoint remains available to integrations. Frozen slots,
restarts and saves retain each choice. The deployment script includes
`content/game.json`; clients and MatchHost must be updated together. This does not
require the server to load rendering assets or run the simulation.

See [race configuration](../../docs/expansion/races.md) for starts, campaign overrides and AI.
