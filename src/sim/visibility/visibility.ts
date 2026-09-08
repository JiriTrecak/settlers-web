import { territoryBorder } from '../../shared/settlement/territoryBorder';
import { BUILDINGS } from '../../shared/settlement/rules';
import type { Building, ResourceNode, SettlementView, Worker } from '../settlement/settlement';

export const VISION_STEP = 8; // 5 Hz at the fixed 40 Hz simulation rate.
export type FogView = { cells: Uint8Array; revision: number; owner: number };
type Memory = {
  owner: number; cells: Uint8Array; territory: Int16Array; borders: Uint8Array;
  buildings: Map<number, Building>; resources: Map<number, ResourceNode>;
};
export type VisionSnapshot = { revision: number; players: {
  owner: number; cells: number[]; territory: number[]; borders?: number[]; buildings: Building[]; resources: ResourceNode[];
}[] };
const copyBuilding=(b:Building):Building=>({...b,queue:[...b.queue],rally:b.rally?{...b.rally}:null,escrow:{...b.escrow},delivered:{...b.delivered},inventory:{...b.inventory}});
const index=(x:number,z:number)=>Math.max(0,Math.min(255,Math.round(z)))*256+Math.max(0,Math.min(255,Math.round(x)));

/** Per-player knowledge. Only this class decides when observations replace remembered state. */
export class Visibility {
  private readonly players: Memory[];
  revision=0;
  constructor(owners: readonly number[]) {
    this.players=[...owners].sort((a,b)=>a-b).map(owner=>({owner,cells:new Uint8Array(65536),territory:new Int16Array(65536).fill(-1),borders:new Uint8Array(65536),buildings:new Map(),resources:new Map()}));
  }
  private disc(cells:Uint8Array,x:number,z:number,r:number) {
    for(let dz=-r;dz<=r;dz++) {
      const pz=z+dz;if(pz<0||pz>=256)continue;
      const span=Math.floor(Math.sqrt(r*r-dz*dz));
      cells.fill(2,pz*256+Math.max(0,x-span),pz*256+Math.min(255,x+span)+1);
    }
  }
  update(buildings:readonly Building[],workers:readonly Worker[],resources:readonly ResourceNode[],territory:Int16Array) {
    this.revision++;
    for(const p of this.players) {
      p.cells=p.cells.slice();p.territory=p.territory.slice();p.borders=p.borders.slice();
      for(let i=0;i<65536;i++)if(p.cells[i]===2)p.cells[i]=1;
      for(const b of buildings)if(b.owner===p.owner && b.health>0)
        this.disc(p.cells,b.x,b.z,b.complete?(b.kind==='fort'?42:b.kind==='tower'?22:12):8);
      for(const w of workers)if(w.owner===p.owner)this.disc(p.cells,w.x,w.z,10);
      // A visible footprint is enough to identify a building, including large forts at the edge.
      for(const [id,b] of p.buildings) if(this.buildingVisible(p,b))p.buildings.delete(id);
      for(const b of buildings)if(b.owner!==p.owner && b.health>0 && this.buildingVisible(p,b))p.buildings.set(b.id,copyBuilding(b));
      for(const n of resources)if(p.cells[index(n.x,n.z)]===2)p.resources.set(n.id,{...n,claimed:0});
      for(let i=0;i<65536;i++)if(p.cells[i]===2) {
        p.territory[i]=territory[i]!;
        // Observe the real edge, never derive one from the edge of explored land.
        p.borders[i]=territoryBorder(territory,i%256,Math.floor(i/256));
      }
    }
  }
  private buildingVisible(p:Memory,b:Building) {
    const r=BUILDINGS[b.kind].radius;
    for(let z=Math.max(0,b.z-r);z<=Math.min(255,b.z+r);z++)
      for(let x=Math.max(0,b.x-r);x<=Math.min(255,b.x+r);x++)if(p.cells[z*256+x]===2)return true;
    return false;
  }
  visible(owner:number,x:number,z:number){return this.players.find(p=>p.owner===owner)?.cells[index(x,z)]===2;}
  project(state:SettlementView,owner:number):SettlementView {
    const p=this.players.find(p=>p.owner===owner);
    if(!p)throw new Error('Unknown visibility player');
    const buildings=state.buildings.filter(b=>b.owner===owner);
    for(const remembered of p.buildings.values()) {
      const current=state.buildings.find(b=>b.id===remembered.id);
      const visible=!!current && this.buildingVisible(p,current);
      buildings.push({...copyBuilding(remembered),remembered:!visible});
    }
    return {...state,
      revision:this.revision,
      fog:{owner,cells:p.cells,revision:this.revision},
      buildings:buildings.sort((a,b)=>a.id-b.id),
      workers:state.workers.filter(w=>w.owner===owner || p.cells[index(w.x,w.z)]===2).map(w=>w.owner===owner?w:{...w,shipment:w.shipment?{...w.shipment,source:0,target:0}:null,building:0,resource:0,path:[]}),
      resources:[...p.resources.values()].map(n=>({...n})),
      colonies:state.colonies.filter(c=>c.owner===owner),
      territory:p.territory,
      territoryBorders:p.borders,
      events:state.events.filter(e=>e.owner===owner),
    };
  }
  /** Save alongside the full simulation, never reconstruct exploration from current positions. */
  snapshot():VisionSnapshot {
    return {revision:this.revision,players:this.players.map(p=>({owner:p.owner,cells:Array.from(p.cells),territory:Array.from(p.territory),borders:Array.from(p.borders),buildings:[...p.buildings.values()].map(copyBuilding),resources:[...p.resources.values()].map(n=>({...n}))}))};
  }
  restore(snapshot:VisionSnapshot) {
    if(!Number.isSafeInteger(snapshot.revision)||snapshot.revision<0||snapshot.players.length!==this.players.length)throw new Error('Invalid vision snapshot');
    for(const p of this.players){
      const saved=snapshot.players.find(s=>s.owner===p.owner);
      if(!saved||saved.cells.length!==65536||saved.territory.length!==65536||saved.cells.some(v=>v!==0&&v!==1&&v!==2))throw new Error('Invalid vision grid');
      if(saved.borders && (saved.borders.length!==65536 || saved.borders.some(v=>!Number.isInteger(v)||v<0||v>4)))throw new Error('Invalid border memory');
    }
    this.revision=snapshot.revision;
    for(const p of this.players){const s=snapshot.players.find(s=>s.owner===p.owner)!;p.cells.set(s.cells);p.territory.set(s.territory);p.borders.set(s.borders??new Uint8Array(65536));p.buildings=new Map(s.buildings.map(b=>[b.id,copyBuilding(b)]));p.resources=new Map(s.resources.map(n=>[n.id,{...n}]));}
  }
  checksum():number {
    let h=2166136261;const mix=(n:number)=>{h=Math.imul(h^n,16777619);};
    mix(this.revision);
    for(const p of this.players){mix(p.owner);for(let i=0;i<65536;i++){mix(p.cells[i]!);mix(p.territory[i]!);mix(p.borders[i]!);}const text=JSON.stringify([[...p.buildings.values()],[...p.resources.values()]]);for(let i=0;i<text.length;i++)mix(text.charCodeAt(i));}
    return h>>>0;
  }
}
