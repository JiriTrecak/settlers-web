import {expect,it} from 'vitest';
import {waterProfileSchema,DEFAULT_WATER_WAVES} from '../../src/shared/authoring/recipes';
import {waterSurface,WATER_PROFILE_ROWS} from '../../src/render/water/waterSurface';
import {HeightField} from '../../src/shared/map/height';
import {landscapeAssets} from '../../src/shared/authoring/project';
import {flatTerrainData,restoreTerrain} from '../../src/shared/map/terrainData';
import {biomeById} from '../../src/content/biomes';

it('validates authored wave controls and rejects inverted depth transitions',()=>{
 const profile=landscapeAssets.find(a=>a.id==='water.clear-forest')!.water!;
 expect(waterProfileSchema.parse(profile).waves).toEqual(profile.waves);
 for(const patch of [{height:-1},{length:0},{speed:Infinity},{depthEnd:.2,depthStart:.5},{shallowStrength:2},{shoreWidth:0},{crestStrength:NaN}]){
  expect(waterProfileSchema.safeParse({...profile,waves:{...DEFAULT_WATER_WAVES,...patch}}).success).toBe(false);
 }
});

it('packs independent default and local wave settings without changing saved water or topology',()=>{
 const field=new HeightField(32);restoreTerrain(field,flatTerrainData(32,-2,0));
 field.cellWater!.profiles=['water.muddy'];field.cellWater!.flow[3]=1;
 const original=structuredClone(field.cellWater),heights=field.samples.slice(),first=waterSurface(field);
 const profiles=[landscapeAssets.find(a=>a.id===biomeById(field.biome).waterProfile)!.water!,landscapeAssets.find(a=>a.id==='water.muddy')!.water!];
 expect(first.profiles).toHaveLength(256*WATER_PROFILE_ROWS*4);
 profiles.forEach((p,id)=>{
  const w=p.waves??DEFAULT_WATER_WAVES;
  const packed=Array.from(first.profiles!.slice((1024+id)*4,(1024+id)*4+4));
  [w.height,w.length,w.speed,w.depthEnd].forEach((n,i)=>expect(packed[i]).toBeCloseTo(n));
  const shore=Array.from(first.profiles!.slice((1280+id)*4,(1280+id)*4+4));
  [w.depthStart,w.shallowStrength,w.shoreWidth,w.crestStrength].forEach((n,i)=>expect(shore[i]).toBeCloseTo(n));
 });
 expect(field.samples).toEqual(heights);expect(field.cellWater).toEqual(original);
 expect(waterSurface(field).tiles).toEqual(first.tiles);
});
