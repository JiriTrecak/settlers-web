# Conventions

TypeScript is what we write. Types should be the ones this codebase actually wants.

## Style

- ESM. `strict`. No `any`. No `as unknown as`.
- Classes for lifecycle / retained state / input (`Session`, `World`, `Renderer`, `Hud`, `Player`, …). Pure math and one-shot transforms stay functions.
- Properties, not getters.
- `readonly` on view types the renderer sees.
- Discriminated unions for actions.
- Const objects + union types instead of numeric enums.
- No Hungarian (`I`, `E`, `m_`).
- File names: `camelCase.ts` for modules. One concept per file. Every `.ts` file states what it is for.

Comments: non-obvious math, why a call into another class exists, races, a block that does a whole job. Not `x += 1`.

## Names

| Type | Notes |
|---|---|
| `World` | Match sim facade |
| `Session` | One running match |
| `Player` | Slot entity. Render draws from `view()`. |
| `ViewSnapshot` | Tick + size + players |
| `Action` | `noop` \| `ping` |
| `Clock` | 25 ms slots |
| `GridPos` | `{ readonly x: number; readonly y: number }` |
| `MatchConfig` | Frozen at room Start. See [net.md](net.md). |
| `Bundle` | Client→server: `{ tick, actions }` |
| `commit` | Server→all. The only thing that advances sim. |

## Constants

- Tick: `25` ms (`Clock.tickMs`)
- Command delay: `2` ticks MP default. SP MemoryChannel uses `1`.
- Map: `MAP_SIZE = 256`, cell = 1 world unit

Integer grid coords stay integers.

## Imports

```
sim      → shared
net      → shared
render   → shared, sim (views/types), three
ui       → shared, sim (views/types)
session  → sim, render, ui, shared, net
app      → session, ui, net
tooling  → render, sim, shared
```

`shared` is types and pure functions. No Three.js. No DOM.

## Things we never do

- Homegrown list/set/map — `Set`, `Map`, arrays.
- Static singletons. Inject.
- Hidden global RNG. `seedRng` into `World`.
- Flattening a widget into exported functions plus a WeakMap.
- Inventing a player who is not a `MatchConfig` slot.
