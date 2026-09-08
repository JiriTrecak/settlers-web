import type { ContentRegistry } from "../../content/registry";
import { ownerSlot } from "../../content/schema";
import {
  decodeHeight,
  HEIGHT_ORIGIN,
  HEIGHT_VERTS,
} from "../../shared/map/height";
import type { UtcMap } from "../../shared/map/utcmap";
import { Navigation } from "./navigation";
import { alive, type Entity, type Point } from "./state";

export const cell = (p: Point) => p.y * 256 + p.x;
export const point = (i: number): Point => ({
  x: i % 256,
  y: Math.floor(i / 256),
});
export const distance2 = (a: Point, b: Point) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export class Spatial {
  readonly heights = new Int16Array(65536);
  readonly terrain = new Uint8Array(65536);
  readonly occupied = new Int32Array(65536);
  readonly resources = new Int32Array(65536);
  readonly territory = new Int16Array(65536).fill(-1);
  private territoryDirty = true;
  readonly navigation: Navigation;
  constructor(
    map: UtcMap,
    readonly registry: ContentRegistry,
    private readonly entities: () => readonly Entity[],
  ) {
    const h = map.height ? decodeHeight(map.height) : null,
      sea = Math.round((map.waterLevel ?? 0) * 100);
    for (let y = 0; y < 256; y++)
      for (let x = 0; x < 256; x++) {
        const i = y * 256 + x;
        this.heights[i] = Math.round(
          (h?.[(y - HEIGHT_ORIGIN) * HEIGHT_VERTS + x - HEIGHT_ORIGIN] ?? 0) *
            100,
        );
        this.terrain[i] = this.heights[i] > sea + 10 ? 1 : 0;
      }
    this.navigation = new Navigation(
      256,
      (a, b) =>
        this.walkable(b) && Math.abs(this.heights[a]! - this.heights[b]!) <= 90,
    );
  }
  footprint(e: Pick<Entity, "definition" | "x" | "y" | "rotation">): number[] {
    const d = this.registry.get(e.definition),
      f = d.footprint;
    if (!f) return [cell(e)];
    const swap = Math.round(e.rotation / 90) % 2 !== 0,
      w = swap ? f.depth : f.width,
      h = swap ? f.width : f.depth,
      result: number[] = [];
    for (let y = e.y - Math.floor(h / 2); y <= e.y + Math.floor(h / 2); y++)
      for (let x = e.x - Math.floor(w / 2); x <= e.x + Math.floor(w / 2); x++)
        result.push(x < 0 || x >= 256 || y < 0 || y >= 256 ? -1 : y * 256 + x);
    return result;
  }
  entrance(e: Pick<Entity, "definition" | "x" | "y" | "rotation">): Point {
    const offset = this.registry.get(e.definition).entrance ?? { x: 0, y: 0 },
      r = ((Math.round(e.rotation / 90) % 4) + 4) % 4;
    const x = [offset.x, offset.y, -offset.x, -offset.y][r],
      y = [offset.y, -offset.x, -offset.y, offset.x][r];
    return { x: e.x + x, y: e.y + y };
  }
  rebuild() {
    this.occupied.fill(0);
    this.resources.fill(0);
    for (const e of this.entities())
      if (alive(e)) {
        if (this.registry.get(e.definition).kind === "building")
          for (const i of this.footprint(e))
            if (i >= 0) this.occupied[i] = e.id;
        if (e.resource && e.resource.amount > 0) this.resources[cell(e)] = e.id;
      }
    this.territoryDirty = true;
  }
  updateTerritory() {
    if (!this.territoryDirty) return;
    this.territoryDirty = false;
    this.territory.fill(-1);
    const best = new Int32Array(65536).fill(2147483647);
    for (const e of this.entities()) {
      const r = this.registry.get(e.definition).behaviors.territory?.radius,
        owner = ownerSlot(e.owner);
      if (!r || e.construction || !alive(e) || owner < 0) continue;
      for (let y = Math.max(0, e.y - r); y <= Math.min(255, e.y + r); y++)
        for (let x = Math.max(0, e.x - r); x <= Math.min(255, e.x + r); x++) {
          const dist = (x - e.x) ** 2 + (y - e.y) ** 2,
            i = y * 256 + x;
          if (
            dist <= r * r &&
            this.terrain[i] &&
            (dist < best[i] || (dist === best[i] && owner < this.territory[i]))
          ) {
            best[i] = dist;
            this.territory[i] = owner;
          }
        }
    }
  }
  walkable(i: number) {
    return (
      i >= 0 &&
      i < 65536 &&
      !!this.terrain[i] &&
      !this.occupied[i] &&
      !this.resources[i]
    );
  }
  free(p: Point, except?: number) {
    return (
      p.x >= 0 &&
      p.x < 256 &&
      p.y >= 0 &&
      p.y < 256 &&
      this.walkable(cell(p)) &&
      !this.entities().some(
        (e) =>
          e.unit &&
          alive(e) &&
          !e.unit.contained &&
          !e.unit.release &&
          e.id !== except &&
          e.x === p.x &&
          e.y === p.y,
      )
    );
  }
  nearest(origin: Point, max = 12, except?: number): Point | null {
    for (let r = 0; r <= max; r++)
      for (let dy = -r; dy <= r; dy++)
        for (let dx = -r; dx <= r; dx++)
          if (Math.abs(dx) + Math.abs(dy) === r) {
            const p = { x: origin.x + dx, y: origin.y + dy };
            if (this.free(p, except)) return p;
          }
    return null;
  }
  route(e: Entity, destination: Point): boolean {
    if (
      !e.unit ||
      destination.x < 0 ||
      destination.x > 255 ||
      destination.y < 0 ||
      destination.y > 255
    )
      return false;
    const goal = cell(destination),
      blocked = new Set(
        this.entities()
          .filter(
            (u) =>
              u.id !== e.id &&
              u.unit &&
              alive(u) &&
              !u.unit.contained &&
              !u.unit.release,
          )
          .map(cell),
      );
    const planner = new Navigation(
      256,
      (a, b) =>
        this.walkable(b) &&
        !blocked.has(b) &&
        Math.abs(this.heights[a] - this.heights[b]) <= 90,
    );
    const path = planner.path(cell(e), goal);
    if (path === null) return false;
    e.unit.route = path;
    e.unit.goal = goal;
    return true;
  }
  range(a: Entity, b: Entity) {
    const f = this.registry.get(b.definition).footprint;
    let dx = Math.abs(a.x - b.x),
      dy = Math.abs(a.y - b.y);
    if (f) {
      dx = Math.max(
        0,
        dx - (Math.round(b.rotation / 90) % 2 ? f.depth : f.width) / 2,
      );
      dy = Math.max(
        0,
        dy - (Math.round(b.rotation / 90) % 2 ? f.width : f.depth) / 2,
      );
    }
    return dx * dx + dy * dy;
  }
}
