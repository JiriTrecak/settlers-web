# Testing

Vitest. Sim is deterministic.

Render: few tests. Visuals get eyeballed. Camera apply **is** unit-tested.

```
npm test
npm run test:watch
npm run dev
npm run build
```

## Architecture (enforced)

- `src/sim` must not import `pixi.js` / `three` / `app` / `session` / `ui` / `render` / `net`
- `src/net` must not import `pixi.js` / `three` / `app` / `session` / `ui` / `render` / `sim`
- `ui` must not import pixi / three / `app` / `session` / `render` / `net`
- `render` must not import `app` / `session` / `ui` / `net`
- `session` must not import `app` / `editor`
- `editor` must not import `app` / `session` / `net`
- `app` may import `editor`; still must not import `sim` / `render`
- Sources must not name a foreign engine

## What not to test

- Three.js app booting
- Pixel-perfect screenshots
