import { TerrainMaterial } from "../terrain/terrainMaterial";
import { Meadow } from "../foliage/meadow";
import { emptyLandscape, type Landscape } from "../../shared/landscape/curve";
/**
 * Lit iso scene: height mesh + water + grid + player cubes + catalog stamps.
 */
import {
  WebGLRenderTarget, SRGBColorSpace,
  BufferGeometry, Line, LineBasicMaterial,
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
import { PLAYER_COLORS, clampPlayer, type AssetType, type GridMode, type HeightField, type MapStamp } from "../../shared";
import type { ViewSnapshot } from "../../sim/world/world";
import { Camera } from "../camera/camera";
import { Display } from "../display/display";
import { addSunAndGrid, putGrid } from "../grid/grid";
import { HeightMesh } from "../height/heightMesh";
import { BrushLayer } from "../brush/brushLayer";
import { PropField } from "../prop/propField";
import { Sky } from "../sky/sky";
import { WaterLayer } from "../water/waterLayer";

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
  private landscape: Landscape = emptyLandscape();
  private readonly meadow: Meadow;
  gridOn = true;
  gridMode: GridMode = "tiles";

  constructor(canvas: HTMLCanvasElement, assets: ReadonlyMap<string, string> = new Map()) {
    this.display = new Display(canvas, () => this.present());
    this.props = new PropField(this.scene, assets);
    this.brush = new BrushLayer(this.scene);
    this.sky = new Sky(this.scene);
    this.meadow = new Meadow(this.scene);
    this.lines.name = "grid-lines";
    this.scene.add(this.lines);
  }

  landmarks(aspect:number,ids?:readonly string[]) {
    const cam=this.threeCam().clone();this.camera.applyTo(cam,1000*aspect,1000);
    return this.props.landmarks(cam,ids);
  }
  capture(width:number,aspect:number,animationTime?:number):HTMLCanvasElement {
    const w=Math.max(256,Math.min(2048,Math.round(width))),h=Math.round(w/Math.max(.5,Math.min(3,aspect)));
    const target=new WebGLRenderTarget(w,h,{samples:4});target.texture.colorSpace=SRGBColorSpace;
    const gl=this.display.gl,previous=gl.getRenderTarget();
    const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
    try{
      if(animationTime!==undefined){this.water?.tick(animationTime*1000);this.meadow.tick(animationTime*1000);}
      const cam=this.threeCam();this.camera.applyTo(cam,w,h);gl.setRenderTarget(target);gl.render(this.scene,cam);
      const bytes=new Uint8Array(w*h*4);gl.readRenderTargetPixels(target,0,0,w,h,bytes);
      // The editor canvas is opaque. MSAA alpha-to-coverage still leaves partial
      // alpha in an offscreen target; exporting it darkens foliage when JPEG
      // flattens those pixels against black, despite already resolved RGB.
      for(let i=3;i<bytes.length;i+=4)bytes[i]=255;
      const ctx=canvas.getContext('2d')!;const data=ctx.createImageData(w,h);
      for(let y=0;y<h;y++)data.data.set(bytes.subarray((h-1-y)*w*4,(h-y)*w*4),y*w*4);
      ctx.putImageData(data,0,0);return canvas;
    }finally{gl.setRenderTarget(previous);target.dispose();this.present();}
  }
  previewCurve(points: readonly {x:number;z:number}[]):void {
    if(this.curvePreview){this.scene.remove(this.curvePreview);this.curvePreview.geometry.dispose();(this.curvePreview.material as LineBasicMaterial).dispose();this.curvePreview=null;}
    if(!points.length)return;
    const geo=new BufferGeometry().setFromPoints(points.map(p=>new Vector3(p.x,(this.height?.sample(p.x,p.z)??0)+.15,p.z)));
    this.curvePreview=new Line(geo,new LineBasicMaterial({color:0xffda8a,depthTest:false}));this.curvePreview.renderOrder=100;this.scene.add(this.curvePreview);this.present();
  }
  setLandscape(landscape: Landscape): void {
    const rebuild = this.landscape.cover !== landscape.cover || this.landscape.strokes !== landscape.strokes || this.landscape.environment.season !== landscape.environment.season;
    if(this.landscape.rivers!==landscape.rivers)this.water?.setFlow(landscape.rivers??[]);
    this.water?.setStyle(landscape.water);
    this.landscape=landscape;
    this.sky.setHour(landscape.environment.hour); this.sky.setPlaying(landscape.environment.playing);
    this.props.setSeason(landscape.environment.season);
    if(this.terrain && this.height){
      const mat=this.terrain.mesh.material as TerrainMaterial;
      if(rebuild)mat.update(this.height,landscape.strokes);mat.setSeason(landscape.environment.season);
      if(rebuild)this.meadow.rebuild(this.height,landscape);
    }
  }
  async ready():Promise<void>{await this.props.ready();}
  diagnostics() { return { drawCalls:this.display.gl.info.render.calls,triangles:this.display.gl.info.render.triangles,geometries:this.display.gl.info.memory.geometries,textures:this.display.gl.info.memory.textures,coverInstances:this.meadow.count,assets:this.props.diagnostics(),environment:this.sky.snapshot() }; }

  setAssets(assets: ReadonlyMap<string, string>): void {
    this.props.setUrls(assets);
  }

  setSelected(id: string | null): void {
    this.props.setSelected(id);
  }

  setKinds(kinds: ReadonlyMap<string, AssetType>): void {
    const float = new Set<string>();
    for (const [id, type] of kinds) if (type === "water" || type === "span") float.add(id);
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
    this.height = field;
    const sample = field ? (x: number, z: number) => field.sample(x, z) : null;
    this.camera.setTerrain(sample, field?.waterLevel ?? 0);
    this.props.setHeight(sample);
    this.props.setWaterY(field?.waterLevel ?? 0);
    this.brush.setHeight(sample, dirty);
    if (!this.terrain || !field) return;
    this.terrain.setFrom(field, dirty);
    this.water?.setFrom(field);
    (this.terrain.mesh.material as TerrainMaterial).update(field,this.landscape.strokes);
    this.meadow.rebuild(field,this.landscape);
    if (drape) this.refreshGrid();
  }

  draw(snapshot: ViewSnapshot, stamps: readonly MapStamp[] = []): void {
    if (this.size !== snapshot.size) {
      this.size = snapshot.size;
      this.lines.clear();
      this.terrain?.destroy(this.scene);
      this.water?.destroy(this.scene);
      addSunAndGrid(this.scene, snapshot.size, this.lines, this.gridMode);
      this.sky.resize(snapshot.size);
      this.terrain = new HeightMesh(this.scene);
      this.water = new WaterLayer(this.scene, snapshot.size);
      this.water.setStyle(this.landscape.water);
      this.water.setFlow(this.landscape.rivers??[]);
      if (this.height) {
        this.terrain.setFrom(this.height);
        this.water.setFrom(this.height);
        (this.terrain.mesh.material as TerrainMaterial).update(this.height,this.landscape.strokes);
        (this.terrain.mesh.material as TerrainMaterial).setSeason(this.landscape.environment.season);
        this.meadow.rebuild(this.height,this.landscape);
      }
      this.lines.visible = this.gridOn;
      this.refreshGrid();
    }
    const ground = this.height ? (x: number, z: number) => this.height!.sample(x, z) : null;
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
      const y = ground ? ground(p.x + 0.5, p.y + 0.5) : 0;
      mesh.position.set(p.x + 0.5, y + CUBE / 2, p.y + 0.5);
    }
    for (const [id, mesh] of this.cubes) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.cubes.delete(id);
    }
    this.props.sync(stamps);
    (this.terrain?.mesh.material as TerrainMaterial|undefined)?.setContacts(this.props.contactRevision,this.props.contacts);
    this.present();
  }

  pickStamp(clientX: number, clientY: number): string | null {
    if (!this.aim(clientX, clientY)) return null;
    return this.props.pick(this.ray);
  }

  /** Ground under a canvas-relative client point. Y is the mesh hit when height exists. */
  pickGround(clientX: number, clientY: number): { x: number; z: number; y: number } | null {
    if (!this.aim(clientX, clientY)) return null;
    if (this.terrain) {
      const hits = this.ray.intersectObject(this.terrain.mesh, false);
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
    this.ndc.set(((clientX - rect.left) / rect.width) * 2 - 1, -(((clientY - rect.top) / rect.height) * 2 - 1));
    this.ray.setFromCamera(this.ndc, cam);
    return true;
  }

  present(): void {
    const now = performance.now();
    this.sky.tick(now);
    this.sky.focus(this.camera.targetX,this.camera.targetZ);
    this.water?.tick(now);
    this.meadow.tick(now);
    const cam = this.threeCam();
    this.camera.applyTo(cam, this.display.width, this.display.height);
    this.display.render(this.scene, cam);
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

  private threeCam(): OrthographicCamera | PerspectiveCamera {
    return this.camera.game ? this.persp : this.ortho;
  }

  destroy(): void {
    this.previewCurve([]);
    this.meadow.destroy();
    this.brush.destroy(this.scene);
    this.terrain?.destroy(this.scene);
    this.water?.destroy(this.scene);
    this.props.destroy();
    this.display.destroy();
  }
}
