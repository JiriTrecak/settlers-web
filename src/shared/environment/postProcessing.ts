/** Biome-owned art direction. These settings are never serialized into a map. */
export type PostProcessingSettings = {
  exposure: number;
  contrast: number;
  /** Display-space knee for a hue-preserving highlight shoulder; zero bypasses it. */
  highlightShoulder: number;
  saturation: number;
  shadowTint: string;
  highlightTint: string;
  splitStrength: number;
  shadowLift: number;
  vignette: number;
  bloom: {strength: number; threshold: number; knee: number; radius: number};
  contact: {strength: number; radius: number; bias: number};
};

/** Neutral is useful for renderer tests and environments without a biome. */
export const NEUTRAL_POST_PROCESSING: PostProcessingSettings = {
  exposure: 1, contrast: 1, saturation: 1, highlightShoulder: 0,
  shadowTint: '#ffffff', highlightTint: '#ffffff', splitStrength: 0, shadowLift: 0, vignette: 0,
  bloom: {strength: 0, threshold: .8, knee: .4, radius: 1},
  contact: {strength: 0, radius: 1.8, bias: .06},
};

/** The expensive buffers remain bounded, including screenshots and Retina. */
export function beautyBufferSize(width: number, height: number) {
  const scale = Math.min(.5, Math.sqrt(180_000 / Math.max(1, width * height)));
  return {width: Math.max(1, Math.floor(width * scale)), height: Math.max(1, Math.floor(height * scale))};
}
