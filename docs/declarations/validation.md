# Validation and acceptance

The validator rejects unknown fields, unresolved IDs/assets, duplicate IDs, conflicting behavior defaults, incomplete required capabilities, invalid prices, invalid input units/resources, insufficient producer capacity, missing accepted inputs, and incompatible creation/staffing modes. Map validation checks explicit owners/camps/setup references and initial-state capacities. The playable-map boundary also checks dry, separated starts and occupancy. Vite build and content-save validate model files and scenery catalogue links.

Reference tests:

- `tests/game/colony-economy.test.ts`: exact startup/birth timing, recurring house replacement, shared capacity, destroyed capacity, save continuation, ten-slot neutral mines, protected gatherers, physical recruitment, remote construction, retired content and no currency drops.

- `tests/game/command-categories.test.ts`: populated/nested menus, grouping precedence, empty-category recovery, Back on every page, scoped shortcuts, invalid references/cycles/icons.
- `tests/game/content.test.ts`: graph failures, immutable registry, canonical identity, adding a new unit without type branches, unit/building control removal, thirteen-output paging, command projection, map items/camps, isolated entity undo and currency placement rejection.
- `tests/game/economy.test.ts`: bank-funded construction, one-worker liveness, protected workers, competing recruitment, cancellation, deferred carrier movement, blocked deployment/release, busy snapshot continuation.
- `tests/game/combat.test.ts`: forced friendly damage and simultaneous defeat, fog privacy, neutral aggression/leash, deterministic navigation.
- `tests/game/disruption.test.ts`: head-first funding protection, source destruction, harvest contention, blocked regrowth/restore, invalid-snapshot atomicity and replacing a dead employee.
- `tests/net/settlement-lockstep.test.ts`: packet limits, independent mailboxes through construction/recruitment, restored state, malformed batches, queued AI continuation, and simultaneous restore of unapplied commits, held commands and unsent outboxes.
- `tests/engine/world.test.ts`: mandatory authored starts, participant ordering and team identity on restore.
- Existing terrain, rendering, player-material, map, transport, editor and architecture tests cover retained infrastructure.

Run `npm test` and `npm run build`. The MCP socket integration tests bind loopback ports and require an environment that allows local listeners. A denied socket bind is not a simulation assertion failure; rerun those tests with the required local networking permission.

Vitest uses two workers and a 20-second deadline because several scenario proofs advance thousands of fixed ticks while a live WebGL editor may be running. Tick-count assertions prove liveness; performance is measured separately. A wall-clock timeout under concurrent rendering is not a failed conservation or determinism assertion.

The in-game debug overlay (F3) reports explicit simulation phases alongside rendering and HUD costs. Use the actual Mosswater map for performance checks. A headless timing is CPU simulation evidence, not a browser FPS claim.

## Real transport and browser checks

`node --import tsx scripts/verify-settlement-network.ts` starts a temporary MatchHost on loopback port 18787 and two real WebSocket clients. On Mosswater, both players construct a barracks and recruit a warrior and an archer. It verifies 3,000 ticks, fifteen host-confirmed hashes per peer, worker replenishment and conversion, and exact construction/recruitment material consumption. The temporary host stops on exit.

The browser checks exercise the loaded game/HUD, canonical build requests, singleplayer save/load with an unsent action, editor entity editing, and the atomic content endpoint. Invalid content and stale revisions must leave the source untouched. API/headless checks prove logic; visual inspection verifies the existing model/terrain adapters still display the map.

This cutover does not implement Lua, live portraits, capture or advanced diplomacy. No new claim is made about Internet reconnect robustness or large-army performance. Those need their own scenarios when developed.

`tests/game/any-angle.test.ts` covers straight non-45-degree travel, precise observations, mid-cell stop/retarget, swept wall avoidance and snapshot continuation. `tests/game/navigation.test.ts` checks the underlying grid search against shortest-cost reference paths.

The amber/wood cutover passed 325 tests across 90 files and the production build. A 16,000-tick Mosswater AI duel exercised recurring worker capacity and mixed-army recruitment; both players maintained 23 living workers by the end. Headless timing is not a browser FPS guarantee.

That earlier cutover's real MatchHost smoke test also passed: two WebSocket peers, 3,000 ticks, fifteen confirmed hashes each, and exact shared spending of 26 wood and 44 amber at the former compact prices. Live browser inspection confirmed mine selection/occupancy, the automatic worker cap and worker-built barracks. The balance pass below supersedes those prices.

## First combat balance pass

`tests/game/balance.test.ts` covers armor/class/spell/guard ordering, immunity, meaningful small hits against high armor, complete level-ten stats, six-slot equipment plus Rally, deterministic fractional regeneration and save continuation, level-up pool changes, derived attack intervals, six-target area budgets, immunity exclusions, hero stun duration and building stun exclusion. `tests/game/gathering.test.ts` verifies ten-unit amber and wood delivery cycles plus partial depletion conservation.

The schema validates complete damage matrices, one matching level-one stat record, increasing XP thresholds, non-shrinking resource pools and millipoint regeneration rates. The simulation build is `declarative-sim-13`; earlier saves/content hashes are incompatible.

The 9 September 2026 pass (`4c1d51f7`) passed all 340 tests across 92 files, the game production build, wiki type checking and wiki production build. The real MatchHost check passed 3,000 ticks with two WebSocket peers and fifteen confirmed hashes each; combined construction/recruitment consumption was exactly 800 amber and 160 wood at the new prices. Browser inspection confirmed starting resources, Hall/Warrior/Marshal stats and the updated hero command card.

`node --import tsx scripts/probe-balance-match.ts` ran a 16,000-tick Mosswater AI duel (6 minutes 40 seconds of game time). Both sides gathered, constructed a barracks and four houses, recruited armies and kept their level-two Marshals alive; three camps were cleared. It is an opening smoke test, not a completed-match balance verdict. Lumber accumulated faster than amber, which remains an explicit playtest question.

## Animated tree harvesting

The pine integration advances the simulation build to `declarative-sim-14`. Tests cover exactly ten one-HP contacts, one reserved load, no early hall credit, the 72-tick fall/departure gate, interrupted chopping, damaged/falling snapshot continuation, fog-memory isolation and renewed HP after regrowth. The real exported GLB is sampled in `tests/render/tree-player.test.ts` to verify hit rest, fall/decay continuity, full-size sinking, eventual removal and independent instances.

All 345 tests across 94 files passed. Live Mosswater play showed wood being delivered; an isolated scene using the actual Game, SettlementLayer and PropField verified the final hit, grounded fall, sinking and disappearance. Static standing trees retain instancing; active tree proxies share geometry/materials. Flat-ground animation limitations from the asset handoff still apply on steep terrain.
