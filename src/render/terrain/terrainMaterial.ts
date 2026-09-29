import {authoredTerrain} from './authoredTerrain';
import {ImportedTerrainMaterial} from './importedTerrainMaterial';
import type {ImportedTerrain} from '../../shared/map/importedTerrain';
import {bakeGroundLights,type GroundLamp} from './groundLightMap';
import type {CoverPatch} from '../../shared/landscape/curve';
import { DataTexture, RGFormat, LinearFilter, MeshStandardMaterial, Color } from 'three';
import { HEIGHT_ORIGIN, MAP_SIZE, MAP_HALO, type HeightField } from '../../shared';
import { rasterizeCurve, sampleCurve, type TerrainStroke } from '../../shared/landscape/curve';
export class TerrainMaterial extends MeshStandardMaterial {
  private native?:ImportedTerrainMaterial;
  private field?:HeightField;
  private strokes:readonly TerrainStroke[]=[];
  private cover:readonly CoverPatch[]=[];
  private nativeDirty=false;
  private readonly colorPrograms=new Set<import('three').WebGLProgramParametersWithUniforms>();
  private readonly depthPrograms=new Set<import('three').WebGLProgramParametersWithUniforms>();
  private refreshNative(){if(this.imported||!this.field||!this.nativeDirty)return;this.nativeDirty=false;this.native?.dispose();this.native=new ImportedTerrainMaterial(authoredTerrain(this.field,this.strokes,this.cover));
    for(const shader of this.colorPrograms)this.native.bindUniforms(shader);
    for(const shader of this.depthPrograms)this.native.bindUniforms(shader,true);
    this.needsUpdate=true;}
  private imported?:ImportedTerrainMaterial;
  compileImportedDepth(shader:import('three').WebGLProgramParametersWithUniforms){this.refreshNative();this.depthPrograms.add(shader);(this.imported??this.native)?.compileDepth(shader);}
  get ready():Promise<void>{this.refreshNative();return (this.imported??this.native)?.ready??Promise.resolve();}
  setImported(source?:ImportedTerrain){if(this.imported?.source===source)return;this.imported?.dispose();this.imported=source?new ImportedTerrainMaterial(source):undefined;this.needsUpdate=true;}
  private readonly interiorFloor={value:0};
  setFloor(material:'forest'|'heartwood'='forest'){this.interiorFloor.value=material==='heartwood'?1:0;}
  private contactRevision=-1;
  private readonly contacts=new DataTexture(new Uint8Array(1024*1024*4),1024,1024);
  private readonly weights:DataTexture;
  private readonly roadMask:DataTexture;
  private readonly verts:number;
  private readonly seasonTint = { value: new Color(0xffffff) };
  private readonly level = { value: 0 };
  constructor(size=MAP_SIZE) {
    super({color:0xffffff,roughness:0.95});
    this.verts=size+MAP_HALO*2+1;
    this.weights=new DataTexture(new Uint8Array(this.verts*this.verts*4),this.verts,this.verts);
    this.roadMask=new DataTexture(new Uint8Array(this.verts*this.verts*2),this.verts,this.verts,RGFormat);
    this.roadMask.minFilter=this.roadMask.magFilter=LinearFilter;this.roadMask.needsUpdate=true;
    this.contacts.minFilter=this.contacts.magFilter=LinearFilter;this.contacts.needsUpdate=true;
    this.contacts.onUpdate=()=>{this.fullContactUpload=false;};
    this.weights.minFilter=this.weights.magFilter=LinearFilter;
    this.weights.needsUpdate=true;
    this.onBeforeCompile=shader=>{
      this.refreshNative();this.colorPrograms.add(shader);
      (this.imported??this.native)?.compile(shader);
    };
    this.customProgramCacheKey=()=> `landscape-terrain-reference-v3-${this.imported?.source.sha256??"native"}`;
  }
  private groundLamps:readonly GroundLamp[]|undefined;
  setGroundLights(lamps:readonly GroundLamp[],field:HeightField):void {
    if(this.groundLamps===lamps)return;
    this.groundLamps=lamps;
    bakeGroundLights(this.contacts.image.data as Uint8Array,1024,HEIGHT_ORIGIN,this.verts-1,(x,z)=>field.sample(x,z),lamps);
    this.uploadAllContacts();
  }
  private drawnContacts=new Set<Contact>();
  /** A whole-texture upload is queued; row ranges added now would truncate it to those rows. */
  private fullContactUpload=true;
  private uploadAllContacts(){this.contacts.clearUpdateRanges();this.fullContactUpload=true;this.contacts.needsUpdate=true;}
  /** Contact shade under props (R channel, max-blended). A harvested tree changes one or two
   * contacts, so only their texel rectangles are cleared, redrawn from every overlapping contact
   * and uploaded row by row — a full redraw + 4 MB upload was an ~18 ms hitch per prop change.
   * Unchanged props keep their contact object, so identity tells what changed. */
  setContacts(revision:number,contacts:readonly Contact[]):void {
    if(this.contactRevision===revision)return;this.contactRevision=revision;
    const data=this.contacts.image.data as Uint8Array,size=1024,scale=size/(this.verts-1);
    const next=new Set(contacts),changed:Contact[]=[];
    for(const c of this.drawnContacts)if(!next.has(c))changed.push(c);
    for(const c of contacts)if(!this.drawnContacts.has(c))changed.push(c);
    this.drawnContacts=next;
    const rect=(c:Contact)=>{const cx=(c.x-HEIGHT_ORIGIN)*scale,cz=(c.z-HEIGHT_ORIGIN)*scale,rx=c.radiusX*scale*1.5,rz=c.radiusZ*scale*1.5;
      return {cx,cz,rx,rz,x0:Math.max(0,Math.floor(cx-rx)),x1:Math.min(size-1,Math.floor(cx+rx)),z0:Math.max(0,Math.floor(cz-rz)),z1:Math.min(size-1,Math.floor(cz+rz))};};
    const stamp=(c:Contact,x0:number,x1:number,z0:number,z1:number)=>{
      const r=rect(c);
      for(let z=Math.max(z0,r.z0);z<=Math.min(z1,r.z1);z++)for(let x=Math.max(x0,r.x0);x<=Math.min(x1,r.x1);x++){
        const d=((x-r.cx)/r.rx)**2+((z-r.cz)/r.rz)**2;if(d>=1)continue;
        const i=(z*size+x)*4;data[i]=Math.max(data[i]!,Math.round(c.strength*(1-d)**2*255));
      }
    };
    if(changed.length>Math.max(64,contacts.length/4)){
      for(let i=0;i<data.length;i+=4)data[i]=0;
      for(const c of contacts)stamp(c,0,size-1,0,size-1);
      this.uploadAllContacts();return;
    }
    if(!changed.length)return;
    const boxes=contacts.map(rect);
    for(const c of changed){
      const {x0,x1,z0,z1}=rect(c);
      for(let z=z0;z<=z1;z++){for(let x=x0;x<=x1;x++)data[(z*size+x)*4]=0;if(!this.fullContactUpload)this.contacts.addUpdateRange((z*size+x0)*4,(x1-x0+1)*4);}
      for(let i=0;i<contacts.length;i++){const b=boxes[i]!;if(b.x1>=x0&&b.x0<=x1&&b.z1>=z0&&b.z0<=z1)stamp(contacts[i]!,x0,x1,z0,z1);}
    }
    this.contacts.needsUpdate=true;
  }
  setCover(patches:readonly CoverPatch[]):void {
    if(this.cover===patches)return;
    this.cover=patches;this.nativeDirty=true;this.needsUpdate=true;
    // R = road blend, G = moss coverage. One mask sampler leaves room for fog,
    // shadows and observed-unit cutaways on WebGL's 16-sampler baseline.
    const size=this.verts,data=this.roadMask.image.data as Uint8Array;
    for(let i=1;i<data.length;i+=2)data[i]=0;
    for(const p of patches){
      if(p.palette!=='forest')continue;
      const loX=Math.max(0,Math.floor(p.x-p.radius-HEIGHT_ORIGIN)),hiX=Math.min(size-1,Math.ceil(p.x+p.radius-HEIGHT_ORIGIN));
      const loZ=Math.max(0,Math.floor(p.z-p.radius-HEIGHT_ORIGIN)),hiZ=Math.min(size-1,Math.ceil(p.z+p.radius-HEIGHT_ORIGIN));
      for(let iz=loZ;iz<=hiZ;iz++)for(let ix=loX;ix<=hiX;ix++){
        const x=ix+HEIGHT_ORIGIN,z=iz+HEIGHT_ORIGIN;
        if((p.exclusions??[]).some(e=>Math.hypot(x-e.x,z-e.z)<e.radius))continue;
        const edge=Math.max(0,Math.min(1,(1-Math.hypot(x-p.x,z-p.z)/p.radius)*6));
        const i=(iz*size+ix)*2+1;data[i]=Math.max(data[i]!,Math.round(255*edge*Math.min(1,p.density)));
      }
    }this.roadMask.needsUpdate=true;this.refreshNative();
  }
  setSeason(season:string):void { this.seasonTint.value.set(season==='autumn'?0xfff0dc:0xffffff); }
  update(field:HeightField,strokes:readonly TerrainStroke[]):void {
    this.field=field;this.strokes=strokes;this.nativeDirty=true;this.needsUpdate=true;
    this.groundLamps=undefined;
    this.level.value=field.waterLevel;
    const data=this.weights.image.data as Uint8Array; data.fill(0);
    const roads=this.roadMask.image.data as Uint8Array;for(let i=0;i<roads.length;i+=2)roads[i]=0;
    for(const s of strokes){
      const curve=sampleCurve(s.points,s.radius,1);
      const channel={sand:0,mud:1,rock:2,snow:3,grass:-1,road:-1}[s.layer];
      const distances=rasterizeCurve(curve,this.verts,HEIGHT_ORIGIN);
      for(let z=0;z<this.verts;z++)for(let x=0;x<this.verts;x++){
        const d=distances[z*this.verts+x]!;
        if(d>=1)continue;
        const w=s.opacity*(1-smooth(.55,1,d)); const i=(z*this.verts+x)*4;
        roads[i/2]=Math.round(roads[i/2]!*(1-w)+(s.layer==='road'?255*w:0));
        for(let c=0;c<4;c++)data[i+c]=Math.round(data[i+c]!*(1-w)+(c===channel?255*w:0));
      }
    }
    this.weights.needsUpdate=true;this.roadMask.needsUpdate=true;this.refreshNative();
  }
  override dispose():void{ this.colorPrograms.clear();this.depthPrograms.clear(); this.imported?.dispose();this.native?.dispose(); this.roadMask.dispose();this.weights.dispose();this.contacts.dispose();super.dispose(); }
}
type Contact={x:number;z:number;radiusX:number;radiusZ:number;strength:number};
const smooth=(a:number,b:number,x:number)=>{const t=Math.max(0,Math.min(1,(x-a)/(b-a)));return t*t*(3-2*t);};
