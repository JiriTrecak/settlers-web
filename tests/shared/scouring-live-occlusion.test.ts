import {it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
import {liveSourceOcclusion} from '../../src/render/prop/liveSourceOcclusion';
import {ReferenceGround} from '../../src/render/prop/referenceGround';
import {sourceHeight,unpackSourceBytes} from '../../src/shared/map/importedTerrain';
import {addPlantOcclusion} from '../../scripts/maps/scouring/occlusion';
import type {UtcMap,MapStamp} from '../../src/shared/map/utcmap';
import {HeightField} from '../../src/shared/map/height';

it('matches a full source bake after removal, move, resize, and undo while updating local sectors only',()=>{
 const map=JSON.parse(readFileSync('assets/maps/showcase/scouring-eldenvale.utcmap','utf8')) as UtcMap;
 const source=map.landscape!.importedTerrain!,dynamic=source.occlusion!.dynamic!,state=liveSourceOcclusion(source);
 const original=unpackSourceBytes(source.occlusion!.rgba),sprite=unpackSourceBytes(dynamic.sprite.red);
 const ground=new ReferenceGround();ground.updateSource(sourceHeight(source));
 const heightBefore=new Float32Array(ground.texture.value.image.data as Float32Array),underlayBefore=new Uint8Array(ground.underlay.value.image.data as Uint8Array);
 const target=dynamic.plants[Math.floor(dynamic.plants.length/2)]!;
 state.sync(map.stamps);expect(state.lastUpdate.sectors).toBe(0);
 function rebuild(stamps:readonly MapStamp[]){
  const placed=new Map(stamps.map(s=>[s.id,s])),raster={size:source.occlusion!.size,rgba:unpackSourceBytes(dynamic.base)};
  addPlantOcclusion(raster,dynamic.plants.flatMap(p=>{
   const s=placed.get(p.id);return s&&s.asset===p.asset?[{stamp:s,size:p.size,height:p.height*(s.scale??1)/p.scale,intensity:p.intensity}]:[];
  }),sprite,dynamic.sprite.size,source.origin);return raster.rgba;
 }
 const removed=map.stamps.filter(s=>s.id!==target.id);state.sync(removed);
 expect(state.rgba).toEqual(rebuild(removed));expect(state.rgba).not.toEqual(original);
 expect(state.lastUpdate.texels).toBeLessThan(4096);expect(state.lastUpdate.casterVisits).toBeLessThan(dynamic.plants.length/4);
 const rows=ground.texture.value.updateRanges;
 expect(rows.length).toBeGreaterThan(0);expect(rows.every(r=>r.count<ground.texture.value.image.width*4)).toBe(true);
 // Updating packed shading must never deform terrain or change underlay alpha.
 let alteredHeights=0,alteredMask=0;
 for(let i=0;i<heightBefore.length;i+=4)if(ground.texture.value.image.data![i]!==heightBefore[i])alteredHeights++;
 for(let i=0;i<underlayBefore.length;i+=4)if(ground.underlay.value.image.data![i]!==underlayBefore[i])alteredMask++;
 expect(alteredHeights).toBe(0);expect(alteredMask).toBe(0);
 const moved=map.stamps.map(s=>s.id===target.id?{...s,x:s.x+30,y:s.y-12,scale:(s.scale??1)*1.2}:s);
 state.sync(moved);expect(state.rgba).toEqual(rebuild(moved));
 state.sync(map.stamps);expect(state.rgba).toEqual(original);
 expect(source.occlusion!.rgba).toBe(Buffer.from(original).toString('base64'));
 const revision=ground.texture.value.version;state.sync(map.stamps);expect(ground.texture.value.version).toBe(revision);
 ground.dispose();state.sync(removed);expect(ground.texture.value.version).toBe(revision);
});

it('shares imported GPU images, keeps surviving consumers live, and releases the final subscription',()=>{
 const map=JSON.parse(readFileSync('assets/maps/showcase/scouring-eldenvale.utcmap','utf8')) as UtcMap;
 const source=map.landscape!.importedTerrain!,field=sourceHeight(source),state=liveSourceOcclusion(source);
 const consumers=Array.from({length:4},()=>new ReferenceGround());
 for(const consumer of consumers)consumer.updateSource(field);
 const first=consumers[0]!,last=consumers[3]!;
 expect(state.subscriberCount).toBe(1);
 for(const consumer of consumers){
  expect(consumer.texture.value).toBe(first.texture.value);
  expect(consumer.underlay.value).toBe(first.underlay.value);
  expect(consumer.color.value).toBe(first.color.value);
 }
 let releases=0;const texture=first.texture.value;
 texture.addEventListener('dispose',()=>releases++);
 first.dispose();expect(releases).toBe(0);expect(state.subscriberCount).toBe(1);
 // Switching another consumer back to native terrain must neither mutate nor
 // free the images still used by the remaining imported surfaces.
 const native=new HeightField(16);native.samples.fill(7);
 consumers[1]!.update(native);
 expect(consumers[1]!.texture.value).not.toBe(texture);
 expect(releases).toBe(0);
 const version=texture.version,target=source.occlusion!.dynamic!.plants[0]!;
 state.sync(map.stamps.filter(s=>s.id!==target.id));
 expect(last.texture.value.version).toBeGreaterThan(version);
 consumers[1]!.dispose();consumers[2]!.dispose();
 expect(releases).toBe(0);expect(state.subscriberCount).toBe(1);
 last.dispose();expect(releases).toBe(1);expect(state.subscriberCount).toBe(0);
 // Re-acquisition uses the current edited raster, not stale serialized pixels.
 const recreated=new ReferenceGround();recreated.updateSource(field);
 expect(recreated.texture.value).not.toBe(texture);expect(state.subscriberCount).toBe(1);
 const beforeRestore=new Uint8Array(recreated.underlay.value.image.data as Uint8Array);
 state.sync(map.stamps);
 expect(recreated.underlay.value.image.data).not.toEqual(beforeRestore);
 recreated.dispose();expect(state.subscriberCount).toBe(0);
});
