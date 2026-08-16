export type GridPos = {
  readonly x: number;
  readonly y: number;
};

export type ImageKind = "settler" | "gui" | "landscape";

export type ImageRef = {
  file: number;
  kind: ImageKind;
  sequence: number;
  frame: number;
};

export type Action = { type: "noop" };
