/** Public sim surface. No Pixi. */
export { Clock } from "./clock/clock";
export { seedRng, type Rng } from "./rng/rng";
export { MapGrid } from "./map/mapGrid";
export { generateIsland, generateMap, mapById, MAPS, type MapDef, type MapId } from "./map/generateIsland";
export {
  decorationsFromDumpedMap,
  gridFromDumpedMap,
  isDumpedMap,
  startForPlayer,
  startsFromDumpedMap,
  type DumpedMap,
  type MapCatalogEntry,
  type MapGroup,
  type MapStart,
} from "./map/dumpedMap";
export { allDecorations, treeSheetAt, waveDecorations, type MapDecoration } from "./decorations/decorations";
export { mapViewFromGrid, type MapView } from "./map/mapView";
export { World, type ViewSnapshot } from "./world/world";
export {
  ObjectGrid,
  isAdjacent,
  objectsFromDumpedMap,
  scatterTrees,
  type MapObjectKind,
  type MapObjectView,
} from "./object/object";
export {
  BEARER_STEP_MS,
  Movable,
  type MovableAction,
  type MovableType,
  type MovableView,
} from "./movable/movable";
export { CHOP_TICKS, tickJob, workTicksOf, type Job, type JobContext } from "./job/job";
export { findPath, isWalkable, nearestWalkable, standBeside, type Blockers } from "./path/path";
