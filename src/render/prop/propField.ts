/**
 * Stamp meshes in the scene. Loads each catalog glTF once, clones per placement.
 * Water-type assets sit on the sea plane, not the lakebed.
 */
import { InstancedMesh, Matrix4, Box3, BoxHelper, Object3D, Mesh, Color, MeshLambertMaterial, type Raycaster, type Scene } from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { MapStamp } from "../../shared";
import { flattenPolygon } from "./polygonLook";

export class PropField {
  private readonly loader = new GLTFLoader();
  private readonly protos = new Map<string, Promise<Object3D | null>>();
  private readonly placed = new Map<string, Object3D>();
  private batches: InstancedMesh[]=[];
  private queued=false;
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
        const base=m.userData.foliageBase as number[]|undefined;
        if(!base||!(m instanceof MeshLambertMaterial))continue;
        const c=new Color().setRGB(base[0]!,base[1]!,base[2]!);
        if(evergreen)c.set(0x8f9870);
        if(!evergreen){
          const name=String(root.userData.asset);let hash=0;for(const ch of name)hash=(hash*31+ch.charCodeAt(0))>>>0;
          if(this.season==='autumn')c.set([0xc99738,0xb45b32,0xd7b644,0xc68043][hash%4]!);
          else if(this.season==='spring')c.set(/willow/.test(name)?0xc3d897:0xb6d48b);
          else c.set(/willow/.test(name)?0xc0c77c:0xaeb673);
        }
        const variant=root.userData.variant;
        if(variant==='snow')c.set(0xe1e0ef);
        if(variant==='gold')c.set(0xdabc60);
        if(variant==='red')c.set(0xca7648);
        if(variant==='green')c.set(0xa7be79);
        m.color.copy(c);m.emissive.copy(c).multiplyScalar(.085);
      }
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
      if (url.includes("synty") || asset.startsWith("synty-")) flattenPolygon(gltf.scene, asset);
      gltf.scene.traverse((node) => {
        node.castShadow = true;
        node.receiveShadow = true;
      });
      gltf.scene.updateMatrixWorld(true);
      const box=new Box3().setFromObject(gltf.scene);
      this.bounds.set(asset,{minY:box.min.y,height:box.max.y-box.min.y});
      const root=new Object3D();
      // Imported pivots are not a reliable ground plane; keep geometry intact and normalize the prototype.
      if(!this.float.has(asset) && !asset.includes("pillar-arch") && Number.isFinite(box.min.y))gltf.scene.position.y-=box.min.y;
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
    mesh.rotation.y = stamp.yaw ?? 0;
    mesh.scale.setScalar(s);
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
    for(const b of this.batches){this.scene.remove(b);b.dispose();}this.batches=[];
    const groups=new Map<string,{source:Mesh; poses:Matrix4[];ids:string[]}>();
    for(const [id,root] of this.placed){
      root.updateMatrixWorld(true);
      root.traverse(n=>{
        if(!(n instanceof Mesh))return;
        const mats=Array.isArray(n.material)?n.material:[n.material];
        const key=n.geometry.uuid+':'+mats.map(m=>m.uuid).join(',');
        let g=groups.get(key);if(!g){g={source:n,poses:[],ids:[]};groups.set(key,g);}
        g.poses.push(n.matrixWorld.clone());g.ids.push(id);
      });
    }
    for(const g of groups.values()){
      const b=new InstancedMesh(g.source.geometry,g.source.material,g.poses.length);
      g.poses.forEach((p,i)=>b.setMatrixAt(i,p));b.instanceMatrix.needsUpdate=true;
      b.castShadow=b.receiveShadow=true;b.userData.stampIds=g.ids;b.computeBoundingSphere();
      this.batches.push(b);this.scene.add(b);
    }
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
