import {expect,it} from 'vitest';
import {HeightField} from '../../src/shared/map/height';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {terrainTexturePalette,reuseTerrainTexturePalette} from '../../src/render/terrain/terrainTexturePalette';
import {setTerrainMask} from '../../src/render/terrain/terrainMasks';
import {terrainLayerTable} from '../../src/render/terrain/terrainLayerTable';
import {groundTextures} from '../../src/shared/authoring/groundTextures';

const empty=()=>{const source=authoredTerrain(new HeightField(16),[],[]);for(const layer of source.layers.slice(1))setTerrainMask(layer,new Uint8Array(17*17));return source;};
const add=(source:ReturnType<typeof empty>,id:string,weight=255)=>source.layers.push(setTerrainMask({name:id,ar:id,nh:id,tiling:1,blend:0,verticality:0,edge:0,desaturation:0,mask:''},new Uint8Array(17*17).fill(weight)));

it('omits unpainted material pixels while keeping editable layer indices intact',()=>{
 const source=empty();add(source,'asset.terrain.warcraft-ldrt',0);
 const palette=terrainTexturePalette(source);
 expect(palette.names.ar).toEqual([source.layers[0].ar]);expect(palette.names.nh).toEqual([source.layers[0].nh]);expect(palette.names.om).toEqual([]);
 expect(palette.indices.slice(1)).toEqual(Array.from({length:source.layers.length-1},()=>[-1,-1,-1]));
 const table=terrainLayerTable(source,palette);expect([...table.data.slice((table.metadataOffset+6*8)*4+13,(table.metadataOffset+6*8)*4+16)]).toEqual([-1,-1,-1]);
 expect(source.layers).toHaveLength(7);
});

it('retains atlas layers whose resolved full-cell connections extend beyond their weight mask',()=>{
 const source=empty();add(source,'asset.terrain.warcraft-ldrt',0);
 source.layers[6].connections=Buffer.from([16,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]).toString('base64');
 expect(terrainTexturePalette(source).indices[6].every(i=>i>=0)).toBe(true);
});

it('reuses a resident palette for erasure and undo but rejects new pixel data before mutation',()=>{
 const source=empty();add(source,'asset.terrain.warcraft-ldrt');const resident=terrainTexturePalette(source);
 setTerrainMask(source.layers[6],new Uint8Array(17*17));
 const erased=terrainTexturePalette(source),reuse=reuseTerrainTexturePalette(erased,resident)!;
 expect(reuse.indices[6]).toEqual([-1,-1,-1]);expect(reuse.names).toBe(resident.names);
 expect(reuseTerrainTexturePalette(resident,reuse)?.indices).toEqual(resident.indices);
 add(source,'asset.terrain.warcraft-lgrs');expect(reuseTerrainTexturePalette(terrainTexturePalette(source),resident)).toBeUndefined();
 expect(resident.indices[6].every(i=>i>=0)).toBe(true);
});

it('shares identical published channel pixels across the complete library without merging paint declarations',()=>{
 const source=empty();for(const [id,asset] of groundTextures)if(!asset.terrain?.projection)add(source,id);
 const palette=terrainTexturePalette(source),count=[...groundTextures.values()].filter(a=>!a.terrain?.projection).length;
 expect(count).toBe(104);
 expect(palette.names.ar).toHaveLength(84); // 83 unique ground colors + biome base
 expect(palette.names.nh).toHaveLength(81); // 80 unique ground normals + biome base
 expect(palette.names.om).toHaveLength(19);
 expect(palette.indices).toHaveLength(110);
 const table=terrainLayerTable(source,palette);
 palette.indices.forEach((indices,i)=>expect([...table.data.slice((table.metadataOffset+i*8)*4+13,(table.metadataOffset+i*8)*4+16)]).toEqual(indices));
 // Editable assets and their order survive physical deduplication.
 expect(source.layers.slice(6).map(l=>l.ar)).toEqual([...groundTextures].filter(([,a])=>!a.terrain?.projection).map(([id])=>id));
});
