import {expect,it} from 'vitest';
import {SectorIndex} from '../../src/shared/spatial/sectors';
it('local query work stays constant when distant map population grows',()=>{
 for(const size of [128,256,512,1024]){
  const index=new SectorIndex<number>();
  for(let y=0;y<size;y+=4)for(let x=0;x<size;x+=4){const id=y*size+x;index.set(id,id,{minX:x,minY:y,maxX:x,maxY:y});}
  const found=[...index.query({minX:32,minY:32,maxX:47,maxY:47})];
  expect(found).toHaveLength(16);expect(index.visits).toEqual({sectors:1,candidates:16});
 }
});
it('deduplicates spanning footprints and moves/removes them without stale sector entries',()=>{
 const index=new SectorIndex<string>();index.set(1,'bridge',{minX:15,minY:15,maxX:34,maxY:34});
 expect([...index.query({minX:0,minY:0,maxX:48,maxY:48})]).toEqual(['bridge']);
 index.set(1,'bridge',{minX:64,minY:64,maxX:80,maxY:80});
 expect([...index.query({minX:0,minY:0,maxX:48,maxY:48})]).toEqual([]);
 index.delete(1);expect([...index.query({minX:64,minY:64,maxX:80,maxY:80})]).toEqual([]);
});
it('matches a brute ordered scan across negative coordinates, boundary overlaps and updates',()=>{
 const index=new SectorIndex<number>(8),rows=new Map<number,{bounds:{minX:number;minY:number;maxX:number;maxY:number};stamp:number;loX:number;loY:number;hiX:number;hiY:number}>();
 let seed=3513,stamp=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let step=0;step<800;step++){
  const id=Math.floor(random()*60);
  if(step%7===0){index.delete(id);rows.delete(id);}
  else {
   const x=Math.floor(random()*160)-80,y=Math.floor(random()*160)-80;
   const bounds={minX:x,minY:y,maxX:x+Math.floor(random()*40),maxY:y+Math.floor(random()*40)};
   const old=rows.get(id),loX=Math.floor(bounds.minX/8),loY=Math.floor(bounds.minY/8),hiX=Math.floor(bounds.maxX/8),hiY=Math.floor(bounds.maxY/8);
   const same=old&&old.loX===loX&&old.loY===loY&&old.hiX===hiX&&old.hiY===hiY;
   rows.set(id,{bounds,loX,loY,hiX,hiY,stamp:same?old.stamp:stamp++});index.set(id,id,bounds);
  }
  const x=Math.floor(random()*160)-80,y=Math.floor(random()*160)-80,q={minX:x,minY:y,maxX:x+Math.floor(random()*80),maxY:y+Math.floor(random()*80)};
  const loX=Math.floor(q.minX/8),loY=Math.floor(q.minY/8),hiX=Math.floor(q.maxX/8),hiY=Math.floor(q.maxY/8);
  const candidates=[...rows].filter(([,e])=>e.hiX>=loX&&e.loX<=hiX&&e.hiY>=loY&&e.loY<=hiY);
  const expected=candidates.filter(([,e])=>e.bounds.maxX>=q.minX&&e.bounds.minX<=q.maxX&&e.bounds.maxY>=q.minY&&e.bounds.minY<=q.maxY)
   .sort(([,a],[,b])=>Math.max(loY,a.loY)-Math.max(loY,b.loY)||Math.max(loX,a.loX)-Math.max(loX,b.loX)||a.stamp-b.stamp).map(([id])=>id);
  expect([...index.query(q)]).toEqual(expected);
  expect(index.visits).toEqual({sectors:(hiX-loX+1)*(hiY-loY+1),candidates:candidates.length});
 }
});
it('supports interleaved read-only queries without sharing their deduplication state',()=>{
 const index=new SectorIndex<number>(8);
 for(let i=0;i<4;i++)index.set(i,i,{minX:i*5,minY:i*3,maxX:35,maxY:35});
 const bounds={minX:0,minY:0,maxX:40,maxY:40},first=index.query(bounds)[Symbol.iterator]();
 expect(first.next().value).toBe(0);expect([...index.query(bounds)]).toEqual([0,1,2,3]);
 expect([...{[Symbol.iterator]:()=>first}]).toEqual([1,2,3]);
});
