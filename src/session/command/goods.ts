/**
 * Hut selection goods. Session fills this from the live stacks; the widget only paints.
 * Plan/scaffold uses construction piles (max = `required`). Built uses request/offer (max 8).
 */
import type { Building } from "../../sim/building/building";
import { buildingDef } from "../../sim/data/buildings";
import { STACK_SIZE, type ObjectGrid } from "../../sim/object/object";
import type { GoodsLine } from "../../ui/control/types";
import { stackIcon } from "./catalog";

export function hutGoods(hut: Building, objects: ObjectGrid): { needs: GoodsLine[]; produces: GoodsLine[] } {
  const def = buildingDef(hut.kind);
  const origin = hut.pos;
  const line = (dx: number, dy: number, material: string, max: number): GoodsLine => ({
    material,
    have: stackHave(objects, origin.x + dx, origin.y + dy, material),
    max,
    icon: stackIcon(material),
  });
  const producing = def.offerStacks.map((s) => line(s.dx, s.dy, s.material, STACK_SIZE));
  if (hut.state !== "built") {
    return {
      needs: def.constructionStacks.map((s) => line(s.dx, s.dy, s.material, s.required ?? STACK_SIZE)),
      produces: producing,
    };
  }
  return {
    needs: def.requestStacks.map((s) => line(s.dx, s.dy, s.material, STACK_SIZE)),
    produces: producing,
  };
}

function stackHave(objects: ObjectGrid, x: number, y: number, material: string): number {
  const o = objects.get(x, y);
  if (!o || o.kind !== "stack" || o.material !== material) return 0;
  return o.capacity;
}
