import {LayerContextMenu} from '../chrome/layerContextMenu';
import {isBridgeAsset} from '../../shared/map/bridgeSurface';
import {perf} from '../../debug/performance';
import {hitLayer,hitLayers} from '../select/layerHit';
import {walkStampSchema} from '../../shared/map/utcmap';
import {AuthoringHistory,type SceneSelection} from '../../shared/authoring/history';
import {proceduralLayerSchema,authoredObjectSchema,type ProceduralLayer,type AuthoredObject} from '../../shared/authoring/layers';
import {compileMapScene,type CompiledMapScene} from '../../shared/authoring/mapScene';
import {landscapeAssets,projectScene,rememberProjectScene,sceneInputs} from '../../shared/authoring/project';
import {sampleBezier} from '../../shared/authoring/shapes';
import {canopySchema} from '../../shared/landscape/canopy';
import {atmosphereSchema} from '../../shared/landscape/atmosphere';
import {missionSchema,type MissionDefinition} from "../../shared/scenario/schema";
import {renameEntity} from "./entityAuthoring";
import {validatePlacements} from "../../content/map";
import {sculptPlateau,sculptRamp} from '../../shared/landscape/tacticalAuthoring';
import {forestCoverStroke} from './forestCover';
import { content } from "../../content/builtin";
import { expandMap } from "../../content/map";
import { type Owner } from "../../content/schema";
import {
  editorEntities,
  resourceStamps,
  authoredScene,
} from "../../presentation/scenery";
import {
  putEntity,
  deleteEntity,
  entityAuthoringState,
  restoreEntityAuthoring,
  type EntityAuthoringState,
} from "./entityAuthoring";
import { playableMapError } from "../../shared/map/playable";
import {
  decalAt,
  validDecal,
  type GroundDecal,
  type DecalKind,
} from "../../shared/landscape/decal";
import { readBrushSize, saveBrushSize } from "../brush/sizePrefs";
import { DAY_CYCLE_SECONDS } from "../../render/sky/sky";
import {
  DEFAULT_WATER_STYLE,
  type WaterStyle,
} from "../../shared/landscape/waterStyle";
import { applyLandform, type Landform } from "../../shared/landscape/landform";
import {
  sampleCurve,
  curveDistance,
  emptyLandscape,
  type CurvePoint,
  type TerrainLayer,
  type CoverPatch,
  type EnvironmentState,
} from "../../shared/landscape/curve";
/**
 * Authored map view. Same Renderer as play. No Session, no lockstep, no World.tick.
 */
import {
  DEFAULT_MAP_NAME,
  decodeHeight,
  emptyUtcMap,
  encodeHeight,
  HeightField,
  inStamp,
  sitAllowed,
  type AssetType,
  type GridMode,
  type MapStamp,
  type UtcMap,
} from "../../shared";
import { ISO_PITCH, ISO_YAW, MapInput, Minimap, Renderer } from "../../render";
import { BrushMask } from "../brush/brush";
import { BrushKit } from "../brush/kit";
import { scatterBrush } from "../brush/scatter";
import { CleanTool, wipeStamps, eraseCover } from "../clean/clean";
import { nearestStamp, SelectTool, withPose, stepYaw, YAW_STEP } from "../select/select";
import { SculptTool, type SculptMode } from "../sculpt/sculpt";

export type EditorTool =
  | "select"
  | "stamp"
  | "brush"
  | "clean"
  | "sculpt"
  | "terrain"
  | "decal"
  | "spawn"
  | "entity";

export type EditorView = {
  x: number;
  z: number;
  gameCam: boolean;
  gameZoom?: number;
  zoom: number;
  yaw: number;
  pitch: number;
};

export type EditorShot = {
  data: string;
  mime: string;
  width: number;
  height: number;
  view: EditorView;
};

export type EditorShotOpts = {
  gameZoom?: number;
  x?: number;
  z?: number;
  zoom?: number;
  yaw?: number;
  pitch?: number;
  gameCam?: boolean;
  iso?: boolean;
  keep?: boolean;
  maxWidth?: number;
  format?: "png" | "jpeg";
  quality?: number;
  aspect?: number;
  animationTime?: number;
};

export class WorldEditor {
  map: UtcMap = emptyUtcMap();
  readonly authoringAssets=landscapeAssets;
  layers=new AuthoringHistory({version:1,layers:[],objects:[]});
  private compiledScene:CompiledMapScene|null=null;
  private compiledInputs:unknown[]=[];
  private drawingLayer:ProceduralLayer|null=null;
  private paintingLayer:ProceduralLayer|null=null;
  private paintStrokeStarted=false;
  private curveDrawing=false;
  layerBrushSize=16;
  layerBrushOperation:'add'|'subtract'='add';
  layerCursor:{x:number;z:number}|null=null;
  get paintPreview(){return this.paintingLayer;}
  get isPaintingLayer(){return this.paintingLayer!==null;}
  beginLayerPaint(recipeId:string,name:string,id?:string){
    const existing=id?this.layers.scene.layers.find(l=>l.id===id):undefined;
    if(existing?.locked)throw Error('Layer is locked');
    if(existing&&existing.shape.type!=='mask')throw Error('This layer uses a course; create a painted layer for a lake or foliage.');
    this.drawingLayer=null;if(!existing)this.layerBrushOperation='add';
    this.paintingLayer=existing?structuredClone(existing):{id:'layer.'+crypto.randomUUID(),name,recipe:recipeId,seed:1,enabled:true,visible:true,locked:false,order:this.layers.scene.layers.length,shape:{type:'mask',elevation:Math.max(-.6,this.height.waterLevel),strokes:[]}};
    this.layers.selection=existing?{kind:'layer',id:existing.id}:null;this.setTool(null);this.authoringCamera('top');this.hooks.onSelect?.();
  }
  private paintLayerAt(clientX:number,clientY:number,erase:boolean){
    const layer=this.paintingLayer,p=this.shapeWorldPoint(clientX,clientY);if(!layer||layer.shape.type!=='mask'||!p)return;
    const point={x:p.x,z:p.z};this.layerCursor=point;
    if(!this.paintStrokeStarted){layer.shape.strokes.push({operation:erase?'subtract':this.layerBrushOperation,radius:this.layerBrushSize/2,points:[point]});this.paintStrokeStarted=true;}
    else{const stroke=layer.shape.strokes.at(-1)!,last=stroke.points.at(-1)!;if(Math.hypot(point.x-last.x,point.z-last.z)>.15)stroke.points.push(point);}
  }
  private finishPaintStroke(){
    if(!this.paintingLayer||!this.paintStrokeStarted)return;
    try{this.putLayer(this.paintingLayer);this.layers.selection={kind:'layer',id:this.paintingLayer.id};this.paintingLayer=structuredClone(this.paintingLayer);}
    catch(e){this.entityMessage=(e as Error).message;const previous=this.layers.scene.layers.find(l=>l.id===this.paintingLayer?.id);if(previous)this.paintingLayer=structuredClone(previous);else this.paintingLayer.shape={type:'mask',elevation:-.6,strokes:[]};}
    this.paintStrokeStarted=false;this.hooks.onSelect?.();
  }
  get generatedScene(){return this.compiledScene?.generated;}
  selectLayer(selection:SceneSelection){this.paintingLayer=null;this.drawingLayer=null;this.layers.selection=selection;this.select.clear();this.selectedEntity=null;this.setTool('select');this.paint();this.hooks.onSelect?.();}
  putLayer(input:unknown){const layer=proceduralLayerSchema.parse(input),scene=this.layers.scene;if(scene.layers.find(l=>l.id===layer.id)?.locked)throw Error('Layer is locked');const compiled=compileMapScene({...this.map,authoring:{...scene,layers:[...scene.layers.filter(l=>l.id!==layer.id),layer]}},this.authoringAssets);this.layers.putLayer(layer);if(this.paintingLayer?.id===layer.id)this.paintingLayer=structuredClone(layer);this.commitLayers(compiled);}
  putAuthoredObject(input:unknown){const object=authoredObjectSchema.parse(input),scene=this.layers.scene;if(scene.objects.find(o=>o.id===object.id)?.locked)throw Error('Object is locked');const compiled=compileMapScene({...this.map,authoring:{...scene,objects:[...scene.objects.filter(o=>o.id!==object.id),object]}},this.authoringAssets);this.layers.putObject(object);this.commitLayers(compiled);}
  removeLayerSelection(){if(this.layers.selection){this.layers.remove(this.layers.selection);this.cancelLayerShape();}this.commitLayers();}
  lockLayerSelection(locked:boolean){if(this.layers.selection){this.layers.setLocked(this.layers.selection,locked);if(locked)this.cancelLayerShape();}this.commitLayers();}
  bakeSelectedLayer(){if(this.layers.selection?.kind!=='layer'||!this.generatedScene)throw Error('Select a generated layer');this.layers.bake(this.layers.selection.id,this.generatedScene);this.cancelLayerShape();this.commitLayers();}
  undoLayers(redo=false){if(redo)this.layers.redo();else this.layers.undo();if(this.paintingLayer){const l=this.layers.scene.layers.find(l=>l.id===this.paintingLayer!.id);this.paintingLayer=l?structuredClone(l):{...this.paintingLayer,shape:{type:'mask',elevation:-.6,strokes:[]}};}this.commitLayers();}
  private commitLayers(compiled?:CompiledMapScene){this.map={...this.map,authoring:this.layers.scene};if(compiled)rememberProjectScene(this.map,compiled);this.paint();this.hooks.onChange?.();this.hooks.onSelect?.();}
  authoringCamera(mode:'top'|'free'|'game'){
    const camera=this.renderer?.camera;if(!camera)return;this.gameCam=mode==='game';camera.setGame(this.gameCam,this.map.size);
    if(mode==='top')camera.setTopDown();else if(mode==='free')camera.pose({pitch:ISO_PITCH,yaw:ISO_YAW});
    this.hooks.onView?.();this.draw();
  }
  get isDrawingLayer(){return this.drawingLayer!==null;}
  beginNewLayer(recipeId:string,name:string,mode:'line'|'curve'='curve'){
    this.paintingLayer=null;this.curveDrawing=mode==='curve';
    const recipe=this.authoringAssets.find(a=>a.id===recipeId)?.recipe;
    if(!recipe)throw Error('Missing recipe '+recipeId);
    this.layers.selection=null;
    this.drawingLayer={id:'layer.'+crypto.randomUUID(),name,recipe:recipeId,seed:1,enabled:true,visible:true,locked:false,order:this.layers.scene.layers.length,
      shape:['river','path'].includes(recipe.type)?{type:'spline',knots:[]}:{type:'region',points:[]}};
    this.setTool(null);this.authoringCamera('top');this.hooks.onSelect?.();
  }
  beginLayerShape(id:string){const layer=this.layers.scene.layers.find(l=>l.id===id);if(!layer)throw Error('Layer not found');if(layer.shape.type==='mask'){this.beginLayerPaint(layer.recipe,layer.name,id);return;}if(layer.locked)throw Error('Layer is locked');this.paintingLayer=null;this.drawingLayer=structuredClone(layer);this.drawingLayer.shape=layer.shape.type==='region'?{type:'region',points:[]}:{type:'spline',knots:[]};this.setTool(null);this.authoringCamera('top');}
  finishLayerShape(){if(!this.drawingLayer)return;const shape=this.drawingLayer.shape;if(shape.type==='region'&&shape.points.length<3)throw Error('Click at least three points to draw a region.');if(shape.type==='spline'&&shape.knots.length<2)throw Error('Click at least two points to draw a river.');const parsed=proceduralLayerSchema.parse(this.drawingLayer);this.putLayer(parsed);this.drawingLayer=null;this.selectLayer({kind:'layer',id:parsed.id});}
  cancelLayerShape(){this.drawingLayer=null;this.paintingLayer=null;this.paintStrokeStarted=false;this.layerCursor=null;if(this.tool===null)this.tool='select';this.paint();}
  shapeScreenPoint(x:number,z:number){return this.renderer?.screenPoint(x,this.compiledScene?.field.sample(x,z)??0,z);}
  shapeWorldPoint(clientX:number,clientY:number){return this.renderer?.pickGround(clientX,clientY);}
  previewLayerShape(shape:ProceduralLayer['shape']){this.renderer?.previewCurve(shape.type==='mask'?[]:shape.type==='region'?[...shape.points,shape.points[0]!]:sampleBezier(shape.knots));}
  private compiledMap():CompiledMapScene{
    const keys=sceneInputs(this.map);
    if(!this.compiledScene||keys.some((v,i)=>v!==this.compiledInputs[i])){this.compiledScene=projectScene(this.map)??compileMapScene(this.map,this.authoringAssets);this.compiledInputs=keys;this.renderer?.setTerrain(this.compiledScene.field);}
    return this.compiledScene;
  }
  spawnPlayer = 1;
  entityDefinition = content.definitions.find((d) => d.kind === "unit")!.id;
  entityOwner: Owner = "player.1";
  selectedEntity: string | null = null;
  entityMessage = "";
  private entityUndo: EntityAuthoringState[] = [];
  private entityRedo: EntityAuthoringState[] = [];
  private entityDragging = false;
  private dragEntityId = 0;
  private pendingEntity: UtcMap['entities'][number] | null = null;
  private stampDrag: {original:MapStamp;pending:MapStamp;object?:AuthoredObject} | null = null;
  private paintedMap: UtcMap | null = null;
  private entityOffset = { x: 0, y: 0 };
  private entityViews = editorEntities(this.map);
  setMission(mission:MissionDefinition|undefined,camps=this.map.camps){
    if(mission && this.map.sandbox) throw new Error("A testbed cannot also be a campaign mission.");
    const next={...this.map,camps,mission:mission ? missionSchema.parse(mission):undefined};
    if(!mission && !next.sandbox && next.playerStarts.length<2) throw new Error("Skirmish maps need at least two player starts.");
    validatePlacements(next,content);this.commitEntities(next);
  }
  renameEntity(id:string,nextId:string){this.commitEntities(renameEntity(this.map,id,nextId));this.selectEntity(nextId);}
  putEntity(raw: unknown) {
    this.commitEntities(putEntity(this.map, raw));
  }
  private commitEntities(map: UtcMap) {
    this.entityUndo.push(entityAuthoringState(this.map));
    this.entityUndo = this.entityUndo.slice(-64);
    this.entityRedo = [];
    this.map = map;
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
  }
  undoEntity(redo = false) {
    const source = redo ? this.entityRedo : this.entityUndo,
      target = redo ? this.entityUndo : this.entityRedo,
      next = source.pop();
    if (!next) return;
    target.push(entityAuthoringState(this.map));
    this.map = restoreEntityAuthoring(this.map, next);
    this.selectedEntity = null;
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
  }
  removeEntity(id: string) {
    this.commitEntities(deleteEntity(this.map, id));
    if (this.selectedEntity === id) this.selectedEntity = null;
  }
  selectEntity(id: string | null) {
    this.selectedEntity = id;
    this.select.clear();
    this.paint();
    this.hooks.onSelect?.();
  }
  selectedPlacement() {
    return this.map.entities.find((p) => p.id === this.selectedEntity) ?? null;
  }

  spawnMessage = "";
  tool: EditorTool | null = "select";
  asset: string | null = null;
  terrainMode:
    | "terrain"
    | "river"
    | "shallows"
    | "raise"
    | "cover"
    | "foliage"
    | "smooth"
    | "flatten"
    | "hill"
    | "plateau"
    | "ramp"
    | "basin" = "terrain";
  terrainLayer: TerrainLayer = "sand";
  private terrainSize = readBrushSize("terrain", 64);
  get terrainRadius(): number {
    return this.terrainSize;
  }
  set terrainRadius(n: number) {
    if (Number.isFinite(n)) {
      this.terrainSize = Math.max(1, Math.min(64, n));
      saveBrushSize("terrain", this.terrainSize);
    }
  }
  decalKind: DecalKind = "leaf-litter";
  decalSize = readBrushSize("decal");
  decalRotation = 0;
  decalOpacity = 1;
  decalMode: "place" | "select" | "erase" = "place";
  selectedDecal: string | null = null;
  private lastDecalPoint: { x: number; z: number } | null = null;
  terrainAspect = 1;
  terrainRotation = 0;
  terrainDepth = 1.4;
  terrainCurve = false;
  private terrainPoints: CurvePoint[] = [];
  stampYaw = 0;
  gridMenu = false;
  gridMode: GridMode = "none";
  gameCam = false;
  readonly brush = new BrushMask();
  readonly kit = new BrushKit();
  readonly clean = new CleanTool();
  height = new HeightField();
  readonly sculpt = new SculptTool();
  readonly select = new SelectTool();
  private urls = new Map<string, string>();
  private kinds = new Map<string, AssetType>();
  private renderer: Renderer | null = null;

  get sky() {
    return this.renderer?.sky ?? null;
  }
  private layerMenu: LayerContextMenu | null = null;
  private input: MapInput | null = null;
  private mini: Minimap | null = null;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly hooks: {
      host: HTMLElement;
      onChange?: () => void;
      onNeedAsset?: () => void;
      onView?: () => void;
      onBrush?: () => void;
      onClean?: () => void;
      onSculpt?: () => void;
      onSelect?: () => void;
    },
  ) {
    this.brush.setRadius(readBrushSize("brush"));
    this.clean.setRadius(readBrushSize("clean"));
    this.sculpt.setRadius(readBrushSize("sculpt"));
  }

  replace(map: UtcMap): void {
    this.layerMenu?.close();
    this.finishGrab(true);this.paintedMap=null;
    this.map = map;
    this.layers=new AuthoringHistory(map.authoring??{version:1,layers:[],objects:[]});this.compiledScene=null;this.drawingLayer=null;this.paintingLayer=null;
    this.entityUndo = [];
    this.entityRedo = [];
    this.selectedEntity = null;
    this.select.clear();
    this.selectedDecal = null;
    this.loadHeight(map);
    this.renderer?.setTerrain(this.height);
    this.renderer?.setLandscape(this.map.landscape ?? emptyLandscape());
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
  }

  rename(name: string): void {
    const next = name.trim() || DEFAULT_MAP_NAME;
    if (next === this.map.name) return;
    this.map = { ...this.map, name: next };
    this.hooks.onChange?.();
  }

  setLibrary(
    urls: ReadonlyMap<string, string>,
    kinds?: ReadonlyMap<string, AssetType>,
  ): void {
    this.urls = new Map(urls);
    if (kinds) this.kinds = new Map(kinds);
    this.renderer?.setAssets(this.urls);
    this.renderer?.setKinds(this.kinds);
    this.paintedMap=null;this.paint();
  }

  setTool(tool: EditorTool | null): void {
    this.tool = tool;
    if (tool !== "select") this.select.clear();
    if (tool !== "select" && tool !== "entity") this.selectedEntity = null;
    if (tool === "brush" || tool === "clean" || tool === "sculpt")
      this.gridMenu = false;
    this.syncPaintView();
    this.paint();
    this.hooks.onSelect?.();
  }

  sceneryAllowed(asset:string,x:number,z:number):boolean {
    return isBridgeAsset(asset) || sitAllowed(this.kinds.get(asset),this.height.wet(x,z));
  }

  setAsset(id: string): void {
    this.asset = id;
    if (this.tool === null) this.tool = "stamp";
  }

  rotateStamp(steps = 1): void {
    if (this.selectedEntity || this.layers.selection?.kind === 'object') {
      this.nudgeSelected((steps * Math.PI) / 2);
      return;
    }
    if (this.tool === "select" && this.select.id) {
      this.nudgeSelected(steps * (Math.PI / 2));
      return;
    }
    this.stampYaw =
      ((Math.round(this.stampYaw / (Math.PI / 2)) + steps) % 4) * (Math.PI / 2);
  }

  nudgeSelected(delta: number): void {
    if (this.layers.selection?.kind === 'object') {
      const object = this.layers.scene.objects.find(o => o.id === this.layers.selection?.id);
      if (object && !object.locked) this.putAuthoredObject({...object,yaw:stepYaw(object.yaw,delta)});
      return;
    }
    const p = this.selectedPlacement();
    if (p) {
      this.putEntity({
        ...p,
        rotation: stepYaw(p.rotation * Math.PI / 180,delta) * 180 / Math.PI,
      });
      return;
    }
    const stamp = this.selectedStamp();
    if (!stamp) return;
    this.applyPose(stamp, stamp.x, stamp.y, stepYaw(stamp.yaw ?? 0,delta));
  }

  setSelectedYaw(rad: number): void {
    const stamp = this.selectedStamp();
    if (!stamp) return;
    this.applyPose(stamp, stamp.x, stamp.y, rad);
  }

  deleteSelected(): void {
    if (this.selectedEntity) {
      this.removeEntity(this.selectedEntity);
      return;
    }
    const id = this.select.id;
    if (!id) return;
    this.map = {
      ...this.map,
      stamps: this.map.stamps.filter((s) => s.id !== id),
    };
    this.select.clear();
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
  }

  setStampWalk(id:string,raw:unknown):void {
    const walk=raw===null?undefined:walkStampSchema.parse(raw);
    if(!this.map.stamps.some(s=>s.id===id))throw new Error('Unknown walk surface stamp');
    this.map={...this.map,stamps:this.map.stamps.map(s=>{
      if(s.id!==id)return s;
      const {walk:previous,...base}=s;return {...base,...(walk?{walk}:{})};
    })};
    this.paint();this.hooks.onChange?.();this.hooks.onSelect?.();
  }
  selectedStamp(): MapStamp | null {
    const id = this.select.id;
    return id ? (this.map.stamps.find((s) => s.id === id) ?? null) : null;
  }

  toggleGridMenu(): void {
    this.gridMenu = !this.gridMenu;
    if (
      this.gridMenu &&
      (this.tool === "brush" || this.tool === "clean" || this.tool === "sculpt")
    )
      this.setTool("stamp");
  }

  setGridMode(mode: GridMode): void {
    this.gridMode = mode;
    if (mode === "none") this.gridMenu = false;
    this.renderer?.setGridMode(mode);
    this.draw();
  }

  toggleGameCam(): void {
    this.setGameCam(!this.gameCam);
  }

  setGameCam(on: boolean): void {
    this.gameCam = on;
    this.renderer?.camera.setGame(on,this.map.size);
    if (on) this.sky?.setDaySeconds(DAY_CYCLE_SECONDS);
    // Keep the current time on entry/exit instead of jumping to the saved hour.
    this.environment({
      hour: this.sky?.hour ?? this.map.landscape?.environment.hour ?? 9.5,
      playing: on,
    });
    this.draw();
    this.hooks.onView?.();
  }

  setBrushRadius(n: number): void {
    this.brush.setRadius(n);
    saveBrushSize("brush", this.brush.radius);
    this.hooks.onBrush?.();
  }

  setBrushDensity(n: number): void {
    this.brush.setDensity(n);
    this.hooks.onBrush?.();
  }

  setCleanRadius(n: number): void {
    this.clean.setRadius(n);
    saveBrushSize("clean", this.clean.radius);
    this.hooks.onClean?.();
  }

  setCleanType(type: CleanTool["type"]): void {
    this.clean.setType(type);
    this.hooks.onClean?.();
  }

  setSculptRadius(n: number): void {
    this.sculpt.setRadius(n);
    saveBrushSize("sculpt", this.sculpt.radius);
    this.hooks.onSculpt?.();
  }

  setSculptStrength(n: number): void {
    this.sculpt.setStrength(n);
    this.hooks.onSculpt?.();
  }

  setSculptMode(mode: SculptMode): void {
    this.sculpt.setMode(mode);
    this.syncPaintView();
    this.hooks.onSculpt?.();
  }

  applySculpt(): void {
    const dirty = this.sculpt.applyWater(this.height);
    if (!dirty) return;
    this.commitHeight();
    this.renderer?.setTerrain(this.height, dirty);
    this.mini?.setHeight(this.height);
    this.syncPaintView();
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSculpt?.();
  }

  applyBrush(): void {
    if (!this.kit.slots.length) {
      this.hooks.onNeedAsset?.();
      return;
    }
    const poses = scatterBrush(
      this.brush,
      this.map.stamps,
      this.kit.slots,
      Math.random,
      {
        wet: (x, z) => this.height.wet(x, z),
        kind: (id) => this.kinds.get(id),
      },
    );
    if (!poses.length) return;
    this.map = {
      ...this.map,
      stamps: [
        ...this.map.stamps,
        ...poses.map((p) => ({
          id: crypto.randomUUID(),
          asset: p.asset,
          x: p.x,
          y: p.y,
          yaw: p.yaw,
          ...(p.scale !== 1 ? { scale: p.scale } : {}),
        })),
      ],
    };
    this.brush.clear();
    this.syncPaintView();
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onBrush?.();
  }

  /** Programmatic stamp. Cell coords. Rejects unknown sit / out of halo. */
  placeAt(
    asset: string,
    x: number,
    y: number,
    yaw?: number,
    scale?: number,
    elevation?: number,
    variant?: MapStamp["variant"],
    snap = true,
  ): MapStamp | null {
    const cx = snap ? Math.floor(x) : x;
    const cy = snap ? Math.floor(y) : y;
    if (!inStamp(cx, cy,this.map.size)) return null;
    if (!this.sceneryAllowed(asset,cx+.5,cy+.5))
      return null;
    const stamp: MapStamp = {
      id: crypto.randomUUID(),
      asset,
      x: cx,
      y: cy,
      ...(yaw ? { yaw } : {}),
      ...(scale !== undefined && scale !== 1 ? { scale } : {}),
      ...(elevation !== undefined ? { elevation } : {}),
      ...(variant ? { variant } : {}),
    };
    this.map = { ...this.map, stamps: [...this.map.stamps, stamp] };
    this.paint();
    this.hooks.onChange?.();
    return stamp;
  }

  clearTerrainCurve(): void {
    this.terrainPoints = [];
    this.renderer?.previewCurve([]);
  }
  applyTerrainCurve(): void {
    if (!this.terrainPoints.length) return;
    if(this.terrainMode === "plateau"){
      if(this.terrainCurve)this.tacticalTerrain("plateau",this.terrainPoints,this.terrainDepth,this.terrainRadius);
      else for(const p of this.terrainPoints){
        const outline=Array.from({length:32},(_,i)=>({x:p.x+Math.cos(i*Math.PI/16)*this.terrainRadius,z:p.z+Math.sin(i*Math.PI/16)*this.terrainRadius}));
        this.tacticalTerrain("plateau",outline,this.terrainDepth,this.terrainRadius);
      }
    } else if(this.terrainMode === "ramp")this.tacticalTerrain("ramp",this.terrainPoints,this.terrainDepth,this.terrainRadius);
    else if (
      this.terrainMode === "hill" ||
      this.terrainMode === "basin"
    ) {
      const p = this.terrainPoints[0]!;
      this.landform({
        x: p.x,
        z: p.z,
        radiusX: this.terrainRadius,
        radiusZ: this.terrainRadius * this.terrainAspect,
        height: this.terrainDepth * (this.terrainMode === "basin" ? -1 : 1),
        rotation: (this.terrainRotation * Math.PI) / 180,
        plateau: 0,
        roughness: 0.08,
        seed: 42,
      });
    } else
      this.curveStroke({
        points: this.terrainPoints,
        radius: this.terrainRadius,
        depth: this.terrainDepth,
        mode: this.terrainMode,
        layer: this.terrainLayer,
      });
    this.clearTerrainCurve();
  }
  private addTerrainPoint(x: number, z: number): void {
    const prev = this.terrainPoints.at(-1);
    if (prev && Math.hypot(x - prev.x, z - prev.z) < 0.5) return;
    if (this.terrainPoints.length >= 128) return;
    this.terrainPoints.push({ x, z, radius: this.terrainRadius });
    this.renderer?.previewCurve(
      sampleCurve(this.terrainPoints, this.terrainRadius),
    );
  }

  curveStroke(opts: {
    points: CurvePoint[];
    radius: number;
    mode: "river" | "shallows" | "terrain" | "cover" | "foliage" | "raise" | "smooth" | "flatten";
    depth?: number;
    layer?: TerrainLayer;
    opacity?: number;
  }): void {
    const samples = sampleCurve(opts.points, opts.radius);
    if (opts.mode === "river" || opts.mode === "shallows") {
      const landscape = this.map.landscape ?? emptyLandscape();
      this.map = {
        ...this.map,
        landscape: {
          ...landscape,
          rivers: [
            ...(landscape.rivers ?? []),
            {
              points: opts.points,
              radius: opts.radius,
              depth: opts.mode === "shallows" ? .32 : opts.depth ?? 1.4,
            },
          ],
        },
      };
    }
    if (opts.mode === "terrain") {
      const landscape = this.map.landscape ?? emptyLandscape();
      this.map = {
        ...this.map,
        landscape: {
          ...landscape,
          strokes: [
            ...landscape.strokes,
            {
              points: opts.points,
              radius: opts.radius,
              layer: opts.layer ?? "sand",
              opacity: opts.opacity ?? 1,
            },
          ],
        },
      };
    } else if (opts.mode === "cover") {
      const landscape=this.map.landscape??emptyLandscape();
      this.map={...this.map,landscape:{...landscape,cover:[...landscape.cover,...forestCoverStroke(opts.points,opts.radius)]}};
    } else if (opts.mode === "foliage") {
      for (const p of samples) {
        this.brush.setRadius(p.radius);
        this.dabBrush(p.x, p.z);
      }
      this.applyBrush();
    } else {
      const original = this.height.samples.slice();
      for (let iz = 0; iz < this.height.verts; iz++)
        for (let ix = 0; ix < this.height.verts; ix++) {
          const d = curveDistance(
            ix + this.height.origin,
            iz + this.height.origin,
            samples,
          );
          if (d >= 1) continue;
          const i = iz * this.height.verts + ix;
          const w = (1 - d * d) ** 2;
          if (opts.mode === "river" || opts.mode === "shallows") {
            // Constant riverbed depth along the centerline; overlapping dabs never dig holes.
            const bank = Math.max(0, Math.min(1, (d - 0.68) / 0.32));
            const blend = bank * bank * (3 - 2 * bank);
            const channel =
              this.height.waterLevel -
              (opts.mode === "shallows" ? .32 : opts.depth ?? 1.4) * Math.max(0, 1 - (d / 0.68) ** 2);
            const target =
              d < 0.68
                ? channel
                : this.height.waterLevel +
                  (original[i]! - this.height.waterLevel) * blend;
            this.height.samples[i] = opts.mode === "shallows" ? target : Math.min(original[i]!, target);
          } else if (opts.mode === "smooth") {
            let sum = 0,
              count = 0;
            for (let dz = -2; dz <= 2; dz++)
              for (let dx = -2; dx <= 2; dx++) {
                const nx = ix + dx,
                  nz = iz + dz;
                if (
                  nx >= 0 &&
                  nz >= 0 &&
                  nx < this.height.verts &&
                  nz < this.height.verts
                ) {
                  sum += original[nz * this.height.verts + nx]!;
                  count++;
                }
              }
            this.height.samples[i] =
              original[i]! + (sum / count - original[i]!) * w;
          } else if (opts.mode === "flatten")
            this.height.samples[i] =
              original[i]! + ((opts.depth ?? 1) - original[i]!) * w;
          else
            this.height.samples[i] = Math.min(
              24,
              Math.max(-16, this.height.samples[i]! + (opts.depth ?? 1) * w),
            );
        }
      this.commitHeight();
      this.renderer?.setTerrain(this.height);
    }
    this.renderer?.setLandscape(this.map.landscape ?? emptyLandscape());
    this.paint();
    this.hooks.onChange?.();
  }

  addCover(patch: CoverPatch): void {
    const landscape = this.map.landscape ?? emptyLandscape();
    this.map = {
      ...this.map,
      landscape: { ...landscape, cover: [...landscape.cover, patch] },
    };
    this.renderer?.setLandscape(this.map.landscape!);
    this.hooks.onChange?.();
    this.paint();
  }

  waterStyle(settings: WaterStyle): void {
    const landscape = this.map.landscape ?? emptyLandscape();
    this.map = {
      ...this.map,
      landscape: {
        ...landscape,
        water: { ...DEFAULT_WATER_STYLE, ...settings },
      },
    };
    this.renderer?.setLandscape(this.map.landscape!);
    this.hooks.onChange?.();
    this.paint();
  }

  environment(settings: Partial<EnvironmentState>): void {
    if(settings.canopy)canopySchema.parse(settings.canopy);
    if(settings.atmosphere)atmosphereSchema.parse(settings.atmosphere);
    const landscape = this.map.landscape ?? emptyLandscape();
    // Keep the live clock when editing weather/season rather than rewinding to
    // the hour last stored in the map. An explicit time edit still wins.
    const environment = { ...landscape.environment, hour: this.sky?.hour ?? landscape.environment.hour, ...settings };
    this.map = { ...this.map, landscape: { ...landscape, environment } };
    this.renderer?.setLandscape(this.map.landscape!);
    this.hooks.onChange?.();
    this.paint();
  }

  putDecal(decal: GroundDecal): void {
    if (!validDecal(decal)) throw new Error("Invalid decal");
    const landscape = this.map.landscape ?? emptyLandscape(),
      existing = landscape.decals ?? [];
    if (existing.length >= 2048 && !existing.some((d) => d.id === decal.id))
      throw new Error("Decal limit reached");
    const decals = existing.some((d) => d.id === decal.id)
      ? existing.map((d) => (d.id === decal.id ? decal : d))
      : [...existing, decal];
    this.map = { ...this.map, landscape: { ...landscape, decals } };
    this.renderer?.setLandscape(this.map.landscape!);
    this.paint();
    this.hooks.onChange?.();
  }
  removeDecal(id: string): void {
    const landscape = this.map.landscape ?? emptyLandscape();
    this.map = {
      ...this.map,
      landscape: {
        ...landscape,
        decals: (landscape.decals ?? []).filter((d) => d.id !== id),
      },
    };
    if (this.selectedDecal === id) this.selectedDecal = null;
    this.renderer?.setLandscape(this.map.landscape!);
    this.paint();
    this.hooks.onChange?.();
  }
  configureDecal(
    settings: Partial<
      Pick<GroundDecal, "kind" | "size" | "rotation" | "opacity">
    >,
  ): void {
    const d = {
      id: "preview",
      x: 0,
      z: 0,
      kind: this.decalKind,
      size: this.decalSize,
      rotation: this.decalRotation,
      opacity: this.decalOpacity,
      ...settings,
    };
    if (!validDecal(d)) throw new Error("Invalid decal settings");
    this.decalKind = d.kind;
    this.decalSize = d.size;
    this.decalRotation = d.rotation;
    this.decalOpacity = d.opacity;
    saveBrushSize("decal", d.size);
    const selected = this.map.landscape?.decals?.find(
      (d) => d.id === this.selectedDecal,
    );
    if (this.decalMode === "select" && selected)
      this.putDecal({ ...selected, ...settings });
    this.hooks.onView?.();
  }
  private decalStroke(x: number, z: number, erase: boolean): void {
    if (erase || this.decalMode === "erase") {
      const d = decalAt(this.map.landscape?.decals ?? [], x, z);
      if (d) this.removeDecal(d.id);
      return;
    }
    if (this.decalMode === "select") {
      const d = decalAt(this.map.landscape?.decals ?? [], x, z);
      this.selectedDecal = d?.id ?? null;
      if (d) {
        this.decalKind = d.kind;
        this.decalSize = d.size;
        this.decalRotation = d.rotation;
        this.decalOpacity = d.opacity;
      }
      this.hooks.onView?.();
      return;
    }
    if (
      this.lastDecalPoint &&
      Math.hypot(x - this.lastDecalPoint.x, z - this.lastDecalPoint.z) <
        this.decalSize * 0.6
    )
      return;
    this.lastDecalPoint = { x, z };
    this.putDecal({
      id: crypto.randomUUID(),
      x,
      z,
      kind: this.decalKind,
      size: this.decalSize,
      rotation: this.decalRotation,
      opacity: this.decalOpacity,
    });
  }

  tacticalTerrain(mode:"plateau"|"ramp",points:readonly CurvePoint[],height:number,radius:number):void {
    if(mode==="plateau")sculptPlateau(this.height,points,height);
    else sculptRamp(this.height,points,radius);
    this.commitHeight();
    this.renderer?.setTerrain(this.height);
    this.mini?.setHeight(this.height);
    this.paint();this.hooks.onChange?.();
  }

  landform(shape: Landform): void {
    applyLandform(this.height, shape);
    this.commitHeight();
    this.renderer?.setTerrain(this.height);
    this.paint();
    this.hooks.onChange?.();
  }

  terrainBase(height: number): void {
    this.height.samples.fill(height);
    this.commitHeight();
    this.renderer?.setTerrain(this.height);
    this.paint();
    this.hooks.onChange?.();
  }

  async ready(): Promise<void> {
    await this.renderer?.ready();
    await this.renderer?.gameReady();
  }

  diagnostics() {
    return this.renderer?.diagnostics();
  }

  lookAt(x: number, z: number): void {
    this.renderer?.camera.lookAt(x, z);
    this.draw();
  }

  view(): EditorView {
    const cam = this.renderer?.camera;
    return {
      x: cam?.targetX ?? this.map.size / 2,
      z: cam?.targetZ ?? this.map.size / 2,
      gameCam: this.gameCam,
      zoom: cam?.zoom ?? 28,
      gameZoom: cam?.gameZoom ?? 1,
      yaw: cam?.yaw ?? ISO_YAW,
      pitch: cam?.pitch ?? ISO_PITCH,
    };
  }

  /**
   * Present + PNG/JPEG of the live canvas. Optional pose is applied for the shot
   * then restored unless `keep` — WebGL has no preserveDrawingBuffer.
   */
  landmarks(aspect: number, ids?: readonly string[]) {
    return this.renderer?.landmarks(aspect, ids) ?? [];
  }
  screenshot(opts: EditorShotOpts = {}): EditorShot {
    const renderer = this.renderer;
    if (!renderer) throw new Error("editor not started");
    const cam = renderer.camera;
    const snap = {
      x: cam.targetX,
      z: cam.targetZ,
      zoom: cam.zoom,
      yaw: cam.yaw,
      pitch: cam.pitch,
      game: this.gameCam,
      gameZoom: cam.gameZoom,
    };
    const posed =
      opts.x !== undefined ||
      opts.z !== undefined ||
      opts.zoom !== undefined ||
      opts.gameZoom !== undefined ||
      opts.yaw !== undefined ||
      opts.pitch !== undefined ||
      opts.gameCam !== undefined ||
      opts.iso === true;
    if (posed) {
      if (opts.gameCam !== undefined) {
        this.gameCam = opts.gameCam;
        cam.setGame(opts.gameCam,this.map.size);
      }
      cam.pose({
        x: opts.x,
        z: opts.z,
        zoom: opts.zoom,
        gameZoom: opts.gameZoom,
        yaw: opts.iso ? (opts.yaw ?? ISO_YAW) : opts.yaw,
        pitch: opts.iso ? (opts.pitch ?? ISO_PITCH) : opts.pitch,
      });
    }
    this.draw();
    const frame = grabFrame(
      opts.aspect !== undefined || opts.animationTime !== undefined
        ? renderer.capture(
            opts.maxWidth ?? 1600,
            opts.aspect ?? this.canvas.width / Math.max(1, this.canvas.height),
            opts.animationTime,
          )
        : this.canvas,
      opts.maxWidth ?? 1280,
      opts.format ?? "jpeg",
      opts.quality ?? 0.85,
    );
    const view = this.view();
    if (posed && !opts.keep) {
      this.gameCam = snap.game;
      cam.setGame(snap.game,this.map.size);
      cam.pose(snap);
      this.draw();
    } else if (posed && opts.keep) {
      this.hooks.onView?.();
    }
    return { ...frame, view };
  }

  pickStamp(id: string | null): void {
    this.setTool("select");
    this.select.select(
      id && this.map.stamps.some((s) => s.id === id) ? id : null,
    );
    this.paint();
    this.hooks.onSelect?.();
  }

  moveStamp(
    id: string,
    x: number,
    y: number,
    yaw?: number,
    snap = true,
    pitch?: number,
    roll?: number,
    heightScale?: number,
    widthScale?: number,
    depthScale?: number,
  ): boolean {
    const stamp = this.map.stamps.find((s) => s.id === id);
    if (!stamp) return false;
    const prev = this.map;
    if (
      [heightScale, widthScale, depthScale].some(
        (v) => v !== undefined && (!Number.isFinite(v) || v < 0.25 || v > 4),
      )
    )
      return false;
    if (
      [pitch, roll].some(
        (a) =>
          a !== undefined && (!Number.isFinite(a) || Math.abs(a) > Math.PI / 2),
      )
    )
      return false;
    this.applyPose(
      {
        ...stamp,
        ...(pitch !== undefined ? { pitch } : {}),
        ...(roll !== undefined ? { roll } : {}),
        ...(heightScale !== undefined ? { heightScale } : {}),
        ...(widthScale !== undefined ? { widthScale } : {}),
        ...(depthScale !== undefined ? { depthScale } : {}),
      },
      snap ? Math.floor(x) : x,
      snap ? Math.floor(y) : y,
      yaw ?? stamp.yaw ?? 0,
    );
    return this.map !== prev;
  }

  removeStamp(id: string): boolean {
    if (!this.map.stamps.some((s) => s.id === id)) return false;
    this.map = {
      ...this.map,
      stamps: this.map.stamps.filter((s) => s.id !== id),
    };
    if (this.select.id === id) this.select.clear();
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
    return true;
  }

  dabBrush(wx: number, wz: number, erase = false): void {
    this.brush.beginStroke();
    this.brush.stroke(wx, wz, erase);
    this.syncPaintView();
    this.hooks.onBrush?.();
  }

  dabClean(wx: number, wz: number): void {
    this.clean.beginStroke();
    this.cleanAt(wx, wz);
  }

  private cleanAt(x: number, z: number): void {
    const hits = this.clean.strokeHits(x, z);
    const stamps = wipeStamps(
      this.map.stamps,
      hits,
      this.clean.radius,
      this.clean.type,
    );
    const landscape = this.map.landscape;
    const cover =
      this.clean.type === "foliage" && landscape
        ? eraseCover(landscape.cover, hits, this.clean.radius)
        : landscape?.cover;
    const changed =
      !!landscape && !!cover && cover.some((p, i) => p !== landscape.cover[i]);
    if (stamps.length === this.map.stamps.length && !changed) return;
    this.map = {
      ...this.map,
      stamps,
      ...(changed ? { landscape: { ...landscape!, cover: cover! } } : {}),
    };
    if (changed) this.renderer?.setLandscape(this.map.landscape!);
    this.paint();
    this.hooks.onChange?.();
  }

  dabSculpt(wx: number, wz: number, erase = false): void {
    this.sculpt.beginStroke();
    const dirty = this.sculpt.stroke(wx, wz, erase, this.height);
    if (this.sculpt.mode === "water") {
      this.syncPaintView();
      this.hooks.onSculpt?.();
      return;
    }
    if (dirty) {
      this.commitHeight();
      this.renderer?.setTerrain(this.height, dirty);
      this.mini?.setHeight(this.height);
      this.hooks.onChange?.();
    }
    this.hooks.onSculpt?.();
  }

  start(): void {
    const renderer = new Renderer(this.canvas, this.urls);
    this.renderer = renderer;this.paintedMap=null;
    renderer.setKinds(this.kinds);
    renderer.camera.locked = false;
    renderer.camera.lookAt(this.map.size / 2, this.map.size / 2);
    if (this.gameCam) renderer.camera.setGame(true,this.map.size);
    this.input = new MapInput(this.canvas, renderer.camera, {
      orbit: true,
      onChanged: () => this.draw(),
      onClick: (x, y) => this.click(x, y),
      onRightClick: (x,y) => this.openLayerMenu(x,y),
      onHome: () => this.toggleGameCam(),
      grab: {
        on: () => this.tool === "select",
        down: (x, y, shift) => this.grabDown(x, y, shift),
        move: (x, y) => this.grabMove(x, y),
        up: () => this.finishGrab(),
        cancel: () => this.finishGrab(true),
        rotateBy: (steps) => this.nudgeSelected(steps * YAW_STEP),
      },
      paint: {
        on: () =>
          this.isPaintingLayer || this.tool === "decal" ||
          this.tool === "brush" ||
          this.tool === "clean" ||
          this.tool === "sculpt" ||
          (this.tool === "terrain" && !this.terrainCurve),
        hover: (x, y) => {if(this.isPaintingLayer){const p=this.shapeWorldPoint(x,y);this.layerCursor=p?{x:p.x,z:p.z}:null;}else this.hover(x,y);},
        stroke: (x, y, erase) => this.isPaintingLayer?this.paintLayerAt(x,y,erase):this.stroke(x,y,erase),
        beginStroke: () => {
          if(this.isPaintingLayer){this.paintStrokeStarted=false;return;}
          this.lastDecalPoint = null;
          if (this.tool === "terrain") this.clearTerrainCurve();
          if (this.tool === "clean") this.clean.beginStroke();
          else if (this.tool === "sculpt") this.sculpt.beginStroke();
          else this.brush.beginStroke();
        },
        endStroke: () => this.isPaintingLayer?this.finishPaintStroke():this.endStroke(),
        sizeBy: (steps) => {
          if(this.isPaintingLayer){this.layerBrushSize=Math.max(1,Math.min(128,this.layerBrushSize+steps));this.hooks.onSelect?.();return;}
          if (this.tool === "decal") {
            this.configureDecal({
              size: Math.max(0.5, Math.min(32, this.decalSize + steps * 0.5)),
            });
            return;
          }
          if (this.tool === "clean") {
            this.setCleanRadius(this.clean.radius + steps * 0.5);
            this.hooks.onClean?.();
            return;
          }
          if (this.tool === "sculpt") {
            this.setSculptRadius(this.sculpt.radius + steps * 0.5);
            this.hooks.onSculpt?.();
            return;
          }
          this.setBrushRadius(this.brush.radius + steps * 0.5);
          this.hooks.onBrush?.();
        },
        densityBy: (steps) => {
          if (this.tool !== "brush") return;
          this.brush.densityBy(steps);
          this.hooks.onBrush?.();
        },
      },
    });
    this.mini = new Minimap(this.hooks.host, {
      camera: renderer.camera,
      clock: () => renderer.sky.snapshot(),
      viewport: () => ({
        w: this.canvas.clientWidth,
        h: this.canvas.clientHeight,
      }),
      onLookAt: (x, z) => {
        renderer.camera.lookAt(x, z);
        this.draw();
      },
    });
    renderer.setGridMode(this.gridMode);
    this.syncPaintView();
    renderer.setTerrain(this.compiledMap().field);
    renderer.setLandscape(this.map.landscape ?? emptyLandscape());
    this.paint();
    this.syncPaintView();
    void this.ready()
      .then(() => {
        if (this.renderer === renderer) {this.paintedMap=null;this.paint();}
      })
      .catch((error) => {
        this.entityMessage = `Asset loading failed: ${(error as Error).message}`;
        this.hooks.onSelect?.();
      });
  }

  tick(dtMs: number): void {
    this.input?.tick(dtMs);
    this.draw();
  }

  private openLayerMenu(clientX:number,clientY:number):void {
    const hit=this.renderer?.pickGround(clientX,clientY);
    if(!hit){this.layerMenu?.close();return;}
    const layers=hitLayers(this.layers.scene.layers,this.authoringAssets,hit.x,hit.z);
    this.layerMenu??=new LayerContextMenu(this.canvas);
    this.layerMenu.open(clientX,clientY,layers.map(layer=>({id:layer.id,name:layer.name,
      detail:(this.authoringAssets.find(a=>a.id===layer.recipe)?.name??layer.recipe)+(layer.locked?' · Locked':''),
      selected:this.layers.selection?.kind==='layer'&&this.layers.selection.id===layer.id,
    })),id=>this.selectLayer({kind:'layer',id}));
  }

  stop(): void {
    this.layerMenu?.close();this.layerMenu=null;
    this.input?.destroy();
    this.input = null;
    this.mini?.destroy();
    this.mini = null;
    this.renderer?.destroy();
    this.renderer = null;
  }

  private hover(clientX: number, clientY: number): void {
    const hit = this.renderer?.pickGround(clientX, clientY);
    const r =
      this.tool === "decal"
        ? this.decalSize / 2
        : this.tool === "terrain"
          ? this.terrainRadius
          : this.tool === "clean"
            ? this.clean.radius
            : this.tool === "sculpt"
              ? this.sculpt.radius
              : this.brush.radius;
    if (!hit) {
      this.renderer?.brush.setCursor(0, 0, r, false);
      return;
    }
    this.renderer?.brush.setCursor(hit.x, hit.z, r, true, hit.y);
  }

  private stroke(clientX: number, clientY: number, erase: boolean): void {
    const hit = this.renderer?.pickGround(clientX, clientY);
    if (!hit) return;
    if (this.tool === "decal") {
      this.decalStroke(hit.x, hit.z, erase);
      return;
    }
    if (this.tool === "terrain") {
      this.addTerrainPoint(hit.x, hit.z);
      return;
    }
    if (this.tool === "sculpt") {
      this.renderer?.brush.setCursor(
        hit.x,
        hit.z,
        this.sculpt.radius,
        true,
        hit.y,
      );
      const dirty = this.sculpt.stroke(hit.x, hit.z, erase, this.height);
      if (this.sculpt.mode === "water") {
        this.syncPaintView();
        this.hooks.onSculpt?.();
        return;
      }
      if (!dirty) return;
      this.renderer?.setTerrain(this.height, dirty, false);
      return;
    }
    if (this.tool === "clean") {
      this.renderer?.brush.setCursor(
        hit.x,
        hit.z,
        this.clean.radius,
        true,
        hit.y,
      );
      this.cleanAt(hit.x, hit.z);
      return;
    }
    this.brush.stroke(hit.x, hit.z, erase);
    this.renderer?.brush.setCursor(
      hit.x,
      hit.z,
      this.brush.radius,
      true,
      hit.y,
    );
    this.syncPaintView();
    this.hooks.onBrush?.();
  }

  private endStroke(): void {
    if (this.tool === "terrain" && !this.terrainCurve) {
      this.applyTerrainCurve();
      return;
    }
    if (this.tool !== "sculpt" || this.sculpt.mode !== "live") return;
    this.commitHeight();
    this.renderer?.setTerrain(this.height);
    this.mini?.setHeight(this.height);
    this.hooks.onChange?.();
  }

  private syncPaintView(): void {
    const layer = this.renderer?.brush;
    if (!layer) return;
    const water = this.tool === "sculpt" && this.sculpt.mode === "water";
    const foliage = this.tool === "brush";
    if (foliage) {
      layer.sync(this.brush.weights, this.brush.origin, this.brush.span);
      layer.setOpen(true);
      this.brush.dirty = false;
      return;
    }
    if (water) {
      layer.sync(
        this.sculpt.mask.weights,
        this.sculpt.mask.origin,
        this.sculpt.mask.span,
      );
      layer.setOpen(true);
      this.sculpt.mask.dirty = false;
      return;
    }
    layer.setOpen(false);
  }

  private grabDown(clientX: number, clientY: number, rotate: boolean): boolean {
    const resourceId = this.renderer?.pickStamp(clientX, clientY);
    const owner=resourceId?this.compiledScene?.owners.get(resourceId):undefined;
    const id =
        this.renderer?.pickGameEntity(clientX, clientY) ??
        (resourceId?.startsWith("resource-")
          ? Number(resourceId.slice(9))
          : null),
      p = id ? expandMap(this.map, content)[id - 1] : null;
    if (p) {
      if (!this.map.entities.some((e) => e.id === p.id)) {
        const generatedOwner=this.compiledScene?.owners.get(p.id);
        if(generatedOwner){this.selectLayer({kind:'layer',id:generatedOwner});return true;}
        if(this.map.authoring?.objects.some(o=>o.id===p.id))return this.beginObjectGrab(p.id,clientX,clientY,rotate);
        this.entityMessage = "Use the spawn tool to move setup members.";
        this.hooks.onSelect?.();
        return true;
      }
      this.selectEntity(p.id);
      const hit = this.renderer?.pickGround(clientX, clientY);
      if (hit) {
        this.entityOffset = {
          x: p.position.x - hit.x,
          y: p.position.y - hit.z,
        };
        this.entityDragging = true;this.dragEntityId=id!;
        this.pendingEntity = null;
      }
      return true;
    }
    this.selectedEntity = null;
    if(owner){this.selectLayer({kind:'layer',id:owner});return true;}
    if(resourceId&&this.map.authoring?.objects.some(o=>o.id===resourceId))return this.beginObjectGrab(resourceId,clientX,clientY,rotate);

    const stamp = this.hitStamp(clientX, clientY);
    if (!stamp) {
      const hit=this.renderer?.pickGround(clientX,clientY);
      const layer=hit?hitLayer(this.layers.scene.layers,this.authoringAssets,hit.x,hit.z):undefined;
      if(layer){this.selectLayer({kind:'layer',id:layer.id});return true;}
      this.layers.selection=null;
      this.select.clear();
      this.paint();
      this.hooks.onSelect?.();
      return false;
    }
    const hit = this.renderer?.pickGround(clientX, clientY);
    if (!hit) return false;
    this.layers.selection=null;
    this.select.begin(stamp, hit, rotate);
    this.stampDrag={original:stamp,pending:stamp};
    this.paint();
    this.hooks.onSelect?.();
    return true;
  }

  private beginObjectGrab(id:string,clientX:number,clientY:number,rotate:boolean):boolean {
    const object=this.map.authoring?.objects.find(o=>o.id===id);
    this.selectLayer({kind:'object',id});if(!object||object.locked)return true;
    const resource=expandMap(this.map,content).findIndex(p=>p.id===id);
    const stamp=this.compiledScene?.stamps.find(s=>s.id===id)??(resource>=0?resourceStamps(this.entityViews).find(s=>s.id===`resource-${resource+1}`):undefined);
    const hit=this.renderer?.pickGround(clientX,clientY);if(!stamp||!hit)return true;
    this.select.begin(stamp,hit,rotate);this.stampDrag={original:stamp,pending:stamp,object};
    this.renderer?.setSelected(stamp.id);return true;
  }

  private grabMove(clientX:number,clientY:number):void {
    const started=perf.start();try{this.previewGrab(clientX,clientY);}finally{perf.end('Editor drag preview',started);}
  }
  private previewGrab(clientX: number, clientY: number): void {
    const hit=this.renderer?.pickGround(clientX,clientY);if(!hit)return;
    if(this.entityDragging){
      const p=this.selectedPlacement();if(!p)return;
      const x=Math.round(hit.x+this.entityOffset.x),y=Math.round(hit.z+this.entityOffset.y);
      if(x<0||y<0||x>=this.map.size||y>=this.map.size)return;
      const previous=this.pendingEntity??p;if(previous.position.x===x&&previous.position.y===y)return;
      this.pendingEntity={...p,position:{...p.position,x,y}};
      const id=this.dragEntityId;
      const views=this.entityViews.map(e=>e.id===id?{...e,x,y}:e);
      this.renderer?.previewEditorEntities(authoredScene(views,this.map.size));
      const resource=resourceStamps(views.filter(e=>e.id===id))[0];if(resource)this.renderer?.previewEditorStamp(resource);
      return;
    }
    const drag=this.stampDrag,pose=this.select.drag(hit);if(!drag||!pose)return;
    if(!drag.object&&!this.sceneryAllowed(drag.original.asset,pose.x+.5,pose.y+.5))return;
    const next=withPose(drag.original,pose.x,pose.y,pose.yaw,this.map.size);if(!next)return;
    drag.pending=next;this.renderer?.previewEditorStamp(next);
  }

  /** One document transaction per gesture; previews never compile or autosave. */
  private finishGrab(cancel=false):void {
    const started=perf.start();try{this.commitGrab(cancel);}finally{perf.end('Editor drag commit',started);}
  }
  private commitGrab(cancel=false):void {
    const entity=this.pendingEntity,drag=this.stampDrag;
    this.pendingEntity=null;this.stampDrag=null;this.entityDragging=false;this.select.end();
    if(drag)this.renderer?.previewEditorStamp(drag.original);
    if(entity){this.renderer?.previewEditorEntities(authoredScene(this.entityViews,this.map.size));const id=expandMap(this.map,content).findIndex(p=>p.id===entity.id)+1;const resource=resourceStamps(this.entityViews.filter(e=>e.id===id))[0];if(resource)this.renderer?.previewEditorStamp(resource);}
    if(cancel)return;
    try{
      if(entity)this.putEntity(entity);
      if(drag&&(drag.pending.x!==drag.original.x||drag.pending.y!==drag.original.y||drag.pending.yaw!==drag.original.yaw)){
        if(drag.object)this.putAuthoredObject({...drag.object,x:drag.object.x+drag.pending.x-drag.original.x,z:drag.object.z+drag.pending.y-drag.original.y,yaw:drag.object.yaw+((drag.pending.yaw??0)-(withPose(drag.original,drag.original.x,drag.original.y,drag.original.yaw??0,this.map.size)?.yaw??0))});
        else this.applyPose(drag.original,drag.pending.x,drag.pending.y,drag.pending.yaw??0);
      }
    }catch(e){this.entityMessage=(e as Error).message;this.hooks.onSelect?.();}
  }

  private hitStamp(clientX: number, clientY: number): MapStamp | null {
    const id = this.renderer?.pickStamp(clientX, clientY);
    if (id) return this.map.stamps.find((s) => s.id === id) ?? null;
    const hit = this.renderer?.pickGround(clientX, clientY);
    if (!hit) return null;
    return nearestStamp(this.map.stamps, hit.x, hit.z);
  }

  private applyPose(stamp: MapStamp, x: number, y: number, yaw: number): void {
    if (
      !this.sceneryAllowed(stamp.asset,x+.5,y+.5)
    )
      return;
    const next = withPose(stamp, x, y, yaw,this.map.size);
    if (!next) return;
    this.map = {
      ...this.map,
      stamps: this.map.stamps.map((s) => (s.id === stamp.id ? next : s)),
    };
    this.paint();
    this.hooks.onChange?.();
    this.hooks.onSelect?.();
  }

  setSpawnPoint(player: number, x: number, z: number): void {
    if (!Number.isInteger(player) || player < 1 || player > 2)
      throw new Error("Choose Player 1 or Player 2");
    const map = {
      ...this.map,
      playerStarts: [
        ...(this.map.playerStarts ?? []).filter((s) => s.player !== player),
        {
          ...this.map.playerStarts.find((s) => s.player === player)!,
          player,
          x: Math.round(x),
          z: Math.round(z),
        },
      ].sort((a, b) => a.player - b.player),
    };
    const error = playableMapError(map, false);
    // A landscape study may still need the other player's start.
    if (error) {
      this.spawnMessage = error;
      this.hooks.onChange?.();
      return;
    }
    this.commitEntities(map);
    this.spawnMessage = `Player ${player} placed. Click again to move it.`;
    this.paint();
    this.hooks.onChange?.();
  }

  private click(clientX: number, clientY: number): void {
    if(this.drawingLayer){const p=this.renderer?.pickGround(clientX,clientY);if(!p)return;const shape=this.drawingLayer.shape;
      if(shape.type==='region')shape.points.push({x:p.x,z:p.z});else if(shape.type==='spline'){shape.knots.push({x:p.x,z:p.z,elevation:Math.max(-.6,this.height.waterLevel),widthScale:1,depthScale:1,flowScale:1});if(this.curveDrawing)for(let i=0;i<shape.knots.length;i++){const k=shape.knots[i]!,before=shape.knots[Math.max(0,i-1)]!,after=shape.knots[Math.min(shape.knots.length-1,i+1)]!,dx=(after.x-before.x)/6,dz=(after.z-before.z)/6;k.incoming={x:k.x-dx,z:k.z-dz};k.outgoing={x:k.x+dx,z:k.z+dz};}}
      this.previewLayerShape(shape);this.hooks.onSelect?.();return;}
    if (this.tool === "entity") {
      const hit = this.renderer?.pickGround(clientX, clientY);
      if (!hit) return;
      try {
        this.putEntity({
          id: crypto.randomUUID(),
          definition: this.entityDefinition,
          position: { x: Math.round(hit.x), y: Math.round(hit.z) },
          rotation: Math.round((this.stampYaw * 180) / Math.PI),
          owner: this.entityOwner,
        });
        this.entityMessage = "Placed. Select to move or edit.";
      } catch (e) {
        this.entityMessage = (e as Error).message;
      }
      this.hooks.onSelect?.();
      return;
    }

    if (this.tool === "spawn") {
      const hit = this.renderer?.pickGround(clientX, clientY);
      if (hit) this.setSpawnPoint(this.spawnPlayer, hit.x, hit.z);
      return;
    }
    if (this.tool === "terrain" && this.terrainCurve) {
      const p = this.renderer?.pickGround(clientX, clientY);
      if (p) this.addTerrainPoint(p.x, p.z);
      return;
    }
    if (this.tool !== "stamp") return;
    if (!this.asset) {
      this.hooks.onNeedAsset?.();
      return;
    }
    if (!this.renderer) return;
    const hit = this.renderer.pickGround(clientX, clientY);
    if (!hit) return;
    const x = Math.floor(hit.x);
    const y = Math.floor(hit.z);
    if (!inStamp(x, y,this.map.size)) return;
    if (!this.sceneryAllowed(this.asset,hit.x,hit.z))
      return;
    this.map = {
      ...this.map,
      stamps: [
        ...this.map.stamps,
        {
          id: crypto.randomUUID(),
          asset: this.asset,
          x,
          y,
          ...(this.stampYaw ? { yaw: this.stampYaw } : {}),
        },
      ],
    };
    this.paint();
    this.hooks.onChange?.();
  }

  private paint(): void {
    const compiled=this.compiledMap();
    if (this.select.id && !this.map.stamps.some((s) => s.id === this.select.id) && !this.stampDrag)
      this.select.clear();
    this.renderer?.setSpawnPoints(
      this.map.playerStarts ?? [],
      this.tool === "spawn",
    );
    this.renderer?.setSelected(this.tool === "select" ? this.select.id : null);
    const changed=this.paintedMap!==this.map;
    if(changed)this.entityViews = editorEntities(this.map);
    const stamps = [...compiled.stamps, ...resourceStamps(this.entityViews)];
    const selected = expandMap(this.map, content).findIndex(
      (p) => p.id === this.selectedEntity,
    );
    this.renderer?.gameSelect(selected >= 0 ? [selected + 1] : []);
    const selectedLayer=this.layers.scene.layers.find(l=>l.id===this.layers.selection?.id);
    if(selectedLayer)this.previewLayerShape(selectedLayer.shape);else this.renderer?.previewCurve([]);
    if(!changed)return;
    this.paintedMap=this.map;
    this.renderer?.draw(
      {
        tick: 0,
        size: this.map.size,
        settlement: authoredScene(this.entityViews,this.map.size),
      },
      stamps,
    );
    this.mini?.setHeight(compiled.field);
    this.mini?.setStamps(stamps);
    this.mini?.setLandscape(this.map.landscape);
    this.mini?.setFog(authoredScene(this.entityViews,this.map.size));
    this.mini?.setPlayerStarts(this.map.playerStarts ?? []);
    this.mini?.paint();
  }

  private loadHeight(map: UtcMap): void {
    if(this.height.size!==map.size){this.height=new HeightField(map.size);this.brush.resize(map.size);this.sculpt.mask.resize(map.size);}
    this.renderer?.camera.setGame(this.gameCam,map.size);
    const samples = map.height ? decodeHeight(map.height,map.size) : null;
    if (samples) this.height.load(samples, map.waterLevel ?? 0, map.landscape?.importedTerrain);
    else {
      this.height.clear();
      this.height.waterLevel = map.waterLevel ?? 0;
    }
  }

  private commitHeight(): void {
    const height = encodeHeight(this.height.samples,this.map.size);
    const waterLevel = this.height.waterLevel;
    this.map = {
      ...this.map,
      v: this.map.v,
      name: this.map.name,
      stamps: this.map.stamps,
      ...(waterLevel !== 0 ? { waterLevel } : {}),
      ...(height ? { height } : {}),
    };
  }

  private draw(): void {
    this.renderer?.present();
    this.mini?.paint();
  }
}

/** Same-turn grab — Display does not preserve the drawing buffer. */
function grabFrame(
  src: HTMLCanvasElement,
  maxWidth: number,
  format: "png" | "jpeg",
  quality: number,
): { data: string; mime: string; width: number; height: number } {
  const sw = src.width;
  const sh = src.height;
  if (sw < 1 || sh < 1) throw new Error("canvas has no pixels");
  const cap = Math.min(2048, Math.max(256, maxWidth));
  const scale = Math.min(1, cap / sw);
  const w = Math.max(1, Math.round(sw * scale));
  const h = Math.max(1, Math.round(sh * scale));
  const mime = format === "png" ? "image/png" : "image/jpeg";
  const q = Math.min(0.95, Math.max(0.4, quality));
  let dataUrl: string;
  if (w === sw && h === sh) {
    dataUrl = format === "png" ? src.toDataURL(mime) : src.toDataURL(mime, q);
  } else {
    const off = document.createElement("canvas");
    off.width = w;
    off.height = h;
    const ctx = off.getContext("2d");
    if (!ctx) throw new Error("2d context failed");
    ctx.drawImage(src, 0, 0, w, h);
    dataUrl = format === "png" ? off.toDataURL(mime) : off.toDataURL(mime, q);
  }
  const comma = dataUrl.indexOf(",");
  return {
    data: comma >= 0 ? dataUrl.slice(comma + 1) : dataUrl,
    mime,
    width: w,
    height: h,
  };
}
