import { TerrainMaterial } from "../terrain/terrainMaterial";
/**
 * Dirt plate as a height-displaced quad mesh. Uploads Y + local normals in a dirty disc.
 */
import {
  BufferAttribute,
  BufferGeometry,
  Mesh,
  MeshStandardMaterial,
  type Scene,
} from "three";
import {
  HEIGHT_ORIGIN,
  HEIGHT_SPAN,
  HEIGHT_VERTS,
  type HeightDirty,
  type HeightField,
} from "../../shared";

export const DIRT = 0x353330;

export class HeightMesh {
  readonly mesh: Mesh;
  private readonly pos: Float32Array;
  private readonly nor: Float32Array;
  private readonly geo: BufferGeometry;

  constructor(scene: Scene) {
    const verts = HEIGHT_VERTS;
    const pos = new Float32Array(verts * verts * 3);
    const nor = new Float32Array(verts * verts * 3);
    for (let iz = 0; iz < verts; iz++) {
      for (let ix = 0; ix < verts; ix++) {
        const i = (iz * verts + ix) * 3;
        pos[i] = HEIGHT_ORIGIN + ix;
        pos[i + 1] = 0;
        pos[i + 2] = HEIGHT_ORIGIN + iz;
        nor[i + 1] = 1;
      }
    }
    const idx = new Uint32Array(HEIGHT_SPAN * HEIGHT_SPAN * 6);
    let o = 0;
    for (let iz = 0; iz < HEIGHT_SPAN; iz++) {
      for (let ix = 0; ix < HEIGHT_SPAN; ix++) {
        const a = iz * verts + ix;
        const b = a + 1;
        const c = a + verts;
        const d = c + 1;
        idx[o++] = a;
        idx[o++] = c;
        idx[o++] = b;
        idx[o++] = b;
        idx[o++] = c;
        idx[o++] = d;
      }
    }
    const geo = new BufferGeometry();
    geo.setAttribute("position", new BufferAttribute(pos, 3));
    geo.setAttribute("normal", new BufferAttribute(nor, 3));
    geo.setIndex(new BufferAttribute(idx, 1));
    geo.computeBoundingSphere();
    const mesh = new Mesh(
      geo,
      new TerrainMaterial(),
    );
    mesh.receiveShadow = true;
    mesh.castShadow = true;
    mesh.name = "height";
    scene.add(mesh);
    this.mesh = mesh;
    this.pos = pos;
    this.nor = nor;
    this.geo = geo;
  }

  setFrom(field: HeightField, dirty?: HeightDirty | null): void {
    const region = dirty ?? { loX: 0, hiX: HEIGHT_VERTS - 1, loZ: 0, hiZ: HEIGHT_VERTS - 1 };
    const verts = HEIGHT_VERTS;
    for (let iz = region.loZ; iz <= region.hiZ; iz++) {
      for (let ix = region.loX; ix <= region.hiX; ix++) {
        this.pos[(iz * verts + ix) * 3 + 1] = field.samples[iz * verts + ix]!;
      }
    }
    this.writeNormals(field.samples, region);
    const pa = this.geo.getAttribute("position") as BufferAttribute;
    const na = this.geo.getAttribute("normal") as BufferAttribute;
    pa.needsUpdate = true;
    na.needsUpdate = true;
    this.geo.computeBoundingSphere();
  }

  destroy(scene: Scene): void {
    scene.remove(this.mesh);
    this.geo.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }

  private writeNormals(samples: Float32Array, dirty: HeightDirty): void {
    const verts = HEIGHT_VERTS;
    const loX = Math.max(0, dirty.loX - 1);
    const hiX = Math.min(verts - 1, dirty.hiX + 1);
    const loZ = Math.max(0, dirty.loZ - 1);
    const hiZ = Math.min(verts - 1, dirty.hiZ + 1);
    for (let iz = loZ; iz <= hiZ; iz++) {
      for (let ix = loX; ix <= hiX; ix++) {
        const h = samples[iz * verts + ix]!;
        const hl = ix > 0 ? samples[iz * verts + (ix - 1)]! : h;
        const hr = ix < verts - 1 ? samples[iz * verts + (ix + 1)]! : h;
        const hd = iz > 0 ? samples[(iz - 1) * verts + ix]! : h;
        const hu = iz < verts - 1 ? samples[(iz + 1) * verts + ix]! : h;
        const nx = hl - hr;
        const ny = 2;
        const nz = hd - hu;
        const len = Math.hypot(nx, ny, nz) || 1;
        const o = (iz * verts + ix) * 3;
        this.nor[o] = nx / len;
        this.nor[o + 1] = ny / len;
        this.nor[o + 2] = nz / len;
      }
    }
  }
}
