import {describe,it,expect} from 'vitest';
import {BIOMES,MAP_DIMENSIONS,biomeRecipes} from '../../src/content/biomes';
import {createBiomeMap} from '../../src/shared/map/newMap';
import {parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {HeightField} from '../../src/shared/map/height';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {unpackSourceBytes} from '../../src/shared/map/importedTerrain';
import {readFileSync} from 'node:fs';

describe('Biome documents',()=>{
 for(const {size} of MAP_DIMENSIONS)it(`round trips ${size} with valid player starts`,()=>{
  const map=createBiomeMap('  Pinewater  ',size,'vibrant-forest');
  expect(parseUtcMap(JSON.parse(stringifyUtcMap(map)))).toEqual(map);
  expect(map.playerStarts.every(p=>p.x<size&&p.z<size)).toBe(true);
  expect(new HeightField(size).size).toBe(size);
  expect(map.name).toBe('Pinewater');
  expect(map.authoring?.layers).toEqual([]);
 });
 it('rejects unknown biomes instead of silently substituting another look',()=>{
  expect(()=>createBiomeMap('Map',256,'unknown')).toThrow('Unknown biome');
  expect(parseUtcMap({...createBiomeMap('Map',256,'vibrant-forest'),biome:'unknown'})).toBeNull();
 });
 it('every offered recipe resolves to a published asset of the appropriate kind',()=>{
  for(const biome of BIOMES){
   for(const preset of biomeRecipes(biome)){
    const asset=JSON.parse(readFileSync(`art/assets/${preset.id}/asset.json`,'utf8'));
    expect(asset.status).toBe('published');expect(asset.recipe).toBeDefined();
    if(biome.rivers.includes(preset))expect(asset.recipe.type).toBe('river');
   }
   expect(biome.rivers).toHaveLength(2);
  }
 });
 it('bare ground has no invented grass; painting grass affects only its patch',()=>{
  const field=new HeightField(16);field.waterLevel=-1;
  const base=authoredTerrain(field,[],[]);
  expect(unpackSourceBytes(base.layers[1].mask!).some(v=>v>0)).toBe(false);
  const painted=authoredTerrain(field,[{layer:'grass',radius:3,opacity:1,points:[{x:8,z:8},{x:9,z:8}]}],[]);
  const mask=unpackSourceBytes(painted.layers[1].mask!);
  expect(mask.some(v=>v>0)).toBe(true);expect(mask[0]).toBe(0);
 });
});
