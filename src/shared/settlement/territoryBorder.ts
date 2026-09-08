export const TERRITORY_EDGES = [[0, -1], [1, 0], [0, 1], [-1, 0]] as const;

/** First real boundary direction, encoded 1–4; zero means interior/unowned. */
export function territoryBorder(territory: ArrayLike<number>, x: number, z: number, size = 256): number {
  const owner = territory[z * size + x]!;
  if (owner < 0) return 0;
  const edge = TERRITORY_EDGES.findIndex(([dx, dz]) => {
    const nx = x + dx, nz = z + dz;
    return nx < 0 || nz < 0 || nx >= size || nz >= size || territory[nz * size + nx] !== owner;
  });
  return edge + 1;
}
