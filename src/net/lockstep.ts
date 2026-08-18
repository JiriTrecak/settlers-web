/**
 * Client lockstep: clicks go in an outbox; confirm() ships `through` + bundles for through+D.
 * Session only ticks when a `commit` for that beat is in the mailbox.
 */
import type { Action, Commit } from "../shared";
import type { Channel } from "./channel";

export class Lockstep {
  private pending: Action[] = [];
  private readonly commits = new Map<number, Commit>();

  constructor(
    private readonly channel: Channel,
    readonly player: number,
    readonly delay: number,
  ) {
    channel.onMessage((msg) => {
      if (msg.type === "commit") this.commits.set(msg.tick, msg);
    });
  }

  /** Queue a click for this slot. Not an enqueue — Room assigns the tick at confirm. */
  send(action: Action): void {
    if (action.type === "noop" || action.type === "placeColony") return;
    this.pending.push(action);
  }

  /**
   * Confirm this slot through `next` (the beat Session wants to apply).
   * Bundles land at `next + delay`. Empty pending is still a confirm.
   */
  confirm(next: number): void {
    const actions = this.pending;
    this.pending = [];
    const bundles = actions.length ? [{ tick: next + this.delay, actions }] : [];
    this.channel.send({ type: "turn", through: next, bundles });
  }

  take(next: number): Commit | undefined {
    const commit = this.commits.get(next);
    if (commit) this.commits.delete(next);
    return commit;
  }
}
