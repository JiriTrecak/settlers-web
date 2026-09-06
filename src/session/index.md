# session

The running match. Constructed on demand; not alive in the lobby or the editor.

| Folder | Owns |
|---|---|
| `session/` | `Session` — World, lockstep, camera, draw |

Pan/zoom lives on the renderer (`MapInput`). Session talks to Lockstep, never a socket.
