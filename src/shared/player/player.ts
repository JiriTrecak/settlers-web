/**
 * Eight S3 player tints. Torso grayscale × this RGB. Shared by menu swatches and sprites.
 */
export const PLAYER_COLORS = [
  0x285ac8, // 40, 90, 200
  0xc82828,
  0xdcb428,
  0x28a046,
  0xdc6e1e,
  0x28b4c8,
  0xb43cb4,
  0xb4b4b4,
] as const;

export function clampPlayer(n: number): number {
  return Math.min(PLAYER_COLORS.length - 1, Math.max(0, n | 0));
}

export function playerCss(i: number): string {
  return `#${PLAYER_COLORS[clampPlayer(i)]!.toString(16).padStart(6, "0")}`;
}

export function playerRgb(i: number): [number, number, number] {
  const c = PLAYER_COLORS[clampPlayer(i)]!;
  return [(c >> 16) & 255, (c >> 8) & 255, c & 255];
}

/** 50/50 with white — minimap units vs solid building/border. */
export function playerRgbLite(i: number): [number, number, number] {
  const [r, g, b] = playerRgb(i);
  return [(r + 255) >> 1, (g + 255) >> 1, (b + 255) >> 1];
}
