import {footprintBounds, BUILDING_CELL_SIZE} from '../../shared/spatial/footprint';
import { BufferGeometry, Float32BufferAttribute } from "three";

/** Cell boundaries are half-integers because simulation cells are centered on integers. */
export function placementGrid(
  x: number, z: number, width: number, depth: number,
  sample: (x: number, z: number) => number,
) {
  const fill: number[] = [], lines: number[] = [];
  const step = BUILDING_CELL_SIZE, columns = width / step, rows = depth / step;
  const {minX: left, minY: top} = footprintBounds({x, y: z}, {width, depth});
  const point = (a: number, b: number) => [a, sample(a, b) + 0.08, b];
  for (let row = 0; row < rows; row++)
    for (let col = 0; col < columns; col++) {
      const a = point(left + col * step, top + row * step),
        b = point(left + (col + 1) * step, top + row * step),
        c = point(left + (col + 1) * step, top + (row + 1) * step),
        d = point(left + col * step, top + (row + 1) * step);
      fill.push(...a, ...d, ...b, ...b, ...d, ...c);
      lines.push(...a, ...b, ...a, ...d);
      if (row === rows - 1) lines.push(...d, ...c);
      if (col === columns - 1) lines.push(...b, ...c);
    }
  const geometry = (vertices: number[]) =>
    new BufferGeometry().setAttribute("position", new Float32BufferAttribute(vertices, 3));
  return { fill: geometry(fill), lines: geometry(lines) };
}
