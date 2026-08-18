# wire

JSON on the Channel. `commit` advances sim. Client `ended` carries `{ outcome, tick, checksum }`; server `ended` assigns `replayId`. `hash` is `{ tick, checksum }`. Lobby extras: `welcome`, `room`, `hashOk`.
