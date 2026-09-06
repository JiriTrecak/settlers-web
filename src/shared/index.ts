/** Shared types and math. No Three.js, no DOM. */
export type { Action, GridPos } from "./types/types";
export { inStamp, MAP_BLOCK, MAP_FRINGE, MAP_HALO, MAP_ID, MAP_SIZE, MAP_TILE, type GridMode } from "./map/map";
export {
  ASSET_CATEGORIES,
  ASSET_TYPES,
  CATALOGUE_VERSION,
  PROJECT_CATALOG_PATH,
  assetIdFromName,
  emptyCatalogue,
  parseCatalogue,
  stringifyCatalogue,
  type AssetCategory,
  type AssetType,
  type CatalogEntry,
  type Catalogue,
} from "./asset/catalog";
export {
  DEFAULT_MAP_NAME,
  emptyUtcMap,
  mapFileName,
  parseUtcMap,
  stringifyUtcMap,
  UTCMAP_EXT,
  UTCMAP_VERSION,
  type MapStamp,
  type UtcMap,
} from "./map/utcmap";
export {
  CHECKSUM_EVERY,
  COMMAND_DELAY,
  TICK_MS,
  localMatch,
  type MatchConfig,
  type Slot,
  type SlotKind,
} from "./match/match";
export {
  SAVE_FORMAT_VERSION,
  emptyPipeline,
  namedMatch,
  parsePipeline,
  parseMatchConfig,
  parseSaveForHost,
  type PipelineSnap,
  type SaveMeta,
} from "./save/save";
export { MATCH_HOST, matchHttp, matchWs } from "./net/endpoint";
export type {
  Bundle,
  ClientIdentity,
  ClientMsg,
  Commit,
  CommitSlot,
  CreateRoom,
  JoinRoom,
  RoomState,
  RoomView,
  ServerMsg,
  WireOutcome,
} from "./net/wire";
export { PLAYER_COLORS, clampPlayer, playerCss, playerRgb, playerRgbLite } from "./player/player";
