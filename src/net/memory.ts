/**
 * Channel bound to one slot on an in-process Room. send() is sync; commit comes back on the same stack.
 */
import type { ClientMsg, ServerMsg } from "../shared";
import type { Channel } from "./channel";
import type { Room } from "./room";

export class MemoryChannel implements Channel {
  private fn: ((msg: ServerMsg) => void) | null = null;
  private readonly unsub: () => void;

  constructor(
    private readonly room: Room,
    readonly player: number,
  ) {
    this.unsub = room.subscribe((msg) => this.fn?.(msg));
  }

  send(msg: ClientMsg): void {
    if (msg.type === "turn") this.room.confirm(this.player, msg.through, msg.bundles);
  }

  onMessage(fn: (msg: ServerMsg) => void): void {
    this.fn = fn;
  }

  destroy(): void {
    this.unsub();
    this.fn = null;
  }
}
