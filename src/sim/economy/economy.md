# economy

Match start stamps a tower, a small house, low-goods piles (plank/stone/tools), and 16 jobless bearers in a spiral around the HQ. The finished tower occupies a radius-40 disk; later huts must sit on that land. Extra T1 towers from the strip extend it when they finish. Fog snaps to full sight after the kit is down. Pioneers are not in the kit — convert a bearer.

Each tick the matcher pairs the closest idle bearer of player P to the closest offer P may take. Built huts request `requestStacks`; plans request `constructionStacks` (stop at `required`). `building` huts request nothing. Offers are stacks on P's land, or on P's hut offer tiles (no-land test maps). No partitions. `deliver` is a job: pickup at the offer, drop at the request. Bricklayers and occupy recruits are the hut's player only.

When a plan's stacks are full it becomes `building`. Up to two idle bearers walk to `bricklayers[]` spots, `become` bricklayers, and hammer. Each 1s swing bumps `constructionProgress` by `1 / (12 × materials)` and pops one pile item every 12 swings — two bricklayers go twice as fast. Done → leftover piles vanish, bricklayers revert to bearers, then `occupy` + `become` the worker.
