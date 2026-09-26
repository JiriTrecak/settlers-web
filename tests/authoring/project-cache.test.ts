import {expect,it} from 'vitest';
import {projectScene} from '../../src/shared/authoring/project';
import {proceduralFixture} from './fixture';
it('reuses generation across non-landscape document edits, but invalidates landscape inputs',()=>{
 const map=proceduralFixture(),scene=projectScene(map);
 expect(projectScene({...map,name:'Renamed',entities:[],playerStarts:[]})).toBe(scene);
 expect(projectScene({...map,stamps:[...map.stamps]})).not.toBe(scene);
 expect(projectScene({...map,waterLevel:-9})).not.toBe(scene);
 expect(projectScene({...map,authoring:structuredClone(map.authoring)})).not.toBe(scene);
});
