# economy

Match start stamps a tower, a small house, low-goods piles (plank/stone/tools), and 16 jobless bearers in a spiral around the HQ.

Each tick the matcher pairs the closest idle bearer to the closest offer of a requested material. Built huts request `requestStacks`; plans request `constructionStacks` (stop at `required`). No partitions. `deliver` is a job: pickup at the offer, drop at the request.

When a plan's stacks are full it becomes `built`, the piles vanish, and a jobless bearer walks in (`occupy`) and `become`s the worker.
