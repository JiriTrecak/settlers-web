/** Shared types and math. No Three.js, no DOM. */
export type { Action, GridPos } from "./types/types";
export { MAP_ID, MAP_SIZE } from "./map/map";
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
