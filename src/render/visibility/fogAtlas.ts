import {DataTexture,LinearFilter,Vector2,Vector4} from 'three';
import type {FogDeckNode} from '../../sim/game/observation';
import {FogRaster} from './fogRaster';
import {MAX_GROUND_STEP_CM} from '../../shared/map/tacticalTerrain';

/** One tile per overlapping floor, not one full texture per bridge. Nonoverlapping
 * bridges reuse the same tile even when their authored levels/heights differ.
 * R = blurred visibility, GB = encoded floor height, A = floor exists. */
export class FogAtlas {
 readonly texture:DataTexture;
 readonly columns:number;
 readonly rows:number;
 readonly count:number;
 readonly heightRange:Vector2;
 readonly bounds:Vector4;
 private readonly pixels:Uint8Array;
 private readonly rasters:FogRaster[];
 private readonly states:Uint8Array[];
 private readonly ranks:Uint16Array;
 private previous:Uint8Array|undefined;
 private revision:number|undefined;
 constructor(readonly size:number,readonly decks:readonly FogDeckNode[]){
  const columns=new Map<number,number[]>();
  for(let i=0;i<decks.length;i++){const cell=decks[i]!.cell,column=columns.get(cell)??[];column.push(i);columns.set(cell,column);}
  this.ranks=new Uint16Array(decks.length);let count=1,min=Infinity,max=-Infinity;
  let minX=size,minZ=size,maxX=-1,maxZ=-1;
  for(const {cell} of decks){const x=cell%size,z=Math.floor(cell/size);minX=Math.min(minX,x);minZ=Math.min(minZ,z);maxX=Math.max(maxX,x);maxZ=Math.max(maxZ,z);}
  this.bounds=new Vector4(minX-.5,minZ-.5,maxX+.5,maxZ+.5);
  for(const column of columns.values()){
   column.sort((a,b)=>decks[a]!.height-decks[b]!.height||a-b);let rank=0,last=-Infinity;
   for(const i of column){const h=decks[i]!.height;if(h!==last){rank++;last=h;}this.ranks[i]=rank;min=Math.min(min,h);max=Math.max(max,h);}
   count=Math.max(count,rank+1);
  }
  this.count=count;this.columns=Math.ceil(Math.sqrt(count));this.rows=Math.ceil(count/this.columns);
  this.heightRange=new Vector2(Number.isFinite(min)?min/100:0,Number.isFinite(max)?Math.max(1,max-min)/100:1);
  this.pixels=new Uint8Array(size*this.columns*size*this.rows*4);
  const masks=Array.from({length:count},()=>new Uint8Array(size*size)),heights=masks.map(()=>new Int32Array(size*size));
  for(let i=0;i<decks.length;i++){
   const d=decks[i]!,rank=this.ranks[i]!,index=this.pixel(rank,d.cell),encoded=Math.round((d.height/100-this.heightRange.x)/this.heightRange.y*65535);
   this.pixels[index+1]=encoded>>8;this.pixels[index+2]=encoded&255;this.pixels[index+3]=255;masks[rank]![d.cell]=1;heights[rank]![d.cell]=d.height;
  }
  this.rasters=masks.map((mask,rank)=>{
   if(!rank)return new FogRaster(size);
   const labels=new Uint32Array(size*size);let label=0;
   for(let cell=0;cell<mask.length;cell++)if(mask[cell]&&!labels[cell]){
    labels[cell]=++label;const open=[cell];
    for(let head=0;head<open.length;head++){
     const from=open[head]!,x=from%size,y=Math.floor(from/size);
     for(const [xx,yy] of [[x-1,y],[x+1,y],[x,y-1],[x,y+1]]){
      const to=yy!*size+xx!;
      if(xx!<0||xx!>=size||yy!<0||yy!>=size||!mask[to]||labels[to]||Math.abs(heights[rank]![from]!-heights[rank]![to]!)>MAX_GROUND_STEP_CM)continue;
      labels[to]=label;open.push(to);
     }
    }
   }
   return new FogRaster(size,labels);
  });this.states=masks.map(()=>new Uint8Array(size*size));
  this.texture=new DataTexture(this.pixels,size*this.columns,size*this.rows);
  this.texture.minFilter=this.texture.magFilter=LinearFilter;this.texture.generateMipmaps=false;this.texture.needsUpdate=true;
 }
 private pixel(rank:number,cell:number):number{
  return ((Math.floor(rank/this.columns)*this.size+Math.floor(cell/this.size))*this.size*this.columns+(rank%this.columns)*this.size+cell%this.size)*4;
 }
 update(cells:Uint8Array,revision=0):void{
  if(cells===this.previous&&revision===this.revision)return;this.previous=cells;this.revision=revision;
  this.states[0]!.set(cells.subarray(0,this.size*this.size));
  for(let rank=1;rank<this.count;rank++)this.states[rank]!.fill(0);
  for(let i=0;i<this.decks.length;i++){const state=this.states[this.ranks[i]!]!,cell=this.decks[i]!.cell;state[cell]=Math.max(state[cell]!,cells[this.size*this.size+i]!);}
  let changed=false;
  for(let rank=0;rank<this.count;rank++){
   const raster=this.rasters[rank]!,rect=raster.update(this.states[rank]!);if(!rect)continue;changed=true;
   for(let z=rect.loZ;z<=rect.hiZ;z++)for(let x=rect.loX;x<=rect.hiX;x++)this.pixels[this.pixel(rank,z*this.size+x)]=raster.light[z*this.size+x]!;
  }
  if(changed)this.texture.needsUpdate=true;
 }
 dispose(){this.texture.dispose();}
}
