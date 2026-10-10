import {expect,it} from 'vitest';
import {flatTerrainData,decodeFloats,restoreTerrain} from '../../src/shared/map/terrainData';
import {editTerrainGrid} from '../../src/shared/authoring/gridTerrain';
import {AuthoringHistory} from '../../src/shared/authoring/history';
import {emptyUtcMap,parseUtcMap,stringifyUtcMap} from '../../src/shared/map/utcmap';
import {HeightField} from '../../src/shared/map/height';
import {authoredTerrain} from '../../src/render/terrain/authoredTerrain';
import {terrainMaskBytes} from '../../src/render/terrain/terrainMasks';
import {terrainLayerTable} from '../../src/render/terrain/terrainLayerTable';
import {groundTextures} from '../../src/shared/authoring/groundTextures';

const dirt='asset.terrain.warcraft-ldrt',grass='asset.terrain.warcraft-lgrs',cliff='asset.terrain.warcraft-cliff-cldi',otherCliff='asset.terrain.warcraft-cliff-clgr';
const selection={type:'rectangle' as const,from:{x:2,z:2},to:{x:4,z:4}};
it('paints cliffs and ground independently, with undo, reload and later shape edits',()=>{
 const map=emptyUtcMap(256),history=new AuthoringHistory({...map.authoring,layers:[]});
 const paint=(material:string)=>history.setTerrain(editTerrainGrid(history.document.terrain,{selection,operation:{type:'material',material}}).terrain);
 paint(dirt);const base=history.document.terrain.paint[0].weights;paint(cliff);
 expect(history.document.terrain.paint.find(p=>p.material===dirt)?.weights).toBe(base);
 const cliffWeights=history.document.terrain.paint.find(p=>p.material===cliff)!.weights;
 paint(grass);expect(history.document.terrain.paint.map(p=>p.material)).toEqual([cliff,grass]);
 expect(history.document.terrain.paint.find(p=>p.material===cliff)?.weights).toBe(cliffWeights);
 paint(otherCliff);expect(history.document.terrain.paint.map(p=>p.material)).toEqual([grass,otherCliff]);
 history.undo();expect(history.document.terrain.paint.find(p=>p.material===cliff)?.weights).toBe(cliffWeights);
 const beforeErase=history.document.terrain;
 history.setTerrain(editTerrainGrid(beforeErase,{selection,operation:{type:'material',material:cliff,erase:true}}).terrain);
 expect(history.document.terrain.paint.map(p=>p.material)).toEqual([grass]);
 history.undo();expect(history.document.terrain).toEqual(beforeErase);
 const saved=parseUtcMap(JSON.parse(stringifyUtcMap({...map,authoring:history.document})))!;
 const edited=editTerrainGrid(saved.authoring.terrain,{selection,operation:{type:'level',level:3,edge:'cliff'}}).terrain;
 expect(edited.paint).toEqual(saved.authoring.terrain.paint);
 const field=new HeightField(256);restoreTerrain(field,edited);const source=authoredTerrain(field,[],[]);
 const wall=source.layers.find(l=>l.ar===cliff)!,ground=source.layers.find(l=>l.ar===grass)!;
 expect(source.layers.indexOf(wall)).toBeGreaterThan(source.layers.indexOf(ground));
 expect(terrainMaskBytes(wall)?.some(w=>w===255)).toBe(true);
 expect(terrainMaskBytes(ground)?.some(w=>w===255)).toBe(true);
 expect(Buffer.from(wall.connections!,'base64').some(v=>v!==0)).toBe(false);
 expect(decodeFloats(edited.paint.find(p=>p.material===cliff)!.weights)).toEqual(decodeFloats(cliffWeights));
});

it('declares slope and vertical projection in the renderer table without modifying ground atlas codes',()=>{
 const data=editTerrainGrid(flatTerrainData(16),{selection,operation:{type:'material',material:cliff}}).terrain;
 const field=new HeightField(16);restoreTerrain(field,data);const source=authoredTerrain(field,[],[]),table=terrainLayerTable(source);
 const index=source.layers.findIndex(l=>l.ar===cliff),at=(table.metadataOffset+index*8)*4,definition=groundTextures.get(cliff)!.terrain!;
 expect([...table.data.slice(at+8,at+12)]).toEqual([-1,4,12,0]);
 expect(table.data[at+16]).toBeCloseTo(definition.projection!.startSlope);expect(table.data[at+17]).toBeCloseTo(definition.projection!.fullSlope);
});
