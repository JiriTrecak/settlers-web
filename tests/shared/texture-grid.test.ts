import {expect,it} from 'vitest';
import {textureGridLayout} from '../../src/shared/map/textureGrid';
import {HeightField} from '../../src/shared/map/height';
import {encodeBytes,flatTerrainData,restoreTerrain,terrainDataSchema} from '../../src/shared/map/terrainData';
import {captureTerrain} from '../../src/shared/authoring/captureTerrain';
import {editTerrainGrid} from '../../src/shared/authoring/gridTerrain';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {terrainMaskBytes} from '../../src/render/terrain/terrainMasks';
import {importedTerrainSchema,unpackSourceBytes} from '../../src/shared/map/importedTerrain';

const material='asset.terrain.warcraft-lgrs';
it('covers a scaled atlas through both halo edges without changing the building grid',()=>{
 expect(textureGridLayout([-16,-16],[544,544])).toMatchObject({cellSize:4,start:[-16.5,-16.5],cells:[136,136],count:136**2});
 expect(textureGridLayout([-16,-16],[672,672],{cellSize:5,origin:[-.5,-.5]})).toMatchObject({start:[-20.5,-20.5],cells:[136,136],count:136**2});
});
it('round-trips the atlas grid and variants through editable terrain and subsequent painting',()=>{
 const data=flatTerrainData(16,2),grid={cellSize:5,origin:[-.5,-.5] as [number,number]};data.textureGrid=grid;
 const tiles=textureGridLayout([-16,-16],[48,48],grid);
 data.paint=[{material,weights:data.heights,variants:encodeBytes(new Uint8Array(tiles.count))}];
 // Unit-valued coverage is independent of height.
 data.paint[0].weights=flatTerrainData(16,1).heights;
 expect(terrainDataSchema.safeParse(data).success).toBe(true);
 expect(terrainDataSchema.safeParse({...data,paint:[{...data.paint[0],variants:encodeBytes(new Uint8Array(144))}]}).success).toBe(false);
 const field=new HeightField(16);restoreTerrain(field,data);expect(captureTerrain(field)).toEqual(data);
 const edited=editTerrainGrid(data,{selection:{type:'rectangle',from:{x:0,z:0},to:{x:3,z:3}},operation:{type:'material',material,variant:1}}).terrain;
 expect(edited.textureGrid).toEqual(grid);expect(terrainDataSchema.safeParse(edited).success).toBe(true);
 const variants=unpackSourceBytes(edited.paint[0].variants!);
 expect(variants[4*11+4]).toBe(1);expect(variants[0]).toBe(0);
 restoreTerrain(field,edited);const source=authoredTerrain(field,[],[]);
 // Supply serialized masks for validation: normal rendering uses weak mask bindings.
 const serialized={...source,layers:source.layers.map((l,i)=>i?{...l,mask:encodeBytes(terrainMaskBytes(l)!)}:l)};
 expect(importedTerrainSchema.safeParse(serialized).success).toBe(true);
 const layer=source.layers.find(l=>l.ar===material)!;
 expect(unpackSourceBytes(layer.connections!)).toHaveLength(121);
 expect(unpackSourceBytes(layer.connections!)[4*11+4]).toBe(31);
 expect(layer.variants).toBe(edited.paint[0].variants);
});
