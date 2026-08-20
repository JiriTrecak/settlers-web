# wire

JSON on the Channel. `commit` advances sim. Client `ended` carries `{ outcome, tick, checksum }`; server `ended` assigns `replayId`. `hash` is `{ tick, checksum }`. Lobby extras: `welcome`, `room`, `hashOk`. Host `loadSave` / server `load` or `start.save` catch a client up from a local save (spectate/reconnect same path). Host `restart` rebuilds kits. `go.tick` is the next beat (not always 1).
