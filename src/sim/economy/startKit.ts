/**
 * Match-start kit: tower, small house, goods piles, jobless bearers, L1 swordsmen.
 * Spiral around the HQ, skipping protected tiles — same layout as the original skirmish low-goods set.
 * Instant-finish HQ already garrisons one infantry so the land disk exists on frame 1.
 * Five more swordsmen in the spiral; they occupy extra towers. No pioneers: convert a bearer (C).
 */
import { hexDist, type GridPos } from "../../shared";
import type { Goods } from "../data/types";
import type { BuildingKind } from "../data/buildings";
import { goodsStack } from "../object/object";
import { isWalkable } from "../path/path";
import type { World } from "../world/world";

const BEARERS = 16;
/** Low-goods kit has 6 infantry; placeBuilding already seats 1 inside the HQ. */
const SWORDSMEN = 5;

const STACKS: { material: Goods; capacity: number }[] = [
  { material: "plank", capacity: 6 },
  { material: "plank", capacity: 6 },
  { material: "stone", capacity: 6 },
  { material: "stone", capacity: 6 },
  { material: "blade", capacity: 5 },
  { material: "hammer", capacity: 6 },
  { material: "axe", capacity: 3 },
  { material: "pick", capacity: 2 },
  { material: "saw", capacity: 1 },
];

/** Stamp HQ + house + piles + bearers + spare swordsmen at `at`, then snap fog so the first frame is fully lit. */
export function placeColony(world: World, at: GridPos, player = 0): void {
  const hq = world.placeBuilding("tower", at, player, true);
  if (hq) world.setHq(hq);
  const houseAt = findPlace(world, "small_livinghouse", at, player);
  if (houseAt) world.placeBuilding("small_livinghouse", houseAt, player, true);
  const jobs: Array<{ kind: "stack"; material: Goods; capacity: number } | { kind: "bearer" } | { kind: "swordsman" }> = [
    ...STACKS.map((s) => ({ kind: "stack" as const, ...s })),
    ...Array.from({ length: SWORDSMEN }, () => ({ kind: "swordsman" as const })),
    ...Array.from({ length: BEARERS }, () => ({ kind: "bearer" as const })),
  ];
  let rel = { dx: -3, dy: 3 };
  let placed = 0;
  let guard = 0;
  while (placed < jobs.length && guard++ < 800) {
    rel = nextSpiral(rel);
    const pos = { x: at.x + rel.dx, y: at.y + rel.dy };
    if (!world.grid.inBounds(pos.x, pos.y)) continue;
    if (world.buildings.protects(pos.x, pos.y)) continue;
    if (world.objects.blocks(pos.x, pos.y)) continue;
    if (!isWalkable(world.grid, pos.x, pos.y)) continue;
    const job = jobs[placed]!;
    if (job.kind === "stack") {
      world.objects.place(goodsStack(pos, job.material, job.capacity));
    } else if (job.kind === "swordsman") {
      world.spawnSettler("swordsman", pos, player);
    } else {
      world.spawnBearer(pos, player);
    }
    placed += 1;
  }
  world.snapFog();
}

function findPlace(world: World, kind: BuildingKind, around: GridPos, player: number): GridPos | null {
  for (let r = 6; r <= 24; r++) {
    for (let y = around.y - r; y <= around.y + r; y++) {
      for (let x = around.x - r; x <= around.x + r; x++) {
        if (hexDist(around.x, around.y, x, y) !== r) continue;
        if (!world.grid.inBounds(x, y)) continue;
        if (world.canPlaceBuilding(kind, { x, y }, player)) return { x, y };
      }
    }
  }
  return null;
}

/** Chebyshev ring walk. Starts after `previous`. */
function nextSpiral(previous: { dx: number; dy: number }): { dx: number; dy: number } {
  const { dx, dy } = previous;
  const basis = Math.max(Math.abs(dx), Math.abs(dy));
  if (dx === basis && dy > -basis) return { dx, dy: dy - 1 };
  if (dx === -basis && dy <= basis) return { dx, dy: dy + 1 };
  if (dx < basis && dy === basis) return { dx: dx + 1, dy };
  if (dx > -basis && dy === -basis) return { dx: dx - 1, dy };
  return { dx, dy: dy - 1 };
}
