# session

The running match. Constructed on demand; not alive in the lobby.

| Folder | Owns |
|---|---|
| `session/` | `Session` — World, lockstep, camera, draw |
| `input/` | `MapInput` — pan / zoom / WASD |

Session talks to Lockstep, never a socket.
