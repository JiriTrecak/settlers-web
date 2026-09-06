/**
 * Lit iso scene: ground grid + player cubes + catalog stamps.
 */
import { BoxGeometry, Color, Mesh, MeshStandardMaterial, OrthographicCamera, Plane, Raycaster, Scene, Vector2, Vector3 } from "three";
import { PLAYER_COLORS, clampPlayer, type MapStamp } from "../../shared";
import type { ViewSnapshot } from "../../sim/world/world";
import { Camera } from "../camera/camera";
import { Display } from "../display/display";
import { addSunAndGrid } from "../grid/grid";
import { PropField } from "../prop/propField";

const CUBE = 0.9;
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

export class Renderer {
  readonly camera = new Camera();
  private readonly display: Display;
  private readonly scene = new Scene();
  private readonly threeCam = new OrthographicCamera();
  private readonly cubes = new Map<number, Mesh>();
  private readonly props: PropField;
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private size = 0;

  constructor(canvas: HTMLCanvasElement, assets: ReadonlyMap<string, string> = new Map()) {
    this.display = new Display(canvas, () => this.present());
    this.props = new PropField(this.scene, assets);
  }

  draw(snapshot: ViewSnapshot, stamps: readonly MapStamp[] = []): void {
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
    this.props.sync(stamps);
    this.present();
  }

  /** Ground cell under a canvas-relative client point. */
  pickGround(clientX: number, clientY: number): { x: number; z: number } | null {
    const rect = this.display.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return null;
    this.camera.applyTo(this.threeCam, this.display.width, this.display.height);
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(this.ndc, this.threeCam);
    if (!this.ray.ray.intersectPlane(GROUND, this.hit)) return null;
    return { x: this.hit.x, z: this.hit.z };
  }

  present(): void {
    this.camera.applyTo(this.threeCam, this.display.width, this.display.height);
    this.display.render(this.scene, this.threeCam);
  }

  destroy(): void {
    this.props.destroy();
    this.display.destroy();
  }
}
