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
  BEARER_STEP_MS,
  Movable,
  type MovableAction,
  type MovableType,
  type MovableView,
} from "./movable/movable";
export { findPath, isWalkable, nearestWalkable } from "./path/path";
