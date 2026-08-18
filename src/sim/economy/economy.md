# economy

Match start stamps a tower, a small house, low-goods piles (plank/stone/tools), 16 jobless bearers, and L1 swordsmen (one already inside the HQ) in a spiral around **each** HQ. Local slot gets **8** infantry; the script opponent gets **3**. The garrisoned tower occupies a radius-40 disk; later huts of that player must sit on that land. A constructed T1 stays empty until a spare swordsman walks in — then it stamps. A second player's first tower may still stamp unowned land. Fog snaps to full sight after each kit. Pioneers are not in the kit — convert a bearer.

Each tick the matcher pairs the closest idle bearer of player P to the closest offer P may take. Built huts request `requestStacks`; plans request `constructionStacks` (stop at `required`). `building` huts request nothing. Offers are stacks on P's land, or on P's hut offer tiles (no-land test maps). No partitions. `deliver` is a job: pickup at the offer, drop at the request. Bricklayers and occupy recruits are the hut's player only.

When a plan is flat (no `flatten`, or protected heights already match the frozen mean) and stacks are full it becomes `building`. Flatten defs recruit `ceil(protected/15)` diggers first — walk onto a cell, kneel 1s, ±1 toward that mean. Ghost is red on a slope; click still drops the plan. Too-steep (>127 mark) refuses place.
