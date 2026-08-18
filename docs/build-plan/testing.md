# Testing

Vitest. Sim is deterministic — that's the cheat code. Pin rules so a matcher rewrite doesn't silently starve mills.

Render/Pixi: few tests. Visuals get eyeballed. Pure camera / iso / minimap math **is** unit-tested.

## Layout

```
tests/engine/          # sim + shared
tests/render/
tests/camera/
tests/ui/
tests/original_conv/   # conversion only
tests/architecture/    # import rules
```

No Playwright until there is something worth clicking in CI. Don't add it empty.

```
npm test          # vitest run
npm run test:watch
npm run dev
npm run build
```

## Architecture (enforced)

- `src/sim` must not import `pixi.js` / `app` / `session` / `ui` / `render`
- `src` must not import `original_conv`
- `ui` must not import pixi / `app` / `session` / `render`
- `render` must not import `app` / `session` / `ui`
- `session` must not import `app`
- Sources must not name a foreign engine

## P2

Replay / checksum tests live under `tests/engine/` (`queue.test.ts`). Same seed + same action log ⇒ same `World.checksum()` at tick N.

## What not to test

- Pixi `Application` booting
- DAT decode of real original files in CI (no assets in git)
- Pixel-perfect screenshots
