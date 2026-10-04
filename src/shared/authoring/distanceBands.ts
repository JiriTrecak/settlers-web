/** Conservative tile bounds for a signed distance field. Distance is 1-Lipschitz:
 * anywhere inside a tile differs from its centre by at most the half diagonal.
 * Reject candidates only when the whole tile misses the requested distance band;
 * return the original exact distance for every surviving candidate. */
export function distanceBands(distance:(x:number,z:number)=>number,size=8){
 const rows=new Map<number,Map<number,number>>(),radius=size*Math.SQRT1_2+1e-9;
 const tileDistance=(x:number,z:number):number=>{
  const ix=Math.floor(x/size),iz=Math.floor(z/size);
  let row=rows.get(iz);if(!row)rows.set(iz,row=new Map());
  let center=row.get(ix);
  if(center===undefined){center=distance((ix+.5)*size,(iz+.5)*size);row.set(ix,center);}
  return center;
 };
 const intersects=(x:number,z:number,min:number,max=Infinity):boolean=>{
  const center=tileDistance(x,z);return !(center+radius<min||center-radius>max);
 };
 return {distance,intersects,contains(x:number,z:number,min:number,max=Infinity):boolean{
  const center=tileDistance(x,z);
  if(center+radius<min||center-radius>max)return false;
  if(center-radius>=min&&center+radius<=max)return true;
  const value=distance(x,z);return value>=min&&value<=max;
 },within(x:number,z:number,min:number,max=Infinity):number|undefined{
  if(!intersects(x,z,min,max))return undefined;
  const value=distance(x,z);return value<min||value>max?undefined:value;
 }};
}
