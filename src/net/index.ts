/** Lockstep mailbox. Imports `shared` only — no sim, no Pixi. */
export type { Channel } from "./channel";
export { Room } from "./room";
export { MemoryChannel } from "./memory";
export { Lockstep } from "./lockstep";
export { MatchHost, HostedMatch } from "./host";
export { WebSocketChannel } from "./ws";
export {
  createRoom,
  fetchHealth,
  fetchRooms,
  joinRoom,
  matchUrl,
  startRoom,
} from "./lobby";
