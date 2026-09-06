/**
 * Ground splat + cursor for the foliage brush. Red trail sits on the plate, behind trunks.
 */
import {
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

const RED = 0xff2a2a;

export class BrushLayer {
  private readonly splat: Mesh;
  private readonly ring: Mesh;
  private readonly glow: Mesh;
  private tex: DataTexture | null = null;
  private span = 0;

  constructor(scene: Scene) {
    const splatMat = new MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      depthWrite: false,
      opacity: 1,
    });
    this.splat = new Mesh(new PlaneGeometry(1, 1), splatMat);
    this.splat.rotation.x = -Math.PI / 2;
    this.splat.position.y = 0.04;
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

  setOpen(on: boolean): void {
    this.splat.visible = on && this.span > 0;
    if (!on) {
      this.ring.visible = false;
      this.glow.visible = false;
    }
  }

  setCursor(x: number, z: number, radius: number, on: boolean): void {
    this.ring.visible = on;
    this.glow.visible = on;
    if (!on) return;
    this.ring.position.x = x;
    this.ring.position.z = z;
    this.ring.scale.set(radius, radius, 1);
    this.glow.position.x = x;
    this.glow.position.z = z;
    this.glow.scale.set(radius * 0.45, radius * 0.45, 1);
  }

  sync(weights: Float32Array, origin: number, span: number): void {
    if (this.span !== span) this.rebuild(origin, span);
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
    this.splat.geometry = new PlaneGeometry(span, span);
    this.splat.rotation.x = -Math.PI / 2;
    const mid = origin + span / 2;
    this.splat.position.set(mid, 0.04, mid);
  }
}
