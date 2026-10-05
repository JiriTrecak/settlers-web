/** Read-only navigation snapshot for the debug overlay. Runs only on an explicit worker
 * request while the overlay is enabled; nothing here is on the tick path. */
import { WADING_DEPTH_CM } from "../../shared/map/height";
import type { Owner } from "../../content/schema";
import type { Game } from "./game";
import { alive } from "./state";
import { precise } from "./motion";
import type { GroundMeshInput } from "../../shared/navigation/groundMesh";

/** Ground-cell categories, in the order the overlay colours them. */
export const NAV_CELL = { walkable: 0, water: 1, terrain: 2, building: 3, resource: 4, deck: 5 } as const;
/** One route: owner, then flat [x, height, y] triples from the unit through detour points to the goal. */
export type NavigationPath = { id: number; owner: Owner; points: number[] };
export type NavigationMeshSnapshot = GroundMeshInput & { revision:number; decks:number };
export type NavigationDebug = { revision: number; size: number; cells?: Uint8Array; paths?: NavigationPath[]; mesh?:NavigationMeshSnapshot };

/** Copies collision inputs once per revision, never the authoritative typed arrays.
 * Moving units are deliberately absent: this describes global ground routing. */
export function navigationMeshSnapshot(game:Game):NavigationMeshSnapshot {
  const s=game.spatial,n=s.size*s.size,walkable=new Uint8Array(n);
  let decks=0;
  for(let i=0;i<n;i++){walkable[i]=s.walkable(i)?1:0;if(s.decks[i])decks++;}
  return {size:s.size,walkable,heights:s.heights.slice(0,n),radius:s.unitRadius/1000,revision:s.revision,decks};
}

/** Classifies every ground cell by what blocks it; decks mark ground spanned by a walkable bridge. */
export function walkabilityCells(game: Game): Uint8Array {
  const s = game.spatial, n = s.size * s.size, out = new Uint8Array(n);
  for (let i = 0; i < n; i++) {
    if (s.occupied[i]) out[i] = NAV_CELL.building;
    else if (s.resources[i]) out[i] = NAV_CELL.resource;
    else if (!s.walkable(i))
      out[i] = s.heights[i]! < s.waterHeights[i]! - WADING_DEPTH_CM ? NAV_CELL.water : NAV_CELL.terrain;
    else if (s.decks[i]) out[i] = NAV_CELL.deck;
  }
  return out;
}

/** Routes of moving units the viewer may know about: `viewer === null` means every unit. */
export function navigationPaths(game: Game, viewer: Owner | null, ownOnly: Owner | null): NavigationPath[] {
  const s = game.spatial, out: NavigationPath[] = [];
  for (const e of game.context.liveUnits()) {
    const u = e.unit;
    if (!u || !u.route.length || u.contained || !alive(e)) continue;
    if (ownOnly && e.owner !== ownOnly) continue;
    if (viewer && !game.observation.visible(viewer, e)) continue;
    const start = precise(e), points = [start.x, s.height(start), start.y];
    for (const p of u.detour?.points ?? []) {
      const q = { x: p.x / 1000, y: p.y / 1000, ...(p.surface ? { surface: p.surface } : {}) };
      points.push(q.x, s.height(q), q.y);
    }
    for (const i of u.route) {
      const q = s.point(i);
      points.push(q.x, s.height(q), q.y);
    }
    out.push({ id: e.id, owner: e.owner, points });
  }
  return out;
}
