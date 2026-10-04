import {expect,it} from 'vitest';
import {TacticalTerrain,SIGHT_HEIGHT_CM,MAX_GROUND_STEP_CM,type TerrainPoint} from '../../src/shared/map/tacticalTerrain';

/** Deliberately brute-force reference: no acceleration structures or cached endpoints. */
function reference(size:number,heights:Int16Array){
 const height=(p:TerrainPoint)=>{
  const x=Math.max(0,Math.min(size-1,p.x)),y=Math.max(0,Math.min(size-1,p.y)),ix=Math.floor(x),iy=Math.floor(y),jx=Math.min(ix+1,size-1),jy=Math.min(iy+1,size-1),u=x-ix,v=y-iy;
  return (heights[iy*size+ix]*(1-u)+heights[iy*size+jx]*u)*(1-v)+(heights[jy*size+ix]*(1-u)+heights[jy*size+jx]*u)*v;
 };
 const steps=(a:TerrainPoint,b:TerrainPoint)=>Math.max(1,Math.ceil(Math.max(Math.abs(b.x-a.x),Math.abs(b.y-a.y))*4));
 const point=(a:TerrainPoint,b:TerrainPoint,t:number)=>({x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t});
 const shotClear=(a:TerrainPoint,b:TerrainPoint)=>{
  const from=height(a)+(a.elevation??0)*100+SIGHT_HEIGHT_CM,to=height(b)+(b.elevation??0)*100+SIGHT_HEIGHT_CM,n=steps(a,b);
  for(let i=1;i<n;i++)if(height(point(a,b,i/n))>from+(to-from)*(i/n))return false;
  return true;
 };
 const meleeClear=(a:TerrainPoint,b:TerrainPoint)=>{
  if(Math.abs(height(a)-height(b))>MAX_GROUND_STEP_CM)return false;
  const n=steps(a,b),length=Math.hypot(b.x-a.x,b.y-a.y)/n;let prev=height(a);
  for(let i=1;i<=n;i++){const h=height(point(a,b,i/n));if(Math.abs(h-prev)>MAX_GROUND_STEP_CM*length+1)return false;prev=h;}
  return true;
 };
 return {height,shotClear,meleeClear,visible:(a:TerrainPoint,b:TerrainPoint)=>height(b)+(b.elevation??0)*100<=height(a)+(a.elevation??0)*100+SIGHT_HEIGHT_CM&&shotClear(a,b)};
}

it('matches brute-force terrain rays across ridges, block boundaries, elevated decks and fractional positions',()=>{
 let seed=19273;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(const size of [17,32,67]){
  const heights=Int16Array.from({length:size*size},(_,i)=>Math.round(180*Math.sin((i%size)/7)+95*Math.cos(Math.floor(i/size)/3)+(random()<.04?500:0)));
  const terrain=new TacticalTerrain(size,heights),brute=reference(size,heights);
  for(let i=0;i<3000;i++){
   const a={x:random()*(size-1),y:random()*(size-1),elevation:random()<.2?random()*8:0};
   const b=i%20===0?a:{x:random()*(size-1),y:random()*(size-1),elevation:random()<.2?random()*8:0};
   expect(terrain.height(a)).toBe(brute.height(a));
   expect(terrain.shotClear(a,b)).toBe(brute.shotClear(a,b));
   expect(terrain.visible(a,b)).toBe(brute.visible(a,b));
   expect(terrain.meleeClear(a,b)).toBe(brute.meleeClear(a,b));
  }
 }
});
