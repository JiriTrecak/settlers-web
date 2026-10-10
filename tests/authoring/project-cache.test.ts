import {expect,it} from 'vitest';
import {projectScene} from '../../src/shared/authoring/project';
import {emptyUtcMap} from '../../src/shared/map/utcmap';
import {flatTerrainData} from '../../src/shared/map/terrainData';
import {proceduralFixture} from './fixture';
it('reuses committed projections across non-terrain edits and invalidates edited terrain',()=>{
 const map=emptyUtcMap(),scene=projectScene(map);
 expect(projectScene({...map,name:'Renamed',entities:[],playerStarts:[]})).toBe(scene);
 expect(projectScene({...map,stamps:[...map.stamps]})).not.toBe(scene);
 const changed=projectScene({...map,authoring:{...map.authoring!,terrain:flatTerrainData(map.size,2,-1)}})!;
 expect(changed).not.toBe(scene);expect(changed.field.sample(100,100)).toBe(2);
 expect(projectScene({...map,authoring:structuredClone(map.authoring)})).not.toBe(scene);
});
it('never evaluates editor generator previews during game loading',()=>{
 expect(()=>projectScene(proceduralFixture())).toThrow(/only be evaluated by the editor/);
});
