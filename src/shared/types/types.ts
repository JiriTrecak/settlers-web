/** Shared value types. Actions stay here so sim and UI share one shape. */
export type GridPos = {
  readonly x: number;
  readonly y: number;
};

export type Action = { type: "noop" };
