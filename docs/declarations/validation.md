# Validation and acceptance

The validator rejects unknown fields, unresolved IDs/assets, duplicate IDs, conflicting behavior defaults, incomplete required capabilities, invalid prices, invalid input units/resources, insufficient producer capacity, missing accepted inputs, and incompatible creation/staffing modes. Map validation checks explicit owners/camps/setup references and initial-state capacities. The playable-map boundary also checks dry, separated starts and occupancy. Vite build and content-save validate model files and scenery catalogue links.

Reference tests:

- `tests/game/command-categories.test.ts`: populated/nested menus, grouping precedence, empty-category recovery, Back on every page, scoped shortcuts, invalid references/cycles/icons.
- `tests/game/content.test.ts`: graph failures, immutable registry, canonical identity, adding a new unit without type branches, unit/building control removal, thirteen-output paging, command projection, map items/camps, isolated entity undo and visual stack cap.
- `tests/game/economy.test.ts`: physical opening, one-worker liveness, assigned-worker input hauling, competing recruitment, cancellation, deferred carrier movement, blocked deployment/release, finite house output, busy snapshot continuation.
- `tests/game/combat.test.ts`: forced friendly damage and simultaneous defeat, fog privacy and real territory boundaries, neutral aggression/leash, deterministic navigation.
- `tests/game/disruption.test.ts`: head-first capacity protection, full-store crafting, source destruction, harvest contention, blocked regrowth/restore, invalid-snapshot atomicity and replacing a dead employee.
- `tests/net/settlement-lockstep.test.ts`: packet limits, independent mailboxes through construction/recruitment, restored state, malformed batches, queued AI continuation, and simultaneous restore of unapplied commits, held commands and unsent outboxes.
- `tests/engine/world.test.ts`: mandatory authored starts, participant ordering and team identity on restore.
- Existing terrain, rendering, player-material, map, transport, editor and architecture tests cover retained infrastructure.

Run `npm test` and `npm run build`. The MCP socket integration tests bind loopback ports and require an environment that allows local listeners. A denied socket bind is not a simulation assertion failure; rerun those tests with the required local networking permission.

Vitest uses two workers and a 20-second deadline because several scenario proofs advance thousands of fixed ticks while a live WebGL editor may be running. Tick-count assertions prove liveness; performance is measured separately. A wall-clock timeout under concurrent rendering is not a failed conservation or determinism assertion.

The in-game debug overlay (F3) reports explicit simulation phases alongside rendering and HUD costs. Use the actual Mosswater map for performance checks. A headless timing is CPU simulation evidence, not a browser FPS claim.

## Real transport and browser checks

`node --import tsx scripts/verify-settlement-network.ts` starts a temporary MatchHost on loopback port 18787 and two real WebSocket clients. On Mosswater, both players construct a barracks and recruit a warrior and an archer. It verifies 3,000 ticks, fifteen host-confirmed hashes per peer, unchanged total unit population, and exact construction/recruitment material consumption. The temporary host stops on exit.

The browser checks exercise the loaded game/HUD, canonical build requests, singleplayer save/load with an unsent action, editor entity editing, and the atomic content endpoint. Invalid content and stale revisions must leave the source untouched. API/headless checks prove logic; visual inspection verifies the existing model/terrain adapters still display the map.

This cutover does not implement Lua, live portraits, inventory/loot, capture or advanced diplomacy. No new claim is made about Internet reconnect robustness or large-army performance. Those need their own scenarios when developed.

`tests/game/any-angle.test.ts` covers straight non-45-degree travel, precise observations, mid-cell stop/retarget, swept wall avoidance and snapshot continuation. `tests/game/navigation.test.ts` checks the underlying grid search against shortest-cost reference paths.
