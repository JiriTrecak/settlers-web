import { BufferGeometry, Float32BufferAttribute } from "three";

/** Cell boundaries are half-integers because simulation cells are centered on integers. */
export function placementGrid(
  x: number, z: number, width: number, depth: number,
  sample: (x: number, z: number) => number,
) {
  const fill: number[] = [], lines: number[] = [];
  const left = x - width / 2, top = z - depth / 2;
  const point = (a: number, b: number) => [a, sample(a, b) + 0.08, b];
  for (let row = 0; row < depth; row++)
    for (let col = 0; col < width; col++) {
      const a = point(left + col, top + row),
        b = point(left + col + 1, top + row),
        c = point(left + col + 1, top + row + 1),
        d = point(left + col, top + row + 1);
      fill.push(...a, ...d, ...b, ...b, ...d, ...c);
      lines.push(...a, ...b, ...a, ...d);
      if (row === depth - 1) lines.push(...d, ...c);
      if (col === width - 1) lines.push(...b, ...c);
    }
  const geometry = (vertices: number[]) =>
    new BufferGeometry().setAttribute("position", new Float32BufferAttribute(vertices, 3));
  return { fill: geometry(fill), lines: geometry(lines) };
}
