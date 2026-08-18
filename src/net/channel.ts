/**
 * Client mailbox. Session never constructs a WebSocket; App hands a Channel in.
 */
import type { ClientMsg, ServerMsg } from "../shared";

export type Channel = {
  send(msg: ClientMsg): void;
  onMessage(fn: (msg: ServerMsg) => void): void;
};
