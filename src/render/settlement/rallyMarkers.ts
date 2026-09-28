import { Color, CylinderGeometry, DoubleSide, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, RingGeometry, SphereGeometry, type BufferAttribute } from "three";
import { Line2 } from "three/addons/lines/Line2.js";
import { LineGeometry } from "three/addons/lines/LineGeometry.js";
import { LineMaterial } from "three/addons/lines/LineMaterial.js";
import type { HeightField } from "../../shared/map/height";
import { PLAYER_COLORS, clampPlayer } from "../../shared/player/player";

type GroundPoint = {x:number;z:number;surface?:string};
/** One rally shown for a selected production building: door → flag. */
export type RallyMarker = {id:number;from:GroundPoint;to:GroundPoint;slot:number};

/** Modelled at 1.9 m, scaled to about unit height so the flag reads at RTS zoom like WC3's. */
const BANNER_W = .78, BANNER_H = .46, POLE = 1.9, FLAG_SCALE = 1.6;

/** Rally flags and routes for the viewer's selected buildings. WC3 plants a team banner;
 * the dashed route (SC2-style) additionally says which building sends units where. */
export class RallyMarkers {
  private readonly group = new Group();
  private readonly flags = new Map<number, {root:Group;banner:Mesh<PlaneGeometry,MeshStandardMaterial>;ring:Mesh<RingGeometry,MeshBasicMaterial>;line:Line2;key:string}>();
  private readonly pole = new CylinderGeometry(.035, .05, POLE, 6).translate(0, POLE / 2, 0);
  private readonly finial = new SphereGeometry(.07, 8, 6).translate(0, POLE + .04, 0);
  // Flags draw over scenery: rallies on trees sit inside canopies whose branches reach the ground.
  // Transparent pass + late renderOrder, since foliage itself renders in the transparent pass.
  private readonly wood = new MeshStandardMaterial({color:0x5a4030,roughness:.85,depthTest:false,transparent:true});
  private readonly brass = new MeshStandardMaterial({color:0xd8b25a,roughness:.4,metalness:.6,depthTest:false,transparent:true});
  constructor(parent: Group) {
    this.group.name = "rally-markers";
    parent.add(this.group);
  }
  update(markers: readonly RallyMarker[], field: HeightField, seconds: number) {
    const live = new Set<number>();
    for (const m of markers) {
      live.add(m.id);
      const flag = this.flags.get(m.id) ?? this.create(m);
      const key = `${m.from.x}:${m.from.z}:${m.to.x}:${m.to.z}:${m.to.surface ?? ""}:${m.slot}`;
      if (flag.key !== key) {
        flag.key = key;
        const y = field.walkSample(m.to.x, m.to.z, m.to.surface);
        flag.root.position.set(m.to.x, y, m.to.z);
        // Fresh geometry: InstancedBufferGeometry caches its instance count, so reusing it
        // with a longer route would truncate the line.
        flag.line.geometry.dispose();
        flag.line.geometry = new LineGeometry().setPositions(route(m, field));
        flag.line.computeLineDistances();
        const color = new Color(PLAYER_COLORS[clampPlayer(m.slot)]);
        flag.banner.material.color.copy(color);
        flag.banner.material.emissive.copy(color).multiplyScalar(.25);
        flag.ring.material.color.copy(color).lerp(new Color(0xffffff), .25);
        (flag.line.material as LineMaterial).color.copy(color).lerp(new Color(0xffffff), .45);
      }
      wave(flag.banner.geometry, seconds + m.id * .37);
      flag.ring.material.opacity = .55 + .35 * Math.sin(seconds * 3.2);
      // Negative offset marches the dashes from the building toward the flag.
      (flag.line.material as LineMaterial).dashOffset = -seconds * 1.4;
    }
    for (const [id, flag] of this.flags) if (!live.has(id)) this.remove(id, flag);
  }
  private create(m: RallyMarker) {
    const root = new Group();
    root.name = "rally-flag";
    const pole = new Mesh(this.pole, this.wood), finial = new Mesh(this.finial, this.brass);
    pole.castShadow = finial.castShadow = true;
    const banner = new Mesh(new PlaneGeometry(BANNER_W, BANNER_H, 8, 2).translate(BANNER_W / 2, POLE - BANNER_H / 2 - .06, 0),
      new MeshStandardMaterial({side:DoubleSide,roughness:.8,depthTest:false,transparent:true}));
    banner.castShadow = true;
    pole.renderOrder = finial.renderOrder = 6;
    banner.renderOrder = 7;
    const ring = new Mesh(new RingGeometry(.42, .55, 40).rotateX(-Math.PI / 2).translate(0, .07, 0),
      new MeshBasicMaterial({transparent:true,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2,toneMapped:false}));
    root.add(pole, finial, banner, ring);
    root.scale.setScalar(FLAG_SCALE);
    const line = new Line2(new LineGeometry(), new LineMaterial({linewidth:2.5,worldUnits:false,dashed:true,dashSize:.55,gapSize:.35,transparent:true,opacity:.85,depthWrite:false}));
    line.name = "rally-route";
    for (const o of [pole, finial, banner, ring, line]) o.raycast = () => {};
    this.group.add(root, line);
    const flag = {root, banner, ring, line, key: ""};
    this.flags.set(m.id, flag);
    return flag;
  }
  private remove(id: number, flag: {root:Group;banner:Mesh<PlaneGeometry,MeshStandardMaterial>;ring:Mesh<RingGeometry,MeshBasicMaterial>;line:Line2}) {
    flag.banner.geometry.dispose(); flag.banner.material.dispose();
    flag.ring.geometry.dispose(); flag.ring.material.dispose();
    flag.line.geometry.dispose(); (flag.line.material as LineMaterial).dispose();
    flag.root.removeFromParent(); flag.line.removeFromParent();
    this.flags.delete(id);
  }
  dispose() {
    for (const [id, flag] of this.flags) this.remove(id, flag);
    this.pole.dispose(); this.finial.dispose(); this.wood.dispose(); this.brass.dispose();
    this.group.removeFromParent();
  }
}

/** Ground-hugging polyline sampled every half metre so the route follows hills and bridges. */
function route(m: RallyMarker, field: HeightField) {
  const dx = m.to.x - m.from.x, dz = m.to.z - m.from.z, steps = Math.max(1, Math.ceil(Math.hypot(dx, dz) / .5)), out: number[] = [];
  for (let i = 0; i <= steps; i++) {
    const t = i / steps, x = m.from.x + dx * t, z = m.from.z + dz * t;
    out.push(x, field.walkSample(x, z, t < .5 ? m.from.surface : m.to.surface) + .14, z);
  }
  return out;
}

/** Travelling sine along the fly edge; the hoist edge (x = 0) stays pinned to the pole. */
function wave(g: PlaneGeometry, t: number) {
  const p = g.getAttribute("position") as BufferAttribute;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i) / BANNER_W;
    p.setZ(i, Math.sin(t * 4.2 - u * 5.5) * .09 * u);
  }
  p.needsUpdate = true;
  g.computeVertexNormals();
}
