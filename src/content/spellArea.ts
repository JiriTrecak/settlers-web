/** Shared hit geometry for authoritative resolution and prospective AI scoring. */
export function spellAreaContains(
  effect: "line" | "blast",
  origin: { x: number; y: number },
  aim: { x: number; y: number },
  radius: number,
  p: { x: number; y: number },
): boolean {
  if (effect === "blast")
    return (p.x - aim.x) ** 2 + (p.y - aim.y) ** 2 <= radius ** 2;
  const dx = aim.x - origin.x,
    dy = aim.y - origin.y,
    length = dx * dx + dy * dy;
  const t = length
    ? ((p.x - origin.x) * dx + (p.y - origin.y) * dy) / length
    : 0;
  return (
    t >= 0 &&
    t <= 1 &&
    (p.x - origin.x - t * dx) ** 2 + (p.y - origin.y - t * dy) ** 2 <=
      radius ** 2
  );
}
