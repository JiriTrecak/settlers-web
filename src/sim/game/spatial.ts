import {bridgeSurfaces,applyBridgeSurfaces} from '../../shared/map/bridgeSurface';
import {applySceneryBlockers} from '../../shared/map/sceneryCollision';
import {
  clearSweep,
  clearRay,
  fixed,
  precise,
  type FixedPoint,
} from "./motion";
import type { ContentRegistry } from "../../content/registry";
import { sampleHeight, decodeHeight, HEIGHT_ORIGIN, WADING_DEPTH_CM } from "../../shared/map/height";
import type { UtcMap } from "../../shared/map/utcmap";
import { Navigation } from "./navigation";
import { alive, type Entity, type Point } from "./state";

export const cell = (p: Point, size = 256) => p.y * size + p.x;
export const point = (i: number, size = 256): Point => ({
  x: i % size,
  y: Math.floor(i / size),
});
export const distance2 = (a: Point, b: Point) =>
  (a.x - b.x) ** 2 + (a.y - b.y) ** 2;
export class Spatial {
  readonly size: number;
  readonly heights: Int16Array;
  readonly terrain: Uint8Array;
  readonly sea: number;
  readonly decks: Uint8Array;
  readonly occupied: Int32Array;
  readonly resources: Int32Array;
  readonly navigation: Navigation;
  constructor(
    map: UtcMap,
    readonly registry: ContentRegistry,
    private readonly entities: () => readonly Entity[],
    readonly ignoresUnits: (e: Entity) => boolean = () => false,
  ) {
    this.size = map.size;
    this.heights = new Int16Array(this.size * this.size);
    this.terrain = new Uint8Array(this.size * this.size);
    this.occupied = new Int32Array(this.size * this.size);
    this.resources = new Int32Array(this.size * this.size);
    const verts = this.size + 33;
    const h = map.height ? decodeHeight(map.height, this.size) : null,
      sea = Math.round((map.waterLevel ?? 0) * 100);
    this.sea = sea;
    for (let y = 0; y < this.size; y++)
      for (let x = 0; x < this.size; x++) {
        const i = y * this.size + x;
        this.heights[i] = Math.round(
          (h?.[(y - HEIGHT_ORIGIN) * verts + x - HEIGHT_ORIGIN] ?? 0) * 100,
        );
        this.terrain[i] = this.heights[i] >= sea - WADING_DEPTH_CM ? 1 : 0;
      }
    this.decks=applyBridgeSurfaces(this.size,bridgeSurfaces(map.stamps,(x,z)=>h?sampleHeight(h,x,z,this.size):0),this.terrain,this.heights);
    applySceneryBlockers(map, this.terrain);
    this.navigation = new Navigation(
      this.size,
      (a, b) =>
        this.walkable(b) && Math.abs(this.heights[a]! - this.heights[b]!) <= 90,
    );
  }
  cell(p: Point) {
    return cell(p, this.size);
  }
  point(i: number) {
    return point(i, this.size);
  }
  footprint(e: Pick<Entity, "definition" | "x" | "y" | "rotation">): number[] {
    const d = this.registry.get(e.definition),
      f = d.footprint;
    if (!f) return [this.cell(e)];
    const swap = Math.round(e.rotation / 90) % 2 !== 0,
      w = swap ? f.depth : f.width,
      h = swap ? f.width : f.depth,
      result: number[] = [];
    for (let y = e.y - Math.floor(h / 2); y <= e.y + Math.floor(h / 2); y++)
      for (let x = e.x - Math.floor(w / 2); x <= e.x + Math.floor(w / 2); x++)
        result.push(
          x < 0 || x >= this.size || y < 0 || y >= this.size
            ? -1
            : y * this.size + x,
        );
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
        if (e.resource && e.resource.amount > 0)
          for (const i of this.footprint(e))
            if (i >= 0) this.resources[i] = e.id;
      }
  }
  walkable(i: number) {
    return (
      i >= 0 &&
      i < this.size * this.size &&
      !!this.terrain[i] &&
      !this.occupied[i] &&
      !this.resources[i]
    );
  }
  free(p: Point, except?: number) {
    const mover = except == null ? undefined : this.entities().find(e => e.id === except);
    return (
      p.x >= 0 &&
      p.x < this.size &&
      p.y >= 0 &&
      p.y < this.size &&
      this.walkable(this.cell(p)) &&
      (!!mover && this.ignoresUnits(mover) || !this.entities().some(
        (e) =>
          e.unit &&
          alive(e) &&
          !e.unit.contained &&
          !e.unit.release &&
          !this.ignoresUnits(e) &&
          e.id !== except &&
          e.x === p.x &&
          e.y === p.y,
      ))
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
  route(e: Entity, destination: Point, avoidUnits = e.unit?.order?.type !== "move" && e.unit?.order?.type !== "attack"): boolean {
    if (
      !e.unit ||
      destination.x < 0 ||
      destination.x > this.size - 1 ||
      destination.y < 0 ||
      destination.y > this.size - 1
    )
      return false;
    if (e.unit.idle) e.unit.idle.walking = false;
    const goal = this.cell(destination),
      blocked = new Set(
        this.entities()
          .filter(
            (u) =>
              avoidUnits && u.id !== e.id &&
              u.unit &&
              alive(u) &&
              !u.unit.contained &&
              !u.unit.release &&
              !this.ignoresUnits(e) && !this.ignoresUnits(u),
          )
          .map((e) => this.cell(e)),
      );
    const from = e.unit.position ?? fixed(e);
    const direct = this.clearSegment(from, fixed(destination), blocked);
    const path = direct
      ? [goal]
      : this.navigation.path(this.cell(e), goal, blocked);
    if (path === null) return false;
    const waypoints: number[] = [];
    let anchor = from;
    for (let i = 0; i < path.length;) {
      let farthest = i;
      if (!this.clearSegment(anchor, fixed(this.point(path[i])), blocked))
        return false;
      // Farther candidates progressively straighten the A* corridor.
      while (
        farthest + 1 < path.length &&
        this.clearSegment(
          anchor,
          fixed(this.point(path[farthest + 1])),
          blocked,
        )
      )
        farthest++;
      const next = path[farthest];
      waypoints.push(next);
      anchor = fixed(this.point(next));
      i = farthest + 1;
    }
    if (
      !waypoints.length &&
      (from.x !== destination.x * 1000 || from.y !== destination.y * 1000)
    )
      waypoints.push(goal);
    e.unit.route = waypoints;
    e.unit.position ??= from;
    e.unit.goal = goal;
    return true;
  }
  clearSegment(
    from: FixedPoint,
    to: FixedPoint,
    blocked?: ReadonlySet<number>,
  ) {
    const terrainStep = (a: number, b: number) =>
      this.walkable(b) && Math.abs(this.heights[a] - this.heights[b]) <= 90;
    return (
      clearSweep(from, to, terrainStep, this.size) &&
      (!blocked ||
        clearRay(
          from,
          to,
          (a, b) => terrainStep(a, b) && !blocked.has(b),
          this.size,
        ))
    );
  }
  unitSegmentClear(from: FixedPoint, to: FixedPoint, except: number): boolean {
    const mover = this.entities().find(e => e.id === except);
    if (mover && this.ignoresUnits(mover)) return true;
    const dx = to.x - from.x,
      dy = to.y - from.y,
      square = dx * dx + dy * dy;
    for (const unit of this.entities()) {
      if (
        unit.id === except ||
        !unit.unit ||
        !alive(unit) ||
        unit.unit.contained ||
        unit.unit.release
        || this.ignoresUnits(unit)
      )
        continue;
      const p = unit.unit.position ?? fixed(unit);
      if (
        p.x < Math.min(from.x, to.x) - 400 ||
        p.x > Math.max(from.x, to.x) + 400 ||
        p.y < Math.min(from.y, to.y) - 400 ||
        p.y > Math.max(from.y, to.y) + 400
      )
        continue;
      const t = square
        ? Math.max(
            0,
            Math.min(1, ((p.x - from.x) * dx + (p.y - from.y) * dy) / square),
          )
        : 0;
      if (
        (p.x - from.x - t * dx) ** 2 + (p.y - from.y - t * dy) ** 2 <
        400 ** 2
      )
        return false;
    }
    return true;
  }
  range(a: Entity, b: Entity) { return this.pointRange(precise(a), b); }
  pointRange(pa: Point, b: Entity) {
    const f = this.registry.get(b.definition).footprint;
    const pb = precise(b);
    let dx = Math.abs(pa.x - pb.x),
      dy = Math.abs(pa.y - pb.y);
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
