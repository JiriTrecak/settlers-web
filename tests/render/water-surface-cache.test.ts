import {expect,it,vi} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {waterSurface} from '../../src/render/water/waterSurface';
it('samples submerged cell centers once and keeps caches local to each construction',()=>{
 const field=new HeightField(32);field.samples.fill(-1);
 const sample=vi.spyOn(field,'sample'),first=waterSurface(field);
 expect(sample).toHaveBeenCalledTimes(field.span*field.span);
 expect(first.tiles.length).toBeGreaterThan(0);
 field.samples.fill(4);expect(waterSurface(field).tiles).toHaveLength(0);
 expect(first.ground.every(v=>v===-1)).toBe(true);
});
it('matches uncached shoreline predicates across shared tile edges and partial outer tiles',()=>{
 for(const size of [32,35]){
  const field=new HeightField(size);
  for(let z=0;z<field.verts;z++)for(let x=0;x<field.verts;x++)field.samples[z*field.verts+x]=Math.sin(x*.7)*Math.cos(z*.3);
  const result=waterSurface(field),wet=(x:number,z:number)=>field.sample(x,z)<=field.waterAt(x,z)+.15;
  for(const block of result.tiles){
   const expected:number[]=[];
   for(let z=0;z<16;z++)for(let x=0;x<16;x++){
    const wx=field.origin+block.x*16+x,wz=field.origin+block.z*16+z;
    if(!wet(wx+.5,wz+.5)&&!wet(wx,wz)&&!wet(wx+1,wz)&&!wet(wx,wz+1)&&!wet(wx+1,wz+1))continue;
    const a=z*17+x,b=a+1,c=a+17,d=c+1;expected.push(a,c,b,b,c,d);
   }
   expect(block.indices).toEqual(expected);
   for(let i=1;i<block.positions.length;i+=3)expect(block.positions[i]).toBe(0);
  }
 }
});

it('keeps biome water in slot zero when local profiles are painted and across biome changes',async()=>{
 const {BIOMES}=await import('../../src/content/biomes');
 const {landscapeAssets}=await import('../../src/shared/authoring/project');
 const {flatTerrainData,restoreTerrain}=await import('../../src/shared/map/terrainData');
 const field=new HeightField(32);restoreTerrain(field,flatTerrainData(32,-2,0));
 field.cellWater!.profiles=['water.muddy'];field.cellWater!.flow[3]=1;
 const original=field.cellWater!.flow.slice(),geometry=waterSurface(field).tiles;
 for(const biome of BIOMES){
  field.biome=biome.id;
  const data=waterSurface(field),style=landscapeAssets.find(a=>a.id===biome.waterProfile)!.water!;
  expect(data.profiles![3]).toBeCloseTo(style.clarity);
  expect(data.profiles![7]).toBeCloseTo(.7); // Explicit muddy profile retains its saved slot.
  expect(data.profiles![512*4+3]).toBeCloseTo(style.foamStrength);
  expect(data.flow).toEqual(original);expect(data.tiles).toEqual(geometry);
 }
 expect(field.cellWater!.flow).toEqual(original);
});
