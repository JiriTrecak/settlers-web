/** Original S3 map-object bytes. Used only while dumping; engine stores trees/stones already decoded. */

/** Tree object ids in the original map: 68–80 and 84. */
export function isTreeObject(id: number): boolean {
  return (id >= 68 && id <= 80) || id === 84;
}

/** Stone pile ids 115–127 → remaining capacity 12–0. */
export function stoneCapacity(id: number): number | null {
  if (id < 115 || id > 127) return null;
  return 127 - id;
}
