# World

Requires a map, seed and participant slots. Sorts slots, validates one authored start per participant, then creates one `Game`. Slots are participant metadata; units/buildings are declared entities inside Game.

`enqueue` validates actions and stamps their player/sequence. Each tick applies due entries in tick/player/sequence order, generates future AI intentions every 400 ticks, and advances Game once. `view(owner)` projects player knowledge. `snapshot/restore` preserve clock, RNG, slots, future intentions and complete Game state. Restore checks map/content/build and participant identity before replacement. Checksum includes the pending queue and slot teams, not just current visible entities.

See [systems](../../../docs/declarations/systems.md).
