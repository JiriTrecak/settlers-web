# Command types

`actionSchema` is the single strict wire/intention schema. `Action` is inferred from it. Gameplay actions are move, attack, stop, build, produce, cancel, rally and pause. Transport probes noop/ping have no gameplay effect. Actor IDs, target IDs and definition IDs identify intent; packets never supply computed damage, prices, paths or owner mutations.

Both client tools and the lockstep ingress use this schema. `Game.command` performs capability, ownership, visibility and state checks independently of the command card. See [behavior/action reference](../../../docs/declarations/behaviors.md).
