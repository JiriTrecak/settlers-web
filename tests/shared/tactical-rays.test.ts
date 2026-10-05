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

it('batch sight footprints match individual rays on shelves, cliffs and edge blocks',()=>{
 let seed=73;const random=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
 for(const size of [17,37,65])for(const rough of [false,true]){
  const heights=Int16Array.from({length:size*size},(_,i)=>Math.round(-150+(rough?250:24)*Math.sin(i%size/3)+(rough?160:12)*Math.cos(Math.floor(i/size)/5)));
  const terrain=new TacticalTerrain(size,heights),brute=reference(size,heights);
  for(let i=0;i<60;i++){
   const raw={x:random()*(size+4)-2,y:random()*(size+4)-2,elevation:[-1,0,1,5][i%4]},origin={...raw,x:Math.round(raw.x),y:Math.round(raw.y)},radius=[.5,3,7.3,16,30][i%5];
   const expected:number[]=[];
   for(let y=0;y<size;y++)for(let x=0;x<size;x++)if((x-origin.x)**2+(y-origin.y)**2<=radius**2&&brute.visible(origin,{x,y}))expected.push(y*size+x);
   const footprint=terrain.visibleSpans(raw,radius),expanded:number[]=[];
   for(let span=0;span<footprint.spans.length;span+=2)
    for(let cell=footprint.spans[span]!;cell<footprint.spans[span+1]!;cell++)expanded.push(cell);
   expect(expanded).toEqual(expected);expect(footprint.cellCount).toBe(expected.length);
   expect([...terrain.visibleCells(raw,radius)]).toEqual(expected);
  }
 }
});


it('keeps large clear footprints compact and materializes stable dense views only on demand',()=>{
 const terrain=new TacticalTerrain(512,new Int16Array(512*512)),origin={x:250,y:250};
 const footprint=terrain.visibleSpans(origin,30);
 expect(footprint.spans.length).toBe(122);expect(footprint.cellCount).toBeGreaterThan(2800);
 expect(terrain.visibleSpans(origin,30)).toBe(footprint);
 const dense=terrain.visibleCells(origin,30),saved=dense.slice();
 expect(dense.length).toBe(footprint.cellCount);
 terrain.visibleSpans({x:251,y:250},30);
 expect(terrain.visibleCells(origin,30)).toBe(dense);expect(dense).toEqual(saved);
});

it('preserves grazing obstructions between clear chunks, including clamped map edges',()=>{
 const size=65,heights=new Int16Array(size*size).fill(-120);
 // Narrow ridges on both sides of four-cell block boundaries. Their bilinear
 // slopes put intersections inside a sample group, not just at its endpoints.
 for(const x of [3,4,15,16,31,32,63])for(let y=8;y<57;y++)heights[y*size+x]=160+(y%3)*80;
 const terrain=new TacticalTerrain(size,heights),brute=reference(size,heights);
 for(const y of [7.75,8,15.99,16.01,32,56.25,64.5])for(const x of [-2,.25,4,15.9,31.75,63.8,66])
  for(const elevation of [0,1.2,2.4,3.199999999,3.2,3.200000001]){
   const a={x,y,elevation},b={x:64-Math.min(64,Math.max(0,x)),y:64-Math.min(64,y),elevation:1.2};
   expect(terrain.shotClear(a,b)).toBe(brute.shotClear(a,b));
   expect(terrain.visible(a,b)).toBe(brute.visible(a,b));
  }
});
