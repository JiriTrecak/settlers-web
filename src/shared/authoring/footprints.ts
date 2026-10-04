/** Broad phase for vegetation exclusions and minimum spacing. Eight-metre cells
 * reduce false candidates in dense undergrowth; the exact circle test is unchanged.
 * Circles occupy every intersected cell, including negative coordinates. */
export class Footprints{
 private rows=new Map<number,Map<number,{x:number;z:number;r:number}[]>>();
 add(x:number,z:number,r:number){
  const point={x,z,r};
  for(let iz=Math.floor((z-r)/8);iz<=Math.floor((z+r)/8);iz++){
   let row=this.rows.get(iz);if(!row)this.rows.set(iz,row=new Map());
   for(let ix=Math.floor((x-r)/8);ix<=Math.floor((x+r)/8);ix++){
    let bucket=row.get(ix);if(!bucket)row.set(ix,bucket=[]);bucket.push(point);
   }
  }
 }
 intersects(x:number,z:number,r:number):boolean{
  for(let iz=Math.floor((z-r)/8);iz<=Math.floor((z+r)/8);iz++){
   const row=this.rows.get(iz);if(!row)continue;
   for(let ix=Math.floor((x-r)/8);ix<=Math.floor((x+r)/8);ix++){
    const bucket=row.get(ix);if(!bucket)continue;
    for(const p of bucket){const dx=x-p.x,dz=z-p.z,limit=r+p.r;
     if(dx*dx+dz*dz>(limit+1e-10)*(limit+1e-10))continue;
     if(Math.hypot(dx,dz)<limit)return true;
    }
   }
  }
  return false;
 }
}
