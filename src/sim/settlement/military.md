# First army

Rules revision: settlement-7. Every player starts with eight economic settlers and two warriors. Forts never fire; destroying a main fort still ends the match.

Barracks cost 8 planks and 4 stone. The existing construction carriers deliver those materials and builders construct it. HP starts at 10% of the completed building's maximum and increases with construction, preserving any damage already taken. Completed damaged buildings attract builders for free repairs (one HP per four ticks per builder).

Recruitment uses a FIFO queue capped at twelve entries. The barracks requests at most two planks ahead through carrier reservations. Fort planks are removed only at pickup. It calls one idle unassigned carrier only when a plank is present, leaving builders and employed specialists alone. The recruit physically walks to the entrance, trains, then changes role with the same entity ID and population slot. Warrior: one plank, four seconds, 120 HP. Archer: one plank, six seconds, 70 HP. Civilian settlers have 60 HP.

The plank is held in the barracks inventory during training and consumed on completion. Cancelling active training releases the settler and leaves the plank available; excess stock is physically hauled back to the fort. Destroying the barracks loses its inventory and releases its recruit. Dead carriers lose carried cargo and release reservations. Queue, recruit identity, training progress, rally coordinates, unit HP, targets, cooldowns and routes are checksum state. Visibility memories deep-copy recruitment data.

Soldiers can move in deterministic formations, attack-move, explicitly attack visible units/buildings (including friendlies when forced), or stop. Idle soldiers acquire visible enemies within ten cells; archers attack at seven cells and warriors at 1.5 cells from the target footprint. Target ties use entity ID. Losing sight ends pursuit. Damage, cooldowns and path decisions use fixed ticks; arrow traces and strike poses are cosmetic only. No weapons, armor supply chain, upgrades, or fort attacks are implemented. The economy AI builds a barracks after its initial production/housing and recruits while keeping at least two carriers.

Select a civilian settler to expose construction commands. Select an owned completed barracks for recruitment, cancellable queue entries and rally placement. Drag-select soldiers (or workers if the box contains no soldiers); Shift-click/drag extends selection. Click ground to move the group or an enemy to attack. A then ground issues attack-move and resumes the destination after combat; A then a target forces an attack, including friendlies. The center panel has live health cards; click one to isolate it or Shift-click to remove it. Arrow keys pan; WASD does not pan. Workers already carrying goods complete that delivery before moving. Builders repair automatically.

Source models: scripts/ant-colony/military.py and assets/ant-colony/Ant-military-source.blend. Runtime assets are barracks.glb, warrior.glb and archer.glb. They use the shared player-color shell/roof materials.

## Neutral camps

Map catalogue entries `neutral-wolf` and `neutral-ogre` (Units category) are spawn placements. The editor edits these as normal map stamps; the game replaces them with live neutral entities at initialization. Owner -1 has no colony, territory, or player vision. Wolves have 90 HP, 10 damage and 8-cell aggro; ogres have 350 HP, 24 damage and 10-cell aggro. Both defend their authored home and return when a pursuit exceeds 18 cells. They use the deterministic combat tick, normal fog filtering, health and death handling. Camp positions are included in snapshots and checksums. No loot, respawning or healing is implemented.

Mosswater has two mirrored three-wolf packs and two mirrored single-ogre camps. `scripts/ant-colony/neutral_camps.py` applies those placements idempotently and is called by the map generator.
