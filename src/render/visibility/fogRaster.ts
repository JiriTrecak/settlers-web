export type FogRect={loX:number;hiX:number;loZ:number;hiZ:number};

/** Small separable blur, restricted to changed rows. Sparse decks normalize
 * against their actual footprint, so a narrow bridge does not darken itself. */
export class FogRaster {
 readonly light:Uint8Array;
 private readonly previous:Uint8Array;
 private readonly horizontal:Float32Array;
 constructor(readonly size:number,private readonly mask?:Uint8Array|Uint32Array){
  this.light=new Uint8Array(size*size);this.previous=new Uint8Array(size*size).fill(255);
  this.horizontal=new Float32Array(size*size);
 }
 update(cells:Uint8Array):FogRect|null{
  let loX=this.size,hiX=-1,loZ=this.size,hiZ=-1;
  for(let i=0;i<cells.length;i++)if(this.previous[i]!==cells[i]){
   this.previous[i]=cells[i]!;const x=i%this.size,z=Math.floor(i/this.size);
   loX=Math.min(loX,x);hiX=Math.max(hiX,x);loZ=Math.min(loZ,z);hiZ=Math.max(hiZ,z);
  }
  if(hiX<0)return null;
  loX=Math.max(0,loX-2);hiX=Math.min(this.size-1,hiX+2);
  if(this.mask){
   // Decks occupy very few cells. A grouped kernel prevents light bleeding
   // between nearby, disconnected decks that share an atlas tile.
   loZ=Math.max(0,loZ-2);hiZ=Math.min(this.size-1,hiZ+2);
   for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
    const cell=z*this.size+x,label=this.mask[cell];let sum=0,weight=0;
    if(label)for(let dz=-2;dz<=2;dz++)for(let dx=-2;dx<=2;dx++){
     const xx=x+dx,zz=z+dz,i=zz*this.size+xx;
     if(xx<0||xx>=this.size||zz<0||zz>=this.size||this.mask[i]!==label)continue;
     sum+=cells[i]===2?255:cells[i]===1?90:0;weight++;
    }
    this.light[cell]=weight?Math.round(sum/weight):0;
   }
   return {loX,hiX,loZ,hiZ};
  }
  for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
   let sum=0;
   for(let dx=-2;dx<=2;dx++){
    const xx=x+dx,i=z*this.size+xx;if(xx<0||xx>=this.size)continue;
    sum+=cells[i]===2?255:cells[i]===1?90:0;
   }
   this.horizontal[z*this.size+x]=sum;
  }
  loZ=Math.max(0,loZ-2);hiZ=Math.min(this.size-1,hiZ+2);
  for(let z=loZ;z<=hiZ;z++)for(let x=loX;x<=hiX;x++){
   let sum=0;
   for(let dz=-2;dz<=2;dz++)if(z+dz>=0&&z+dz<this.size)sum+=this.horizontal[(z+dz)*this.size+x]!;
   this.light[z*this.size+x]=Math.round(sum/25);
  }
  return {loX,hiX,loZ,hiZ};
 }
}
