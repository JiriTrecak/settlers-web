export type DatColor = "rgb555" | "rgb565";

export type SeqKind = "settler" | "torso" | "shadow" | "landscape" | "gui";

export type DecodedImage = {
  width: number;
  height: number;
  offsetX: number;
  offsetY: number;
  rgba: Uint8ClampedArray;
};

export type PixelKind = "rgb" | "torso" | "shadow";
