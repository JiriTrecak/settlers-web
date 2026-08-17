/**
 * Landscape mesh buffers: two triangles per cell, verts duplicated for unique UVs.
 */
import { gridToWorld, landscapeInfo, slopeShade } from "../../shared";
import type { MapView } from "../../sim/map/mapView";
import { triangleTexture } from "./landscapeUv";

export type LandscapeGeometryData = {
  positions: Float32Array;
  colors: Float32Array;
  uvs: Float32Array;
  shades: Float32Array;
  indices: Uint32Array;
};

export function landscapeTriangleCount(width: number, height: number): number {
  return (width - 1) * (height - 1) * 2;
}

/**
 * Two triangles per cell, verts duplicated so each triangle can have its own UVs.
 * Shade from the north height delta. Vertex colors kept for untextured fallback.
 */
export function buildLandscapeGeometry(view: MapView): LandscapeGeometryData {
  const { width, height } = view;
  const vertCount = landscapeTriangleCount(width, height) * 3;
  const positions = new Float32Array(vertCount * 2);
  const colors = new Float32Array(vertCount * 3);
  const uvs = new Float32Array(vertCount * 2);
  const shades = new Float32Array(vertCount);
  const indices = new Uint32Array(vertCount);

  const interior = (x: number, y: number) => x > 0 && x < width - 2 && y > 0 && y < height - 2;

  let vi = 0;
  const emit = (x: number, y: number, u: number, v: number): void => {
    const h = view.heightAt(x, y);
    const p = gridToWorld(x, y, h);
    positions[vi * 2] = p.x;
    positions[vi * 2 + 1] = p.y;
    uvs[vi * 2] = u;
    uvs[vi * 2 + 1] = v;
    const [r, g, b] = landscapeInfo[view.landscapeAt(x, y)].color;
    let shade = 0;
    if (interior(x, y)) {
      shade = slopeShade(h, view.heightAt(x, y - 1));
    }
    shades[vi] = shade;
    colors[vi * 3] = r * shade;
    colors[vi * 3 + 1] = g * shade;
    colors[vi * 3 + 2] = b * shade;
    indices[vi] = vi;
    vi++;
  };

  const emitTriangle = (x1: number, y: number, up: boolean, useSecondParameter: number): void => {
    const y1 = y + (up ? 1 : 0);
    const x2 = x1 + (up ? 0 : 1);
    const y2 = y + (up ? 0 : 1);
    const x3 = x1 + 1;
    const y3 = y + (up ? 1 : 0);
    const left = view.landscapeAt(x1, y1);
    const a = view.landscapeAt(x2, y2);
    const right = view.landscapeAt(x3, y3);
    const { uvs: tex } = triangleTexture(left, a, right, up, useSecondParameter, x1, y);
    if (up) {
      emit(x2, y2, tex[0], tex[1]);
      emit(x1, y1, tex[2], tex[3]);
      emit(x3, y3, tex[4], tex[5]);
    } else {
      emit(x1, y1, tex[0], tex[1]);
      emit(x2, y2, tex[2], tex[3]);
      emit(x3, y3, tex[4], tex[5]);
    }
  };

  for (let y = 0; y < height - 1; y++) {
    for (let x = 0; x < width - 1; x++) {
      // `useSecondParameter` jitters which blend variant the UV picker uses.
      emitTriangle(x, y, true, x * 37 + y * 17);
      emitTriangle(x, y, false, x);
    }
  }

  return { positions, colors, uvs, shades, indices };
}
