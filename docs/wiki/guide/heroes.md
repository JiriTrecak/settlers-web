# Heroes, abilities and inventory

The **[Ant Marshal](/units/unit-ants-marshal)** is the current hero: a larger armored ant with a heavy mace. He starts with the colony and progresses through ten levels. The unit page contains the generated level-by-level XP, health, damage and armor table.

## Experience and levels

Nearby opposing defeats grant experience. When multiple eligible heroes are in range, the reward is shared. Leveling increases health, damage, armor, maximum mana and attack speed according to an explicit level table. Increases in maximum health and mana are added to the current pools, preserving previous damage and mana spent. It is not a free full heal.

A hero's range for receiving experience, required totals and stat growth come from its definition. Experience stops growing at the final level. Living heroes recover health and mana continuously; fractional recovery is saved exactly. At level one the Marshal recovers 1.45 HP and 0.76 mana per second, rising to 2.8 HP and 1.41 mana per second at level ten. Dead heroes do not regenerate.

## Learn an ability

Open **Learn Ability** to spend a skill point. The Marshal has three regular abilities and one ultimate:

- **[Faultline](/abilities/spell-marshal-faultline)** — a line of impact from a mace strike, damaging and briefly stunning enemies.
- **[Rally the Colony](/abilities/spell-marshal-rally)** — briefly increases the damage of nearby friendly units.
- **[Iron Carapace](/abilities/spell-marshal-carapace)** — temporary damage reduction for the Marshal himself.
- **[Crownfall](/abilities/spell-marshal-crownfall)** — a powerful targeted area attack, available at hero level six.

Regular abilities have three ranks, gated by hero level. Mana, cooldowns, damage and rank requirements are generated on each ability page.

## Aim before committing

Choose a ground-targeted ability and move the pointer to preview the impact shape. Faultline shows a line; Crownfall shows a circle. A range outline helps show whether the aim is legal. Unexplored or out-of-range ground is red. Click a legal position to cast; Escape or right-click cancels targeting.

Rally and Carapace are self-cast abilities and do not ask for a ground destination. Rally adds 10/20/30% attack damage, including equipment, and refreshes rather than stacking with another Rally. Carapace reduces incoming damage by 20/30/40% after armor or spell resistance.

Faultline and Crownfall each have a six-target damage budget. More than six eligible targets share the damage budget; immune targets do not dilute it. Stuns affect units only, last half as long against heroes, and are not subject to the damage budget.

## Chests and equipment

Clear a camp, then right-click its dropped chest with a hero. The hero moves within pickup range and places the item into a free inventory slot. A full inventory prevents pickup; the game does not automatically discard an item to make room.

Equipment provides passive bonuses while carried. Consumables are used from the inventory and are spent on activation. Right-click an inventory item to drop it deliberately. The [item pages](/items/) list exact effects, and the [loot tables](/guide/loot) list weighted chances.

## Death is not the end

A fallen hero retains **items, experience and learned abilities**. Build an **[Amber Sanctuary](/buildings/building-ants-sanctuary)** and select the fallen hero's revival command.

Revival is currently free and returns the same hero with full derived health and mana. Cooldowns keep their original deadlines. Blocked exits delay the return; destroying the Sanctuary removes its queue but does not erase the fallen hero.

Purchasing extra heroes is not implemented. A Sanctuary revives an existing hero; it does not create a new one.
