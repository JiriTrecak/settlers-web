# Validation and acceptance

The validator rejects unknown fields, unresolved IDs/assets, duplicate IDs, conflicting behavior defaults, incomplete required capabilities, invalid prices, invalid input units/resources, insufficient producer capacity, missing accepted inputs, and incompatible creation/staffing modes. Map validation checks explicit owners/camps/setup references and initial-state capacities. The playable-map boundary also checks dry, separated starts.

Reference tests:

- `tests/game/content.test.ts`: graph failures, immutable registry, canonical identity, adding a new unit without type branches, control removal, command projection, map items/camps and visual stack cap.
- `tests/game/economy.test.ts`: physical opening, one-worker liveness, assigned-worker input hauling, competing recruitment, cancellation, deferred carrier movement, blocked deployment/release, finite house output, busy snapshot continuation.
- `tests/game/combat.test.ts`: forced friendly damage and simultaneous defeat, fog privacy and real territory boundaries, neutral aggression/leash, deterministic navigation.
- `tests/net/settlement-lockstep.test.ts`: packet limits, independent mailboxes through construction/recruitment, restored state, malformed batches, and queued AI continuation.
- Existing terrain, rendering, player-material, map, transport, editor and architecture tests cover retained infrastructure.

Run `npm test` and `npm run build`. The MCP socket integration tests bind loopback ports and require an environment that allows local listeners. A denied socket bind is not a simulation assertion failure; rerun those tests with the required local networking permission.

The in-game debug overlay (F3) reports explicit simulation phases alongside rendering and HUD costs. Use the actual Mosswater map for performance checks. A headless timing is CPU simulation evidence, not a browser FPS claim.
