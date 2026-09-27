# Your first colony

Under the Canopy is an insect-scale economic RTS. Grow a living workforce, gather amber and wood, and train an army within your supply capacity. Your hero gains strength by fighting beyond the safety of the colony.

## Set up a match

Choose **Skirmish**, select an authored map, then assign the player slots. Your human slot determines your starting position. Set every slot to AI to watch an observer match. Ants are currently the only playable faction. No campaign missions are currently shipped; see [campaign authoring](/guide/campaign).

The [map atlas](/maps/) shows terrain, starting locations, amber mines and neutral camps. These are initial layouts; it does not track what has happened in a running match.

## What you start with

{{stats:opening}}

{{stats:assignments}}

Those assignments need suitable nearby sources and a reachable hall. Your first workers already contribute to the economy; a fresh unassigned worker is an opportunity to build or gather.

## A useful opening

1. Inspect the nearby Amber Deposit and keep workers gathering.
2. Build a **Mound**: the starting colony uses all 12 supply, and a completed Mound adds 6.
3. Train additional Workers at the **Main Hall**; each costs resources and 1 supply.
4. Build a **Barracks**, then train Warriors or Archers. Each uses 1 supply and its resource price, without consuming a worker.
5. Lead the Marshal and army to an easier camp, with the hero close enough to earn experience and collect rewards.
6. Add Mounds ahead of demand. Build an Amber Sanctuary so a fallen Marshal can return with earned progress and items.

## Winning and losing

The current match objective is the starting **Main Hall**. Destroy an opponent's objective Main Hall to defeat that colony. Losing every soldier is not itself defeat; losing the objective Main Hall is. The defeated colony loses its remaining actors. In a free-for-all, the other players continue until only one colony survives; team matches end when one team remains. Simultaneous final objective losses can produce no winner.

The present implementation ends the match when an objective loss is detected. Larger free-for-all elimination rules are not established just because the editor supports more starting slots.

## Where to go next

- [Economy and supply](/guide/economy)
- [Commands and camera controls](/guide/controls)
- [Combat and armor](/guide/combat)
- [Heroes, abilities and inventory](/guide/heroes)
