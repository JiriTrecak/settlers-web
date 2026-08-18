/** Public sim surface. No Pixi. */
export { Clock } from "./clock/clock";
export { emptyTickTimings, TICK_PHASES, TickTimer, type TickPhase, type TickTimings } from "./clock/profile";
export { seedRng, type Rng } from "./rng/rng";
export { MapGrid } from "./map/mapGrid";
export { generateIsland, generateMap, mapById, MAPS, type MapDef, type MapId } from "./map/generateIsland";
export {
  decorationsFromDumpedMap,
  gridFromDumpedMap,
  isDumpedMap,
  matchStarts,
  mapStartCap,
  clampMatchPlayers,
  startForPlayer,
  startsFromDumpedMap,
  type DumpedMap,
  type MapCatalogEntry,
  type MapGroup,
  type MapStart,
} from "./map/dumpedMap";
export { allDecorations, treeSheetAt, waveDecorations, type MapDecoration } from "./decorations/decorations";
export { mapViewFromGrid, type MapView } from "./map/mapView";
export { World, type LoggedAction, type ViewSnapshot, type MatchOutcome } from "./world/world";
export { LandGrid, UNOWNED, type LandView } from "./land/land";
export {
  FogGrid,
  FOG_EXPLORED,
  FOG_VISIBLE,
  buildingViewDistance,
  type FogView,
  type HiddenTile,
} from "./fog/fog";
export { MarkGrid } from "./mark/mark";
export { Building, BuildingGrid, canPlace, TOWER_DOOR_HP, type BuildingState, type BuildingView } from "./building/building";
export { constructionMarkValue, constructionMarkFrame, CONSTRUCTION_MARK_MAX, flattenTooSteep, needsFlatten } from "./building/flatten";
export { buildings, buildingDef, type BuildingKind } from "./data/buildings";
export { settlers, settlerDef, needsPlayersGround, unitViewDistance, isAttackable, isControllable, isSoldier, type SettlerKind } from "./data/settlers";
export {
  ObjectGrid,
  STACK_SIZE,
  addToStack,
  canDeposit,
  goodsStack,
  isAdjacent,
  objectsFromDumpedMap,
  scatterTrees,
  trunkStack,
  type MapObjectKind,
  type MapObjectView,
  type StackMaterial,
} from "./object/object";
export {
  BEARER_STEP_MS,
  Movable,
  type MovableAction,
  type MovableMaterial,
  type MovableType,
  type MovableView,
} from "./movable/movable";
export { CHOP_TICKS, DROP_TICKS, PICKUP_TICKS, tickJob, workTicksOf, markOf, type Job, type JobContext } from "./job/job";
export { tickProfession, type ProfessionContext } from "./profession/profession";
export { placeColony } from "./economy/startKit";
export { tickMatcher } from "./economy/matcher";
export { tickConstruction, type ConstructionContext } from "./economy/construction";
export type { Goods } from "./data/types";
export { findPath, isWalkable, nearestWalkable, standBeside, type Blockers } from "./path/path";
