/** Shared grid math and landscape types. No Pixi, no DOM. */
export type { Action, GridPos } from "./types/types";
export {
  CHECKSUM_EVERY,
  COMMAND_DELAY,
  TICK_MS,
  localMatch,
  type MatchConfig,
  type Slot,
  type SlotKind,
} from "./match/match";
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
export {
  TOWER_RADIUS,
  Y_SCALE,
  circleBounds,
  circleContains,
  distanceSquared,
  forEachCircleBorder,
  forEachCircleTile,
  squaredDistance,
  type CircleRect,
} from "./shape/mapCircle";
export { DIRECTIONS, approxDirection, deltaOf, directionFromDelta, neighborDir, type Direction } from "./direction/direction";
export { PLAYER_COLORS, clampPlayer, playerCss, playerRgb, playerRgbLite } from "./player/player";
export {
  HEIGHT_X,
  HEIGHT_Y,
  TILE_HEIGHT,
  TILE_WIDTH,
  gridToWorld,
  isoDepth,
  ISO_DEPTH_PROP,
  ISO_DEPTH_BUILDING,
  ISO_DEPTH_UNIT,
  ISO_DEPTH_WAVE,
  pickCell,
  pickGrid,
  worldToGrid,
  type WorldPos,
} from "./iso/iso";
export {
  HEX_DELTAS,
  LANDSCAPE_TYPES,
  hexDist,
  isAllowedNeighbor,
  isRiver,
  isWater,
  landscapeIndex,
  landscapeInfo,
  landscapeNeighbors,
  slopeShade,
  type LandscapeType,
} from "./landscape/landscape";
