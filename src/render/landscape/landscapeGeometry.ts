/**
 * Landscape mesh buffers: two triangles per cell, verts duplicated for unique UVs.
 * Grey fog tiles sample `hiddenAt` so flatten in the dark does not jump the mesh.
 * Digger height/type edits patch the affected cells — never rebuild the whole map.
 */
import { gridToWorld, landscapeInfo, slopeShade, type GridPos, type LandscapeType } from "../../shared";
import { FOG_VISIBLE, type FogView } from "../../sim/fog/fog";
import type { MapView } from "../../sim/map/mapView";
import { triangleTexture } from "./landscapeUv";

/** Two triangles, verts duplicated so each can have its own UVs. */
export const VERTS_PER_CELL = 6;

export type LandscapeGeometryData = {
  positions: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  shades: Float32Array;
  fogs: Float32Array;
  cells: Uint32Array;
  indices: Uint32Array;
  width: number;
};

export function landscapeTriangleCount(width: number, height: number): number {
  return (width - 1) * (height - 1) * 2;
}

export function cellVertexIndex(cx: number, cy: number, mapWidth: number): number {
  return (cy * (mapWidth - 1) + cx) * VERTS_PER_CELL;
}

/**
 * Two triangles per cell, verts duplicated so each triangle can have its own UVs.
 * Shade from the north height delta. Vertex colors kept for untextured fallback.
 */
export function buildLandscapeGeometry(view: MapView, fog?: FogView): LandscapeGeometryData {
  const { width, height } = view;
  const vertCount = landscapeTriangleCount(width, height) * 3;
  const data: LandscapeGeometryData = {
    positions: new Float32Array(vertCount * 2),
    colors: new Float32Array(vertCount * 3),
    uvs: new Float32Array(vertCount * 2),
    shades: new Float32Array(vertCount),
    fogs: new Float32Array(vertCount),
    cells: new Uint32Array(vertCount),
    indices: new Uint32Array(vertCount),
    width,
  };

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) writeCell(data, view, fog, x, y);
  }
  return data;
}

/**
 * Re-emit cells that share a vertex with `tiles`, plus the row south
 * (shade looks north). Same UV jitter as the initial build so patches don't flicker.
 */
export function patchLandscapeTiles(
  data: LandscapeGeometryData,
  view: MapView,
  fog: FogView | undefined,
  tiles: readonly GridPos[],
): void {
  const cellsW = view.width - 1;
  const cellsH = view.height - 1;
  const seen = new Set<number>();
  for (const t of tiles) {
    for (const [dx, dy] of SHADE_CELLS) {
      const cx = t.x + dx;
      const cy = t.y + dy;
      if (cx < 0 || cy < 0 || cx >= cellsW || cy >= cellsH) continue;
      const key = cy * cellsW + cx;
      if (seen.has(key)) continue;
      seen.add(key);
      writeCell(data, view, fog, cx, cy);
    }
  }
}

/** Cells whose verts include (gx, gy) or (gx, gy+1) — the latter for north-delta shade. */
const SHADE_CELLS: readonly [number, number][] = [
  [-1, -1],
  [0, -1],
  [-1, 0],
  [0, 0],
  [-1, 1],
  [0, 1],
];

function writeCell(data: LandscapeGeometryData, view: MapView, fog: FogView | undefined, cx: number, cy: number): void {
  let vi = cellVertexIndex(cx, cy, data.width);
  vi = writeTriangle(data, view, fog, vi, cx, cy, true, cx * 37 + cy * 17);
  writeTriangle(data, view, fog, vi, cx, cy, false, cx);
}

function writeTriangle(
  data: LandscapeGeometryData,
  view: MapView,
  fog: FogView | undefined,
  vi: number,
  x1: number,
  y: number,
  up: boolean,
  useSecondParameter: number,
): number {
  const at = (x: number, y: number) => sampleTile(view, fog, x, y);
  const y1 = y + (up ? 1 : 0);
  const x2 = x1 + (up ? 0 : 1);
  const y2 = y + (up ? 0 : 1);
  const x3 = x1 + 1;
  const y3 = y + (up ? 1 : 0);
  const { uvs: tex } = triangleTexture(at(x1, y1).landscape, at(x2, y2).landscape, at(x3, y3).landscape, up, useSecondParameter, x1, y);
  if (up) {
    writeVert(data, view, fog, vi++, x2, y2, tex[0], tex[1]);
    writeVert(data, view, fog, vi++, x1, y1, tex[2], tex[3]);
    writeVert(data, view, fog, vi++, x3, y3, tex[4], tex[5]);
  } else {
    writeVert(data, view, fog, vi++, x1, y1, tex[0], tex[1]);
    writeVert(data, view, fog, vi++, x2, y2, tex[2], tex[3]);
    writeVert(data, view, fog, vi++, x3, y3, tex[4], tex[5]);
  }
  return vi;
}

function writeVert(
  data: LandscapeGeometryData,
  view: MapView,
  fog: FogView | undefined,
  vi: number,
  x: number,
  y: number,
  u: number,
  v: number,
): void {
  const tile = sampleTile(view, fog, x, y);
  const p = gridToWorld(x, y, tile.height);
  data.positions[vi * 2] = p.x;
  data.positions[vi * 2 + 1] = p.y;
  data.uvs[vi * 2] = u;
  data.uvs[vi * 2 + 1] = v;
  const [r, g, b] = landscapeInfo[tile.landscape].color;
  let shade = 0;
  if (x > 0 && x < view.width - 2 && y > 0 && y < view.height - 2) {
    shade = slopeShade(tile.height, sampleTile(view, fog, x, y - 1).height);
  }
  data.shades[vi] = shade;
  data.fogs[vi] = fog ? fog.sightAt(x, y) / FOG_VISIBLE : 0;
  data.cells[vi] = y * data.width + x;
  data.colors[vi * 3] = r * shade;
  data.colors[vi * 3 + 1] = g * shade;
  data.colors[vi * 3 + 2] = b * shade;
  data.indices[vi] = vi;
}

function sampleTile(view: MapView, fog: FogView | undefined, x: number, y: number): { landscape: LandscapeType; height: number } {
  const hidden = fog?.isHidden(x, y) ? fog.hiddenAt(x, y) : undefined;
  if (hidden) return { landscape: hidden.landscape, height: hidden.height };
  return { landscape: view.landscapeAt(x, y), height: view.heightAt(x, y) };
}
