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
   * (default `through + 1`). `delay` is how far empty `through` runs ahead of
   * display — not extra delay on the click. If `bundleTick` is already covered
   * by `sentThrough`, bump to `sentThrough + 1` (Room drops `tick <= committed`).
   * No packet if `through` did not rise and the outbox is empty.
   */
  confirm(through: number, bundleTick = through + 1): void {
    const actions = this.pending;
    this.pending = [];
    let at = bundleTick;
    if (actions.length && at <= this.sentThrough) at = this.sentThrough + 1;
    const bundles = actions.length ? [{ tick: at, actions }] : [];
    const sendThrough = actions.length ? Math.max(through, at) : through;
    if (sendThrough <= this.sentThrough && bundles.length === 0) return;
    this.sentThrough = Math.max(this.sentThrough, sendThrough);
    this.channel.send({ type: "turn", through: this.sentThrough, bundles });
  }

  take(next: number): Commit | undefined {
    const commit = this.commits.get(next);
    if (commit) this.commits.delete(next);
    return commit;
  }

  /** Unapplied commits in tick order. Save these; World has not `tick()`d them yet. */
  peek(): Commit[] {
    return [...this.commits.values()].sort((a, b) => a.tick - b.tick);
  }

  sent(): number {
    return this.sentThrough;
  }

  restore(commits: readonly Commit[], sentThrough: number): void {
    this.commits.clear();
    for (const c of commits) this.commits.set(c.tick, c);
    this.sentThrough = sentThrough;
    this.pending = [];
  }
}
