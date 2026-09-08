# First army

Rules revision: settlement-6. Every player starts with eight economic settlers and two warriors. Forts never fire; destroying a main fort still ends the match.

Barracks cost 8 planks and 4 stone. The existing construction carriers deliver those materials and builders construct it. HP starts at 10% of the completed building's maximum and increases with construction, preserving any damage already taken. Completed damaged buildings attract builders for free repairs (one HP per four ticks per builder).

Recruitment uses a FIFO queue capped at twelve entries. The barracks requests at most two planks ahead through carrier reservations. Fort planks are removed only at pickup. It calls one idle unassigned carrier only when a plank is present, leaving builders and employed specialists alone. The recruit physically walks to the entrance, trains, then changes role with the same entity ID and population slot. Warrior: one plank, four seconds, 120 HP. Archer: one plank, six seconds, 70 HP. Civilian settlers have 60 HP.

The plank is held in the barracks inventory during training and consumed on completion. Cancelling active training releases the settler and leaves the plank available; excess stock is physically hauled back to the fort. Destroying the barracks loses its inventory and releases its recruit. Dead carriers lose carried cargo and release reservations. Queue, recruit identity, training progress, rally coordinates, unit HP, targets, cooldowns and routes are checksum state. Visibility memories deep-copy recruitment data.

Soldiers can move, attack visible enemy units/buildings, or stop. Idle soldiers acquire visible enemies within ten cells; archers attack at seven cells and warriors at 1.5 cells from the target footprint. Target ties use entity ID. Losing sight ends pursuit. Damage, cooldowns and path decisions use fixed ticks; arrow traces and strike poses are cosmetic only. No weapons, armor supply chain, upgrades, or fort attacks are implemented. The economy AI builds a barracks after its initial production/housing and recruits while keeping at least two carriers.

Select a civilian settler to expose construction commands. Select an owned completed barracks for recruitment, cancellable queue entries and rally placement. Select a soldier, then click ground to move or a visible enemy to attack. Builders repair automatically.

Source models: scripts/ant-colony/military.py and assets/ant-colony/Ant-military-source.blend. Runtime assets are barracks.glb, warrior.glb and archer.glb. They use the shared player-color shell/roof materials.
