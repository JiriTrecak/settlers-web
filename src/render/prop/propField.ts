import {bridgePlacementHeight} from '../../shared/map/bridgeSurface';
import {sceneryModels} from '../../shared/assets/models';
import type {ModelPlacement} from '../../shared/authoring/modelCatalogue';
import {transformedModel} from './modelTransform';
import {foliageWind,FoliageWindLayer} from './foliageWind';
import {referenceMaterialPlugin} from './referenceMaterial';
import {prepareReferencePlants} from './referencePlants';
import {ReferenceGround} from './referenceGround';
import {referenceTexture,macroUrl} from '../terrain/referenceTerrain';
import type {HeightField} from '../../shared/map/height';
import {ResinShimmerLayer} from './resinShimmer';
import type {SceneryCutaway} from '../visibility/sceneryCutaway';
import {batchStaticMaterials} from './staticBatch';
import {perf} from '../../debug/performance';
import { prepareVividFoliage, tintVividFoliage } from './vividLook';
import { prototypeBounds, prototypeGroundOffset } from './grounding';
/**
 * Stamp meshes in the scene. Loads each catalog glTF once, clones per placement.
 * Water-type assets sit on the sea plane, not the lakebed.
 */
import { Vector3, type Camera, InstancedMesh, Matrix4, Box3, BoxHelper, Object3D, Mesh, Color, MeshLambertMaterial, Texture, type Raycaster, type Scene } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MapStamp } from "../../shared";

/** An isolated editor alias preserves its original look without replacing map assets. */
export type PropModelOptions=ModelPlacement&{sourceAsset:string};

export class PropField {
  /** Raycast only nearby static bounds, then exact geometry. No scene-wide triangle scan. */
  cameraObstruction(ray:Raycaster):number {
    let distance=ray.far;
    const point=new Vector3();
    for(const root of this.placed.values()){
      const bounds=root.userData.cameraBounds as Box3|undefined;
      if(!bounds||!ray.ray.intersectBox(bounds,point)||point.distanceTo(ray.ray.origin)>distance)continue;
      for(const hit of ray.intersectObject(root,true))if(hit.distance<distance)distance=hit.distance;
    }
    return distance;
  }
  private readonly wind=new FoliageWindLayer();
  private readonly referenceGround=new ReferenceGround();
  private referenceMacro:import('three').Texture|undefined;
  private readonly resin=new ResinShimmerLayer();
  tick(now:number){this.wind.tick(now);this.resin.tick(now);}
  private readonly loader = new GLTFLoader().register(referenceMaterialPlugin);
  private readonly protos = new Map<string, Promise<Object3D | null>>();
  private readonly placed = new Map<string, Object3D>();
  private batches: InstancedMesh[]=[];
  private warmMeshes: InstancedMesh[]=[];
  contactRevision=0;
  contacts:{x:number;z:number;radiusX:number;radiusZ:number;strength:number}[]=[];
  private lodGeometries=new Set<Mesh['geometry']>();
  private lodByGeometry=new Map<string,Mesh['geometry']>();
  private queued=false;
  updateLOD(camera:Camera):void {
    let coarse=0;
    for(const batch of this.batches){
      const low=batch.userData.lodGeometry as Mesh['geometry']|undefined;if(!low)continue;
      const distance=camera.position.distanceTo(batch.boundingSphere!.center);
      const previous=batch.geometry===low;
      const useLow=('isPerspectiveCamera' in camera)&&distance>(previous?68:76);
      batch.geometry=useLow?low:batch.userData.fullGeometry;if(useLow)coarse+=batch.count;
    }
    perf.value('Tree mesh instances at distant LOD',coarse);
  }
  private destroyed=false;
  private readonly prototypeDisposers=new Map<Object3D,()=>void>();
  private modelOverrides:ReadonlyMap<string,PropModelOptions>=new Map();
  private lastStamps: readonly MapStamp[] | null=null;
  private height: ((x: number, z: number) => number) | null = null;
  private float = new Set<string>();
  private waterY = 0;
  private season = "summer";
  private readonly failed = new Set<string>();
  private readonly bounds = new Map<string, { minY: number; height: number }>();
  private gen = 0;
  private picked: string | null = null;
  private mark: BoxHelper | null = null;

  constructor(
    private readonly scene: Scene,
    private urls: ReadonlyMap<string, string>,
    private readonly cutaway?:SceneryCutaway,
  ) {}

  async ready():Promise<void>{await Promise.all([...this.protos.values(),this.referenceGround.ready]);}
  async preload(stamps: readonly MapStamp[]): Promise<void> {
    const unique = new Map(stamps.map(s => [`${s.asset}#${s.variant ?? "base"}`, s]));
    const results = await Promise.all([...unique.values()].map(s => this.proto(s.asset, s.variant)));
    if (results.some(p => !p)) throw Error(`Scenery assets could not be loaded: ${[...unique.values()].filter((_,i)=>!results[i]).map(s=>s.asset).join(', ')}`);
  }
  async prepareModels(): Promise<readonly Object3D[]> {
    if (this.warmMeshes.length) return this.warmMeshes;
    const roots=await Promise.all(this.protos.values());
    if(this.destroyed)return [];
    const keys=new Set<string>();
    for(const root of roots)root?.traverse(o=>{
      if(!(o instanceof Mesh))return;
      const key=o.geometry.uuid+':'+(Array.isArray(o.material)?o.material:[o.material]).map(m=>m.uuid).join(',');
      if(keys.has(key))return;keys.add(key);
      for(const geometry of [o.geometry,this.lodByGeometry.get(o.geometry.uuid)].filter((g):g is Mesh['geometry']=>!!g)){
        const mesh=new InstancedMesh(geometry,o.material,1);
        if(o.userData.sourceTreeWind)mesh.setColorAt(0,new Color(0,1,1));
        mesh.customDepthMaterial=o.customDepthMaterial;
        mesh.castShadow=mesh.receiveShadow=true;
        this.warmMeshes.push(mesh);
      }
    });
    return this.warmMeshes;
  }
  diagnostics() { return { loaded:this.placed.size,failed:[...this.failed],bounds:Object.fromEntries(this.bounds) }; }
  boundsFor(ids:readonly string[]):Box3{
    const box=new Box3();for(const id of ids){const root=this.placed.get(id);if(root){root.updateMatrixWorld(true);box.expandByObject(root,true);}}return box;
  }
  setSeason(season:string):void { this.season=season;for(const root of this.placed.values())this.tint(root); }
  private tint(root:Object3D):void {
    const evergreen=/pine|spruce|fern|reeds/.test(String(root.userData.lookAsset??root.userData.asset));
    root.traverse(n=>{
      if(!(n instanceof Mesh))return;
      for(const m of (Array.isArray(n.material)?n.material:[n.material])){
        if(tintVividFoliage(m,this.season,root.userData.variant))continue;
        if(m instanceof MeshLambertMaterial && m.userData.stonePalette){
          // Each saved variant has its own prototype/materials. Tint only stone,
          // independently of foliage seasons and the sunlit bank-rock palette.
          m.color.set(root.userData.variant==='slate'?0xaa9eaa:0xffffff);
          continue;
        }
        const base=m.userData.foliageBase as number[]|undefined;
        if(!base||!(m instanceof MeshLambertMaterial))continue;
        const c=new Color().setRGB(base[0]!,base[1]!,base[2]!);
        if(evergreen)c.set(/reeds/.test(String(root.userData.lookAsset??root.userData.asset))?0xd2c589:0x286f4b);
        if(!evergreen){
          const name=String(root.userData.lookAsset??root.userData.asset);let hash=0;for(const ch of name)hash=(hash*31+ch.charCodeAt(0))>>>0;
          if(this.season==='autumn')c.set([0xc99738,0xb45b32,0xd7b644,0xc68043][hash%4]!);
          else if(this.season==='spring')c.set(/willow/.test(name)?0x99d36a:0x80c653);
          else c.set(/willow/.test(name)?0x83b958:0x639f40);
        }
        const variant=root.userData.variant;
        if(variant==='pink')c.set(/willow/.test(String(root.userData.lookAsset??root.userData.asset))?0xffada8:0xffb1a7);
        if(variant==='snow')c.set(0xe1e0ef);
        if(variant==='gold')c.set(/willow/.test(String(root.userData.lookAsset??root.userData.asset))?0xffbd71:0xffca0c);
        if(variant==='red')c.set(0xca7648);
        if(variant==='green')c.set(0x67b04c);
        m.color.copy(c);m.emissive.copy(c);
        if(variant==='pink')m.emissive.set(0xff6872);
        m.emissive.multiplyScalar(variant==='pink'?.16:.035);
        m.emissiveMap=variant==='pink'?m.map:null;
      }
    });
  }

  landmarks(camera:Camera,ids?:readonly string[]) {
    const uv=(p:Vector3)=>{const v=p.clone().project(camera);return {u:(v.x+1)/2,v:(1-v.y)/2};};
    return [...this.placed].filter(([id])=>!ids||ids.includes(id)).map(([id,root])=>{
      root.updateMatrixWorld(true);const box=new Box3().setFromObject(root),corners=[];
      for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z])corners.push(uv(new Vector3(x,y,z)));
      return {id,asset:root.userData.asset,anchor:uv(root.position),world:{x:root.position.x,y:root.position.y,z:root.position.z},bounds:{left:Math.min(...corners.map(p=>p.u)),right:Math.max(...corners.map(p=>p.u)),top:Math.min(...corners.map(p=>p.v)),bottom:Math.max(...corners.map(p=>p.v))}};
    });
  }

  setUrls(urls: ReadonlyMap<string, string>,models:ReadonlyMap<string,PropModelOptions>=new Map()): void {
    const changed=new Set<string>();
    for(const id of new Set([...this.urls.keys(),...urls.keys()])){
      if(this.urls.get(id)!==urls.get(id)||JSON.stringify(this.modelOverrides.get(id))!==JSON.stringify(models.get(id)))changed.add(id);
    }
    this.urls = urls;
    this.modelOverrides=models;
    if(!changed.size)return;
    this.gen++;this.lastStamps=null;
    for(const [id,root]of this.placed)if(changed.has(root.userData.asset)){root.removeFromParent();this.placed.delete(id);}
    for(const [key,pending]of this.protos)if(changed.has(key.slice(0,key.lastIndexOf('#')))){
      this.protos.delete(key);void pending.then(root=>{if(root)this.disposePrototype(root);});
    }
    for(const id of changed){this.failed.delete(id);this.bounds.delete(id);}
    for(const mesh of this.warmMeshes)mesh.dispose();this.warmMeshes=[];
    // Remove instance buffers before releasing the shared prototype geometry.
    this.rebuildBatches();
  }

  private modelOptions(asset:string):PropModelOptions|undefined{
    return this.modelOverrides.get(asset)??(sceneryModels.has(asset)?{...sceneryModels.get(asset)!,sourceAsset:asset}:undefined);
  }

  setHeight(sample: ((x: number, z: number) => number) | null,field:HeightField|null=null): void {
    this.height = sample;
    this.referenceGround.update(field);
    this.relift();
  }

  setFloat(ids: ReadonlySet<string>, y = 0): void {
    this.float = new Set(ids);
    this.waterY = y;
    this.relift();
  }

  setWaterY(y: number): void {
    this.waterY = y;
    this.relift();
  }

  sync(stamps: readonly MapStamp[]): void {
    if(stamps===this.lastStamps){this.syncMark();return;}
    this.lastStamps=stamps;
    const gen = ++this.gen;
    const seen = new Set<string>();
    for (const stamp of stamps) {
      seen.add(stamp.id);
      const existing = this.placed.get(stamp.id);
      if (existing && existing.userData.asset===stamp.asset && existing.userData.variant===stamp.variant) {
        this.place(existing, stamp);
        continue;
      }
      if (existing) this.placed.delete(stamp.id);
      void this.spawn(stamp, gen);
    }
    for (const [id, mesh] of this.placed) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      this.placed.delete(id);
    }
    this.queueBatches();
    this.syncMark();
  }

  setSelected(id: string | null): void {
    this.picked = id;
    this.syncMark();
  }

  pick(ray: Raycaster, maxDistance = Infinity): string | null {
    const hits = ray.intersectObjects(this.batches, false);
    for (const hit of hits) {
      if (hit.distance > maxDistance) continue;
      const ids=hit.object.userData.stampIds as string[]|undefined;
      if(ids && hit.instanceId!==undefined)return ids[hit.instanceId] ?? null;
    }
    return null;
  }

  destroy(): void {
    this.destroyed=true;this.wind.dispose();this.referenceGround.dispose();this.referenceMacro?.dispose();
    for(const mesh of this.warmMeshes)mesh.dispose();this.warmMeshes=[];
    this.gen++;
    for(const pending of this.protos.values())void pending.then(root=>{if(root)this.disposePrototype(root);});
    this.protos.clear();
    for(const geometry of this.lodGeometries)geometry.dispose();this.lodGeometries.clear();this.lodByGeometry.clear();
    for (const mesh of this.placed.values()) this.scene.remove(mesh);
    this.placed.clear();
    for(const batch of this.batches){this.scene.remove(batch);batch.dispose();}
    this.batches=[];
    if (this.mark) {
      this.scene.remove(this.mark);
      this.mark.geometry.dispose();
      this.mark = null;
    }
  }

  private disposePrototype(root:Object3D):void{
    this.prototypeDisposers.get(root)?.();this.prototypeDisposers.delete(root);
    const textures=new Set<Texture>(),materials=new Set<Mesh['material']>(),geometry=new Set<Mesh['geometry']>();
    root.traverse(node=>{
      if(!(node instanceof Mesh))return;
      geometry.add(node.geometry);
      for(const mat of Array.isArray(node.material)?node.material:[node.material]){
        materials.add(mat);for(const value of Object.values(mat))if(value instanceof Texture)textures.add(value);
      }
    });
    for(const g of geometry)g.dispose();for(const m of materials)if(!Array.isArray(m))m.dispose();for(const t of textures)t.dispose();
  }

  private async spawn(stamp: MapStamp, gen: number): Promise<void> {
    const proto = await this.proto(stamp.asset,stamp.variant);
    if (gen !== this.gen || !proto || this.placed.has(stamp.id)) return;
    const mesh = proto.clone();
    this.place(mesh, stamp);
    this.tint(mesh);
    this.placed.set(stamp.id, mesh);
    this.queueBatches();
    if (stamp.id === this.picked) this.syncMark();
  }

  private proto(asset: string, variant?: MapStamp["variant"]): Promise<Object3D | null> {
    const key = `${asset}#${variant??"base"}`;
    const hit = this.protos.get(key);
    if (hit) return hit;
    const url = this.urls.get(asset);
    const pending = url ? this.load(url, asset, variant,this.modelOptions(asset)) : Promise.resolve(null);
    this.protos.set(key, pending);
    return pending;
  }

  private async load(url: string, id: string, variant?: MapStamp["variant"],model?:PropModelOptions): Promise<Object3D | null> {
    try {
      const asset=model?.sourceAsset??id;
      const gltf = await this.loader.loadAsync(url);
      let disposeBatch=()=>{};
      let wind:ReturnType<typeof foliageWind>=null;
      gltf.scene.traverse(node=>{wind??=foliageWind(node.userData.foliageWind);});
      if(/^(pine-chunky|tree-chunky-)/.test(asset))prepareVividFoliage(gltf.scene);
      gltf.scene.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      const referenceOrigin=prepareReferencePlants(gltf.scene,this.referenceGround,()=>this.referenceMacro??=referenceTexture(macroUrl,false));
      if(referenceOrigin&&asset.startsWith('reference-fir'))wind={amplitude:.12,speed:.22};
      disposeBatch=batchStaticMaterials(gltf.scene,!!gltf.animations.length);
      gltf.scene.updateMatrixWorld(true);
      const box=prototypeBounds(gltf.scene);
      const disposeWind=wind?this.wind.attach(gltf.scene,wind,referenceOrigin?box.max.y:box.max.y-box.min.y,referenceOrigin?this.referenceGround.sourceOffset:undefined):()=>{};
      this.resin.attach(gltf.scene);
      gltf.scene.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])this.cutaway?.attach(m,box.max.y-box.min.y);});
      // Trees use zero as their soil line; negative vertices are buried roots, not a pivot error.
      // Positive-only offsets still need normalization.
      const grounding=model?.groundContact;
      const groundOffset=grounding==='terrain'?-box.min.y:grounding?0:prototypeGroundOffset(asset,box.min.y,this.float.has(id),referenceOrigin);
      const root=transformedModel(gltf.scene,model?.transform??{scale:1,pivot:[0,0,0],up:'Y',forward:'+Z'},groundOffset);
      this.prototypeDisposers.set(root,()=>{disposeBatch();disposeWind();});
      const transformed=prototypeBounds(root);
      this.bounds.set(id,{minY:transformed.min.y,height:transformed.max.y-transformed.min.y});
      root.userData.variant=variant;
      return root;
    } catch {
      this.failed.add(id);
      return null;
    }
  }

  private place(mesh: Object3D, stamp: MapStamp): void {
    const s = stamp.scale ?? 1;
    const x = stamp.x + 0.5;
    const z = stamp.y + 0.5;
    mesh.userData.asset = stamp.asset;
    mesh.userData.lookAsset=this.modelOptions(stamp.asset)?.sourceAsset??stamp.asset;
    mesh.userData.stamp = stamp.id;
    mesh.userData.elevation=stamp.elevation??0;
    mesh.userData.sourceHeight=stamp.sourceTransform?.height;
    mesh.userData.sourceObscurance=(stamp.sourceTransform?.packedUserData?.[0]??0)/255;
    mesh.userData.walkStamp=stamp.walk?.height!==undefined?stamp:undefined;
    mesh.position.set(x, stamp.sourceTransform?.height ?? (stamp.walk?.height!==undefined?bridgePlacementHeight(stamp,()=>0):this.sitY(stamp.asset, x, z)+(stamp.elevation??0)), z);
    mesh.rotation.set(stamp.pitch ?? 0, stamp.yaw ?? 0, stamp.roll ?? 0, "ZXY");
    if(stamp.sourceTransform)mesh.quaternion.fromArray(stamp.sourceTransform.quaternion);
    mesh.scale.set(s*(stamp.widthScale??1),s*(stamp.heightScale??1),s*(stamp.depthScale??1));
  }

  private sitY(asset: string, x: number, z: number): number {
    if (this.float.has(asset)) return this.waterY;
    return this.height ? this.height(x, z) : 0;
  }

  private relift(): void {
    for (const mesh of this.placed.values()) {
      const asset = typeof mesh.userData.asset === "string" ? mesh.userData.asset : "";
      mesh.position.y = mesh.userData.sourceHeight ?? (mesh.userData.walkStamp ? bridgePlacementHeight(mesh.userData.walkStamp,()=>0) : this.sitY(asset, mesh.position.x, mesh.position.z)+(Number(mesh.userData.elevation)||0));
    }
    this.queueBatches();
    this.syncMark();
  }

  private queueBatches():void {
    if(this.queued)return;this.queued=true;
    queueMicrotask(()=>{this.queued=false;if(!this.destroyed)this.rebuildBatches();});
  }
  private rebuildBatches():void {
    const timing=perf.start();
    this.contacts=[];this.contactRevision++;
    const previous=new Map(this.batches.map(b=>[b.userData.batchKey as string,b]));
    this.batches=[];
    const groups=new Map<string,{source:Mesh; poses:Matrix4[];ids:string[]}>();
    for(const [id,root] of this.placed){
      root.updateMatrixWorld(true);
      root.userData.cameraBounds=new Box3().setFromObject(root);
      const asset=String(root.userData.lookAsset??root.userData.asset);
      if(!this.float.has(asset)&&!/(mountain|bridge|pillar-arch)/.test(asset)&&Number(root.userData.elevation??0)<.5){
        const box=new Box3().setFromObject(root);
        const tree=/tree|pine/.test(asset),spread=tree?.17:.42;
        this.contacts.push({x:root.position.x,z:root.position.z,radiusX:Math.max(.3,(box.max.x-box.min.x)*spread),radiusZ:Math.max(.3,(box.max.z-box.min.z)*spread),strength:tree?.27:.36});
      }
      root.traverse(n=>{
        if(!(n instanceof Mesh))return;
        const mats=Array.isArray(n.material)?n.material:[n.material];
        // Spatial batches allow camera and shadow frusta to reject offscreen forest.
        const cell=`${Math.floor(root.position.x/24)},${Math.floor(root.position.z/24)}`;
        const key=cell+':'+n.geometry.uuid+':'+mats.map(m=>m.uuid).join(',');
        let g=groups.get(key);if(!g){g={source:n,poses:[],ids:[]};groups.set(key,g);}
        g.poses.push(n.matrixWorld.clone());g.ids.push(id);
      });
    }
    for(const [key,g] of groups){
      let b=previous.get(key);previous.delete(key);
      const capacity=b?.instanceMatrix.count??0;
      if(b&&capacity<g.poses.length){this.scene.remove(b);b.dispose();b=undefined;}
      if(!b){
        b=new InstancedMesh(g.source.geometry,g.source.material,g.poses.length);
        b.customDepthMaterial=g.source.customDepthMaterial;
        b.userData.batchKey=key;
        b.userData.fullGeometry=g.source.geometry;b.userData.lodGeometry=this.lodByGeometry.get(g.source.geometry.uuid);
        let trianglesBefore=0;
        b.onBeforeRender=renderer=>{if(perf.enabled)trianglesBefore=renderer.info.render.triangles;};
        const batch=b;
        b.onAfterRender=renderer=>perf.count(batch.userData.category,renderer.info.render.triangles-trianglesBefore);
        b.castShadow=g.source.castShadow;b.receiveShadow=g.source.receiveShadow;b.renderOrder=g.source.renderOrder;b.matrixAutoUpdate=false;b.matrixWorldAutoUpdate=false;this.scene.add(b);
      }
      let changed=b.count!==g.poses.length;
      const matrices=b.instanceMatrix.array;
      for(let i=0;i<g.poses.length;i++){
        const pose=g.poses[i].elements;
        // Float32 comparison avoids treating unchanged non-integer transforms
        // as edits merely because the authored matrices use double precision.
        for(let j=0;j<16;j++)if(matrices[i*16+j]!==Math.fround(pose[j])){changed=true;break;}
        if(changed)b.setMatrixAt(i,g.poses[i]);
      }
      b.count=g.poses.length;b.userData.stampIds=g.ids;
      if(g.source.userData.sourceTreeWind){
        const color=new Color();let colorChanged=false;
        for(let i=0;i<g.ids.length;i++){
          const shelter=Math.fround(Number(this.placed.get(g.ids[i]!)?.userData.sourceObscurance)||0);
          if(!b.instanceColor||b.instanceColor.getX(i)!==shelter){b.setColorAt(i,color.setRGB(shelter,1,1));colorChanged=true;}
        }
        if(colorChanged&&b.instanceColor)b.instanceColor.needsUpdate=true;
      }
      b.userData.category=/pine|reference-fir/.test(String(this.placed.get(g.ids[0])?.userData.asset))?'Tree triangles':'Other prop triangles';
      if(changed||!b.boundingSphere){
        b.instanceMatrix.needsUpdate=true;
        // Source harmonics can travel farther than the native .5-unit sway.
        const displayed=b.geometry;b.geometry=g.source.geometry;b.computeBoundingSphere();if(b.boundingSphere)b.boundingSphere.radius+=g.source.userData.sourceTreeWind?1.25:.5;b.geometry=displayed;
      }
      this.batches.push(b);
    }
    for(const b of previous.values()){this.scene.remove(b);b.dispose();}
    perf.value('Prop batches',this.batches.length);perf.value('Placed props',this.placed.size);
    perf.end('Prop rebuild (event)',timing);
  }

  private syncMark(): void {
    const mesh = this.picked ? this.placed.get(this.picked) : undefined;
    if (!mesh) {
      if (this.mark) this.mark.visible = false;
      return;
    }
    if (this.mark && this.mark.userData.stamp === this.picked) {
      this.mark.update();
      this.mark.visible = true;
      return;
    }
    if (this.mark) {
      this.scene.remove(this.mark);
      this.mark.geometry.dispose();
    }
    const mark = new BoxHelper(mesh, 0xe8e0d0);
    mark.userData.stamp = this.picked;
    this.scene.add(mark);
    this.mark = mark;
  }
}
