/**
 * Lit iso scene: ground grid + player cubes + catalog stamps.
 */
import {
  BoxGeometry,
  Color,
  Group,
  Mesh,
  MeshStandardMaterial,
  OrthographicCamera,
  PerspectiveCamera,
  Plane,
  Raycaster,
  Scene,
  Vector2,
  Vector3,
} from "three";
import { PLAYER_COLORS, clampPlayer, type GridMode, type MapStamp } from "../../shared";
import type { ViewSnapshot } from "../../sim/world/world";
import { Camera } from "../camera/camera";
import { Display } from "../display/display";
import { addSunAndGrid, putGrid } from "../grid/grid";
import { BrushLayer } from "../brush/brushLayer";
import { PropField } from "../prop/propField";

const CUBE = 0.9;
const GROUND = new Plane(new Vector3(0, 1, 0), 0);

export class Renderer {
  readonly camera = new Camera();
  private readonly display: Display;
  private readonly scene = new Scene();
  private readonly ortho = new OrthographicCamera();
  private readonly persp = new PerspectiveCamera();
  private readonly cubes = new Map<number, Mesh>();
  private readonly props: PropField;
  readonly brush: BrushLayer;
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private size = 0;
  private readonly lines = new Group();
  gridOn = true;
  gridMode: GridMode = "tiles";

  constructor(canvas: HTMLCanvasElement, assets: ReadonlyMap<string, string> = new Map()) {
    this.display = new Display(canvas, () => this.present());
    this.props = new PropField(this.scene, assets);
    this.brush = new BrushLayer(this.scene);
    this.lines.name = "grid-lines";
    this.scene.add(this.lines);
  }

  setAssets(assets: ReadonlyMap<string, string>): void {
    this.props.setUrls(assets);
  }

  setGrid(on: boolean): void {
    this.gridOn = on;
    this.lines.visible = on;
  }

  setGridMode(mode: GridMode): void {
    this.gridMode = mode;
    this.gridOn = mode !== "none";
    this.lines.visible = this.gridOn;
    if (!this.gridOn || !this.size) return;
    putGrid(this.lines, this.size, mode);
  }

  draw(snapshot: ViewSnapshot, stamps: readonly MapStamp[] = []): void {
    if (this.size !== snapshot.size) {
      this.size = snapshot.size;
      this.lines.clear();
      addSunAndGrid(this.scene, snapshot.size, this.lines, this.gridMode);
      this.lines.visible = this.gridOn;
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
    const cam = this.threeCam();
    this.camera.applyTo(cam, this.display.width, this.display.height);
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(this.ndc, cam);
    if (!this.ray.ray.intersectPlane(GROUND, this.hit)) return null;
    return { x: this.hit.x, z: this.hit.z };
  }

  present(): void {
    const cam = this.threeCam();
    this.camera.applyTo(cam, this.display.width, this.display.height);
    this.display.render(this.scene, cam);
  }

  private threeCam(): OrthographicCamera | PerspectiveCamera {
    return this.camera.game ? this.persp : this.ortho;
  }

  destroy(): void {
    this.brush.destroy(this.scene);
    this.props.destroy();
    this.display.destroy();
  }
}
