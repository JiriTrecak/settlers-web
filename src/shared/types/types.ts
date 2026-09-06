/** Shared value types. Actions are the only way the session mutates sim. */
export type GridPos = {
  readonly x: number;
  readonly y: number;
};

/** Wire + enqueue payload. `noop` is dropped. `ping` is lockstep-only (sim ignores it). */
export type Action = { type: "noop" } | { type: "ping" };
