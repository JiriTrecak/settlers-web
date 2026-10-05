/** Experimental global routing only. Never imported by the game runtime.
 * Recast's voxel approximation must pass the authoritative movement validator
 * before a result can be counted as usable. A successful partial path is not
 * a successful order. Ground-only input deliberately excludes bridge decks.
 */
import {NavMeshQuery, type NavMesh, type Vector3} from 'recast-navigation';
import {generateTiledNavMesh} from 'recast-navigation/generators';

export type GroundGrid = {
  size: number;
  walkable: (cell: number) => boolean;
  height: (cell: number) => number;
};

export function groundGeometry(grid: GroundGrid) {
  const positions: number[] = [], indices: number[] = [];
  for (let z = 0; z < grid.size; z++) for (let x = 0; x < grid.size; x++) {
    const cell = z * grid.size + x;
    if (!grid.walkable(cell)) continue;
    const y = grid.height(cell), start = positions.length / 3;
    // Counter-clockwise from above; independent quads preserve step heights.
    positions.push(x-.5,y,z-.5, x-.5,y,z+.5, x+.5,y,z+.5, x+.5,y,z-.5);
    indices.push(start,start+1,start+2, start,start+2,start+3);
  }
  return {positions, indices};
}

export function buildProbe(geometry: ReturnType<typeof groundGeometry>, radius: number, height: number, cellSize = .25, radiusMultiplier = Math.SQRT2) {
  const config = {
    cs: cellSize, ch: .1, tileSize: Math.round(32 / cellSize),
    walkableHeight: Math.ceil(height / .1), walkableClimb: 8,
    // Runtime sweeps a square footprint, not a circle. Conservative prototype;
    // loss of narrow routes is reported rather than hidden behind a fallback.
    walkableRadius: Math.ceil(radius * radiusMultiplier / cellSize),
    walkableSlopeAngle: 45, minRegionArea: 0, mergeRegionArea: 0,
    maxSimplificationError: .5, maxEdgeLen: Math.round(12 / cellSize),
    maxVertsPerPoly: 6, detailSampleDist: 6, detailSampleMaxError: 1,
  };
  const began = performance.now();
  const result = generateTiledNavMesh(geometry.positions, geometry.indices, config);
  if (!result.success) throw Error(result.error);
  const buildMs = performance.now() - began, navMesh = result.navMesh;
  let polygons = 0, tiles = 0;
  for (let i = 0; i < navMesh.getMaxTiles(); i++) {
    const header = navMesh.getTile(i).header();
    if (header) { tiles++; polygons += header.polyCount(); }
  }
  const query = new NavMeshQuery(navMesh, {maxNodes: 32768});
  return {navMesh, query, config, buildMs, polygons, tiles};
}

export function queryProbe(query: Pick<NavMeshQuery,'computePath'>, start: Vector3, goal: Vector3) {
  return query.computePath(start, goal, {
    halfExtents: {x: .5, y: 2, z: .5}, maxPathPolys: 8192, maxStraightPathPoints: 8192,
  });
}

export function checkProbePath(path: readonly Vector3[], start: Vector3, goal: Vector3,
  clear: (a: Vector3, b: Vector3) => boolean) {
  if (!path.length) return {valid: false, reason: 'empty', length: 0};
  const distance = (a: Vector3, b: Vector3) => Math.hypot(a.x-b.x, a.z-b.z);
  // Do not accept a clipped partial route, silently relocate the goal, or start
  // on the other side of a wall after nearest-poly projection.
  if (distance(path[0]!, start) > .75 || distance(path.at(-1)!, goal) > .75 ||
      Math.abs(path[0]!.y-start.y) > .25 || Math.abs(path.at(-1)!.y-goal.y) > .25)
    return {valid: false, reason: 'endpoint-projection-or-partial', length: 0};
  let length = 0;
  // A nearby projected endpoint is usable only with a checked connection to
  // the EXACT requested point. This never changes a unit's destination.
  const points = [start, ...path, goal];
  for (let i = 1; i < points.length; i++) {
    if (!clear(points[i-1]!, points[i]!)) return {valid: false, reason: 'clearance', length};
    length += distance(points[i-1]!, points[i]!);
  }
  return {valid: true, reason: 'valid', length};
}

export function disposeProbe(probe: {query: {destroy():void}; navMesh?: NavMesh}) {
  probe.query.destroy(); probe.navMesh?.destroy();
}
