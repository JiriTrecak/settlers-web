/** Cooked sprite-atlas index. Runtime loader reads the same JSON. */
export type AtlasManifest = {
  size: number;
  pad: number;
  pages: { file: string; pack: string; frames: number; fill: number }[];
  frames: Record<string, { page: number; x: number; y: number; w: number; h: number }>;
};
