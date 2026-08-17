# economy

Match start stamps a tower, a small house, low-goods piles (plank/stone/tools), and 16 jobless bearers in a spiral around the HQ.

Each tick the matcher pairs the closest idle bearer to the closest offer of a requested material. Built huts request `requestStacks`; plans request `constructionStacks` (stop at `required`). `building` huts request nothing. No partitions. `deliver` is a job: pickup at the offer, drop at the request.

When a plan's stacks are full it becomes `building`. Up to two idle bearers walk to `bricklayers[]` spots, `become` bricklayers, and hammer. Each 1s swing bumps `constructionProgress` by `1 / (12 × materials)` and pops one pile item every 12 swings — two bricklayers go twice as fast. Done → leftover piles vanish, bricklayers revert to bearers, then `occupy` + `become` the worker.
