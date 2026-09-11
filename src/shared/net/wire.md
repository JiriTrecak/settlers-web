# wire

JSON on the Channel. `commit` advances sim. Client `ended` carries `{ outcome, tick, checksum }`; server `ended` assigns `replayId`. `hash` is `{ tick, checksum }`. Lobby extras: `welcome`, `room`, `hashOk`. Host `loadSave` / server `load` or `start.save` catch a client up from a local save (spectate/reconnect same path). Host `restart` rebuilds kits. `go.tick` is the next beat (not always 1).

Server `latencyProbe {id}` and client `latencyReply {id}` are transport-only nonce exchanges. RoomView can include measured `slots[].roundTripMs` and `inputDelayMs` (the pipeline budget, not complete input-to-display latency).
