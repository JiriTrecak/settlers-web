/**
 * Eight player tints shared by menu swatches, faction materials and map markers.
 */
export const PLAYER_COLORS = [
  0xa04b31, // Red: authored ant color
  0x2878df, // Blue
  0x34a853, // Green
  0xf2cf35, // Yellow
  0xed842a, // Orange
  0x9656cf, // Purple
  0x36cbd0, // Cyan
  0xeeeeee, // White
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

/** 50/50 with white. */
export function playerRgbLite(i: number): [number, number, number] {
  const [r, g, b] = playerRgb(i);
  return [(r + 255) >> 1, (g + 255) >> 1, (b + 255) >> 1];
}
