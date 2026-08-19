/**
 * Client lockstep: clicks go in an outbox; confirm() ships `through` + bundles.
 * Session only ticks when a `commit` for that beat is in the mailbox.
 * Empty resends of the same `through` are dropped — silence on the wire is not a confirm,
 * but a 60 Hz Pixi ticker is not a new turn either.
 */
import type { Action, Commit } from "../shared";
import type { Channel } from "./channel";

export class Lockstep {
  private pending: Action[] = [];
  private readonly commits = new Map<number, Commit>();
  private sentThrough = 0;

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
   * Confirm this slot through `through`. Pending actions land at `bundleTick`
   * (default `through + delay`). No packet if `through` did not rise and the outbox is empty.
   */
  confirm(through: number, bundleTick = through + this.delay): void {
    const actions = this.pending;
    this.pending = [];
    const bundles = actions.length ? [{ tick: bundleTick, actions }] : [];
    if (through <= this.sentThrough && bundles.length === 0) return;
    this.sentThrough = Math.max(this.sentThrough, through);
    this.channel.send({ type: "turn", through: this.sentThrough, bundles });
  }

  take(next: number): Commit | undefined {
    const commit = this.commits.get(next);
    if (commit) this.commits.delete(next);
    return commit;
  }
}
