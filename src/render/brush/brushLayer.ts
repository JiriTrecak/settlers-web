/**
 * Ground splat + cursor for the foliage brush. Red trail drapes on the height
 * field so a mountain stroke sits on the slope, behind trunks.
 */
import {
  BufferAttribute,
  CircleGeometry,
  DataTexture,
  Mesh,
  MeshBasicMaterial,
  PlaneGeometry,
  RGBAFormat,
  RingGeometry,
  UnsignedByteType,
  type Scene,
} from "three";
import type { HeightDirty } from "../../shared";

const RED = 0xff2a2a;
const LIFT = 0.06;

export class BrushLayer {
  private readonly splat: Mesh;
  private readonly ring: Mesh;
  private readonly glow: Mesh;
  private tex: DataTexture | null = null;
  private span = 0;
  private origin = 0;
  private height: ((x: number, z: number) => number) | null = null;

  constructor(scene: Scene) {
    const splatMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      opacity: 1,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -2,
    });
    this.splat = new Mesh(new PlaneGeometry(1, 1), splatMat);
    this.splat.rotation.x = -Math.PI / 2;
    this.splat.position.y = 0;
    this.splat.renderOrder = 2;
    this.splat.visible = false;
    this.ring = new Mesh(
      new RingGeometry(0.92, 1, 48),
      new MeshBasicMaterial({ color: 0xf2eee0, transparent: true, depthWrite: false, opacity: 0.9 }),
    );
    this.ring.rotation.x = -Math.PI / 2;
    this.ring.position.y = 0.05;
    this.ring.renderOrder = 3;
    this.glow = new Mesh(
      new CircleGeometry(1, 32),
      new MeshBasicMaterial({ color: RED, transparent: true, depthWrite: false, opacity: 0.28 }),
    );
    this.glow.rotation.x = -Math.PI / 2;
    this.glow.position.y = 0.045;
    this.glow.renderOrder = 3;
    this.ring.visible = false;
    this.glow.visible = false;
    scene.add(this.splat, this.ring, this.glow);
  }

  setHeight(sample: ((x: number, z: number) => number) | null, dirty?: HeightDirty | null): void {
    this.height = sample;
    this.drape(dirty);
  }

  setOpen(on: boolean): void {
    this.splat.visible = on && this.span > 0;
    if (!on) {
      this.ring.visible = false;
      this.glow.visible = false;
    }
  }

  setCursor(x: number, z: number, radius: number, on: boolean, y = 0): void {
    this.ring.visible = on;
    this.glow.visible = on;
    if (!on) return;
    this.ring.position.x = x;
    this.ring.position.y = y + 0.05;
    this.ring.position.z = z;
    this.ring.scale.set(radius, radius, 1);
    this.glow.position.x = x;
    this.glow.position.y = y + 0.045;
    this.glow.position.z = z;
    this.glow.scale.set(radius * 0.45, radius * 0.45, 1);
  }

  sync(weights: Float32Array, origin: number, span: number): void {
    if (this.span !== span || this.origin !== origin) this.rebuild(origin, span);
    const tex = this.tex;
    if (!tex) return;
    const pix = tex.image.data as Uint8Array;
    // PlaneGeometry is (x, −y) with v flipped — write Z rows inverted so the trail sits on the stroke.
    for (let i = 0; i < weights.length; i++) {
      const a = Math.round(weights[i]! * 170);
      const c = i % span;
      const r = (i - c) / span;
      const o = ((span - 1 - r) * span + c) * 4;
      pix[o] = 255;
      pix[o + 1] = 42;
      pix[o + 2] = 42;
      pix[o + 3] = a;
    }
    tex.needsUpdate = true;
    this.splat.visible = true;
  }

  destroy(scene: Scene): void {
    scene.remove(this.splat, this.ring, this.glow);
    this.splat.geometry.dispose();
    this.ring.geometry.dispose();
    this.glow.geometry.dispose();
    (this.splat.material as MeshBasicMaterial).dispose();
    (this.ring.material as MeshBasicMaterial).dispose();
    (this.glow.material as MeshBasicMaterial).dispose();
    this.tex?.dispose();
  }

  private rebuild(origin: number, span: number): void {
    this.tex?.dispose();
    this.origin = origin;
    this.span = span;
    const tex = new DataTexture(new Uint8Array(span * span * 4), span, span, RGBAFormat, UnsignedByteType);
    tex.flipY = false;
    tex.needsUpdate = true;
    this.tex = tex;
    const mat = this.splat.material as MeshBasicMaterial;
    mat.map = tex;
    mat.transparent = true;
    mat.needsUpdate = true;
    this.splat.geometry.dispose();
    // One quad per cell so Y can follow the height verts.
    this.splat.geometry = new PlaneGeometry(span, span, span, span);
    this.splat.rotation.x = -Math.PI / 2;
    const mid = origin + span / 2;
    this.splat.position.set(mid, 0, mid);
    this.drape();
  }

  private drape(dirty?: HeightDirty | null): void {
    if (!this.span) return;
    const pos = this.splat.geometry.getAttribute("position") as BufferAttribute;
    const verts = this.span + 1;
    if (pos.count !== verts * verts) return;
    const sample = this.height;
    const origin = this.origin;
    const loX = dirty ? Math.max(0, dirty.loX) : 0;
    const hiX = dirty ? Math.min(verts - 1, dirty.hiX) : verts - 1;
    const loZ = dirty ? Math.max(0, dirty.loZ) : 0;
    const hiZ = dirty ? Math.min(verts - 1, dirty.hiZ) : verts - 1;
    for (let iz = loZ; iz <= hiZ; iz++) {
      for (let ix = loX; ix <= hiX; ix++) {
        const y = sample ? sample(origin + ix, origin + iz) + LIFT : LIFT;
        pos.setZ(iz * verts + ix, y);
      }
    }
    pos.needsUpdate = true;
    this.splat.geometry.computeBoundingSphere();
  }
}
