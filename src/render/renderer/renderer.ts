import {SceneryFilter} from '../../presentation/sceneryChanges';
import {measureRenderBenchmark,renderBenchmarkOptions,type RenderBenchmarkOptions} from '../display/renderBenchmark';
import {installEffectAudio,type AudioView} from '../audio/effectSound';
import {heightChange} from '../../shared/map/heightChanges';
import {prefetchTerrain} from '../terrain/prefetchTerrain';
import type {ImportedTerrain} from '../../shared/map/importedTerrain';
import type {InspectionShot} from '../../shared/camera/inspectionShot';
import {ForestSurroundingsLayer} from '../canopy/forestSurroundings';
import {biomeById,biomeLandscape,type ResolvedLandscape} from '../../content/biomes';
import {PlacedGrass} from '../foliage/placedGrass';
import {liveSourceOcclusion} from '../prop/liveSourceOcclusion';
import {ImportedWater} from '../water/importedWater';
import {DewLayer} from '../prop/dewLayer';
import {InteriorCeiling,ceilingY} from '../terrain/interiorCeiling';
import {unitCameraPose,type UnitShot} from '../camera/unitCamera';
import {WalkSurfacePicker} from '../terrain/walkSurfacePicker';
import {SceneryCutaway} from '../visibility/sceneryCutaway';
import {CanopyLayer} from '../atmosphere/canopyLayer';
import {SelectionPortrait} from '../portrait/selectionPortrait';
import {ownerSlot,type Owner} from '../../content/schema';
import {bridgeSurfaces,surfaceHeight,isBridgeAsset} from '../../shared/map/bridgeSurface';
import {SceneryLights} from '../prop/sceneryLights';
import type { AbilityAim } from "../settlement/abilityTarget";
import type { CommandFeedback } from "../../presentation/commandFeedback";
import { WeatherLayer } from "../sky/weatherLayer";
import { perf } from "../../debug/performance";
import { FogOfWar } from "../visibility/fogOfWar";
import { forestEnvironment } from "../sky/forestEnvironment";
import { SettlementLayer } from "../settlement/settlementLayer";
import { NavigationOverlay } from "../debug/navigationOverlay";
import type { NavigationPath, NavigationMeshSnapshot } from "../../sim/game/navigationDebug";
import {
  environmentLight,
} from "../../shared/environment/presets";
import { DecalLayer } from "../decal/decalLayer";
import { TerrainMaterial } from "../terrain/terrainMaterial";
import { Meadow } from "../foliage/meadow";
import { emptyLandscape, type Landscape } from "../../shared/landscape/curve";
/**
 * Height mesh, water, scenery and observed declarative gameplay entities.
 */
import {
  Color,
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
  Texture,
  Frustum,
  Matrix4,
  type Object3D,
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
import { PropField,type PropModelOptions } from "../prop/propField";
import { Sky } from "../sky/sky";

const GROUND = new Plane(new Vector3(0, 1, 0), 0);

export class Renderer {
  private readonly portrait: SelectionPortrait;
  gamePortrait(host:HTMLElement, definition:string|null, owner:Owner){
    this.portrait.set(host,definition ? `${definition}/${owner}` : '',()=>definition ? this.settlement?.createPortrait(definition,ownerSlot(owner)) ?? null : null);
  }
  private destroyed = false;
  gameTimeScale = 1;
  effectAudioPlaying = true;
  private visualClock = 0;
  private visualLast: number | null = null;
  readonly camera = new Camera();
  private unitShot:UnitShot|null=null;
  private cameraLast=0;
  private readonly indoorBackground=new Color('#080909');
  private readonly cameraRay=new Raycaster();
  unitCamera(shot:UnitShot|null):void {this.unitShot=shot;if(!shot){this.camera.setClosePose(null);this.settlement?.hideCameraBody(null);}}
  private updateUnitCamera():void {
    const now=performance.now(),dt=this.cameraLast?Math.min(100,now-this.cameraLast):16;this.cameraLast=now;
    const shot=this.unitShot,subject=shot&&this.settlement?.cameraSubject(shot.entity);
    if(!shot||!subject){this.camera.setClosePose(null);this.settlement?.hideCameraBody(null);return;}
    const aim=shot.lookAt===undefined?undefined:this.settlement?.cameraSubject(shot.lookAt);
    const lookAt=aim?.position.clone().add(new Vector3(0,aim.eyeHeight,0));
    const pose=unitCameraPose(subject,shot,lookAt);
    if(shot.mode==='third-person'){
      const direction=pose.eye.clone().sub(pose.focus),distance=direction.length();direction.normalize();
      this.cameraRay.set(pose.focus,direction);this.cameraRay.near=.05;this.cameraRay.far=distance;
      let allowed=Math.min(this.props.cameraObstruction(this.cameraRay),this.settlement?.cameraObstruction(this.cameraRay)??distance);
      // Sample terrain along the short boom, including steep ramp/cliff faces.
      for(let d=.15;d<allowed;d+=.15){const p=pose.focus.clone().addScaledVector(direction,d);if(p.y<(this.height?.sample(p.x,p.z)??0)+.2||(this.landscape.environment.interior&&this.landscape.environment.ceilingHeight!==undefined&&p.y>ceilingY(p.x,p.z,this.landscape.environment.ceilingHeight)-.3)){allowed=d;break;}}
      pose.eye.copy(pose.focus).addScaledVector(direction,Math.max(.1,allowed-.25));
    }
    this.settlement?.hideCameraBody(shot.mode==='first-person'?shot.entity:null);
    this.camera.setClosePose(pose,dt);
  }
  private readonly display: Display;
  private readonly reflections: WebGLRenderTarget;
  private readonly scene = new Scene();
  private readonly surroundings = new ForestSurroundingsLayer(this.scene);
  private canopyPreview=true;
  /** Local viewport override only; never changes the biome or saved map. */
  setCanopyPreview(enabled:boolean){
    if(this.canopyPreview===enabled)return;
    this.canopyPreview=enabled;
    this.configureCanopy();this.configureSurroundings();
  }
  private configureCanopy(){
    const settings=this.landscape.environment.canopy;
    this.canopy.configure(this.canopyPreview?settings:settings?{...settings,enabled:false}:undefined,this.height?.size??256);
  }
  private readonly ceiling = new InteriorCeiling(this.scene);
  private readonly sceneryLights = new SceneryLights(this.scene);
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
  private updateCourses(){
    this.importedWater?.dispose();
    this.importedWater=this.height?new ImportedWater(this.scene,this.height.source?.source??this.height):undefined;
  }
  private importedWater?:ImportedWater;
  private readonly dew=new DewLayer();
  private height: HeightField | null = null;
  private navigation: NavigationOverlay | null = null;
  private relation: Parameters<SettlementLayer["viewer"]>[1] | null = null;
  private readonly ray = new Raycaster();
  private readonly ndc = new Vector2();
  private readonly hit = new Vector3();
  private size = 0;
  private bridgeFilter=new SceneryFilter(s=>isBridgeAsset(s.asset));
  private bridgeStamps: readonly MapStamp[] | null = null;
  private readonly lines = new Group();
  private curvePreview: Line | null = null;
  readonly sky: Sky;
  private readonly canopy: CanopyLayer;
  private readonly weather = new WeatherLayer(this.scene);
  private authoredLandscape: Landscape = emptyLandscape();
  private landscape: ResolvedLandscape = biomeLandscape(undefined,emptyLandscape());
  private readonly meadow: Meadow;
  private readonly placedGrass: PlacedGrass;
  private readonly decals: DecalLayer;
  private settlement: SettlementLayer | null = null;
  private readonly cutaway=new SceneryCutaway();
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
  gameCommandFeedback(feedback: CommandFeedback) {
    if (this.height) this.settlement?.commandFeedback(feedback, this.height);
  }
  gameSelect(id: number | null | readonly number[]) {
    this.settlement?.select(id);
  }
  gameHover(id: number | null) {
    this.settlement?.hover(id);
  }
  /** Hover-grade pick: screen-space units, then entity bounds. Skips the terrain and
   * instanced-scenery raycasts `pickGameEntity` needs, so it can run every few frames. */
  pickGameHover(clientX: number, clientY: number): number | null {
    const unit = this.settlement?.pickUnit(this.threeCam(), this.display.canvas.getBoundingClientRect(), clientX, clientY);
    if (unit != null) return unit;
    return this.aim(clientX, clientY) ? this.settlement?.pick(this.ray, Infinity) ?? null : null;
  }
  /** Relation decides selection-circle tint; the slot gates which rally flags are drawn. */
  gameViewer(slot: number, relation: Parameters<SettlementLayer["viewer"]>[1]) {
    this.settlement ??= new SettlementLayer(this.scene);
    this.settlement.viewer(slot, relation);
    this.relation = relation;
  }
  /** Debug navigation overlay. `null` tears it down; `cells` is only sent when the grid changed. */
  gameNavigation(state: {grid:boolean;size:number;cells?:Uint8Array;paths?:readonly NavigationPath[];mesh?:boolean;meshInput?:NavigationMeshSnapshot} | null) {
    if (!state) {
      this.navigation?.dispose();
      this.navigation = null;
      return;
    }
    this.navigation ??= new NavigationOverlay(this.scene);
    if (!state.grid) this.navigation.setGrid(state.size, null);
    else if (state.cells) this.navigation.setGrid(state.size, state.cells);
    this.navigation.setPaths(state.paths ?? null, (owner) => this.relation?.(owner) ?? "neutral");
    this.navigation.setMesh(!!state.mesh,state.meshInput);
  }  gameReady() {
    return this.settlement?.ready ?? Promise.resolve();
  }
  private readonly refreshEnvironment = () =>
    this.sky.setGlobalLight(
      environmentLight(this.landscape.environment),
    );
  gridOn = true;
  gridMode: GridMode = "tiles";
  private readonly interiorCutaway={value:0};

  constructor(
    canvas: HTMLCanvasElement,
    assets: ReadonlyMap<string, string> = new Map(),
  ) {
    installEffectAudio();
    this.display = new Display(canvas, () => this.present());
    this.hookShadowCulling();
    // The root never moves. With auto-update on, three's updateMatrix() marks it dirty every
    // frame and force-recomputes every descendant, including static batches that opted out.
    this.scene.matrixAutoUpdate = false;
    this.reflections = forestEnvironment(this.display.gl);
    this.scene.environment = this.reflections.texture;
    this.portrait = new SelectionPortrait(this.reflections.texture);
    this.scene.environmentIntensity = 0.75;
    this.props = new PropField(this.scene, assets,this.cutaway);
    this.brush = new BrushLayer(this.scene);
    this.sky = new Sky(this.scene);
    this.canopy = new CanopyLayer(this.scene);
    this.refreshEnvironment();


    this.meadow = new Meadow(this.scene);this.placedGrass=new PlacedGrass(this.scene);
    this.decals = new DecalLayer(this.scene);
    this.lines.name = "grid-lines";
    this.scene.add(this.lines);
  }

  /** Tools attach editable/animated subjects to the actual game scene. The owner
   * retains their resources; lighting, shadows, reflections and grading stay here. */
  effectAudioView():AudioView{const cam=this.threeCam();cam.updateMatrixWorld();const right=new Vector3().setFromMatrixColumn(cam.matrixWorld,0);return {x:this.camera.targetX,z:this.camera.targetZ,rightX:right.x,rightZ:right.z};}

  mountInspectionSubject(subject: Object3D): () => void {
    this.scene.add(subject);
    return () => subject.removeFromParent();
  }

  landmarks(aspect: number, ids?: readonly string[]) {
    const cam = this.threeCam().clone();
    this.camera.applyTo(cam, 1000 * aspect, 1000);
    return this.props.landmarks(cam, ids);
  }
  referenceWaterDiagnostics(){return this.importedWater?.diagnostics(this.display.gl)??null;}
  capture(
    width: number,
    aspect: number,
    animationTime?: number,
    inspection?: InspectionShot,
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
      this.drawOffscreen(target,animationTime,inspection);
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
  private drawOffscreen(target:WebGLRenderTarget,animationTime?:number,inspection?:InspectionShot,cull=false):void {
    const gl=this.display.gl,w=target.width,h=target.height,previous=gl.getRenderTarget();
    try {
      if (animationTime !== undefined) {
        this.importedWater?.tick(animationTime * 1000);
        this.meadow.tick(animationTime * 1000);this.placedGrass.tick(animationTime*1000);
        this.props.tick(animationTime * 1000);
      }
      const cam = inspection ? new PerspectiveCamera(inspection.fov,w/h,.08,180) : this.threeCam();
      if(inspection){cam.position.fromArray(inspection.eye);cam.lookAt(new Vector3().fromArray(inspection.target));cam.updateMatrixWorld();}
      else this.camera.applyTo(cam, w, h);
      this.settlement?.cameraOverlays(cam,this.display.canvas.clientHeight,this.camera.followingUnit);
      // Units frozen outside the live view stay hidden for another camera unless woken for it.
      cam.updateMatrixWorld();
      this.settlement?.setViewFrustum(new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse),cam.coordinateSystem));
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
      gl.setRenderTarget(target);
      if(cull){this.props.cull(new Frustum().setFromProjectionMatrix(new Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse),cam.coordinateSystem));this.culledFrame=true;}
      // The RTS overhead cutaway footprint would punch holes in the floor at eye level.
    // Close views use the physical camera boom/near plane instead.
    this.cutaway.update(cam,inspection||this.camera.followingUnit||!(this.cutaway.active||this.interiorCutaway.value)?[]:this.settlement?.cutawaySubjects()??[]);
      this.display.drawWorld(this.scene,cam,this.atmosphereFrame(animationTime===undefined?this.visualClock:animationTime*1000));
    }finally{if(cull){this.culledFrame=false;this.props.cull(null);}gl.setRenderTarget(previous);}
  }
  private benchmarking=false;
  async benchmarkRendering(input:RenderBenchmarkOptions={}){
    if(this.benchmarking)throw Error('A render benchmark is already running');
    const options=renderBenchmarkOptions(input),target=new WebGLRenderTarget(options.width,options.height);
    target.texture.colorSpace=SRGBColorSpace;this.benchmarking=true;
    const time=this.visualClock/1000,revision=this.camera.rev;
    const camera={x:this.camera.targetX,z:this.camera.targetZ,yaw:this.camera.yaw,pitch:this.camera.pitch,zoom:this.camera.zoom,distance:this.camera.distance,game:this.camera.game,topDown:this.camera.isTopDown};
    try{const result=await measureRenderBenchmark(this.display.gl,frame=>{
      if(this.destroyed)throw Error('Renderer closed during benchmark');
      if(this.camera.rev!==revision)throw Error('Camera moved during benchmark; keep the view still and run it again');
      this.drawOffscreen(target,time+Math.max(0,frame)/60,undefined,true);
    },options);
      if(this.camera.rev!==revision)throw Error('Camera moved during benchmark; keep the view still and run it again');
      return {...result,camera};}
    finally{target.dispose();this.benchmarking=false;if(!this.destroyed)this.present();}
  }
  screenPoint(x:number,y:number,z:number):{x:number;y:number}|null{
    return this.screenProjector()(x,y,z);
  }
  /** One camera/viewport snapshot for a batch of overlay points. */
  screenProjector(){
    const rect=this.display.canvas.getBoundingClientRect(),cam=this.threeCam();this.camera.applyTo(cam,rect.width,rect.height);cam.updateMatrixWorld();
    const matrix=new Matrix4().multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse),p=new Vector3();
    return (x:number,y:number,z:number):{x:number;y:number}|null=>{
      p.set(x,y,z).applyMatrix4(matrix);if(p.z<-1||p.z>1)return null;return {x:rect.left+(p.x+1)*rect.width/2,y:rect.top+(1-p.y)*rect.height/2};
    };
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
  setLandscape(input: Landscape): void {
    this.authoredLandscape=input;
    const landscape=biomeLandscape(this.height?.biome,input);
    const rebuild =
      this.landscape.cover !== landscape.cover ||
      this.landscape.strokes !== landscape.strokes ||
      this.landscape.environment.season !== landscape.environment.season;
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
      this.landscape.environment.preset !== landscape.environment.preset ||
      this.landscape.environment.light !== landscape.environment.light;
    this.landscape = landscape;
    this.interiorCutaway.value=landscape.environment.interior?1:0;
    this.ceiling.configure(this.size||256,landscape.environment);
    this.weather.configure(landscape.environment.weather);
    this.configureCanopy();
    this.configureSurroundings();
    if (presetChanged) this.refreshEnvironment();
    this.sky.setInterior(!!landscape.environment.interior);
    this.sky.setHour(landscape.environment.hour);
    this.sky.setPlaying(landscape.environment.playing);
    this.props.setSeason(landscape.environment.season);
    if (this.terrain && this.height) {
      const mat = this.terrain.material as TerrainMaterial;
      if (rebuild) {
        mat.update(this.height, landscape.strokes);
        mat.setCover(landscape.cover);
      }
      if (rebuild) this.meadow.rebuild(this.height, landscape);
    }
  }
  async ready(onReady?:(name:string,durationMs:number)=>void): Promise<void> {
    const started=performance.now();
    const pending=[['Surroundings',this.surroundings.ready],['Scenery models and placement',this.props.ready()],['Meadow',this.meadow.ready],['Placed grass',this.placedGrass.ready],['Terrain textures',this.terrain?.material.ready],['Water textures',this.importedWater?.ready]] as const;
    await Promise.all(pending.map(([name,ready])=>Promise.resolve(ready).then(()=>onReady?.(name,performance.now()-started))));
  }
  async preload(stamps: readonly MapStamp[]): Promise<void> {
    this.settlement ??= new SettlementLayer(this.scene);
    this.settlement.preloadRoster();
    await Promise.all([this.props.preload(stamps), this.gameReady(), this.ready()]);
  }
  /** Begin known model loads while the world is compiling. Publication still owns instances. */
  prefetchWorldAssets(entities:Iterable<string>,terrain:{biome?:string;source?:ImportedTerrain}):void {
    prefetchTerrain(terrain.biome,terrain.source);
    this.settlement??=new SettlementLayer(this.scene);
    this.settlement.preloadAssets(entities);
  }
  private warming: Promise<void> | null = null;
  warmup(): Promise<void> {
    return this.warming ??= this.prepareGraphics().finally(() => {
      this.warming = null;
      if (this.destroyed) this.disposeResources();
    });
  }
  private async prepareGraphics(): Promise<void> {
    const cam = this.threeCam();
    this.camera.applyTo(cam, this.display.width, this.display.height);
    const models = [...(this.settlement?.prepareModels() ?? []), ...await this.props.prepareModels(), this.decals.warmModel()];
    if(this.destroyed)return;
    const textures = new Set<Texture>();
    const upload = (root: Object3D) => root.traverse(o => {
      const material = (o as Mesh).material;
      if (!material) return;
      for (const m of Array.isArray(material) ? material : [material])
        for (const value of Object.values(m)) if (value instanceof Texture) textures.add(value);
    });
    this.fog?.prepare(this.scene);this.fog?.prepare(this.dew.scene);upload(this.scene); models.forEach(model => {this.fog?.prepare(model);upload(model);});
    const gl=this.display.gl;
    for (const texture of textures) gl.initTexture(texture);
    // Program keys include output colour space and tone mapping, which follow the bound target:
    // compiling against the canvas while play renders into the atmosphere target links the
    // wrong variants and every first draw links again. compile() itself is synchronous, so the
    // target is never left bound across an await.
    const target=new WebGLRenderTarget(64,64),previous=gl.getRenderTarget();
    const destination=this.display.sceneOffscreen(this.atmosphereFrame(performance.now()))?target:null;
    const compile=(root:Object3D,into?:Scene)=>{gl.setRenderTarget(destination);try{return gl.compileAsync(root,cam,into);}finally{gl.setRenderTarget(previous);}};
    const group=new Group();
    try{
      await compile(this.scene);
      await compile(this.dew.scene);
      // Models need the same lights, fog and environment as their eventual scene.
      if(this.destroyed)return;
      for(const model of models)group.add(model);
      await compile(group,this.scene);
      if(this.destroyed)return;
      // Compile is not a vertex-buffer upload. A tiny draw also warms shared geometry and
      // skinning; temporary instances never enter game state. present() below repaints the canvas.
      const shadowUpdates=gl.shadowMap.autoUpdate;
      group.position.set(this.camera.targetX,this.height?.sample(this.camera.targetX,this.camera.targetZ)??0,this.camera.targetZ);
      for(const model of models){model.traverse(o=>{o.frustumCulled=false;});group.add(model);}
      this.scene.add(group);
      // One shadow pass links the depth/distance variants too (skinned, alpha-tested, custom depth).
      try {gl.shadowMap.autoUpdate=false;gl.shadowMap.needsUpdate=true;gl.setRenderTarget(destination);gl.render(this.scene,cam);}
      finally {gl.setRenderTarget(previous);gl.shadowMap.autoUpdate=shadowUpdates;}
    }finally{group.removeFromParent();group.clear();target.dispose();}
    this.present();
    this.pinPrograms();this.warmed=true;
    this.visualLast = null;
  }
  sceneryConstruction(){return this.props.constructionReport();}
  diagnostics() {
    const context=this.display.gl.getContext() as WebGL2RenderingContext;
    const samplerTypes=new Set<number>([context.SAMPLER_2D,context.SAMPLER_CUBE,context.SAMPLER_3D,context.SAMPLER_2D_ARRAY,context.SAMPLER_2D_SHADOW]);
    const programs=(this.display.gl.info.programs??[]).map(p=>{
      const program=p.program as WebGLProgram,n=context.getProgramParameter(program,context.ACTIVE_UNIFORMS),samplers:{name:string;size:number}[]=[];
      for(let i=0;i<n;i++){const u=context.getActiveUniform(program,i);if(u&&samplerTypes.has(u.type))samplers.push({name:u.name,size:u.size});}
      return {name:p.name,units:samplers.reduce((n,u)=>n+u.size,0),samplers};
    }).filter(p=>p.units>=12);
    return {
      samplerBudget:{fragment:context.getParameter(context.MAX_TEXTURE_IMAGE_UNITS),combined:context.getParameter(context.MAX_COMBINED_TEXTURE_IMAGE_UNITS),programs},
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

  setAssets(assets: ReadonlyMap<string, string>,models?:ReadonlyMap<string,PropModelOptions>): void {
    this.props.setUrls(assets,models);
  }
  assetBounds(ids:readonly string[]){return this.props.boundsFor(ids);}

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
    const previous=this.height;
    // Immutable compiled fields may differ only in vegetation coverage. Moving a
    // landmark must refresh those masks, but must not rebuild the river meshes.
    const change=heightChange(field,previous);
    const surfaceOnly=change?change.bounds===null&&change.waterUnchanged:!!(previous&&field&&previous!==field&&!previous.source&&!field.source&&previous.size===field.size&&previous.waterLevel===field.waterLevel&&previous.samples.every((h,i)=>h===field.samples[i])&&JSON.stringify(previous.watercourses)===JSON.stringify(field.watercourses));
    this.height = field;
    this.sky.setProfile(biomeById(field?.biome).lightingProfile);
    if(previous?.biome!==field?.biome)this.setLandscape(this.authoredLandscape);
    this.configureSurroundings();
    const waterStart=perf.start(),waterUpdated=this.importedWater?.updateHeight(field);if(!surfaceOnly&&!waterUpdated)this.updateCourses();perf.end("Terrain · water geometry (event)",waterStart);
    this.sceneryLights.invalidate();
    this.bridgeStamps = null;
    const sample = field ? (x: number, z: number) => field.sample(x, z) : null;
    this.camera.setTerrain(sample, field?.waterLevel ?? 0);
    let stage=perf.start();
    this.props.setHeight(sample,field,surfaceOnly);
    this.props.setWaterY(field?.waterLevel ?? 0);
    perf.end('Terrain · prop grounding (event)',stage);
    if(!surfaceOnly)this.brush.setHeight(sample, dirty);
    if (!this.terrain || !field || field.size !== this.size) {
      perf.end("Terrain update (event)", timing);
      return;
    }
    stage=perf.start();
    const changedRegion=dirty??(change&&!!previous?.rockCoverage===!!field.rockCoverage?change.bounds:undefined);
    if(!surfaceOnly)this.terrain.setFrom(field,changedRegion);
    perf.end('Terrain · mesh update (event)',stage);
    stage=perf.start();
    (this.terrain.material as TerrainMaterial).update(
      field,
      this.landscape.strokes,
      surfaceOnly,
    );
    (this.terrain.material as TerrainMaterial).setCover(this.landscape.cover);
    perf.end('Terrain · ground material (event)',stage);stage=perf.start();
    if(surfaceOnly)this.meadow.updateGround(field);else this.meadow.rebuild(field, this.landscape);
    perf.end('Terrain · grass grounding (event)',stage);
    if(!surfaceOnly)this.decals.rebuild(
      this.landscape.decals ?? [],
      field,
      this.landscape.environment.season,
    );
    if (drape&&!surfaceOnly) this.refreshGrid();
    perf.end("Terrain update (event)", timing);
  }

  draw(snapshot: Omit<ViewSnapshot, "settlement"> & Partial<Pick<ViewSnapshot, "settlement">>, stamps: readonly MapStamp[] = []): void {
    if (this.size !== snapshot.size) {
      this.size = snapshot.size;
      this.ceiling.configure(this.size,this.landscape.environment);
      this.lines.clear();
      this.terrain?.destroy(this.scene);
      this.fog?.dispose();
      this.fog = null;
      addSunAndGrid(this.scene, snapshot.size, this.lines, this.gridMode);
      this.sky.resize(snapshot.size);
      this.terrain = new HeightMesh(this.scene, snapshot.size);
      this.cutaway.attach(this.terrain.material,16,this.interiorCutaway);
      if (this.height) {
        this.terrain.setFrom(this.height);
        (this.terrain.material as TerrainMaterial).update(
          this.height,
          this.landscape.strokes,
        );
        (this.terrain.material as TerrainMaterial).setCover(
          this.landscape.cover,
        );
        this.meadow.rebuild(this.height, this.landscape);
      }
      this.lines.visible = this.gridOn;
      this.refreshGrid();
    }
    const bridges=this.bridgeFilter.select(stamps);
    if(this.height && this.bridgeStamps !== bridges){this.bridgeStamps=bridges;const field=this.height;const surfaces=bridgeSurfaces(bridges,(x,z)=>field.sample(x,z));const byId=new Map(surfaces.map(b=>[b.id,b]));field.walkSurface=(x,z,id)=>{const b=byId.get(id);return b?surfaceHeight(b,x,z):undefined;};this.walkPicker.set(surfaces);}
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
    if(this.height?.source)liveSourceOcclusion(this.height.source.source).sync(stamps);
    let sceneryStage=perf.start();
    const propStamps=this.placedGrass.sync(stamps,this.height);
    perf.end('Scenery sync · placed grass',sceneryStage);sceneryStage=perf.start();
    this.props.sync(propStamps);
    perf.end('Scenery sync · model placements',sceneryStage);sceneryStage=perf.start();
    if(this.height)this.sceneryLights.sync(stamps,this.height);
    perf.end('Scenery sync · lights',sceneryStage);
    perf.end("Prop sync", props);
    const visibility = perf.start();
    if (snapshot.settlement?.fog) {
      this.fog ??= new FogOfWar(snapshot.size);
      this.fog.update(snapshot.settlement.fog, this.scene);
      // Rivers render in their own scene after opaque color/depth are copied.
      if(this.importedWater)this.fog.prepare(this.importedWater.group);
      this.fog.prepare(this.dew.scene);
    }
    perf.end("Fog of war", visibility);
    this.present();
  }

  /** Drag previews bypass terrain uploads, grass rebuilding and static prop synchronization. */
  previewEditorStamp(stamp:MapStamp):void {this.props.previewStamp(stamp);}
  previewEditorEntities(settlement:NonNullable<ViewSnapshot['settlement']>):void {
    if(this.height)this.settlement?.update(settlement,this.height,0,this.gameTimeScale);
  }

  /** Picking standalone workbench models; never issues gameplay commands. */
  pickInspectionObject(clientX:number,clientY:number,objects:import('three').Object3D[]){
    if(!this.aim(clientX,clientY))return null;
    return this.ray.intersectObjects(objects,true)[0]?.object??null;
  }

  pickGameEntity(clientX: number, clientY: number): number | null {
    if (!this.aim(clientX, clientY)) return null;
    const unit = this.settlement?.pickUnit(this.threeCam(), this.display.canvas.getBoundingClientRect(), clientX, clientY);
    if (unit != null) return unit;
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

  private readonly walkPicker=new WalkSurfacePicker();
  pickWalk(clientX:number,clientY:number){
    const ground=this.pickGround(clientX,clientY);if(!ground)return null;
    const distance=this.ray.ray.origin.distanceTo(new Vector3(ground.x,ground.y,ground.z));
    return this.walkPicker.pick(this.ray,distance)??ground;
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

  private presentationEnabled=true;
  /** Loading screens may assemble a scene without rendering intermediate shader
   * variants. Re-enabling does not submit a frame; the owner publishes once ready. */
  setPresentationEnabled(enabled:boolean):void {this.presentationEnabled=enabled;this.visualLast=null;}
  present(now = performance.now()): void {
    if(this.destroyed||!this.presentationEnabled)return;
    if (this.visualLast === null) this.visualClock = now;
    else
      this.visualClock +=
        Math.max(0, now - this.visualLast) * this.gameTimeScale;
    this.visualLast = now;
    now = this.visualClock;
    this.updateUnitCamera();
    this.settlement?.setAudioFrame(this.effectAudioView(),this.effectAudioPlaying&&this.gameTimeScale>0,this.gameTimeScale);
    this.ceiling.update(this.camera.followingUnit);
    const mode=this.camera.followingUnit?this.unitShot!.mode:'rts',phase=this.camera.closeTransitionComplete?'settled':'moving';
    if(this.display.canvas.dataset.cameraMode!==mode)this.display.canvas.dataset.cameraMode=mode;
    if(this.display.canvas.dataset.cameraTransition!==phase)this.display.canvas.dataset.cameraTransition=phase;
    const total = perf.start(),
      environment = perf.start();
    this.sky.tick(now);
    this.importedWater?.tick(now);
    if(this.landscape.environment.interior)this.scene.background=this.indoorBackground;
    this.canopy.tick(now);
    this.sky.setSunTransmission(this.canopy.sunTransmission);
    this.sky.focus(
      this.camera.targetX,
      this.camera.targetZ,
      this.camera.game
        ? Math.max(40, Math.min(110, this.camera.distance * 0.8))
        : 70,
    );
    this.meadow.tick(now);this.placedGrass.tick(now);
    this.props.tick(now);
    this.sceneryLights.update(this.camera.targetX,this.camera.targetZ);
    this.navigation?.follow(this.camera.targetX,this.camera.targetZ,this.height);
    perf.end("Sky / water / wind", environment);
    const camera = perf.start();
    const cam = this.threeCam();
    this.camera.applyTo(cam, this.display.width, this.display.height);
    if (cam === this.persp && !this.camera.followingUnit) {
      // Receivers: ground around the focus height up to canopy tops.
      const ground = this.height?.sample(this.camera.targetX, this.camera.targetZ) ?? 0;
      cam.updateMatrixWorld();
      this.sky.fitView(cam, ground - 6, ground + 12);
    }
    this.settlement?.cameraOverlays(cam,this.display.canvas.clientHeight,this.camera.followingUnit);
    this.updateAtmosphere(cam);
    // The RTS overhead cutaway footprint would punch holes in the floor at eye level.
    // Close views use the physical camera boom/near plane instead.
    this.cutaway.update(cam,this.camera.followingUnit||!(this.cutaway.active||this.interiorCutaway.value)?[]:this.settlement?.cutawaySubjects()??[]);
    this.weather.update(
      now,
      this.camera.targetX,
      this.camera.targetZ,
      cam,
      this.height,
    );
    this.props.updateLOD(cam);
    this.meadow.updateLOD(cam);
    perf.end("Camera / atmosphere", camera);
    cam.updateMatrixWorld();
    this.viewFrustum.setFromProjectionMatrix(this.viewProjection.multiplyMatrices(cam.projectionMatrix,cam.matrixWorldInverse),cam.coordinateSystem);
    this.props.cull(this.viewFrustum);
    this.settlement?.setViewFrustum(this.camera.followingUnit ? null : this.viewFrustum);
    this.culledFrame=true;
    try{this.display.render(this.scene, cam,()=>this.portrait?.draw(this.display.gl, now),this.atmosphereFrame(now));}
    finally{
      this.culledFrame=false;
      // Other paths (editor captures, warmup) render this scene with their own cameras.
      this.props.cull(null);
    }
    perf.end("Present total (CPU)", total);
  }

  private readonly viewFrustum=new Frustum();
  private readonly viewProjection=new Matrix4();
  private culledFrame=false;
  /** three builds the main render list before drawing shadows and never re-checks visibility
   * afterwards, so prop cells culled for the camera can be re-culled for the sun just before
   * the shadow pass: offscreen trees keep casting into view, and scatter stays out of the map.
   * Wraps only this renderer's shadow map; three's internal render state stays intact. */
  /**
   * three frees a program when its last material is disposed. Per-cue effects (spells,
   * impacts, command feedback) create and dispose materials, so every new cue re-linked the
   * same program: a 20–100 ms stall. An extra reference keeps each variant alive for the
   * renderer's lifetime; the set is bounded by content variants and freed with the context.
   */
  private readonly pinned=new WeakSet<object>();
  private pinnedCount=0;
  /** Set once the match warm-up finished; later program links are reported as stalls. */
  private warmed=false;
  private pinPrograms(){
    const programs=this.display.gl.info.programs;
    if(!programs||programs.length===this.pinnedCount)return;
    for(const p of programs)if(!this.pinned.has(p)){this.pinned.add(p);p.usedTimes++;if(this.warmed)perf.shaderLink(`${p.name||'?'} @ ${this.programOwner(p)}`,p.cacheKey);}
    this.pinnedCount=programs.length;
  }
  /** Scene path of the first mesh drawn with a late program. Runs only on a late link, which has already stalled the frame. */
  private programOwner(program:object){
    const properties=this.display.gl.properties;let owner='';
    this.scene.traverse(o=>{
      if(owner||!(o as Mesh).material)return;
      const materials=(o as Mesh).material;
      for(const m of [...(Array.isArray(materials)?materials:[materials]),o.customDepthMaterial,o.customDistanceMaterial])if(m&&(properties.get(m) as {currentProgram?:object}).currentProgram===program){
        const path:string[]=[];for(let n:Object3D|null=o;n&&n!==this.scene&&path.length<5;n=n.parent)path.push(n.name||n.type);
        owner=`${path.reverse().join(' / ')} [${m.name||m.type}]`;return;
      }
    });
    return owner||'shadow/depth or offscreen';
  }
  private hookShadowCulling(){
    const shadowMap=this.display.gl.shadowMap,render=shadowMap.render.bind(shadowMap);
    shadowMap.render=(lights,scene,camera)=>{
      if(scene===this.scene){this.fog?.prepareDraws(this.display.gl.renderLists.get(scene,0));this.pinPrograms();}
      const sun=this.sky?.sun;
      if(this.culledFrame&&sun&&scene===this.scene&&shadowMap.enabled&&lights.includes(sun)){
        sun.shadow.updateMatrices(sun);
        this.props.cull(sun.shadow.getFrustum(),true);
      }
      if(scene!==this.scene){render(lights,scene,camera);return;}
      this.settlement?.showShadowProxies(true);
      try{render(lights,scene,camera);}finally{this.settlement?.showShadowProxies(false);}
    };
  }

  private atmosphereFrame(now:number){
    // Per frame, not per snapshot: prop models load asynchronously and rebatch after the
    // update that placed them. Unchanged revisions return immediately.
    this.dew.set(this.props.dewRevision,this.props.dew);
    const weather=this.landscape.environment.weather;
    const close=this.canopyPreview?this.surroundings.closeFactor:0,profile=biomeById(this.height?.biome).surroundings;
    const atmosphere=profile&&close>0&&!this.landscape.environment.interior?{
      ...this.landscape.environment.atmosphere!,enabled:true,density:0,
      shaftDensity:profile.closeShaftDensity*close,baseHeight:0,heightFalloff:24,
      sunStrength:2.8,sunTint:'#ffe6b1',
    }:this.landscape.environment.atmosphere;
    return {depthOfField:profile?.depthOfField&&close>0&&!this.landscape.environment.interior?{...profile.depthOfField,strength:close}:undefined,canopy:this.canopy.frame(),sourceWater:this.importedWater,dew:this.dew,sourceHeightOffset:this.height?.source?.source.heightOffset??-16,...this.sky.fogModifiers(),daytime:this.sky.daytime(),settings:atmosphere,postProcessing:this.landscape.environment.postProcessing,sun:this.sky.sun,visibility:this.fog?.texture,mapSize:this.height?.size??256,
      waterLevel:(this.height?.waterLevel??0)-.03,time:now,windX:weather?.windX??.4,windZ:weather?.windZ??.2,
      rain:weather?.kind==='rain'?weather.intensity:0};
  }

  private configureSurroundings(){
    this.surroundings.configure(this.canopyPreview?biomeById(this.height?.biome).surroundings:undefined,this.height,this.canopy.frame(),!!this.landscape.environment.interior);
  }
  private updateAtmosphere(cam: OrthographicCamera | PerspectiveCamera): void {
    this.surroundings.update(cam,this.canopy.frame(),this.sky.sun,this.visualClock);
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
    if(this.destroyed)return;
    this.destroyed = true;
    // compileAsync polls material program handles. Releasing them during its
    // poll would invalidate Three's pending promise when a user leaves loading.
    if(!this.warming)this.disposeResources();
  }
  private disposeResources(): void {
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
    this.meadow.destroy();this.placedGrass.destroy();
    this.weather.dispose();
    this.surroundings.dispose();
    this.canopy.dispose();
    this.ceiling.dispose();
    this.cutaway.dispose();
    this.sceneryLights.dispose();
    this.brush.destroy(this.scene);
    this.terrain?.destroy(this.scene);
    this.importedWater?.dispose();
    this.dew.dispose();
    this.props.destroy();
    this.walkPicker.dispose();
    this.portrait.destroy();
    this.settlement?.destroy(this.scene);
    this.navigation?.dispose();
    this.navigation = null;
    this.fog?.dispose();


    this.decals.destroy(this.scene);
    this.reflections.dispose();
    this.display.destroy();
  }
}
