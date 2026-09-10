import type { AbilityAim } from "../settlement/abilityTarget";
import { WeatherLayer } from "../sky/weatherLayer";
import { perf } from "../../debug/performance";
import { FogOfWar } from "../visibility/fogOfWar";
import { forestEnvironment } from "../sky/forestEnvironment";
import { SettlementLayer } from "../settlement/settlementLayer";
import {
  environmentPreset,
  PRESET_KEY,
} from "../../shared/environment/presets";
import { DecalLayer } from "../decal/decalLayer";
import { TerrainMaterial } from "../terrain/terrainMaterial";
import { Meadow } from "../foliage/meadow";
import { emptyLandscape, type Landscape } from "../../shared/landscape/curve";
/**
 * Height mesh, water, scenery and observed declarative gameplay entities.
 */
import {
  WebGLRenderTarget,
  SRGBColorSpace,
  BufferGeometry,
  Line,
  LineBasicMaterial,
  BoxGeometry,
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
import {
  PLAYER_COLORS,
  clampPlayer,
  type AssetType,
  type GridMode,
  type HeightField,
  type MapStamp,
} from "../../shared";
import type { ViewSnapshot } from "../../sim/world/world";
import { Camera } from "../camera/camera";
import { Display } from "../display/display";
import { addSunAndGrid, putGrid } from "../grid/grid";
import { HeightMesh } from "../height/heightMesh";
import { BrushLayer } from "../brush/brushLayer";
import { PropField } from "../prop/propField";
import { Sky } from "../sky/sky";
import { WaterLayer } from "../water/waterLayer";

const GROUND = new Plane(new Vector3(0, 1, 0), 0);

export class Renderer {
  gameTimeScale = 1;
  private visualClock = 0;
  private visualLast: number | null = null;
  readonly camera = new Camera();
  private readonly display: Display;
  private readonly reflections: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly ortho = new OrthographicCamera();
  private readonly persp = new PerspectiveCamera();
  private readonly spawnFlags = new Map<number, Group>();
  setSpawnPoints(
    starts: readonly { player: number; x: number; z: number }[],
    visible: boolean,
  ): void {
    for (const flag of this.spawnFlags.values()) flag.visible = false;
    if (!visible) return;
    for (const start of starts) {
      let flag = this.spawnFlags.get(start.player);
      if (!flag) {
        flag = new Group();
        const pole = new Mesh(
          new BoxGeometry(0.2, 5, 0.2),
          new MeshStandardMaterial({ color: 0xd4d9db }),
        );
        pole.position.y = 2.5;
        const cloth = new Mesh(
          new BoxGeometry(2.4, 1.6, 0.15),
          new MeshStandardMaterial({
            color: PLAYER_COLORS[clampPlayer(start.player - 1)],
          }),
        );
        cloth.position.set(1.2, 4, 0);
        const pad = new Mesh(
          new BoxGeometry(6, 0.08, 6),
          new MeshStandardMaterial({
            color: PLAYER_COLORS[clampPlayer(start.player - 1)],
            transparent: true,
            opacity: 0.4,
          }),
        );
        pad.position.y = 0.1;
        flag.add(pole, cloth, pad);
        this.scene.add(flag);
        this.spawnFlags.set(start.player, flag);
      }
      flag.position.set(
        start.x,
        this.height?.sample(start.x, start.z) ?? 0,
        start.z,
      );
      flag.visible = true;
    }
  }
  private readonly props: PropField;
  readonly brush: BrushLayer;
  private terrain: HeightMesh | null = null;
  private water: WaterLayer | null = null;
  private height: HeightField | null = null;
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private size = 0;
  private readonly lines = new Group();
  private curvePreview: Line | null = null;
  readonly sky: Sky;
  private readonly weather = new WeatherLayer(this.scene);
  private landscape: Landscape = emptyLandscape();
  private readonly meadow: Meadow;
  private readonly decals: DecalLayer;
  private settlement: SettlementLayer | null = null;
  private fog: FogOfWar | null = null;
  gamePreview(
    kind: string | null,
    x = 0,
    z = 0,
    allowed = false,
    rotation = 0,
    owner = 0,
  ) {
    if (this.height)
      this.settlement?.preview(
        kind,
        x,
        z,
        allowed,
        this.height,
        rotation,
        owner,
      );
  }
  gameAbilityTarget(aim: AbilityAim | null) {
    if (this.height) this.settlement?.targetAbility(aim, this.height);
  }
  gameSelect(id: number | null | readonly number[]) {
    this.settlement?.select(id);
  }
  gameReady() {
    return this.settlement?.ready ?? Promise.resolve();
  }
  private readonly refreshEnvironment = () =>
    this.sky.setGlobalLight(
      environmentPreset(this.landscape.environment.preset).light,
    );
  private readonly presetStorage = (event: StorageEvent) => {
    if (event.key === PRESET_KEY) this.refreshEnvironment();
  };
  gridOn = true;
  gridMode: GridMode = "tiles";

  constructor(
    canvas: HTMLCanvasElement,
    assets: ReadonlyMap<string, string> = new Map(),
  ) {
    this.display = new Display(canvas, () => this.present());
    this.reflections = forestEnvironment(this.display.gl);
    this.scene.environment = this.reflections.texture;
    this.scene.environmentIntensity = 0.75;
    this.props = new PropField(this.scene, assets);
    this.brush = new BrushLayer(this.scene);
    this.sky = new Sky(this.scene);
    this.refreshEnvironment();
    window.addEventListener("utc-environment-presets", this.refreshEnvironment);
    window.addEventListener("storage", this.presetStorage);
    this.meadow = new Meadow(this.scene);
    this.decals = new DecalLayer(this.scene);
    this.lines.name = "grid-lines";
    this.scene.add(this.lines);
  }

  landmarks(aspect: number, ids?: readonly string[]) {
    const cam = this.threeCam().clone();
    this.camera.applyTo(cam, 1000 * aspect, 1000);
    return this.props.landmarks(cam, ids);
  }
  capture(
    width: number,
    aspect: number,
    animationTime?: number,
  ): HTMLCanvasElement {
    const w = Math.max(256, Math.min(2048, Math.round(width))),
      h = Math.round(w / Math.max(0.5, Math.min(3, aspect)));
    const target = new WebGLRenderTarget(w, h, { samples: 4 });
    target.texture.colorSpace = SRGBColorSpace;
    const gl = this.display.gl,
      previous = gl.getRenderTarget();
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    try {
      if (animationTime !== undefined) {
        this.water?.tick(animationTime * 1000);
        this.meadow.tick(animationTime * 1000);
      }
      const cam = this.threeCam();
      this.camera.applyTo(cam, w, h);
      this.updateAtmosphere(cam);
      this.weather.update(
        animationTime === undefined ? performance.now() : animationTime * 1000,
        this.camera.targetX,
        this.camera.targetZ,
        cam,
        this.height,
      );
      this.props.updateLOD(cam);
      this.meadow.updateLOD(cam);
      this.water?.updateVisibility(cam);
      gl.setRenderTarget(target);
      gl.render(this.scene, cam);
      const bytes = new Uint8Array(w * h * 4);
      gl.readRenderTargetPixels(target, 0, 0, w, h, bytes);
      // The editor canvas is opaque. MSAA alpha-to-coverage still leaves partial
      // alpha in an offscreen target; exporting it darkens foliage when JPEG
      // flattens those pixels against black, despite already resolved RGB.
      for (let i = 3; i < bytes.length; i += 4) bytes[i] = 255;
      const ctx = canvas.getContext("2d")!;
      const data = ctx.createImageData(w, h);
      for (let y = 0; y < h; y++)
        data.data.set(
          bytes.subarray((h - 1 - y) * w * 4, (h - y) * w * 4),
          y * w * 4,
        );
      ctx.putImageData(data, 0, 0);
      return canvas;
    } finally {
      gl.setRenderTarget(previous);
      target.dispose();
      this.present();
    }
  }
  previewCurve(points: readonly { x: number; z: number }[]): void {
    if (this.curvePreview) {
      this.scene.remove(this.curvePreview);
      this.curvePreview.geometry.dispose();
      (this.curvePreview.material as LineBasicMaterial).dispose();
      this.curvePreview = null;
    }
    if (!points.length) return;
    const geo = new BufferGeometry().setFromPoints(
      points.map(
        (p) =>
          new Vector3(p.x, (this.height?.sample(p.x, p.z) ?? 0) + 0.15, p.z),
      ),
    );
    this.curvePreview = new Line(
      geo,
      new LineBasicMaterial({ color: 0xffda8a, depthTest: false }),
    );
    this.curvePreview.renderOrder = 100;
    this.scene.add(this.curvePreview);
    this.present();
  }
  setLandscape(landscape: Landscape): void {
    const rebuild =
      this.landscape.cover !== landscape.cover ||
      this.landscape.strokes !== landscape.strokes ||
      this.landscape.environment.season !== landscape.environment.season;
    if (this.landscape.rivers !== landscape.rivers)
      this.water?.setFlow(landscape.rivers ?? []);
    this.water?.setStyle(landscape.water);
    if (
      this.height &&
      (this.landscape.decals !== landscape.decals ||
        this.landscape.environment.season !== landscape.environment.season)
    )
      this.decals.rebuild(
        landscape.decals ?? [],
        this.height,
        landscape.environment.season,
      );
    const presetChanged =
      this.landscape.environment.preset !== landscape.environment.preset;
    this.landscape = landscape;
    this.weather.configure(landscape.environment.weather);
    if (presetChanged) this.refreshEnvironment();
    this.sky.setHour(landscape.environment.hour);
    this.sky.setPlaying(landscape.environment.playing);
    this.props.setSeason(landscape.environment.season);
    if (this.terrain && this.height) {
      const mat = this.terrain.material as TerrainMaterial;
      if (rebuild) {
        mat.update(this.height, landscape.strokes);
        mat.setCover(landscape.cover);
      }
      mat.setSeason(landscape.environment.season);
      if (rebuild) this.meadow.rebuild(this.height, landscape);
    }
  }
  async ready(): Promise<void> {
    await this.props.ready();
  }
  diagnostics() {
    return {
      drawCalls: this.display.gl.info.render.calls,
      triangles: this.display.gl.info.render.triangles,
      geometries: this.display.gl.info.memory.geometries,
      textures: this.display.gl.info.memory.textures,
      coverInstances: this.meadow.count,
      assets: this.props.diagnostics(),
      environment: this.sky.snapshot(),
      lighting: this.sky.lightingDiagnostics(),
    };
  }

  setAssets(assets: ReadonlyMap<string, string>): void {
    this.props.setUrls(assets);
  }

  setSelected(id: string | null): void {
    this.props.setSelected(id);
  }

  setKinds(kinds: ReadonlyMap<string, AssetType>): void {
    const float = new Set<string>();
    for (const [id, type] of kinds)
      if (type === "water" || type === "span") float.add(id);
    this.props.setFloat(float, this.height?.waterLevel ?? 0);
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
    this.refreshGrid();
  }

  /** Upload the authored height field. Dirty disc skips a full mesh rewrite. `drape` rebuilds grid lines. */
  setTerrain(
    field: HeightField | null,
    dirty?: { loX: number; hiX: number; loZ: number; hiZ: number } | null,
    drape = true,
  ): void {
    const timing = perf.start();
    this.height = field;
    const sample = field ? (x: number, z: number) => field.sample(x, z) : null;
    this.camera.setTerrain(sample, field?.waterLevel ?? 0);
    this.props.setHeight(sample);
    this.props.setWaterY(field?.waterLevel ?? 0);
    this.brush.setHeight(sample, dirty);
    if (!this.terrain || !field || field.size !== this.size) {
      perf.end("Terrain update (event)", timing);
      return;
    }
    this.terrain.setFrom(field, dirty);
    this.water?.setFrom(field);
    (this.terrain.material as TerrainMaterial).update(
      field,
      this.landscape.strokes,
    );
    (this.terrain.material as TerrainMaterial).setCover(this.landscape.cover);
    this.meadow.rebuild(field, this.landscape);
    this.decals.rebuild(
      this.landscape.decals ?? [],
      field,
      this.landscape.environment.season,
    );
    if (drape) this.refreshGrid();
    perf.end("Terrain update (event)", timing);
  }

  draw(snapshot: ViewSnapshot, stamps: readonly MapStamp[] = []): void {
    if (this.size !== snapshot.size) {
      this.size = snapshot.size;
      this.lines.clear();
      this.terrain?.destroy(this.scene);
      this.water?.destroy(this.scene);
      this.fog?.dispose();
      this.fog = null;
      addSunAndGrid(this.scene, snapshot.size, this.lines, this.gridMode);
      this.sky.resize(snapshot.size);
      this.terrain = new HeightMesh(this.scene, snapshot.size);
      this.water = new WaterLayer(this.scene, snapshot.size);
      this.water.setStyle(this.landscape.water);
      this.water.setFlow(this.landscape.rivers ?? []);
      if (this.height) {
        this.terrain.setFrom(this.height);
        this.water.setFrom(this.height);
        (this.terrain.material as TerrainMaterial).update(
          this.height,
          this.landscape.strokes,
        );
        (this.terrain.material as TerrainMaterial).setCover(
          this.landscape.cover,
        );
        (this.terrain.material as TerrainMaterial).setSeason(
          this.landscape.environment.season,
        );
        this.meadow.rebuild(this.height, this.landscape);
      }
      this.lines.visible = this.gridOn;
      this.refreshGrid();
    }
    const entities = perf.start();
    if (snapshot.settlement && this.height) {
      this.settlement ??= new SettlementLayer(this.scene);
      this.settlement.update(
        snapshot.settlement,
        this.height,
        snapshot.tick,
        this.gameTimeScale,
      );
    }
    perf.end("Settlers / buildings", entities);
    const props = perf.start();
    this.props.sync(stamps);
    perf.end("Prop sync", props);
    const visibility = perf.start();
    if (snapshot.settlement?.fog) {
      this.fog ??= new FogOfWar(snapshot.size);
      this.fog.update(snapshot.settlement.fog, this.scene);
    }
    perf.end("Fog of war", visibility);
    (this.terrain?.material as TerrainMaterial | undefined)?.setContacts(
      this.props.contactRevision,
      this.props.contacts,
    );
    this.present();
  }

  pickGameEntity(clientX: number, clientY: number): number | null {
    if (!this.aim(clientX, clientY)) return null;
    const terrainDistance = this.terrain
      ? this.ray.intersectObject(this.terrain.mesh, true)[0]?.distance
      : undefined;
    const entity = this.settlement?.pick(this.ray, terrainDistance ?? Infinity);
    if (entity != null) return entity;
    // Harvestable trees are instanced scenery, but retain their observed entity identity.
    const stamp = this.props.pick(this.ray, terrainDistance ?? Infinity);
    const resource = stamp?.match(/^resource-(\d+)$/);
    return resource ? Number(resource[1]) : null;
  }

  pickStamp(clientX: number, clientY: number): string | null {
    if (!this.aim(clientX, clientY)) return null;
    return this.props.pick(this.ray);
  }

  /** Ground under a canvas-relative client point. Y is the mesh hit when height exists. */
  pickGround(
    clientX: number,
    clientY: number,
  ): { x: number; z: number; y: number } | null {
    if (!this.aim(clientX, clientY)) return null;
    if (this.terrain) {
      const hits = this.ray.intersectObject(this.terrain.mesh, true);
      const p = hits[0]?.point;
      if (p) return { x: p.x, z: p.z, y: p.y };
    }
    if (!this.ray.ray.intersectPlane(GROUND, this.hit)) return null;
    return { x: this.hit.x, z: this.hit.z, y: 0 };
  }

  private aim(clientX: number, clientY: number): boolean {
    const rect = this.display.canvas.getBoundingClientRect();
    if (rect.width < 1 || rect.height < 1) return false;
    const cam = this.threeCam();
    this.camera.applyTo(cam, this.display.width, this.display.height);
    this.ndc.set(
      ((clientX - rect.left) / rect.width) * 2 - 1,
      -(((clientY - rect.top) / rect.height) * 2 - 1),
    );
    this.ray.setFromCamera(this.ndc, cam);
    return true;
  }

  present(now = performance.now()): void {
    if (this.visualLast === null) this.visualClock = now;
    else
      this.visualClock +=
        Math.max(0, now - this.visualLast) * this.gameTimeScale;
    this.visualLast = now;
    now = this.visualClock;
    const total = perf.start(),
      environment = perf.start();
    this.sky.tick(now);
    this.sky.focus(
      this.camera.targetX,
      this.camera.targetZ,
      this.camera.game
        ? Math.max(40, Math.min(110, this.camera.distance * 0.8))
        : 70,
    );
    this.water?.tick(now);
    this.meadow.tick(now);
    perf.end("Sky / water / wind", environment);
    const camera = perf.start();
    const cam = this.threeCam();
    this.camera.applyTo(cam, this.display.width, this.display.height);
    this.updateAtmosphere(cam);
    this.weather.update(
      now,
      this.camera.targetX,
      this.camera.targetZ,
      cam,
      this.height,
    );
    this.props.updateLOD(cam);
    this.meadow.updateLOD(cam);
    this.water?.updateVisibility(cam);
    perf.end("Camera / atmosphere", camera);
    this.display.render(this.scene, cam);
    perf.end("Present total (CPU)", total);
  }

  private updateAtmosphere(cam: OrthographicCamera | PerspectiveCamera): void {
    const x = this.camera.targetX,
      z = this.camera.targetZ;
    const focus = new Vector3(x, this.height?.sample(x, z) ?? 0, z);
    const depth = focus
      .sub(cam.position)
      .dot(cam.getWorldDirection(new Vector3()));
    this.sky.setAtmosphereDepth(depth);
  }

  private refreshGrid(): void {
    if (!this.size || !this.gridOn) return;
    const field = this.height;
    putGrid(
      this.lines,
      this.size,
      this.gridMode,
      field ? (x, z) => field.sample(x, z) : undefined,
    );
  }

  unitsInScreenRect(
    units: readonly { id: number; x: number; y: number }[],
    rect: { left: number; top: number; right: number; bottom: number },
  ): number[] {
    const bounds = this.display.canvas.getBoundingClientRect();
    return units
      .filter((w) => {
        const p = new Vector3(
          w.x,
          (this.height?.sample(w.x, w.y) ?? 0) + 1,
          w.y,
        ).project(this.threeCam());
        const x = bounds.left + ((p.x + 1) * bounds.width) / 2,
          y = bounds.top + ((1 - p.y) * bounds.height) / 2;
        return (
          p.z >= -1 &&
          p.z <= 1 &&
          x >= rect.left &&
          x <= rect.right &&
          y >= rect.top &&
          y <= rect.bottom
        );
      })
      .map((w) => w.id);
  }
  private threeCam(): OrthographicCamera | PerspectiveCamera {
    return this.camera.game ? this.persp : this.ortho;
  }

  destroy(): void {
    for (const group of this.spawnFlags.values()) {
      group.traverse((o) => {
        if (o instanceof Mesh) {
          o.geometry.dispose();
          (o.material as MeshStandardMaterial).dispose();
        }
      });
      this.scene.remove(group);
    }
    this.spawnFlags.clear();
    this.previewCurve([]);
    this.meadow.destroy();
    this.weather.dispose();
    this.brush.destroy(this.scene);
    this.terrain?.destroy(this.scene);
    this.water?.destroy(this.scene);
    this.props.destroy();
    this.settlement?.destroy(this.scene);
    this.fog?.dispose();
    window.removeEventListener(
      "utc-environment-presets",
      this.refreshEnvironment,
    );
    window.removeEventListener("storage", this.presetStorage);
    this.decals.destroy(this.scene);
    this.reflections.dispose();
    this.display.destroy();
  }
}
