# tooling

Separate web + desktop target. Pixi canvas + DOM screens. No Session, no lockstep.

| Command | What |
|---|---|
| `npm run dev:tools` | Vite on :5174 |
| `npm run build:tools` | `tooling/dist` |
| `npm run tauri:tools` | Desktop shell around the Vite server |
| `npm run pack:tools` | Desktop release |

May import `src/render` / `src/sim` later. Do not boot a match from here.
