import {unpackSourceBytes,type ImportedTerrain} from './importedTerrain';
/** Source water blocks are 16×16 BGRA flow/foam texels, then 16×16 LE UNORM16 heights.
 * Final four bytes are retained in the map payload; their meaning remains unresolved. */
export class SourceWater {
 readonly width:number;readonly depth:number;
 readonly heights:Float32Array;readonly flow:Uint8Array;
 constructor(readonly source:ImportedTerrain){
  this.width=source.blocks[0]*16;this.depth=source.blocks[1]*16;
  this.heights=new Float32Array(this.width*this.depth).fill(source.heightOffset);
  this.flow=new Uint8Array(this.width*this.depth*4);
  for(let i=0;i<this.heights.length;i++){this.flow[i*4]=128;this.flow[i*4+1]=128;}
  for(const b of source.water){
   const raw=unpackSourceBytes(b.payload),view=new DataView(raw.buffer);
   for(let z=0;z<16;z++)for(let x=0;x<16;x++){
    const local=z*16+x,i=(b.z*16+z)*this.width+b.x*16+x;
    this.heights[i]=view.getUint16(1024+local*2,true)*64/65535+source.heightOffset;
    this.flow[i*4]=raw[local*4+2]!;this.flow[i*4+1]=raw[local*4+1]!;this.flow[i*4+2]=raw[local*4]!;this.flow[i*4+3]=raw[local*4+3]!;
   }
  }
 }
 sample(x:number,z:number):number {
  // Source shader samples a per-cell texture at normalized world coordinates.
  const fx=Math.max(0,Math.min(this.width-1,x-this.source.origin[0]-.5)),fz=Math.max(0,Math.min(this.depth-1,z-this.source.origin[1]-.5));
  const ix=Math.floor(fx),iz=Math.floor(fz),jx=Math.min(ix+1,this.width-1),jz=Math.min(iz+1,this.depth-1),u=fx-ix,v=fz-iz,h=this.heights,w=this.width;
  return (h[iz*w+ix]!*(1-u)+h[iz*w+jx]!*u)*(1-v)+(h[jz*w+ix]!*(1-u)+h[jz*w+jx]!*u)*v;
 }
}
const cache=new WeakMap<ImportedTerrain,SourceWater>();
export function sourceWater(s:ImportedTerrain):SourceWater{let w=cache.get(s);if(!w){w=new SourceWater(s);cache.set(s,w);}return w;}
