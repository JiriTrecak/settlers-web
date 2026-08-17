/** Shared value types. Actions are the only way the session mutates sim. */
export type GridPos = {
  readonly x: number;
  readonly y: number;
};

export type Action = { type: "noop" } | { type: "moveTo"; id: number; to: GridPos };
