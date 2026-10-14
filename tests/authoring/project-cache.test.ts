import {expect,it} from 'vitest';
import {projectScene} from '../../src/shared/authoring/project';
import {proceduralFixture} from './fixture';
it('never evaluates editor generator previews during game loading',()=>{
 expect(()=>projectScene(proceduralFixture())).toThrow(/only be evaluated by the editor/);
});
