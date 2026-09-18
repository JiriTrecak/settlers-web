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
