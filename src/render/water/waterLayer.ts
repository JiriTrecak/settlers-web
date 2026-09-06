/**
 * Flat water plane at waterLevel. Sunk 0.03 so dry land at 0 wins.
 */
import { Mesh, MeshStandardMaterial, PlaneGeometry, type Scene } from "three";
import { MAP_HALO } from "../../shared";

const SINK = 0.03;
const TEAL = 0x2a5458;

export class WaterLayer {
  readonly mesh: Mesh;
  private level = 0;

  constructor(scene: Scene, size: number) {
    const visLo = -MAP_HALO;
    const visHi = size + MAP_HALO;
    const span = visHi - visLo;
    const mid = (visLo + visHi) / 2;
    const mesh = new Mesh(
      new PlaneGeometry(span, span),
      new MeshStandardMaterial({
        color: TEAL,
        roughness: 0.3,
        metalness: 0.04,
        transparent: true,
        opacity: 0.85,
        depthWrite: false,
      }),
    );
    mesh.rotation.x = -Math.PI / 2;
    mesh.position.set(mid, -SINK, mid);
    mesh.receiveShadow = true;
    mesh.name = "water";
    scene.add(mesh);
    this.mesh = mesh;
  }

  setLevel(level: number): void {
    this.level = Number.isFinite(level) ? level : 0;
    this.mesh.position.y = this.level - SINK;
  }

  destroy(scene: Scene): void {
    scene.remove(this.mesh);
    this.mesh.geometry.dispose();
    (this.mesh.material as MeshStandardMaterial).dispose();
  }
}
