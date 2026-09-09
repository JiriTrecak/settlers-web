import pineLod from '../../../assets/ant-colony/olive-pine.glb?url';
import {perf} from '../../debug/performance';
import { prepareVividFoliage, tintVividFoliage } from './vividLook';
import { prepareAntMaterials } from './antMaterials';
import { prototypeBounds, prototypeGroundOffset } from './grounding';
/**
 * Stamp meshes in the scene. Loads each catalog glTF once, clones per placement.
 * Water-type assets sit on the sea plane, not the lakebed.
 */
import { Vector3, type Camera, InstancedMesh, Matrix4, Box3, BoxHelper, Object3D, Mesh, Color, MeshLambertMaterial, type Raycaster, type Scene } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MapStamp } from "../../shared";
import { flattenPolygon } from "./polygonLook";

export class PropField {
  private readonly loader = new GLTFLoader();
  private readonly protos = new Map<string, Promise<Object3D | null>>();
  private readonly placed = new Map<string, Object3D>();
  private batches: InstancedMesh[]=[];
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
  ) {}

  async ready():Promise<void>{await Promise.all(this.protos.values());}
  diagnostics() { return { loaded:this.placed.size,failed:[...this.failed],bounds:Object.fromEntries(this.bounds) }; }
  setSeason(season:string):void { this.season=season;for(const root of this.placed.values())this.tint(root); }
  private tint(root:Object3D):void {
    const evergreen=/pine|spruce|fern|reeds/.test(String(root.userData.asset));
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
        if(evergreen)c.set(/reeds/.test(String(root.userData.asset))?0xd2c589:0x286f4b);
        if(!evergreen){
          const name=String(root.userData.asset);let hash=0;for(const ch of name)hash=(hash*31+ch.charCodeAt(0))>>>0;
          if(this.season==='autumn')c.set([0xc99738,0xb45b32,0xd7b644,0xc68043][hash%4]!);
          else if(this.season==='spring')c.set(/willow/.test(name)?0x99d36a:0x80c653);
          else c.set(/willow/.test(name)?0x83b958:0x639f40);
        }
        const variant=root.userData.variant;
        if(variant==='pink')c.set(/willow/.test(String(root.userData.asset))?0xffada8:0xffb1a7);
        if(variant==='snow')c.set(0xe1e0ef);
        if(variant==='gold')c.set(/willow/.test(String(root.userData.asset))?0xffbd71:0xffca0c);
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

  setUrls(urls: ReadonlyMap<string, string>): void {
    this.urls = urls;
  }

  setHeight(sample: ((x: number, z: number) => number) | null): void {
    this.height = sample;
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

  pick(ray: Raycaster): string | null {
    const hits = ray.intersectObjects(this.batches, false);
    for (const hit of hits) {
      const ids=hit.object.userData.stampIds as string[]|undefined;
      if(ids && hit.instanceId!==undefined)return ids[hit.instanceId] ?? null;
    }
    return null;
  }

  destroy(): void {
    this.destroyed=true;
    this.gen++;
    for(const pending of this.protos.values())void pending.then(root=>root?.traverse(node=>{
      if(!(node instanceof Mesh))return;
      node.geometry.dispose();
      for(const mat of Array.isArray(node.material)?node.material:[node.material]){
        const m=mat as MeshLambertMaterial;m.map?.dispose();mat.dispose();
      }
    }));
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
    const pending = url ? this.load(url, asset, variant) : Promise.resolve(null);
    this.protos.set(key, pending);
    return pending;
  }

  private async load(url: string, asset: string, variant?: MapStamp["variant"]): Promise<Object3D | null> {
    try {
      const gltf = await this.loader.loadAsync(url);
      if(asset.startsWith('ant-'))prepareAntMaterials(gltf.scene);
      const lodUrl=({'ant-pine-1':pineLod,'ant-pine-2':pineLod,'ant-pine-3':pineLod} as Record<string,string>)[asset];
      if(lodUrl){
        const lod=await this.loader.loadAsync(lodUrl);const parts:Mesh[]=[];lod.scene.traverse(o=>{if(o instanceof Mesh)parts.push(o);});let part=0;
        gltf.scene.traverse(o=>{if(o instanceof Mesh){const geometry=parts[part++]?.geometry;if(geometry){this.lodByGeometry.set(o.geometry.uuid,geometry);this.lodGeometries.add(geometry);}}});
        lod.scene.traverse(o=>{if(o instanceof Mesh)for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();});
      }
      if(/^(pine-chunky|tree-chunky-)/.test(asset))prepareVividFoliage(gltf.scene);
      if (url.includes("synty") || asset.startsWith("synty-") || asset === "river-reeds") flattenPolygon(gltf.scene, asset,variant);
      gltf.scene.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      gltf.scene.updateMatrixWorld(true);
      const box=prototypeBounds(gltf.scene);
      this.bounds.set(asset,{minY:box.min.y,height:box.max.y-box.min.y});
      const root=new Object3D();
      // Trees use zero as their soil line; negative vertices are buried roots, not a pivot error.
      // Positive-only offsets still need normalization.
      gltf.scene.position.y+=prototypeGroundOffset(asset,box.min.y,this.float.has(asset));
      root.userData.variant=variant;
      root.add(gltf.scene);
      return root;
    } catch {
      this.failed.add(asset);
      return null;
    }
  }

  private place(mesh: Object3D, stamp: MapStamp): void {
    const s = stamp.scale ?? 1;
    const x = stamp.x + 0.5;
    const z = stamp.y + 0.5;
    mesh.userData.asset = stamp.asset;
    mesh.userData.stamp = stamp.id;
    mesh.userData.elevation=stamp.elevation??0;
    mesh.position.set(x, this.sitY(stamp.asset, x, z)+(stamp.elevation??0), z);
    mesh.rotation.set(stamp.pitch ?? 0, stamp.yaw ?? 0, stamp.roll ?? 0, "ZXY");
    mesh.scale.set(s*(stamp.widthScale??1),s*(stamp.heightScale??1),s*(stamp.depthScale??1));
  }

  private sitY(asset: string, x: number, z: number): number {
    if (this.float.has(asset)) return this.waterY;
    return this.height ? this.height(x, z) : 0;
  }

  private relift(): void {
    for (const mesh of this.placed.values()) {
      const asset = typeof mesh.userData.asset === "string" ? mesh.userData.asset : "";
      mesh.position.y = this.sitY(asset, mesh.position.x, mesh.position.z)+(Number(mesh.userData.elevation)||0);
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
    for(const b of this.batches){this.scene.remove(b);b.dispose();}this.batches=[];
    const groups=new Map<string,{source:Mesh; poses:Matrix4[];ids:string[]}>();
    for(const [id,root] of this.placed){
      root.updateMatrixWorld(true);
      const asset=String(root.userData.asset);
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
    for(const g of groups.values()){
      const b=new InstancedMesh(g.source.geometry,g.source.material,g.poses.length);
      g.poses.forEach((p,i)=>b.setMatrixAt(i,p));b.instanceMatrix.needsUpdate=true;
      b.userData.fullGeometry=g.source.geometry;b.userData.lodGeometry=this.lodByGeometry.get(g.source.geometry.uuid);
      let trianglesBefore=0;
      b.onBeforeRender=renderer=>{if(perf.enabled)trianglesBefore=renderer.info.render.triangles;};
      b.onAfterRender=renderer=>perf.count(g.ids[0]&&String(this.placed.get(g.ids[0])?.userData.asset).includes('pine')?'Tree triangles':'Other prop triangles',renderer.info.render.triangles-trianglesBefore);
      b.castShadow=b.receiveShadow=true;b.userData.stampIds=g.ids;b.computeBoundingSphere();
      this.batches.push(b);this.scene.add(b);
    }
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
