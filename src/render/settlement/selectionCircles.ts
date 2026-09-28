import { BufferGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial } from "three";
import type { HeightField } from "../../shared/map/height";

/** Warcraft III-style tint: own green, allies a cooler green, neutral yellow, enemy red.
 * `target` is the commanded attack target, which stays red regardless of relation. */
export type CircleRelation = "own" | "ally" | "neutral" | "enemy" | "target";
export type SelectionCircle = {id:number;x:number;z:number;surface?:string;radius:number;relation:CircleRelation;hover?:boolean};

const COLORS: Record<CircleRelation, number> = {own:0x3cff4e,ally:0x3cffc0,neutral:0xffe53c,enemy:0xff3a30,target:0xff3a30};
const SEGMENTS = 56;
/** Radial profile as [radius factor, line-width offset, alpha]: soft inner glow, solid core, feathered rim. */
const PROFILE: readonly (readonly [number, number, number])[] = [[1,-3.5,0],[1,-1.2,.25],[1,-.9,.95],[1,0,1],[1,.45,0]];

/** Ground rings for selected and hovered entities. Retained per entity so a steady
 * selection only re-drapes vertices; geometry follows terrain and walk surfaces. */
export class SelectionCircles {
  private readonly group = new Group();
  private readonly meshes = new Map<number, Mesh<BufferGeometry, MeshBasicMaterial>>();
  private readonly materials = new Map<string, MeshBasicMaterial>();
  constructor(parent: Group) {
    this.group.name = "selection-circles";
    parent.add(this.group);
  }
  private material(relation: CircleRelation, hover: boolean) {
    const key = relation + (hover ? ":hover" : "");
    let m = this.materials.get(key);
    if (!m) {
      m = new MeshBasicMaterial({color:COLORS[relation],vertexColors:true,transparent:true,opacity:hover?.5:1,depthWrite:false,
        polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false});
      this.materials.set(key, m);
    }
    return m;
  }
  update(circles: readonly SelectionCircle[], field: HeightField) {
    const live = new Set<number>();
    for (const c of circles) {
      live.add(c.id);
      let mesh = this.meshes.get(c.id);
      if (!mesh) {
        mesh = new Mesh(ringGeometry(), this.material(c.relation, !!c.hover));
        mesh.name = "selection-circle";
        mesh.userData.entityId = c.id;
        mesh.renderOrder = 3;
        mesh.raycast = () => {};
        this.meshes.set(c.id, mesh);
        this.group.add(mesh);
      }
      mesh.material = this.material(c.relation, !!c.hover);
      const key = `${c.x}:${c.z}:${c.radius}:${c.surface ?? ""}:${c.hover ? 1 : 0}`;
      if (mesh.userData.drape !== key || mesh.userData.field !== field) {
        drape(mesh.geometry, c, field);
        mesh.userData.drape = key;
        mesh.userData.field = field;
      }
    }
    for (const [id, mesh] of this.meshes) if (!live.has(id)) {
      mesh.geometry.dispose();
      mesh.removeFromParent();
      this.meshes.delete(id);
    }
  }
  dispose() {
    for (const mesh of this.meshes.values()) mesh.geometry.dispose();
    for (const m of this.materials.values()) m.dispose();
    this.meshes.clear();
    this.group.removeFromParent();
  }
}

function ringGeometry() {
  const rows = PROFILE.length, verts = rows * SEGMENTS;
  const g = new BufferGeometry(), colors = new Float32Array(verts * 4), index: number[] = [];
  for (let r = 0; r < rows; r++) for (let s = 0; s < SEGMENTS; s++) colors.set([1, 1, 1, PROFILE[r]![2]], (r * SEGMENTS + s) * 4);
  for (let r = 0; r < rows - 1; r++) for (let s = 0; s < SEGMENTS; s++) {
    const a = r * SEGMENTS + s, b = r * SEGMENTS + (s + 1) % SEGMENTS;
    // Angle runs +x→+z, so this winding keeps the face normal pointing up (front face).
    index.push(a, b, a + SEGMENTS, b, b + SEGMENTS, a + SEGMENTS);
  }
  g.setAttribute("position", new Float32BufferAttribute(new Float32Array(verts * 3), 3));
  g.setAttribute("color", new Float32BufferAttribute(colors, 4));
  g.setIndex(index);
  return g;
}

function drape(g: BufferGeometry, c: SelectionCircle, field: HeightField) {
  // Line width grows slowly with size, like WC3's small/medium/large circle textures.
  const width = Math.min(.2, .07 + c.radius * .025) * (c.hover ? .7 : 1);
  const p = g.getAttribute("position") as Float32BufferAttribute, arr = p.array as Float32Array;
  for (let r = 0; r < PROFILE.length; r++) {
    const [factor, offset] = PROFILE[r]!, radius = c.radius * factor + width * offset;
    for (let s = 0; s < SEGMENTS; s++) {
      const a = (s / SEGMENTS) * Math.PI * 2, x = c.x + Math.cos(a) * radius, z = c.z + Math.sin(a) * radius, i = (r * SEGMENTS + s) * 3;
      arr[i] = x; arr[i + 1] = field.walkSample(x, z, c.surface) + .07; arr[i + 2] = z;
    }
  }
  p.needsUpdate = true;
  g.computeBoundingSphere();
}
