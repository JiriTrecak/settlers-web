/**
 * Match-start kit: tower, small house, goods piles, jobless bearers.
 * Spiral around the HQ, skipping protected tiles. Piles keep a 2-tile gap so
 * two planks or blade+hammer are not neighbors; bearers fill leftover cells.
 * Instant-finish HQ already garrisons one infantry so the land disk exists on frame 1.
 * Extra swordsmen are the Units strip (`spawnUnit`), not the kit. No pioneers: convert a bearer (C).
 * Blade piles (5) are the digger tool; hammers (6) are bricklayers.
 */
import { hexDist, type GridPos } from "../../shared";
import type { Goods } from "../data/types";
import type { BuildingKind } from "../data/buildings";
import { goodsStack } from "../object/object";
import { isWalkable } from "../path/path";
import type { World } from "../world/world";

const BEARERS = 16;
/** Min hexDist between kit piles. 1 = neighbors. */
const STACK_GAP = 2;

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

/** Stamp HQ + house + piles + bearers at `at`, then snap fog so the first frame is fully lit. */
export function placeColony(world: World, at: GridPos, player = 0): void {
  const hq = world.placeBuilding("tower", at, player, true);
  if (hq) world.setHq(hq);
  const houseAt = findPlace(world, "small_livinghouse", at, player);
  if (houseAt) world.placeBuilding("small_livinghouse", houseAt, player, true);
  const piles: GridPos[] = [];
  walkSpiral(at, (pos) => {
    if (piles.length >= STACKS.length) return false;
    if (!kitTile(world, pos)) return true;
    if (piles.some((p) => hexDist(p.x, p.y, pos.x, pos.y) < STACK_GAP)) return true;
    const job = STACKS[piles.length]!;
    world.objects.place(goodsStack(pos, job.material, job.capacity));
    piles.push(pos);
    return true;
  });
  let bearers = 0;
  walkSpiral(at, (pos) => {
    if (bearers >= BEARERS) return false;
    if (!kitTile(world, pos)) return true;
    world.spawnBearer(pos, player);
    bearers += 1;
    return true;
  });
  world.snapFog();
}

function kitTile(world: World, pos: GridPos): boolean {
  if (!world.grid.inBounds(pos.x, pos.y)) return false;
  if (world.buildings.protects(pos.x, pos.y)) return false;
  if (world.objects.blocks(pos.x, pos.y)) return false;
  return isWalkable(world.grid, pos.x, pos.y);
}

/** Walk the kit spiral. `visit` false stops. */
function walkSpiral(at: GridPos, visit: (pos: GridPos) => boolean): void {
  let rel = { dx: -3, dy: 3 };
  for (let n = 0; n < 800; n++) {
    rel = nextSpiral(rel);
    if (!visit({ x: at.x + rel.dx, y: at.y + rel.dy })) return;
  }
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
