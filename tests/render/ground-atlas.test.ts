import {expect,it} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {captureTerrain} from '../../src/shared/authoring/captureTerrain';
import {restoreTerrain,terrainDataSchema} from '../../src/shared/map/terrainData';
import {groundTextures} from '../../src/shared/authoring/groundTextures';
import {terrainMaskBytes} from '../../src/render/terrain/terrainMasks';

it('resolves the lower material as a full base and the upper material as a north-west corner',()=>{
 const field=new HeightField(16);field.samples.fill(2);field.waterLevel=-4;
 field.surfacePaint=[{owner:'terrain',material:'asset.terrain.warcraft-ldrt',weights:new Float32Array(field.samples.length).fill(1)},
  {owner:'terrain',material:'asset.terrain.warcraft-lgrs',weights:Float32Array.from(field.samples,(_,i)=>field.origin+i%field.verts<2&&field.origin+Math.floor(i/field.verts)<2?1:0)}];
 const source=authoredTerrain(field,[],[]),cells=field.span/4,i=(-field.origin/4)*cells-field.origin/4;
 const dirt=source.layers.find(l=>l.ar==='asset.terrain.warcraft-ldrt')!,grass=source.layers.find(l=>l.ar==='asset.terrain.warcraft-lgrs')!;
 expect(Buffer.from(dirt.connections!,'base64')[i]).toBe(16|14);
 expect(Buffer.from(grass.connections!,'base64')[i]).toBe(1);
 expect(groundTextures.get(grass.ar)?.terrain?.atlas.corners?.[1]).toBe(16);
});

it('keeps every declared ground material, including those beyond the six biome slots',()=>{
 const field=new HeightField(16);field.samples.fill(2);field.waterLevel=-4;
 const materials=[...groundTextures.keys()];
 field.surfacePaint=materials.map((material,k)=>({owner:'terrain',material,weights:Float32Array.from(field.samples,(_,i)=>i%materials.length===k?1:0)}));
 const source=authoredTerrain(field,[],[]);
 expect(source.layers.length).toBe(6+materials.length);
 materials.forEach((id,k)=>expect(terrainMaskBytes(source.layers.find(l=>l.ar===id))?.[k]).toBe(255));
 const saved=terrainDataSchema.parse(captureTerrain(field));
 expect(JSON.stringify(saved)).not.toMatch(/connections|layerSlots|authored-layered/);
 const restored=new HeightField(16);restoreTerrain(restored,saved);
 const loaded=authoredTerrain(restored,[],[]);
 expect(loaded.layers.map(l=>l.ar)).toEqual(source.layers.map(l=>l.ar));
 for(let j=6;j<source.layers.length;j++)expect(loaded.layers[j].connections).toBe(source.layers[j].connections);
});

it('stores painted variations and preserves them through edits and save/load',async()=>{
 const {editTerrainGrid}=await import('../../src/shared/authoring/gridTerrain');
 const {flatTerrainData,decodeBytes}=await import('../../src/shared/map/terrainData');
 const material='asset.terrain.warcraft-lgrs',selection={type:'rectangle' as const,from:{x:0,z:0},to:{x:4,z:4}};
 const painted=editTerrainGrid(flatTerrainData(16),{selection,operation:{type:'material',material}}).terrain;
 const variants=decodeBytes(painted.paint[0].variants!);
 expect(new Set(variants).size).toBeGreaterThan(5);
 const raised=editTerrainGrid(painted,{selection,operation:{type:'level',level:2}}).terrain;
 expect(raised.paint[0].variants).toBe(painted.paint[0].variants);
 const parsed=terrainDataSchema.parse(JSON.parse(JSON.stringify(raised))),field=new HeightField(16);
 restoreTerrain(field,parsed);
 expect(authoredTerrain(field,[],[]).layers.find(l=>l.ar===material)?.variants).toBe(raised.paint[0].variants);
 const specified=editTerrainGrid(parsed,{selection,operation:{type:'material',material,variant:17}}).terrain;
 const cells=field.span/4,stored=decodeBytes(specified.paint[0].variants!);
 expect(stored[4*cells+4]).toBe(17);
 expect(()=>editTerrainGrid(parsed,{selection,operation:{type:'material',material,variant:18}})).toThrow(/variant/);
 expect(terrainDataSchema.safeParse({...parsed,paint:[{...parsed.paint[0],variants:'AA=='}]}).success).toBe(false);
});
