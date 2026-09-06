/**
 * Lit iso scene: ground grid + one PBR cube per Player in the snapshot.
 */
import { BoxGeometry, Color, Mesh, MeshStandardMaterial, OrthographicCamera, Scene } from "three";
import { PLAYER_COLORS, clampPlayer } from "../../shared";
import type { ViewSnapshot } from "../../sim/world/world";
import { Camera } from "../camera/camera";
import { Display } from "../display/display";
import { addSunAndGrid } from "../grid/grid";

const CUBE = 0.9;

export class Renderer {
  readonly camera = new Camera();
  private readonly display: Display;
  private readonly scene = new Scene();
  private readonly threeCam = new OrthographicCamera();
  private readonly cubes = new Map<number, Mesh>();
  private size = 0;

  constructor(canvas: HTMLCanvasElement) {
    this.display = new Display(canvas, () => this.present());
  }

  draw(snapshot: ViewSnapshot): void {
    if (this.size !== snapshot.size) {
      this.size = snapshot.size;
      addSunAndGrid(this.scene, snapshot.size);
    }
    const seen = new Set<number>();
    for (const p of snapshot.players) {
      seen.add(p.id);
      let mesh = this.cubes.get(p.id);
      if (!mesh) {
        mesh = new Mesh(
          new BoxGeometry(CUBE, CUBE, CUBE),
          new MeshStandardMaterial({
            color: new Color(PLAYER_COLORS[clampPlayer(p.id)]!),
            roughness: 0.45,
            metalness: 0.08,
          }),
        );
        mesh.castShadow = true;
        mesh.receiveShadow = true;
        this.scene.add(mesh);
        this.cubes.set(p.id, mesh);
      }
      mesh.position.set(p.x + 0.5, CUBE / 2, p.y + 0.5);
    }
    for (const [id, mesh] of this.cubes) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.cubes.delete(id);
    }
    this.present();
  }

  present(): void {
    this.camera.applyTo(this.threeCam, this.display.width, this.display.height);
    this.display.render(this.scene, this.threeCam);
  }

  destroy(): void {
    this.display.destroy();
  }
}
