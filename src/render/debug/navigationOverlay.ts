/** Debug-only navigation overlay: a colour-coded walkability grid draped on the terrain and
 * the live routes of moving units. It is constructed on first use and fully disposed when
 * the debug toggles turn off, so a normal match never allocates or draws any of it. */
import {
  BufferAttribute, BufferGeometry, DataTexture, Group, Mesh, NearestFilter, Points, PointsMaterial,
  RGBAFormat, ShaderMaterial, Vector2, type Scene,
} from "three";
import { LineMaterial } from "three/examples/jsm/lines/LineMaterial.js";
import { LineSegments2 } from "three/examples/jsm/lines/LineSegments2.js";
import { LineSegmentsGeometry } from "three/examples/jsm/lines/LineSegmentsGeometry.js";
import type { HeightField } from "../../shared/map/height";
import type { Owner } from "../../content/schema";
import { NAV_CELL, type NavigationPath } from "../../sim/game/navigationDebug";

type Relation = "own" | "ally" | "neutral" | "enemy";
/** Grid texel colours (RGBA 0–255), indexed by NAV_CELL. Walkable ground gets a faint tint so gaps read. */
const CELL_RGBA: Record<number, readonly [number, number, number, number]> = {
  [NAV_CELL.walkable]: [70, 255, 130, 40],
  [NAV_CELL.water]: [40, 130, 255, 110],
  [NAV_CELL.terrain]: [255, 60, 50, 140],
  [NAV_CELL.building]: [255, 165, 40, 150],
  [NAV_CELL.resource]: [205, 70, 255, 150],
  [NAV_CELL.deck]: [60, 235, 255, 120],
};
const PATH_RGB: Record<Relation, readonly [number, number, number]> = {
  own: [0.24, 1, 0.31], ally: [0.24, 1, 0.75], neutral: [1, 0.9, 0.24], enemy: [1, 0.23, 0.19],
};
/** Cells per side of the draped grid window. Large maps would need millions of vertices
 * for a full drape, so only the area around the camera is meshed. */
const WINDOW = 128;
/** The window re-centres once the camera leaves its middle region. */
const RECENTER = 24;
const GRID_LIFT = 0.08, PATH_LIFT = 0.3;
/** Cell texels plus thin cell borders. Borders are measured in screen-space derivatives so
 * they stay one pixel wide, and fade out once cells shrink below a few pixels. */
const GRID_SHADER = {
  vertex: /* glsl */ `varying vec2 vUv;
void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}`,
  fragment: /* glsl */ `uniform sampler2D map;uniform float size;varying vec2 vUv;
void main(){
  vec4 c=texture2D(map,vUv);
  vec2 cell=vUv*size,f=fract(cell),w=fwidth(cell);
  vec2 e=smoothstep(vec2(0.0),w*1.2,min(f,1.0-f));
  float edge=(1.0-min(e.x,e.y))*(1.0-smoothstep(0.2,0.45,max(w.x,w.y)));
  gl_FragColor=vec4(c.rgb*(1.0-0.45*edge),min(1.0,c.a+edge*0.22));
}`,
};

export class NavigationOverlay {
  private readonly group = new Group();
  private texture: DataTexture | null = null;
  private grid: Mesh | null = null;
  private centre: { x: number; z: number; field: HeightField } | null = null;
  private readonly lines: LineSegments2;
  private readonly marks: Points;

  constructor(private readonly scene: Scene) {
    this.group.name = "navigation-debug";
    const lineMaterial = new LineMaterial({ vertexColors: true, linewidth: 3, transparent: true, depthTest: false, depthWrite: false });
    this.lines = new LineSegments2(new LineSegmentsGeometry(), lineMaterial);
    this.lines.visible = false;
    // Fat lines are extruded in screen space and need the current viewport in CSS pixels.
    const viewport = new Vector2();
    this.lines.onBeforeRender = (renderer) => lineMaterial.resolution.copy(renderer.getSize(viewport));
    this.marks = new Points(new BufferGeometry(),
      new PointsMaterial({ vertexColors: true, size: 7, sizeAttenuation: false, transparent: true, depthTest: false, depthWrite: false }));
    // Drawn after the scene's transparent pass so foliage and canopy cannot hide blocked cells.
    this.lines.renderOrder = this.marks.renderOrder = 9;
    this.lines.frustumCulled = this.marks.frustumCulled = false;
    this.group.add(this.lines, this.marks);
    scene.add(this.group);
  }

  /** Replace the grid texture, or remove the grid when `cells` is null. */
  setGrid(size: number, cells: Uint8Array | null): void {
    if (!cells) {
      this.disposeGrid();
      return;
    }
    if (!this.texture || this.texture.image.width !== size) {
      this.disposeGrid();
      this.texture = new DataTexture(new Uint8Array(size * size * 4), size, size, RGBAFormat);
      this.texture.magFilter = this.texture.minFilter = NearestFilter;
    }
    const data = this.texture.image.data as Uint8Array;
    for (let i = 0; i < cells.length; i++) data.set(CELL_RGBA[cells[i]!] ?? CELL_RGBA[NAV_CELL.terrain]!, i * 4);
    this.texture.needsUpdate = true;
    this.centre = null;
  }

  /** Re-drape the grid window when the camera has moved far enough. Cheap when nothing changed. */
  follow(x: number, z: number, field: HeightField | null): void {
    if (!this.texture || !field) return;
    const c = this.centre;
    if (c && c.field === field && Math.abs(c.x - x) < RECENTER && Math.abs(c.z - z) < RECENTER) return;
    const size = this.texture.image.width;
    const x0 = Math.max(0, Math.min(size - WINDOW, Math.round(x - WINDOW / 2)));
    const z0 = Math.max(0, Math.min(size - WINDOW, Math.round(z - WINDOW / 2)));
    const w = Math.min(WINDOW, size), verts = w + 1;
    const position = new Float32Array(verts * verts * 3), uv = new Float32Array(verts * verts * 2);
    // Vertices sit on cell corners (cell i spans i-0.5..i+0.5), so each texel covers one cell.
    for (let iz = 0; iz < verts; iz++)
      for (let ix = 0; ix < verts; ix++) {
        const k = iz * verts + ix, wx = x0 + ix - 0.5, wz = z0 + iz - 0.5;
        position.set([wx, field.sample(wx, wz) + GRID_LIFT, wz], k * 3);
        uv.set([(x0 + ix) / size, (z0 + iz) / size], k * 2);
      }
    const index = new Uint32Array(w * w * 6);
    for (let iz = 0, n = 0; iz < w; iz++)
      for (let ix = 0; ix < w; ix++, n += 6) {
        const a = iz * verts + ix, b = a + 1, c2 = a + verts, d = c2 + 1;
        index.set([a, c2, b, b, c2, d], n);
      }
    const geometry = new BufferGeometry();
    geometry.setAttribute("position", new BufferAttribute(position, 3));
    geometry.setAttribute("uv", new BufferAttribute(uv, 2));
    geometry.setIndex(new BufferAttribute(index, 1));
    if (!this.grid) {
      const material = new ShaderMaterial({
        uniforms: { map: { value: this.texture }, size: { value: size } },
        vertexShader: GRID_SHADER.vertex, fragmentShader: GRID_SHADER.fragment,
        transparent: true, depthTest: false, depthWrite: false,
      });
      this.grid = new Mesh(geometry, material);
      this.grid.renderOrder = 8;
      this.grid.frustumCulled = false;
      this.group.add(this.grid);
    } else {
      this.grid.geometry.dispose();
      this.grid.geometry = geometry;
    }
    this.centre = { x, z, field };
  }

  /** Route polylines plus a dot per waypoint, tinted by owner relation. Null clears them. */
  setPaths(paths: readonly NavigationPath[] | null, relation: (owner: Owner) => Relation): void {
    let segments = 0, points = 0;
    for (const p of paths ?? []) {
      const n = p.points.length / 3;
      segments += Math.max(0, n - 1);
      points += n - 1;
    }
    const line = new Float32Array(segments * 6), lineColor = new Float32Array(segments * 6);
    const dot = new Float32Array(points * 3), dotColor = new Float32Array(points * 3);
    let l = 0, d = 0;
    for (const p of paths ?? []) {
      const rgb = PATH_RGB[relation(p.owner)], q = p.points;
      for (let i = 3; i < q.length; i += 3) {
        line.set([q[i - 3]!, q[i - 2]! + PATH_LIFT, q[i - 1]!, q[i]!, q[i + 1]! + PATH_LIFT, q[i + 2]!], l);
        lineColor.set([...rgb, ...rgb], l);
        l += 6;
        dot.set([q[i]!, q[i + 1]! + PATH_LIFT, q[i + 2]!], d);
        dotColor.set(rgb, d);
        d += 3;
      }
    }
    this.lines.geometry.dispose();
    const segmentsGeometry = new LineSegmentsGeometry();
    if (segments) segmentsGeometry.setPositions(line).setColors(lineColor);
    this.lines.geometry = segmentsGeometry;
    this.lines.visible = segments > 0;
    this.marks.geometry.dispose();
    const marks = new BufferGeometry();
    marks.setAttribute("position", new BufferAttribute(dot, 3));
    marks.setAttribute("color", new BufferAttribute(dotColor, 3));
    this.marks.geometry = marks;
  }

  private disposeGrid(): void {
    if (this.grid) {
      this.grid.geometry.dispose();
      (this.grid.material as ShaderMaterial).dispose();
      this.grid.removeFromParent();
      this.grid = null;
    }
    this.texture?.dispose();
    this.texture = null;
    this.centre = null;
  }

  dispose(): void {
    this.disposeGrid();
    this.lines.geometry.dispose();
    this.lines.material.dispose();
    this.marks.geometry.dispose();
    (this.marks.material as PointsMaterial).dispose();
    this.scene.remove(this.group);
  }
}
